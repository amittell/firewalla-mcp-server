/**
 * Enhanced Query Validator for Firewalla MCP Server
 * Provides comprehensive syntax, semantic, and field validation for search queries
 */

import { queryParser } from '../search/parser.js';
import { SEARCH_FIELDS, type QueryNode, type FieldQuery, type ComparisonQuery, type RangeQuery } from '../search/types.js';
import { FIELD_MAPPINGS, type EntityType, type CorrelationFieldName } from './field-mapper.js';
import { QuerySanitizer } from './error-handler.js';
import type { ValidationResult } from '../types.js';

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
 * Quick fix suggestion for common errors
 */
export interface QuickFix {
  description: string;
  action: 'replace_field' | 'fix_syntax' | 'change_operator' | 'add_quotes';
  original?: string;
  replacement?: string;
  position?: number;
}

/**
 * Enhanced validation configuration for different entity types
 */
interface EntityValidationConfig {
  numericFields: string[];
  dateFields: string[];
  booleanFields: string[];
  requiredFields?: string[];
  deprecatedFields?: string[];
  fieldAliases?: Record<string, string>;
}

/**
 * Validation configurations for each entity type
 */
const ENTITY_VALIDATION_CONFIGS: Record<EntityType, EntityValidationConfig> = {
  flows: {
    numericFields: ['bytes', 'download', 'upload', 'ts', 'timestamp', 'duration', 'port', 'session_duration', 'frequency_score', 'geographic_risk_score'],
    dateFields: ['ts', 'timestamp', 'time_window'],
    booleanFields: ['block', 'blocked', 'is_cloud_provider', 'is_proxy', 'is_vpn'],
    deprecatedFields: ['srcIP', 'dstIP'], // Legacy field names
    fieldAliases: {
      'src_ip': 'source_ip',
      'dst_ip': 'destination_ip',
      'size': 'bytes'
    }
  },
  alarms: {
    numericFields: ['ts', 'timestamp', 'severity_level', 'priority', 'geographic_risk_score'],
    dateFields: ['ts', 'timestamp', 'created_at', 'updated_at'],
    booleanFields: ['resolved', 'acknowledged', 'is_cloud_provider', 'is_proxy', 'is_vpn'],
    requiredFields: ['type', 'severity'],
    deprecatedFields: ['alarmType'],
    fieldAliases: {
      'alarm_type': 'type',
      'level': 'severity'
    }
  },
  rules: {
    numericFields: ['ts', 'timestamp', 'hit_count', 'priority', 'port'],
    dateFields: ['ts', 'timestamp', 'created_at', 'last_hit'],
    booleanFields: ['active', 'enabled', 'disabled'],
    requiredFields: ['action', 'target_value'],
    fieldAliases: {
      'target': 'target_value',
      'rule_action': 'action'
    }
  },
  devices: {
    numericFields: ['last_seen', 'first_seen', 'activity_score', 'bandwidth_usage'],
    dateFields: ['last_seen', 'first_seen', 'created_at'],
    booleanFields: ['online', 'managed', 'monitored'],
    requiredFields: ['ip', 'mac'],
    fieldAliases: {
      'device_ip': 'ip',
      'mac_address': 'mac',
      'is_online': 'online'
    }
  },
  target_lists: {
    numericFields: ['target_count', 'created_at', 'updated_at'],
    dateFields: ['created_at', 'updated_at', 'last_updated'],
    booleanFields: ['active', 'enabled'],
    requiredFields: ['name', 'category'],
    fieldAliases: {
      'list_name': 'name',
      'list_category': 'category'
    }
  }
};

/**
 * Semantic validation results with detailed feedback
 */
interface SemanticValidationResult extends ValidationResult {
  suggestions?: string[];
  correctedQuery?: string;
  fieldIssues?: Array<{
    field: string;
    issue: 'invalid' | 'deprecated' | 'type_mismatch' | 'not_supported';
    suggestion?: string;
  }>;
  detailedErrors?: DetailedError[];
  quickFixes?: QuickFix[];
}

