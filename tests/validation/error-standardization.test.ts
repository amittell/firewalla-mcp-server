/**
 * Comprehensive tests for standardized error handling and validation edge cases
 * Ensures consistent error response format across all tools and parameter types
 */

import { 
  ParameterValidator, 
  SafeAccess, 
  ErrorType, 
  createErrorResponse 
} from '../../src/validation/error-handler.js';

describe('Error Response Standardization', () => {
  describe('Null Parameter Handling', () => {
    describe('validateRequiredString', () => {
      test('should handle null input', () => {
        const result = ParameterValidator.validateRequiredString(null, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam is required');
      });

      test('should handle undefined input', () => {
        const result = ParameterValidator.validateRequiredString(undefined, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam is required');
      });

      test('should handle empty string after trimming', () => {
        const result = ParameterValidator.validateRequiredString('   ', 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam cannot be empty');
      });

      test('should handle non-string types', () => {
        const result = ParameterValidator.validateRequiredString(123, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a string, got number');
      });

      test('should handle array input', () => {
        const result = ParameterValidator.validateRequiredString(['test'], 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a string, got array');
      });

      test('should handle object input', () => {
        const result = ParameterValidator.validateRequiredString({}, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/testParam must be a string, got \[object Object\]/);
      });

      test('should handle boolean input', () => {
        const result = ParameterValidator.validateRequiredString(true, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a string, got boolean');
      });
    });

    describe('validateOptionalString', () => {
      test('should accept null as valid optional', () => {
        const result = ParameterValidator.validateOptionalString(null, 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should accept undefined as valid optional', () => {
        const result = ParameterValidator.validateOptionalString(undefined, 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should convert empty string to undefined', () => {
        const result = ParameterValidator.validateOptionalString('   ', 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should reject non-string types', () => {
        const result = ParameterValidator.validateOptionalString(123, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a string if provided, got number');
      });
    });

    describe('validateNumber', () => {
      test('should handle null for required number', () => {
        const result = ParameterValidator.validateNumber(null, 'testParam', { required: true });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam is required');
      });

      test('should handle undefined for required number', () => {
        const result = ParameterValidator.validateNumber(undefined, 'testParam', { required: true });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam is required');
      });

      test('should handle null for optional number with default', () => {
        const result = ParameterValidator.validateNumber(null, 'testParam', { 
          required: false, 
          defaultValue: 42 
        });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42);
      });

      test('should reject empty string input', () => {
        const result = ParameterValidator.validateNumber('', 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam cannot be empty string');
      });

      test('should reject boolean input', () => {
        const result = ParameterValidator.validateNumber(true, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a number, got boolean');
      });

      test('should reject array input', () => {
        const result = ParameterValidator.validateNumber([123], 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a number, got array');
      });

      test('should reject object input', () => {
        const result = ParameterValidator.validateNumber({}, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/testParam must be a number, got \[object Object\]/);
      });

      test('should handle NaN string conversion', () => {
        const result = ParameterValidator.validateNumber('invalid', 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a valid number');
      });

      test('should handle Infinity', () => {
        const result = ParameterValidator.validateNumber(Infinity, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam cannot be infinite');
      });

      test('should handle -Infinity', () => {
        const result = ParameterValidator.validateNumber(-Infinity, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam cannot be infinite');
      });
    });

    describe('validateBoolean', () => {
      test('should handle null input', () => {
        const result = ParameterValidator.validateBoolean(null, 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle undefined input', () => {
        const result = ParameterValidator.validateBoolean(undefined, 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle null with default value', () => {
        const result = ParameterValidator.validateBoolean(null, 'testParam', true);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(true);
      });

      test('should handle valid string representations', () => {
        expect(ParameterValidator.validateBoolean('true', 'test').sanitizedValue).toBe(true);
        expect(ParameterValidator.validateBoolean('false', 'test').sanitizedValue).toBe(false);
        expect(ParameterValidator.validateBoolean('1', 'test').sanitizedValue).toBe(true);
        expect(ParameterValidator.validateBoolean('0', 'test').sanitizedValue).toBe(false);
        expect(ParameterValidator.validateBoolean('TRUE', 'test').sanitizedValue).toBe(true);
        expect(ParameterValidator.validateBoolean('FALSE', 'test').sanitizedValue).toBe(false);
      });

      test('should reject empty string', () => {
        const result = ParameterValidator.validateBoolean('', 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam cannot be empty string');
      });

      test('should reject invalid string values', () => {
        const result = ParameterValidator.validateBoolean('maybe', 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("testParam must be 'true', 'false', '1', or '0', got 'maybe'");
      });

      test('should reject number input', () => {
        const result = ParameterValidator.validateBoolean(123, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a boolean value, got number');
      });

      test('should reject array input', () => {
        const result = ParameterValidator.validateBoolean([true], 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('testParam must be a boolean, got array');
      });

      test('should reject object input', () => {
        const result = ParameterValidator.validateBoolean({}, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/testParam must be a boolean, got \[object Object\]/);
      });
    });
  });

  describe('Enum Validation Failures', () => {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const validPeriods = ['1h', '24h', '7d', '30d'];

    describe('validateEnum', () => {
      test('should handle null for required enum', () => {
        const result = ParameterValidator.validateEnum(null, 'severity', validSeverities, true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('severity is required');
      });

      test('should handle undefined for required enum', () => {
        const result = ParameterValidator.validateEnum(undefined, 'severity', validSeverities, true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('severity is required');
      });

      test('should handle null for optional enum', () => {
        const result = ParameterValidator.validateEnum(null, 'severity', validSeverities, false);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle empty string for required enum', () => {
        const result = ParameterValidator.validateEnum('', 'severity', validSeverities, true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('severity cannot be empty');
      });

      test('should handle empty string for optional enum', () => {
        const result = ParameterValidator.validateEnum('  ', 'severity', validSeverities, false);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should reject invalid severity values', () => {
        const result = ParameterValidator.validateEnum('extreme', 'severity', validSeverities);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("severity must be one of: low, medium, high, critical, got 'extreme'");
      });

      test('should reject invalid period values', () => {
        const result = ParameterValidator.validateEnum('1y', 'period', validPeriods);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("period must be one of: 1h, 24h, 7d, 30d, got '1y'");
      });

      test('should handle case sensitivity', () => {
        const result = ParameterValidator.validateEnum('HIGH', 'severity', validSeverities);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("severity must be one of: low, medium, high, critical, got 'HIGH'");
      });

      test('should reject non-string enum values', () => {
        const result = ParameterValidator.validateEnum(123, 'severity', validSeverities);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('severity must be a string, got number');
      });

      test('should reject array input', () => {
        const result = ParameterValidator.validateEnum(['high'], 'severity', validSeverities);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('severity must be a string, got array');
      });

      test('should reject object input', () => {
        const result = ParameterValidator.validateEnum({}, 'severity', validSeverities);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/severity must be a string, got \[object Object\]/);
      });

      test('should handle empty allowed values array', () => {
        const result = ParameterValidator.validateEnum('test', 'param', []);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('param has no valid options defined');
      });

      test('should handle null allowed values array', () => {
        const result = ParameterValidator.validateEnum('test', 'param', null as any);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('param has no valid options defined');
      });
    });
  });

  describe('Edge Cases for Special Validators', () => {
    describe('validateDateFormat', () => {
      test('should handle null for required date', () => {
        const result = ParameterValidator.validateDateFormat(null, 'timestamp', true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('timestamp is required');
      });

      test('should handle undefined for required date', () => {
        const result = ParameterValidator.validateDateFormat(undefined, 'timestamp', true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('timestamp is required');
      });

      test('should handle null for optional date', () => {
        const result = ParameterValidator.validateDateFormat(null, 'timestamp', false);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle empty string for required date', () => {
        const result = ParameterValidator.validateDateFormat('', 'timestamp', true);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('timestamp cannot be empty');
      });

      test('should handle empty string for optional date', () => {
        const result = ParameterValidator.validateDateFormat('  ', 'timestamp', false);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should reject non-string input', () => {
        const result = ParameterValidator.validateDateFormat(123456789, 'timestamp');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('timestamp must be a string in ISO 8601 format (e.g., "2024-01-01T00:00:00Z")');
      });

      test('should reject invalid date strings', () => {
        const result = ParameterValidator.validateDateFormat('not-a-date', 'timestamp');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('timestamp must be a valid ISO 8601 date string');
        expect(result.errors[1]).toContain('Examples:');
        expect(result.errors[2]).toContain('Received: "not-a-date"');
      });

      test('should reject date without time component', () => {
        const result = ParameterValidator.validateDateFormat('2024-01-01', 'timestamp');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('timestamp must include time component in ISO 8601 format');
        expect(result.errors[1]).toContain('Use format: "YYYY-MM-DDTHH:mm:ssZ"');
      });

      test('should accept valid ISO 8601 dates', () => {
        const validDates = [
          '2024-01-01T00:00:00Z',
          '2024-01-01T12:30:45+05:00',
          '2024-12-31 23:59:59'
        ];

        validDates.forEach(date => {
          const result = ParameterValidator.validateDateFormat(date, 'timestamp');
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(date);
        });
      });
    });

    describe('validateRuleId', () => {
      test('should handle null input', () => {
        const result = ParameterValidator.validateRuleId(null, 'rule_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('rule_id is required');
      });

      test('should handle undefined input', () => {
        const result = ParameterValidator.validateRuleId(undefined, 'rule_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('rule_id is required');
      });

      test('should reject empty string', () => {
        const result = ParameterValidator.validateRuleId('', 'rule_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('rule_id cannot be empty');
      });

      test('should reject non-string input', () => {
        const result = ParameterValidator.validateRuleId(123, 'rule_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('rule_id must be a string, got number');
      });

      test('should reject invalid format', () => {
        const result = ParameterValidator.validateRuleId('invalid!@#', 'rule_id');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('rule_id must be a valid rule identifier');
        expect(result.errors[1]).toContain('Rule IDs should be UUID format or alphanumeric string');
        expect(result.errors[3]).toContain('Received: "invalid!@#"');
      });

      test('should accept valid rule ID formats', () => {
        const validIds = [
          '550e8400-e29b-41d4-a716-446655440000',
          'rule_block_facebook',
          'abc123def456',
          'RULE_ALLOW_SSH_12345'
        ];

        validIds.forEach(id => {
          const result = ParameterValidator.validateRuleId(id, 'rule_id');
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(id);
        });
      });
    });

    describe('validateAlarmId', () => {
      test('should handle null input', () => {
        const result = ParameterValidator.validateAlarmId(null, 'alarm_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('alarm_id is required');
      });

      test('should handle undefined input', () => {
        const result = ParameterValidator.validateAlarmId(undefined, 'alarm_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('alarm_id is required');
      });

      test('should reject empty string', () => {
        const result = ParameterValidator.validateAlarmId('', 'alarm_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('alarm_id cannot be empty');
      });

      test('should reject non-string input', () => {
        const result = ParameterValidator.validateAlarmId(123, 'alarm_id');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('alarm_id must be a string, got number');
      });

      test('should reject invalid format', () => {
        const result = ParameterValidator.validateAlarmId('invalid!@#$%', 'alarm_id');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('alarm_id must be a valid alarm identifier');
        expect(result.errors[1]).toContain('Alarm IDs should be numeric, UUID format, or alphanumeric string');
        expect(result.errors[3]).toContain('Received: "invalid!@#$%"');
      });

      test('should accept valid alarm ID formats', () => {
        const validIds = [
          '12345',
          'alarm_intrusion_001',
          '550e8400-e29b-41d4-a716-446655440000',
          'a1b2c3d4'
        ];

        validIds.forEach(id => {
          const result = ParameterValidator.validateAlarmId(id, 'alarm_id');
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(id);
        });
      });
    });

    describe('validateCursor', () => {
      test('should handle null input', () => {
        const result = ParameterValidator.validateCursor(null, 'cursor');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle undefined input', () => {
        const result = ParameterValidator.validateCursor(undefined, 'cursor');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should handle empty string', () => {
        const result = ParameterValidator.validateCursor('', 'cursor');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(undefined);
      });

      test('should reject non-string input', () => {
        const result = ParameterValidator.validateCursor(123, 'cursor');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('cursor must be a string');
      });

      test('should reject invalid cursor format', () => {
        const result = ParameterValidator.validateCursor('invalid!@#$%^&*()', 'cursor');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('cursor must be a valid pagination cursor');
        expect(result.errors[1]).toContain('Cursors should be base64 encoded strings');
        expect(result.errors[3]).toContain('Received: "invalid!@#$%^&*()"');
      });

      test('should reject extremely long cursors', () => {
        const longCursor = 'a'.repeat(1001);
        const result = ParameterValidator.validateCursor(longCursor, 'cursor');
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('cursor is too long (1001 characters)');
        expect(result.errors[1]).toContain('Pagination cursors should be less than 1000 characters');
      });

      test('should accept valid cursor formats', () => {
        const validCursors = [
          'eyJpZCI6MTIzfQ==',
          'cursor_abc123',
          '12345',
          'YWJjZGVmZ2hpams='
        ];

        validCursors.forEach(cursor => {
          const result = ParameterValidator.validateCursor(cursor, 'cursor');
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(cursor);
        });
      });
    });
  });

  describe('SafeAccess Null Safety', () => {
    describe('getNestedValue', () => {
      test('should handle null object', () => {
        const result = SafeAccess.getNestedValue(null, 'path', 'default');
        expect(result).toBe('default');
      });

      test('should handle undefined object', () => {
        const result = SafeAccess.getNestedValue(undefined, 'path', 'default');
        expect(result).toBe('default');
      });

      test('should handle non-object input', () => {
        const result = SafeAccess.getNestedValue('string' as any, 'path', 'default');
        expect(result).toBe('default');
      });

      test('should handle array input', () => {
        const result = SafeAccess.getNestedValue(['test'] as any, 'path', 'default');
        expect(result).toBe('default');
      });

      test('should handle empty path', () => {
        const result = SafeAccess.getNestedValue({ test: 'value' }, '', 'default');
        expect(result).toBe('default');
      });

      test('should handle null path', () => {
        const result = SafeAccess.getNestedValue({ test: 'value' }, null as any, 'default');
        expect(result).toBe('default');
      });

      test('should handle missing nested property', () => {
        const result = SafeAccess.getNestedValue({ a: { b: 'value' } }, 'a.c.d', 'default');
        expect(result).toBe('default');
      });

      test('should handle null intermediate value', () => {
        const result = SafeAccess.getNestedValue({ a: null }, 'a.b', 'default');
        expect(result).toBe('default');
      });
    });

    describe('ensureArray', () => {
      test('should handle null input', () => {
        const result = SafeAccess.ensureArray(null);
        expect(result).toEqual([]);
      });

      test('should handle undefined input', () => {
        const result = SafeAccess.ensureArray(undefined);
        expect(result).toEqual([]);
      });

      test('should handle non-array input', () => {
        const result = SafeAccess.ensureArray('string');
        expect(result).toEqual([]);
      });

      test('should return valid arrays unchanged', () => {
        const input = [1, 2, 3];
        const result = SafeAccess.ensureArray(input);
        expect(result).toBe(input);
      });

      test('should use custom default value', () => {
        const defaultArray = ['default'];
        const result = SafeAccess.ensureArray(null, defaultArray);
        expect(result).toBe(defaultArray);
      });
    });

    describe('ensureObject', () => {
      test('should handle null input', () => {
        const result = SafeAccess.ensureObject(null);
        expect(result).toEqual({});
      });

      test('should handle undefined input', () => {
        const result = SafeAccess.ensureObject(undefined);
        expect(result).toEqual({});
      });

      test('should handle array input', () => {
        const result = SafeAccess.ensureObject([1, 2, 3]);
        expect(result).toEqual({});
      });

      test('should handle primitive input', () => {
        const result = SafeAccess.ensureObject('string');
        expect(result).toEqual({});
      });

      test('should handle complex objects (Date, RegExp)', () => {
        const result = SafeAccess.ensureObject(new Date());
        expect(result).toEqual({});
      });

      test('should return plain objects unchanged', () => {
        const input = { test: 'value' };
        const result = SafeAccess.ensureObject(input);
        expect(result).toBe(input);
      });
    });
  });

  describe('Error Response Format Consistency', () => {
    test('should create standardized error response with validation errors', () => {
      const response = createErrorResponse(
        'test_tool',
        'Validation failed',
        ErrorType.VALIDATION_ERROR,
        { field: 'test' },
        ['Field is required', 'Field must be valid']
      );

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      
      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.error).toBe(true);
      expect(errorData.tool).toBe('test_tool');
      expect(errorData.message).toBe('Validation failed');
      expect(errorData.errorType).toBe('validation_error');
      expect(errorData.details).toEqual({ field: 'test' });
      expect(errorData.validation_errors).toEqual(['Field is required', 'Field must be valid']);
      expect(errorData.timestamp).toBeDefined();
    });

    test('should create standardized API error response', () => {
      const response = createErrorResponse(
        'test_tool',
        'API request failed',
        ErrorType.API_ERROR,
        { status: 500 }
      );

      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.errorType).toBe('api_error');
      expect(errorData.details).toEqual({ status: 500 });
      expect(errorData.validation_errors).toBeUndefined();
    });

    test('should create standardized timeout error response', () => {
      const response = createErrorResponse(
        'test_tool',
        'Operation timed out',
        ErrorType.TIMEOUT_ERROR,
        { duration: 30000 }
      );

      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.errorType).toBe('timeout_error');
      expect(errorData.details).toEqual({ duration: 30000 });
    });

    test('should create standardized unknown error response', () => {
      const response = createErrorResponse(
        'test_tool',
        'An unexpected error occurred',
        ErrorType.UNKNOWN_ERROR
      );

      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.errorType).toBe('unknown_error');
      expect(errorData.details).toBeUndefined();
    });

    test('should handle context information in error response', () => {
      const context = {
        endpoint: '/api/test',
        parameters: { id: 123 },
        userAgent: 'test-client',
        requestId: 'req-123'
      };

      const response = createErrorResponse(
        'test_tool',
        'Request failed',
        ErrorType.API_ERROR,
        undefined,
        undefined,
        context
      );

      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.context).toEqual(context);
    });
  });
});