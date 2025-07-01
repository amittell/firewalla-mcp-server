/**
 * Progressive Validator for Firewalla MCP Server
 * Provides step-by-step validation guidance for complex queries
 */

import type { SEARCH_FIELDS } from '../search/types.js';
import { EnhancedQueryValidator, type DetailedError } from './enhanced-query-validator.js';
import { FieldValidator } from './field-validator.js';
import { OperatorValidator } from './operator-validator.js';
import { ErrorFormatter, type FormattedErrorReport } from './error-formatter.js';

type EntityType = keyof typeof SEARCH_FIELDS;

/**
 * Validation step types
 */
export type ValidationStep = 
  | 'basicSyntax' 
  | 'fieldExistence' 
  | 'operatorCompatibility' 
  | 'semanticCorrectness' 
  | 'performanceOptimization';

/**
 * Step validation result
 */
export interface StepValidationResult {
  step: ValidationStep;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  progress: number;
}

/**
 * Progressive validation result
 */
export interface ProgressiveValidationResult {
  isValid: boolean;
  currentStep?: ValidationStep;
  error?: FormattedErrorReport;
  nextSteps?: string[];
  progress: number;
  allValidations?: Record<ValidationStep, StepValidationResult>;
  overallGuidance?: string;
}

/**
 * Step configuration
 */
interface StepConfig {
  title: string;
  description: string;
  weight: number;
  critical: boolean;
}

export class ProgressiveValidator {
  private static readonly STEP_CONFIGS: Record<ValidationStep, StepConfig> = {
    basicSyntax: {
      title: 'Basic Syntax Check',
      description: 'Validates parentheses, quotes, and basic query structure',
      weight: 0.3,
      critical: true
    },
    fieldExistence: {
      title: 'Field Validation',
      description: 'Checks that all field names are valid for the entity type',
      weight: 0.25,
      critical: true
    },
    operatorCompatibility: {
      title: 'Operator Compatibility',
      description: 'Validates operators are compatible with field types',
      weight: 0.25,
      critical: true
    },
    semanticCorrectness: {
      title: 'Semantic Analysis',
      description: 'Checks for logical consistency and conflicts',
      weight: 0.15,
      critical: true
    },
    performanceOptimization: {
      title: 'Performance Check',
      description: 'Suggests optimizations for better query performance',
      weight: 0.05,
      critical: false
    }
  };

  /**
   * Validate query with progressive guidance
   */
  static validateWithProgression(
    query: string, 
    entityType: EntityType
  ): ProgressiveValidationResult {
    const results: Record<ValidationStep, StepValidationResult> = {
      basicSyntax: this.validateBasicSyntax(query),
      fieldExistence: this.validateFields(query, entityType),
      operatorCompatibility: this.validateOperators(query, entityType),
      semanticCorrectness: this.validateSemantics(query, entityType),
      performanceOptimization: this.validatePerformance(query, entityType)
    };

    // Find first critical failure
    const firstFailure = this.findFirstCriticalFailure(results);
    if (firstFailure) {
      const errorReport = this.createStepErrorReport(firstFailure, results);
      
      return {
        isValid: false,
        currentStep: firstFailure.step,
        error: errorReport,
        nextSteps: this.getNextSteps(firstFailure.step),
        progress: this.calculateProgress(results),
        allValidations: results,
        overallGuidance: this.generateOverallGuidance(firstFailure.step, results)
      };
    }

    // Check for non-critical issues
    const hasWarnings = Object.values(results).some(r => r.warnings.length > 0);
    const progress = this.calculateProgress(results);

    return {
      isValid: true,
      progress,
      allValidations: results,
      overallGuidance: hasWarnings 
        ? this.generateOptimizationGuidance(results)
        : 'Query is valid and optimized!'
    };
  }

  /**
   * Validate basic syntax
   */
  private static validateBasicSyntax(query: string): StepValidationResult {
    const validator = new EnhancedQueryValidator();
    const result = validator.validateQuery(query);
    
    const syntaxErrors = result.detailedErrors.filter(e => e.errorType === 'syntax');
    
    return {
      step: 'basicSyntax',
      isValid: syntaxErrors.length === 0,
      errors: syntaxErrors.map(e => e.message),
      warnings: [],
      suggestions: syntaxErrors.map(e => e.suggestion).filter(Boolean) as string[],
      progress: syntaxErrors.length === 0 ? 100 : 0
    };
  }

