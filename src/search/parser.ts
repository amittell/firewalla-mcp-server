/**
 * Advanced Query Parser for Firewalla Search API
 * Implements recursive descent parser for complex search queries
 */

import {
  TokenType,
  SEARCH_FIELDS,
  type QueryNode,
  type FieldQuery,
  type LogicalQuery,
  type GroupQuery,
  type TokenTypeValue,
  type WildcardQuery,
  type RangeQuery,
  type ComparisonQuery,
  type Token,
  type QueryValidation,
} from './types.js';

export class QueryParser {
  private tokens: Token[] = [];
  private current = 0;
  private errors: string[] = [];

  /**
   * Parse a search query string into an AST
   */
  parse(
    query: string,
    entityType?: keyof typeof SEARCH_FIELDS
  ): QueryValidation {
    this.reset();

    // Input validation
    if (!query || typeof query !== 'string') {
      this.errors.push('Query must be a non-empty string');
      return {
        isValid: false,
        errors: this.errors,
        warnings: [],
        suggestions: [],
        ast: undefined,
      };
    }

    try {
      this.tokens = this.tokenize(query);
      const ast = this.parseExpression();

      // Validate fields if entity type is provided
      if (entityType && ast) {
        this.validateFields(ast, entityType);
      }

      return {
        isValid: this.errors.length === 0,
        errors: this.errors,
        warnings: [],
        suggestions: this.generateSuggestions(query, entityType),
        ast: this.errors.length === 0 ? ast : undefined,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown parsing error';
      this.errors.push(errorMsg);

      return {
        isValid: false,
        errors: this.errors,
        warnings: [],
        suggestions: this.generateSuggestions(query, entityType),
      };
    }
  }

  private reset(): void {
    this.tokens = [];
    this.current = 0;
    this.errors = [];
  }

  /**
   * Tokenize the input query string
   */
  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    // Additional safety check
    if (!input || typeof input !== 'string') {
      return tokens;
    }

    const safeInput = input.trim();
    if (!safeInput) {
      return tokens;
    }

    while (i < safeInput.length) {
      const char = safeInput[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Parentheses
      if (char === '(') {
        tokens.push({
          type: TokenType.LPAREN,
          value: char,
          position: i,
          length: 1,
        });
        i++;
        continue;
      }

      if (char === ')') {
        tokens.push({
          type: TokenType.RPAREN,
          value: char,
          position: i,
          length: 1,
        });
        i++;
        continue;
      }

      // Brackets for ranges
      if (char === '[') {
        tokens.push({
          type: TokenType.LBRACKET,
          value: char,
          position: i,
          length: 1,
        });
        i++;
        continue;
      }

      if (char === ']') {
        tokens.push({
          type: TokenType.RBRACKET,
          value: char,
          position: i,
          length: 1,
        });
        i++;
        continue;
      }

      // Colon for field:value
      if (char === ':') {
        tokens.push({
          type: TokenType.COLON,
          value: char,
          position: i,
          length: 1,
        });
        i++;
        continue;
      }

      // Quoted strings
      if (char === '"' || char === "'") {
        const quote = char;
        let value = '';
        i++; // Skip opening quote
        const start = i - 1;

        while (i < safeInput.length && safeInput[i] !== quote) {
          if (safeInput[i] === '\\' && i + 1 < safeInput.length) {
            // Handle escaped characters
            i++;
            value += safeInput[i];
          } else {
            value += safeInput[i];
          }
          i++;
        }

        if (i >= safeInput.length) {
          throw new Error(
            `Unclosed quoted string starting at position ${start}`
          );
        }

        i++; // Skip closing quote
        tokens.push({
          type: TokenType.QUOTED_VALUE,
          value,
          position: start,
          length: i - start,
        });
        continue;
      }

      // Operators
      if (char === '>' || char === '<') {
        let operator = char;
        i++;
        if (i < safeInput.length && safeInput[i] === '=') {
          operator += '=';
          i++;
        }
        tokens.push({
          type: TokenType.OPERATOR,
          value: operator,
          position: i - operator.length,
          length: operator.length,
        });
        continue;
      }

      if (
        char === '!' &&
        i + 1 < safeInput.length &&
        safeInput[i + 1] === '='
      ) {
        tokens.push({
          type: TokenType.OPERATOR,
          value: '!=',
          position: i,
          length: 2,
        });
        i += 2;
        continue;
      }

      // Words (fields, values, logical operators)
      if (/[a-zA-Z_]/.test(char)) {
        let word = '';
        const start = i;

        while (i < safeInput.length && /[a-zA-Z0-9_.-]/.test(safeInput[i])) {
          word += safeInput[i];
          i++;
        }

        const upperWord = word.toUpperCase();
        if (upperWord === 'AND' || upperWord === 'OR' || upperWord === 'NOT') {
          tokens.push({
            type: TokenType.LOGICAL,
            value: upperWord,
            position: start,
            length: word.length,
          });
        } else if (upperWord === 'TO') {
          tokens.push({
            type: TokenType.TO,
            value: upperWord,
            position: start,
            length: word.length,
          });
        } else {
          tokens.push({
            type: TokenType.FIELD,
            value: word,
            position: start,
            length: word.length,
          });
        }
        continue;
      }

      // Numbers and values with wildcards
      if (/[0-9*?]/.test(char) || char === '.') {
        let value = '';
        const start = i;
        let hasWildcard = false;

        while (i < safeInput.length && /[0-9*?.-]/.test(safeInput[i])) {
          if (safeInput[i] === '*' || safeInput[i] === '?') {
            hasWildcard = true;
          }
          value += safeInput[i];
          i++;
        }

        tokens.push({
          type: hasWildcard ? TokenType.WILDCARD : TokenType.VALUE,
          value,
          position: start,
          length: value.length,
        });
        continue;
      }

      // Unknown character
      throw new Error(`Unexpected character '${char}' at position ${i}`);
    }

    tokens.push({
      type: TokenType.EOF,
      value: '',
      position: safeInput.length,
      length: 0,
    });
    return tokens;
  }

  /**
   * Parse expression with logical operators (lowest precedence)
   */
  private parseExpression(): QueryNode | undefined {
    let left = this.parseAndExpression();

    while (this.match(TokenType.LOGICAL) && this.previous().value === 'OR') {
      const right = this.parseAndExpression();
      if (!right) {
        break;
      }

      left = {
        type: 'logical',
        operator: 'OR',
        left,
        right,
      } as LogicalQuery;
    }

    return left;
  }

  /**
   * Parse AND expressions (higher precedence than OR)
   */
  private parseAndExpression(): QueryNode | undefined {
    let left = this.parseNotExpression();

    while (this.match(TokenType.LOGICAL) && this.previous().value === 'AND') {
      const right = this.parseNotExpression();
      if (!right) {
        break;
      }

      left = {
        type: 'logical',
        operator: 'AND',
        left,
        right,
      } as LogicalQuery;
    }

    return left;
  }

  /**
   * Parse NOT expressions (highest precedence)
   */
  private parseNotExpression(): QueryNode | undefined {
    if (this.match(TokenType.LOGICAL) && this.previous().value === 'NOT') {
      const operand = this.parsePrimary();
      if (!operand) {
        this.errors.push('Expected expression after NOT operator');
        return undefined;
      }

      return {
        type: 'logical',
        operator: 'NOT',
        operand,
      } as LogicalQuery;
    }

    return this.parsePrimary();
  }

  /**
   * Parse primary expressions (field queries, groups, etc.)
   */
  private parsePrimary(): QueryNode | undefined {
    // Grouped expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      if (!this.match(TokenType.RPAREN)) {
        this.errors.push('Expected closing parenthesis');
        return undefined;
      }
      return expr ? ({ type: 'group', query: expr } as GroupQuery) : undefined;
    }

