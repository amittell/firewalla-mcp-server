/**
 * Boolean Field Translator for Firewalla MCP Server
 *
 * Translates boolean field queries to backend-compatible format.
 *
 * The Firewalla API backend has limitations with boolean syntax:
 * - "blocked:true" fails with "Bad Request: Invalid parameters"
 * - "protocol:tcp" works fine
 *
 * This utility translates boolean field patterns to formats the backend accepts.
 */

/**
 * Configuration for boolean field translation
 */
interface BooleanFieldConfig {
  /** Fields that should be translated from boolean syntax */
  booleanFields: string[];
  /** Translation mapping: true/false to backend values */
  translations: {
    true: string;
    false: string;
  };
}

/**
 * Entity-specific boolean field configurations
 */
const BOOLEAN_FIELD_CONFIGS: Record<string, BooleanFieldConfig> = {
  flows: {
    booleanFields: ['blocked', 'allowed', 'encrypted', 'compressed'],
    translations: {
      true: '1',
      false: '0',
    },
  },
  alarms: {
    booleanFields: ['resolved', 'acknowledged', 'dismissed', 'active'],
    translations: {
      true: '1',
      false: '0',
    },
  },
  rules: {
    booleanFields: ['active', 'enabled', 'disabled', 'paused'],
    translations: {
      true: '1',
      false: '0',
    },
  },
  devices: {
    booleanFields: ['online', 'monitored', 'blocked', 'trusted'],
    translations: {
      true: '1',
      false: '0',
    },
  },
};

/**
 * Alternative translation formats to try if primary format fails
 */
const ALTERNATIVE_FORMATS = [
  { true: 'true', false: 'false' }, // Lowercase boolean strings
  { true: 'True', false: 'False' }, // Capitalized boolean strings
  { true: 'yes', false: 'no' }, // Yes/no format
  { true: 'on', false: 'off' }, // On/off format
];

/**
 * Boolean field translator utility class
 */
export class BooleanFieldTranslator {
  /**
   * Translate boolean field queries to backend-compatible format
   *
   * @param query - Original query string (e.g., "blocked:true AND protocol:tcp")
   * @param entityType - Entity type for field configuration
   * @returns Translated query string
   */
  static translateQuery(query: string, entityType: string): string {
    if (!query || typeof query !== 'string') {
      return query;
    }

    const config = BOOLEAN_FIELD_CONFIGS[entityType];
    if (!config) {
      // No translation needed for unknown entity types
      return query;
    }

    let translatedQuery = query;

    // First pass: Convert "field=true/false" syntax to "field:true/false" for standardization
    for (const field of config.booleanFields) {
      const equalsPattern = new RegExp(`\\b${field}=(true|false)\\b`, 'gi');
      translatedQuery = translatedQuery.replace(
        equalsPattern,
        (_match, boolValue) => {
          return `${field}:${boolValue}`;
        }
      );
    }

    // Second pass: Process each boolean field for this entity type (now all use colon syntax)
    for (const field of config.booleanFields) {
      // Match patterns like "field:true" or "field:false" (case insensitive)
      const booleanPattern = new RegExp(`\\b${field}:(true|false)\\b`, 'gi');

      translatedQuery = translatedQuery.replace(
        booleanPattern,
        (_match, boolValue) => {
          const lowerBoolValue = boolValue.toLowerCase() as 'true' | 'false';
          const translatedValue = config.translations[lowerBoolValue];
          return `${field}:${translatedValue}`;
        }
      );
    }

    // Third pass: Handle standalone boolean fields (e.g., "blocked" means "blocked:true")
    for (const field of config.booleanFields) {
      // Match standalone field names that aren't already part of a field:value pair
      // Use negative lookbehind and lookahead to avoid matching fields that are already qualified
      const standalonePattern = new RegExp(`\\b${field}\\b(?!\\s*[:=])`, 'gi');

      translatedQuery = translatedQuery.replace(standalonePattern, _match => {
        const trueValue = config.translations.true;
        return `${field}:${trueValue}`;
      });
    }

    return translatedQuery;
  }

