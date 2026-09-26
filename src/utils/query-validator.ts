/**
 * Firewalla-specific query syntax validation
 * Validates query syntax and provides helpful error messages
 *
 * Accepts the boolean operators (AND, OR, NOT, parentheses) and the MSP
 * API's own forms: terms separated by spaces, `-field:value` exclusions and
 * free-text words. src/utils/msp-query.ts translates the operators into the
 * API's grammar before a query is sent.
 */

import type { ValidationResult } from '../types.js';

/**
 * Firewalla query syntax patterns
 */
const FIELD_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
// `:>`, `:>=`, `:<`, `:<=` are the MSP API's numeric comparisons (e.g. `download:>10MB`)
const OPERATOR_PATTERN = /^(:|=|!=|>|<|>=|<=|:>|:>=|:<|:<=)$/;
const LOGICAL_OPERATORS = ['AND', 'OR', 'NOT'];

interface QueryToken {
  // text: a free-text word or quoted phrase, which the API searches as text
  type: 'field' | 'operator' | 'value' | 'logical' | 'parenthesis' | 'text';
  value: string;
  position: number;
}

/**
 * Tokenize a Firewalla query string
 */
function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let current = 0;

  while (current < query.length) {
    // Skip whitespace
    if (/\s/.test(query[current])) {
      current++;
      continue;
    }

    // Check for parentheses
    if (query[current] === '(' || query[current] === ')') {
      tokens.push({
        type: 'parenthesis',
        value: query[current],
        position: current,
      });
      current++;
      continue;
    }

    // Check for quoted strings
    if (query[current] === '"' || query[current] === "'") {
      const quote = query[current];
      let value = '';
      current++; // Skip opening quote

      while (current < query.length && query[current] !== quote) {
        if (query[current] === '\\' && current + 1 < query.length) {
          // Handle escaped characters
          current++;
        }
        value += query[current];
        current++;
      }

      // A quoted phrase with no field before it is free text
      const type =
        tokens[tokens.length - 1]?.type === 'operator' ? 'value' : 'text';
      if (current >= query.length) {
        // Unclosed quote
        tokens.push({
          type: 'value',
          value: quote + value,
          position: current - value.length - 1,
        });
      } else {
        current++; // Skip closing quote
        tokens.push({
          type,
          value,
          position: current - value.length - 2,
        });
      }
      continue;
    }

    // Check for operators
    let operator = '';
    const operatorStart = current;
    while (current < query.length && /[:<>=!]/.test(query[current])) {
      operator += query[current];
      current++;
    }

    // After a field, keep only the operator itself: in `ip:::1` the extra
    // colons belong to the value
    const followsField = tokens[tokens.length - 1]?.type === 'field';
    if (followsField) {
      while (operator.length > 1 && !OPERATOR_PATTERN.test(operator)) {
        operator = operator.slice(0, -1);
        current--;
      }
    }

    if (operator && OPERATOR_PATTERN.test(operator)) {
      tokens.push({
        type: 'operator',
        value: operator,
        position: operatorStart,
      });

      // A value runs to the next space or ')', so the colons in a MAC or
      // IPv6 address (mac:AA:BB:CC:DD:EE:FF, ip:fe80::1) stay in the value
      if (
        followsField &&
        current < query.length &&
        !/[\s()"']/.test(query[current])
      ) {
        const valueStart = current;
        let value = '';
        while (current < query.length && !/[\s)]/.test(query[current])) {
          value += query[current];
          current++;
        }
        tokens.push({
          type: 'value',
          value,
          position: valueStart,
        });
      }
      continue;
    } else if (operator) {
      // Invalid operator, treat as value
      tokens.push({
        type: 'value',
        value: operator,
        position: operatorStart,
      });
      continue;
    }

    // Read word (field, logical operator, or value)
    let word = '';
    const wordStart = current;
    while (current < query.length && !/[\s():<>=!]/.test(query[current])) {
      word += query[current];
      current++;
    }

    if (LOGICAL_OPERATORS.includes(word.toUpperCase())) {
      tokens.push({
        type: 'logical',
        value: word.toUpperCase(),
        position: wordStart,
      });
    } else if (word === '-' && query[current] === '(') {
      // The API's exclusion of a group, -( ... ), is NOT
      tokens.push({ type: 'logical', value: 'NOT', position: wordStart });
    } else if (/[:<>=!]/.test(query[current] ?? '')) {
      // A word followed by an operator is a field, also right after another
      // term: a space between terms means AND, as in the API
      tokens.push({
        type: 'field',
        value: word,
        position: wordStart,
      });
    } else if (tokens[tokens.length - 1]?.type === 'operator') {
      // The value of `field: value`
      tokens.push({
        type: 'value',
        value: word,
        position: wordStart,
      });
    } else {
      // A word without a field is free text (`porn`)
      tokens.push({
        type: 'text',
        value: word,
        position: wordStart,
      });
    }
  }

  return tokens;
}

