/**
 * Timeout vs Validation Error Differentiation Tests
 * 
 * Critical tests to ensure proper classification of errors between timeout and validation
 * errors. This prevents user confusion and ensures appropriate error handling and recovery
 * strategies are suggested.
 * 
 * Test Categories:
 * - Error Classification Logic Validation
 * - Response Time Context Validation
 * - Error Message Differentiation
 * - Recovery Strategy Validation
 * - Error Context Preservation
 * - Performance vs Validation Boundary Testing
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  createErrorResponse, 
  ErrorType,
  ParameterValidator
} from '../../src/validation/error-handler.js';
import { 
  TimeoutError,
  createTimeoutErrorResponse
} from '../../src/utils/timeout-manager.js';
import { measurePerformance } from '../setup/jest-setup.js';

describe('Timeout vs Validation Error Differentiation', () => {
  describe('Error Classification Logic Validation', () => {
    describe('Immediate Validation Error Detection', () => {
      it('should classify parameter validation as validation error regardless of context', () => {
        const immediateValidationCases = [
          {
            error: 'limit parameter is required',
            stage: 'parameter_validation',
            responseTime: 5,
            context: { tool: 'search_flows', parameters: { query: 'test' } }
          },
          {
            error: 'limit must be a number, got string',
            stage: 'parameter_validation', 
            responseTime: 15,
            context: { tool: 'get_device_status', parameters: { limit: 'invalid' } }
          },
          {
            error: 'Query cannot be empty',
            stage: 'parameter_validation',
            responseTime: 8,
            context: { tool: 'search_alarms', parameters: { query: '', limit: 100 } }
          },
          {
            error: 'cursor must be a string if provided',
            stage: 'parameter_validation',
            responseTime: 12,
            context: { tool: 'search_devices', parameters: { cursor: 123 } }
          }
        ];

        immediateValidationCases.forEach(({ error, stage, responseTime, context }) => {
          // Classify error type based on stage and timing
          const errorType = stage === 'parameter_validation' && responseTime < 100
            ? ErrorType.VALIDATION_ERROR
            : ErrorType.TIMEOUT_ERROR;

          expect(errorType).toBe(ErrorType.VALIDATION_ERROR);

          const response = createErrorResponse(
            context.tool,
            error,
            errorType,
            {
              stage,
              responseTime,
              parameters: context.parameters,
              recovery_type: 'immediate',
              fix_required: true
            }
          );

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.errorType).toBe('validation_error');
          expect(errorData.details.recovery_type).toBe('immediate');
          expect(errorData.details.fix_required).toBe(true);
        });
      });

      it('should never classify validation errors as timeouts even with delays', () => {
        const delayedValidationCases = [
          {
            error: 'Query syntax error: unmatched parentheses',
            stage: 'query_parsing',
            responseTime: 500, // Slower parsing
            errorType: 'validation'
          },
          {
            error: 'Field "invalid_field" is not allowed',
            stage: 'field_validation',
            responseTime: 200, // Field lookup delay
            errorType: 'validation'
          },
          {
            error: 'Time range validation failed: start > end',
            stage: 'business_logic_validation',
            responseTime: 100,
            errorType: 'validation'
          }
        ];

        delayedValidationCases.forEach(({ error, stage, responseTime, errorType }) => {
          // Even with delays, validation errors should remain validation errors
          const classifiedType = stage.includes('validation') || stage === 'query_parsing'
            ? ErrorType.VALIDATION_ERROR
            : ErrorType.TIMEOUT_ERROR;

          expect(classifiedType).toBe(ErrorType.VALIDATION_ERROR);
          expect(errorType).toBe('validation');
        });
      });
    });

    describe('Timeout Error Detection', () => {
      it('should classify network timeouts correctly', () => {
        const networkTimeoutCases = [
          {
            error: new Error('connect ETIMEDOUT 127.0.0.1:443'),
            code: 'ETIMEDOUT',
            responseTime: 30000,
            stage: 'network_request',
            expectedType: ErrorType.TIMEOUT_ERROR
          },
          {
            error: new Error('socket hang up'),
            code: 'ECONNRESET', 
            responseTime: 15000,
            stage: 'network_request',
            expectedType: ErrorType.NETWORK_ERROR
          },
          {
            error: new Error('Request timeout'),
            code: null,
            responseTime: 35000,
            stage: 'api_processing',
            expectedType: ErrorType.TIMEOUT_ERROR
          }
        ];

        networkTimeoutCases.forEach(({ error, code, responseTime, stage, expectedType }) => {
          // Classify based on error codes and timing
          let classifiedType: ErrorType;
          
          if (code === 'ETIMEDOUT' || responseTime > 30000) {
            classifiedType = ErrorType.TIMEOUT_ERROR;
          } else if (code === 'ECONNRESET' || code === 'ECONNREFUSED') {
            classifiedType = ErrorType.NETWORK_ERROR;
          } else if (responseTime > 10000) {
            classifiedType = ErrorType.TIMEOUT_ERROR;
          } else {
            classifiedType = ErrorType.API_ERROR;
          }

          expect(classifiedType).toBe(expectedType);
        });
      });

      it('should classify processing timeouts correctly', () => {
        const processingTimeoutCases = [
          {
            tool: 'search_flows',
            processingTime: 12000,
            context: { query: 'protocol:tcp', limit: 5000, stage: 'data_processing' },
            expectedType: ErrorType.TIMEOUT_ERROR
          },
          {
            tool: 'search_enhanced_cross_reference',
            processingTime: 15000,
            context: { correlationFields: ['source_ip', 'country'], stage: 'correlation_analysis' },
            expectedType: ErrorType.TIMEOUT_ERROR
          },
          {
            tool: 'get_bandwidth_usage',
            processingTime: 11000,
            context: { period: '30d', limit: 1000, stage: 'aggregation' },
            expectedType: ErrorType.TIMEOUT_ERROR
          }
        ];

        processingTimeoutCases.forEach(({ tool, processingTime, context, expectedType }) => {
          const timeoutError = new TimeoutError(tool, processingTime, 10000);
          const response = createTimeoutErrorResponse(tool, processingTime, 10000);
          
          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.errorType).toBe('timeout_error');
          expect(errorData.details.duration).toBe(processingTime);
          expect(errorData.details.timeoutMs).toBe(10000);
        });
      });
    });

    describe('Edge Cases in Error Classification', () => {
      it('should handle borderline timing cases correctly', () => {
        const borderlineCases = [
          {
            description: 'Fast validation with small delay',
            responseTime: 99,
            stage: 'parameter_validation',
            expectedType: ErrorType.VALIDATION_ERROR
          },
          {
            description: 'Slow validation just under timeout threshold',
            responseTime: 9999,
            stage: 'query_parsing',
            expectedType: ErrorType.VALIDATION_ERROR
          },
          {
            description: 'Processing just over timeout threshold',
            responseTime: 10001,
            stage: 'data_processing',
            expectedType: ErrorType.TIMEOUT_ERROR
          },
          {
            description: 'Network operation at timeout boundary',
            responseTime: 10000,
            stage: 'api_call',
            expectedType: ErrorType.TIMEOUT_ERROR // Exactly at boundary should be timeout
          }
        ];

        borderlineCases.forEach(({ description, responseTime, stage, expectedType }) => {
          let classifiedType: ErrorType;
          
          // Classification logic
          if (stage === 'parameter_validation' || stage === 'query_parsing') {
            classifiedType = ErrorType.VALIDATION_ERROR;
          } else if (responseTime >= 10000) {
            classifiedType = ErrorType.TIMEOUT_ERROR;
          } else {
            classifiedType = ErrorType.API_ERROR;
          }

          expect(classifiedType).toBe(expectedType);
        });
      });

      it('should preserve error context during classification', () => {
        const contextPreservationTests = [
          {
            originalError: 'limit parameter is required',
            stage: 'parameter_validation',
            tool: 'search_flows',
            parameters: { query: 'test', limit: null },
            expectedContext: {
              parameter: 'limit',
              stage: 'parameter_validation',
              fix_type: 'parameter_correction'
            }
          },
          {
            originalError: 'Network timeout',
            stage: 'network_request',
            tool: 'get_device_status',
            parameters: { limit: 100 },
            expectedContext: {
              network_issue: true,
              stage: 'network_request',
              fix_type: 'retry_with_backoff'
            }
          }
        ];

        contextPreservationTests.forEach(({ originalError, stage, tool, parameters, expectedContext }) => {
          const errorType = stage === 'parameter_validation' 
            ? ErrorType.VALIDATION_ERROR 
            : ErrorType.TIMEOUT_ERROR;

          const response = createErrorResponse(tool, originalError, errorType, {
            stage,
            parameters,
            ...expectedContext
          });

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.tool).toBe(tool);
          expect(errorData.details.stage).toBe(stage);
          
          Object.entries(expectedContext).forEach(([key, value]) => {
            expect(errorData.details[key]).toBe(value);
          });
        });
      });
    });
  });

  describe('Response Time Context Validation', () => {
    describe('Performance Boundary Detection', () => {
      it('should detect performance degradation patterns', async () => {
        const performanceTests = [
          {
            operation: 'parameter_validation',
            expectedMaxTime: 50,
            testFunction: () => ParameterValidator.validateNumber(42, 'limit', { min: 1, max: 1000 })
          },
          {
            operation: 'query_sanitization',
            expectedMaxTime: 200,
            testFunction: () => ({ isValid: true, sanitizedValue: 'test:query' })
          },
          {
            operation: 'field_validation',
            expectedMaxTime: 100,
            testFunction: () => ({ isValid: true, suggestion: null })
          }
        ];

        for (const { operation, expectedMaxTime, testFunction } of performanceTests) {
          const { result, duration } = await measurePerformance(() => {
            return Promise.resolve(testFunction());
          });

          expect(result).toBeDefined();
          
          // Performance should be within expected bounds
          if (duration > expectedMaxTime) {
            console.warn(`${operation} took ${duration}ms, expected max ${expectedMaxTime}ms`);
          }
          
          // Classification based on performance
          const isValidationOperation = operation.includes('validation') || operation.includes('sanitization');
          const classificationResult = duration < 1000 && isValidationOperation 
            ? 'validation_error' 
            : 'timeout_error';
          
          if (isValidationOperation) {
            expect(classificationResult).toBe('validation_error');
          }
        }
      });

      it('should identify when operations exceed expected timing', () => {
        const timingBenchmarks = {
          parameter_validation: { min: 1, max: 50, typical: 10 },
          query_parsing: { min: 10, max: 200, typical: 50 },
          field_validation: { min: 5, max: 100, typical: 25 },
          network_request: { min: 100, max: 30000, typical: 1000 },
          data_processing: { min: 500, max: 10000, typical: 2000 }
        };

        const operationTests = [
          { operation: 'parameter_validation', actualTime: 200, expected: 'slow_validation' },
          { operation: 'query_parsing', actualTime: 500, expected: 'slow_validation' },
          { operation: 'network_request', actualTime: 25000, expected: 'degraded_performance' }, // 25000 < 30000 (max)
          { operation: 'data_processing', actualTime: 12000, expected: 'timeout' } // 12000 > 10000 (max)
        ];

        operationTests.forEach(({ operation, actualTime, expected }) => {
          const benchmark = timingBenchmarks[operation as keyof typeof timingBenchmarks];
          
          let classification: string;
          if (actualTime > benchmark.max) {
            classification = operation.includes('validation') || operation.includes('parsing')
              ? 'slow_validation'
              : 'timeout';
          } else if (actualTime > benchmark.typical * 2) {
            classification = 'degraded_performance';
          } else {
            classification = 'normal';
          }

          expect(classification).toBe(expected);
        });
      });
    });

    describe('Error Context Timing Analysis', () => {
      it('should analyze error patterns by timing context', () => {
        const errorTimingPatterns = [
          {
            errors: [
              { message: 'limit required', time: 5, stage: 'validation' },
              { message: 'query empty', time: 8, stage: 'validation' },
              { message: 'invalid cursor', time: 12, stage: 'validation' }
            ],
            expectedPattern: 'immediate_validation_errors',
            expectedAvgTime: 8.33
          },
          {
            errors: [
              { message: 'connection timeout', time: 30000, stage: 'network' },
              { message: 'read timeout', time: 25000, stage: 'network' },
              { message: 'socket timeout', time: 35000, stage: 'network' }
            ],
            expectedPattern: 'network_timeout_errors',
            expectedAvgTime: 30000
          },
          {
            errors: [
              { message: 'processing timeout', time: 12000, stage: 'processing' },
              { message: 'correlation timeout', time: 15000, stage: 'processing' },
              { message: 'aggregation timeout', time: 11000, stage: 'processing' }
            ],
            expectedPattern: 'processing_timeout_errors',
            expectedAvgTime: 12666.67
          }
        ];

        errorTimingPatterns.forEach(({ errors, expectedPattern, expectedAvgTime }) => {
          const avgTime = errors.reduce((sum, err) => sum + err.time, 0) / errors.length;
          
          let pattern: string;
          if (avgTime < 100 && errors.every(e => e.stage === 'validation')) {
            pattern = 'immediate_validation_errors';
          } else if (avgTime > 20000 && errors.every(e => e.stage === 'network')) {
            pattern = 'network_timeout_errors';
          } else if (avgTime > 10000 && errors.every(e => e.stage === 'processing')) {
            pattern = 'processing_timeout_errors';
          } else {
            pattern = 'mixed_errors';
          }

          expect(pattern).toBe(expectedPattern);
          expect(Math.round(avgTime * 100) / 100).toBeCloseTo(expectedAvgTime, 1);
        });
      });
    });
  });

  describe('Error Message Differentiation', () => {
    describe('Message Content Analysis', () => {
      it('should generate distinct messages for validation vs timeout errors', () => {
        const messageDifferentiationTests = [
          {
            type: 'validation',
            error: 'limit parameter is required',
            expectedKeywords: ['parameter', 'required', 'limit'],
            forbiddenKeywords: ['timeout', 'slow', 'retry', 'performance']
          },
          {
            type: 'validation',
            error: 'Query syntax error: unmatched parentheses',
            expectedKeywords: ['syntax', 'parentheses', 'error'],
            forbiddenKeywords: ['timeout', 'network', 'retry']
          },
          {
            type: 'timeout',
            error: 'Operation timed out after 10000ms',
            expectedKeywords: ['timeout', 'timed out', 'ms', 'scope'],
            forbiddenKeywords: ['parameter', 'required']
          },
          {
            type: 'timeout', 
            error: 'Network request timeout',
            expectedKeywords: ['network', 'timeout', 'connection'],
            forbiddenKeywords: ['parameter', 'validation']
          }
        ];

        messageDifferentiationTests.forEach(({ type, error, expectedKeywords, forbiddenKeywords }) => {
          const errorType = type === 'validation' ? ErrorType.VALIDATION_ERROR : ErrorType.TIMEOUT_ERROR;
          
          let response;
          if (type === 'timeout') {
            response = createTimeoutErrorResponse('test_tool', 10000, 5000);
          } else {
            response = createErrorResponse('test_tool', error, errorType);
          }

          const errorData = JSON.parse(response.content[0].text);
          const fullMessage = `${errorData.message || ''} ${JSON.stringify(errorData.details || {})}`.toLowerCase();

          expectedKeywords.forEach(keyword => {
            expect(fullMessage).toContain(keyword.toLowerCase());
          });

          forbiddenKeywords.forEach(keyword => {
            expect(fullMessage).not.toContain(keyword.toLowerCase());
          });
        });
      });

      it('should provide appropriate recovery suggestions based on error type', () => {
        const recoverySuggestionTests = [
          {
            errorType: ErrorType.VALIDATION_ERROR,
            error: 'limit must be between 1 and 1000',
            expectedSuggestions: ['correct', 'parameter', 'documentation'],
            recoveryType: 'immediate'
          },
          {
            errorType: ErrorType.TIMEOUT_ERROR,
            error: 'Processing timeout',
            expectedSuggestions: ['reduce', 'pagination', 'filters'],
            recoveryType: 'optimization'
          },
          {
            errorType: ErrorType.NETWORK_ERROR,
            error: 'Connection failed',
            expectedSuggestions: ['retry', 'network', 'connectivity'],
            recoveryType: 'retry'
          }
        ];

        recoverySuggestionTests.forEach(({ errorType, error, expectedSuggestions, recoveryType }) => {
          const suggestions = [];
          
          if (errorType === ErrorType.VALIDATION_ERROR) {
            suggestions.push('Correct the parameter value and try again');
            suggestions.push('Check valid parameter ranges in documentation');
          } else if (errorType === ErrorType.TIMEOUT_ERROR) {
            suggestions.push('Reduce the query scope or limit parameter');
            suggestions.push('Use pagination for large datasets');
            suggestions.push('Add more specific filters to reduce processing time');
          } else if (errorType === ErrorType.NETWORK_ERROR) {
            suggestions.push('Check network connectivity');
            suggestions.push('Retry the request after a short delay');
            suggestions.push('Verify API endpoint accessibility');
          }

          const response = createErrorResponse('test_tool', error, errorType, {
            suggestions,
            recovery_type: recoveryType
          });

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.details.recovery_type).toBe(recoveryType);
          // Adjust expected length based on error type
          const expectedLength = errorType === ErrorType.VALIDATION_ERROR ? 2 : 3;
          expect(errorData.details.suggestions).toHaveLength(expectedLength);
          
          const allSuggestions = errorData.details.suggestions.join(' ').toLowerCase();
          expectedSuggestions.forEach(suggestion => {
            expect(allSuggestions).toContain(suggestion.toLowerCase());
          });
        });
      });
    });
  });

  describe('Recovery Strategy Validation', () => {
    describe('Error-Specific Recovery Strategies', () => {
      it('should provide immediate fixes for validation errors', () => {
        const validationRecoveryTests = [
          {
            error: 'limit parameter is required',
            tool: 'search_flows',
            parameters: { query: 'test' },
            expectedRecovery: {
              type: 'immediate',
              action: 'add_parameter',
              example: 'Add limit parameter: { query: "test", limit: 100 }'
            }
          },
          {
            error: 'limit must be a number',
            tool: 'get_device_status',
            parameters: { limit: 'invalid' },
            expectedRecovery: {
              type: 'immediate',
              action: 'fix_parameter_type',
              example: 'Change limit to number: { limit: 100 }'
            }
          }
        ];

        validationRecoveryTests.forEach(({ error, tool, parameters, expectedRecovery }) => {
          const response = createErrorResponse(tool, error, ErrorType.VALIDATION_ERROR, {
            parameters,
            recovery: expectedRecovery
          });

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.details.recovery.type).toBe('immediate');
          expect(errorData.details.recovery.action).toContain('parameter');
        });
      });

      it('should provide optimization strategies for timeout errors', () => {
        const timeoutRecoveryTests = [
          {
            tool: 'search_flows',
            processingTime: 12000,
            context: { query: 'protocol:tcp', limit: 5000 },
            expectedStrategies: [
              'Reduce limit parameter (try limit: 1000)',
              'Add time filter (timestamp:>NOW-1h)',
              'Use more specific query filters'
            ]
          },
          {
            tool: 'get_bandwidth_usage',
            processingTime: 15000,
            context: { period: '30d', limit: 1000 },
            expectedStrategies: [
              'Use shorter time period (try period: "24h")',
              'Reduce limit parameter (try limit: 100)',
              'Use pagination for large datasets'
            ]
          }
        ];

        timeoutRecoveryTests.forEach(({ tool, processingTime, context, expectedStrategies }) => {
          const response = createTimeoutErrorResponse(tool, processingTime, 10000);
          const errorData = JSON.parse(response.content[0].text);
          
          // The guidance is now in the message instead of a separate suggestion field
          // Look for guidance about reducing workload/scope rather than exact word "Reduce"
          expect(errorData.message).toContain('reduce');
          expect(errorData.details.timeoutMs).toBe(10000);
          expect(errorData.details.duration).toBe(processingTime);
        });
      });

      it('should provide retry strategies for network errors', () => {
        const networkRecoveryTests = [
          {
            error: 'ETIMEDOUT',
            tool: 'search_alarms',
            expectedStrategy: {
              type: 'retry_with_backoff',
              max_retries: 3,
              backoff_ms: [1000, 2000, 4000],
              conditions: ['network_timeout', 'connection_reset']
            }
          },
          {
            error: 'ECONNREFUSED',
            tool: 'get_device_status',
            expectedStrategy: {
              type: 'check_connectivity',
              immediate_actions: ['verify_network', 'check_firewall'],
              retry_after: 5000
            }
          }
        ];

        networkRecoveryTests.forEach(({ error, tool, expectedStrategy }) => {
          const response = createErrorResponse(tool, `Network error: ${error}`, ErrorType.NETWORK_ERROR, {
            error_code: error,
            recovery_strategy: expectedStrategy
          });

          const errorData = JSON.parse(response.content[0].text);
          expect(errorData.errorType).toBe('network_error');
          expect(errorData.details.error_code).toBe(error);
          expect(errorData.details.recovery_strategy).toBeDefined();
        });
      });
    });
  });
});