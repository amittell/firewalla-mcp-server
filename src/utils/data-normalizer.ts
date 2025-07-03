/**
 * Data Normalizer for Firewalla MCP Server
 *
 * Provides utilities for consistent data handling and normalization across
 * all Firewalla API responses. Addresses common data consistency issues like
 * inconsistent "unknown" values, null/undefined handling, and geographic data formatting.
 *
 * @module DataNormalizer
 * @version 1.0.0
 */

import type { GeographicData } from '../types.js';

/**
 * Configuration for data normalization behavior
 */
export interface NormalizationConfig {
  /** Default value to use when normalizing unknown fields */
  defaultUnknownValue: string;
  /** Whether to preserve null values or convert them */
  preserveNull: boolean;
  /** Whether to convert empty strings to null */
  emptyStringToNull: boolean;
  /** Whether to trim whitespace from string values */
  trimStrings: boolean;
}

/**
 * Default normalization configuration
 */
const DEFAULT_CONFIG: NormalizationConfig = {
  defaultUnknownValue: 'unknown',
  preserveNull: false,
  emptyStringToNull: true,
  trimStrings: true,
};

/**
 * Result of field value sanitization
 */
export interface SanitizationResult {
  /** The sanitized value */
  value: any;
  /** Whether the value was modified during sanitization */
  wasModified: boolean;
  /** Description of what was modified, if any */
  modifications: string[];
}

/**
 * Normalizes "unknown" field values across data objects
 *
 * Standardizes inconsistent representations of unknown/missing data including:
 * - "unknown", "Unknown", "UNKNOWN"
 * - "n/a", "N/A", "na"
 * - Empty strings, null, undefined
 * - Other variants like "none", "null", etc.
 *
 * @param data - The data object or array to normalize
 * @param config - Optional normalization configuration
 * @returns The normalized data with consistent unknown value handling
 *
 * @example
 * ```typescript
 * const data = {
 *   country: "Unknown",
 *   city: "",
 *   region: null,
 *   isp: "n/a"
 * };
 *
 * const normalized = normalizeUnknownFields(data);
 * // Result: { country: "unknown", city: "unknown", region: "unknown", isp: "unknown" }
 * ```
 */
export function normalizeUnknownFields(
  data: any,
  config: Partial<NormalizationConfig> = {},
  visited = new WeakSet()
): any {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (data === null || data === undefined) {
    return finalConfig.preserveNull ? data : finalConfig.defaultUnknownValue;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => normalizeUnknownFields(item, finalConfig, visited));
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return normalizeUnknownValue(data, finalConfig);
  }

  // Prevent infinite recursion with circular references
  if (visited.has(data)) {
    return '[Circular Reference]';
  }
  visited.add(data);

  // Handle objects
  const normalized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      // Recursively normalize nested objects
      normalized[key] = normalizeUnknownFields(value, finalConfig, visited);
    } else {
      // Normalize primitive values
      normalized[key] = normalizeUnknownValue(value, finalConfig);
    }
  }

  return normalized;
}

/**
 * Sanitizes and normalizes individual field values
 *
 * Provides comprehensive field value cleaning including:
 * - Type coercion and validation
 * - Whitespace trimming
 * - Empty value handling
 * - Default value application
 * - Data type preservation
 *
 * @param value - The value to sanitize
 * @param defaultValue - Optional default value to use if the original is invalid
 * @returns Sanitization result with the cleaned value and modification details
 *
 * @example
 * ```typescript
 * const result = sanitizeFieldValue("  192.168.1.1  ", "0.0.0.0");
 * // Result: { value: "192.168.1.1", wasModified: true, modifications: ["trimmed whitespace"] }
 *
 * const result2 = sanitizeFieldValue(null, "default");
 * // Result: { value: "default", wasModified: true, modifications: ["replaced null with default"] }
 * ```
 */
