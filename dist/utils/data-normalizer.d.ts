/**
 * Simple data safety utilities for Firewalla MCP Server
 * Provides basic null safety and prevents crashes from malformed API data
 */
import type { GeographicData, SanitizationResult } from '../types.js';
/**
 * Basic null safety for objects - prevents crashes from null/undefined data
 */
export declare function safeAccess(data: any): any;
/**
 * Simple value sanitization - handles null/undefined and basic type safety
 */
export declare function safeValue(value: any, defaultValue?: any): any;
/**
 * Basic geographic data safety - just prevents crashes and provides defaults
 */
export declare function safeGeoData(geoData: any): GeographicData;
/**
 * Safe byte count conversion
 */
export declare function safeByteCount(value: any, defaultValue?: number): number;
/**
 * Simple boolean conversion
 */
export declare function safeBoolean(value: any): boolean;
/**
 * Normalization configuration interface
 */
export interface NormalizationConfig {
    defaultUnknownValue: string;
    preserveNull: boolean;
    trimWhitespace: boolean;
    lowerCaseFields: string[];
}
/**
 * Sanitize field value with default fallback and tracking
 */
export declare function sanitizeFieldValue(value: any, defaultValue?: any): SanitizationResult;
/**
 * Normalize unknown fields to consistent values
 */
export declare function normalizeUnknownFields(value: any, config?: Partial<NormalizationConfig>, visited?: WeakSet<object>): any;
/**
 * Batch normalize array of objects
 */
export declare function batchNormalize(items: any[], transformers: Record<string, (value: any) => any>): any[];
/**
 * Alias for safeByteCount for backward compatibility
 */
export declare const sanitizeByteCount: typeof safeByteCount;
/**
 * Ensure consistent geographic data formatting
 */
export declare function ensureConsistentGeoData(geoData: any): GeographicData & {
    data_quality?: string;
};
//# sourceMappingURL=data-normalizer.d.ts.map