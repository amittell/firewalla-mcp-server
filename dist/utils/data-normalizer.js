/**
 * Simple data safety utilities for Firewalla MCP Server
 * Provides basic null safety and prevents crashes from malformed API data
 */
/**
 * Basic null safety for objects - prevents crashes from null/undefined data
 */
export function safeAccess(data) {
    if (data === null || data === undefined) {
        return null;
    }
    if (Array.isArray(data)) {
        return data.map(item => safeAccess(item));
    }
    if (typeof data === 'object') {
        const safe = {};
        for (const [key, value] of Object.entries(data)) {
            safe[key] = safeAccess(value);
        }
        return safe;
    }
    return data;
}
/**
 * Simple value sanitization - handles null/undefined and basic type safety
 */
export function safeValue(value, defaultValue) {
    if (value === null || value === undefined) {
        return defaultValue ?? null;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return defaultValue ?? null;
    }
    return value;
}
/**
 * Basic geographic data safety - just prevents crashes and provides defaults
 */
export function safeGeoData(geoData) {
    if (!geoData || typeof geoData !== 'object') {
        return {
            country: 'unknown',
            country_code: 'UN',
            continent: 'unknown',
            region: 'unknown',
            city: 'unknown',
            timezone: 'unknown',
        };
    }
    return {
        country: safeValue(geoData.country || geoData.Country, 'unknown'),
        country_code: safeValue(geoData.country_code || geoData.countryCode, 'UN'),
        continent: safeValue(geoData.continent, 'unknown'),
        region: safeValue(geoData.region, 'unknown'),
        city: safeValue(geoData.city, 'unknown'),
        timezone: safeValue(geoData.timezone, 'unknown'),
    };
}
/**
 * Safe numeric conversion
 */
function safeNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
/**
 * Safe byte count conversion
 */
export function safeByteCount(value, defaultValue = 0) {
    const num = safeNumber(value);
    return num !== null ? num : defaultValue;
}
/**
 * Simple boolean conversion
 */
export function safeBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    return false;
}
/**
 * Sanitize field value with default fallback and tracking
 */
export function sanitizeFieldValue(value, defaultValue) {
    const modifications = [];
    let processedValue = value;
    let wasModified = false;
    // Handle null/undefined
    if (value === null || value === undefined) {
        processedValue = defaultValue ?? null;
        wasModified = true;
        modifications.push('replaced null with default');
    }
    // Handle empty strings
    else if (typeof value === 'string' && value === '') {
        processedValue = defaultValue ?? '';
        wasModified = true;
        modifications.push('replaced empty string with default');
    }
    // Handle string trimming
    else if (typeof value === 'string' && value !== value.trim()) {
        processedValue = value.trim();
        wasModified = true;
        modifications.push('trimmed whitespace');
    }
    // Handle NaN numbers
    else if (typeof value === 'number' && !Number.isFinite(value)) {
        processedValue = defaultValue ?? 0;
        wasModified = true;
        modifications.push('replaced NaN with default');
    }
    return {
        value: processedValue,
        wasModified,
        modifications,
    };
}
/**
 * Normalize unknown fields to consistent values
 */
export function normalizeUnknownFields(value, config, visited = new WeakSet()) {
    const defaultConfig = {
        defaultUnknownValue: 'unknown',
        preserveNull: false,
        trimWhitespace: true,
        lowerCaseFields: [],
    };
    const actualConfig = { ...defaultConfig, ...config };
    if (Array.isArray(value)) {
        if (visited.has(value)) {
            return '[Circular Reference]';
        }
        visited.add(value);
        const result = value.map(item => normalizeUnknownFields(item, actualConfig, visited));
        visited.delete(value);
        return result;
    }
    if (value && typeof value === 'object') {
        if (visited.has(value)) {
            return '[Circular Reference]';
        }
        visited.add(value);
        const normalized = {};
        for (const [key, val] of Object.entries(value)) {
            normalized[key] = normalizeUnknownFields(val, actualConfig, visited);
        }
        visited.delete(value);
        return normalized;
    }
    // Handle string values
    if (typeof value === 'string') {
        const trimmed = actualConfig.trimWhitespace ? value.trim() : value;
        const lower = trimmed.toLowerCase();
        if (['unknown', '', 'n/a', 'none', 'null', 'undefined'].includes(lower) ||
            trimmed === '') {
            return actualConfig.defaultUnknownValue;
        }
        return trimmed;
    }
    // Handle null/undefined
    if (value === null || value === undefined) {
        return actualConfig.preserveNull ? null : actualConfig.defaultUnknownValue;
    }
    return value;
}
/**
 * Batch normalize array of objects
 */
export function batchNormalize(items, transformers) {
    if (!Array.isArray(items)) {
        return [];
    }
    return items.map(item => {
        // Start with all original fields
        const normalized = { ...item };
        // Apply transformations
        for (const [key, transformer] of Object.entries(transformers)) {
            // Only apply transformation if the field exists in the item
            if (key in item) {
                normalized[key] = transformer(item[key]);
            }
        }
        return normalized;
    });
}
/**
 * Alias for safeByteCount for backward compatibility
 */
export const sanitizeByteCount = safeByteCount;
/**
 * Ensure consistent geographic data formatting
 */
export function ensureConsistentGeoData(geoData) {
    if (!geoData || typeof geoData !== 'object') {
        return {
            country: 'unknown',
            country_code: 'UN',
            continent: 'unknown',
            region: 'unknown',
            city: 'unknown',
            timezone: 'unknown',
            data_quality: 'missing',
        };
    }
    // Helper function to title case
    const toTitleCase = (str) => {
        if (!str) {
            return 'unknown';
        }
        return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    };
    // Helper function to handle country code
    const normalizeCountryCode = (code) => {
        if (!code || typeof code !== 'string') {
            return 'UN';
        }
        // Only accept 2-letter ISO codes with letters only
        if (code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) {
            return 'UN';
        }
        return code.toUpperCase();
    };
    // Helper function to handle ASN
    const normalizeASN = (asn) => {
        if (asn === null || asn === undefined) {
            return undefined;
        }
        const num = typeof asn === 'string' ? parseInt(asn, 10) : asn;
        return Number.isNaN(num) ? undefined : num;
    };
    // Helper function to handle boolean values
    const normalizeBoolean = (value) => {
        if (value === null || value === undefined) {
            return undefined;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return lower === 'true' || lower === 'yes' || lower === '1';
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return undefined;
    };
    return {
        country: toTitleCase(geoData.Country || geoData.country || ''),
        country_code: normalizeCountryCode(geoData.CountryCode || geoData.countryCode || geoData.country_code),
        continent: toTitleCase(geoData.Continent || geoData.continent || ''),
        region: toTitleCase(geoData.Region || geoData.region || ''),
        city: toTitleCase(geoData.CITY || geoData.City || geoData.city || ''),
        timezone: geoData.timezone || 'unknown',
        asn: normalizeASN(geoData.ASN || geoData.asn),
        isp: toTitleCase(geoData.isp || geoData.ISP || ''),
        organization: toTitleCase(geoData.organization || geoData.Organization || ''),
        hosting_provider: geoData.hosting_provider || geoData.HostingProvider || undefined,
        is_vpn: normalizeBoolean(geoData.is_vpn),
        is_cloud_provider: normalizeBoolean(geoData.is_cloud_provider),
        is_proxy: normalizeBoolean(geoData.is_proxy),
    };
}
//# sourceMappingURL=data-normalizer.js.map