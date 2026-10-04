/**
 * Error Formatter for Firewalla MCP Server
 * Provides user-friendly error message formatting and grouping
 */
import type { DetailedError, QuickFix } from './enhanced-query-validator.js';
/**
 * Formatted error with enhanced presentation
 */
export interface FormattedError {
    title: string;
    message: string;
    suggestion?: string;
    code: string;
    help?: string;
    context?: string;
    severity: 'error' | 'warning' | 'info';
}
/**
 * Complete error report with multiple errors
 */
export interface FormattedErrorReport {
    summary: string;
    errors: Record<string, FormattedError[]>;
    quickFixes: QuickFix[];
    documentation: DocumentationLink[];
    severity: 'high' | 'medium' | 'low';
}
/**
 * Documentation link for help
 */
export interface DocumentationLink {
    title: string;
    url: string;
    description: string;
}
export declare class ErrorFormatter {
    private static readonly ERROR_TITLES;
    private static readonly ERROR_CODES;
    private static readonly HELP_LINKS;
    /**
     * Format a single detailed error
     */
    static formatError(error: DetailedError, context?: string): FormattedError;
    /**
     * Format multiple errors into a comprehensive report
     */
    static formatMultipleErrors(errors: DetailedError[], context?: string): FormattedErrorReport;
    /**
     * Generate a user-friendly error summary
     */
    private static generateErrorSummary;
    /**
     * Group errors by type for better organization
     */
    private static groupErrorsByType;
    /**
     * Generate quick fixes from errors
     */
    private static generateQuickFixes;
    /**
     * Get relevant documentation links
     */
    private static getRelevantDocumentation;
    /**
     * Calculate overall severity
     */
    private static calculateOverallSeverity;
    /**
     * Enhance error message with additional context
     */
    private static enhanceErrorMessage;
    /**
     * Get error title by type
     */
    private static getErrorTitle;
    /**
     * Generate error code
     */
    private static generateErrorCode;
    /**
     * Get help link for error type
     */
    private static getHelpLink;
    /**
     * Get error severity
     */
    private static getErrorSeverity;
    /**
     * Extract operator from error message
     */
    private static extractOperatorFromMessage;
    /**
     * Simple hash function for error codes
     */
    private static simpleHash;
    /**
     * Format error report as text for console output
     */
    static formatReportAsText(report: FormattedErrorReport): string;
}
//# sourceMappingURL=error-formatter.d.ts.map