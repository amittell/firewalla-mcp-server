import { 
  safeString, 
  safeNumber, 
  safeBoolean, 
  sanitizeToolArgs 
} from '../../src/utils/null-safety.js';

describe('null-safety utilities', () => {
  describe('safeString', () => {
    it('should return string value as is', () => {
      expect(safeString('hello')).toBe('hello');
    });

    it('should convert number to string', () => {
      expect(safeString(123)).toBe('123');
    });

    it('should convert boolean to string', () => {
      expect(safeString(true)).toBe('true');
      expect(safeString(false)).toBe('false');
    });

    it('should return default value for null', () => {
      expect(safeString(null)).toBe('');
      expect(safeString(null, 'default')).toBe('default');
    });

    it('should return default value for undefined', () => {
      expect(safeString(undefined)).toBe('');
      expect(safeString(undefined, 'default')).toBe('default');
    });

    it('should convert object to string', () => {
      expect(safeString({ key: 'value' })).toBe('[object Object]');
    });

    it('should convert array to string', () => {
      expect(safeString([1, 2, 3])).toBe('1,2,3');
    });
  });

  describe('safeNumber', () => {
    it('should return number value as is', () => {
      expect(safeNumber(123)).toBe(123);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-456)).toBe(-456);
    });

    it('should convert string to number', () => {
      expect(safeNumber('123')).toBe(123);
      expect(safeNumber('123.45')).toBe(123.45);
    });

    it('should return default value for null', () => {
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(null, 100)).toBe(100);
    });

    it('should return default value for undefined', () => {
      expect(safeNumber(undefined)).toBe(0);
      expect(safeNumber(undefined, 100)).toBe(100);
    });

    it('should return default value for non-numeric strings', () => {
      expect(safeNumber('abc')).toBe(0);
      expect(safeNumber('abc', 50)).toBe(50);
    });

    it('should handle special number values', () => {
      expect(safeNumber('Infinity')).toBe(Infinity);
      expect(safeNumber('-Infinity')).toBe(-Infinity);
    });

    it('should return default for NaN', () => {
      expect(safeNumber(NaN)).toBe(0);
      expect(safeNumber(NaN, 10)).toBe(10);
    });
  });

  describe('safeBoolean', () => {
    it('should return boolean value as is', () => {
      expect(safeBoolean(true)).toBe(true);
      expect(safeBoolean(false)).toBe(false);
    });

    it('should convert truthy values to true', () => {
      expect(safeBoolean(1)).toBe(true);
      expect(safeBoolean('hello')).toBe(true);
      expect(safeBoolean([])).toBe(true);
      expect(safeBoolean({})).toBe(true);
    });

    it('should convert falsy values to false', () => {
      expect(safeBoolean(0)).toBe(false);
      expect(safeBoolean('')).toBe(false);
    });

    it('should return default value for null', () => {
      expect(safeBoolean(null)).toBe(false);
      expect(safeBoolean(null, true)).toBe(true);
    });

    it('should return default value for undefined', () => {
      expect(safeBoolean(undefined)).toBe(false);
      expect(safeBoolean(undefined, true)).toBe(true);
    });
  });

  describe('sanitizeToolArgs', () => {
    it('should return empty object for null input', () => {
      expect(sanitizeToolArgs(null)).toEqual({});
    });

    it('should return empty object for undefined input', () => {
      expect(sanitizeToolArgs(undefined)).toEqual({});
    });

    it('should return empty object for non-object input', () => {
      expect(sanitizeToolArgs('string')).toEqual({});
      expect(sanitizeToolArgs(123)).toEqual({});
      expect(sanitizeToolArgs(true)).toEqual({});
    });

    it('should preserve valid values', () => {
      const input = {
        string: 'hello',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        zero: 0,
        emptyString: '',
        false: false
      };
      expect(sanitizeToolArgs(input)).toEqual(input);
    });

    it('should remove null and undefined values', () => {
      const input = {
        valid: 'keep',
        null: null,
        undefined: undefined,
        another: 'also keep'
      };
      expect(sanitizeToolArgs(input)).toEqual({
        valid: 'keep',
        another: 'also keep'
      });
    });

    it('should handle nested objects', () => {
      const input = {
        level1: {
          level2: {
            valid: 'keep',
            null: null
          },
          keep: 'this'
        }
      };
      expect(sanitizeToolArgs(input)).toEqual({
        level1: {
          level2: {
            valid: 'keep'
          },
          keep: 'this'
        }
      });
    });

    it('should remove empty nested objects', () => {
      const input = {
        level1: {
          level2: {
            null: null,
            undefined: undefined
          }
        },
        keep: 'this'
      };
      expect(sanitizeToolArgs(input)).toEqual({
        keep: 'this'
      });
    });

    it('should preserve arrays as is', () => {
      const input = {
        array: [1, null, undefined, 'hello', { key: 'value' }]
      };
      expect(sanitizeToolArgs(input)).toEqual(input);
    });
  });
});