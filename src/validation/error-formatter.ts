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

export class ErrorFormatter {
  private static readonly ERROR_TITLES: Record<string, string> = {
    'syntax': 'Syntax Error',
    'semantic': 'Query Logic Error', 
    'field': 'Field Error',
    'operator': 'Operator Error'
  };

  private static readonly ERROR_CODES: Record<string, string> = {
    'syntax': 'SYNTAX_ERR',
    'semantic': 'LOGIC_ERR',
    'field': 'FIELD_ERR', 
    'operator': 'OPERATOR_ERR'
  };

  private static readonly HELP_LINKS: Record<string, DocumentationLink> = {
    'syntax': {
      title: 'Query Syntax Guide',
      url: 'docs/field-syntax-specification.md',
      description: 'Learn the correct syntax for search queries'
    },
    'field': {
      title: 'Field Reference',
      url: 'docs/field-syntax-requirements.md',
      description: 'Complete list of available fields by entity type'
    },
    'operator': {
      title: 'Operator Guide',
      url: 'docs/field-syntax-specification.md#query-syntax-operators',
      description: 'Available operators and their usage'
    },
    'semantic': {
      title: 'Advanced Query Examples',
      url: 'docs/field-syntax-specification.md#tool-specific-syntax-examples',
      description: 'Examples of complex query patterns'
    }
  };

  /**
   * Format a single detailed error
   */
  static formatError(error: DetailedError, context?: string): FormattedError {
    const errorType = error.errorType || 'syntax';
    
    return {
      title: this.getErrorTitle(errorType),
      message: this.enhanceErrorMessage(error),
      suggestion: error.suggestion,
      code: this.generateErrorCode(error),
      help: this.getHelpLink(errorType),
      context: context || error.context,
      severity: this.getErrorSeverity(errorType)
    };
  }

  /**
   * Format multiple errors into a comprehensive report
   */
  static formatMultipleErrors(
    errors: DetailedError[], 
    context?: string
  ): FormattedErrorReport {
    const grouped = this.groupErrorsByType(errors);
    const formattedGroups: Record<string, FormattedError[]> = {};
    
    // Format each group
    Object.entries(grouped).forEach(([type, typeErrors]) => {
      formattedGroups[type] = typeErrors.map(error => 
        this.formatError(error, context)
      );
    });

    const quickFixes = this.generateQuickFixes(errors);
    const documentation = this.getRelevantDocumentation(errors);
    const severity = this.calculateOverallSeverity(errors);

    return {
      summary: this.generateErrorSummary(errors),
      errors: formattedGroups,
      quickFixes,
      documentation,
      severity
    };
  }

  /**
   * Generate a user-friendly error summary
   */
  private static generateErrorSummary(errors: DetailedError[]): string {
    const totalErrors = errors.length;
    const errorTypes = [...new Set(errors.map(e => e.errorType))];
    
    if (totalErrors === 1) {
      const error = errors[0];
      return `Found 1 ${error.errorType} error in your query`;
    }
    
    if (errorTypes.length === 1) {
      return `Found ${totalErrors} ${errorTypes[0]} errors in your query`;
    }
    
    const typeBreakdown = errorTypes.map(type => {
      const count = errors.filter(e => e.errorType === type).length;
      return `${count} ${type}`;
    }).join(', ');
    
    return `Found ${totalErrors} errors: ${typeBreakdown}`;
  }

  /**
   * Group errors by type for better organization
   */
  private static groupErrorsByType(errors: DetailedError[]): Record<string, DetailedError[]> {
    const grouped: Record<string, DetailedError[]> = {};
    
    errors.forEach(error => {
      const type = error.errorType || 'syntax';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(error);
    });
    
    return grouped;
  }