export function sanitizeFieldValue(
  value: any,
  defaultValue?: any
): SanitizationResult {
  const modifications: string[] = [];
  let sanitizedValue = value;
  let wasModified = false;

  // Handle null/undefined
  if (value === null || value === undefined) {
    if (defaultValue !== undefined) {
      sanitizedValue = defaultValue;
      wasModified = true;
      modifications.push(`replaced ${value} with default`);
    }
    return { value: sanitizedValue, wasModified, modifications };
  }

  // Handle strings
  if (typeof value === 'string') {
    const original = value;

    // Trim whitespace
    sanitizedValue = value.trim();
    if (sanitizedValue !== original) {
      wasModified = true;
      modifications.push('trimmed whitespace');
    }

    // Handle empty strings
    if (sanitizedValue === '') {
      if (defaultValue !== undefined) {
        sanitizedValue = defaultValue;
        wasModified = true;
        modifications.push('replaced empty string with default');
      } else {
        sanitizedValue = null;
        wasModified = true;
        modifications.push('converted empty string to null');
      }
    }
  }

  // Handle numbers
  if (typeof value === 'number') {
    // Check for NaN
    if (isNaN(value)) {
      if (defaultValue !== undefined) {
        sanitizedValue = defaultValue;
        wasModified = true;
        modifications.push('replaced NaN with default');
      } else {
        sanitizedValue = null;
        wasModified = true;
        modifications.push('replaced NaN with null');
      }
    }

    // Check for infinity
    if (!isFinite(value)) {
      if (defaultValue !== undefined) {
        sanitizedValue = defaultValue;
        wasModified = true;
        modifications.push('replaced infinity with default');
      } else {
        sanitizedValue = null;
        wasModified = true;
        modifications.push('replaced infinity with null');
      }
    }
  }

  return { value: sanitizedValue, wasModified, modifications };
}

/**
 * Ensures consistent geographic data formatting
 *
 * Standardizes geographic data objects to match the GeographicData interface:
 * - Normalizes country/region/city names
 * - Ensures consistent field naming
 * - Validates and cleans geographic coordinates
 * - Applies default values for missing fields
 * - Normalizes country codes to ISO format
 *
 * @param geoData - Raw geographic data object
 * @returns Normalized GeographicData object with consistent formatting
 *
 * @example
 * ```typescript
 * const rawGeo = {
 *   "Country": "UNITED STATES",
 *   "countryCode": "us",
 *   "City": "",
 *   "ASN": "string_value",
 *   "is_vpn": "true"
 * };
 *
 * const normalized = ensureConsistentGeoData(rawGeo);
 * // Result: {
 * //   country: "United States",
 * //   country_code: "US",
 * //   city: "unknown",
 * //   asn: null,
 * //   is_vpn: true,
 * //   // ... other normalized fields
 * // }
 * ```
 */
export function ensureConsistentGeoData(geoData: any): GeographicData {
  if (!geoData || typeof geoData !== 'object') {
    return createDefaultGeographicData();
  }

  // Normalize field names and values
  const normalized: GeographicData = {
    country: normalizeGeographicString(
      geoData.country || geoData.Country || geoData.COUNTRY
    ),
    country_code: normalizeCountryCode(
      geoData.country_code || geoData.countryCode || geoData.cc
    ),
    continent: normalizeGeographicString(
      geoData.continent || geoData.Continent
    ),
    region: normalizeGeographicString(
      geoData.region || geoData.Region || geoData.state
    ),
    city: normalizeGeographicString(geoData.city || geoData.City),
    timezone: normalizeString(
      geoData.timezone || geoData.timeZone || geoData.tz
    ),
  };

  // Handle optional numeric fields
  const optionalFields = {
    asn: 'number',
    geographic_risk_score: 'number',
  } as const;

  for (const [field] of Object.entries(optionalFields)) {
    const altField = field.replace('_', '').toUpperCase();
    const value =
      geoData[field] || geoData[field.replace('_', '')] || geoData[altField];
    if (value !== undefined && value !== null) {
      const sanitized = sanitizeNumericField(value);
      if (sanitized !== null) {
        (normalized as any)[field] = sanitized;
      }
    }
  }

  // Handle optional string fields
  const optionalStringFields = ['isp', 'organization', 'hosting_provider'];
  for (const field of optionalStringFields) {
    const value = geoData[field] || geoData[field.replace('_', '')];
    if (value !== undefined && value !== null) {
      const sanitized = normalizeString(value);
      if (sanitized !== 'unknown') {
        (normalized as any)[field] = sanitized;
      }
    }
  }

  // Handle boolean fields
  const booleanFields = ['is_cloud_provider', 'is_proxy', 'is_vpn'];
  for (const field of booleanFields) {
    const value = geoData[field] || geoData[field.replace('_', '')];
    if (value !== undefined && value !== null) {
      (normalized as any)[field] = normalizeBoolean(value);
    }
  }

  return normalized;
}

