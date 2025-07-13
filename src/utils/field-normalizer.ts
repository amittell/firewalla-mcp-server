/**
 * Simple Field Normalization Layer for Solo Dev OSS Project
 * 
 * Provides consistent field handling across the codebase.
 * Focuses on practical normalization for common issues.
 */

/**
 * Simple field mapping configuration
 */
export interface FieldMapping {
  /** Source field name */
  from: string;
  /** Target field name */
  to: string;
  /** Transform function for the value */
  transform?: (value: any) => any;
}

/**
 * Field normalization options
 */
export interface FieldNormalizationOptions {
  /** Convert field names to snake_case */
  toSnakeCase?: boolean;
  /** Convert field names to camelCase */
  toCamelCase?: boolean;
  /** Remove null/undefined fields */
  removeEmpty?: boolean;
  /** Default value for null/undefined fields */
  defaultValue?: any;
  /** Custom field mappings */
  mappings?: FieldMapping[];
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

/**
 * Normalize a single field value
 */
export function normalizeFieldValue(
  value: any,
  options: {
    defaultValue?: any;
    removeEmpty?: boolean;
    transform?: (value: any) => any;
  } = {}
): any {
  // Apply custom transformation first
  if (options.transform) {
    value = options.transform(value);
  }

  // Handle empty values
  if (isEmpty(value)) {
    if (options.removeEmpty) {
      return undefined; // Signal to remove this field
    }
    return options.defaultValue ?? null;
  }

  // Normalize common problematic values
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'null' || trimmed === 'undefined' || trimmed === 'N/A') {
      return options.defaultValue ?? null;
    }
    return trimmed;
  }

  return value;
}

/**
 * Normalize field names in an object
 */
export function normalizeFieldNames(
  obj: Record<string, any>,
  options: Pick<FieldNormalizationOptions, 'toSnakeCase' | 'toCamelCase' | 'mappings'> = {}
): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const normalized: Record<string, any> = {};

  Object.entries(obj).forEach(([key, value]) => {
    let normalizedKey = key;

    // Apply custom mappings first
    if (options.mappings) {
      const mapping = options.mappings.find(m => m.from === key);
      if (mapping) {
        normalizedKey = mapping.to;
        if (mapping.transform) {
          value = mapping.transform(value);
        }
      }
    }

    // Apply case conversion
    if (options.toSnakeCase) {
      normalizedKey = toSnakeCase(normalizedKey);
    } else if (options.toCamelCase) {
      normalizedKey = toCamelCase(normalizedKey);
    }

    normalized[normalizedKey] = value;
  });

  return normalized;
}

/**
 * Normalize an entire object with all options
 */
export function normalizeObject<T extends Record<string, any>>(
  obj: T,
  options: FieldNormalizationOptions = {}
): Partial<T> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // First normalize field names
  const normalized = normalizeFieldNames(obj, options);

  // Then normalize field values
  const result: Record<string, any> = {};
  
  Object.entries(normalized).forEach(([key, value]) => {
    const normalizedValue = normalizeFieldValue(value, {
      defaultValue: options.defaultValue,
      removeEmpty: options.removeEmpty,
    });

    // Skip fields marked for removal
    if (normalizedValue !== undefined) {
      result[key] = normalizedValue;
    }
  });

  return result as Partial<T>;
}

/**
 * Normalize an array of objects
 */
export function normalizeArray<T extends Record<string, any>>(
  array: T[],
  options: FieldNormalizationOptions = {}
): Array<Partial<T>> {
  if (!Array.isArray(array)) {
    return array;
  }

  return array.map(item => normalizeObject(item, options));
}

/**
 * Alias mapping for known problematic field names
 * Used by toSnakeCaseDeep for intelligent field conversion
 */
