/**
 * Tests for user experience improvements
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RetryManager } from '../src/utils/retry-manager.js';
import { TimeoutError } from '../src/utils/timeout-manager.js';
import { createTimeoutErrorResponse } from '../src/utils/timeout-manager.js';

describe('User Experience Improvements', () => {
  describe('Retry Manager', () => {
    let retryManager: RetryManager;

    beforeEach(() => {
      retryManager = new RetryManager();
    });

    test('should succeed on first attempt when operation succeeds', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await retryManager.withRetry(mockOperation, {
        maxAttempts: 3,
        toolName: 'test-operation',
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should retry on timeout errors and succeed on second attempt', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new TimeoutError('test-operation', 1000, 10000))
        .mockResolvedValueOnce('success');

      const result = await retryManager.withRetry(mockOperation, {
        maxAttempts: 3,
        initialDelayMs: 10, // Small delay for testing
        toolName: 'test-operation',
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('should retry on network errors', async () => {
      const networkError = new Error('Network timeout');
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success');

      const result = await retryManager.withRetry(mockOperation, {
        maxAttempts: 3,
        initialDelayMs: 10,
        toolName: 'test-operation',
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('should not retry on validation errors', async () => {
      const validationError = new Error('Invalid parameter');
      const mockOperation = jest.fn().mockRejectedValue(validationError);

      await expect(
        retryManager.withRetry(mockOperation, {
          maxAttempts: 3,
          toolName: 'test-operation',
          shouldRetry: () => false, // Don't retry validation errors
        })
      ).rejects.toThrow('Invalid parameter');

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should throw RetryFailureError after max attempts', async () => {
      const timeoutError = new TimeoutError('test-operation', 1000, 10000);
      const mockOperation = jest.fn().mockRejectedValue(timeoutError);

      await expect(
        retryManager.withRetry(mockOperation, {
          maxAttempts: 2,
          initialDelayMs: 10,
          toolName: 'test-operation',
        })
      ).rejects.toMatchObject({
        name: 'RetryFailureError',
        message: expect.stringContaining('failed after 2 retry attempts'),
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('should include user guidance in retry failure error', async () => {
      const timeoutError = new TimeoutError('test-operation', 1000, 10000);
      const mockOperation = jest.fn().mockRejectedValue(timeoutError);

      try {
        await retryManager.withRetry(mockOperation, {
          maxAttempts: 2,
          initialDelayMs: 10,
          toolName: 'test-operation',
        });
      } catch (error: any) {
        expect(error.userGuidance).toBeDefined();
        expect(error.userGuidance).toEqual(
          expect.arrayContaining([
            expect.stringContaining('timed out after'),
            expect.stringContaining('Try reducing the scope'),
          ])
        );
      }
    });
  });

  describe('Enhanced Timeout Error Messages', () => {
    test('should generate actionable guidance for search operations', () => {
      const errorResponse = createTimeoutErrorResponse('search_flows', 15000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Search Optimization Tips');
      expect(errorResponse.content[0].text).toContain('Reduce the limit parameter');
      expect(errorResponse.content[0].text).toContain('protocol filters');
      expect(errorResponse.content[0].text).toContain('Troubleshooting Steps');
    });

    test('should generate guidance for rule operations', () => {
      const errorResponse = createTimeoutErrorResponse('get_network_rules', 20000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Rule Operation Tips');
      expect(errorResponse.content[0].text).toContain('active_only:true');
      expect(errorResponse.content[0].text).toContain('Recovery Suggestions');
    });

    test('should generate guidance for device operations', () => {
      const errorResponse = createTimeoutErrorResponse('get_device_status', 25000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Device Query Tips');
      expect(errorResponse.content[0].text).toContain('online:true');
      expect(errorResponse.content[0].text).toContain('cursor pagination');
    });

    test('should include performance context in error response', () => {
      const errorResponse = createTimeoutErrorResponse('search_flows', 15000, 10000);
      
      expect(errorResponse.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Operation timed out after 15000ms'),
      });
      
      // Should have structured context in the response
      expect(errorResponse).toMatchObject({
        isError: true,
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('timeout_guide'),
          }),
        ]),
      });
    });
  });

  describe('Integration', () => {
    test('should handle retry with timeout wrapper appropriately', async () => {
      // This test verifies that our retry logic works with timeout operations
      const testRetryManager = new RetryManager();
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new TimeoutError('test-operation', 1000, 10000))
        .mockResolvedValueOnce('success');

      const result = await testRetryManager.withRetry(
        async () => {
          // Simulate timeout wrapper
          const result = await mockOperation();
          return result;
        },
        {
          maxAttempts: 2,
          initialDelayMs: 10,
          toolName: 'test-operation',
        }
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });
});