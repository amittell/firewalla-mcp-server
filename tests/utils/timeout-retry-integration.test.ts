/**
 * Tests for timeout and retry system integration
 * Verifies that timeout budgets and retry delays work correctly together
 */

import { withRetryAndTimeout, RetryConfig } from '../../src/utils/retry-manager.js';
import { TimeoutError } from '../../src/utils/timeout-manager.js';
import { PERFORMANCE_THRESHOLDS, getToolTimeout } from '../../src/config/limits.js';

describe('Timeout and Retry Integration Tests', () => {
  describe('withRetryAndTimeout', () => {
    it('should allocate timeout budget correctly for simple tools', async () => {
      const toolName = 'get_active_alarms';
      const expectedTimeout = getToolTimeout(toolName);
      
      expect(expectedTimeout).toBe(PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT);
      expect(expectedTimeout).toBe(15000); // 15 seconds
    });

    it('should allocate timeout budget correctly for search tools', async () => {
      const toolName = 'search_flows';
      const expectedTimeout = getToolTimeout(toolName);
      
      expect(expectedTimeout).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(expectedTimeout).toBe(30000); // 30 seconds
    });

    it('should allocate timeout budget correctly for complex tools', async () => {
      const toolName = 'search_enhanced_cross_reference';
      const expectedTimeout = getToolTimeout(toolName);
      
      expect(expectedTimeout).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
      expect(expectedTimeout).toBe(45000); // 45 seconds
    });

    it('should respect total timeout budget with retries', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        // Always fail to test retry behavior
        throw new Error('Test failure');
      };

      try {
        await withRetryAndTimeout(
          operation,
          'get_active_alarms', 
          { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 1000 },
          5000 // 5 second total timeout
        );
        fail('Should have thrown error');
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Should not exceed total timeout by much (allow some buffer for processing)
        expect(duration).toBeLessThan(6000);
        expect(attemptCount).toBeGreaterThan(1);
        expect(attemptCount).toBeLessThanOrEqual(3);
      }
    });

    it('should handle immediate failures correctly', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        throw new Error('Immediate validation failure');
      };

      try {
        await withRetryAndTimeout(
          operation,
          'get_active_alarms', 
          { maxAttempts: 3 },
          10000
        );
        fail('Should have thrown error');
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Should fail relatively quickly for immediate failures
        expect(duration).toBeLessThan(15000);
        expect(attemptCount).toBeGreaterThan(0);
      }
    });

    it('should adjust retry configuration when timeout budget is insufficient', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        throw new Error('Test failure');
      };

      try {
        await withRetryAndTimeout(
          operation,
          'get_active_alarms', 
          { 
            maxAttempts: 5, // High retry count
            initialDelayMs: 2000, // High initial delay
            maxDelayMs: 8000 // High max delay
          },
          3000 // Very short total timeout - should trigger adjustment
        );
        fail('Should have thrown error');
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Should respect the short timeout despite aggressive retry config
        expect(duration).toBeLessThan(4000);
        
        // Should have reduced attempts due to timeout budget constraints
        expect(attemptCount).toBeLessThanOrEqual(3);
      }
    });

    it('should enforce minimum per-attempt timeout', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      let firstAttemptDuration = 0;
      
      const operation = async () => {
        if (attemptCount === 0) {
          const attemptStart = Date.now();
          attemptCount++;
          
          // Simulate a 1.5 second operation
          await new Promise(resolve => setTimeout(resolve, 1500));
          firstAttemptDuration = Date.now() - attemptStart;
          throw new Error('Test failure');
        }
        
        attemptCount++;
        throw new Error('Subsequent failure');
      };

      try {
        await withRetryAndTimeout(
          operation,
          'get_active_alarms', 
          { maxAttempts: 2 },
          4000 // 4 second total timeout
        );
        fail('Should have thrown error');
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // First attempt should have been allowed to complete despite taking 1.5s
        expect(firstAttemptDuration).toBeGreaterThan(1400);
        expect(attemptCount).toBeGreaterThanOrEqual(1);
        expect(duration).toBeLessThan(5000);
      }
    });

    it('should handle TimeoutError correctly in retry logic', async () => {
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new TimeoutError('test_tool', 5000, 4000);
        }
        return 'success';
      };

      const result = await withRetryAndTimeout(
        operation,
        'get_active_alarms', 
        { maxAttempts: 3 },
        10000
      );

      expect(result).toBe('success');
      expect(attemptCount).toBe(2); // Should retry timeout errors
    });

    it('should provide proper error context when all retries are exhausted', async () => {
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        throw new Error(`Attempt ${attemptCount} failed`);
      };

      try {
        await withRetryAndTimeout(
          operation,
          'get_active_alarms', 
          { maxAttempts: 2 },
          10000
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('get_active_alarms');
        expect(error.message).toContain('2 retry attempts');
        expect(attemptCount).toBe(2);
      }
    });
  });

  describe('Timeout configuration validation', () => {
    it('should have reasonable timeout values', () => {
      expect(PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT).toBe(15000);
      expect(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT).toBe(30000);
      expect(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT).toBe(45000);
      expect(PERFORMANCE_THRESHOLDS.MIN_PER_ATTEMPT_TIMEOUT).toBe(2000);
      expect(PERFORMANCE_THRESHOLDS.PER_ATTEMPT_TIMEOUT).toBe(10000);
    });

    it('should classify tools correctly', () => {
      expect(getToolTimeout('get_active_alarms')).toBe(15000);
      expect(getToolTimeout('search_flows')).toBe(30000);
      expect(getToolTimeout('search_enhanced_cross_reference')).toBe(45000);
      expect(getToolTimeout('unknown_tool')).toBe(15000); // Default to simple
    });
  });
});