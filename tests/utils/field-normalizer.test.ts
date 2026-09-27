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
  toSnakeCaseDeep,
  dataKeyed,
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

  // What createUnifiedResponse applies to every handler that enables field
  // normalization
  describe('toSnakeCaseDeep', () => {
    test('renames field names, through arrays and nested objects', () => {
      expect(
        toSnakeCaseDeep({
          lastSeen: 1,
          timestamp: '2025-01-01T00:00:00.000Z',
          sourceIP: '192.168.1.1',
          devices: [{ macVendor: 'Apple', network: { networkId: 'lan' } }],
          already_snake: true,
        })
      ).toEqual({
        last_seen: 1,
        ts: '2025-01-01T00:00:00.000Z',
        source_ip: '192.168.1.1',
        devices: [{ mac_vendor: 'Apple', network: { network_id: 'lan' } }],
        already_snake: true,
      });
    });

    test('keeps the text of keys that are not field names', () => {
      const keys = [
        'example.com',
        'AA:BB:CC:DD:EE:FF',
        '192.168.1.10',
        'US',
        'ID',
        'My Laptop',
        'x<U+200B>',
        'x\u{200B}',
        'wg_peer:Profile1',
      ];
      const input = Object.fromEntries(keys.map((key, i) => [key, i]));
      expect(Object.keys(toSnakeCaseDeep(input))).toEqual(keys);
    });

    test('keeps keys named like Object.prototype members, and their values', () => {
      // JSON.parse makes __proto__ an own key, as the API's JSON would
      const input = JSON.parse(
        '{"constructor":1,"toString":2,"hasOwnProperty":3,"__proto__":{"lastSeen":4}}'
      );
      const output = toSnakeCaseDeep(input);
      expect(Object.keys(output)).toEqual([
        'constructor',
        'to_string',
        'has_own_property',
        '__proto__',
      ]);
      expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(output))).toEqual(
        JSON.parse(
          '{"constructor":1,"to_string":2,"has_own_property":3,"__proto__":{"last_seen":4}}'
        )
      );
    });

    test.each([
      ['camelCase first', { fooBar: 1, foo_bar: 2 }],
      ['snake_case first', { foo_bar: 2, fooBar: 1 }],
    ])(
      'keeps both values of two keys that read the same once renamed, %s',
      (_order, input) => {
        expect(toSnakeCaseDeep(input)).toEqual({
          foo_bar: 2,
          'foo_bar <duplicate 2>': 1,
        });
      }
    );

    test('keeps both values when an alias names a key that is there', () => {
      expect(toSnakeCaseDeep({ timestamp: 'iso', ts: 1 })).toEqual({
        ts: 1,
        'ts <duplicate 2>': 'iso',
      });
    });

    test('names renamed keys in code unit order when they read the same', () => {
      // executionTime is an alias of execution_time_ms, which executionTimeMs
      // also becomes
      for (const input of [
        { executionTimeMs: 2, executionTime: 1 },
        { executionTime: 1, executionTimeMs: 2 },
      ]) {
        expect(toSnakeCaseDeep(input)).toEqual({
          execution_time_ms: 1,
          'execution_time_ms <duplicate 2>': 2,
        });
      }
    });

    test('skips a suffix another key already has', () => {
      expect(
        toSnakeCaseDeep({ fooBar: 1, foo_bar: 2, 'foo_bar <duplicate 2>': 3 })
      ).toEqual({
        foo_bar: 2,
        'foo_bar <duplicate 2>': 3,
        'foo_bar <duplicate 3>': 1,
      });
    });

    test('keeps the keys of a dataKeyed object and renames inside its values', () => {
      const counts = dataKeyed({
        remotePort: { lastSeen: 1 },
        iPhone: 2,
        remote_port: 3,
      });
      expect(toSnakeCaseDeep({ byTargetType: counts })).toEqual({
        by_target_type: {
          remotePort: { last_seen: 1 },
          iPhone: 2,
          remote_port: 3,
        },
      });
    });

    test('renames the keys of an object without a prototype', () => {
      const input = Object.assign(Object.create(null), { lastSeen: 1 });
      expect(toSnakeCaseDeep(input)).toEqual({ last_seen: 1 });
    });

    test('returns other values as they are', () => {
      const date = new Date(0);
      expect(toSnakeCaseDeep(date)).toBe(date);
      expect(toSnakeCaseDeep(null)).toBeNull();
      expect(toSnakeCaseDeep(undefined)).toBeUndefined();
      expect(toSnakeCaseDeep('fooBar')).toBe('fooBar');
    });
  });
});
