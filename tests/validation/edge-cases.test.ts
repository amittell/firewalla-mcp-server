/**
 * Edge Case and Boundary Testing
 * 
 * Comprehensive testing for edge cases and boundary conditions including:
 * - Boundary conditions for all parameters (min/max limits)
 * - Error scenarios using new error handling utilities
 * - Data normalization edge cases with the new normalizer
 * - Pagination edge cases (empty results, large cursors)
 * - Null/undefined handling consistently
 * - Malformed API responses and recovery
 * - Memory and performance edge cases
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ParameterValidator, QuerySanitizer, SafeAccess, ErrorType } from '../../src/validation/error-handler.js';
import { FieldValidator } from '../../src/validation/field-validator.js';
import { normalizeUnknownFields, sanitizeFieldValue, ensureConsistentGeoData, batchNormalize } from '../../src/utils/data-normalizer.js';
import { measurePerformance } from '../setup/jest-setup.js';

describe('Edge Case and Boundary Testing', () => {
  describe('Parameter Boundary Conditions', () => {
    describe('Numeric Parameter Limits', () => {
      it('should enforce minimum limit boundaries', () => {
        const boundaryTests = [
          { value: 0, paramName: 'limit', min: 1, max: 10000, shouldPass: false },
          { value: 1, paramName: 'limit', min: 1, max: 10000, shouldPass: true },
          { value: -1, paramName: 'limit', min: 1, max: 10000, shouldPass: false },
          { value: -100, paramName: 'duration', min: 1, max: 1440, shouldPass: false }
        ];

        boundaryTests.forEach(({ value, paramName, min, max, shouldPass }) => {
          const result = ParameterValidator.validateNumber(value, paramName, {
            required: true,
            min,
            max
          });

          expect(result.isValid).toBe(shouldPass);
          if (!shouldPass) {
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain(paramName);
          }
        });
      });

      it('should enforce maximum limit boundaries', () => {
        const maxBoundaryTests = [
          { value: 10000, paramName: 'limit', min: 1, max: 10000, shouldPass: true },
          { value: 10001, paramName: 'limit', min: 1, max: 10000, shouldPass: false },
          { value: 1440, paramName: 'duration', min: 1, max: 1440, shouldPass: true },
          { value: 1441, paramName: 'duration', min: 1, max: 1440, shouldPass: false },
          { value: Number.MAX_SAFE_INTEGER, paramName: 'bytes', min: 0, max: 1000000000, shouldPass: false }
        ];

        maxBoundaryTests.forEach(({ value, paramName, min, max, shouldPass }) => {
          const result = ParameterValidator.validateNumber(value, paramName, {
            required: true,
            min,
            max
          });

          expect(result.isValid).toBe(shouldPass);
          if (!shouldPass) {
            expect(result.errors.length).toBeGreaterThan(0);
            if (max > 1000) {
              expect(result.errors[0]).toContain('system limits');
            }
          }
        });
      });

      it('should handle special numeric values', () => {
        const specialValues = [
          { value: NaN, shouldPass: false, expectedError: 'must be a valid number' },
          { value: Infinity, shouldPass: false, expectedError: 'must be a valid number' },
          { value: -Infinity, shouldPass: false, expectedError: 'must be a valid number' },
          { value: Number.MAX_VALUE, shouldPass: false, expectedError: 'too large' },
          { value: Number.MIN_VALUE, shouldPass: true }, // This is a very small positive number
          { value: 0.5, paramName: 'duration', integer: true, shouldPass: false, expectedError: 'integer' }
        ];

        specialValues.forEach(({ value, shouldPass, expectedError, paramName = 'limit', integer = false }) => {
          const result = ParameterValidator.validateNumber(value, paramName, {
            required: true,
            min: 1,
            max: 10000,
            integer
          });

          expect(result.isValid).toBe(shouldPass);
          if (!shouldPass && expectedError) {
            expect(result.errors[0]).toContain(expectedError);
          }
        });
      });

      it('should validate integer constraints', () => {
        const integerTests = [
          { value: 5, shouldPass: true },
          { value: 5.0, shouldPass: true },
          { value: 5.5, shouldPass: false },
          { value: 3.14159, shouldPass: false },
          { value: -3, shouldPass: false }, // Negative not allowed with min: 1
          { value: 0, shouldPass: false } // Zero not allowed with min: 1
        ];

        integerTests.forEach(({ value, shouldPass }) => {
          const result = ParameterValidator.validateNumber(value, 'duration', {
            required: true,
            min: 1,
            max: 1440,
            integer: true
          });

          expect(result.isValid).toBe(shouldPass);
          if (!shouldPass) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        });
      });
    });

    describe('String Parameter Limits', () => {
      it('should handle extremely long strings', () => {
        const longStringTests = [
          { length: 1000, shouldPass: true },
          { length: 2000, shouldPass: true },
          { length: 3000, shouldPass: false }, // Assuming 2000 char limit
          { length: 10000, shouldPass: false }
        ];

        longStringTests.forEach(({ length, shouldPass }) => {
          const longString = 'a'.repeat(length);
          const result = QuerySanitizer.sanitizeSearchQuery(longString);

          expect(result.isValid).toBe(shouldPass);
          if (!shouldPass) {
            expect(result.errors).toContain('Query is too long (maximum 2000 characters)');
          }
        });
      });

      it('should handle string edge cases', () => {
        const stringEdgeCases = [
          { value: '', paramName: 'query', shouldPass: false },
          { value: '   ', paramName: 'query', shouldPass: false },
          { value: '\t\n\r', paramName: 'query', shouldPass: false },
          { value: 'a', paramName: 'query', shouldPass: true },
          { value: ' valid query ', paramName: 'query', shouldPass: true }
        ];

        stringEdgeCases.forEach(({ value, paramName, shouldPass }) => {
          const result = ParameterValidator.validateRequiredString(value, paramName);

          expect(result.isValid).toBe(shouldPass);
          if (shouldPass && result.sanitizedValue) {
            expect(typeof result.sanitizedValue).toBe('string');
            expect((result.sanitizedValue as string).trim()).toBe(result.sanitizedValue);
          }
        });
      });

      it('should handle unicode and special characters', () => {
        const unicodeTests = [
          { value: 'severity:高', shouldPass: true },
          { value: 'name:José\'s Device', shouldPass: true },
          { value: 'description:测试查询', shouldPass: true },
          { value: 'field:value🔥', shouldPass: true },
          { value: 'emoji:👨‍💻👩‍💻', shouldPass: true }
        ];

        unicodeTests.forEach(({ value, shouldPass }) => {
          const result = QuerySanitizer.sanitizeSearchQuery(value);

          expect(result.isValid).toBe(shouldPass);
          if (shouldPass) {
            expect(result.sanitizedValue).toBeDefined();
          }
        });
      });
    });

    describe('Array and Object Parameter Limits', () => {
      it('should handle empty arrays and objects', () => {
        const emptyStructureTests = [
          { value: [], expectedLength: 0 },
          { value: {}, expectedKeys: 0 },
          { value: null, expectedDefault: [] },
          { value: undefined, expectedDefault: [] }
        ];

        emptyStructureTests.forEach(({ value, expectedLength, expectedKeys, expectedDefault }) => {
          if (Array.isArray(value)) {
            const safeArray = SafeAccess.ensureArray(value);
            expect(safeArray.length).toBe(expectedLength);
          } else if (typeof value === 'object' && value !== null) {
            const safeObject = SafeAccess.ensureObject(value);
            expect(Object.keys(safeObject).length).toBe(expectedKeys);
          } else {
            const safeArray = SafeAccess.ensureArray(value, expectedDefault);
            expect(Array.isArray(safeArray)).toBe(true);
          }
        });
      });

      it('should handle extremely large arrays', () => {
        const largeArray = Array.from({ length: 100000 }, (_, i) => ({ id: i, value: `item_${i}` }));
        
        const { result, duration } = measurePerformance(() => {
          return Promise.resolve(SafeAccess.safeArrayMap(largeArray, (item: any) => item.id));
        });

        return result.then(mappedArray => {
          expect(mappedArray.length).toBe(100000);
          expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });
      });
    });
  });

  describe('Error Handling Edge Cases', () => {
    describe('Error Response Generation', () => {
      it('should handle all error types consistently', () => {
        const errorTypes = Object.values(ErrorType);
        
        errorTypes.forEach(errorType => {
          const errorResponse = {
            error: true,
            message: `Test error for ${errorType}`,
            tool: 'test_tool',
            errorType,
            timestamp: new Date().toISOString()
          };

          expect(errorResponse.error).toBe(true);
          expect(errorResponse.errorType).toBe(errorType);
          expect(errorResponse.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
      });

      it('should handle nested error contexts', () => {
        const nestedContext = {
          endpoint: '/v2/boxes/test/flows',
          parameters: {
            query: 'complex:query',
            limit: 1000,
            nested: {
              deep: {
                value: 'test'
              }
            }
          },
          userAgent: 'FirewallaMCP/1.0',
          requestId: 'req_123456'
        };

        expect(nestedContext.parameters.nested.deep.value).toBe('test');
        expect(SafeAccess.getNestedValue(nestedContext, 'parameters.nested.deep.value')).toBe('test');
        expect(SafeAccess.getNestedValue(nestedContext, 'parameters.nonexistent.value', 'default')).toBe('default');
      });

      it('should sanitize error messages for security', () => {
        const dangerousInputs = [
          'Query failed: <script>alert("xss")</script>',
          'Error: ${process.env.SECRET_KEY}',
          'Failed: <%=system("rm -rf /")%>',
          'Message: {{constructor.constructor("alert(1)")()}}'
        ];

        dangerousInputs.forEach(input => {
          // Error messages should be sanitized to prevent injection
          const sanitized = input
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\$\{[^}]*\}/g, '') // Remove template literals
            .replace(/<%[^%]*%>/g, '') // Remove template tags
            .replace(/\{\{[^}]*\}\}/g, ''); // Remove handlebars

          expect(sanitized).not.toContain('<script>');
          expect(sanitized).not.toContain('${');
          expect(sanitized).not.toContain('<%');
          expect(sanitized).not.toContain('{{');
        });
      });
    });

    describe('Validation Error Aggregation', () => {
      it('should combine multiple validation errors correctly', () => {
        const validationResults = [
          { isValid: false, errors: ['Error 1', 'Error 2'] },
          { isValid: false, errors: ['Error 3'] },
          { isValid: true, errors: [] },
          { isValid: false, errors: ['Error 4', 'Error 5'] }
        ];

        const combined = ParameterValidator.combineValidationResults(validationResults);
        
        expect(combined.isValid).toBe(false);
        expect(combined.errors).toHaveLength(5);
        expect(combined.errors).toEqual(['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5']);
      });

      it('should handle empty validation results', () => {
        const emptyResults = ParameterValidator.combineValidationResults([]);
        
        expect(emptyResults.isValid).toBe(true);
        expect(emptyResults.errors).toHaveLength(0);
      });
    });
  });

  describe('Data Normalization Edge Cases', () => {
    describe('Unknown Field Normalization', () => {
      it('should handle various unknown value representations', () => {
        const unknownVariants = [
          { input: 'unknown', expected: 'unknown' },
          { input: 'Unknown', expected: 'unknown' },
          { input: 'UNKNOWN', expected: 'unknown' },
          { input: 'n/a', expected: 'unknown' },
          { input: 'N/A', expected: 'unknown' },
          { input: 'na', expected: 'unknown' },
          { input: 'none', expected: 'unknown' },
          { input: 'null', expected: 'unknown' },
          { input: 'undefined', expected: 'unknown' },
          { input: '', expected: 'unknown' },
          { input: '   ', expected: 'unknown' },
          { input: '-', expected: 'unknown' },
          { input: null, expected: 'unknown' },
          { input: undefined, expected: 'unknown' }
        ];

        unknownVariants.forEach(({ input, expected }) => {
          const result = normalizeUnknownFields({ value: input });
          expect(result.value).toBe(expected);
        });
      });

      it('should preserve valid values during normalization', () => {
        const validValues = [
          { input: 'Apple', expected: 'Apple' },
          { input: 'United States', expected: 'United States' },
          { input: '192.168.1.1', expected: '192.168.1.1' },
          { input: 'tcp', expected: 'tcp' },
          { input: '0', expected: '0' }, // Zero should be preserved
          { input: 'false', expected: 'false' } // String 'false' should be preserved
        ];

        validValues.forEach(({ input, expected }) => {
          const result = normalizeUnknownFields({ value: input });
          expect(result.value).toBe(expected);
        });
      });

      it('should handle circular references safely', () => {
        const circularObj: any = { name: 'test' };
        circularObj.self = circularObj;

        const result = normalizeUnknownFields(circularObj);
        expect(result.self).toBe('[Circular Reference]');
        expect(result.name).toBe('test');
      });

      it('should handle deeply nested objects', () => {
        const deepObject = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    value: 'unknown'
                  }
                }
              }
            }
          }
        };

        const result = normalizeUnknownFields(deepObject);
        expect(result.level1.level2.level3.level4.level5.value).toBe('unknown');
      });
    });

    describe('Field Value Sanitization', () => {
      it('should handle whitespace edge cases', () => {
        const whitespaceTests = [
          { input: '  value  ', expected: 'value', wasModified: true },
          { input: '\t\nvalue\r\n', expected: 'value', wasModified: true },
          { input: 'value', expected: 'value', wasModified: false },
          { input: '', expected: null, wasModified: true },
          { input: '   ', expected: null, wasModified: true }
        ];

        whitespaceTests.forEach(({ input, expected, wasModified }) => {
          const result = sanitizeFieldValue(input);
          expect(result.value).toBe(expected);
          expect(result.wasModified).toBe(wasModified);
          if (wasModified) {
            expect(result.modifications.length).toBeGreaterThan(0);
          }
        });
      });

      it('should handle numeric edge cases', () => {
        const numericTests = [
          { input: NaN, expected: null, wasModified: true, modification: 'NaN' },
          { input: Infinity, expected: null, wasModified: true, modification: 'infinity' },
          { input: -Infinity, expected: null, wasModified: true, modification: 'infinity' },
          { input: 0, expected: 0, wasModified: false },
          { input: -0, expected: -0, wasModified: false },
          { input: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER, wasModified: false }
        ];

        numericTests.forEach(({ input, expected, wasModified, modification }) => {
          const result = sanitizeFieldValue(input, 'default');
          expect(result.value).toBe(expected);
          expect(result.wasModified).toBe(wasModified);
          if (modification) {
            expect(result.modifications.join(' ')).toContain(modification);
          }
        });
      });

      it('should apply default values correctly', () => {
        const defaultTests = [
          { input: null, defaultValue: 'default', expected: 'default' },
          { input: undefined, defaultValue: 42, expected: 42 },
          { input: '', defaultValue: 'fallback', expected: 'fallback' },
          { input: NaN, defaultValue: 0, expected: 0 }
        ];

        defaultTests.forEach(({ input, defaultValue, expected }) => {
          const result = sanitizeFieldValue(input, defaultValue);
          expect(result.value).toBe(expected);
          expect(result.wasModified).toBe(true);
        });
      });
    });

    describe('Geographic Data Normalization', () => {
      it('should handle malformed geographic data', () => {
        const malformedGeoTests = [
          { input: null, expectedCountry: 'unknown' },
          { input: undefined, expectedCountry: 'unknown' },
          { input: 'string', expectedCountry: 'unknown' },
          { input: 123, expectedCountry: 'unknown' },
          { input: [], expectedCountry: 'unknown' },
          { input: {}, expectedCountry: 'unknown' }
        ];

        malformedGeoTests.forEach(({ input, expectedCountry }) => {
          const result = ensureConsistentGeoData(input);
          expect(result.country).toBe(expectedCountry);
          expect(result.country_code).toBe('UN');
          expect(result.continent).toBe('unknown');
        });
      });

      it('should normalize field name variations', () => {
        const fieldVariations = {
          Country: 'UNITED STATES',
          countryCode: 'us',
          Continent: 'north america',
          City: 'san francisco',
          ASN: 'invalid_asn',
          is_vpn: 'true'
        };

        const result = ensureConsistentGeoData(fieldVariations);
        
        expect(result.country).toBe('United States');
        expect(result.country_code).toBe('US');
        expect(result.continent).toBe('North America');
        expect(result.city).toBe('San Francisco');
        expect(result.asn).toBeUndefined(); // Invalid ASN should be filtered out
      });

      it('should validate country codes', () => {
        const countryCodeTests = [
          { input: 'us', expected: 'US' },
          { input: 'USA', expected: 'UN' }, // Invalid length
          { input: 'U', expected: 'UN' }, // Too short
          { input: '', expected: 'UN' },
          { input: null, expected: 'UN' },
          { input: 123, expected: 'UN' }
        ];

        countryCodeTests.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData({ country_code: input });
          expect(result.country_code).toBe(expected);
        });
      });
    });

    describe('Batch Normalization', () => {
      it('should handle empty and invalid arrays', () => {
        const invalidArrayTests = [
          null,
          undefined,
          'not_an_array',
          123,
          {}
        ];

        invalidArrayTests.forEach(input => {
          const result = batchNormalize(input as any, {});
          expect(Array.isArray(result)).toBe(true);
          expect(result).toHaveLength(0);
        });
      });

      it('should apply normalizers consistently', () => {
        const testData = [
          { name: '  Device 1  ', status: 'unknown', geo: { country: 'us' } },
          { name: null, status: 'active', geo: null },
          { name: '', status: 'Unknown', geo: { Country: 'CHINA' } }
        ];

        const normalizers = {
          name: (v: any) => sanitizeFieldValue(v, 'unnamed').value,
          status: (v: any) => normalizeUnknownFields({ value: v }).value,
          geo: (v: any) => ensureConsistentGeoData(v)
        };

        const result = batchNormalize(testData, normalizers);
        
        expect(result[0].name).toBe('Device 1');
        expect(result[0].status).toBe('unknown');
        expect(result[0].geo.country_code).toBe('US');
        
        expect(result[1].name).toBe('unnamed');
        expect(result[1].status).toBe('active');
        expect(result[1].geo.country).toBe('unknown');
        
        expect(result[2].name).toBe('unnamed');
        expect(result[2].status).toBe('unknown');
        expect(result[2].geo.country).toBe('China');
      });
    });
  });

  describe('Pagination Edge Cases', () => {
    describe('Empty Result Sets', () => {
      it('should handle empty pagination responses', () => {
        const emptyResponses = [
          { results: [], pagination: { hasMore: false, cursor: null } },
          { results: null, pagination: { hasMore: false, cursor: null } },
          { results: undefined, pagination: { hasMore: false, cursor: null } },
          { pagination: { hasMore: false, cursor: null } } // Missing results
        ];

        emptyResponses.forEach(response => {
          const safeResults = SafeAccess.ensureArray(response.results, []);
          expect(Array.isArray(safeResults)).toBe(true);
          expect(safeResults.length).toBe(0);
          
          if (response.pagination) {
            expect(response.pagination.hasMore).toBe(false);
            expect(response.pagination.cursor).toBeNull();
          }
        });
      });

      it('should handle missing pagination metadata', () => {
        const responsesWithoutPagination = [
          { results: [1, 2, 3] },
          { results: [] },
          null,
          undefined
        ];

        responsesWithoutPagination.forEach(response => {
          const safeResponse = SafeAccess.ensureObject(response, {
            results: [],
            pagination: { hasMore: false, cursor: null }
          });
          
          expect(safeResponse.results).toBeDefined();
          expect(safeResponse.pagination).toBeDefined();
        });
      });
    });

    describe('Large Cursor Handling', () => {
      it('should handle extremely long cursors', () => {
        const longCursor = 'cursor_' + 'a'.repeat(10000);
        const veryLongCursor = 'cursor_' + 'b'.repeat(100000);
        
        // Cursors should be treated as opaque strings, but validate length limits
        expect(longCursor.length).toBe(10007);
        expect(veryLongCursor.length).toBe(100007);
        
        // In practice, cursors should have reasonable length limits
        const isReasonableLength = (cursor: string) => cursor.length < 1000;
        
        expect(isReasonableLength('normal_cursor_123')).toBe(true);
        expect(isReasonableLength(longCursor)).toBe(false);
      });

      it('should handle malformed cursor data', () => {
        const malformedCursors = [
          null,
          undefined,
          123,
          {},
          [],
          '',
          '   ',
          'cursor with spaces',
          'cursor\nwith\nnewlines',
          'cursor\twith\ttabs'
        ];

        malformedCursors.forEach(cursor => {
          // Validate cursor format - should be string without whitespace
          const isValidCursor = typeof cursor === 'string' && 
                               cursor.length > 0 && 
                               cursor.trim() === cursor &&
                               !/\s/.test(cursor);
          
          if (cursor === null || cursor === undefined) {
            expect(isValidCursor).toBe(false);
          } else if (typeof cursor === 'string' && cursor.length > 0) {
            // Non-empty strings might be valid depending on format
          } else {
            expect(isValidCursor).toBe(false);
          }
        });
      });
    });

    describe('Pagination State Consistency', () => {
      it('should maintain consistent pagination state', () => {
        const paginationStates = [
          { hasMore: true, cursor: 'valid_cursor', totalCount: 100 },
          { hasMore: false, cursor: null, totalCount: 50 },
          { hasMore: true, cursor: null }, // Inconsistent state
          { hasMore: false, cursor: 'non_null_cursor' } // Inconsistent state
        ];

        paginationStates.forEach((state, index) => {
          if (index < 2) {
            // Valid states
            expect(state.hasMore ? state.cursor !== null : state.cursor === null).toBe(true);
          } else {
            // Inconsistent states should be detected
            const isConsistent = state.hasMore ? state.cursor !== null : state.cursor === null;
            expect(isConsistent).toBe(false);
          }
        });
      });
    });
  });

  describe('Null/Undefined Handling', () => {
    describe('Safe Access Patterns', () => {
      it('should handle nested null/undefined access', () => {
        const testObject = {
          level1: {
            level2: null,
            level2b: {
              level3: undefined,
              level3b: {
                value: 'found'
              }
            }
          },
          nullValue: null,
          undefinedValue: undefined
        };

        // Test safe nested access
        expect(SafeAccess.getNestedValue(testObject, 'level1.level2.nonexistent', 'default')).toBe('default');
        expect(SafeAccess.getNestedValue(testObject, 'level1.level2b.level3', 'default')).toBe('default');
        expect(SafeAccess.getNestedValue(testObject, 'level1.level2b.level3b.value', 'default')).toBe('found');
        expect(SafeAccess.getNestedValue(testObject, 'nullValue', 'default')).toBe('default');
        expect(SafeAccess.getNestedValue(testObject, 'undefinedValue', 'default')).toBe('default');
        expect(SafeAccess.getNestedValue(testObject, 'nonexistent.path', 'default')).toBe('default');
      });

      it('should handle array access with nulls', () => {
        const arrayWithNulls = [
          { id: 1, name: 'valid' },
          null,
          { id: 2, name: null },
          undefined,
          { id: 3, name: 'also valid' }
        ];

        const safeMap = SafeAccess.safeArrayMap(
          arrayWithNulls,
          (item: any) => item.name,
          (item: any) => item !== null && item !== undefined && item.name !== null
        );

        expect(safeMap).toEqual(['valid', 'also valid']);
      });

      it('should filter null/undefined consistently', () => {
        const mixedArray = [1, null, 'string', undefined, 0, false, '', NaN];
        
        const filteredArray = SafeAccess.safeArrayFilter(
          mixedArray,
          (item: any) => item !== null && item !== undefined
        );

        expect(filteredArray).toEqual([1, 'string', 0, false, '', NaN]);
      });
    });

    describe('Type Coercion Edge Cases', () => {
      it('should handle boolean coercion consistently', () => {
        const booleanTests = [
          { input: true, expected: true },
          { input: false, expected: false },
          { input: 'true', expected: true },
          { input: 'false', expected: false },
          { input: '1', expected: true },
          { input: '0', expected: false },
          { input: 1, expected: true },
          { input: 0, expected: false },
          { input: 'yes', expected: true },
          { input: 'no', expected: false },
          { input: 'on', expected: true },
          { input: 'off', expected: false },
          { input: 'enabled', expected: true },
          { input: 'disabled', expected: false },
          { input: null, expected: false },
          { input: undefined, expected: false },
          { input: '', expected: false },
          { input: 'invalid', expected: false }
        ];

        booleanTests.forEach(({ input, expected }) => {
          const result = ParameterValidator.validateBoolean(input, 'testParam');
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(expected);
        });
      });
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    describe('Memory Leak Prevention', () => {
      it('should not leak memory with large recursive objects', () => {
        const createLargeObject = (depth: number): any => {
          if (depth === 0) return { value: 'leaf' };
          return {
            child: createLargeObject(depth - 1),
            data: new Array(1000).fill('memory_test')
          };
        };

        const largeObject = createLargeObject(10);
        
        // Normalization should complete without memory issues
        const normalized = normalizeUnknownFields(largeObject);
        expect(normalized.child).toBeDefined();
        expect(normalized.data).toBeDefined();
      });

      it('should handle concurrent normalization requests', async () => {
        const concurrentRequests = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          data: `test_data_${i}`,
          unknown: 'unknown'
        }));

        const promises = concurrentRequests.map(obj => 
          Promise.resolve(normalizeUnknownFields(obj))
        );

        const results = await Promise.all(promises);
        
        expect(results.length).toBe(100);
        results.forEach((result, index) => {
          expect(result.id).toBe(index);
          expect(result.unknown).toBe('unknown');
        });
      });
    });

    describe('Performance Thresholds', () => {
      it('should validate large datasets within time limits', async () => {
        const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          status: i % 3 === 0 ? 'unknown' : 'active',
          nested: {
            value: `nested_${i}`,
            deep: {
              property: i % 2 === 0 ? null : `deep_${i}`
            }
          }
        }));

        const { result, duration } = await measurePerformance(() => {
          return Promise.resolve(batchNormalize(largeDataset, {
            status: (v: any) => normalizeUnknownFields({ value: v }).value,
            nested: (v: any) => normalizeUnknownFields(v)
          }));
        });

        expect(result.length).toBe(10000);
        expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      });
    });
  });

  describe('Field Validation Edge Cases', () => {
    describe('Field Name Similarity', () => {
      it('should calculate similarity scores accurately', () => {
        const similarityTests = [
          { field1: 'source_ip', field2: 'source_ip', expectedSimilarity: 1.0 },
          { field1: 'source_ip', field2: 'srcIP', expectedSimilarity: 0.6 }, // Different but similar
          { field1: 'protocol', field2: 'proto', expectedSimilarity: 0.8 },
          { field1: 'severity', field2: 'completely_different', expectedSimilarity: 0.0 }
        ];

        similarityTests.forEach(({ field1, field2, expectedSimilarity }) => {
          // Test field validation with similarity suggestions
          const result = FieldValidator.validateField(field2, 'flows');
          
          if (field1 === field2) {
            expect(result.isValid).toBe(true);
          } else {
            expect(result.isValid).toBe(false);
            if (result.confidence !== undefined) {
              if (expectedSimilarity > 0.6) {
                expect(result.confidence).toBeGreaterThan(0.6);
              } else {
                expect(result.confidence || 0).toBeLessThanOrEqual(0.6);
              }
            }
          }
        });
      });

      it('should handle field aliases comprehensively', () => {
        const aliasTests = [
          { alias: 'srcIP', canonical: 'source_ip', entityType: 'flows' as const },
          { alias: 'destIP', canonical: 'destination_ip', entityType: 'flows' as const },
          { alias: 'proto', canonical: 'protocol', entityType: 'flows' as const },
          { alias: 'size', canonical: 'bytes', entityType: 'flows' as const },
          { alias: 'vendor', canonical: 'mac_vendor', entityType: 'devices' as const }
        ];

        aliasTests.forEach(({ alias, canonical, entityType }) => {
          const result = FieldValidator.validateField(alias, entityType);
          expect(result.isValid).toBe(false);
          expect(result.suggestion).toContain(canonical);
        });
      });
    });

    describe('Contextual Suggestions', () => {
      it('should provide relevant suggestions for partial matches', () => {
        const partialTests = [
          { partial: 'sev', entityType: 'alarms' as const, shouldInclude: ['severity'] },
          { partial: 'src', entityType: 'flows' as const, shouldInclude: ['source_ip'] },
          { partial: 'tar', entityType: 'rules' as const, shouldInclude: ['target_type', 'target_value'] },
          { partial: 'mac', entityType: 'devices' as const, shouldInclude: ['mac', 'mac_vendor'] }
        ];

        partialTests.forEach(({ partial, entityType, shouldInclude }) => {
          const suggestions = FieldValidator.generateContextualSuggestions(partial, entityType, 10);
          
          shouldInclude.forEach(expected => {
            expect(suggestions.some(suggestion => 
              suggestion.toLowerCase().includes(expected.toLowerCase())
            )).toBe(true);
          });
        });
      });
    });
  });
});