    // Field query
    if (this.check(TokenType.FIELD)) {
      return this.parseFieldQuery();
    }

    // Wildcard query (standalone *) - treat as match-all
    if (this.match(TokenType.WILDCARD) && this.previous().value === '*') {
      // Return a special match-all query that bypasses field validation
      return {
        type: 'field',
        field: '*',
        value: '*',
      } as FieldQuery;
    }

    this.errors.push(`Unexpected token: ${this.peek().value}`);
    return undefined;
  }

  /**
   * Parse field-based queries (field:value, field:>value, etc.)
   */
  private parseFieldQuery(): QueryNode | undefined {
    const fieldToken = this.advance();
    const field = fieldToken.value;

    if (!this.match(TokenType.COLON)) {
      this.errors.push(`Expected ':' after field '${field}'`);
      return undefined;
    }

    // Check for operators
    if (this.match(TokenType.OPERATOR)) {
      const operator = this.previous().value as '>=' | '<=' | '>' | '<' | '!=';

      if (this.match(TokenType.VALUE, TokenType.QUOTED_VALUE)) {
        const { value } = this.previous();

        if (
          operator === '>=' ||
          operator === '<=' ||
          operator === '>' ||
          operator === '<'
        ) {
          return {
            type: 'comparison',
            field,
            operator,
            value: this.parseValue(value),
          } as ComparisonQuery;
        }
        return {
          type: 'field',
          field,
          value,
          operator: operator as '!=',
        } as FieldQuery;
      }
    }

    // Range query [min TO max]
    if (this.match(TokenType.LBRACKET)) {
      return this.parseRangeQuery(field);
    }

    // Wildcard or regular value
    if (this.match(TokenType.WILDCARD)) {
      const pattern = this.previous().value;
      return {
        type: 'wildcard',
        field,
        pattern,
      } as WildcardQuery;
    }

    if (this.match(TokenType.VALUE, TokenType.QUOTED_VALUE, TokenType.FIELD)) {
      const { value } = this.previous();
      return {
        type: 'field',
        field,
        value,
        operator: '=',
      } as FieldQuery;
    }

    this.errors.push(`Expected value after field '${field}:'`);
    return undefined;
  }

  /**
   * Parse range queries [min TO max]
   */
  private parseRangeQuery(field: string): RangeQuery | undefined {
    let min: string | number | undefined;
    let max: string | number | undefined;

    // Parse minimum value
    if (this.match(TokenType.VALUE, TokenType.QUOTED_VALUE)) {
      min = this.parseValue(this.previous().value);
    }

    if (!this.match(TokenType.TO)) {
      this.errors.push('Expected TO in range query');
      return undefined;
    }

    // Parse maximum value
    if (this.match(TokenType.VALUE, TokenType.QUOTED_VALUE)) {
      max = this.parseValue(this.previous().value);
    }

    if (!this.match(TokenType.RBRACKET)) {
      this.errors.push('Expected closing bracket in range query');
      return undefined;
    }

    return {
      type: 'range',
      field,
      min,
      max,
      inclusive: true,
    };
  }

  /**
   * Parse and convert values to appropriate types
   */
  private parseValue(value: string): string | number {
    // Check if value is an integer
    if (/^-?\d+$/.test(value)) {
      const int = parseInt(value, 10);
      if (Number.isSafeInteger(int)) {
        return int;
      }
    } else if (/^-?\d+\.\d+$/.test(value)) {
      // Handle float values
      const float = parseFloat(value);
      if (!isNaN(float) && Number.isFinite(float)) {
        return float;
      }
    }
    return value;
  }

  /**
   * Validate fields against entity schema
   */
  private validateFields(
    node: QueryNode,
    entityType: keyof typeof SEARCH_FIELDS
  ): void {
    const validFields = SEARCH_FIELDS[entityType];

    const validateNode = (n: QueryNode): void => {
      switch (n.type) {
        case 'field':
        case 'wildcard':
        case 'range':
        case 'comparison': {
          const fieldNode = n;
          // Skip validation for special match-all field '*'
          if (
            fieldNode.field !== '*' &&
            !validFields.includes(fieldNode.field)
          ) {
            this.errors.push(
              `Invalid field '${fieldNode.field}' for ${entityType}. Valid fields: ${validFields.join(', ')}`
            );
          }
          break;
        }
        case 'logical':
          if (n.left) {
            validateNode(n.left);
          }
          if (n.right) {
            validateNode(n.right);
          }
          if (n.operand) {
            validateNode(n.operand);
          }
          break;
        case 'group':
          validateNode(n.query);
          break;
      }
    };

    validateNode(node);
  }

  /**
   * Generate helpful suggestions for invalid queries
   */
  private generateSuggestions(
    query: string,
    entityType?: keyof typeof SEARCH_FIELDS
  ): string[] {
    const suggestions: string[] = [];

    if (entityType && this.errors.some(e => e.includes('Invalid field'))) {
      suggestions.push(
        `Available fields for ${entityType}: ${SEARCH_FIELDS[entityType].join(', ')}`
      );
    }

    if (query.includes('(') && !query.includes(')')) {
      suggestions.push('Check for missing closing parenthesis');
    }

    if (query.includes('[') && !query.includes(']')) {
      suggestions.push('Check for missing closing bracket in range query');
    }

    if (query.includes(':') && !query.split(':').every(part => part.trim())) {
      suggestions.push('Ensure field:value pairs are properly formatted');
    }

    return suggestions;
  }

  // Utility methods for token management
  private match(...types: TokenTypeValue[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenTypeValue): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}

// Export singleton instance
export const queryParser = new QueryParser();