  /**
   * Validate field existence and compatibility
   */
  private static validateFields(query: string, entityType: EntityType): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Extract field names from query
    const fieldPattern = /(\w+)\s*[:=]/g;
    const fields = new Set<string>();
    let match;
    
    while ((match = fieldPattern.exec(query)) !== null) {
      fields.add(match[1]);
    }
    
    let validFields = 0;
    const totalFields = fields.size;
    
    fields.forEach(field => {
      const validation = FieldValidator.validateField(field, entityType);
      
      if (validation.isValid) {
        validFields++;
      } else {
        errors.push(validation.error || `Invalid field: ${field}`);
        if (validation.suggestion) {
          suggestions.push(validation.suggestion);
        }
      }
    });
    
    const progress = totalFields > 0 ? Math.round((validFields / totalFields) * 100) : 100;
    
    return {
      step: 'fieldExistence',
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      progress
    };
  }

  /**
   * Validate operator compatibility
   */
  private static validateOperators(query: string, entityType: EntityType): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Extract field:operator patterns - updated to handle >= and other operators
    const operatorPattern = /(\w+)\s*([!<>=:~]+|contains|startswith|endswith)/g;
    const operators = new Map<string, string>();
    let match;
    
    while ((match = operatorPattern.exec(query)) !== null) {
      operators.set(match[1], match[2]);
    }
    
    let validOperators = 0;
    const totalOperators = operators.size;
    
    operators.forEach((operator, field) => {
      const validation = OperatorValidator.validateOperator(field, operator, entityType);
      
      if (validation.isValid) {
        validOperators++;
      } else {
        errors.push(validation.error || `Invalid operator: ${operator} for field ${field}`);
        if (validation.suggestion) {
          suggestions.push(validation.suggestion);
        }
      }
    });
    
    const progress = totalOperators > 0 ? Math.round((validOperators / totalOperators) * 100) : 100;
    
    return {
      step: 'operatorCompatibility',
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      progress
    };
  }

  /**
   * Validate semantic correctness
   */
  private static validateSemantics(query: string, entityType: EntityType): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Check for contradictory conditions
    const contradictions = this.findContradictions(query);
    errors.push(...contradictions);
    
    // Check for redundant conditions
    const redundancies = this.findRedundancies(query);
    warnings.push(...redundancies);
    
    // Check for impossible ranges
    const impossibleRanges = this.findImpossibleRanges(query);
    errors.push(...impossibleRanges);
    
    // Generate semantic suggestions
    if (errors.length === 0 && warnings.length === 0) {
      const optimizations = this.suggestSemanticOptimizations(query, entityType);
      suggestions.push(...optimizations);
    }
    
    return {
      step: 'semanticCorrectness',
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      progress: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 25))
    };
  }

  /**
   * Validate performance characteristics
   */
  private static validatePerformance(query: string, entityType: EntityType): StepValidationResult {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Check query complexity
    const complexity = this.calculateQueryComplexity(query);
    if (complexity > 10) {
      warnings.push('Query complexity is high, consider simplifying');
      suggestions.push('Break complex queries into smaller parts or use more specific filters');
    }
    
    // Check for inefficient patterns
    if (query.includes('*') && query.split('*').length > 3) {
      warnings.push('Multiple wildcards may impact performance');
      suggestions.push('Use more specific patterns instead of multiple wildcards');
    }
    
    // Check for missing limit considerations
    if (!query.includes('limit') && entityType === 'flows') {
      suggestions.push('Consider adding a limit parameter for better performance with flow queries');
    }
    
    return {
      step: 'performanceOptimization',
      isValid: true, // Performance issues are not critical
      errors: [],
      warnings,
      suggestions,
      progress: warnings.length === 0 ? 100 : Math.max(70, 100 - (warnings.length * 10))
    };
  }

  /**
   * Find first critical failure
   */
  private static findFirstCriticalFailure(
    results: Record<ValidationStep, StepValidationResult>
  ): StepValidationResult | null {
    // Check all steps in order, but only fail on critical ones
    const orderedSteps: ValidationStep[] = [
      'basicSyntax', 
      'fieldExistence', 
      'operatorCompatibility', 
      'semanticCorrectness', 
      'performanceOptimization'
    ];
    
    for (const step of orderedSteps) {
      const result = results[step];
      if (!result.isValid && this.STEP_CONFIGS[step].critical) {
        return result;
      }
    }
    
    return null;
  }

  /**
   * Calculate overall progress
   */
  private static calculateProgress(results: Record<ValidationStep, StepValidationResult>): number {
    let totalProgress = 0;
    let totalWeight = 0;
    
    Object.entries(results).forEach(([step, result]) => {
      const config = this.STEP_CONFIGS[step as ValidationStep];
      const stepProgress = result.progress / 100;
      totalProgress += stepProgress * config.weight;
      totalWeight += config.weight;
    });
    
    return Math.round((totalProgress / totalWeight) * 100);
  }

  /**
   * Get next steps guidance
   */
  private static getNextSteps(failedStep: ValidationStep): string[] {
    switch (failedStep) {
      case 'basicSyntax':
        return [
          'Fix syntax errors first before proceeding',
          'Check parentheses and quotes are properly matched',
          'Verify operator placement and field:value syntax',
          'Review query syntax documentation'
        ];
        
      case 'fieldExistence':
        return [
          'Correct field names to match entity schema',
          'Check field spelling and capitalization',
          'Refer to field documentation for valid options',
          'Consider field aliases if using common abbreviations'
        ];
        
      case 'operatorCompatibility':
        return [
          'Use appropriate operators for each field type',
          'Check operator documentation for compatibility',
          'Consider alternative operators that match field types',
          'Review examples of correct operator usage'
        ];
        
      case 'semanticCorrectness':
        return [
          'Resolve logical contradictions in query conditions',
          'Remove redundant or conflicting filters',
          'Check date ranges and numeric comparisons',
          'Simplify complex logical expressions'
        ];
        
      case 'performanceOptimization':
        return [
          'Consider query complexity and performance impact',
          'Use more specific filters to reduce result sets',
          'Avoid excessive wildcard usage',
          'Add appropriate limits for large result sets'
        ];
        
      default:
        return ['Review query documentation for guidance'];
    }
  }

  /**
   * Generate overall guidance message
   */
  private static generateOverallGuidance(
    failedStep: ValidationStep, 
    results: Record<ValidationStep, StepValidationResult>
  ): string {
    const config = this.STEP_CONFIGS[failedStep];
    const progress = this.calculateProgress(results);
    
    let guidance = `Query validation failed at step: ${config.title}. `;
    guidance += `Overall progress: ${progress}%. `;
    guidance += `Focus on: ${config.description}`;
    
    return guidance;
  }

  /**
   * Generate optimization guidance for valid queries
   */
  private static generateOptimizationGuidance(
    results: Record<ValidationStep, StepValidationResult>
  ): string {
    const warnings = Object.values(results).flatMap(r => r.warnings);
    const suggestions = Object.values(results).flatMap(r => r.suggestions);
    
    if (warnings.length > 0) {
      return `Query is valid but has ${warnings.length} optimization opportunities. ${suggestions[0] || 'Consider reviewing performance suggestions.'}`;
    }
    
    return 'Query is valid and well-optimized!';
  }

  /**
   * Create error report for failed step
   */
  private static createStepErrorReport(
    failedStep: StepValidationResult,
    _allResults: Record<ValidationStep, StepValidationResult>
  ): FormattedErrorReport {
    const detailedErrors: DetailedError[] = failedStep.errors.map(error => ({
      message: error,
      errorType: this.getErrorTypeForStep(failedStep.step),
      suggestion: failedStep.suggestions[0]
    }));
    
    return ErrorFormatter.formatMultipleErrors(detailedErrors);
  }

  /**
   * Get error type for validation step
   */
  private static getErrorTypeForStep(step: ValidationStep): 'syntax' | 'field' | 'operator' | 'semantic' {
    switch (step) {
      case 'basicSyntax':
        return 'syntax';
      case 'fieldExistence':
        return 'field';
      case 'operatorCompatibility':
        return 'operator';
      case 'semanticCorrectness':
        return 'semantic';
      case 'performanceOptimization':
        return 'semantic'; // Performance optimizations are semantic-level suggestions
      default:
        return 'syntax';
    }
  }

  /**
   * Find contradictory conditions in query
   */
  private static findContradictions(query: string): string[] {
    const contradictions: string[] = [];
    
    // Check for field:true AND field:false patterns
    const booleanFields = ['blocked', 'online'];
    booleanFields.forEach(field => {
      if (query.includes(`${field}:true`) && query.includes(`${field}:false`)) {
        contradictions.push(`Contradictory condition: ${field} cannot be both true and false`);
      }
    });
    
    // Check for mutually exclusive protocol values
    const protocolPattern = /protocol:(\w+)/g;
    const protocols: string[] = [];
    let match;
    while ((match = protocolPattern.exec(query)) !== null) {
      protocols.push(match[1].toLowerCase());
    }
    
    if (protocols.length > 1) {
      const uniqueProtocols = [...new Set(protocols)];
      if (uniqueProtocols.length > 1) {
        contradictions.push(`Contradictory condition: protocol cannot be multiple values simultaneously (${uniqueProtocols.join(', ')})`);
      }
    }
    
    return contradictions;
  }

  /**
   * Find redundant conditions
   */
  private static findRedundancies(query: string): string[] {
    const redundancies: string[] = [];
    
    // Check for duplicate field conditions
    const fieldPattern = /(\w+):[^)\s]+/g;
    const fieldCounts = new Map<string, number>();
    let match;
    
    while ((match = fieldPattern.exec(query)) !== null) {
      const field = match[1];
      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    }
    
    fieldCounts.forEach((count, field) => {
      if (count > 1) {
        redundancies.push(`Field '${field}' appears ${count} times - consider combining conditions`);
      }
    });
    
    return redundancies;
  }

  /**
   * Find impossible range conditions
   */
  private static findImpossibleRanges(query: string): string[] {
    const impossible: string[] = [];
    
    // Check for impossible numeric ranges
    const rangePattern = /(\w+):\[(\d+)\s+TO\s+(\d+)\]/g;
    let match;
    
    while ((match = rangePattern.exec(query)) !== null) {
      const [, field, min, max] = match;
      if (parseInt(min) > parseInt(max)) {
        impossible.push(`Impossible range for ${field}: minimum (${min}) is greater than maximum (${max})`);
      }
    }
    
    return impossible;
  }

  /**
   * Suggest semantic optimizations
   */
  private static suggestSemanticOptimizations(query: string, entityType: EntityType): string[] {
    const suggestions: string[] = [];
    
    // Suggest more specific filters
    if (query.length < 20 && !query.includes('AND') && !query.includes('OR')) {
      suggestions.push('Consider adding additional filters for more specific results');
    }
    
    // Suggest field combinations
    if (entityType === 'flows' && query.includes('protocol:tcp') && !query.includes('blocked')) {
      suggestions.push('Consider adding blocked:true/false filter for TCP flows');
    }
    
    return suggestions;
  }

  /**
   * Calculate query complexity score
   */
  private static calculateQueryComplexity(query: string): number {
    let complexity = 0;
    
    // Count logical operators
    complexity += (query.match(/\b(AND|OR|NOT)\b/gi) || []).length * 2;
    
    // Count field conditions
    complexity += (query.match(/\w+\s*[:=]/g) || []).length;
    
    // Count wildcards
    complexity += (query.match(/\*/g) || []).length * 1.5;
    
    // Count parentheses groups
    complexity += (query.match(/\(/g) || []).length;
    
    // Count range queries
    complexity += (query.match(/\[.*TO.*\]/g) || []).length * 2;
    
    return complexity;
  }
}