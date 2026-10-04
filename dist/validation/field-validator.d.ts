/**
 * Field Validator for Firewalla MCP Server
 * Provides field-specific validation with intelligent suggestions
 */
import { SEARCH_FIELDS } from '../search/types.js';
type EntityType = keyof typeof SEARCH_FIELDS;
/**
 * Detailed field validation result
 */
export interface DetailedFieldValidation {
    isValid: boolean;
    error?: string;
    suggestion?: string;
    validFields?: string[];
    confidence?: number;
}
/**
 * Field validation result with multiple suggestions
 * Compatible with main ValidationResult interface
 */
export interface FieldValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
    suggestions: string[];
    sanitizedValue?: unknown;
    fieldMapping: Record<string, string[]>;
    closestMatches: Array<{
        field: string;
        similarity: number;
        entityType: EntityType;
    }>;
    metadata?: {
        fieldsValidated?: number;
        missingFields?: number;
        typeMismatches?: number;
        validationTime?: number;
    };
}
export declare class FieldValidator {
    private static readonly COMMON_ALIASES;
    private static readonly FIELD_WEIGHTS;
    /**
     * Validate field for specific entity type
     */
    static validateField(field: string, entityType: EntityType): DetailedFieldValidation;
    /**
     * Validate field across multiple entity types
     */
    static validateFieldAcrossTypes(field: string, entityTypes: EntityType[]): FieldValidationResult;
    /**
     * Find similar field using string similarity
     */
    private static findSimilarField;
    /**
     * Calculate string similarity using Levenshtein distance
     */
    private static calculateSimilarity;
    /**
     * Get top field suggestions based on weight and relevance
     */
    private static getTopFieldSuggestions;
    /**
     * Get best cross-type field matches
     */
    private static getBestCrossTypeMatches;
    /**
     * Generate field suggestions based on context
     */
    static generateContextualSuggestions(partialField: string, entityType: EntityType, maxSuggestions?: number): string[];
    /**
     * Check if field exists in any supported entity type
     */
    static isValidFieldAnyType(field: string): {
        isValid: boolean;
        supportedTypes: EntityType[];
    };
}
export {};
//# sourceMappingURL=field-validator.d.ts.map