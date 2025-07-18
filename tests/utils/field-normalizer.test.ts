/**
 * Tests for Field Normalization Layer
 */

import {
  toSnakeCase,
  toCamelCase,
  isEmpty,
  normalizeFieldValue,
  normalizeFieldNames,
  normalizeObject,
  normalizeArray,
  normalizeFirewallaResponse,
  normalize,
  COMMON_FIELD_MAPPINGS,
} from '../../src/utils/field-normalizer.js';

describe('Field Normalizer', () => {
  describe('case conversion', () => {
    test('toSnakeCase converts camelCase to snake_case', () => {
      expect(toSnakeCase('sourceIP')).toBe('source_i_p');
      expect(toSnakeCase('deviceName')).toBe('device_name');
      expect(toSnakeCase('alreadySnake')).toBe('already_snake');
      expect(toSnakeCase('simple')).toBe('simple');
    });

    test('toCamelCase converts snake_case to camelCase', () => {
      expect(toCamelCase('source_ip')).toBe('sourceIp');
      expect(toCamelCase('device_name')).toBe('deviceName');
      expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel');
      expect(toCamelCase('simple')).toBe('simple');
    });
  });

  describe('isEmpty', () => {
    test('identifies empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
    });

    test('identifies non-empty values', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(false)).toBe(false);
      expect(isEmpty([1, 2, 3])).toBe(false);
      expect(isEmpty({ key: 'value' })).toBe(false);
    });
  });

  describe('normalizeFieldValue', () => {
    test('handles empty values with default', () => {
      expect(normalizeFieldValue(null, { defaultValue: 'default' })).toBe('default');
      expect(normalizeFieldValue(undefined, { defaultValue: 'default' })).toBe('default');
      expect(normalizeFieldValue('', { defaultValue: 'default' })).toBe('default');
    });

    test('removes empty values when requested', () => {
      expect(normalizeFieldValue(null, { removeEmpty: true })).toBeUndefined();
      expect(normalizeFieldValue('', { removeEmpty: true })).toBeUndefined();
    });

    test('normalizes problematic string values', () => {
      expect(normalizeFieldValue('null')).toBe(null);
      expect(normalizeFieldValue('undefined')).toBe(null);
      expect(normalizeFieldValue('N/A')).toBe(null);
      expect(normalizeFieldValue('  valid  ')).toBe('valid');
    });

    test('applies custom transform', () => {
      const transform = (value: any) => typeof value === 'string' ? value.toUpperCase() : value;
      expect(normalizeFieldValue('hello', { transform })).toBe('HELLO');
    });
  });

  describe('normalizeFieldNames', () => {
    test('converts to snake_case', () => {
      const input = { sourceIP: '192.168.1.1', deviceName: 'laptop' };
      const result = normalizeFieldNames(input, { toSnakeCase: true });
      
      expect(result).toEqual({
        source_i_p: '192.168.1.1',
        device_name: 'laptop',
      });
    });

    test('applies custom mappings', () => {
      const input = { sourceIP: '192.168.1.1', deviceName: 'laptop' };
      const result = normalizeFieldNames(input, { mappings: COMMON_FIELD_MAPPINGS });
      
      expect(result).toEqual({
        source_ip: '192.168.1.1',
        device_name: 'laptop',
      });
    });
  });

  describe('normalizeObject', () => {
    test('normalizes complete object', () => {
      const input = {
        sourceIP: '192.168.1.1',
        deviceName: '',
        validField: 'data',
        nullField: null,
      };

      const result = normalizeObject(input, {
        toSnakeCase: true,
        removeEmpty: true,
        defaultValue: 'unknown',
        mappings: COMMON_FIELD_MAPPINGS,
      });

      // With removeEmpty: true, empty fields are removed entirely
      expect(result).toEqual({
        source_ip: '192.168.1.1',
        valid_field: 'data',
      });
    });
  });

  describe('normalizeArray', () => {
    test('normalizes array of objects', () => {
      const input = [
        { sourceIP: '192.168.1.1', deviceName: 'laptop' },
        { sourceIP: '192.168.1.2', deviceName: 'phone' },
      ];

      const result = normalizeArray(input, {
        mappings: COMMON_FIELD_MAPPINGS,
      });

      expect(result).toEqual([
        { source_ip: '192.168.1.1', device_name: 'laptop' },
        { source_ip: '192.168.1.2', device_name: 'phone' },
      ]);
    });
  });

  describe('normalizeFirewallaResponse', () => {
    test('normalizes single response object', () => {
      const input = {
        sourceIP: '192.168.1.1',
        deviceName: 'laptop',
        timestamp: 1234567890,
      };

      const result = normalizeFirewallaResponse(input);

      expect(result).toEqual({
        source_ip: '192.168.1.1',
        device_name: 'laptop',
        ts: 1234567890,
      });
    });

    test('normalizes array response', () => {
      const input = [
        { sourceIP: '192.168.1.1', deviceName: 'laptop' },
        { sourceIP: '192.168.1.2', deviceName: 'phone' },
      ];

      const result = normalizeFirewallaResponse(input);

      expect(result).toEqual([
        { source_ip: '192.168.1.1', device_name: 'laptop' },
        { source_ip: '192.168.1.2', device_name: 'phone' },
      ]);
    });
  });

  describe('normalize utility functions', () => {
    test('normalize.toApi removes empty and converts to snake_case', () => {
      const input = {
        sourceIP: '192.168.1.1',
        emptyField: '',
        validField: 'data',
      };

      const result = normalize.toApi(input);

      expect(result).toEqual({
        source_ip: '192.168.1.1',
        valid_field: 'data',
      });
    });

    test('normalize.fromApi normalizes API response', () => {
      const input = { sourceIP: '192.168.1.1', deviceName: 'laptop' };
      const result = normalize.fromApi(input);

      expect(result).toEqual({
        source_ip: '192.168.1.1',
        device_name: 'laptop',
      });
    });

    test('normalize.emptyValues handles empty values only', () => {
      const input = {
        validField: 'data',
        nullField: null,
        emptyField: '',
      };

      const result = normalize.emptyValues(input);

      expect(result).toEqual({
        validField: 'data',
        nullField: null,
        emptyField: null,
      });
    });
  });
});