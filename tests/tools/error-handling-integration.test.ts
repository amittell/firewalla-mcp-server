/**
 * Integration tests for error handling across all tool handlers
 * Ensures consistent error responses and proper ErrorType usage
 */

import { 
  GetActiveAlarmsHandler,
  GetSpecificAlarmHandler,
  DeleteAlarmHandler
} from '../../src/tools/handlers/security.js';
import { 
  GetBoxesHandler,
  GetSimpleStatisticsHandler,
  GetFlowTrendsHandler
} from '../../src/tools/handlers/analytics.js';
import { 
  GetFlowDataHandler,
  GetBandwidthUsageHandler,
  GetOfflineDevicesHandler
} from '../../src/tools/handlers/network.js';
import { ErrorType } from '../../src/validation/error-handler.js';
import type { FirewallaClient } from '../../src/firewalla/client.js';

// Mock Firewalla client
const mockFirewallaClient = {
  getActiveAlarms: jest.fn(),
  getSpecificAlarm: jest.fn(),
  deleteAlarm: jest.fn(),
  getBoxes: jest.fn(),
  getSimpleStatistics: jest.fn(),
  getFlowTrends: jest.fn(),
  getFlowData: jest.fn(),
  getBandwidthUsage: jest.fn(),
  getOfflineDevices: jest.fn(),
} as unknown as FirewallaClient;

