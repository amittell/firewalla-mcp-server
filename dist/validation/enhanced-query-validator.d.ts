/**
 * Enhanced Query Validator for Firewalla MCP Server
 * Provides comprehensive syntax, semantic, and field validation for search queries
 */
import { type EntityType } from './field-mapper.js';
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
export declare class EnhancedQueryValidator {
    /**
     * Validate query with comprehensive syntax, semantic, and field validation
     */
    static validateQuery(query: string, entityType: EntityType): SemanticValidationResult;
    /**
     * Legacy validateQuery method for backward compatibility with position tracking
     */
    validateQuery(query: string, entityType?: EntityType): SemanticValidationResult & {
        detailedErrors: DetailedError[];
        quickFixes: QuickFix[];
    };
    /**
     * Parse query with detailed position tracking
     */
    private parseWithPositionTracking;
    /**
     * Validate parentheses matching
     */
    private validateParentheses;
    /**
     * Validate quote matching
     */
    private validateQuotes;
    /**
     * Validate field syntax (field:value patterns)
     */
    private validateFieldSyntax;
    /**
     * Check if the current position is part of range syntax like [value TO value]
     */
    private isPartOfRangeSyntax;
    /**
     * Check if the current position is part of a quoted value
     */
    private isPartOfQuotedValue;
    /**
     * Validate operator placement
     */
    private validateOperatorPlacement;
    /**
     * Create detailed syntax error with context
     */
    private createDetailedSyntaxError;
    /**
     * Get context around error position
     */
    private getErrorContext;
    /**
     * Find error position from error message
     */
    private findErrorPosition;
    /**
     * Get syntax fix suggestion based on error message
     */
    private getSyntaxFixSuggestion;
    /**
     * Suggest syntax fix as quick fix
     */
    private suggestSyntaxFix;
    /**
     * Build enhanced validation result
     */
    private buildResult;
    /**
     * Validate semantic correctness of the query AST
     */
    private static validateSemantics;
    /**
     * Validate field query semantics
     */
    private static validateFieldQuery;
    /**
     * Validate comparison query semantics
     */
    private static validateComparisonQuery;
    /**
     * Validate range query semantics
     */
    private static validateRangeQuery;
    /**
     * Validate and optimize field usage
     */
    private static validateAndOptimizeFields;
    /**
     * Attempt to correct common query syntax errors
     */
    private static attemptQueryCorrection;
    /**
     * Convert AST back to query string (simplified)
     */
    private static astToQueryString;
}
export {};
//# sourceMappingURL=enhanced-query-validator.d.ts.map