/**
 * Enhanced Query Validator with comprehensive validation capabilities
 */
export class EnhancedQueryValidator {
  /**
   * Validate query with comprehensive syntax, semantic, and field validation
   */
  static validateQuery(query: string, entityType: EntityType): SemanticValidationResult {
    // Step 1: Basic sanitization (security)
    const sanitizationResult = QuerySanitizer.sanitizeSearchQuery(query);
    if (!sanitizationResult.isValid) {
      return {
        isValid: false,
        errors: sanitizationResult.errors,
        suggestions: ['Check for malicious patterns or invalid characters']
      };
    }

    // Step 2: Syntax validation using parser
    const parseResult = queryParser.parse(sanitizationResult.sanitizedValue as string, entityType);
    if (!parseResult.isValid || !parseResult.ast) {
      return {
        isValid: false,
        errors: parseResult.errors,
        suggestions: parseResult.suggestions || [],
        correctedQuery: this.attemptQueryCorrection(query, entityType)
      };
    }

    // Step 3: Semantic validation
    const semanticResult = this.validateSemantics(parseResult.ast, entityType);
    if (!semanticResult.isValid) {
      return semanticResult;
    }

    // Step 4: Field validation and optimization
    const fieldResult = this.validateAndOptimizeFields(parseResult.ast, entityType);
    
    return {
      isValid: fieldResult.isValid,
      errors: fieldResult.errors,
      sanitizedValue: fieldResult.correctedQuery || sanitizationResult.sanitizedValue,
      suggestions: fieldResult.suggestions,
      correctedQuery: fieldResult.correctedQuery,
      fieldIssues: fieldResult.fieldIssues
    };
  }

  /**
   * Legacy validateQuery method for backward compatibility with position tracking
   */
  validateQuery(query: string, entityType?: EntityType): SemanticValidationResult & { detailedErrors: DetailedError[]; quickFixes: QuickFix[] } {
    const errors: DetailedError[] = [];
    const quickFixes: QuickFix[] = [];
    
    if (!query || typeof query !== 'string') {
      errors.push({
        message: 'Query must be a non-empty string',
        errorType: 'syntax',
        suggestion: 'Provide a valid search query string'
      });
      
      return this.buildResult(false, errors, quickFixes);
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      errors.push({
        message: 'Query cannot be empty',
        errorType: 'syntax',
        suggestion: 'Enter a search query like "protocol:tcp" or "severity:high"'
      });
      
      return this.buildResult(false, errors, quickFixes);
    }

    try {
      // If entity type provided, use static method for full validation then add position tracking
      if (entityType) {
        const staticResult = EnhancedQueryValidator.validateQuery(query, entityType);
        
        // If static validation failed, add position tracking details
        if (!staticResult.isValid) {
          const parseResult = this.parseWithPositionTracking(trimmedQuery);
          return {
            ...staticResult,
            detailedErrors: parseResult.errors,
            quickFixes: parseResult.quickFixes
          };
        }
        
        return {
          ...staticResult,
          detailedErrors: staticResult.detailedErrors || [],
          quickFixes: staticResult.quickFixes || []
        };
      }

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

    return this.buildResult(errors.length === 0, errors, quickFixes);
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
            context,
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
        context,
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
        context,
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
          context,
          suggestion: `Use '${field}:${value}' instead of '${field} ${value}'`
        });
        