  /**
   * Generate quick fixes from errors
   */
  private static generateQuickFixes(errors: DetailedError[]): QuickFix[] {
    const fixes: QuickFix[] = [];
    
    errors.forEach(error => {
      // Field name fixes
      if (error.errorType === 'field' && error.suggestion?.includes('Did you mean')) {
        const fieldMatch = error.suggestion.match(/Did you mean '([^']+)'/);
        const originalMatch = error.message.match(/Field '([^']+)'/);
        
        if (fieldMatch && originalMatch) {
          fixes.push({
            description: error.suggestion,
            action: 'replace_field',
            original: originalMatch[1],
            replacement: fieldMatch[1]
          });
        }
      }
      
      // Syntax fixes
      if (error.errorType === 'syntax') {
        if (error.message.includes('colon')) {
          fixes.push({
            description: 'Add missing colon in field query',
            action: 'fix_syntax',
            position: error.position
          });
        }
        
        if (error.message.includes('parenthesis')) {
          fixes.push({
            description: 'Fix parentheses matching',
            action: 'fix_syntax',
            position: error.position
          });
        }
        
        if (error.message.includes('quote')) {
          fixes.push({
            description: 'Fix quote matching',
            action: 'add_quotes',
            position: error.position
          });
        }
      }
      
      // Operator fixes
      if (error.errorType === 'operator' && error.suggestion) {
        if (error.suggestion.includes('Use :') || error.suggestion.includes('Try using:')) {
          fixes.push({
            description: 'Use compatible operator',
            action: 'change_operator',
            original: this.extractOperatorFromMessage(error.message),
            replacement: ':'
          });
        }
      }
    });
    
    // Remove duplicates
    return fixes.filter((fix, index, array) => 
      array.findIndex(f => 
        f.action === fix.action && 
        f.original === fix.original && 
        f.replacement === fix.replacement
      ) === index
    );
  }

  /**
   * Get relevant documentation links
   */
  private static getRelevantDocumentation(errors: DetailedError[]): DocumentationLink[] {
    const errorTypes = [...new Set(errors.map(e => e.errorType))];
    const documentation: DocumentationLink[] = [];
    
    errorTypes.forEach(type => {
      const link = this.HELP_LINKS[type];
      if (link) {
        documentation.push(link);
      }
    });
    
    // Add general documentation
    if (documentation.length === 0 || errors.length > 3) {
      documentation.push({
        title: 'Complete Documentation',
        url: 'docs/field-syntax-requirements.md',
        description: 'Comprehensive guide to all query syntax and validation rules'
      });
    }
    
    return documentation;
  }

  /**
   * Calculate overall severity
   */
  private static calculateOverallSeverity(errors: DetailedError[]): 'high' | 'medium' | 'low' {
    if (errors.length >= 5) {return 'high';}
    if (errors.length >= 2) {return 'medium';}
    
    const hasSyntaxErrors = errors.some(e => e.errorType === 'syntax');
    if (hasSyntaxErrors) {return 'medium';}
    
    return 'low';
  }

  /**
   * Enhance error message with additional context
   */
  private static enhanceErrorMessage(error: DetailedError): string {
    let {message} = error;
    
    // Add position information if available
    if (error.position !== undefined) {
      message = `${message} (at position ${error.position})`;
    }
    
    // Add context if available
    if (error.context && !message.includes(error.context)) {
      message = `${message}\nContext: ${error.context}`;
    }
    
    return message;
  }

  /**
   * Get error title by type
   */
  private static getErrorTitle(errorType: string): string {
    return this.ERROR_TITLES[errorType] || 'Query Error';
  }

  /**
   * Generate error code
   */
  private static generateErrorCode(error: DetailedError): string {
    const baseCode = this.ERROR_CODES[error.errorType] || 'UNKNOWN_ERR';
    const hash = this.simpleHash(error.message);
    return `${baseCode}_${hash}`;
  }

  /**
   * Get help link for error type
   */
  private static getHelpLink(errorType: string): string {
    const link = this.HELP_LINKS[errorType];
    return link ? link.url : 'docs/field-syntax-requirements.md';
  }

  /**
   * Get error severity
   */
  private static getErrorSeverity(errorType: string): 'error' | 'warning' | 'info' {
    switch (errorType) {
      case 'syntax':
        return 'error';
      case 'semantic':
        return 'error';
      case 'field':
        return 'warning';
      case 'operator':
        return 'warning';
      default:
        return 'error';
    }
  }

  /**
   * Extract operator from error message
   */
  private static extractOperatorFromMessage(message: string): string {
    const operatorMatch = message.match(/operator '([^']+)'/);
    return operatorMatch ? operatorMatch[1] : '';
  }

  /**
   * Simple hash function for error codes
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 4).toUpperCase();
  }

  /**
   * Format error report as text for console output
   */
  static formatReportAsText(report: FormattedErrorReport): string {
    const lines: string[] = [];
    
    lines.push(`❌ ${report.summary}`);
    lines.push('');
    
    // Add errors by type
    Object.entries(report.errors).forEach(([type, typeErrors]) => {
      if (typeErrors.length > 0) {
        lines.push(`📋 ${this.ERROR_TITLES[type] || type.toUpperCase()} ERRORS:`);
        
        typeErrors.forEach((error, index) => {
          lines.push(`   ${index + 1}. ${error.message}`);
          if (error.suggestion) {
            lines.push(`      💡 ${error.suggestion}`);
          }
          if (error.context) {
            lines.push(`      📍 ${error.context}`);
          }
        });
        lines.push('');
      }
    });
    
    // Add quick fixes
    if (report.quickFixes.length > 0) {
      lines.push('🔧 QUICK FIXES:');
      report.quickFixes.forEach((fix, index) => {
        lines.push(`   ${index + 1}. ${fix.description}`);
        if (fix.original && fix.replacement) {
          lines.push(`      Replace: "${fix.original}" → "${fix.replacement}"`);
        }
      });
      lines.push('');
    }
    
    // Add documentation links
    if (report.documentation.length > 0) {
      lines.push('📚 HELPFUL DOCUMENTATION:');
      report.documentation.forEach((doc, index) => {
        lines.push(`   ${index + 1}. ${doc.title}: ${doc.url}`);
        lines.push(`      ${doc.description}`);
      });
    }
    
    return lines.join('\n');
  }
}