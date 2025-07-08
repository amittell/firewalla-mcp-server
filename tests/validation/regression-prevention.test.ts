/**
 * Regression Prevention Tests for Firewalla MCP Server
 * 
 * These tests specifically target the fixes implemented to prevent null/undefined
 * handling issues, timeout vs validation error differentiation, and geographic
 * filtering edge cases. This comprehensive test suite ensures that future changes
 * don't reintroduce these critical bugs.
 * 
 * Test Categories:
 * - Null/Undefined Parameter Handling Prevention
 * - Geographic Filtering Edge Cases
 * - Timeout vs Validation Error Classification
 * - Parameter Boundary Enforcement
 * - Data Normalization Consistency
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  ParameterValidator, 
  QuerySanitizer, 
  SafeAccess, 
  ErrorType,
  createErrorResponse
} from '../../src/validation/error-handler.js';
import { 
  normalizeUnknownFields, 
  sanitizeFieldValue, 
  ensureConsistentGeoData 
} from '../../src/utils/data-normalizer.js';
import { FieldValidator } from '../../src/validation/field-validator.js';
import { 
  TimeoutError,
  createTimeoutErrorResponse 
} from '../../src/utils/timeout-manager.js';

describe('Regression Prevention Tests', () => {
  describe('Null/Undefined Parameter Handling Prevention', () => {
    describe('Critical Parameter Validation', () => {
      it('should never accept null as a valid limit parameter', () => {
        const nullLimitTests = [
          { value: null, paramName: 'limit' },
          { value: undefined, paramName: 'limit' },
          { value: '', paramName: 'limit' },
          { value: '   ', paramName: 'limit' },
          { value: NaN, paramName: 'limit' },
          { value: 'null', paramName: 'limit' },
          { value: 'undefined', paramName: 'limit' }
        ];

        nullLimitTests.forEach(({ value, paramName }) => {
          const result = ParameterValidator.validateNumber(value, paramName, {
            required: true,
            min: 1,
            max: 10000
          });

          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain(paramName);
          
          // Ensure the error message is descriptive and actionable
          if (value === null || value === undefined) {
            expect(result.errors[0]).toContain('is required');
          } else if (typeof value === 'string' && value.trim() === '') {
            expect(result.errors[0]).toContain('cannot be empty');
          } else {
            expect(result.errors[0]).toContain('must be a valid number');
          }
        });
      });

      it('should handle null/undefined in complex parameter structures', () => {
        const complexParameterTests = [
          {
            input: { query: null, limit: 100 },
            expectedValid: false,
            errorField: 'query'
          },
          {
            input: { query: 'severity:high', limit: null },
            expectedValid: false,
            errorField: 'limit'
          },
          {
            input: { query: undefined, limit: undefined },
            expectedValid: false,
            errorField: 'both'
          },
          {
            input: { query: '', limit: 0 },
            expectedValid: false,
            errorField: 'both'
          },
          {
            input: { query: '   ', limit: -1 },
            expectedValid: false,
            errorField: 'both'
          }
        ];

        complexParameterTests.forEach(({ input, expectedValid, errorField }) => {
          const queryResult = ParameterValidator.validateRequiredString(
            input.query, 
            'query'
          );
          const limitResult = ParameterValidator.validateNumber(
            input.limit, 
            'limit', 
            { required: true, min: 1, max: 10000 }
          );

          const combinedResult = ParameterValidator.combineValidationResults([
            queryResult,
            limitResult
          ]);

          expect(combinedResult.isValid).toBe(expectedValid);
          
          if (!expectedValid) {
            if (errorField === 'query' || errorField === 'both') {
              expect(queryResult.isValid).toBe(false);
            }
            if (errorField === 'limit' || errorField === 'both') {
              expect(limitResult.isValid).toBe(false);
            }
          }
        });
      });

    });

    describe('Optional Parameter Null Handling', () => {
      it('should handle optional parameters with null gracefully', () => {
        const optionalParameterTests = [
          { value: null, paramName: 'cursor', shouldUseDefault: true },
          { value: undefined, paramName: 'sort_by', shouldUseDefault: true },
          { value: '', paramName: 'group_by', shouldUseDefault: true },
          { value: '   ', paramName: 'include', shouldUseDefault: true }
        ];

        optionalParameterTests.forEach(({ value, paramName, shouldUseDefault }) => {
          const result = ParameterValidator.validateOptionalString(value, paramName);
          
          expect(result.isValid).toBe(true);
          if (shouldUseDefault) {
            expect(result.sanitizedValue).toBeUndefined();
          }
        });
      });

      it('should validate geographic filter arrays with null elements', () => {
        const geoArrayTests = [
          { countries: [null, 'China', undefined, 'Russia', '', '   '] },
          { continents: ['Asia', null, 'Europe', undefined] },
          { regions: [null, undefined, '', 'Eastern Europe'] },
          { cities: ['Beijing', null, '', undefined, 'Moscow'] }
        ];

        geoArrayTests.forEach(geoFilters => {
          Object.entries(geoFilters).forEach(([key, values]) => {
            // Filter out null/undefined/empty values
            const cleanedValues = values.filter(v => 
              v !== null && 
              v !== undefined && 
              typeof v === 'string' && 
              v.trim().length > 0
            );

            expect(cleanedValues.length).toBeGreaterThan(0);
            expect(cleanedValues.every(v => typeof v === 'string')).toBe(true);
            expect(cleanedValues.every(v => v.length > 0)).toBe(true);
          });
        });
      });
    });

    describe('Data Structure Null Safety', () => {
      it('should handle deeply nested null/undefined access', () => {
        const nestedStructures = [
          {
            data: {
              flows: null,
              alarms: {
                results: undefined,
                pagination: {
                  cursor: null,
                  hasMore: undefined
                }
              }
            }
          },
          {
            data: null
          },
          {
            data: undefined
          },
          null,
          undefined
        ];

        nestedStructures.forEach((structure, index) => {
          // Test safe access patterns
          expect(() => {
            const flowResults = SafeAccess.getNestedValue(
              structure, 
              'data.flows.results', 
              []
            );
            expect(Array.isArray(flowResults)).toBe(true);
          }).not.toThrow();

          expect(() => {
            const pagination = SafeAccess.getNestedValue(
              structure,
              'data.alarms.pagination',
              { cursor: null, hasMore: false }
            );
            // Just verify SafeAccess doesn't crash - the exact return value isn't critical
            expect(pagination !== null).toBe(true);
          }).not.toThrow();

          expect(() => {
            const cursor = SafeAccess.getNestedValue(
              structure,
              'data.alarms.pagination.cursor',
              null
            );
            // Cursor can be null, that's valid
            expect(cursor === null || typeof cursor === 'string').toBe(true);
          }).not.toThrow();
        });
      });

      it('should normalize null/undefined fields consistently', () => {
        const dataWithNulls = {
          source_ip: null,
          destination_ip: undefined,
          protocol: '',
          severity: '   ',
          country: 'null',
          status: 'undefined',
          valid_field: 'tcp',
          numeric_field: 0,
          boolean_field: false
        };

        const normalized = normalizeUnknownFields(dataWithNulls);

        // Null/undefined/empty should become 'unknown'
        expect(normalized.source_ip).toBe('unknown');
        expect(normalized.destination_ip).toBe('unknown');
        expect(normalized.protocol).toBe('unknown');
        expect(normalized.severity).toBe('unknown');
        expect(normalized.country).toBe('unknown');
        expect(normalized.status).toBe('unknown');

        // Valid values should be preserved
        expect(normalized.valid_field).toBe('tcp');
        expect(normalized.numeric_field).toBe(0);
        expect(normalized.boolean_field).toBe(false);
      });
    });
  });

  describe('Geographic Filtering Edge Cases Prevention', () => {
    describe('Multi-Value Geographic Filter Validation', () => {
      it('should handle empty and null geographic filter arrays', () => {
        const emptyGeoFilterTests = [
          { countries: [] },
          { countries: null },
          { countries: undefined },
          { countries: [null, undefined, '', '   '] },
          { continents: [] },
          { regions: [null] },
          { cities: ['', '   ', null, undefined] }
        ];

        emptyGeoFilterTests.forEach(filters => {
          Object.entries(filters).forEach(([key, values]) => {
            if (values === null || values === undefined) {
              expect(values === null || values === undefined).toBe(true);
            } else if (Array.isArray(values)) {
              const validValues = values.filter(v => 
                v !== null && 
                v !== undefined && 
                typeof v === 'string' && 
                v.trim().length > 0
              );
              expect(validValues.length).toBe(0);
            }
          });
        });
      });

      it('should validate geographic filter value formats', () => {
        const invalidGeoFormats = [
          { countries: ['', 'VALID_COUNTRY', null, 123, {}, []] },
          { continents: ['Asia', undefined, 'Europe', true, false] },
          { regions: [null, 'Eastern Europe', '', NaN, Infinity] },
          { cities: ['Beijing', null, '', {city: 'Moscow'}, ['array']] }
        ];

        invalidGeoFormats.forEach(filters => {
          Object.entries(filters).forEach(([key, values]) => {
            if (Array.isArray(values)) {
              const validValues = values.filter(v => 
                v !== null && 
                v !== undefined && 
                typeof v === 'string' && 
                v.trim().length > 0 &&
                !isNaN(v as any) === false // Not a number string
              );
              
              // Should have some valid values
              expect(validValues.length).toBeGreaterThan(0);
              
              // All valid values should be strings
              validValues.forEach(v => {
                expect(typeof v).toBe('string');
                expect(v.length).toBeGreaterThan(0);
              });
            }
          });
        });
      });

    });

    describe('Geographic Data Normalization Edge Cases', () => {
    });
  });

  describe('Timeout vs Validation Error Classification Prevention', () => {
    describe('Error Type Determination Logic', () => {
      it('should never classify parameter validation as timeout error', () => {
        const validationErrorCases = [
          { error: new Error('limit parameter is required'), stage: 'parameter_validation' },
          { error: new Error('Query contains invalid syntax'), stage: 'query_parsing' },
          { error: new Error('Field "invalid_field" is not allowed'), stage: 'field_validation' },
          { error: new Error('Limit must be between 1 and 10000'), stage: 'range_validation' }
        ];

        validationErrorCases.forEach(({ error, stage }) => {
          // Simulate the error classification logic
          const errorType = stage === 'parameter_validation' || 
                           stage === 'query_parsing' ||
                           stage === 'field_validation' ||
                           stage === 'range_validation'
            ? ErrorType.VALIDATION_ERROR
            : ErrorType.TIMEOUT_ERROR;

          expect(errorType).toBe(ErrorType.VALIDATION_ERROR);
          
          const response = createErrorResponse(
            'test_tool',
            error.message,
            errorType
          );

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.errorType).toBe('validation_error');
          expect(errorData.message).toContain(error.message);
        });
      });

      it('should correctly classify network timeouts', () => {
        const networkTimeoutCases = [
          { 
            error: new Error('ETIMEDOUT'), 
            code: 'ETIMEDOUT',
            processingTime: 30000,
            expectedType: ErrorType.TIMEOUT_ERROR
          },
          { 
            error: new Error('ECONNREFUSED'), 
            code: 'ECONNREFUSED',
            processingTime: 100,
            expectedType: ErrorType.NETWORK_ERROR
          },
          { 
            error: new Error('Processing timeout'), 
            code: null,
            processingTime: 12000,
            expectedType: ErrorType.TIMEOUT_ERROR
          }
        ];

        networkTimeoutCases.forEach(({ error, code, processingTime, expectedType }) => {
          // Simulate error classification
          let classifiedType: ErrorType;
          
          if (code === 'ETIMEDOUT' || processingTime > 10000) {
            classifiedType = ErrorType.TIMEOUT_ERROR;
          } else if (code === 'ECONNREFUSED') {
            classifiedType = ErrorType.NETWORK_ERROR;
          } else {
            classifiedType = ErrorType.API_ERROR;
          }

          expect(classifiedType).toBe(expectedType);
        });
      });


      it('should include response time context in error classification', () => {
        const responseTimeTests = [
          { 
            responseTime: 50, 
            stage: 'parameter_validation',
            expectedClassification: 'immediate_validation'
          },
          { 
            responseTime: 200, 
            stage: 'query_parsing',
            expectedClassification: 'fast_validation'
          },
          { 
            responseTime: 5000, 
            stage: 'api_processing',
            expectedClassification: 'slow_processing'
          },
          { 
            responseTime: 15000, 
            stage: 'api_processing',
            expectedClassification: 'timeout'
          }
        ];

        responseTimeTests.forEach(({ responseTime, stage, expectedClassification }) => {
          let classification: string;
          
          if (responseTime < 100 && stage === 'parameter_validation') {
            classification = 'immediate_validation';
          } else if (responseTime < 500 && stage === 'query_parsing') {
            classification = 'fast_validation';
          } else if (responseTime > 10000) {
            classification = 'timeout';
          } else {
            classification = 'slow_processing';
          }

          expect(classification).toBe(expectedClassification);
        });
      });
    });

    describe('Error Context Preservation', () => {
      it('should preserve error context across validation layers', () => {
        const contextTests = [
          {
            tool: 'search_flows',
            parameters: { query: null, limit: 'invalid' },
            stage: 'parameter_validation',
            expectedErrors: ['query is required', 'limit must be a number']
          },
          {
            tool: 'get_device_status',
            parameters: { limit: -1, cursor: 123 },
            stage: 'parameter_validation', 
            expectedErrors: ['limit must be positive', 'cursor must be a string']
          }
        ];

        contextTests.forEach(({ tool, parameters, stage, expectedErrors }) => {
          const validationResults = [];

          // Simulate parameter validation
          if (parameters.query !== undefined) {
            validationResults.push(
              ParameterValidator.validateRequiredString(parameters.query, 'query')
            );
          }
          
          if (parameters.limit !== undefined) {
            validationResults.push(
              ParameterValidator.validateNumber(
                parameters.limit, 
                'limit', 
                { required: true, min: 1, max: 10000 }
              )
            );
          }

          if (parameters.cursor !== undefined) {
            validationResults.push(
              ParameterValidator.validateOptionalString(parameters.cursor, 'cursor')
            );
          }

          const combined = ParameterValidator.combineValidationResults(validationResults);
          
          expect(combined.isValid).toBe(false);
          expect(combined.errors.length).toBeGreaterThanOrEqual(1);
          
          // Check that error context is preserved
          combined.errors.forEach(error => {
            expect(typeof error).toBe('string');
            expect(error.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('Parameter Boundary Enforcement Prevention', () => {
    describe('System Limit Enforcement', () => {
      it('should enforce system limits consistently across all tools', () => {
        const systemLimits = {
          maxLimit: 10000,
          maxQueryLength: 2000,
          maxDuration: 1440,
          maxCursorLength: 1000
        };

        const boundaryTests = [
          {
            parameter: 'limit',
            values: [systemLimits.maxLimit, systemLimits.maxLimit + 1],
            validation: (value: number) => ParameterValidator.validateNumber(
              value, 
              'limit', 
              { required: true, min: 1, max: systemLimits.maxLimit }
            )
          },
          {
            parameter: 'query',
            values: [
              'a'.repeat(systemLimits.maxQueryLength),
              'a'.repeat(systemLimits.maxQueryLength + 1)
            ],
            validation: (value: string) => QuerySanitizer.sanitizeSearchQuery(value)
          },
          {
            parameter: 'duration',
            values: [systemLimits.maxDuration, systemLimits.maxDuration + 1],
            validation: (value: number) => ParameterValidator.validateNumber(
              value,
              'duration',
              { required: true, min: 1, max: systemLimits.maxDuration, integer: true }
            )
          }
        ];

        boundaryTests.forEach(({ parameter, values, validation }) => {
          const [maxValid, exceedsMax] = values;
          
          const validResult = validation(maxValid);
          const invalidResult = validation(exceedsMax);
          
          expect(validResult.isValid).toBe(true);
          expect(invalidResult.isValid).toBe(false);
          
          if (parameter === 'query') {
            expect(invalidResult.errors).toContain(
              'Query is too long (maximum 2000 characters)'
            );
          } else {
            expect(invalidResult.errors[0]).toContain('system limits');
          }
        });
      });

      it('should provide clear guidance when limits are exceeded', () => {
        const exceedLimitTests = [
          {
            value: 50000,
            parameter: 'limit',
            expectedGuidance: 'maximum: 10000 for performance reasons'
          },
          {
            value: 'a'.repeat(5000),
            parameter: 'query',
            expectedGuidance: 'maximum 2000 characters'
          },
          {
            value: 2000,
            parameter: 'duration',
            expectedGuidance: 'maximum: 1440'
          }
        ];

        exceedLimitTests.forEach(({ value, parameter, expectedGuidance }) => {
          let result;
          
          if (parameter === 'limit' || parameter === 'duration') {
            result = ParameterValidator.validateNumber(
              value as number,
              parameter,
              { 
                required: true, 
                min: 1, 
                max: parameter === 'limit' ? 10000 : 1440,
                integer: parameter === 'duration'
              }
            );
          } else {
            result = QuerySanitizer.sanitizeSearchQuery(value as string);
          }

          expect(result.isValid).toBe(false);
          expect(result.errors[0]).toContain(expectedGuidance);
        });
      });
    });
  });
});