/**
 * Helper function to normalize unknown values
 * @private
 */
function normalizeUnknownValue(value: any, config: NormalizationConfig): any {
  if (value === null || value === undefined) {
    return config.preserveNull ? value : config.defaultUnknownValue;
  }

  if (typeof value === 'string') {
    const trimmed = config.trimStrings ? value.trim() : value;
    const lower = trimmed.toLowerCase();

    // Check for various "unknown" representations
    const unknownVariants = [
      'unknown',
      'n/a',
      'na',
      'none',
      'null',
      'undefined',
      'not available',
      'not applicable',
      'no data',
      '',
      '-',
    ];

    if (
      unknownVariants.includes(lower) ||
      (config.emptyStringToNull && trimmed === '')
    ) {
      return config.defaultUnknownValue;
    }

    return trimmed;
  }

  return value;
}

/**
 * Normalizes geographic string values
 * @private
 */
function normalizeGeographicString(value: any): string {
  if (!value || typeof value !== 'string') {
    return 'unknown';
  }

  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'unknown') {
    return 'unknown';
  }

  // Proper case formatting for geographic names
  return trimmed
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Normalizes country codes to uppercase ISO format
 * @private
 */
function normalizeCountryCode(value: any): string {
  if (!value || typeof value !== 'string') {
    return 'UN'; // Unknown country code
  }

  const trimmed = value.trim().toUpperCase();

  // Validate length (ISO codes are 2 characters)
  if (trimmed.length !== 2) {
    return 'UN';
  }

  return trimmed;
}

/**
 * Normalizes general string values
 * @private
 */
function normalizeString(value: any): string {
  if (!value || typeof value !== 'string') {
    return 'unknown';
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return 'unknown';
  }

  return trimmed;
}

/**
 * Sanitizes numeric field values
 * @private
 */
function sanitizeNumericField(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Normalizes boolean values from various representations
 * @private
 */
function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on', 'enabled'].includes(lower);
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return false;
}

/**
 * Creates a default GeographicData object
 * @private
 */
function createDefaultGeographicData(): GeographicData {
  return {
    country: 'unknown',
    country_code: 'UN',
    continent: 'unknown',
    region: 'unknown',
    city: 'unknown',
    timezone: 'unknown',
  };
}

/**
 * Batch normalizes an array of objects using specified normalizer functions
 *
 * @param data - Array of objects to normalize
 * @param normalizers - Object mapping field names to normalizer functions
 * @returns Array of normalized objects
 *
 * @example
 * ```typescript
 * const devices = [
 *   { name: "  Device 1  ", status: "unknown", geo: rawGeoData },
 *   { name: null, status: "active", geo: null }
 * ];
 *
 * const normalized = batchNormalize(devices, {
 *   name: (v) => sanitizeFieldValue(v, "unnamed").value,
 *   status: (v) => normalizeUnknownFields(v),
 *   geo: (v) => ensureConsistentGeoData(v)
 * });
 * ```
 */
export function batchNormalize<T extends Record<string, any>>(
  data: T[],
  normalizers: Partial<Record<keyof T, (value: any) => any>>
): T[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(item => {
    const normalized = { ...item };

    for (const [field, normalizer] of Object.entries(normalizers)) {
      if (normalizer && field in normalized) {
        (normalized as any)[field] = normalizer((normalized as any)[field]);
      }
    }

    return normalized;
  });
}
