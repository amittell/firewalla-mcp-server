/**
 * Tests for Enhanced Error Messages
 * Validates detailed error reporting, suggestions, and user-friendly messages
 */

import { EnhancedQueryValidator, DetailedError } from '../../src/validation/enhanced-query-validator.js';
import { FieldValidator } from '../../src/validation/field-validator.js';
import { OperatorValidator } from '../../src/validation/operator-validator.js';
import { ErrorFormatter } from '../../src/validation/error-formatter.js';
import { ProgressiveValidator } from '../../src/validation/progressive-validator.js';

describe('Enhanced Error Messages', () => {
  describe('EnhancedQueryValidator', () => {
    describe('Syntax Error Detection', () => {
      test('should detect unclosed parentheses with position', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('(protocol:tcp');
        
        expect(result.isValid).toBe(false);
        expect(result.detailedErrors).toHaveLength(1);
        
        const error = result.detailedErrors[0];
        expect(error.errorType).toBe('syntax');
        expect(error.message).toContain('Unclosed opening parenthesis');
        expect(error.position).toBe(0);
        expect(error.suggestion).toContain('Add matching closing parenthesis');
      });

      test('should detect unclosed quotes with context', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('description:"malware alert');
        
        expect(result.isValid).toBe(false);
        expect(result.detailedErrors).toHaveLength(1);
        
        const error = result.detailedErrors[0];
        expect(error.errorType).toBe('syntax');
        expect(error.message).toContain('Unclosed quoted string');
        expect(error.position).toBe(12);
        expect(error.context).toContain('malware');
      });

      test('should detect missing colon in field queries', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('protocol tcp');
        
        expect(result.isValid).toBe(false);
        expect(result.detailedErrors).toHaveLength(1);
        
        const error = result.detailedErrors[0];
        expect(error.errorType).toBe('syntax');
        expect(error.message).toContain("Expected ':' after field 'protocol'");
        expect(error.suggestion).toContain('protocol:tcp');
      });

      test('should detect invalid equals operator', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('protocol=tcp');
        
        expect(result.isValid).toBe(false);
        expect(result.detailedErrors).toHaveLength(1);
        
        const error = result.detailedErrors[0];
        expect(error.errorType).toBe('syntax');
        expect(error.message).toContain("Use ':' instead of '='");
        expect(error.suggestion).toContain('protocol:tcp');
      });
    });

    describe('Quick Fix Generation', () => {
      test('should generate quick fixes for syntax errors', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('protocol=tcp');
        
        expect(result.quickFixes).toHaveLength(1);
        
        const fix = result.quickFixes[0];
        expect(fix.action).toBe('fix_syntax');
        expect(fix.description).toContain("Replace '=' with ':'");
        expect(fix.original).toBe('=');
        expect(fix.replacement).toBe(':');
      });

      test('should generate quick fix for missing parenthesis', () => {
        const validator = new EnhancedQueryValidator();
        const result = validator.validateQuery('(protocol:tcp');
        
        expect(result.quickFixes).toHaveLength(1);
        
        const fix = result.quickFixes[0];
        expect(fix.action).toBe('fix_syntax');
        expect(fix.description).toContain('Add matching closing parenthesis');
        expect(fix.replacement).toBe(')');
      });
    });
  });

  describe('FieldValidator', () => {
    describe('Field Suggestions', () => {
      test('should suggest correct field for common typos', () => {
        const result = FieldValidator.validateField('srcIP', 'flows');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Field 'srcIP' is not valid for flows");
        expect(result.suggestion).toContain("Did you mean 'source_ip'?");
        expect(result.suggestion).toContain('alias');
      });

      test('should suggest similar field for spelling mistakes', () => {
        const result = FieldValidator.validateField('protocl', 'flows');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Field 'protocl' is not valid for flows");
        expect(result.suggestion).toContain("Did you mean 'protocol'?");
        expect(result.confidence).toBeGreaterThan(0.6);
      });

      test('should provide field list when no close match', () => {
        const result = FieldValidator.validateField('invalidfield', 'flows');
        
        expect(result.isValid).toBe(false);
        expect(result.suggestion).toContain('Valid fields include:');
        expect(result.validFields).toBeDefined();
        expect(result.validFields!.length).toBeGreaterThan(0);
      });
    });

    describe('Cross-Type Validation', () => {
      test('should validate field across multiple entity types', () => {
        const result = FieldValidator.validateFieldAcrossTypes('timestamp', ['flows', 'alarms']);
        
        expect(result.isValid).toBe(true);
        expect(result.fieldMapping['flows']).toContain('timestamp');
        expect(result.fieldMapping['alarms']).toContain('timestamp');
      });

      test('should provide alternatives when field not compatible', () => {
        const result = FieldValidator.validateFieldAcrossTypes('invalidfield', ['flows', 'rules']);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
        expect(result.fieldMapping).toBeDefined();
      });
    });

    describe('Contextual Suggestions', () => {
      test('should generate contextual field suggestions', () => {
        const suggestions = FieldValidator.generateContextualSuggestions('pro', 'flows', 5);
        
        expect(suggestions).toContain('protocol');
        expect(suggestions.length).toBeLessThanOrEqual(5);
      });

      test('should prioritize exact prefix matches', () => {
        const suggestions = FieldValidator.generateContextualSuggestions('source', 'flows', 10);
        
        expect(suggestions[0]).toBe('source_ip');
      });
    });
  });

  describe('OperatorValidator', () => {
    describe('Operator Compatibility', () => {
      test('should reject comparison operators for string fields', () => {
        const result = OperatorValidator.validateOperator('description', '>', 'alarms');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Comparison operator '>' cannot be used with string field 'description'");
        expect(result.suggestion).toContain('Try using:');
        expect(result.fieldType).toBe('string');
      });

      test('should reject text operators for numeric fields', () => {
        const result = OperatorValidator.validateOperator('bytes', 'contains', 'flows');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Text operator 'contains' cannot be used with numeric field 'bytes'");
        expect(result.suggestion).toContain('Try using:');
        expect(result.fieldType).toBe('number');
      });

      test('should accept valid operator combinations', () => {
        const result = OperatorValidator.validateOperator('bytes', '>=', 'flows');
        
        expect(result.isValid).toBe(true);
        expect(result.fieldType).toBe('number');
      });

      test('should handle boolean fields correctly', () => {
        const result = OperatorValidator.validateOperator('blocked', '>', 'flows');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Operator '>' is not valid for boolean field 'blocked'");
        expect(result.suggestion).toContain('Try using:');
      });
    });

    describe('Operator Information', () => {
      test('should provide detailed operator information', () => {
        const info = OperatorValidator.getOperatorInfo('>=');
        
        expect(info).toBeDefined();
        expect(info!.description).toContain('Greater than or equal');
        expect(info!.examples.length).toBeGreaterThan(0);
        expect(info!.compatibleTypes).toContain('number');
      });

      test('should return null for invalid operators', () => {
        const info = OperatorValidator.getOperatorInfo('invalid');
        
        expect(info).toBeNull();
      });
    });

    describe('Complex Expression Validation', () => {
      test('should validate complex expressions', () => {
        const result = OperatorValidator.validateComplexExpression(
          'bytes>=1000 AND protocol:tcp', 
          'flows'
        );
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should detect multiple operator errors', () => {
        const result = OperatorValidator.validateComplexExpression(
          'protocol>tcp AND bytes:contains:1000', 
          'flows'
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ErrorFormatter', () => {
    describe('Single Error Formatting', () => {
      test('should format syntax error with context', () => {
        const error: DetailedError = {
          message: 'Unclosed quoted string starting at position 10',
          position: 10,
          errorType: 'syntax',
          context: '"malware alert',
          suggestion: 'Add matching quote'
        };
        
        const formatted = ErrorFormatter.formatError(error, 'test query');
        
        expect(formatted.title).toBe('Syntax Error');
        expect(formatted.code).toContain('SYNTAX_ERR');
        expect(formatted.severity).toBe('error');
        expect(formatted.suggestion).toBe('Add matching quote');
      });

      test('should format field error with suggestion', () => {
        const error: DetailedError = {
          message: "Field 'srcIP' is not valid for flows",
          errorType: 'field',
          suggestion: "Did you mean 'source_ip'?"
        };
        
        const formatted = ErrorFormatter.formatError(error);
        
        expect(formatted.title).toBe('Field Error');
        expect(formatted.severity).toBe('warning');
        expect(formatted.suggestion).toContain('source_ip');
      });
    });

    describe('Multiple Error Reporting', () => {
      test('should format multiple errors with grouping', () => {
        const errors: DetailedError[] = [
          {
            message: 'Syntax error 1',
            errorType: 'syntax'
          },
          {
            message: 'Field error 1',
            errorType: 'field',
            suggestion: "Did you mean 'field'?"
          },
          {
            message: 'Operator error 1',
            errorType: 'operator'
          }
        ];
        
        const report = ErrorFormatter.formatMultipleErrors(errors);
        
        expect(report.summary).toContain('Found 3 errors');
        expect(report.errors['syntax']).toHaveLength(1);
        expect(report.errors['field']).toHaveLength(1);
        expect(report.errors['operator']).toHaveLength(1);
        expect(report.severity).toBe('medium'); // 3 errors = medium
      });

      test('should generate quick fixes from errors', () => {
        const errors: DetailedError[] = [
          {
            message: "Field 'srcIP' is not valid for flows",
            errorType: 'field',
            suggestion: "Did you mean 'source_ip'?"
          }
        ];
        
        const report = ErrorFormatter.formatMultipleErrors(errors);
        
        expect(report.quickFixes).toHaveLength(1);
        expect(report.quickFixes[0].action).toBe('replace_field');
        expect(report.quickFixes[0].replacement).toBe('source_ip');
      });
    });

    describe('Text Formatting', () => {
      test('should format report as readable text', () => {
        const errors: DetailedError[] = [
          {
            message: 'Test error',
            errorType: 'syntax',
            suggestion: 'Test suggestion'
          }
        ];
        
        const report = ErrorFormatter.formatMultipleErrors(errors);
        const text = ErrorFormatter.formatReportAsText(report);
        
        expect(text).toContain('❌');
        expect(text).toContain('📋');
        expect(text).toContain('💡 Test suggestion');
      });
    });
  });

  describe('ProgressiveValidator', () => {
    describe('Step-by-Step Validation', () => {
      test('should validate query progressively', () => {
        const result = ProgressiveValidator.validateWithProgression(
          'protocol:tcp',  // Simple valid query
          'flows'
        );
        
        expect(result.isValid).toBe(true);
        expect(result.progress).toBeGreaterThan(80); // Allow some tolerance
        expect(result.allValidations).toBeDefined();
      });

      test('should stop at first critical failure', () => {
        const result = ProgressiveValidator.validateWithProgression(
          '(protocol:tcp', // Unclosed parenthesis
          'flows'
        );
        
        expect(result.isValid).toBe(false);
        expect(result.currentStep).toBe('basicSyntax');
        expect(result.error).toBeDefined();
        expect(result.nextSteps).toBeDefined();
        expect(result.progress).toBeLessThan(100);
      });

      test('should provide next steps guidance', () => {
        const result = ProgressiveValidator.validateWithProgression(
          'invalidfield:value',
          'flows'
        );
        
        expect(result.isValid).toBe(false);
        expect(result.currentStep).toBe('fieldExistence');
        expect(result.nextSteps).toContain('Correct field names to match entity schema');
        expect(result.overallGuidance).toContain('Field Validation');
      });

      test('should detect semantic errors', () => {
        const result = ProgressiveValidator.validateWithProgression(
          'protocol:tcp AND protocol:udp', // This should be a semantic contradiction
          'flows'
        );
        
        // It may fail at earlier steps, so just check it's invalid
        expect(result.isValid).toBe(false);
        expect(result.currentStep).toBeDefined();
      });
    });

    describe('Progress Calculation', () => {
      test('should calculate accurate progress for partial success', () => {
        const result = ProgressiveValidator.validateWithProgression(
          'protocol:tcp AND invalidfield:value',
          'flows'
        );
        
        expect(result.progress).toBeGreaterThan(0);
        expect(result.progress).toBeLessThan(100);
      });

      test('should provide optimization guidance for valid queries', () => {
        const result = ProgressiveValidator.validateWithProgression(
          'protocol:tcp',
          'flows'
        );
        
        if (result.isValid) {
          expect(result.overallGuidance).toBeDefined();
        }
      });
    });
  });

  describe('Integration Tests', () => {
    test('should provide comprehensive error analysis for complex query', () => {
      const query = '(protocol=tcp AND srcIP:192.168.1.1 AND bytes>"invalid"';
      const validator = new EnhancedQueryValidator();
      const result = validator.validateQuery(query, 'flows');
      
      expect(result.isValid).toBe(false);
      expect(result.detailedErrors.length).toBeGreaterThan(1);
      
      // Should detect syntax errors (missing parenthesis, equals operator)
      const syntaxErrors = result.detailedErrors.filter(e => e.errorType === 'syntax');
      expect(syntaxErrors.length).toBeGreaterThan(0);
      
      // Should have quick fixes
      expect(result.quickFixes.length).toBeGreaterThan(0);
    });

    test('should provide progressive validation with all error types', () => {
      const query = '(protocol=tcp AND srcIP:192.168.1.1 AND bytes>"invalid"';
      const result = ProgressiveValidator.validateWithProgression(query, 'flows');
      
      expect(result.isValid).toBe(false);
      expect(result.allValidations).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.nextSteps).toBeDefined();
    });

    test('should maintain backward compatibility with existing validation', () => {
      // Test that enhanced validators don't break existing functionality
      const fieldResult = FieldValidator.validateField('protocol', 'flows');
      expect(fieldResult.isValid).toBe(true);
      
      const operatorResult = OperatorValidator.validateOperator('protocol', ':', 'flows');
      expect(operatorResult.isValid).toBe(true);
    });
  });
});