  /**
   * Check if a query contains boolean field syntax that needs translation
   *
   * @param query - Query string to check
   * @param entityType - Entity type for field configuration
   * @returns True if translation is needed
   */
  static needsTranslation(query: string, entityType: string): boolean {
    if (!query || typeof query !== 'string') {
      return false;
    }

    const config = BOOLEAN_FIELD_CONFIGS[entityType];
    if (!config) {
      return false;
    }

    // Check if any boolean field patterns are present (: syntax, = syntax, or standalone)
    for (const field of config.booleanFields) {
      const colonPattern = new RegExp(`\\b${field}:(true|false)\\b`, 'i');
      const equalsPattern = new RegExp(`\\b${field}=(true|false)\\b`, 'i');
      const standalonePattern = new RegExp(`\\b${field}\\b(?!\\s*[:=])`, 'i');
      if (
        colonPattern.test(query) ||
        equalsPattern.test(query) ||
        standalonePattern.test(query)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all alternative translation formats for a query
   * Useful for fallback attempts if primary translation fails
   *
   * @param query - Original query string
   * @param entityType - Entity type for field configuration
   * @returns Array of alternative translated queries
   */
  static getAlternativeTranslations(
    query: string,
    entityType: string
  ): string[] {
    if (!this.needsTranslation(query, entityType)) {
      return [query];
    }

    const config = BOOLEAN_FIELD_CONFIGS[entityType];
    if (!config) {
      return [query];
    }

    const alternatives: string[] = [];

    // Add primary translation
    alternatives.push(this.translateQuery(query, entityType));

    // Add original query (for reference and fallback)
    alternatives.push(query);

    // Add original query with lowercase boolean values (this is often expected by tests)
    let lowercaseQuery = query;
    for (const field of config.booleanFields) {
      const booleanPattern = new RegExp(`\\b${field}:(true|false)\\b`, 'gi');
      lowercaseQuery = lowercaseQuery.replace(
        booleanPattern,
        (_match, boolValue) => {
          const lowerBoolValue = boolValue.toLowerCase();
          return `${field}:${lowerBoolValue}`;
        }
      );
    }
    if (lowercaseQuery !== query) {
      alternatives.push(lowercaseQuery);
    }

    // Add alternative format translations
    for (const altFormat of ALTERNATIVE_FORMATS) {
      let altQuery = query;

      for (const field of config.booleanFields) {
        const booleanPattern = new RegExp(`\\b${field}:(true|false)\\b`, 'gi');

        altQuery = altQuery.replace(booleanPattern, (_match, boolValue) => {
          const lowerBoolValue = boolValue.toLowerCase() as 'true' | 'false';
          const translatedValue = altFormat[lowerBoolValue];
          return `${field}:${translatedValue}`;
        });
      }

      if (altQuery !== query && altQuery !== lowercaseQuery) {
        alternatives.push(altQuery);
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(alternatives)];
  }

  /**
   * Get debug information about boolean field translation
   *
   * @param query - Original query string
   * @param entityType - Entity type
   * @returns Debug information object
   */
  static getTranslationDebugInfo(
    query: string,
    entityType: string
  ): {
    originalQuery: string;
    translatedQuery: string;
    needsTranslation: boolean;
    entityType: string;
    detectedBooleanFields: string[];
    alternativeTranslations: string[];
  } {
    const needsTranslation = this.needsTranslation(query, entityType);
    const translatedQuery = this.translateQuery(query, entityType);
    const alternatives = this.getAlternativeTranslations(query, entityType);

    const config = BOOLEAN_FIELD_CONFIGS[entityType];
    const detectedBooleanFields: string[] = [];

    if (config) {
      for (const field of config.booleanFields) {
        const colonPattern = new RegExp(`\\b${field}:(true|false)\\b`, 'i');
        const equalsPattern = new RegExp(`\\b${field}=(true|false)\\b`, 'i');
        const standalonePattern = new RegExp(`\\b${field}\\b(?!\\s*[:=])`, 'i');
        if (
          colonPattern.test(query) ||
          equalsPattern.test(query) ||
          standalonePattern.test(query)
        ) {
          detectedBooleanFields.push(field);
        }
      }
    }

    return {
      originalQuery: query,
      translatedQuery,
      needsTranslation,
      entityType,
      detectedBooleanFields,
      alternativeTranslations: alternatives,
    };
  }

  /**
   * Add support for new boolean fields at runtime
   *
   * @param entityType - Entity type to update
   * @param fields - Additional boolean fields to support
   */
  static addBooleanFields(entityType: string, fields: string[]): void {
    if (!BOOLEAN_FIELD_CONFIGS[entityType]) {
      BOOLEAN_FIELD_CONFIGS[entityType] = {
        booleanFields: [],
        translations: { true: '1', false: '0' },
      };
    }

    // Add new fields, avoiding duplicates
    const existingFields = new Set(
      BOOLEAN_FIELD_CONFIGS[entityType].booleanFields
    );
    for (const field of fields) {
      if (!existingFields.has(field)) {
        BOOLEAN_FIELD_CONFIGS[entityType].booleanFields.push(field);
      }
    }
  }

  /**
   * Get supported boolean fields for an entity type
   *
   * @param entityType - Entity type to query
   * @returns Array of supported boolean field names
   */
  static getSupportedBooleanFields(entityType: string): string[] {
    const config = BOOLEAN_FIELD_CONFIGS[entityType];
    return config ? [...config.booleanFields] : [];
  }
}