/**
 * Validate Firewalla query syntax
 */
export function validateFirewallaQuerySyntax(query: string): ValidationResult {
  if (!query || typeof query !== 'string') {
    return {
      isValid: true,
      errors: [],
      sanitizedValue: '',
    };
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      isValid: true,
      errors: [],
      sanitizedValue: '',
    };
  }

  const errors: string[] = [];
  const tokens = tokenizeQuery(trimmedQuery);

  // Check for balanced parentheses
  let parenCount = 0;
  for (const token of tokens) {
    if (token.value === '(') {
      parenCount++;
    }
    if (token.value === ')') {
      parenCount--;
    }
    if (parenCount < 0) {
      errors.push(
        `Unmatched closing parenthesis at position ${token.position}`
      );
    }
  }
  if (parenCount > 0) {
    errors.push(`Unclosed parenthesis in query`);
  }

  // Validate token sequence
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    const prevToken = tokens[i - 1];

    switch (token.type) {
      case 'field':
        // Validate field name format; `-` excludes (-status:blocked)
        if (!FIELD_PATTERN.test(token.value.replace(/^-/, ''))) {
          errors.push(
            `Invalid field name '${token.value}' at position ${token.position}. Field names must start with a letter and contain only letters, numbers, underscores, and dots.`
          );
        }

        // Field must be followed by operator
        if (nextToken && nextToken.type !== 'operator') {
          errors.push(
            `Field '${token.value}' at position ${token.position} must be followed by an operator (: = != > < >= <=)`
          );
        }
        break;

      case 'operator':
        // Operator must be between field and value
        if (!prevToken || prevToken.type !== 'field') {
          errors.push(
            `Operator '${token.value}' at position ${token.position} must be preceded by a field name`
          );
        }
        if (
          !nextToken ||
          (nextToken.type !== 'value' && nextToken.value !== '(')
        ) {
          errors.push(
            `Operator '${token.value}' at position ${token.position} must be followed by a value`
          );
        }
        break;

      case 'value':
        // Value must follow operator
        if (!prevToken || prevToken.type !== 'operator') {
          errors.push(
            `Value '${token.value}' at position ${token.position} must be preceded by an operator`
          );
        }

        // Check for common syntax errors
        if (token.value.includes('*') && !token.value.match(/^[*\w.:-]+$/)) {
          errors.push(
            `Invalid wildcard pattern '${token.value}' at position ${token.position}`
          );
        }
        break;

      case 'logical':
        // Logical operators must be between complete expressions; NOT can
        // open a query
        if ((i === 0 && token.value !== 'NOT') || i === tokens.length - 1) {
          errors.push(
            `Logical operator '${token.value}' at position ${token.position} cannot be at the beginning or end of query`
          );
        }
        break;

      case 'parenthesis':
        // Parentheses are handled in the balanced parentheses check above
        break;

      case 'text':
        // Free text needs no field
        break;
    }
  }

  // Check for empty parentheses
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].value === '(' && tokens[i + 1].value === ')') {
      errors.push(`Empty parentheses at position ${tokens[i].position}`);
    }
  }

  // Provide helpful suggestions for common mistakes
  if (
    trimmedQuery.includes('@') ||
    trimmedQuery.includes('#') ||
    trimmedQuery.includes('$')
  ) {
    errors.push(
      `Query contains invalid special characters. Use field:value syntax (e.g., protocol:tcp, device.ip:192.168.*)`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: trimmedQuery,
  };
}

/**
 * Get example queries for a specific entity type
 */
export function getExampleQueries(entityType: string): string[] {
  // Every example runs as the MSP API reads it once translated: AND is a
  // space, and OR joins values of one field (sent as a comma list)
  const examples: Record<string, string[]> = {
    flows: [
      'protocol:tcp AND status:blocked',
      'region:US AND total:>1MB',
      'domain:*.facebook.com',
      'category:social OR category:games',
      'device.ip:192.168.1.* AND -status:blocked',
    ],
    alarms: [
      'type:1 AND status:1',
      'type:8 OR type:9',
      'device.ip:192.168.* AND status:1',
      'porn',
      'type:10 AND NOT status:2',
    ],
    rules: [
      'action:block AND target.value:*.social.com',
      'status:paused',
      'action:block OR action:timelimit',
      'action:block AND NOT status:paused',
      'notes:"temporary rule"',
    ],
    devices: [
      'online:false AND mac_vendor:Apple',
      'ip:192.168.1.* AND name:*phone*',
      'mac:AA:BB:*',
      'network.name:"Guest Network"',
      'online:true AND group.name:*kids*',
    ],
    target_lists: [
      'category:social',
      'owner:global AND name:*Block*',
      'targets:*.gaming.com',
      'notes:"custom blocklist"',
    ],
  };

  return examples[entityType] || [];
}
