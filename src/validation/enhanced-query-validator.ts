/**
 * Enhanced Query Validator for Firewalla MCP Server
 * Provides detailed syntax error reporting with position tracking and suggestions
 */

import { QueryValidation, SEARCH_FIELDS } from '../search/types.js';

/**
 * Detailed error information with position and suggestions
 */
export interface DetailedError {
  message: string;
  position?: number;
  suggestion?: string;
  validOptions?: string[];
  errorType: 'syntax' | 'semantic' | 'field' | 'operator';
  context?: string;
}

/**
 * Enhanced validation result with detailed error information
 */
export interface EnhancedValidationResult extends QueryValidation {
  detailedErrors: DetailedError[];
  quickFixes: QuickFix[];
}

/**
 * Quick fix suggestion for common errors
 */
export interface QuickFix {
  description: string;
  action: 'replace_field' | 'fix_syntax' | 'change_operator' | 'add_quotes';
  original?: string;
  replacement?: string;
  position?: number;
}

type EntityType = keyof typeof SEARCH_FIELDS;

export class EnhancedQueryValidator {
  /**
   * Validate query with enhanced error reporting
   */
  validateQuery(query: string, _entityType?: EntityType): EnhancedValidationResult {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    if (!query || typeof query !== 'string') {
      errors.push({
        message: 'Query must be a non-empty string',
        errorType: 'syntax',
        suggestion: 'Provide a valid search query string'
      });
      
      return this.buildResult(false, errors, [], quickFixes);
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      errors.push({
        message: 'Query cannot be empty',
        errorType: 'syntax',
        suggestion: 'Enter a search query like "protocol:tcp" or "severity:high"'
      });
      
      return this.buildResult(false, errors, [], quickFixes);
    }

    try {
      // Parse query and catch detailed syntax errors
      const parseResult = this.parseWithPositionTracking(trimmedQuery);
      errors.push(...parseResult.errors);
      quickFixes.push(...parseResult.quickFixes);
    } catch (error) {
      if (error instanceof SyntaxError) {
        const detailedError = this.createDetailedSyntaxError(error, trimmedQuery);
        errors.push(detailedError);
        
        const quickFix = this.suggestSyntaxFix(error, trimmedQuery);
        if (quickFix) {
          quickFixes.push(quickFix);
        }
      } else {
        errors.push({
          message: `Unexpected parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorType: 'syntax'
        });
      }
    }

    return this.buildResult(errors.length === 0, errors, [], quickFixes);
  }

  /**
   * Parse query with detailed position tracking
   */
  private parseWithPositionTracking(query: string): { errors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    // Check for unmatched parentheses
    const parenthesesResult = this.validateParentheses(query);
    if (!parenthesesResult.isValid) {
      errors.push(...parenthesesResult.errors);
      quickFixes.push(...parenthesesResult.quickFixes);
    }

    // Check for unmatched quotes
    const quotesResult = this.validateQuotes(query);
    if (!quotesResult.isValid) {
      errors.push(...quotesResult.errors);
      quickFixes.push(...quotesResult.quickFixes);
    }

    // Check for malformed field syntax
    const fieldsResult = this.validateFieldSyntax(query);
    if (!fieldsResult.isValid) {
      errors.push(...fieldsResult.errors);
      quickFixes.push(...fieldsResult.quickFixes);
    }

    // Check for operator placement
    const operatorsResult = this.validateOperatorPlacement(query);
    if (!operatorsResult.isValid) {
      errors.push(...operatorsResult.errors);
      quickFixes.push(...operatorsResult.quickFixes);
    }

    return { errors, quickFixes };
  }

  /**
   * Validate parentheses matching
   */
  private validateParentheses(query: string): { isValid: boolean; errors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    const stack: Array<{ char: string; position: number }> = [];
    
    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      
      if (char === '(') {
        stack.push({ char, position: i });
      } else if (char === ')') {
        if (stack.length === 0) {
          const context = this.getErrorContext(query, i);
          errors.push({
            message: `Unexpected closing parenthesis at position ${i}`,
            position: i,
            errorType: 'syntax',
            context: context,
            suggestion: 'Add matching opening parenthesis or remove this closing parenthesis'
          });
          
          quickFixes.push({
            description: 'Remove unexpected closing parenthesis',
            action: 'fix_syntax',
            position: i,
            original: ')',
            replacement: ''
          });
        } else {
          stack.pop();
        }
      }
    }

    // Check for unmatched opening parentheses
    if (stack.length > 0) {
      const unmatched = stack[stack.length - 1];
      const context = this.getErrorContext(query, unmatched.position);
      
      errors.push({
        message: `Unclosed opening parenthesis at position ${unmatched.position}`,
        position: unmatched.position,
        errorType: 'syntax',
        context: context,
        suggestion: 'Add matching closing parenthesis'
      });
      
      quickFixes.push({
        description: 'Add matching closing parenthesis',
        action: 'fix_syntax',
        position: query.length,
        original: '',
        replacement: ')'
      });
    }

    return { isValid: errors.length === 0, errors, quickFixes };
  }

  /**
   * Validate quote matching
   */
  private validateQuotes(query: string): { isValid: boolean; errors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    let inQuotes = false;
    let quoteStart = -1;
    let quoteChar = '';
    
    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      
      if ((char === '"' || char === "'") && (i === 0 || query[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteStart = i;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteStart = -1;
        }
      }
    }
    
    if (inQuotes && quoteStart >= 0) {
      const context = this.getErrorContext(query, quoteStart);
      errors.push({
        message: `Unclosed quoted string starting at position ${quoteStart}`,
        position: quoteStart,
        errorType: 'syntax',
        context: context,
        suggestion: `Add matching ${quoteChar} to close the quoted string`
      });
      
      quickFixes.push({
        description: `Add matching ${quoteChar} quote`,
        action: 'fix_syntax',
        position: query.length,
        original: '',
        replacement: quoteChar
      });
    }

    return { isValid: errors.length === 0, errors, quickFixes };
  }

  /**
   * Validate field syntax (field:value patterns)
   */
  private validateFieldSyntax(query: string): { isValid: boolean; errors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    // Match potential field patterns that might be malformed
    // Updated regex to better handle logical operators and range syntax
    const fieldPattern = /(\w+)\s*([=:]?)\s*([^)\s]*)/g;
    let match;
    
    // Skip validation for logical operators and range keywords
    const logicalOperators = ['AND', 'OR', 'NOT'];
    const rangeKeywords = ['TO'];
    
    while ((match = fieldPattern.exec(query)) !== null) {
      const [, field, operator, value] = match;
      const position = match.index;
      
      // Skip logical operators and range keywords - they have different syntax rules
      if (logicalOperators.includes(field.toUpperCase()) || rangeKeywords.includes(field.toUpperCase())) {
        continue;
      }
      
      // Skip if this appears to be part of a range syntax (field:[value TO value])
      if (this.isPartOfRangeSyntax(query, position)) {
        continue;
      }
      
      // Skip if this appears to be part of a quoted geographic name
      if (this.isPartOfQuotedValue(query, position)) {
        continue;
      }
      
      // Check for missing colon
      if (operator === '' && value !== '') {
        const context = this.getErrorContext(query, position);
        errors.push({
          message: `Expected ':' after field '${field}' at position ${position + field.length}`,
          position: position + field.length,
          errorType: 'syntax',
          context: context,
          suggestion: `Use '${field}:${value}' instead of '${field} ${value}'`
        });
        
        quickFixes.push({
          description: `Add colon after field '${field}'`,
          action: 'fix_syntax',
          position: position + field.length,
          original: field + ' ' + value,
          replacement: field + ':' + value
        });
      }
      
      // Check for invalid equals operator
      if (operator === '=') {
        const context = this.getErrorContext(query, position);
        errors.push({
          message: `Use ':' instead of '=' for field queries at position ${position + field.length}`,
          position: position + field.length,
          errorType: 'syntax',
          context: context,
          suggestion: `Use '${field}:${value}' instead of '${field}=${value}'`
        });
        
        quickFixes.push({
          description: `Replace '=' with ':' for field query`,
          action: 'fix_syntax',
          position: position + field.length,
          original: '=',
          replacement: ':'
        });
      }
    }

    return { isValid: errors.length === 0, errors, quickFixes };
  }

  /**
   * Check if the current position is part of range syntax like [value TO value]
   */
  private isPartOfRangeSyntax(query: string, position: number): boolean {
    // Look for surrounding brackets and TO keyword
    const rangePattern = /\[[^\]]*TO[^\]]*\]/g;
    let match;
    
    while ((match = rangePattern.exec(query)) !== null) {
      if (position >= match.index && position <= match.index + match[0].length) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if the current position is part of a quoted value
   */
  private isPartOfQuotedValue(query: string, position: number): boolean {
    // Find if we're inside quotes
    let inQuotes = false;
    let quoteStart = -1;
    
    for (let i = 0; i < position; i++) {
      const char = query[i];
      if ((char === '"' || char === "'") && (i === 0 || query[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteStart = i;
        } else {
          inQuotes = false;
          quoteStart = -1;
        }
      }
    }
    
    return inQuotes && quoteStart >= 0;
  }

  /**
   * Validate operator placement
   */
  private validateOperatorPlacement(query: string): { isValid: boolean; errors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    // Check for malformed logical operators, but be more lenient about placement
    const logicalPattern = /\b(AND|OR|NOT)\b/gi;
    let match;
    
    while ((match = logicalPattern.exec(query)) !== null) {
      const operator = match[0];
      const position = match.index;
      
      // NOT at the beginning is actually valid syntax (e.g., "NOT blocked:true")
      // Only flag if it's truly malformed (e.g., multiple consecutive operators)
      
      // Check if operator is at the very end (after trimming)
      const trimmedQuery = query.trim();
      if (position + operator.length === trimmedQuery.length) {
        errors.push({
          message: `Logical operator '${operator}' cannot appear at the end of the query`,
          position: position,
          errorType: 'syntax',
          suggestion: `Add a condition after '${operator}' or remove it`
        });
      }
    }

    return { isValid: errors.length === 0, errors, quickFixes };
  }

  /**
   * Create detailed syntax error with context
   */
  private createDetailedSyntaxError(error: SyntaxError, query: string): DetailedError {
    const position = this.findErrorPosition(error, query);
    const context = this.getErrorContext(query, position);
    
    return {
      message: `Syntax error at position ${position}: ${error.message}`,
      position: position,
      errorType: 'syntax',
      context: context,
      suggestion: this.getSyntaxFixSuggestion(error.message)
    };
  }

  /**
   * Get context around error position
   */
  private getErrorContext(query: string, position: number, contextLength = 10): string {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(query.length, position + contextLength);
    const before = query.substring(start, position);
    const at = query[position] || '';
    const after = query.substring(position + 1, end);
    
    return `"${before}[${at}]${after}"`;
  }

  /**
   * Find error position from error message
   */
  private findErrorPosition(error: SyntaxError, _query: string): number {
    // Try to extract position from error message
    const positionMatch = error.message.match(/position (\d+)/);
    if (positionMatch) {
      return parseInt(positionMatch[1], 10);
    }
    
    // Fallback: estimate based on error content
    return 0;
  }

  /**
   * Get syntax fix suggestion based on error message
   */
  private getSyntaxFixSuggestion(errorMessage: string): string {
    if (errorMessage.includes('parenthesis')) {
      return 'Check that all opening parentheses have matching closing parentheses';
    }
    if (errorMessage.includes('quote')) {
      return 'Check that all quoted strings are properly closed';
    }
    if (errorMessage.includes('operator')) {
      return 'Check that operators (AND, OR, NOT) are properly placed between terms';
    }
    if (errorMessage.includes('colon')) {
      return 'Use field:value syntax for field queries';
    }
    return 'Review query syntax documentation for proper formatting';
  }

  /**
   * Suggest syntax fix as quick fix
   */
  private suggestSyntaxFix(error: SyntaxError, query: string): QuickFix | null {
    if (error.message.includes('parenthesis')) {
      return {
        description: 'Add missing closing parenthesis',
        action: 'fix_syntax',
        position: query.length,
        original: '',
        replacement: ')'
      };
    }
    
    if (error.message.includes('quote')) {
      return {
        description: 'Add missing quote',
        action: 'fix_syntax',
        position: query.length,
        original: '',
        replacement: '"'
      };
    }
    
    return null;
  }

  /**
   * Build enhanced validation result
   */
  private buildResult(
    isValid: boolean, 
    detailedErrors: DetailedError[], 
    warnings: string[], 
    quickFixes: QuickFix[]
  ): EnhancedValidationResult {
    return {
      isValid,
      errors: detailedErrors.map(e => e.message),
      warnings,
      suggestions: detailedErrors.map(e => e.suggestion).filter(Boolean) as string[],
      detailedErrors,
      quickFixes
    };
  }
}