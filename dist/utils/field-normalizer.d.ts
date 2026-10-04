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
export declare function toSnakeCase(str: string): string;
/**
 * Convert snake_case to camelCase
 */
export declare function toCamelCase(str: string): string;
/**
 * Check if a value is empty (null, undefined, empty string, empty array)
 */
export declare function isEmpty(value: any): boolean;
/**
 * Normalize a single field value
 */
export declare function normalizeFieldValue(value: any, options?: {
    defaultValue?: any;
    removeEmpty?: boolean;
    transform?: (value: any) => any;
}): any;
/**
 * Normalize field names in an object
 */
export declare function normalizeFieldNames(obj: Record<string, any>, options?: Pick<FieldNormalizationOptions, 'toSnakeCase' | 'toCamelCase' | 'mappings'>): Record<string, any>;
/**
 * Normalize an entire object with all options
 */
export declare function normalizeObject<T extends Record<string, any>>(obj: T, options?: FieldNormalizationOptions): Partial<T>;
/**
 * Normalize an array of objects
 */
export declare function normalizeArray<T extends Record<string, any>>(array: T[], options?: FieldNormalizationOptions): Array<Partial<T>>;
/**
 * Alias mapping for known problematic field names
 * Used by toSnakeCaseDeep for intelligent field conversion
 */
export declare const FIELD_ALIAS_MAP: Record<string, string>;
/**
 * Marks `map` as an object whose keys are data, not field names: a count
 * by rule action or target type, or by the value of a group. toSnakeCaseDeep
 * keeps its keys as they are and normalizes the values under them. Without
 * this a target type such as remotePort was counted as remote_port.
 *
 * @param map - The object to mark; it is not copied
 * @returns map
 */
export declare function dataKeyed<T extends object>(map: T): T;
/**
 * Field names in snake_case, through arrays and plain objects: each field
 * name gets its FIELD_ALIAS_MAP name, else its snake_case. Keys that are
 * not field names keep their text (see FIELD_NAME), as do the keys of an
 * object marked with dataKeyed. No value is dropped when two keys would
 * get one name (see renamedKeys).
 */
export declare function toSnakeCaseDeep<T = any>(obj: T): T;
/**
 * Common field mappings for Firewalla data
 */
export declare const COMMON_FIELD_MAPPINGS: FieldMapping[];
/**
 * Preset normalization for Firewalla API responses
 */
export declare function normalizeFirewallaResponse<T extends Record<string, any>>(data: T | T[]): Partial<T> | Array<Partial<T>>;
/**
 * Quick field normalization utility for common cases
 */
export declare const normalize: {
    /** Normalize to snake_case with empty handling */
    toApi: (obj: any) => Partial<any>;
    /** Normalize from API response */
    fromApi: (obj: any) => Partial<any> | Partial<any>[];
    /** Just handle empty values */
    emptyValues: (obj: any) => Partial<any>;
    /** Just normalize field names */
    fieldNames: (obj: any) => Record<string, any>;
};
//# sourceMappingURL=field-normalizer.d.ts.map