/**
 * Unit tests for data-validator utility functions
 */

import {
  validateResponseStructure,
  checkFieldTypes,
  normalizeTimestamps,
  createValidationSchema,
  type ValidationResult,
  type TypeValidationResult,
  type TimestampNormalizationResult,
  type ResponseSchema,
} from '../../src/utils/data-validator.js';

describe('Data Validator', () => {
  describe('validateResponseStructure', () => {
    it('should validate valid response structure', () => {
      const data = {
        count: 10,
        results: [{ id: 1 }, { id: 2 }],
        timestamp: '2024-01-01T00:00:00Z',
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
          timestamp: 'string',
        },
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.fieldsValidated).toBe(3);
    });

    it('should detect missing required fields', () => {
      const data = {
        count: 10,
        // missing 'results' field
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
        },
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Required field 'results' is missing");
      expect(result.metadata?.missingFields).toBe(1);
    });

    it('should detect type mismatches', () => {
      const data = {
        count: 'ten', // Should be number
        results: 'not-array', // Should be array
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
        },
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.metadata?.typeMismatches).toBe(2);
    });

    it('should handle null or undefined data', () => {
      const schema: ResponseSchema = {
        required: { field: 'string' },
      };

      const nullResult = validateResponseStructure(null, schema);
      const undefinedResult = validateResponseStructure(undefined, schema);

      expect(nullResult.isValid).toBe(false);
      expect(undefinedResult.isValid).toBe(false);
      expect(nullResult.errors).toContain('Response data is null or undefined');
    });

    it('should validate optional fields when present', () => {
      const data = {
        count: 10,
        results: [],
        cursor: 'abc123', // Optional field
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
        },
        optional: {
          cursor: 'string',
        },
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(true);
      expect(result.metadata?.fieldsValidated).toBe(3);
    });

    it('should run custom validators', () => {
      const data = {
        count: -5, // Should fail custom validation
        results: [],
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
        },
        customValidators: {
          count: (value) => ({
            isValid: value >= 0,
            error: 'Count must be non-negative',
          }),
        },
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Custom validation failed for 'count': Count must be non-negative"
      );
    });

    it('should warn about unexpected fields when not allowed', () => {
      const data = {
        count: 10,
        results: [],
        unexpected: 'field',
      };

      const schema: ResponseSchema = {
        required: {
          count: 'number',
          results: 'array',
        },
        allowAdditionalFields: false,
      };

      const result = validateResponseStructure(data, schema);

      expect(result.isValid).toBe(true); // Still valid, just warnings
      expect(result.warnings).toContain('Unexpected fields found: unexpected');
    });
  });

  describe('checkFieldTypes', () => {
    it('should validate correct field types', () => {
      const data = {
        name: 'test',
        count: 42,
        active: true,
        items: [1, 2, 3],
        metadata: { key: 'value' },
      };

      const typeMap = {
        name: 'string',
        count: 'number',
        active: 'boolean',
        items: 'array',
        metadata: 'object',
      };

      const result = checkFieldTypes(data, typeMap);

      expect(result.isValid).toBe(true);
      expect(result.metadata.summary.validFields).toBe(5);
      expect(result.metadata.summary.invalidFields).toBe(0);
    });

    it('should detect type mismatches', () => {
      const data = {
        count: '123', // Should be number
        active: 'true', // Should be boolean
      };

      const typeMap = {
        count: 'number',
        active: 'boolean',
      };

      const result = checkFieldTypes(data, typeMap);

      expect(result.isValid).toBe(false);
      expect(result.invalidFields).toHaveLength(2);
      expect(result.metadata.summary.invalidFields).toBe(2);
    });

    it('should suggest type conversions', () => {
      const data = {
        count: '123', // Convertible to number
        active: 'yes', // Convertible to boolean
      };

      const typeMap = {
        count: 'number',
        active: 'boolean',
      };

      const result = checkFieldTypes(data, typeMap);

      expect(result.metadata.summary.convertibleFields).toBe(2);
      expect(result.invalidFields[0].suggestion).toContain('Convert string');
    });

    it('should handle null and undefined values', () => {
      const data = {
        nullField: null,
        undefinedField: undefined,
      };

      const typeMap = {
        nullField: 'string',
        undefinedField: 'number',
      };

      const result = checkFieldTypes(data, typeMap);

      expect(result.isValid).toBe(false);
      expect(result.invalidFields).toHaveLength(2);
    });

    it('should handle non-object input', () => {
      const result = checkFieldTypes('not-an-object', { field: 'string' });

      expect(result.isValid).toBe(false);
      expect(result.invalidFields[0].field).toBe('<root>');
    });
  });

  describe('normalizeTimestamps', () => {
    it('should normalize Unix timestamps', () => {
      const data = {
        created_at: 1640995200, // Unix timestamp in seconds
        updated_at: 1640995200000, // Unix timestamp in milliseconds
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(true);
      expect(result.data.created_at).toBe('2022-01-01T00:00:00.000Z');
      expect(result.data.updated_at).toBe('2022-01-01T00:00:00.000Z');
      expect(result.modifications).toHaveLength(2);
    });

    it('should normalize ISO date strings', () => {
      const data = {
        timestamp: '2022-01-01T00:00:00Z',
        date: '2022-01-01',
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(true);
      expect(result.data.timestamp).toBe('2022-01-01T00:00:00.000Z');
      expect(result.data.date).toBe('2022-01-01T00:00:00.000Z');
    });

    it('should normalize Date objects', () => {
      const date = new Date('2022-01-01T00:00:00Z');
      const data = {
        timestamp: date,
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(true);
      expect(result.data.timestamp).toBe('2022-01-01T00:00:00.000Z');
      expect(result.modifications[0].modificationType).toBe('formatted');
    });

    it('should handle invalid timestamps', () => {
      const data = {
        timestamp: 'not-a-date',
        invalid_number: NaN,
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(false);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toContain('Failed to normalize timestamp');
    });

    it('should handle nested objects', () => {
      const data = {
        metadata: {
          created_at: 1640995200,
          nested: {
            timestamp: '2022-01-01T00:00:00Z',
          },
        },
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(true);
      expect(result.modifications).toHaveLength(2);
      expect(result.modifications[0].field).toBe('metadata.created_at');
      expect(result.modifications[1].field).toBe('metadata.nested.timestamp');
    });

    it('should handle non-object input', () => {
      const result = normalizeTimestamps(null);

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Input data is not an object');
    });

    it('should detect timestamp fields by naming patterns', () => {
      const data = {
        lastSeen: 1640995200,
        createdAt: '2022-01-01T00:00:00Z',
        expire_time: new Date('2022-01-01'),
        regular_field: 'not-a-timestamp',
      };

      const result = normalizeTimestamps(data);

      expect(result.success).toBe(true);
      expect(result.modifications).toHaveLength(3); // Only timestamp fields modified
      expect(result.data.regular_field).toBe('not-a-timestamp'); // Unchanged
    });
  });

  describe('createValidationSchema', () => {
    it('should create appropriate schema for alarms', () => {
      const schema = createValidationSchema('alarms');

      expect(schema.required).toHaveProperty('count', 'number');
      expect(schema.required).toHaveProperty('results', 'array');
      expect(schema.customValidators).toHaveProperty('count');
    });

    it('should create appropriate schema for flows', () => {
      const schema = createValidationSchema('flows');

      expect(schema.required).toHaveProperty('count', 'number');
      expect(schema.required).toHaveProperty('results', 'array');
      expect(schema.optional).toHaveProperty('query_executed', 'string');
      expect(schema.optional).toHaveProperty('aggregations', 'object');
    });

    it('should create appropriate schema for devices', () => {
      const schema = createValidationSchema('devices');

      expect(schema.required).toHaveProperty('count', 'number');
      expect(schema.required).toHaveProperty('results', 'array');
      expect(schema.optional).toHaveProperty('total_count', 'number');
    });

    it('should create base schema for unknown types', () => {
      const schema = createValidationSchema('unknown');

      expect(schema.required).toHaveProperty('count', 'number');
      expect(schema.required).toHaveProperty('results', 'array');
      expect(schema.allowAdditionalFields).toBe(true);
    });
  });

  describe('Edge cases and performance', () => {
    it('should handle very large datasets efficiently', () => {
      const largeData = {
        count: 10000,
        results: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      };

      const schema = createValidationSchema('test');
      const startTime = Date.now();
      const result = validateResponseStructure(largeData, schema);
      const endTime = Date.now();

      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    it('should handle deeply nested structures', () => {
      const deepData: any = { level0: {} };
      let current = deepData.level0;
      for (let i = 1; i < 10; i++) {
        current[`level${i}`] = {};
        current = current[`level${i}`];
      }
      current.timestamp = 1640995200;

      const result = normalizeTimestamps(deepData);

      expect(result.success).toBe(true);
      expect(result.modifications).toHaveLength(1);
    });

    it('should handle special number values', () => {
      const data = {
        infinity: Infinity,
        negativeInfinity: -Infinity,
        notANumber: NaN,
        zero: 0,
        negative: -42,
      };

      const typeMap = {
        infinity: 'number',
        negativeInfinity: 'number',
        notANumber: 'number',
        zero: 'number',
        negative: 'number',
      };

      const result = checkFieldTypes(data, typeMap);

      // All are technically numbers in JavaScript
      expect(result.isValid).toBe(true);
    });
  });
});