/**
 * Comprehensive unit tests for timestamp utility functions
 * Tests edge cases, boundary conditions, and error handling
 */

import { 
  unixToISOString, 
  safeUnixToISOString, 
  unixToISOStringOrNow, 
  getCurrentTimestamp 
} from '../../src/utils/timestamp.js';

describe('Timestamp Utilities - Edge Cases', () => {
  describe('unixToISOString', () => {
    test('should convert valid Unix timestamp to ISO string', () => {
      const timestamp = 1672531200; // 2023-01-01T00:00:00.000Z
      const result = unixToISOString(timestamp);
      expect(result).toBe('2023-01-01T00:00:00.000Z');
    });

    test('should handle string timestamps', () => {
      const timestamp = '1672531200';
      const result = unixToISOString(timestamp);
      expect(result).toBe('2023-01-01T00:00:00.000Z');
    });

    test('should throw error for null timestamp', () => {
      expect(() => unixToISOString(null)).toThrow('Timestamp cannot be null or undefined');
    });

    test('should throw error for undefined timestamp', () => {
      expect(() => unixToISOString(undefined)).toThrow('Timestamp cannot be null or undefined');
    });

    test('should throw error for NaN timestamp', () => {
      expect(() => unixToISOString(NaN)).toThrow('Invalid timestamp: NaN');
    });

    test('should throw error for Infinity timestamp', () => {
      expect(() => unixToISOString(Infinity)).toThrow('Invalid timestamp: Infinity');
    });

    test('should throw error for negative timestamp', () => {
      expect(() => unixToISOString(-1)).toThrow('Invalid timestamp: -1');
    });

    test('should throw error for invalid string timestamp', () => {
      expect(() => unixToISOString('invalid')).toThrow('Invalid timestamp: invalid');
    });

    test('should handle empty string timestamp as invalid', () => {
      // Empty string cannot be parsed as a valid timestamp
      expect(() => unixToISOString('')).toThrow('Invalid timestamp:');
    });

    test('should handle zero timestamp (Unix epoch)', () => {
      // Zero is outside the valid range (2000-2100) in detectAndConvertTimestamp
      expect(() => unixToISOString(0)).toThrow('Invalid timestamp: 0');
    });

    test('should handle large valid timestamp', () => {
      const timestamp = 2147483647; // Max 32-bit signed integer
      const result = unixToISOString(timestamp);
      expect(result).toBe('2038-01-19T03:14:07.000Z');
    });

    test('should handle float timestamp (should work)', () => {
      const timestamp = 1672531200.5;
      const result = unixToISOString(timestamp);
      expect(result).toBe('2023-01-01T00:00:00.500Z');
    });
  });

  describe('safeUnixToISOString', () => {
    test('should return ISO string for valid timestamp', () => {
      const timestamp = 1672531200;
      const result = safeUnixToISOString(timestamp);
      expect(result).toBe('2023-01-01T00:00:00.000Z');
    });

    test('should return default fallback for null timestamp', () => {
      const result = safeUnixToISOString(null);
      expect(result).toBe('Never');
    });

    test('should return default fallback for undefined timestamp', () => {
      const result = safeUnixToISOString(undefined);
      expect(result).toBe('Never');
    });

    test('should return custom fallback for invalid timestamp', () => {
      const result = safeUnixToISOString(null, 'Custom Fallback');
      expect(result).toBe('Custom Fallback');
    });

    test('should return fallback for NaN timestamp', () => {
      const result = safeUnixToISOString(NaN, 'Invalid');
      expect(result).toBe('Invalid');
    });

    test('should return fallback for negative timestamp', () => {
      const result = safeUnixToISOString(-1, 'Negative');
      expect(result).toBe('Negative');
    });

    test('should return fallback for invalid string', () => {
      const result = safeUnixToISOString('invalid', 'Bad String');
      expect(result).toBe('Bad String');
    });

    test('should handle zero timestamp', () => {
      const result = safeUnixToISOString(0);
      expect(result).toBe('Never');
    });

    test('should handle empty string as invalid', () => {
      const result = safeUnixToISOString('', 'Empty');
      // Empty string is invalid and should return fallback
      expect(result).toBe('Empty');
    });

    test('should handle object input gracefully', () => {
      const result = safeUnixToISOString({} as any, 'Object');
      expect(result).toBe('Object');
    });

    test('should handle array input gracefully', () => {
      const result = safeUnixToISOString([] as any, 'Array');
      expect(result).toBe('Array');
    });
  });

  describe('unixToISOStringOrNow', () => {
    test('should return ISO string for valid timestamp', () => {
      const timestamp = 1672531200;
      const result = unixToISOStringOrNow(timestamp);
      expect(result).toBe('2023-01-01T00:00:00.000Z');
    });

    test('should return current time for null timestamp', () => {
      const result = unixToISOStringOrNow(null);
      // Should return a valid ISO timestamp string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return current time for undefined timestamp', () => {
      const result = unixToISOStringOrNow(undefined);
      // Should return a valid ISO timestamp string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return current time for invalid timestamp', () => {
      const result = unixToISOStringOrNow(NaN);
      // Should return a valid ISO timestamp string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return current time for negative timestamp', () => {
      const result = unixToISOStringOrNow(-1);
      // Should return a valid ISO timestamp string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('getCurrentTimestamp', () => {
    test('should return ISO timestamp string', () => {
      const result = getCurrentTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return different timestamps when called multiple times', async () => {
      const timestamp1 = getCurrentTimestamp();
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait 10ms to ensure different timestamps
      const timestamp2 = getCurrentTimestamp();
      expect(timestamp1).not.toBe(timestamp2);
    });

    test('should return valid Date-parseable string', () => {
      const result = getCurrentTimestamp();
      const parsed = new Date(result);
      expect(parsed.toISOString()).toBe(result);
    });
  });

  describe('Boundary Value Analysis', () => {
    test('should handle minimum safe Unix timestamp', () => {
      const result = safeUnixToISOString(0);
      expect(result).toBe('Never');
    });

    test('should handle maximum safe Unix timestamp', () => {
      const maxSafeTimestamp = 8640000000000; // Year 275760 - outside valid range
      const result = safeUnixToISOString(maxSafeTimestamp);
      // This timestamp is outside the valid range, should return fallback
      expect(result).toBe('Never');
    });

    test('should handle timestamp at edge of 32-bit integer', () => {
      const result = safeUnixToISOString(2147483647);
      expect(result).toBe('2038-01-19T03:14:07.000Z');
    });

    test('should handle timestamp just beyond 32-bit integer', () => {
      const result = safeUnixToISOString(2147483648);
      expect(result).toBe('2038-01-19T03:14:08.000Z');
    });
  });

  describe('Type Safety Edge Cases', () => {
    test('should handle boolean input safely', () => {
      const result = safeUnixToISOString(true as any, 'Boolean');
      expect(result).toBe('Boolean');
    });

    test('should handle function input safely', () => {
      const result = safeUnixToISOString((() => {}) as any, 'Function');
      expect(result).toBe('Function');
    });

    test('should handle symbol input safely', () => {
      const result = safeUnixToISOString(Symbol('test') as any, 'Symbol');
      expect(result).toBe('Symbol');
    });

    test('should handle bigint input safely', () => {
      const result = safeUnixToISOString(BigInt(1672531200) as any, 'BigInt');
      expect(result).toBe('BigInt');
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle very large array of timestamps efficiently', () => {
      const timestamps = Array.from({ length: 1000 }, (_, i) => 1672531200 + i);
      const start = Date.now();
      
      timestamps.forEach(ts => safeUnixToISOString(ts));
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
    });

    test('should handle concurrent timestamp conversions', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => 
        Promise.resolve(safeUnixToISOString(1672531200 + i))
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      expect(results.every(result => result.includes('2023-01-01'))).toBe(true);
    });
  });
});