describe('Error Handling Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Tools Error Handling', () => {
    describe('GetActiveAlarmsHandler', () => {
      const handler = new GetActiveAlarmsHandler();

      test('should return validation error for missing required limit', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.error).toBe(true);
        expect(errorData.tool).toBe('get_active_alarms');
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain('limit is required');
        expect(errorData.timestamp).toBeDefined();
      });

      test('should return validation error for invalid severity enum', async () => {
        const response = await handler.execute(
          { limit: 10, severity: 'extreme' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain(
          "severity must be one of: low, medium, high, critical, got 'extreme'"
        );
      });

      test('should return validation error for invalid cursor format', async () => {
        const response = await handler.execute(
          { limit: 10, cursor: 'invalid!@#$%' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.details.provided_value).toBe('invalid!@#$%');
        expect(errorData.details.documentation).toContain('Cursors should be obtained from previous response');
      });

      test('should return API error when Firewalla API fails', async () => {
        (mockFirewallaClient.getActiveAlarms as jest.Mock).mockRejectedValue(
          new Error('Network connection failed')
        );

        const response = await handler.execute({ limit: 10 }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.message).toContain('Failed to get active alarms');
        expect(errorData.message).toContain('Network connection failed');
      });
    });

    describe('GetSpecificAlarmHandler', () => {
      const handler = new GetSpecificAlarmHandler();

      test('should return validation error for missing alarm_id', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain('alarm_id is required');
      });

      test('should return validation error for invalid alarm_id format', async () => {
        const response = await handler.execute(
          { alarm_id: 'invalid!@#$%' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors[0]).toContain('alarm_id must be a valid alarm identifier');
      });

      test('should return API error when alarm not found', async () => {
        (mockFirewallaClient.getSpecificAlarm as jest.Mock).mockResolvedValue({
          results: []
        });

        const response = await handler.execute(
          { alarm_id: '12345' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.message).toContain("Alarm with ID '12345' not found");
        expect(errorData.details.alarm_id).toBe('12345');
      });
    });

    describe('DeleteAlarmHandler', () => {
      const handler = new DeleteAlarmHandler();

      test('should return validation error for null alarm_id', async () => {
        const response = await handler.execute(
          { alarm_id: null },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain('alarm_id is required');
      });

      test('should return API error when trying to delete non-existent alarm', async () => {
        (mockFirewallaClient.getSpecificAlarm as jest.Mock).mockRejectedValue(
          new Error('404 - Not Found')
        );

        const response = await handler.execute(
          { alarm_id: '99999' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.message).toContain("Alarm with ID '99999' not found");
      });
    });
  });

  describe('Analytics Tools Error Handling', () => {
    describe('GetBoxesHandler', () => {
      const handler = new GetBoxesHandler();

      test('should return validation error for invalid group_id type', async () => {
        const response = await handler.execute(
          { group_id: 123 },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain('group_id must be a string if provided, got number');
      });

      test('should return API error when Firewalla API is unreachable', async () => {
        (mockFirewallaClient.getBoxes as jest.Mock).mockRejectedValue(
          new Error('ECONNREFUSED: Connection refused')
        );

        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.message).toContain('Failed to get boxes');
        expect(errorData.message).toContain('ECONNREFUSED');
      });
    });

    describe('GetFlowTrendsHandler', () => {
      const handler = new GetFlowTrendsHandler();

      test('should return validation error for invalid period enum', async () => {
        const response = await handler.execute(
          { period: '1y' },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain(
          "period must be one of: 1h, 24h, 7d, 30d, got '1y'"
        );
      });

      test('should return validation error for invalid interval range', async () => {
        const response = await handler.execute(
          { interval: 30 }, // Below minimum of 60
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors[0]).toContain('interval is too small');
        expect(errorData.validation_errors[0]).toContain('minimum: 60');
      });

      test('should return API error with troubleshooting info', async () => {
        (mockFirewallaClient.getFlowTrends as jest.Mock).mockRejectedValue(
          new Error('Service temporarily unavailable')
        );

        const response = await handler.execute({ period: '24h' }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.details.period).toBe('24h');
        expect(errorData.details.troubleshooting).toContain('Check if Firewalla API is accessible');
      });
    });
  });

  describe('Network Tools Error Handling', () => {
    describe('GetFlowDataHandler', () => {
      const handler = new GetFlowDataHandler();

      test('should return validation error for missing required limit', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain('limit is required');
      });

      test('should return validation error for invalid date format', async () => {
        const response = await handler.execute(
          { 
            limit: 100,
            start_time: 'invalid-date' 
          },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.details.provided_value).toBe('invalid-date');
        expect(errorData.details.documentation).toContain('/docs/query-syntax-guide.md');
      });

      test('should return validation error for invalid time range order', async () => {
        const response = await handler.execute(
          { 
            limit: 100,
            start_time: '2024-01-02T00:00:00Z',
            end_time: '2024-01-01T00:00:00Z'
          },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.message).toBe('Invalid time range order');
        expect(errorData.details.details).toBe('Start time must be before end time');
      });

      test('should return API error with original error context', async () => {
        (mockFirewallaClient.getFlowData as jest.Mock).mockRejectedValue(
          new Error('Internal server error')
        );

        const response = await handler.execute({ limit: 100 }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('api_error');
        expect(errorData.message).toContain('Failed to get flow data');
        expect(errorData.details.originalError).toContain('Internal server error');
      });
    });

    describe('GetBandwidthUsageHandler', () => {
      const handler = new GetBandwidthUsageHandler();

      test('should return validation error for invalid period and limit combination', async () => {
        const response = await handler.execute(
          { 
            period: 'invalid_period',
            limit: 0
          },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors).toContain(
          "period must be one of: 1h, 24h, 7d, 30d, got 'invalid_period'"
        );
        expect(errorData.validation_errors.some((err: string) => 
          err.includes('limit must be a positive number')
        )).toBe(true);
      });
    });

    describe('GetOfflineDevicesHandler', () => {
      const handler = new GetOfflineDevicesHandler();

      test('should return validation error for invalid limit type', async () => {
        const response = await handler.execute(
          { limit: 'invalid' }, // Invalid string that cannot be converted to number
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors.length).toBeGreaterThan(0);
      });

      test('should return validation error for negative limit', async () => {
        const response = await handler.execute(
          { limit: -10 },
          mockFirewallaClient
        );

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe('validation_error');
        expect(errorData.validation_errors[0]).toContain('limit must be a positive number');
      });
    });
  });

  describe('Cross-Tool Error Consistency', () => {
    test('should have consistent error structure across all tools', async () => {
      const handlers = [
        new GetActiveAlarmsHandler(),
        new GetBoxesHandler(),
        new GetFlowDataHandler()
      ];

      const responses = await Promise.all(
        handlers.map(handler => handler.execute({}, mockFirewallaClient))
      );

      responses.forEach((response, index) => {
        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        
        // All errors should have these standard fields
        expect(errorData.error).toBe(true);
        expect(errorData.tool).toBeDefined();
        expect(errorData.message).toBeDefined();
        expect(errorData.errorType).toBeDefined();
        expect(errorData.timestamp).toBeDefined();
        
        // Validation errors should have validation_errors array
        if (errorData.errorType === 'validation_error') {
          expect(Array.isArray(errorData.validation_errors)).toBe(true);
          expect(errorData.validation_errors.length).toBeGreaterThan(0);
        }
      });
    });

    test('should use appropriate ErrorType for different error scenarios', async () => {
      const testCases = [
        {
          handler: new GetActiveAlarmsHandler(),
          args: {},
          expectedErrorType: 'validation_error'
        },
        {
          handler: new GetSpecificAlarmHandler(),
          args: { alarm_id: 'invalid!@#' },
          expectedErrorType: 'validation_error'
        },
        {
          handler: new GetFlowTrendsHandler(),
          args: { period: 'invalid' },
          expectedErrorType: 'validation_error'
        }
      ];

      for (const testCase of testCases) {
        const response = await testCase.handler.execute(testCase.args, mockFirewallaClient);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(testCase.expectedErrorType);
      }
    });

    test('should preserve error context and provide helpful suggestions', async () => {
      const handler = new GetActiveAlarmsHandler();
      const response = await handler.execute(
        { limit: 10, cursor: 'invalid_cursor' },
        mockFirewallaClient
      );

      expect(response.isError).toBe(true);
      const errorData = JSON.parse(response.content[0].text);
      expect(errorData.tool).toBeDefined();
      expect(errorData.message).toBeDefined();
      expect(errorData.errorType).toBeDefined();
    });
  });

  describe('Error Response Format Validation', () => {
    test('should ensure all error responses follow MCP protocol', async () => {
      const handler = new GetActiveAlarmsHandler();
      const response = await handler.execute({}, mockFirewallaClient);

      // MCP protocol requirements
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');
      expect(response).toHaveProperty('isError', true);

      // Error response should be valid JSON
      expect(() => JSON.parse(response.content[0].text)).not.toThrow();
    });

    test('should include all required error fields', async () => {
      const handler = new GetActiveAlarmsHandler();
      const response = await handler.execute({ limit: 'invalid' }, mockFirewallaClient);

      const errorData = JSON.parse(response.content[0].text);
      
      // Required fields for all errors
      expect(errorData).toHaveProperty('error', true);
      expect(errorData).toHaveProperty('tool');
      expect(errorData).toHaveProperty('message');
      expect(errorData).toHaveProperty('errorType');
      expect(errorData).toHaveProperty('timestamp');
      
      // ISO timestamp format
      expect(errorData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});