        quickFixes.push({
          description: `Add colon after field '${field}'`,
          action: 'fix_syntax',
          position: position + field.length,
          original: `${field  } ${  value}`,
          replacement: `${field  }:${  value}`
        });
      }
      
      // Check for invalid equals operator
      if (operator === '=') {
        const context = this.getErrorContext(query, position);
        errors.push({
          message: `Use ':' instead of '=' for field queries at position ${position + field.length}`,
          position: position + field.length,
          errorType: 'syntax',
          context,
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
          position,
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
      position,
      errorType: 'syntax',
      context,
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
    quickFixes: QuickFix[]
  ): SemanticValidationResult & { detailedErrors: DetailedError[]; quickFixes: QuickFix[] } {
    return {
      isValid,
      errors: detailedErrors.map(e => e.message),
      suggestions: detailedErrors.map(e => e.suggestion).filter(Boolean) as string[],
      detailedErrors,
      quickFixes
    };
  }

  /**
   * Validate semantic correctness of the query AST
   */
  private static validateSemantics(ast: QueryNode, entityType: EntityType): SemanticValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];
    const fieldIssues: SemanticValidationResult['fieldIssues'] = [];
    const config = ENTITY_VALIDATION_CONFIGS[entityType];

    const validateNode = (node: QueryNode): void => {
      switch (node.type) {
        case 'field': {
          const fieldNode = node;
          this.validateFieldQuery(fieldNode, config, errors, suggestions, fieldIssues);
          break;
        }
        case 'comparison': {
          const compNode = node;
          this.validateComparisonQuery(compNode, config, errors, suggestions, fieldIssues);
          break;
        }
        case 'range': {
          const rangeNode = node;
          this.validateRangeQuery(rangeNode, config, errors, suggestions, fieldIssues);
          break;
        }
        case 'wildcard': {
          // Handle wildcard queries - they don't need field validation
          break;
        }
        case 'logical':
          if (node.left) {validateNode(node.left);}
          if (node.right) {validateNode(node.right);}
          if (node.operand) {validateNode(node.operand);}
          break;
        case 'group':
          validateNode(node.query);
          break;
      }
    };

    validateNode(ast);

    return {
      isValid: errors.length === 0,
      errors,
      suggestions,
      fieldIssues
    };
  }

  /**
   * Validate field query semantics
   */
  private static validateFieldQuery(
    node: FieldQuery, 
    config: EntityValidationConfig, 
    errors: string[], 
    suggestions: string[], 
    fieldIssues: SemanticValidationResult['fieldIssues']
  ): void {
    // Skip validation for match-all queries
    if (node.field === '*') {return;}

    // Check for deprecated fields
    if (config.deprecatedFields?.includes(node.field)) {
      const alias = config.fieldAliases?.[node.field];
      fieldIssues?.push({
        field: node.field,
        issue: 'deprecated',
        suggestion: alias ? `Use '${alias}' instead` : 'Field is deprecated'
      });
      if (alias) {
        suggestions.push(`Replace deprecated field '${node.field}' with '${alias}'`);
      }
    }

    // Validate boolean field usage
    if (config.booleanFields.includes(node.field)) {
      const value = String(node.value).toLowerCase();
      if (!['true', 'false', '1', '0', 'yes', 'no'].includes(value)) {
        errors.push(`Field '${node.field}' expects a boolean value (true/false), got '${node.value}'`);
        suggestions.push(`Use 'true' or 'false' for boolean field '${node.field}'`);
      }
    }

    // Validate date field format (basic check)
    if (config.dateFields.includes(node.field) && typeof node.value === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}|^\d{10,13}$/.test(node.value)) {
        errors.push(`Field '${node.field}' expects a date format (YYYY-MM-DD or timestamp), got '${node.value}'`);
        suggestions.push(`Use ISO date format (YYYY-MM-DD) or Unix timestamp for '${node.field}'`);
      }
    }
  }

  /**
   * Validate comparison query semantics
   */
  private static validateComparisonQuery(
    node: ComparisonQuery, 
    config: EntityValidationConfig, 
    errors: string[], 
    suggestions: string[], 
    fieldIssues: SemanticValidationResult['fieldIssues']
  ): void {
    // Comparison operators should only be used with numeric or date fields
    if (!config.numericFields.includes(node.field) && !config.dateFields.includes(node.field)) {
      errors.push(`Comparison operator '${node.operator}' cannot be used with non-numeric field '${node.field}'`);
      fieldIssues?.push({
        field: node.field,
        issue: 'type_mismatch',
        suggestion: `Use '=' operator for string fields or choose a numeric field`
      });
      suggestions.push(`Field '${node.field}' requires '=' operator for string matching`);
    }

    // Validate numeric values for numeric fields
    if (config.numericFields.includes(node.field) && typeof node.value === 'string') {
      if (!/^-?\d+(\.\d+)?$/.test(node.value)) {
        errors.push(`Field '${node.field}' expects a numeric value, got '${node.value}'`);
        suggestions.push(`Provide a numeric value for field '${node.field}'`);
      }
    }
  }

  /**
   * Validate range query semantics
   */
  private static validateRangeQuery(
    node: RangeQuery, 
    config: EntityValidationConfig, 
    errors: string[], 
    suggestions: string[], 
    fieldIssues: SemanticValidationResult['fieldIssues']
  ): void {
    // Range queries should only be used with numeric or date fields
    if (!config.numericFields.includes(node.field) && !config.dateFields.includes(node.field)) {
      errors.push(`Range query cannot be used with non-numeric field '${node.field}'`);
      fieldIssues?.push({
        field: node.field,
        issue: 'type_mismatch',
        suggestion: `Use wildcard patterns for string field ranges`
      });
    }

    // Validate range bounds
    if (typeof node.min === 'number' && typeof node.max === 'number' && node.min >= node.max) {
      errors.push(`Range minimum (${node.min}) must be less than maximum (${node.max})`);
      suggestions.push(`Ensure range minimum is less than maximum`);
    }
  }

  /**
   * Validate and optimize field usage
   */
  private static validateAndOptimizeFields(ast: QueryNode, entityType: EntityType): SemanticValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];
    const fieldIssues: SemanticValidationResult['fieldIssues'] = [];
    const validFields = SEARCH_FIELDS[entityType] || [];
    const config = ENTITY_VALIDATION_CONFIGS[entityType];
    let hasOptimizations = false;

    const validateAndOptimize = (node: QueryNode): QueryNode => {
      if (node.type === 'field' || node.type === 'comparison' || node.type === 'range') {
        const fieldNode = node as FieldQuery;
        
        // Skip validation for match-all
        if (fieldNode.field === '*') {return node;}

        // Check if field exists in valid fields for entity type
        if (!validFields.includes(fieldNode.field)) {
          // Check if it's an alias
          const alias = config.fieldAliases?.[fieldNode.field];
          if (alias && validFields.includes(alias)) {
            hasOptimizations = true;
            suggestions.push(`Optimized field '${fieldNode.field}' to '${alias}'`);
            return { ...node, field: alias };
          }

          // Check field mappings for alternative names
          const fieldMapping = FIELD_MAPPINGS[entityType];
          const mappedField = Object.entries(fieldMapping).find(([, mappings]) => 
            mappings.includes(fieldNode.field)
          )?.[0];

          if (mappedField && validFields.includes(mappedField)) {
            hasOptimizations = true;
            suggestions.push(`Mapped field '${fieldNode.field}' to '${mappedField}'`);
            return { ...node, field: mappedField };
          }

          errors.push(`Invalid field '${fieldNode.field}' for entity type '${entityType}'`);
          fieldIssues.push({
            field: fieldNode.field,
            issue: 'invalid',
            suggestion: `Valid fields: ${validFields.slice(0, 5).join(', ')}${validFields.length > 5 ? '...' : ''}`
          });
        }
      }

      // Recursively process logical operations
      if (node.type === 'logical') {
        return {
          ...node,
          left: node.left ? validateAndOptimize(node.left) : undefined,
          right: node.right ? validateAndOptimize(node.right) : undefined,
          operand: node.operand ? validateAndOptimize(node.operand) : undefined
        };
      }

      if (node.type === 'group') {
        return {
          ...node,
          query: validateAndOptimize(node.query)
        };
      }

      return node;
    };

    const optimizedAst = validateAndOptimize(ast);
    
    return {
      isValid: errors.length === 0,
      errors,
      suggestions,
      fieldIssues,
      correctedQuery: hasOptimizations ? this.astToQueryString(optimizedAst) : undefined
    };
  }

  /**
   * Attempt to correct common query syntax errors
   */
  private static attemptQueryCorrection(query: string, _entityType: EntityType): string | undefined {
    let corrected = query;
    let hasCorrections = false;

    // Fix common syntax issues
    const corrections = [
      // Fix missing quotes around values with spaces
      { pattern: /(\w+):([^"\s]+\s+[^"\s]+)/g, replacement: '$1:"$2"', description: 'Add quotes around spaced values' },
      // Fix incorrect operators
      { pattern: /(\w+)\s*==\s*/g, replacement: '$1:', description: 'Replace == with :' },
      { pattern: /(\w+)\s*=\s*/g, replacement: '$1:', description: 'Replace = with :' },
      // Fix missing AND/OR between terms
      { pattern: /(\w+:\S+)\s+(\w+:\S+)/g, replacement: '$1 AND $2', description: 'Add AND between terms' },
      // Fix common field aliases
      { pattern: /\bsrc_ip\b/g, replacement: 'source_ip', description: 'Replace src_ip with source_ip' },
      { pattern: /\bdst_ip\b/g, replacement: 'destination_ip', description: 'Replace dst_ip with destination_ip' },
    ];

    for (const correction of corrections) {
      if (correction.pattern.test(corrected)) {
        corrected = corrected.replace(correction.pattern, correction.replacement);
        hasCorrections = true;
      }
    }

    return hasCorrections ? corrected : undefined;
  }

  /**
   * Convert AST back to query string (simplified)
   */
  private static astToQueryString(ast: QueryNode): string {
    switch (ast.type) {
      case 'field':
        return `${ast.field}:${ast.value}`;
      case 'comparison':
        return `${ast.field}:${ast.operator}${ast.value}`;
      case 'range':
        return `${ast.field}:[${ast.min} TO ${ast.max}]`;
      case 'wildcard':
        return `${ast.field}:${ast.pattern}`;
      case 'logical':
        if (ast.operator === 'NOT' && ast.operand) {
          return `NOT ${this.astToQueryString(ast.operand)}`;
        }
        if (ast.left && ast.right) {
          return `${this.astToQueryString(ast.left)} ${ast.operator} ${this.astToQueryString(ast.right)}`;
        }
        break;
      case 'group':
        return `(${this.astToQueryString(ast.query)})`;
    }
    return '';
  }

  /**
   * Validate correlation field compatibility between entity types
   */
  static validateCorrelationFields(
    fields: CorrelationFieldName[], 
    primaryEntityType: EntityType, 
    secondaryEntityTypes: EntityType[]
  ): ValidationResult & { compatibleFields?: CorrelationFieldName[]; suggestions?: string[] } {
    const errors: string[] = [];
    const suggestions: string[] = [];
    const compatibleFields: CorrelationFieldName[] = [];

    const primaryMapping = FIELD_MAPPINGS[primaryEntityType];
    
    for (const field of fields) {
      // Check if field exists in primary entity
      if (primaryMapping[field]) {
        // Check if field exists in all secondary entities
        const existsInAllSecondary = secondaryEntityTypes.every(entityType => 
          FIELD_MAPPINGS[entityType][field]
        );
        
        if (existsInAllSecondary) {
          compatibleFields.push(field);
        } else {
          const incompatibleTypes = secondaryEntityTypes.filter(entityType => 
            !FIELD_MAPPINGS[entityType][field]
          );
          errors.push(`Field '${field}' is not available in entity types: ${incompatibleTypes.join(', ')}`);
        }
      } else {
        errors.push(`Field '${field}' is not available in primary entity type '${primaryEntityType}'`);
      }
    }

    // Generate suggestions for alternative fields
    if (compatibleFields.length === 0 && fields.length > 0) {
      const commonFields = Object.keys(primaryMapping).filter(field =>
        secondaryEntityTypes.every(entityType => FIELD_MAPPINGS[entityType][field])
      );
      
      if (commonFields.length > 0) {
        suggestions.push(`Consider using these compatible fields: ${commonFields.slice(0, 5).join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      compatibleFields,
      suggestions
    };
  }
}