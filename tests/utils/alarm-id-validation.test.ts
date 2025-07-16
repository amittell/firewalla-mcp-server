import { validateAlarmId, validateAlarmIdSafe } from '../../src/utils/alarm-id-validation.js';

describe('alarm-id-validation', () => {
  describe('validateAlarmId', () => {
    it('should accept valid string IDs', () => {
      expect(validateAlarmId('alarm-123')).toBe('alarm-123');
      expect(validateAlarmId('abc-def-123')).toBe('abc-def-123');
      expect(validateAlarmId('12345')).toBe('12345');
    });

    it('should accept valid number IDs', () => {
      expect(validateAlarmId(12345)).toBe('12345');
      expect(validateAlarmId(1)).toBe('1');
    });

    it('should trim whitespace', () => {
      expect(validateAlarmId('  alarm-123  ')).toBe('alarm-123');
      expect(validateAlarmId('\talarm-123\n')).toBe('alarm-123');
    });

    it('should throw error for empty string', () => {
      expect(() => validateAlarmId('')).toThrow('Invalid alarm ID: cannot be empty');
      expect(() => validateAlarmId('   ')).toThrow('Invalid alarm ID: cannot be empty');
    });

    it('should throw error for invalid special values', () => {
      expect(() => validateAlarmId('0')).toThrow('Invalid alarm ID: "0" is not a valid alarm ID');
      expect(() => validateAlarmId('null')).toThrow('Invalid alarm ID: "null" is not a valid alarm ID');
      expect(() => validateAlarmId('undefined')).toThrow('Invalid alarm ID: "undefined" is not a valid alarm ID');
    });

    it('should throw error for zero number', () => {
      expect(() => validateAlarmId(0)).toThrow('Invalid alarm ID: "0" is not a valid alarm ID');
    });

    it('should handle edge cases', () => {
      // These should be valid since they're not exactly '0', 'null', or 'undefined'
      expect(validateAlarmId('0abc')).toBe('0abc');
      expect(validateAlarmId('null123')).toBe('null123');
      expect(validateAlarmId('undefined-alarm')).toBe('undefined-alarm');
    });
  });

  describe('validateAlarmIdSafe', () => {
    it('should return valid IDs', () => {
      expect(validateAlarmIdSafe('alarm-123')).toBe('alarm-123');
      expect(validateAlarmIdSafe(12345)).toBe('12345');
    });

    it('should return null for invalid IDs', () => {
      expect(validateAlarmIdSafe('')).toBe(null);
      expect(validateAlarmIdSafe('0')).toBe(null);
      expect(validateAlarmIdSafe('null')).toBe(null);
      expect(validateAlarmIdSafe('undefined')).toBe(null);
      expect(validateAlarmIdSafe(0)).toBe(null);
    });

    it('should handle whitespace cases', () => {
      expect(validateAlarmIdSafe('  alarm-123  ')).toBe('alarm-123');
      expect(validateAlarmIdSafe('   ')).toBe(null);
    });
  });
});