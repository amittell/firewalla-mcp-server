/**
 * Firewalla-specific query syntax validation
 * Validates query syntax and provides helpful error messages
 */

import type { ValidationResult } from '../types.js';

/**
 * Firewalla query syntax patterns
 */
const FIELD_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const OPERATOR_PATTERN = /^(:|=|!=|>|<|>=|<=)$/;
const LOGICAL_OPERATORS = ['AND', 'OR', 'NOT'];

interface QueryToken {
  type: 'field' | 'operator' | 'value' | 'logical' | 'parenthesis';
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
        position: current
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
      
      if (current >= query.length) {
        // Unclosed quote
        tokens.push({
          type: 'value',
          value: quote + value,
          position: current - value.length - 1
        });
      } else {
        current++; // Skip closing quote
        tokens.push({
          type: 'value',
          value,
          position: current - value.length - 2
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
    
    if (operator && OPERATOR_PATTERN.test(operator)) {
      tokens.push({
        type: 'operator',
        value: operator,
        position: operatorStart
      });
      continue;
    } else if (operator) {
      // Invalid operator, treat as value
      tokens.push({
        type: 'value',
        value: operator,
        position: operatorStart
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
        position: wordStart
      });
    } else if (tokens.length === 0 || tokens[tokens.length - 1].type === 'logical' || 
               tokens[tokens.length - 1].value === '(') {
      // This should be a field name
      tokens.push({
        type: 'field',
        value: word,
        position: wordStart
      });
    } else {
      // This is a value
      tokens.push({
        type: 'value',
        value: word,
        position: wordStart
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
      sanitizedValue: ''
    };
  }
  
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      isValid: true,
      errors: [],
      sanitizedValue: ''
    };
  }
  
  const errors: string[] = [];
  const tokens = tokenizeQuery(trimmedQuery);
  
  // Check for balanced parentheses
  let parenCount = 0;
  for (const token of tokens) {
    if (token.value === '(') {parenCount++;}
    if (token.value === ')') {parenCount--;}
    if (parenCount < 0) {
      errors.push(`Unmatched closing parenthesis at position ${token.position}`);
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
        // Validate field name format
        if (!FIELD_PATTERN.test(token.value)) {
          errors.push(`Invalid field name '${token.value}' at position ${token.position}. Field names must start with a letter and contain only letters, numbers, underscores, and dots.`);
        }
        
        // Field must be followed by operator
        if (nextToken && nextToken.type !== 'operator') {
          errors.push(`Field '${token.value}' at position ${token.position} must be followed by an operator (: = != > < >= <=)`);
        }
        break;
        
      case 'operator':
        // Operator must be between field and value
        if (!prevToken || prevToken.type !== 'field') {
          errors.push(`Operator '${token.value}' at position ${token.position} must be preceded by a field name`);
        }
        if (!nextToken || (nextToken.type !== 'value' && nextToken.value !== '(')) {
          errors.push(`Operator '${token.value}' at position ${token.position} must be followed by a value`);
        }
        break;
        
      case 'value':
        // Value must follow operator
        if (!prevToken || prevToken.type !== 'operator') {
          errors.push(`Value '${token.value}' at position ${token.position} must be preceded by an operator`);
        }
        
        // Check for common syntax errors
        if (token.value.includes('*') && !token.value.match(/^[*\w.-]+$/)) {
          errors.push(`Invalid wildcard pattern '${token.value}' at position ${token.position}`);
        }
        break;
        
      case 'logical':
        // Logical operators must be between complete expressions
        if (i === 0 || i === tokens.length - 1) {
          errors.push(`Logical operator '${token.value}' at position ${token.position} cannot be at the beginning or end of query`);
        }
        break;
        
      case 'parenthesis':
        // Parentheses are handled in the balanced parentheses check above
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
  if (trimmedQuery.includes('@') || trimmedQuery.includes('#') || trimmedQuery.includes('$')) {
    errors.push(`Query contains invalid special characters. Use field:value syntax (e.g., severity:high, source_ip:192.168.*)`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: trimmedQuery
  };
}

/**
 * Get example queries for a specific entity type
 */
export function getExampleQueries(entityType: string): string[] {
  const examples: Record<string, string[]> = {
    flows: [
      'protocol:tcp AND blocked:true',
      'region:US AND bytes:>1000000',
      'domain:*.facebook.com',
      'category:social OR category:games',
      'source_ip:192.168.1.* AND direction:outbound'
    ],
    alarms: [
      'severity:high AND status:1',
      'region:CN AND type:1',
      'source_ip:192.168.* AND NOT resolved:true',
      'message:"suspicious activity"',
      'device.name:*laptop* AND severity:>=medium'
    ],
    rules: [
      'action:block AND target.value:*.social.com',
      'status:paused',
      'target.type:domain AND action:block',
      'scope.type:device AND protocol:tcp',
      'notes:"temporary rule"'
    ],
    devices: [
      'online:false AND vendor:Apple',
      'ip:192.168.1.* AND name:*phone*',
      'mac:AA:BB:*',
      'network.name:"Guest Network"',
      'online:true AND group.name:*kids*'
    ],
    target_lists: [
      'category:social',
      'owner:global AND name:*Block*',
      'targets:*.gaming.com',
      'notes:"custom blocklist"'
    ]
  };
  
  return examples[entityType] || [];
}