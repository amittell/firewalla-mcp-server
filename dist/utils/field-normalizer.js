/**
 * Simple Field Normalization Layer for Solo Dev OSS Project
 *
 * Provides consistent field handling across the codebase.
 * Focuses on practical normalization for common issues.
 */
/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
/**
 * Check if a value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value) {
    return (value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && Object.keys(value).length === 0));
}
/**
 * Normalize a single field value
 */
export function normalizeFieldValue(value, options = {}) {
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
export function normalizeFieldNames(obj, options = {}) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    const normalized = {};
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
        }
        else if (options.toCamelCase) {
            normalizedKey = toCamelCase(normalizedKey);
        }
        normalized[normalizedKey] = value;
    });
    return normalized;
}
/**
 * Normalize an entire object with all options
 */
export function normalizeObject(obj, options = {}) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    // First normalize field names
    const normalized = normalizeFieldNames(obj, options);
    // Then normalize field values
    const result = {};
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
    return result;
}
/**
 * Normalize an array of objects
 */
export function normalizeArray(array, options = {}) {
    if (!Array.isArray(array)) {
        return array;
    }
    return array.map(item => normalizeObject(item, options));
}
/**
 * Alias mapping for known problematic field names
 * Used by toSnakeCaseDeep for intelligent field conversion
 */
export const FIELD_ALIAS_MAP = {
    // IP address variations
    sourceIP: 'source_ip',
    destinationIP: 'destination_ip',
    deviceIP: 'device_ip',
    publicIP: 'public_ip',
    ipAddress: 'ip_address',
    // Time field variations
    timestamp: 'ts',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    lastSeen: 'last_seen',
    lastHitTs: 'last_hit_ts',
    updateTs: 'update_ts',
    resumeTs: 'resume_ts',
    statsResetTs: 'stats_reset_ts',
    // Count and statistics
    deviceCount: 'device_count',
    ruleCount: 'rule_count',
    alarmCount: 'alarm_count',
    totalDownload: 'total_download',
    totalUpload: 'total_upload',
    bytesDownloaded: 'bytes_downloaded',
    bytesUploaded: 'bytes_uploaded',
    totalBytes: 'total_bytes',
    // Device and network info
    deviceName: 'device_name',
    macAddress: 'mac_address',
    macVendor: 'mac_vendor',
    deviceType: 'device_type',
    networkId: 'network_id',
    networkName: 'network_name',
    groupId: 'group_id',
    groupName: 'group_name',
    ipReserved: 'ip_reserved',
    // Geographic data
    countryCode: 'country_code',
    isCloudProvider: 'is_cloud_provider',
    isProxy: 'is_proxy',
    isVpn: 'is_vpn',
    geographicRiskScore: 'geographic_risk_score',
    hostingProvider: 'hosting_provider',
    // Security and alarm data
    alarmType: 'alarm_type',
    ruleType: 'rule_type',
    threatLevel: 'threat_level',
    blockType: 'block_type',
    dnsOnly: 'dns_only',
    // Temporal and scheduling
    cronTime: 'cron_time',
    timeUsage: 'time_usage',
    // Common query parameters
    groupBy: 'group_by',
    sortBy: 'sort_by',
    queryBy: 'query_by',
    startTime: 'start_time',
    endTime: 'end_time',
    forceRefresh: 'force_refresh',
    includeOffline: 'include_offline',
    sortOrder: 'sort_order',
    // Response metadata
    executionTime: 'execution_time_ms',
    hasMore: 'has_more',
    nextCursor: 'next_cursor',
    totalCount: 'total_count',
    resultCount: 'result_count',
    dataSource: 'data_source',
    entityType: 'entity_type',
    geoEnriched: 'geo_enriched',
    fieldNormalized: 'field_normalized',
    lastUpdated: 'last_updated',
};
/** Objects registered with dataKeyed */
const DATA_KEYED = new WeakSet();
/**
 * Marks `map` as an object whose keys are data, not field names: a count
 * by rule action or target type, or by the value of a group. toSnakeCaseDeep
 * keeps its keys as they are and normalizes the values under them. Without
 * this a target type such as remotePort was counted as remote_port.
 *
 * @param map - The object to mark; it is not copied
 * @returns map
 */