export const FIELD_ALIAS_MAP: Record<string, string> = {
  // IP address variations
  'sourceIP': 'source_ip',
  'destinationIP': 'destination_ip',
  'deviceIP': 'device_ip',
  'publicIP': 'public_ip',
  'ipAddress': 'ip_address',
  
  // Time field variations
  'timestamp': 'ts',
  'createdAt': 'created_at',
  'updatedAt': 'updated_at',
  'lastSeen': 'last_seen',
  'lastHitTs': 'last_hit_ts',
  'updateTs': 'update_ts',
  'resumeTs': 'resume_ts',
  'statsResetTs': 'stats_reset_ts',
  
  // Count and statistics
  'deviceCount': 'device_count',
  'ruleCount': 'rule_count',
  'alarmCount': 'alarm_count',
  'totalDownload': 'total_download',
  'totalUpload': 'total_upload',
  'bytesDownloaded': 'bytes_downloaded',
  'bytesUploaded': 'bytes_uploaded',
  'totalBytes': 'total_bytes',
  
  // Device and network info
  'deviceName': 'device_name',
  'macAddress': 'mac_address',
  'macVendor': 'mac_vendor',
  'deviceType': 'device_type',
  'networkId': 'network_id',
  'networkName': 'network_name',
  'groupId': 'group_id',
  'groupName': 'group_name',
  'ipReserved': 'ip_reserved',
  
  // Geographic data
  'countryCode': 'country_code',
  'isCloudProvider': 'is_cloud_provider',
  'isProxy': 'is_proxy',
  'isVpn': 'is_vpn',
  'geographicRiskScore': 'geographic_risk_score',
  'hostingProvider': 'hosting_provider',
  
  // Security and alarm data
  'alarmType': 'alarm_type',
  'ruleType': 'rule_type',
  'threatLevel': 'threat_level',
  'blockType': 'block_type',
  'dnsOnly': 'dns_only',
  
  // Temporal and scheduling
  'cronTime': 'cron_time',
  'timeUsage': 'time_usage',
  
  // Common query parameters
  'groupBy': 'group_by',
  'sortBy': 'sort_by',
  'queryBy': 'query_by',
  'startTime': 'start_time',
  'endTime': 'end_time',
  'forceRefresh': 'force_refresh',
  'includeOffline': 'include_offline',
  'includeAnalytics': 'include_analytics',
  'sortOrder': 'sort_order',
  
  // Response metadata
  'executionTime': 'execution_time_ms',
  'hasMore': 'has_more',
  'nextCursor': 'next_cursor',
  'totalCount': 'total_count',
  'resultCount': 'result_count',
  'dataSource': 'data_source',
  'entityType': 'entity_type',
  'geoEnriched': 'geo_enriched',
  'fieldNormalized': 'field_normalized',
  'lastUpdated': 'last_updated',
};

/**
 * Deep snake_case conversion for objects and arrays
 * Recursively converts all field names to snake_case with intelligent alias handling
 */
export function toSnakeCaseDeep<T = any>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCaseDeep(item)) as T;
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const converted: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Use alias mapping first, then fall back to snake_case conversion
      const snakeKey = FIELD_ALIAS_MAP[key] || toSnakeCase(key);
      converted[snakeKey] = toSnakeCaseDeep(value);
    }
    
    return converted as T;
  }
  
  // Return primitive values unchanged
  return obj;
}

/**
 * Common field mappings for Firewalla data
 */
export const COMMON_FIELD_MAPPINGS: FieldMapping[] = [
  // IP address variations
  { from: 'sourceIP', to: 'source_ip' },
  { from: 'destinationIP', to: 'destination_ip' },
  { from: 'deviceIP', to: 'device_ip' },
  
  // Time field variations
  { from: 'timestamp', to: 'ts' },
  { from: 'createdAt', to: 'created_at' },
  { from: 'updatedAt', to: 'updated_at' },
  
  // Geographic data variations
  { from: 'countryCode', to: 'country_code' },
  { from: 'ipAddress', to: 'ip_address' },
  
  // Device info variations
  { from: 'deviceName', to: 'device_name' },
  { from: 'macAddress', to: 'mac_address' },
  { from: 'deviceType', to: 'device_type' },
  
  // Security data variations
  { from: 'alarmType', to: 'alarm_type' },
  { from: 'ruleType', to: 'rule_type' },
  { from: 'threatLevel', to: 'threat_level' },
];

/**
 * Preset normalization for Firewalla API responses
 */
export function normalizeFirewallaResponse<T extends Record<string, any>>(
  data: T | T[]
): Partial<T> | Array<Partial<T>> {
  const options: FieldNormalizationOptions = {
    toSnakeCase: true,
    removeEmpty: false,
    defaultValue: null,
    mappings: COMMON_FIELD_MAPPINGS,
  };

  if (Array.isArray(data)) {
    return normalizeArray(data, options);
  }

  return normalizeObject(data, options);
}

/**
 * Quick field normalization utility for common cases
 */
export const normalize = {
  /** Normalize to snake_case with empty handling */
  toApi: (obj: any) => normalizeObject(obj, { 
    toSnakeCase: true, 
    removeEmpty: true,
    mappings: COMMON_FIELD_MAPPINGS,
  }),
  
  /** Normalize from API response */
  fromApi: (obj: any) => normalizeFirewallaResponse(obj),
  
  /** Just handle empty values */
  emptyValues: (obj: any) => normalizeObject(obj, { 
    removeEmpty: false, 
    defaultValue: null 
  }),
  
  /** Just normalize field names */
  fieldNames: (obj: any) => normalizeFieldNames(obj, { 
    toSnakeCase: true,
    mappings: COMMON_FIELD_MAPPINGS,
  }),
};