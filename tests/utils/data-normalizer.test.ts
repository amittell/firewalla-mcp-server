/**
 * Unit tests for data-normalizer utility functions
 */

import {
  normalizeUnknownFields,
  sanitizeFieldValue,
  ensureConsistentGeoData,
  batchNormalize,
  type NormalizationConfig,
  type SanitizationResult,
} from '../../src/utils/data-normalizer.js';
import type { GeographicData } from '../../src/types.js';

describe('Data Normalizer', () => {
  describe('normalizeUnknownFields', () => {
    it('should normalize various unknown value representations', () => {
      const data = {
        country: 'Unknown',
        city: '',
        region: null,
        isp: 'n/a',
        vendor: 'N/A',
        status: 'none',
      };

      const result = normalizeUnknownFields(data);

      expect(result).toEqual({
        country: 'unknown',
        city: 'unknown',
        region: 'unknown',
        isp: 'unknown',
        vendor: 'unknown',
        status: 'unknown',
      });
    });

    it('should handle arrays of objects', () => {
      const data = [
        { name: 'Device 1', status: 'Unknown' },
        { name: 'Device 2', status: 'active' },
      ];

      const result = normalizeUnknownFields(data);

      expect(result).toEqual([
        { name: 'Device 1', status: 'unknown' },
        { name: 'Device 2', status: 'active' },
      ]);
    });

    it('should respect custom normalization config', () => {
      const data = { field: null };
      const config: Partial<NormalizationConfig> = {
        defaultUnknownValue: 'missing',
        preserveNull: false,
      };

      const result = normalizeUnknownFields(data, config);

      expect(result.field).toBe('missing');
    });

    it('should handle nested objects recursively', () => {
      const data = {
        device: {
          info: {
            vendor: 'Unknown',
            model: 'active',
          },
        },
      };

      const result = normalizeUnknownFields(data);

      expect(result.device.info.vendor).toBe('unknown');
      expect(result.device.info.model).toBe('active');
    });
  });

  describe('sanitizeFieldValue', () => {
    it('should trim whitespace from strings', () => {
      const result = sanitizeFieldValue('  test value  ');

      expect(result.value).toBe('test value');
      expect(result.wasModified).toBe(true);
      expect(result.modifications).toContain('trimmed whitespace');
    });

    it('should replace null with default value', () => {
      const result = sanitizeFieldValue(null, 'default');

      expect(result.value).toBe('default');
      expect(result.wasModified).toBe(true);
      expect(result.modifications).toContain('replaced null with default');
    });

    it('should handle empty strings', () => {
      const result = sanitizeFieldValue('', 'fallback');

      expect(result.value).toBe('fallback');
      expect(result.wasModified).toBe(true);
      expect(result.modifications).toContain('replaced empty string with default');
    });

    it('should handle NaN numbers', () => {
      const result = sanitizeFieldValue(NaN, 0);

      expect(result.value).toBe(0);
      expect(result.wasModified).toBe(true);
      expect(result.modifications).toContain('replaced NaN with default');
    });

    it('should return unchanged valid values', () => {
      const result = sanitizeFieldValue('valid string');

      expect(result.value).toBe('valid string');
      expect(result.wasModified).toBe(false);
      expect(result.modifications).toHaveLength(0);
    });
  });

  describe('ensureConsistentGeoData', () => {
    it('should normalize geographic data fields', () => {
      const rawGeo = {
        Country: 'UNITED STATES',
        countryCode: 'us',
        City: '',
        Region: 'california',
        ASN: '12345',
        is_vpn: 'true',
      };

      const result = ensureConsistentGeoData(rawGeo);

      expect(result.country).toBe('United States');
      expect(result.country_code).toBe('US');
      expect(result.city).toBe('unknown');
      expect(result.region).toBe('California');
      expect(result.asn).toBe(12345);
      expect(result.is_vpn).toBe(true);
    });

    it('should handle missing geographic data', () => {
      const result = ensureConsistentGeoData(null);

      expect(result).toEqual({
        country: 'unknown',
        country_code: 'UN',
        continent: 'unknown',
        region: 'unknown',
        city: 'unknown',
        timezone: 'unknown',
      });
    });

    it('should normalize country codes to ISO format', () => {
      const rawGeo = {
        country_code: 'usa', // Invalid length
      };

      const result = ensureConsistentGeoData(rawGeo);

      expect(result.country_code).toBe('UN'); // Should default to unknown
    });

    it('should handle boolean field variations', () => {
      const rawGeo = {
        is_cloud_provider: 'yes',
        is_proxy: '1',
        is_vpn: 'false',
      };

      const result = ensureConsistentGeoData(rawGeo);

      expect(result.is_cloud_provider).toBe(true);
      expect(result.is_proxy).toBe(true);
      expect(result.is_vpn).toBe(false);
    });
  });

  describe('batchNormalize', () => {
    it('should apply normalizers to array of objects', () => {
      const data = [
        { name: '  Device 1  ', status: 'Unknown' },
        { name: null, status: 'active' },
      ];

      const normalizers = {
        name: (v: any) => sanitizeFieldValue(v, 'unnamed').value,
        status: (v: any) => normalizeUnknownFields(v),
      };

      const result = batchNormalize(data, normalizers);

      expect(result).toEqual([
        { name: 'Device 1', status: 'unknown' },
        { name: 'unnamed', status: 'active' },
      ]);
    });

    it('should handle empty arrays', () => {
      const result = batchNormalize([], {});

      expect(result).toEqual([]);
    });

    it('should handle non-array input gracefully', () => {
      const result = batchNormalize(null as any, {});

      expect(result).toEqual([]);
    });

    it('should skip normalization for missing fields', () => {
      const data = [{ existing: 'value' }];
      const normalizers = {
        missing: (v: any) => 'normalized',
        existing: (v: any) => v.toUpperCase(),
      };

      const result = batchNormalize(data, normalizers);

      expect(result).toEqual([{ existing: 'VALUE' }]);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle circular references gracefully', () => {
      const circular: any = { prop: 'value' };
      circular.self = circular;

      // This should not throw an error
      const result = normalizeUnknownFields(circular);
      expect(result.prop).toBe('value');
      expect(result.self).toBe('[Circular Reference]');
    });

    it('should handle very large objects', () => {
      const largeObject: any = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = `value${i}`;
      }

      const result = normalizeUnknownFields(largeObject);

      expect(Object.keys(result)).toHaveLength(1000);
    });

    it('should handle special characters in field values', () => {
      const data = {
        special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        unicode: '🔥🌍🚀',
        mixed: 'Test 123 !@# 🎉',
      };

      const result = normalizeUnknownFields(data);

      expect(result.special).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?');
      expect(result.unicode).toBe('🔥🌍🚀');
      expect(result.mixed).toBe('Test 123 !@# 🎉');
    });
  });
});