export function dataKeyed(map) {
    DATA_KEYED.add(map);
    return map;
}
/**
 * A key toSnakeCaseDeep renames: a field name as the API writes them, an
 * ASCII identifier that starts with a lowercase letter (lastSeen, updateTs).
 * Any other key (a domain, a MAC or IP address, a country code, a name with
 * spaces, marker text such as <U+200B>) is data and keeps its text.
 */
const FIELD_NAME = /^[a-z][A-Za-z0-9_]*$/;
/** The name toSnakeCaseDeep gives `key`: its alias, else its snake_case */
function snakeCaseKey(key) {
    // An own property only: FIELD_ALIAS_MAP.constructor is Object, which
    // turned a key named constructor into "function Object() ..."
    if (Object.prototype.hasOwnProperty.call(FIELD_ALIAS_MAP, key)) {
        return FIELD_ALIAS_MAP[key];
    }
    return FIELD_NAME.test(key) ? toSnakeCase(key) : key;
}
/**
 * The new name of each key of an object that toSnakeCaseDeep renames. A
 * key whose name does not change keeps it. A renamed key takes its new
 * name unless another key has it (fooBar and foo_bar, or timestamp and ts);
 * then it gets the first free " <duplicate N>" suffix, N from 2, as
 * markInvisibleCharactersIn names marked keys that read the same, so no
 * value is dropped. Renamed keys are named in code unit order, so the
 * names do not depend on the order of the keys.
 */
function renamedKeys(keys) {
    const taken = new Set();
    const toRename = [];
    for (const key of keys) {
        if (snakeCaseKey(key) === key) {
            taken.add(key);
        }
        else {
            toRename.push(key);
        }
    }
    const names = new Map();
    for (const key of toRename.sort()) {
        const renamed = snakeCaseKey(key);
        let name = renamed;
        for (let n = 2; taken.has(name); n++) {
            name = `${renamed} <duplicate ${n}>`;
        }
        taken.add(name);
        names.set(key, name);
    }
    return names;
}
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
/**
 * Field names in snake_case, through arrays and plain objects: each field
 * name gets its FIELD_ALIAS_MAP name, else its snake_case. Keys that are
 * not field names keep their text (see FIELD_NAME), as do the keys of an
 * object marked with dataKeyed. No value is dropped when two keys would
 * get one name (see renamedKeys).
 */
export function toSnakeCaseDeep(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => toSnakeCaseDeep(item));
    }
    if (!isPlainObject(obj)) {
        return obj;
    }
    const keys = Object.keys(obj);
    const names = DATA_KEYED.has(obj) ? new Map() : renamedKeys(keys);
    // fromEntries makes each key an own property, __proto__ included, which
    // assigning it would not
    return Object.fromEntries(keys.map(key => [names.get(key) ?? key, toSnakeCaseDeep(obj[key])]));
}
/**
 * Common field mappings for Firewalla data
 */
export const COMMON_FIELD_MAPPINGS = [
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
export function normalizeFirewallaResponse(data) {
    const options = {
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
    toApi: (obj) => normalizeObject(obj, {
        toSnakeCase: true,
        removeEmpty: true,
        mappings: COMMON_FIELD_MAPPINGS,
    }),
    /** Normalize from API response */
    fromApi: (obj) => normalizeFirewallaResponse(obj),
    /** Just handle empty values */
    emptyValues: (obj) => normalizeObject(obj, {
        removeEmpty: false,
        defaultValue: null,
    }),
    /** Just normalize field names */
    fieldNames: (obj) => normalizeFieldNames(obj, {
        toSnakeCase: true,
        mappings: COMMON_FIELD_MAPPINGS,
    }),
};
//# sourceMappingURL=field-normalizer.js.map