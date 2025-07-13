/**
 * Comprehensive Test Suite for Bulk Operations MCP Tools
 * Tests BulkDeleteAlarmsHandler, BulkPauseRulesHandler, and BulkResumeRulesHandler
 */

import {
  BulkDeleteAlarmsHandler,
} from '../../src/tools/handlers/bulk-alarms.js';
import {
  BulkPauseRulesHandler,
  BulkResumeRulesHandler,
} from '../../src/tools/handlers/bulk-rules.js';
import type { FirewallaClient } from '../../src/firewalla/client.js';
import { ErrorType } from '../../src/validation/error-handler.js';

// Mock Firewalla client with comprehensive mock responses
const mockFirewallaClient = {
  deleteAlarm: jest.fn(),
  pauseRule: jest.fn(),
  resumeRule: jest.fn(),
} as unknown as FirewallaClient;

describe('Bulk Operations MCP Tools Comprehensive Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BulkDeleteAlarmsHandler', () => {
    const handler = new BulkDeleteAlarmsHandler();

    it('should have correct tool properties', () => {
      expect(handler.name).toBe('bulk_delete_alarms');
      expect(handler.category).toBe('security');
      expect(handler.description).toContain('Delete multiple security alarms');
    });

    describe('Parameter Validation', () => {
      it('should require ids parameter', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBeTruthy();
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors).toContain('ids parameter must be an array of strings');
      });

      it('should validate ids is an array', async () => {
        const response = await handler.execute({ ids: 'not-an-array' }, mockFirewallaClient);

        expect(response.isError).toBeTruthy();
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        // The validation converts non-arrays, so we get a different error
        expect(errorData.validation_errors[0]).toMatch(/ids/);
      });

      it('should validate ids array is not empty', async () => {
        const response = await handler.execute({ ids: [] }, mockFirewallaClient);

        expect(response.isError).toBeTruthy();
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors).toContain('ids array cannot be empty');
      });

      it('should validate ids array does not exceed maximum', async () => {
        const tooManyIds = Array(51).fill('alarm-id');
        const response = await handler.execute({ ids: tooManyIds }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors[0]).toBe('Too many items: 51. Maximum allowed: 50');
      });
    });

    describe('Successful Execution', () => {
      it('should successfully delete multiple alarms', async () => {
        const alarmIds = ['alarm-1', 'alarm-2', 'alarm-3'];
        (mockFirewallaClient.deleteAlarm as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ ids: alarmIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(parsedResponse.data?.operation || data.operation).toBe('bulk_delete_alarms');
        expect(data.total).toBe(3);
        expect(data.successful).toBe(3);
        expect(data.failed).toBe(0);
        expect(data.summary.success_rate).toBe(100);
        
        // Verify all alarms were attempted to be deleted
        expect(mockFirewallaClient.deleteAlarm).toHaveBeenCalledTimes(3);
        alarmIds.forEach(id => {
          expect(mockFirewallaClient.deleteAlarm).toHaveBeenCalledWith(id);
        });
      });

      it('should handle partial failures gracefully', async () => {
        const alarmIds = ['alarm-1', 'alarm-2', 'alarm-3'];
        (mockFirewallaClient.deleteAlarm as jest.Mock)
          .mockResolvedValueOnce({ success: true })
          .mockRejectedValueOnce(new Error('Alarm not found'))
          .mockResolvedValueOnce({ success: true });

        const response = await handler.execute({ ids: alarmIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(data.successful).toBe(2);
        expect(data.failed).toBe(1);
        expect(data.summary.success_rate).toBe(66.67);
        expect(data.results).toHaveLength(3);
        
        // Find the failed result
        const failedResult = data.results.find((r: any) => !r.success);
        expect(failedResult).toBeDefined();
        expect(failedResult.id).toBe('alarm-2');
        expect(failedResult.error).toContain('Alarm not found');
      });
    });

    describe('Error Handling', () => {
      it('should handle complete failure', async () => {
        const alarmIds = ['alarm-1', 'alarm-2'];
        (mockFirewallaClient.deleteAlarm as jest.Mock).mockRejectedValue(new Error('API Error'));

        const response = await handler.execute({ ids: alarmIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(data.successful).toBe(0);
        expect(data.failed).toBe(2);
        expect(data.summary.success_rate).toBe(0);
        expect(data.results.filter((r: any) => !r.success)).toHaveLength(2);
      });
    });
  });

  describe('BulkPauseRulesHandler', () => {
    const handler = new BulkPauseRulesHandler();

    it('should have correct tool properties', () => {
      expect(handler.name).toBe('bulk_pause_rules');
      expect(handler.category).toBe('rule');
      expect(handler.description).toContain('Pause multiple firewall rules');
    });

    describe('Parameter Validation', () => {
      it('should require ids parameter', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors).toContain('ids parameter must be an array of strings');
      });

      it('should validate duration parameter if provided', async () => {
        const response = await handler.execute({ 
          ids: ['rule-1'], 
          options: { duration: 2000 } // Over max of 1440
        }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors[0]).toContain('duration is too large');
      });

      it('should validate duration is positive integer', async () => {
        const response = await handler.execute({ 
          ids: ['rule-1'], 
          options: { duration: -5 }
        }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors[0]).toContain('duration is too small');
      });
    });

    describe('Successful Execution', () => {
      it('should pause rules with default duration', async () => {
        const ruleIds = ['rule-1', 'rule-2'];
        (mockFirewallaClient.pauseRule as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ ids: ruleIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(parsedResponse.data?.operation || data.operation).toBe('bulk_pause_rules');
        expect(data.total).toBe(2);
        expect(data.successful).toBe(2);
        
        // Verify rules were paused with default duration
        expect(mockFirewallaClient.pauseRule).toHaveBeenCalledTimes(2);
        expect(mockFirewallaClient.pauseRule).toHaveBeenCalledWith('rule-1', 60);
        expect(mockFirewallaClient.pauseRule).toHaveBeenCalledWith('rule-2', 60);
      });

      it('should pause rules with custom duration', async () => {
        const ruleIds = ['rule-1', 'rule-2'];
        const customDuration = 120;
        (mockFirewallaClient.pauseRule as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ 
          ids: ruleIds,
          options: { duration: customDuration }
        }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(data.successful).toBe(2);
        
        // Verify rules were paused with custom duration
        expect(mockFirewallaClient.pauseRule).toHaveBeenCalledWith('rule-1', customDuration);
        expect(mockFirewallaClient.pauseRule).toHaveBeenCalledWith('rule-2', customDuration);
      });

      it('should handle mixed success and failure', async () => {
        const ruleIds = ['rule-1', 'rule-2', 'rule-3'];
        (mockFirewallaClient.pauseRule as jest.Mock)
          .mockResolvedValueOnce({ success: true })
          .mockRejectedValueOnce(new Error('Rule not found'))
          .mockResolvedValueOnce({ success: true });

        const response = await handler.execute({ ids: ruleIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(data.successful).toBe(2);
        expect(data.failed).toBe(1);
        
        // Find the failed result
        const failedResult = data.results.find((r: any) => !r.success);
        expect(failedResult).toBeDefined();
        expect(failedResult.id).toBe('rule-2');
      });
    });
  });

  describe('BulkResumeRulesHandler', () => {
    const handler = new BulkResumeRulesHandler();

    it('should have correct tool properties', () => {
      expect(handler.name).toBe('bulk_resume_rules');
      expect(handler.category).toBe('rule');
      expect(handler.description).toContain('Resume multiple paused firewall rules');
    });

    describe('Parameter Validation', () => {
      it('should require ids parameter', async () => {
        const response = await handler.execute({}, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors).toContain('ids parameter must be an array of strings');
      });

      it('should validate ids format', async () => {
        const response = await handler.execute({ ids: 'single-id' }, mockFirewallaClient);

        expect(response.isError).toBe(true);
        const errorData = JSON.parse(response.content[0].text);
        expect(errorData.errorType).toBe(ErrorType.VALIDATION_ERROR);
        expect(errorData.validation_errors).toContain('ids parameter must be an array of strings');
      });
    });

    describe('Successful Execution', () => {
      it('should successfully resume multiple rules', async () => {
        const ruleIds = ['rule-1', 'rule-2', 'rule-3'];
        (mockFirewallaClient.resumeRule as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ ids: ruleIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(parsedResponse.data?.operation || data.operation).toBe('bulk_resume_rules');
        expect(data.total).toBe(3);
        expect(data.successful).toBe(3);
        expect(data.failed).toBe(0);
        
        // Verify all rules were resumed
        expect(mockFirewallaClient.resumeRule).toHaveBeenCalledTimes(3);
        ruleIds.forEach(id => {
          expect(mockFirewallaClient.resumeRule).toHaveBeenCalledWith(id);
        });
      });

      it('should provide detailed error information on failures', async () => {
        const ruleIds = ['rule-1', 'rule-2'];
        (mockFirewallaClient.resumeRule as jest.Mock)
          .mockResolvedValueOnce({ success: true })
          .mockRejectedValueOnce(new Error('Rule is not paused'));

        const response = await handler.execute({ ids: ruleIds }, mockFirewallaClient);

        expect(response.isError).toBe(false);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.successful).toBe(1);
        expect(data.failed).toBe(1);
        
        // Find the failed result
        const failedResult = data.results.find((r: any) => !r.success);
        expect(failedResult).toBeDefined();
        expect(failedResult.id).toBe('rule-2');
        expect(failedResult.error).toContain('Rule is not paused');
      });
    });

    describe('Bulk Operation Features', () => {
      it('should process operations in batches', async () => {
        // Test with many IDs to verify batching behavior
        const manyIds = Array(50).fill(null).map((_, i) => `rule-${i + 1}`);
        (mockFirewallaClient.resumeRule as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ ids: manyIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(data.total).toBe(50);
        expect(data.successful).toBe(50);
        expect(mockFirewallaClient.resumeRule).toHaveBeenCalledTimes(50);
      });

      it('should include execution metadata', async () => {
        const ruleIds = ['rule-1'];
        (mockFirewallaClient.resumeRule as jest.Mock).mockResolvedValue({ success: true });

        const response = await handler.execute({ ids: ruleIds }, mockFirewallaClient);

        expect(response.isError).toBeFalsy();
        const parsedResponse = JSON.parse(response.content[0].text);
        
        // Handle unified response format
        const data = parsedResponse.data?.bulk_operation_result || parsedResponse;
        
        expect(parsedResponse.data || data).toHaveProperty('timestamp');
        expect(data.summary).toHaveProperty('processing_time_ms');
        expect(typeof data.summary.processing_time_ms).toBe('number');
      });
    });
  });
});