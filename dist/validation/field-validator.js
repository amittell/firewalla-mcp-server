/**
 * Field Validator for Firewalla MCP Server
 * Provides field-specific validation with intelligent suggestions
 */
import { SEARCH_FIELDS } from '../search/types.js';
export class FieldValidator {
    /**
     * Validate field for specific entity type
     */
    static validateField(field, entityType) {
        if (!field || typeof field !== 'string') {
            return {
                isValid: false,
                error: 'Field name must be a non-empty string',
                suggestion: 'Provide a valid field name'
            };
        }
        const cleanField = field.trim();
        const validFields = SEARCH_FIELDS[entityType];
        if (!validFields || !Array.isArray(validFields)) {
            return {
                isValid: false,
                error: `Invalid entity type: ${entityType}`,
                suggestion: `Valid entity types: ${Object.keys(SEARCH_FIELDS).join(', ')}`
            };
        }
        // Check exact match
        if (validFields.includes(cleanField)) {
            return {
                isValid: true,
                confidence: 1.0
            };
        }
        // Check common aliases
        const aliasField = this.COMMON_ALIASES[cleanField];
        if (aliasField && validFields.includes(aliasField)) {
            return {
                isValid: false,
                error: `Field '${cleanField}' is not valid for ${entityType}`,
                suggestion: `Did you mean '${aliasField}'? (${cleanField} is an alias for ${aliasField})`,
                validFields: [aliasField]
            };
        }
        // Find similar fields using fuzzy matching
        const similarField = this.findSimilarField(cleanField, validFields);
        if (similarField && similarField.similarity > 0.6) {
            return {
                isValid: false,
                error: `Field '${cleanField}' is not valid for ${entityType}`,
                suggestion: `Did you mean '${similarField.field}'?`,
                validFields: [similarField.field],
                confidence: similarField.similarity
            };
        }
        // No close match found, provide general guidance
        const topFields = this.getTopFieldSuggestions(validFields, 5);
        return {
            isValid: false,
            error: `Field '${cleanField}' is not valid for ${entityType}`,
            suggestion: `Valid fields include: ${topFields.join(', ')}${validFields.length > 5 ? '...' : ''}`,
            validFields: topFields
        };
    }
    /**
     * Validate field across multiple entity types
     */
    static validateFieldAcrossTypes(field, entityTypes) {
        const errors = [];
        const suggestions = [];
        const fieldMapping = {};
        const closestMatches = [];
        if (!field || typeof field !== 'string') {
            return {
                isValid: false,
                errors: ['Field name must be a non-empty string'],
                suggestions: ['Provide a valid field name'],
                fieldMapping: {},
                closestMatches: []
            };
        }
        const cleanField = field.trim();
        let foundInAnyType = false;
        for (const entityType of entityTypes) {
            const result = this.validateField(cleanField, entityType);
            if (result.isValid) {
                foundInAnyType = true;
                if (!fieldMapping[entityType]) {
                    fieldMapping[entityType] = [];
                }
                fieldMapping[entityType].push(cleanField);
            }
            else {
                // Collect suggestions and close matches
                if (result.suggestion && !suggestions.includes(result.suggestion)) {
                    suggestions.push(result.suggestion);
                }
                if (result.validFields) {
                    fieldMapping[entityType] = result.validFields;
                }
                // Find closest match for this entity type
                const validFields = SEARCH_FIELDS[entityType];
                const similarField = this.findSimilarField(cleanField, validFields);
                if (similarField && similarField.similarity > 0.4) {
                    closestMatches.push({
                        field: similarField.field,
                        similarity: similarField.similarity,
                        entityType
                    });
                }
            }
        }
        if (!foundInAnyType) {
            errors.push(`Field '${cleanField}' is not compatible with entity types [${entityTypes.join(', ')}]`);
            // Provide best alternative suggestions
            const bestMatches = this.getBestCrossTypeMatches(cleanField, entityTypes);
            if (bestMatches.length > 0) {
                suggestions.push(`Consider using: ${bestMatches.map(m => `${m.field} (for ${m.entityType})`).join(', ')}`);
            }
        }
        return {
            isValid: foundInAnyType,
            errors,
            suggestions,
            fieldMapping,
            closestMatches: closestMatches.sort((a, b) => b.similarity - a.similarity)
        };
    }
    /**
     * Find similar field using string similarity
     */
    static findSimilarField(invalidField, validFields) {
        let bestMatch = null;
        for (const validField of validFields) {
            const similarity = this.calculateSimilarity(invalidField.toLowerCase(), validField.toLowerCase());
            if (!bestMatch || similarity > bestMatch.similarity) {
                bestMatch = { field: validField, similarity };
            }
        }
        return bestMatch;
    }
    /**
     * Calculate string similarity using Levenshtein distance
     */
    static calculateSimilarity(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;
        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, // deletion
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j - 1] + 1 // substitution
                    );
                }
            }
        }
        const maxLength = Math.max(len1, len2);
        if (maxLength === 0) {
            return 1;
        }
        return (maxLength - matrix[len1][len2]) / maxLength;
    }
    /**
     * Get top field suggestions based on weight and relevance
     */
    static getTopFieldSuggestions(validFields, count = 5) {
        return validFields
            .map(field => ({
            field,
            weight: this.FIELD_WEIGHTS[field] || 0.5
        }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, count)
            .map(item => item.field);
    }
    /**
     * Get best cross-type field matches
     */
    static getBestCrossTypeMatches(field, entityTypes, maxResults = 3) {
        const matches = [];
        for (const entityType of entityTypes) {
            const validFields = SEARCH_FIELDS[entityType];
            const similarField = this.findSimilarField(field, validFields);
            if (similarField && similarField.similarity > 0.5) {
                matches.push({
                    field: similarField.field,
                    entityType,
                    similarity: similarField.similarity
                });
            }
        }
        return matches
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
    }
    /**
     * Generate field suggestions based on context
     */
    static generateContextualSuggestions(partialField, entityType, maxSuggestions = 10) {
        const validFields = SEARCH_FIELDS[entityType];
        if (!validFields) {
            return [];
        }
        const lowerPartial = partialField.toLowerCase();
        // Find fields that start with the partial string
        const startsWith = validFields.filter(field => field.toLowerCase().startsWith(lowerPartial));
        // Find fields that contain the partial string
        const contains = validFields.filter(field => field.toLowerCase().includes(lowerPartial) &&
            !field.toLowerCase().startsWith(lowerPartial));
        // Combine and limit results
        return [...startsWith, ...contains].slice(0, maxSuggestions);
    }
    /**
     * Check if field exists in any supported entity type
     */
    static isValidFieldAnyType(field) {
        const supportedTypes = [];
        for (const entityType of Object.keys(SEARCH_FIELDS)) {
            const validFields = SEARCH_FIELDS[entityType];
            if (validFields.includes(field)) {
                supportedTypes.push(entityType);
            }
        }
        return {
            isValid: supportedTypes.length > 0,
            supportedTypes
        };
    }
}
FieldValidator.COMMON_ALIASES = {
    'srcIP': 'source_ip',
    'destIP': 'destination_ip',
    'src': 'source_ip',
    'dest': 'destination_ip',
    'src_ip': 'source_ip',
    'dest_ip': 'destination_ip',
    'severity_level': 'severity',
    'rule_action': 'action',
    'ip': 'device_ip',
    'device': 'device_ip',
    'host': 'device_ip',
    'hostname': 'device_ip',
    'addr': 'device_ip',
    'address': 'device_ip',
    'time': 'timestamp',
    'ts': 'timestamp',
    'date': 'timestamp',
    'created': 'created_at',
    'updated': 'updated_at',
    'modified': 'updated_at',
    'size': 'bytes',
    'data': 'bytes',
    'transfer': 'bytes',
    'proto': 'protocol',
    'port_protocol': 'protocol',
    'net_protocol': 'protocol',
    'blocked_status': 'blocked',
    'is_blocked': 'blocked',
    'block_status': 'blocked',
    'online_status': 'online',
    'is_online': 'online',
    'vendor': 'mac_vendor',
    'manufacturer': 'mac_vendor',
    'oui': 'mac_vendor',
    'network': 'network_name',
    'subnet': 'network_name',
    'vlan': 'network_name',
    'group': 'group_name',
    'category_name': 'category',
    'cat': 'category',
    'classification': 'category',
    'rule_type': 'target_type',
    'target_kind': 'target_type',
    'hit_count': 'hit_count',
    'hits': 'hit_count',
    'usage': 'hit_count'
};
FieldValidator.FIELD_WEIGHTS = {
    // High confidence exact matches
    'source_ip': 1.0,
    'destination_ip': 1.0,
    'device_ip': 1.0,
    'protocol': 1.0,
    'severity': 1.0,
    'timestamp': 1.0,
    'action': 1.0,
    // Medium confidence partial matches
    'bytes': 0.8,
    'blocked': 0.8,
    'online': 0.8,
    'status': 0.8,
    'type': 0.8,
    // Lower confidence generic fields
    'name': 0.6,
    'category': 0.6,
    'description': 0.6,
    'direction': 0.6
};
//# sourceMappingURL=field-validator.js.map