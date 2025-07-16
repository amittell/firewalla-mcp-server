import {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvInt,
  getOptionalEnvBoolean
} from '../../src/utils/env.js';
import { logger } from '../../src/monitoring/logger.js';

// Mock the logger
jest.mock('../../src/monitoring/logger.js', () => ({
  logger: {
    warn: jest.fn()
  }
}));

describe('Environment Variable Utilities', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to a clean state
    process.env = { ...originalEnv };
    // Clear mock calls
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('getRequiredEnvVar', () => {
    it('should return value for existing env var', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getRequiredEnvVar('TEST_VAR')).toBe('test-value');
    });

    it('should throw error for missing env var', () => {
      delete process.env.TEST_VAR;
      expect(() => getRequiredEnvVar('TEST_VAR')).toThrow(
        'Required environment variable TEST_VAR is not set'
      );
    });

    it('should throw error for empty env var', () => {
      process.env.TEST_VAR = '';
      expect(() => getRequiredEnvVar('TEST_VAR')).toThrow(
        'Required environment variable TEST_VAR is not set'
      );
    });
  });

  describe('getOptionalEnvVar', () => {
    it('should return value for existing env var', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getOptionalEnvVar('TEST_VAR', 'default')).toBe('test-value');
    });

    it('should return default for missing env var', () => {
      delete process.env.TEST_VAR;
      expect(getOptionalEnvVar('TEST_VAR', 'default')).toBe('default');
    });

    it('should return default for empty env var', () => {
      process.env.TEST_VAR = '';
      expect(getOptionalEnvVar('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('getOptionalEnvInt', () => {
    it('should parse valid integer', () => {
      process.env.TEST_INT = '42';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(42);
    });

    it('should return default for missing env var', () => {
      delete process.env.TEST_INT;
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(10);
    });

    it('should return default for empty env var', () => {
      process.env.TEST_INT = '';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(10);
    });

    it('should handle negative integers', () => {
      process.env.TEST_INT = '-42';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(-42);
    });

    it('should return default and log warning for invalid integer', () => {
      process.env.TEST_INT = 'not-a-number';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(10);
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid numeric value for environment variable',
        expect.objectContaining({
          environment_variable: 'TEST_INT',
          invalid_value: 'not-a-number',
          default_value: 10,
          action: 'using_default'
        })
      );
    });

    it('should return default for NaN values', () => {
      process.env.TEST_INT = 'NaN';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(10);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return default for Infinity values', () => {
      process.env.TEST_INT = 'Infinity';
      expect(getOptionalEnvInt('TEST_INT', 10)).toBe(10);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should enforce minimum value', () => {
      process.env.TEST_INT = '5';
      expect(() => getOptionalEnvInt('TEST_INT', 10, 10)).toThrow(
        'Environment variable TEST_INT must be at least 10, got: 5'
      );
    });

    it('should enforce maximum value', () => {
      process.env.TEST_INT = '50';
      expect(() => getOptionalEnvInt('TEST_INT', 10, undefined, 40)).toThrow(
        'Environment variable TEST_INT must be at most 40, got: 50'
      );
    });

    it('should accept value within min/max range', () => {
      process.env.TEST_INT = '25';
      expect(getOptionalEnvInt('TEST_INT', 10, 20, 30)).toBe(25);
    });

    it('should accept value at minimum boundary', () => {
      process.env.TEST_INT = '20';
      expect(getOptionalEnvInt('TEST_INT', 10, 20, 30)).toBe(20);
    });

    it('should accept value at maximum boundary', () => {
      process.env.TEST_INT = '30';
      expect(getOptionalEnvInt('TEST_INT', 10, 20, 30)).toBe(30);
    });
  });

  describe('getOptionalEnvBoolean', () => {
    describe('true values', () => {
      it.each(['true', 'TRUE', 'True', '1', 'yes', 'YES', 'on', 'ON'])(
        'should parse "%s" as true',
        (value) => {
          process.env.TEST_BOOL = value;
          expect(getOptionalEnvBoolean('TEST_BOOL', false)).toBe(true);
        }
      );

      it('should handle whitespace around true values', () => {
        process.env.TEST_BOOL = '  true  ';
        expect(getOptionalEnvBoolean('TEST_BOOL', false)).toBe(true);
      });
    });

    describe('false values', () => {
      it.each(['false', 'FALSE', 'False', '0', 'no', 'NO', 'off', 'OFF'])(
        'should parse "%s" as false',
        (value) => {
          process.env.TEST_BOOL = value;
          expect(getOptionalEnvBoolean('TEST_BOOL', true)).toBe(false);
        }
      );

      it('should handle whitespace around false values', () => {
        process.env.TEST_BOOL = '  false  ';
        expect(getOptionalEnvBoolean('TEST_BOOL', true)).toBe(false);
      });
    });

    it('should return default for missing env var', () => {
      delete process.env.TEST_BOOL;
      expect(getOptionalEnvBoolean('TEST_BOOL', true)).toBe(true);
      expect(getOptionalEnvBoolean('TEST_BOOL', false)).toBe(false);
    });

    it('should return default for empty env var', () => {
      process.env.TEST_BOOL = '';
      expect(getOptionalEnvBoolean('TEST_BOOL', true)).toBe(true);
      expect(getOptionalEnvBoolean('TEST_BOOL', false)).toBe(false);
    });

    it('should return default and log warning for invalid boolean', () => {
      process.env.TEST_BOOL = 'invalid';
      expect(getOptionalEnvBoolean('TEST_BOOL', true)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid boolean value for environment variable',
        expect.objectContaining({
          environment_variable: 'TEST_BOOL',
          invalid_value: 'invalid',
          default_value: true,
          action: 'using_default'
        })
      );
    });

    it('should handle numeric strings other than 0/1', () => {
      process.env.TEST_BOOL = '42';
      expect(getOptionalEnvBoolean('TEST_BOOL', false)).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle env vars with special characters', () => {
      process.env['TEST-VAR-SPECIAL'] = 'value';
      expect(getOptionalEnvVar('TEST-VAR-SPECIAL', 'default')).toBe('value');
    });

    it('should handle very long env var values', () => {
      const longValue = 'x'.repeat(1000);
      process.env.TEST_LONG = longValue;
      expect(getOptionalEnvVar('TEST_LONG', 'default')).toBe(longValue);
    });

    it('should handle unicode values', () => {
      process.env.TEST_UNICODE = '🔥🧱📊';
      expect(getOptionalEnvVar('TEST_UNICODE', 'default')).toBe('🔥🧱📊');
    });
  });
});