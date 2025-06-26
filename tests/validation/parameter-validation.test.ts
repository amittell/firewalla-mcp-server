/**
 * Comprehensive unit tests for parameter validation edge cases
 * Tests boundary conditions, error handling, and validation consistency
 */

import { ParameterValidator } from '../../src/validation/error-handler.js';

describe('Parameter Validation - Boundary Cases', () => {
  describe('validateNumber', () => {
    describe('Boundary Value Testing', () => {
      test('should accept minimum valid value', () => {
        const result = ParameterValidator.validateNumber(1, 'test', { min: 1, max: 100 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(1);
      });

      test('should accept maximum valid value', () => {
        const result = ParameterValidator.validateNumber(100, 'test', { min: 1, max: 100 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(100);
      });

      test('should reject value below minimum', () => {
        const result = ParameterValidator.validateNumber(0, 'test', { min: 1, max: 100 });
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/test must be a positive number.*got 0.*minimum: 1/);
      });

      test('should reject value above maximum', () => {
        const result = ParameterValidator.validateNumber(101, 'test', { min: 1, max: 100 });
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/test is too large.*got 101.*maximum: 100/);
      });

      test('should handle negative minimum values', () => {
        const result = ParameterValidator.validateNumber(-5, 'test', { min: -10, max: 0 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(-5);
      });

      test('should handle zero as valid value', () => {
        const result = ParameterValidator.validateNumber(0, 'test', { min: 0, max: 100 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(0);
      });
    });

    describe('Integer Validation', () => {
      test('should accept valid integer', () => {
        const result = ParameterValidator.validateNumber(42, 'test', { integer: true });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42);
      });

      test('should reject float when integer required', () => {
        const result = ParameterValidator.validateNumber(42.5, 'test', { integer: true });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test must be an integer');
      });

      test('should accept float when integer not required', () => {
        const result = ParameterValidator.validateNumber(42.5, 'test', {});
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42.5);
      });
    });

    describe('Type Edge Cases', () => {
      test('should handle string numbers', () => {
        const result = ParameterValidator.validateNumber('42', 'test', {});
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42);
      });

      test('should reject non-numeric strings', () => {
        const result = ParameterValidator.validateNumber('abc', 'test', {});
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test must be a valid number');
      });

      test('should handle empty string as zero', () => {
        const result = ParameterValidator.validateNumber('', 'test', {});
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(0);
      });

      test('should handle boolean true as 1', () => {
        const result = ParameterValidator.validateNumber(true, 'test', {});
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(1);
      });

      test('should reject object values as NaN', () => {
        const result = ParameterValidator.validateNumber({}, 'test', {});
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test must be a valid number');
      });

      test('should reject array values as NaN', () => {
        const result = ParameterValidator.validateNumber([1, 2], 'test', {});
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test must be a valid number');
      });

      test('should handle NaN input', () => {
        const result = ParameterValidator.validateNumber(NaN, 'test', {});
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test must be a valid number');
      });

      test('should handle Infinity input', () => {
        const result = ParameterValidator.validateNumber(Infinity, 'test', {});
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(Infinity);
      });
    });

    describe('Default Value Handling', () => {
      test('should use default value when undefined', () => {
        const result = ParameterValidator.validateNumber(undefined, 'test', { defaultValue: 42 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42);
      });

      test('should use default value when null', () => {
        const result = ParameterValidator.validateNumber(null, 'test', { defaultValue: 42 });
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(42);
      });

      test('should validate default value against constraints', () => {
        const result = ParameterValidator.validateNumber(undefined, 'test', { 
          defaultValue: 200, min: 1, max: 100 
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test default value 200 must be at most 100');
      });
    });

    describe('Required Parameter Handling', () => {
      test('should reject undefined when required', () => {
        const result = ParameterValidator.validateNumber(undefined, 'test', { required: true });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test is required');
      });

      test('should reject null when required', () => {
        const result = ParameterValidator.validateNumber(null, 'test', { required: true });
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('test is required');
      });
    });
  });

  describe('validateEnum', () => {
    const validValues = ['option1', 'option2', 'option3'];

    test('should accept valid enum value', () => {
      const result = ParameterValidator.validateEnum('option1', 'test', validValues);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('option1');
    });

    test('should reject invalid enum value', () => {
      const result = ParameterValidator.validateEnum('invalid', 'test', validValues);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/test must be one of: option1, option2, option3.*got 'invalid'/);
    });

    test('should handle case sensitivity', () => {
      const result = ParameterValidator.validateEnum('OPTION1', 'test', validValues);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/test must be one of: option1, option2, option3.*got 'OPTION1'/);
    });

    test('should use default value when undefined', () => {
      const result = ParameterValidator.validateEnum(undefined, 'test', validValues, false, 'option2');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('option2');
    });

    test('should reject when required but undefined', () => {
      const result = ParameterValidator.validateEnum(undefined, 'test', validValues, true);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('test is required');
    });

    test('should handle empty allowed values array', () => {
      const result = ParameterValidator.validateEnum('anything', 'test', []);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/test must be one of: .*got 'anything'/);
    });

    test('should handle non-string input', () => {
      const result = ParameterValidator.validateEnum(123, 'test', validValues);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('test must be a string');
    });
  });

  describe('validateBoolean', () => {
    test('should accept true boolean', () => {
      const result = ParameterValidator.validateBoolean(true, 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });

    test('should accept false boolean', () => {
      const result = ParameterValidator.validateBoolean(false, 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(false);
    });

    test('should handle string "true"', () => {
      const result = ParameterValidator.validateBoolean('true', 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });

    test('should handle string "false"', () => {
      const result = ParameterValidator.validateBoolean('false', 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(false);
    });

    test('should handle string "1"', () => {
      const result = ParameterValidator.validateBoolean('1', 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });

    test('should handle string "0"', () => {
      const result = ParameterValidator.validateBoolean('0', 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(false);
    });

    test('should handle case insensitive strings', () => {
      const result = ParameterValidator.validateBoolean('TRUE', 'test');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });

    test('should reject invalid string', () => {
      const result = ParameterValidator.validateBoolean('maybe', 'test');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('test must be a boolean value');
    });

    test('should reject number input', () => {
      const result = ParameterValidator.validateBoolean(1, 'test');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('test must be a boolean value');
    });

    test('should use default value when undefined', () => {
      const result = ParameterValidator.validateBoolean(undefined, 'test', true);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });
  });

  describe('validateRequiredString', () => {
    test('should accept valid string', () => {
      const result = ParameterValidator.validateRequiredString('test', 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('test');
    });

    test('should trim whitespace', () => {
      const result = ParameterValidator.validateRequiredString('  test  ', 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('test');
    });

    test('should reject empty string', () => {
      const result = ParameterValidator.validateRequiredString('', 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param cannot be empty');
    });

    test('should reject whitespace-only string', () => {
      const result = ParameterValidator.validateRequiredString('   ', 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param cannot be empty');
    });

    test('should reject undefined', () => {
      const result = ParameterValidator.validateRequiredString(undefined, 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param is required');
    });

    test('should reject null', () => {
      const result = ParameterValidator.validateRequiredString(null, 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param is required');
    });

    test('should reject non-string input', () => {
      const result = ParameterValidator.validateRequiredString(123, 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param must be a string, got number');
    });
  });

  describe('validateOptionalString', () => {
    test('should accept valid string', () => {
      const result = ParameterValidator.validateOptionalString('test', 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('test');
    });

    test('should accept undefined', () => {
      const result = ParameterValidator.validateOptionalString(undefined, 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(undefined);
    });

    test('should accept null', () => {
      const result = ParameterValidator.validateOptionalString(null, 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(undefined);
    });

    test('should reject non-string when provided', () => {
      const result = ParameterValidator.validateOptionalString(123, 'param');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('param must be a string if provided, got number');
    });

    test('should trim valid string', () => {
      const result = ParameterValidator.validateOptionalString('  test  ', 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('test');
    });
  });

  describe('combineValidationResults', () => {
    test('should combine valid results', () => {
      const results = [
        { isValid: true, errors: [], sanitizedValue: 'test1' },
        { isValid: true, errors: [], sanitizedValue: 'test2' }
      ];
      const combined = ParameterValidator.combineValidationResults(results);
      expect(combined.isValid).toBe(true);
      expect(combined.errors).toHaveLength(0);
    });

    test('should combine invalid results', () => {
      const results = [
        { isValid: false, errors: ['Error 1'] },
        { isValid: false, errors: ['Error 2'] }
      ];
      const combined = ParameterValidator.combineValidationResults(results);
      expect(combined.isValid).toBe(false);
      expect(combined.errors).toEqual(['Error 1', 'Error 2']);
    });

    test('should combine mixed results', () => {
      const results = [
        { isValid: true, errors: [], sanitizedValue: 'test' },
        { isValid: false, errors: ['Error 1'] }
      ];
      const combined = ParameterValidator.combineValidationResults(results);
      expect(combined.isValid).toBe(false);
      expect(combined.errors).toEqual(['Error 1']);
    });

    test('should handle empty results array', () => {
      const combined = ParameterValidator.combineValidationResults([]);
      expect(combined.isValid).toBe(true);
      expect(combined.errors).toHaveLength(0);
    });
  });

  describe('Edge Case Scenarios', () => {
    test('should handle very long parameter names', () => {
      const longName = 'a'.repeat(1000);
      const result = ParameterValidator.validateNumber('invalid', longName, {});
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain(longName);
    });

    test('should handle special characters in parameter names', () => {
      const specialName = 'param-with_special.chars@#$';
      const result = ParameterValidator.validateNumber(42, specialName, {});
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(42);
    });

    test('should handle Unicode in string validation', () => {
      const unicodeString = '测试字符串🚀';
      const result = ParameterValidator.validateRequiredString(unicodeString, 'param');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(unicodeString);
    });

    test('should handle very large numbers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER;
      const result = ParameterValidator.validateNumber(largeNumber, 'param', {});
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(largeNumber);
    });

    test('should handle very small numbers', () => {
      const smallNumber = Number.MIN_SAFE_INTEGER;
      const result = ParameterValidator.validateNumber(smallNumber, 'param', {});
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(smallNumber);
    });
  });
});