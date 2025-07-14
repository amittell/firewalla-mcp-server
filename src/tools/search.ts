/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */

import { queryParser } from '../search/parser.js';
import { filterFactory } from '../search/filters/index.js';
import type { FilterContext } from '../search/filters/base.js';
import type { SearchParams, SearchResult } from '../search/types.js';
import type { SearchOptions } from '../types.js';
import type { FirewallaClient } from '../firewalla/client.js';
import { BooleanFieldTranslator } from '../search/boolean-field-translator.js';
import { ParameterValidator, SafeAccess } from '../validation/error-handler.js';
import { EnhancedQueryValidator } from '../validation/enhanced-query-validator.js';
import {
  validateEnhancedCrossReference,
  suggestEntityType,
  getSupportedCorrelationCombinations,
  getFieldValue,
  FIELD_MAPPINGS,
  type EntityType,
  type CorrelationFieldName,
  type EnhancedCorrelationParams,
} from '../validation/field-mapper.js';
import { FieldValidator } from '../validation/field-validator.js';
import { ErrorFormatter } from '../validation/error-formatter.js';
import {
  validateCountryCodes,
  enrichObjectWithGeo,
} from '../utils/geographic.js';
import { correlateResults } from '../validation/enhanced-correlation.js';

/**
 * Configuration interface for risk thresholds and performance settings
 */
export interface SearchConfig {
  riskThresholds: {
    lowMax: number;
    mediumMax: number;
    highMax: number;
    highRiskCountryMin: number;
    highRiskFlowMin: number;
    suspiciousAsnMin: number;
  };
  performance: {
    correlationTimeoutMs: number;
    maxCorrelationResults: number;
    cacheExpirationMs: number;
  };
}

/**
 * Default search configuration that can be overridden via environment variables or configuration
 */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  riskThresholds: {
    lowMax: parseInt(process.env.RISK_THRESHOLD_LOW_MAX || '3', 10),
    mediumMax: parseInt(process.env.RISK_THRESHOLD_MEDIUM_MAX || '6', 10),
    highMax: parseInt(process.env.RISK_THRESHOLD_HIGH_MAX || '8', 10),
    highRiskCountryMin: parseInt(
      process.env.RISK_THRESHOLD_COUNTRY_MIN || '6',
      10
    ),
    highRiskFlowMin: parseInt(process.env.RISK_THRESHOLD_FLOW_MIN || '7', 10),
    suspiciousAsnMin: parseInt(process.env.RISK_THRESHOLD_ASN_MIN || '7', 10),
  },
  performance: {
    correlationTimeoutMs: parseInt(
      process.env.CORRELATION_TIMEOUT_MS || '30000',
      10
    ),
    maxCorrelationResults: parseInt(
      process.env.MAX_CORRELATION_RESULTS || '1000',
      10
    ),
    cacheExpirationMs: parseInt(
      process.env.CACHE_EXPIRATION_MS || '300000',
      10
    ), // 5 minutes
  },
};

/**
 * Current search configuration (can be updated at runtime)
 */
let currentSearchConfig: SearchConfig = DEFAULT_SEARCH_CONFIG;

/**
 * Update search configuration at runtime
 */
export function updateSearchConfig(newConfig: Partial<SearchConfig>): void {
  currentSearchConfig = {
    ...currentSearchConfig,
    ...newConfig,
    riskThresholds: {
      ...currentSearchConfig.riskThresholds,
      ...(newConfig.riskThresholds || {}),
    },
    performance: {
      ...currentSearchConfig.performance,
      ...(newConfig.performance || {}),
    },
  };
}

/**
 * Get current search configuration
 */
export function getSearchConfig(): SearchConfig {
  return currentSearchConfig;
}

/**
 * Get risk thresholds (backward compatibility)
 */
function getRiskThresholds(): SearchConfig['riskThresholds'] {
  return currentSearchConfig.riskThresholds;
}

/**
 * API parameters interface for search requests
 */
interface ApiParameters {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  query?: string;
  [key: string]: any;
}

/**
 * Strategy interface for different entity search implementations
 */
interface SearchStrategy {
  entityType: string;

  executeApiCall: (
    client: FirewallaClient,
    params: SearchParams,
    apiParams: ApiParameters,
    searchOptions: SearchOptions
  ) => Promise<{ results: any[]; count: number; next_cursor?: string }>;

  validateParams?: (params: SearchParams) => {
    isValid: boolean;
    errors: string[];
  };

  processResults?: (results: any[], params: SearchParams) => any[];
}

/**
 * Configuration for search parameter validation
 */
interface SearchValidationConfig {
  requireQuery?: boolean;
  requireLimit?: boolean;
  supportsCursor?: boolean;
  supportsTimeRange?: boolean;
  maxLimit?: number;
  allowEmptyQuery?: boolean;
}

/**
 * Search Engine for executing complex queries
 */
export class SearchEngine {
  private strategies: Map<string, SearchStrategy> = new Map();

  constructor(private firewalla: FirewallaClient) {
    this.initializeStrategies();
  }

  /**
   * Validate basic search parameters
   */
  private validateBasicSearchParams(params: any, _methodName: string): void {
    if (
      !params ||
      typeof params !== 'object' ||
      !params.query ||
      typeof params.query !== 'string' ||
      !params.query.trim()
    ) {
      throw new Error(
        'Parameters object with query property is required and query must be a non-empty string'
      );
    }
  }

  /**
   * Validate correlation field count
   */
  private validateCorrelationFieldCount(
    fields: string[] | string,
    maxFields: number = 5
  ): void {
    const fieldArray = Array.isArray(fields)
      ? fields
      : fields.split(',').map(f => f.trim());
    if (fieldArray.length > maxFields) {
      const excessFields = fieldArray.slice(maxFields);
      throw new Error(
        `Maximum ${maxFields} correlation fields allowed, but ${fieldArray.length} provided. Please remove these fields: ${excessFields.join(', ')}`
      );
    }
  }

  /**
   * Validate geographic filters and return a sanitized (cloned) version.
   * This avoids mutating the caller-supplied object which could lead to
   * subtle side-effects elsewhere in the codebase.
   */
  private validateGeographicFilters<T extends Record<string, any> | undefined>(
    geographic_filters: T
  ): T {
    if (
      geographic_filters !== undefined &&
      (geographic_filters === null || typeof geographic_filters !== 'object')
    ) {
      throw new Error('geographic_filters must be an object if provided');
    }

    if (!geographic_filters) {
      // undefined or null – nothing to validate, return as-is
      return geographic_filters;
    }

    // Work on a shallow clone so the original reference is untouched
    const sanitized: any = { ...geographic_filters };

    /* ---------- Country codes ---------- */
    if (sanitized.countries?.length) {
      const countryValidation = validateCountryCodes(sanitized.countries);
      if (countryValidation.invalid.length > 0) {
        throw new Error(
          `Country code validation failed: Invalid country codes: ${countryValidation.invalid.join(', ')}`
        );
      }
      sanitized.countries = countryValidation.valid;
    }

    /* ---------- Array fields ---------- */
    const arrayFields = [
      'continents',
      'regions',
      'cities',
      'asns',
      'hosting_providers',
    ];
    for (const field of arrayFields) {
      if (sanitized[field] !== undefined) {
        if (!Array.isArray(sanitized[field])) {
          throw new Error(`${field} must be an array if provided`);
        }
        const invalidValues = sanitized[field].filter(
          (value: any) => typeof value !== 'string' || value.trim() === ''
        );
        if (invalidValues.length > 0) {
          throw new Error(
            `${field} array contains invalid values: must be non-empty strings`
          );
        }
      }
    }

    /* ---------- Boolean fields ---------- */
    const booleanFields = ['exclude_vpn', 'exclude_cloud'];
    for (const field of booleanFields) {
      if (
        sanitized[field] !== undefined &&
        typeof sanitized[field] !== 'boolean'
      ) {
        throw new Error(`${field} must be a boolean if provided`);
      }
    }

    /* ---------- Numeric fields ---------- */
    if (sanitized.min_risk_score !== undefined) {
      if (
        typeof sanitized.min_risk_score !== 'number' ||
        sanitized.min_risk_score < 0 ||
        sanitized.min_risk_score > 10
      ) {
        throw new Error(
          'min_risk_score must be a number between 0 and 10 if provided'
        );
      }
    }

    return sanitized as T;
  }

  /**
   * Helper function to extract and apply query filters from a query string
   * Extracts common patterns like field:value and applies them to filter results
   */
  private applyQueryFilters<T>(
    results: T[],
    query: string,
    fieldExtractors: Record<string, (items: T[], value: string) => T[]>
  ): T[] {
    if (!query || typeof query !== 'string') {
      return results;
    }

    let filteredResults = results;

    // Apply each field extractor to filter results
    for (const [fieldPattern, filterFunction] of Object.entries(
      fieldExtractors
    )) {
      const match = query.match(new RegExp(`${fieldPattern}:([^\\s]+)`, 'i'));
      if (match) {
        const extractedValue = match[1];
        filteredResults = filterFunction(filteredResults, extractedValue);
      }
    }

    return filteredResults;
  }

  /**
   * Initialize search strategies for different entity types
   */
  private initializeStrategies(): void {
    this.strategies.set('flows', {
      entityType: 'flows',
      executeApiCall: async (client, params, apiParams, searchOptions) => {
        // Use getFlowData instead of searchFlows since it handles parameters better
        let queryString = params.query;

        // Add time range to query if provided
        if (searchOptions.time_range?.start && searchOptions.time_range?.end) {
          const startDate = new Date(searchOptions.time_range.start);
          const endDate = new Date(searchOptions.time_range.end);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid time range format');
          }

          if (startDate >= endDate) {
            throw new Error('Start time must be before end time');
          }

          const startTs = Math.floor(startDate.getTime() / 1000);
          const endTs = Math.floor(endDate.getTime() / 1000);
          queryString = `ts:${startTs}-${endTs} AND (${params.query})`;
        }

        // Use getFlowData which works reliably
        return client.getFlowData(
          queryString,
          params.group_by,
          'ts:desc',
          apiParams.limit
        );
      },
    });

    this.strategies.set('alarms', {
      entityType: 'alarms',

      executeApiCall: async (client, params, apiParams, _searchOptions) => {
        // Pass the full query including any severity filters
        return client.getActiveAlarms(
          apiParams.queryString || params.query || undefined,
          params.group_by,
          params.sort_by || 'timestamp:desc',
          params.limit,
          params.cursor
        );
      },
      processResults: (results, params) => {
        let filteredResults = results;

        // Client-side filtering to ensure results match query criteria
        if (params.query && typeof params.query === 'string') {
          // Extract severity filter from query (e.g., "severity:medium")
          const severityMatch = params.query.match(
            /severity:(high|medium|low|critical)/i
          );
          if (severityMatch) {
            const expectedSeverity = severityMatch[1].toLowerCase();
            // Map severity names to their string values for filtering
            const severityMapping: Record<string, string[]> = {
              low: ['low'],
              medium: ['medium'],
              high: ['high'],
              critical: ['critical'],
            };

            const validSeverities = severityMapping[expectedSeverity] || [
              expectedSeverity,
            ];
            filteredResults = results.filter(
              alarm =>
                alarm.severity &&
                validSeverities.includes(alarm.severity.toLowerCase())
            );
          }

          // Extract type filter from query (e.g., "type:1" or "type:>=4")
          const typeMatch = params.query.match(/type:([><=]*\d+)/i);
          if (typeMatch) {
            const typeExpression = typeMatch[1];
            if (typeExpression.startsWith('>=')) {
              const minType = parseInt(typeExpression.substring(2));
              filteredResults = filteredResults.filter(
                alarm => alarm.type && parseInt(String(alarm.type)) >= minType
              );
            } else if (typeExpression.startsWith('<=')) {
              const maxType = parseInt(typeExpression.substring(2));
              filteredResults = filteredResults.filter(
                alarm => alarm.type && parseInt(String(alarm.type)) <= maxType
              );
            } else if (typeExpression.startsWith('>')) {
              const minType = parseInt(typeExpression.substring(1));
              filteredResults = filteredResults.filter(
                alarm => alarm.type && parseInt(String(alarm.type)) > minType
              );
            } else if (typeExpression.startsWith('<')) {
              const maxType = parseInt(typeExpression.substring(1));
              filteredResults = filteredResults.filter(
                alarm => alarm.type && parseInt(String(alarm.type)) < maxType
              );
            } else {
              const exactType = parseInt(typeExpression);
              filteredResults = filteredResults.filter(
                alarm =>
                  alarm.type && parseInt(String(alarm.type)) === exactType
              );
            }
          }

          // Extract status filter from query (e.g., "status:1" or "resolved:true")
          const statusMatch = params.query.match(/status:(\d+)/i);
          if (statusMatch) {
            const expectedStatus = parseInt(statusMatch[1]);
            filteredResults = filteredResults.filter(
              alarm =>
                alarm.status &&
                parseInt(String(alarm.status)) === expectedStatus
            );
          }

          const resolvedMatch = params.query.match(/resolved:(true|false)/i);
          if (resolvedMatch) {
            const isResolved = resolvedMatch[1].toLowerCase() === 'true';
            // Assuming resolved means status === 2 (based on common patterns)
            filteredResults = filteredResults.filter(alarm => {
              const status = parseInt(String(alarm.status));
              return isResolved ? status === 2 : status !== 2;
            });
          }

          // Extract source_ip filter from query (e.g., "source_ip:192.168.1.1")
          const sourceIpMatch = params.query.match(/source_ip:([^\s]+)/i);
          if (sourceIpMatch) {
            const expectedIp = sourceIpMatch[1];
            // Support wildcard matching for IP addresses
            if (expectedIp.includes('*')) {
              const pattern = expectedIp.replace(/\*/g, '.*');
              const regex = new RegExp(pattern, 'i');
              filteredResults = filteredResults.filter(alarm => {
                const sourceIp = alarm.remote?.ip || alarm.device?.ip || '';
                return regex.test(sourceIp);
              });
            } else {
              filteredResults = filteredResults.filter(alarm => {
                const sourceIp = alarm.remote?.ip || alarm.device?.ip || '';
                return sourceIp.includes(expectedIp);
              });
            }
          }
        }

        if (params.limit) {
          return filteredResults.slice(0, params.limit);
        }
        return filteredResults;
      },
    });

    this.strategies.set('rules', {
      entityType: 'rules',

      executeApiCall: async (client, params, _apiParams, _searchOptions) => {
        // Use reasonable limit for search operations to prevent memory issues
        // Fetch 2x the requested limit (capped at 2000) to account for post-processing filters
        const searchLimit = params.limit
          ? Math.min(params.limit * 2, 2000)
          : 2000;
        return client.getNetworkRules(params.query, searchLimit);
      },
      processResults: (results, params) => {
        // Use the helper function to apply query filters
        const filteredResults = this.applyQueryFilters(
          results,
          params.query || '',
          {
            action: (items, value) => {
              const expectedAction = value.toLowerCase();
              return items.filter(
                rule => rule.action?.toLowerCase() === expectedAction
              );
            },
            target_value: (items, value) => {
              const expectedTarget = value.toLowerCase();
              // Support wildcard matching
              if (expectedTarget.includes('*')) {
                const pattern = expectedTarget.replace(/\*/g, '.*');
                const regex = new RegExp(pattern, 'i');
                return items.filter(rule =>
                  regex.test(rule.target?.value?.toLowerCase() || '')
                );
              }
              return items.filter(rule =>
                rule.target?.value?.toLowerCase().includes(expectedTarget)
              );
            },
            status: (items, value) => {
              const expectedStatus = value.toLowerCase();
              return items.filter(
                rule => rule.status?.toLowerCase() === expectedStatus
              );
            },
          }
        );

        if (params.limit) {
          return filteredResults.slice(0, params.limit);
        }
        return filteredResults;
      },
    });

    this.strategies.set('devices', {
      entityType: 'devices',
      executeApiCall: async (client, params, _apiParams, searchOptions) => {
        const searchQuery = {
          query: params.query,
          limit: params.limit,
          cursor: params?.cursor,
          sort_by: params?.sort_by,
          group_by: params?.group_by,
          aggregate: params?.aggregate,
        };

        // Add time range to searchOptions if provided
        if (params.time_range?.start && params.time_range?.end) {
          searchOptions.time_range = {
            start: params.time_range.start,
            end: params.time_range.end,
          };
        }

        return client.searchDevices(searchQuery, searchOptions);
      },
      processResults: (results, params) => {
        if (params.offset && !params.cursor) {
          // Legacy offset support - only if cursor not provided
          let processedResults = results.slice(params.offset);
          if (params.limit) {
            processedResults = processedResults.slice(0, params.limit);
          }
          return processedResults;
        }
        return results;
      },
    });

    this.strategies.set('target_lists', {
      entityType: 'target_lists',

      executeApiCall: async (client, _params, _apiParams, _searchOptions) => {
        return client.getTargetLists();
      },
      processResults: (results, params) => {
        if (params.limit) {
          return results.slice(0, params.limit);
        }
        return results;
      },
    });
  }

  /**
   * Shared helper for validating limit parameter across all search methods
   * @param limit - The limit value to validate
   * @param entityType - The entity type for context-specific limits
   * @param options - Additional validation options
   */
  private validateLimitParameter(
    limit: number | undefined,
    entityType: string,
    options: {
      required?: boolean;
      defaultLimit?: number;
      maxLimit?: number;
    } = {}
  ): {
    isValid: boolean;
    errors: string[];
    validatedLimit: number;
  } {
    const {
      required = true,
      defaultLimit = 1000,
      maxLimit = entityType === 'flows'
        ? 1000
        : entityType === 'cross_reference'
          ? 5000
          : 1000,
    } = options;

    const actualLimit = limit ?? defaultLimit;

    const validation = ParameterValidator.validateNumber(actualLimit, 'limit', {
      required,
      min: 1,
      max: maxLimit,
      integer: true,
    });

    return {
      isValid: validation.isValid,
      errors: validation.errors,
      validatedLimit: actualLimit,
    };
  }

  /**
   * Standardized parameter validation for all search operations
   */
  private validateSearchParams(
    params: SearchParams,
    entityType: string,
    config: SearchValidationConfig
  ): void {
    const errors: string[] = [];

    // Validate params is not null/undefined
    if (!params || typeof params !== 'object') {
      errors.push('Parameters object is required');
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }

    // Validate query parameter
    if (config.requireQuery !== false) {
      const queryValidation = ParameterValidator.validateRequiredString(
        params?.query,
        'query'
      );
      if (!queryValidation.isValid) {
        errors.push(...queryValidation.errors);
      } else if (
        !config.allowEmptyQuery &&
        !(queryValidation.sanitizedValue as string)?.trim()
      ) {
        errors.push('query cannot be empty');
      }
    }

    // Validate limit parameter with consistent boundary checking
    if (config.requireLimit !== false) {
      const limitValidation = this.validateLimitParameter(
        params?.limit,
        entityType,
        {
          required: true,
          maxLimit: config.maxLimit || (entityType === 'flows' ? 1000 : 500),
        }
      );

      if (!limitValidation.isValid) {
        errors.push(...limitValidation.errors);
      }
    }

    // Validate sort_by parameter if provided
    if (params.sort_by !== undefined) {
      const sortValidation = ParameterValidator.validateOptionalString(
        params.sort_by,
        'sort_by'
      );
      if (!sortValidation.isValid) {
        errors.push(...sortValidation.errors);
      }
    }

    // Validate group_by parameter if provided
    if (params.group_by !== undefined) {
      const groupValidation = ParameterValidator.validateOptionalString(
        params.group_by,
        'group_by'
      );
      if (!groupValidation.isValid) {
        errors.push(...groupValidation.errors);
      }
    }

    // Validate cursor parameter if cursor is supported
    if (config.supportsCursor && params.cursor !== undefined) {
      const cursorValidation = ParameterValidator.validateOptionalString(
        params.cursor,
        'cursor'
      );
      if (!cursorValidation.isValid) {
        errors.push(...cursorValidation.errors);
      }
    }

    // Validate time_range parameter if time range is supported
    if (config.supportsTimeRange && params.time_range !== undefined) {
      if (!params.time_range || typeof params.time_range !== 'object') {
        errors.push(
          'time_range must be an object with start and end properties'
        );
      } else {
        const { start, end } = params.time_range;

        if (start !== undefined) {
          const startDate = new Date(start);
          if (isNaN(startDate.getTime())) {
            errors.push(
              'time_range.start must be a valid ISO 8601 date string'
            );
          }
        }

        if (end !== undefined) {
          const endDate = new Date(end);
          if (isNaN(endDate.getTime())) {
            errors.push('time_range.end must be a valid ISO 8601 date string');
          }
        }

        if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          if (
            !isNaN(startDate.getTime()) &&
            !isNaN(endDate.getTime()) &&
            startDate >= endDate
          ) {
            errors.push('time_range.start must be before time_range.end');
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Generic search execution method that handles common patterns
   */
  private async executeSearch(
    params: SearchParams,
    entityType: string,
    validationConfig: SearchValidationConfig = {}
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      // Get strategy for entity type
      const strategy = this.strategies.get(entityType);
      if (!strategy) {
        throw new Error(
          `No search strategy found for entity type: ${entityType}`
        );
      }

      // Use standardized parameter validation
      this.validateSearchParams(params, entityType, validationConfig);

      // Enhanced query validation with detailed error messages and comprehensive checks
      const enhancedValidation = EnhancedQueryValidator.validateQuery(
        params.query,
        entityType as EntityType
      );

      if (!enhancedValidation.isValid) {
        // Try instance method for detailed position tracking if static method fails
        const enhancedValidator = new EnhancedQueryValidator();
        const detailedValidation = enhancedValidator.validateQuery(
          params.query,
          entityType as EntityType
        );

        // Use detailed errors if available, otherwise use standard errors
        if (detailedValidation.detailedErrors?.length) {
          const errorReport = ErrorFormatter.formatMultipleErrors(
            detailedValidation.detailedErrors
          );
          const formattedText = ErrorFormatter.formatReportAsText(errorReport);

          throw new Error(
            `Enhanced query validation failed:\n${formattedText}`
          );
        } else {
          // Fallback to standard enhanced validation format
          const errorDetails = [
            ...enhancedValidation.errors,
            ...(enhancedValidation.fieldIssues?.map(
              issue =>
                `Field '${issue.field}': ${issue.issue}${issue.suggestion ? ` - ${issue.suggestion}` : ''}`
            ) || []),
          ];

          let errorMessage = `Query validation failed: ${errorDetails.join(', ')}`;

          if (enhancedValidation.suggestions?.length) {
            errorMessage += ` | Suggestions: ${enhancedValidation.suggestions.join(', ')}`;
          }

          if (enhancedValidation.correctedQuery) {
            errorMessage += ` | Try: "${enhancedValidation.correctedQuery}"`;
          }

          throw new Error(errorMessage);
        }
      }

      // Use corrected query if available
      const finalQuery =
        enhancedValidation.correctedQuery ||
        (enhancedValidation.sanitizedValue as string) ||
        params.query;

      // Validate entityType before parsing
      const validEntityTypes = [
        'flows',
        'alarms',
        'rules',
        'devices',
        'target_lists',
      ] as const;
      if (!validEntityTypes.includes(entityType as any)) {
        throw new Error(`Invalid entity type: ${entityType}`);
      }

      const validation = queryParser.parse(
        finalQuery,
        entityType as (typeof validEntityTypes)[number]
      );
      if (!validation.isValid || !validation.ast) {
        // Provide enhanced error messages for syntax issues not caught by enhanced validator
        let enhancedError = `Invalid query syntax: ${validation.errors.join(', ')}`;

        if (validation.suggestions && validation.suggestions.length > 0) {
          enhancedError += `\n\nSuggestions:\n${validation.suggestions.map(s => `• ${s}`).join('\n')}`;
        }

        throw new Error(enhancedError);
      }

      // Set up filter context (entityType already validated above)
      const context: FilterContext = {
        entityType: entityType as (typeof validEntityTypes)[number],
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: [],
        },
      };

      const filterResult = this.applyFiltersRecursively(
        validation.ast,
        context
      );

      // Prepare API parameters
      const apiParams: ApiParameters = {
        ...filterResult.apiParams,
        limit: params.limit,
        start_time: params.time_range?.start,
        end_time: params.time_range?.end,
        queryString: filterResult.queryString,
      };

      // Prepare search options
      const searchOptions: SearchOptions = {};
      if (entityType === 'devices') {
        searchOptions.include_resolved = true;
      }

      // Time range handling is done within individual strategies to avoid duplication

      // Execute API call using strategy
      const response = await strategy.executeApiCall(
        this.firewalla,
        params,
        apiParams,
        searchOptions
      );

      // Process results
      let results = response.results || [];

      // Apply post-processing filters
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      // Apply strategy-specific result processing
      if (strategy.processResults) {
        results = strategy.processResults(results, params);
      }

      // Apply sorting
      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      // Apply pagination (for non-cursor based)
      if (params.offset && entityType !== 'devices') {
        results = results.slice(params.offset);
      }

      // Generate aggregations
      const aggregations = params.aggregate
        ? this.generateAggregations(results, params.group_by)
        : undefined;

      // Build result object
      const result: SearchResult = {
        results,
        count: response.count || results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: finalQuery,
        execution_time_ms: Date.now() - startTime,
        aggregations,
      };

      // Add cursor for devices with proper typing
      if (entityType === 'devices' && response.next_cursor) {
        const resultWithCursor = result as SearchResult & {
          next_cursor?: string;
        };
        resultWithCursor.next_cursor = response.next_cursor;
      }

      return result;
    } catch (error) {
      throw new Error(
        `${entityType} search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute a search query for flows using simplified implementation with direct API calls.
   * Performs basic validation and uses getFlowData API directly for improved reliability.
   * Supports time range filtering and proper limit enforcement.
   */
  async searchFlows(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      // Validate basic search parameters
      this.validateBasicSearchParams(params, 'searchFlows');

      // Basic security check for dangerous patterns
      const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /<script/i,
        /javascript:/i,
        /data:text\/html/i,
      ];

      if (dangerousPatterns.some(pattern => pattern.test(params.query))) {
        throw new Error(
          'Query validation failed: Query contains potentially dangerous content'
        );
      }

      if (
        !params.limit ||
        typeof params.limit !== 'number' ||
        params.limit < 1 ||
        params.limit > 1000
      ) {
        throw new Error(
          'limit parameter is required and must be between 1 and 1000'
        );
      }

      // Apply boolean field translation before building query string
      const translatedQuery = BooleanFieldTranslator.translateQuery(
        params.query,
        'flows'
      );

      // Build query string with time range if provided
      let queryString = translatedQuery;
      if (params.time_range?.start && params.time_range?.end) {
        const startDate = new Date(params.time_range.start);
        const endDate = new Date(params.time_range.end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error(
            'Parameter validation failed: time_range must contain valid ISO 8601 dates'
          );
        }

        if (startDate >= endDate) {
          throw new Error('time_range.start must be before time_range.end');
        }

        const startTs = Math.floor(startDate.getTime() / 1000);
        const endTs = Math.floor(endDate.getTime() / 1000);
        queryString = `ts:${startTs}-${endTs} AND (${translatedQuery})`;
      }

      // Add geographic filters if provided
      if (params.geographic_filters) {
        // Validate and obtain a sanitized copy
        const sanitizedGeoFilters = this.validateGeographicFilters(
          params.geographic_filters
        );

        const geographicQuery = this.buildGeographicQuery(sanitizedGeoFilters);
        if (geographicQuery) {
          queryString = queryString
            ? `${queryString} AND ${geographicQuery}`
            : geographicQuery;
        }
      }

      // Call API directly without complex validation/parsing
      const response = await this.firewalla.getFlowData(
        queryString,
        params.group_by,
        params.sort_by || 'ts:desc',
        params.limit,
        params.cursor
      );

      // Apply client-side offset if needed (for backward compatibility)
      let results = response.results || [];

      // Enrich results with geographic data (filtering out null entries)
      results = results
        .filter(flow => flow !== null && flow !== undefined)
        .map(flow => enrichObjectWithGeo(flow));
      if (params.offset && !params.cursor) {
        results = results.slice(params.offset);
      }

      // Apply client-side limit enforcement to ensure exact limit compliance
      if (results.length > params.limit) {
        results = results.slice(0, params.limit);
      }

      // Add geographic analysis if requested
      let geographicAnalysis;
      if (params.include_analytics || params.geographic_filters) {
        geographicAnalysis = this.analyzeGeographicData(results);
      }

      const result: SearchResult = {
        results,
        count: results.length,
        limit: params.limit,
        offset: params.offset || 0,
        query: queryString,
        execution_time_ms: Date.now() - startTime,
        next_cursor: response.next_cursor,
      };

      // Add boolean translation debug info if translation was applied
      if (BooleanFieldTranslator.needsTranslation(params.query, 'flows')) {
        (result as any).boolean_translation = {
          original_query: params.query,
          translated_query: translatedQuery,
          translation_applied: true,
        };
      }

      // Add optional fields
      if (geographicAnalysis) {
        (result as any).geographic_analysis = geographicAnalysis;
      }
      if (params.geographic_filters) {
        (result as any).geographic_filters_applied = true;
      }

      return result;
    } catch (error) {
      throw new Error(
        `search_flows failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a search query for alarms using simplified implementation with direct API calls.
   * Performs basic validation and uses getActiveAlarms API directly for improved reliability.
   * Supports query filtering and proper limit enforcement.
   */
  async searchAlarms(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      // Validate basic search parameters
      this.validateBasicSearchParams(params, 'searchFlows');

      // Basic security check for dangerous patterns
      const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /<script/i,
        /javascript:/i,
        /data:text\/html/i,
      ];

      if (dangerousPatterns.some(pattern => pattern.test(params.query))) {
        throw new Error(
          'Enhanced query validation failed: Query contains potentially dangerous content'
        );
      }

      if (
        !params.limit ||
        typeof params.limit !== 'number' ||
        params.limit < 1 ||
        params.limit > 5000
      ) {
        throw new Error(
          'limit parameter is required and must be between 1 and 5000'
        );
      }

      // Apply boolean field translation before building query string
      const translatedQuery = BooleanFieldTranslator.translateQuery(
        params.query,
        'alarms'
      );

      // Build query string with optional severity filter
      let alarmQuery = translatedQuery;
      if ((params as any).severity) {
        const sev = (params as any).severity;
        alarmQuery = alarmQuery
          ? `${alarmQuery} AND severity:${sev}`
          : `severity:${sev}`;
      }

      // Call API directly without complex validation/parsing
      const response = await this.firewalla.getActiveAlarms(
        alarmQuery,
        params.group_by,
        params.sort_by || 'timestamp:desc',
        params.limit,
        params.cursor
      );

      // Apply client-side offset if needed (for backward compatibility)
      let results = response.results || [];

      // Enrich results with geographic data (filtering out null entries)
      results = results
        .filter(flow => flow !== null && flow !== undefined)
        .map(flow => enrichObjectWithGeo(flow));
      if (params.offset && !params.cursor) {
        results = results.slice(params.offset);
      }

      // Apply client-side limit enforcement to ensure exact limit compliance
      if (results.length > params.limit) {
        results = results.slice(0, params.limit);
      }

      const result = {
        results,
        count: results.length,
        limit: params.limit,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        next_cursor: response.next_cursor,
      };

      // Add boolean translation debug info if translation was applied
      if (BooleanFieldTranslator.needsTranslation(params.query, 'alarms')) {
        (result as any).boolean_translation = {
          original_query: params.query,
          translated_query: translatedQuery,
          translation_applied: true,
        };
      }

      return result;
    } catch (error) {
      throw new Error(
        `search_alarms failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a search query for rules
   */
  async searchRules(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'rules', {
      requireQuery: true,
      requireLimit: true,
      maxLimit: 3000,
    });
  }

  /**
   * Execute a search query for devices using cursor-based pagination
   */
  async searchDevices(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'devices', {
      requireQuery: true,
      requireLimit: true,
      supportsCursor: true,
      supportsTimeRange: true,
      maxLimit: 2000,
    });
  }

  /**
   * Execute a search query for target lists
   */
  async searchTargetLists(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'target_lists', {
      requireQuery: true,
      requireLimit: true,
      maxLimit: 1000,
    });
  }

  /**
   * Execute search for a specific entity type and query
   */
  private async executeSearchByType(
    entityType: string,
    query: string,
    limit: number = 1000
  ): Promise<SearchResult> {
    switch (entityType) {
      case 'flows':
        return this.searchFlows({ query, limit });
      case 'alarms':
        return this.searchAlarms({ query, limit });
      case 'rules':
        return this.searchRules({ query, limit });
      case 'devices':
        return this.searchDevices({ query, limit });
      case 'target_lists':
        return this.searchTargetLists({ query, limit });
      default:
        return this.searchFlows({ query, limit });
    }
  }

  /**
   * Enhanced cross-reference search with multi-field correlation capabilities
   */
  async enhancedCrossReferenceSearch(params: {
    primary_query: string;
    secondary_queries: string[];
    correlation_params: EnhancedCorrelationParams;
    limit?: number;
    entity_types?: {
      primary?: 'flows' | 'alarms' | 'rules' | 'devices';
      secondary?: Array<'flows' | 'alarms' | 'rules' | 'devices'>;
    };
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limitValidation = this.validateLimitParameter(
        params.limit,
        'cross_reference',
        {
          defaultLimit: 1000,
          maxLimit: 5000,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      const limit = limitValidation.validatedLimit;

      // Validate correlation field count before other validations
      if (params.correlation_params.correlationFields) {
        try {
          this.validateCorrelationFieldCount(
            params.correlation_params.correlationFields
          );
        } catch (error) {
          throw new Error(
            `Enhanced cross-reference validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // Validate enhanced cross-reference parameters with detailed error messages
      const validation = validateEnhancedCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_params
      );

      if (!validation.isValid) {
        // Create enhanced correlation error messages
        const enhancedErrors = validation.errors.map(error => {
          if (error.includes('correlation field')) {
            const fieldMatch = error.match(/field '([^']+)'/);
            if (fieldMatch) {
              const field = fieldMatch[1];
              const entityTypes = [
                'flows',
                'alarms',
                'rules',
                'devices',
              ] as Array<'flows' | 'alarms' | 'rules' | 'devices'>;
              const fieldValidation = FieldValidator.validateFieldAcrossTypes(
                field,
                entityTypes
              );

              if (
                !fieldValidation.isValid &&
                fieldValidation.suggestions.length > 0
              ) {
                return `${error}. ${fieldValidation.suggestions[0]}`;
              }
            }
          }

          if (error.includes('correlation type')) {
            return `${error}. Valid correlation types are: "AND" (all fields must match), "OR" (any field can match)`;
          }

          return error;
        });

        throw new Error(
          `Enhanced cross-reference validation failed:\n${enhancedErrors.map(e => `• ${e}`).join('\n')}`
        );
      }

      // Determine entity types (use provided types or fall back to pattern matching)
      const primaryType =
        params.entity_types?.primary ||
        suggestEntityType(params.primary_query) ||
        'flows';

      const secondaryTypes = params.secondary_queries.map((q, index) => {
        return (
          params.entity_types?.secondary?.[index] ||
          suggestEntityType(q) ||
          'alarms'
        );
      });

      // Apply boolean field translation to queries
      const translatedPrimaryQuery = BooleanFieldTranslator.translateQuery(
        params.primary_query,
        primaryType
      );
      const translatedSecondaryQueries = params.secondary_queries.map(
        (query, index) =>
          BooleanFieldTranslator.translateQuery(query, secondaryTypes[index])
      );

      // Execute primary query
      const primaryResult = await this.executeSearchByType(
        primaryType,
        translatedPrimaryQuery,
        limit
      );

      // Execute secondary queries and perform enhanced correlation
      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType,
        },
        correlations: [],
        correlation_params: params.correlation_params,
      };

      for (let index = 0; index < params.secondary_queries.length; index++) {
        const secondaryQuery = translatedSecondaryQueries[index];
        const secondaryType = secondaryTypes[index];

        // Execute secondary query
        const secondaryResult = await this.executeSearchByType(
          secondaryType,
          secondaryQuery,
          limit
        );

        // Perform in-memory correlation using correlateResults function
        // Use the first correlation field from the enhanced parameters
        const correlationField =
          params.correlation_params.correlationFields?.[0] || 'source_ip';
        const correlated = correlateResults(
          primaryResult.results,
          secondaryResult.results,
          correlationField
        );

        // Create correlation result structure to match expected format
        const correlationResult = {
          correlatedResults: correlated.map(c => c.secondary),
          scoredResults: correlated.map(c => ({
            entity: c.secondary,
            score: c.correlationScore,
            matchedFields: [correlationField],
          })),
          correlationStats: {
            correlationRate:
              (correlated.length / Math.max(primaryResult.results.length, 1)) *
              100,
          },
          enhancedStats: {
            totalCorrelated: correlated.length,
          },
        };

        // Map correlation results to include scoring information
        const mappedResults = correlationResult.scoredResults
          ? correlationResult.scoredResults.map((scoredItem: any) => ({
              correlation_strength: scoredItem.score || 0,
              matched_fields: scoredItem.matchedFields || [],
              data: scoredItem.entity,
            }))
          : correlationResult.correlatedResults.map((item: any) => ({
              correlation_strength: 0,
              matched_fields: [],
              data: item,
            }));

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: mappedResults,
          count: correlationResult.correlatedResults.length,
          correlation_stats: correlationResult.correlationStats,
          enhanced_stats: correlationResult.enhancedStats,
          entity_type: secondaryType,
        });
      }

      // Calculate overall correlation summary
      const totalCorrelated = correlatedResults.correlations.reduce(
        (sum: number, c: any) => sum + c.count,
        0
      );
      const avgCorrelationRate =
        correlatedResults.correlations.length > 0
          ? Math.round(
              correlatedResults.correlations.reduce(
                (sum: number, c: any) =>
                  sum + c.correlation_stats.correlationRate,
                0
              ) / correlatedResults.correlations.length
            )
          : 0;

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          total_correlated_count: totalCorrelated,
          average_correlation_rate: avgCorrelationRate,
          correlation_fields: params.correlation_params.correlationFields,
          correlation_type: params.correlation_params.correlationType,
          temporal_window_applied: !!params.correlation_params.temporalWindow,
        },
      };
    } catch (error) {
      throw new Error(
        `Enhanced cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cross-reference search across multiple entity types with improved field mapping
   */
  async crossReferenceSearch(params: {
    primary_query: string;
    secondary_queries: string[];
    correlation_field: string;
    limit?: number;
    primary_entity_type?: 'flows' | 'alarms' | 'rules' | 'devices';
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limitValidation = this.validateLimitParameter(
        params.limit,
        'cross_reference',
        {
          defaultLimit: 1000,
          maxLimit: 5000,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      const limit = limitValidation.validatedLimit;

      // Validate correlation field count for regular cross-reference (single field only)
      if (
        typeof params.correlation_field === 'string' &&
        params.correlation_field.includes(',')
      ) {
        const fields = params.correlation_field.split(',').map(f => f.trim());
        if (fields.length > 5) {
          const excessFields = fields.slice(5);
          throw new Error(
            `Cross-reference validation failed: Maximum 5 correlation fields allowed, but ${fields.length} provided. Please remove these fields: ${excessFields.join(', ')}`
          );
        }
      }

      // Determine entity types (use provided type or fall back to pattern matching)
      const primaryType =
        params.primary_entity_type ||
        suggestEntityType(params.primary_query) ||
        'flows';

      const secondaryTypes = params.secondary_queries.map(q => {
        return suggestEntityType(q) || 'alarms';
      });

      // Apply boolean field translation to queries
      const translatedPrimaryQuery = BooleanFieldTranslator.translateQuery(
        params.primary_query,
        primaryType
      );
      const translatedSecondaryQueries = params.secondary_queries.map(
        (query, index) =>
          BooleanFieldTranslator.translateQuery(query, secondaryTypes[index])
      );

      // Fetch primary data (no API-level correlation parameters)
      let primaryResult;
      switch (primaryType) {
        case 'flows':
          primaryResult = await this.searchFlows({
            query: translatedPrimaryQuery,
            limit,
          });
          break;
        case 'alarms':
          primaryResult = await this.searchAlarms({
            query: translatedPrimaryQuery,
            limit,
          });
          break;
        case 'rules':
          primaryResult = await this.searchRules({
            query: translatedPrimaryQuery,
            limit,
          });
          break;
        case 'devices':
          primaryResult = await this.searchDevices({
            query: translatedPrimaryQuery,
            limit,
          });
          break;
        case 'target_lists':
          primaryResult = await this.searchTargetLists({
            query: translatedPrimaryQuery,
            limit,
          });
          break;
        default:
          primaryResult = await this.searchFlows({
            query: translatedPrimaryQuery,
            limit,
          });
      }

      // Extract correlation values for client-side filtering
      const correlationValues = new Set<string>();
      primaryResult.results.forEach((item: any) => {
        const value = this.extractFieldValue(
          item,
          params.correlation_field,
          primaryType
        );
        if (value) {
          correlationValues.add(String(value));
        }
      });

      // Fetch secondary data separately and perform client-side correlation
      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType,
        },
        correlations: [],
      };

      for (let index = 0; index < params.secondary_queries.length; index++) {
        const secondaryQuery = translatedSecondaryQueries[index];
        const secondaryType = secondaryTypes[index];

        // Fetch secondary data (no API-level correlation parameters)
        let secondaryResult;
        switch (secondaryType) {
          case 'flows':
            secondaryResult = await this.searchFlows({
              query: secondaryQuery,
              limit,
            });
            break;
          case 'alarms':
            secondaryResult = await this.searchAlarms({
              query: secondaryQuery,
              limit,
            });
            break;
          case 'rules':
            secondaryResult = await this.searchRules({
              query: secondaryQuery,
              limit,
            });
            break;
          case 'devices':
            secondaryResult = await this.searchDevices({
              query: secondaryQuery,
              limit,
            });
            break;
          case 'target_lists':
            secondaryResult = await this.searchTargetLists({
              query: secondaryQuery,
              limit,
            });
            break;
          default:
            secondaryResult = await this.searchAlarms({
              query: secondaryQuery,
              limit,
            });
        }

        // Perform in-memory correlation using correlateResults function
        const correlated = correlateResults(
          primaryResult.results,
          secondaryResult.results,
          params.correlation_field
        );
        const correlatedItems = correlated.map(c => c.secondary);

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: correlatedItems,
          count: correlatedItems.length,
          correlation_field: params.correlation_field,
          entity_type: secondaryType,
        });
      }

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          unique_correlation_values: correlationValues.size,
          correlated_count: correlatedResults.correlations.reduce(
            (sum: number, c: any) => sum + c.count,
            0
          ),
          correlation_rate:
            primaryResult.count > 0
              ? Math.round(
                  (correlatedResults.correlations.reduce(
                    (sum: number, c: any) => sum + c.count,
                    0
                  ) /
                    primaryResult.count) *
                    100
                )
              : 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract field value from item for correlation
   */
  private extractFieldValue(
    item: any,
    field: string,
    _entityType: string
  ): any {
    // Handle common correlation fields across entity types
    switch (field) {
      case 'source_ip':
        return item.source?.ip || item.device?.ip || item.source_ip || item.ip;
      case 'destination_ip':
        return (
          item.destination?.ip ||
          item.remote?.ip ||
          item.destination_ip ||
          item.target_ip
        );
      case 'device_ip':
        return item.device?.ip || item.source?.ip || item.device_ip || item.ip;
      case 'protocol':
        return item.protocol;
      case 'country':
        return item.remote?.country || item.country;
      case 'device_id':
        return item.device?.id || item.device_id;
      default:
        // Try direct field access
        return item[field];
    }
  }

  /**
   * Recursively apply filters to a query AST
   */
  private applyFiltersRecursively(node: any, context: FilterContext): any {
    switch (node.type) {
      case 'logical': {
        // For logical nodes, apply filters to operands and combine

        const combinedResult: {
          apiParams: ApiParameters;
          postProcessing?: (items: any[]) => any[];
        } = { apiParams: {} };

        if (node.left) {
          const leftResult = this.applyFiltersRecursively(node.left, context);
          Object.assign(combinedResult.apiParams, leftResult.apiParams);
          if (leftResult.postProcessing) {
            combinedResult.postProcessing = leftResult.postProcessing;
          }
        }

        if (node.right) {
          const rightResult = this.applyFiltersRecursively(node.right, context);
          Object.assign(combinedResult.apiParams, rightResult.apiParams);

          // Combine post-processing for logical operations
          if (rightResult.postProcessing) {
            const existingPostProcessing = combinedResult.postProcessing;
            if (existingPostProcessing && node.operator === 'AND') {
              combinedResult.postProcessing = (items: any[]): any[] =>
                rightResult.postProcessing!(existingPostProcessing(items));
            } else if (node.operator === 'OR') {
              // OR logic is more complex, simplified for now
              combinedResult.postProcessing = rightResult.postProcessing;
            } else {
              combinedResult.postProcessing = rightResult.postProcessing;
            }
          }
        }

        if (node.operand) {
          // NOT operation
          const operandResult = this.applyFiltersRecursively(
            node.operand,
            context
          );
          if (operandResult.postProcessing) {
            combinedResult.postProcessing = (items: any[]): any[] => {
              const filtered = operandResult.postProcessing!(items);
              return items.filter(item => !filtered.includes(item));
            };
          }
        }

        return combinedResult;
      }
      case 'group':
        return this.applyFiltersRecursively(node.query, context);

      default:
        // Apply filters for leaf nodes
        return filterFactory.applyFilters(node, context);
    }
  }

  /**
   * Sort results by a field
   */
  private sortResults(
    results: any[],
    sortBy: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ): any[] {
    // Pre-compute values for efficient sorting
    const itemsWithValues = results.map(item => ({
      item,
      value: this.getNestedValue(item, sortBy),
    }));

    itemsWithValues.sort((a, b) => {
      const valueA = a.value;
      const valueB = b.value;

      // Handle null/undefined values - sort nulls to the end
      if (
        (valueA === null || valueA === undefined) &&
        (valueB === null || valueB === undefined)
      ) {
        return 0;
      }
      if (valueA === null || valueA === undefined) {
        return 1;
      } // null values go to end
      if (valueB === null || valueB === undefined) {
        return -1;
      } // null values go to end

      if (valueA === valueB) {
        return 0;
      }

      // Handle string vs number comparisons
      const comparison = valueA < valueB ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return itemsWithValues.map(({ item }) => item);
  }

  /**
   * Generate aggregations for results
   */
  private generateAggregations(results: any[], groupBy?: string): any {
    if (!groupBy) {
      return {
        total: { count: results.length },
      };
    }

    const groups: Record<string, any[]> = {};

    for (const item of results) {
      const groupValue = String(
        this.getNestedValue(item, groupBy) || 'unknown'
      );
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(item);
    }

    const aggregations: any = {};

    for (const [groupValue, groupItems] of Object.entries(groups)) {
      aggregations[groupValue] = {
        count: groupItems.length,
        percentage: Math.round((groupItems.length / results.length) * 100),
      };
    }

    return aggregations;
  }

  /**
   * Get nested value from object using dot notation (enhanced with field mapping)
   */
  private getNestedValue(obj: any, path: string): any {
    return SafeAccess.getNestedValue(obj, path);
  }

  /**
   * Get suggested correlation field combinations for given queries with enhanced validation
   */
  async getCorrelationSuggestions(params: {
    primary_query: string;
    secondary_queries: string[];
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate input parameters
      const primaryValidation = ParameterValidator.validateRequiredString(
        params.primary_query,
        'primary_query'
      );
      if (!primaryValidation.isValid) {
        throw new Error(
          `Primary query validation failed: ${primaryValidation.errors.join(', ')}`
        );
      }

      if (!Array.isArray(params.secondary_queries)) {
        throw new Error('secondary_queries must be an array');
      }

      if (params.secondary_queries.length === 0) {
        throw new Error(
          'secondary_queries array cannot be empty - at least one secondary query is required'
        );
      }

      // Validate each secondary query
      for (let i = 0; i < params.secondary_queries.length; i++) {
        const secondaryValidation = ParameterValidator.validateRequiredString(
          params.secondary_queries[i],
          `secondary_queries[${i}]`
        );
        if (!secondaryValidation.isValid) {
          throw new Error(
            `Secondary query ${i} validation failed: ${secondaryValidation.errors.join(', ')}`
          );
        }
      }

      // Parse and validate queries to determine entity types more accurately
      const primaryType =
        this.determineEntityTypeFromQuery(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(q => {
        const type = this.determineEntityTypeFromQuery(q);
        if (!type) {
          // Could not determine entity type for secondary query, defaulting to 'alarms'
          return 'alarms';
        }
        return type;
      });

      const allTypes = [primaryType, ...secondaryTypes] as EntityType[];

      // Validate entity type combinations
      const uniqueTypes = [...new Set(allTypes)];
      if (uniqueTypes.length === 1) {
        // All queries appear to target the same entity type. Cross-reference may not be meaningful.
      }

      // Get validated field combinations using enhanced validation
      // Use a more comprehensive list of common correlation fields
      const fieldValidationResult =
        EnhancedQueryValidator.validateCorrelationFields(
          [
            'source_ip',
            'destination_ip',
            'device_ip',
            'protocol',
            'timestamp',
            'country',
            'asn',
            'port',
            'device_id',
            'gid',
            'type',
            'severity',
            'status',
            'action',
            'target_value',
            'mac',
            'application',
            'user_agent',
            'domain',
            'subnet',
            'city',
            'region',
            'continent',
            'organization',
            'isp',
            'hosting_provider',
            'is_cloud_provider',
            'is_vpn',
            'is_proxy',
          ] as CorrelationFieldName[],
          primaryType,
          secondaryTypes
        );

      // Get supported correlation combinations with better filtering
      const combinations = getSupportedCorrelationCombinations(uniqueTypes);
      const validCombinations = combinations.filter(combo =>
        combo.every(field =>
          fieldValidationResult.compatibleFields?.includes(
            field as CorrelationFieldName
          )
        )
      );

      // Enhanced categorization with confidence scoring
      const suggestions = {
        primary_entity_type: primaryType,
        secondary_entity_types: secondaryTypes,

        // Compatibility analysis
        compatibility_analysis: {
          compatible_fields_count:
            fieldValidationResult.compatibleFields?.length || 0,
          incompatible_fields: fieldValidationResult.errors || [],
          compatibility_suggestions: fieldValidationResult.suggestions || [],
        },

        // Field combinations by complexity
        single_field: validCombinations.filter(combo => combo.length === 1),
        dual_field: validCombinations.filter(combo => combo.length === 2),
        multi_field: validCombinations.filter(combo => combo.length >= 3),

        // Context-aware recommendations based on entity types
        recommended_by_context: this.generateContextualRecommendations(
          primaryType,
          secondaryTypes
        ),

        // High-confidence recommendations
        high_confidence: [
          // Network identity correlations (highest confidence)
          ['source_ip', 'device_ip'],
          ['device_ip', 'destination_ip'],
          // Protocol and network behavior
          ['protocol', 'source_ip'],
          ['protocol', 'device_ip'],
          // Temporal correlations
          ['timestamp', 'device_ip'],
          // Geographic correlations
          ['country', 'source_ip'],
          ['asn', 'source_ip'],
        ].filter(combo =>
          validCombinations.some(
            c => c.length === combo.length && combo.every(f => c.includes(f))
          )
        ),

        // Medium-confidence recommendations
        medium_confidence: [
          // Application-level correlations
          ['application', 'device_ip'],
          ['user_agent', 'source_ip'],
          // Security-focused correlations
          ['threat_level', 'source_ip'],
          ['geographic_risk_score', 'country'],
          // Behavioral correlations
          ['session_duration', 'device_ip'],
          ['frequency_score', 'source_ip'],
        ].filter(combo =>
          validCombinations.some(
            c => c.length === combo.length && combo.every(f => c.includes(f))
          )
        ),

        // All compatible fields for manual selection
        all_compatible_fields: fieldValidationResult.compatibleFields || [],

        // Field usage statistics for the discovered entity types
        field_usage_stats: this.generateFieldUsageStats(uniqueTypes),

        // Validation warnings and errors
        validation_issues: {
          errors: fieldValidationResult.errors || [],
          warnings: fieldValidationResult.suggestions || [],
        },

        execution_time_ms: Date.now() - startTime,
      };

      return suggestions;
    } catch (error) {
      throw new Error(
        `Correlation suggestions failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Determine entity type from query content with improved heuristics
   */
  private determineEntityTypeFromQuery(query: string): EntityType | null {
    const lowerQuery = query.toLowerCase();

    // Flow-specific indicators
    if (
      lowerQuery.includes('bytes') ||
      lowerQuery.includes('download') ||
      lowerQuery.includes('upload') ||
      lowerQuery.includes('protocol:') ||
      lowerQuery.includes('direction:') ||
      lowerQuery.includes('blocked:')
    ) {
      return 'flows';
    }

    // Alarm-specific indicators
    if (
      lowerQuery.includes('severity:') ||
      lowerQuery.includes('type:') ||
      lowerQuery.includes('resolved:') ||
      lowerQuery.includes('alarm') ||
      lowerQuery.includes('alert')
    ) {
      return 'alarms';
    }

    // Rule-specific indicators
    if (
      lowerQuery.includes('action:') ||
      lowerQuery.includes('target:') ||
      lowerQuery.includes('rule') ||
      lowerQuery.includes('policy') ||
      lowerQuery.includes('active:')
    ) {
      return 'rules';
    }

    // Device-specific indicators
    if (
      lowerQuery.includes('online:') ||
      lowerQuery.includes('mac:') ||
      lowerQuery.includes('device') ||
      lowerQuery.includes('mac_vendor:') ||
      lowerQuery.includes('last_seen:')
    ) {
      return 'devices';
    }

    // Target list indicators
    if (
      lowerQuery.includes('category:') ||
      lowerQuery.includes('owner:') ||
      lowerQuery.includes('target_count:')
    ) {
      return 'target_lists';
    }

    return null;
  }

  /**
   * Generate contextual recommendations based on entity type combinations
   */
  private generateContextualRecommendations(
    primaryType: EntityType,
    secondaryTypes: EntityType[]
  ): any {
    const recommendations: any = {};

    if (primaryType === 'flows') {
      if (secondaryTypes.includes('alarms')) {
        recommendations.flows_to_alarms = {
          description: 'Correlate network flows with security alarms',
          recommended_fields: [
            'source_ip',
            'device_ip',
            'protocol',
            'timestamp',
          ],
          use_cases: [
            'Incident investigation',
            'Threat hunting',
            'Security analysis',
          ],
        };
      }
      if (secondaryTypes.includes('devices')) {
        recommendations.flows_to_devices = {
          description: 'Correlate network flows with device information',
          recommended_fields: ['device_ip', 'mac', 'device_id'],
          use_cases: ['Device behavior analysis', 'Network usage tracking'],
        };
      }
    }

    if (primaryType === 'alarms' && secondaryTypes.includes('flows')) {
      recommendations.alarms_to_flows = {
        description: 'Correlate security alarms with network activity',
        recommended_fields: ['source_ip', 'timestamp', 'protocol'],
        use_cases: ['Attack pattern analysis', 'Impact assessment'],
      };
    }

    return recommendations;
  }

  /**
   * Generate field usage statistics for entity types
   */
  private generateFieldUsageStats(entityTypes: EntityType[]): any {
    const stats: any = {};

    for (const entityType of entityTypes) {
      const mappings = FIELD_MAPPINGS[entityType];
      const fieldCount = Object.keys(mappings).length;

      stats[entityType] = {
        total_fields: fieldCount,
        common_fields: Object.keys(mappings).filter(field =>
          ['source_ip', 'device_ip', 'timestamp', 'protocol'].includes(field)
        ).length,
        geographic_fields: Object.keys(mappings).filter(field =>
          ['country', 'region', 'city', 'asn'].includes(field)
        ).length,
        network_fields: Object.keys(mappings).filter(field =>
          ['source_ip', 'destination_ip', 'protocol', 'port'].includes(field)
        ).length,
      };
    }

    return stats;
  }

  /**
   * Build geographic query string from filters using FirewallaClient
   */
  private buildGeographicQuery(filters: {
    countries?: string[];
    continents?: string[];
    regions?: string[];
    cities?: string[];
    asns?: string[];
    hosting_providers?: string[];
    exclude_cloud?: boolean;
    exclude_vpn?: boolean;
    min_risk_score?: number;
  }): string {
    // Use FirewallaClient's buildGeoQuery method for proper API syntax
    return this.firewalla.buildGeoQuery(filters);
  }

  /**
   * Advanced geographic search for alarms with location-based threat analysis.
   * Builds proper query strings for the Firewalla API.
   */
  async searchAlarmsByGeography(params: {
    query?: string;
    geographic_filters?: {
      countries?: string[];
      continents?: string[];
      regions?: string[];
      high_risk_countries?: boolean;
      exclude_known_providers?: boolean;
      threat_analysis?: boolean;
    };
    limit: number;
    sort_by?: string;
    group_by?: string;
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limitValidation = ParameterValidator.validateNumber(
        params.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 5000,
          integer: true,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      // Validate geographic filters if provided
      let sanitizedGeoFilters = params.geographic_filters;
      if (params.geographic_filters) {
        sanitizedGeoFilters = this.validateGeographicFilters(
          params.geographic_filters
        );
      }

      // Fetch unfiltered results first (client-side geographic filtering)
      const unfilteredResults = await this.searchAlarms({
        query: params.query || '*',
        limit: 5000, // Fetch larger set for client-side filtering (max allowed by searchAlarms)
        sort_by: params.sort_by,
        group_by: params.group_by,
      });

      // Apply client-side geographic filtering if filters provided
      let filteredResults = unfilteredResults.results;
      if (
        sanitizedGeoFilters &&
        typeof sanitizedGeoFilters === 'object' &&
        sanitizedGeoFilters !== null
      ) {
        const { filterByGeography } = await import('../utils/geographic.js');
        filteredResults = filterByGeography(
          unfilteredResults.results,
          sanitizedGeoFilters
        );
      }

      // Apply limit to filtered results
      if (filteredResults.length > params.limit) {
        filteredResults = filteredResults.slice(0, params.limit);
      }

      const result = {
        ...unfilteredResults,
        results: filteredResults,
        count: filteredResults.length,
      };

      // Add geographic threat analysis if requested
      let threatAnalysis;
      if (params.geographic_filters?.threat_analysis) {
        threatAnalysis = this.analyzeGeographicThreats(result.results);
      }

      return {
        ...result,
        geographic_filters_applied: !!params.geographic_filters,
        geographic_threat_analysis: threatAnalysis,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Geographic alarms search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Comprehensive geographic statistics and analytics
   */
  async getGeographicStatistics(params: {
    entity_type: 'flows' | 'alarms';
    time_range?: {
      start: string;
      end: string;
    };
    analysis_type?: 'summary' | 'detailed' | 'threat_intelligence';
    group_by?: 'country' | 'continent' | 'region' | 'asn' | 'provider';
    limit?: number;
  }): Promise<any> {
    const startTime = Date.now();

    try {
      const limitValidation = this.validateLimitParameter(
        params.limit,
        'statistics',
        {
          defaultLimit: 1000,
          maxLimit: 1000,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      const limit = limitValidation.validatedLimit;

      // Build base query for geographic analysis
      let baseQuery = '*';

      // Add time range if specified using Firewalla API format
      if (params.time_range) {
        const startTs = Math.floor(
          new Date(params.time_range.start).getTime() / 1000
        );
        const endTs = Math.floor(
          new Date(params.time_range.end).getTime() / 1000
        );
        // Use Firewalla's time range format: ts:start-end
        baseQuery = `ts:${startTs}-${endTs}`;
      }

      // Fetch unfiltered results first (client-side geographic processing)
      let searchResult;
      if (params.entity_type === 'flows') {
        searchResult = await this.searchFlows({
          query: baseQuery,
          limit: 1000, // Max allowed by searchFlows
        });
      } else {
        searchResult = await this.searchAlarms({
          query: baseQuery,
          limit: 5000, // Max allowed by searchAlarms
        });
      }

      // Process results with client-side geographic grouping
      const processedResults = searchResult.results;

      // Group results by specified field for statistics
      const groupByField = params.group_by || 'country';
      const groupedData = this.groupResultsByGeographicField(
        processedResults,
        groupByField
      );

      // Apply limit to grouped results
      const limitedGroups = Object.entries(groupedData)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, limit);

      const limitedGroupedData = Object.fromEntries(limitedGroups);

      // Generate geographic statistics from grouped data
      const statistics = this.generateGeographicStatistics(
        { results: processedResults, count: processedResults.length },
        params.analysis_type || 'summary',
        groupByField,
        limitedGroupedData
      );

      return {
        entity_type: params.entity_type,
        time_range: params.time_range,
        analysis_type: params.analysis_type || 'summary',
        group_by: groupByField,
        statistics,
        total_records: processedResults.length,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Geographic statistics failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Analyze geographic data for patterns and insights
   */
  private analyzeGeographicData(results: any[]): any {
    const analysis = {
      total_flows: results.length,
      unique_countries: new Set(),
      unique_continents: new Set(),
      unique_asns: new Set(),
      cloud_provider_flows: 0,
      vpn_flows: 0,
      high_risk_flows: 0,
      top_countries: {} as Record<string, number>,
      top_asns: {} as Record<string, number>,
      geographic_data_available: false,
      warnings: [] as string[],
    };

    let hasGeographicData = false;

    results.forEach(flow => {
      // Extract geographic data using field mapping
      const country = getFieldValue(flow, 'country', 'flows');
      const continent = getFieldValue(flow, 'continent', 'flows');
      const asn = getFieldValue(flow, 'asn', 'flows');
      const isCloud = getFieldValue(flow, 'is_cloud_provider', 'flows');
      const isVpn = getFieldValue(flow, 'is_vpn', 'flows');
      const riskScore = getFieldValue(flow, 'geographic_risk_score', 'flows');

      // Check if any geographic data is available
      if (country || continent || asn || isCloud || isVpn || riskScore) {
        hasGeographicData = true;
      }

      if (country && typeof country === 'string') {
        analysis.unique_countries.add(country);
        analysis.top_countries[country] =
          (analysis.top_countries[country] || 0) + 1;
      }

      if (continent) {
        analysis.unique_continents.add(continent);
      }

      if (asn && typeof asn === 'string') {
        analysis.unique_asns.add(asn);
        analysis.top_asns[asn] = (analysis.top_asns[asn] || 0) + 1;
      }

      if (isCloud) {
        analysis.cloud_provider_flows++;
      }
      if (isVpn) {
        analysis.vpn_flows++;
      }
      if (
        riskScore &&
        Number(riskScore) >= getRiskThresholds().highRiskFlowMin
      ) {
        analysis.high_risk_flows++;
      }
    });

    // Add warnings if no geographic data found
    analysis.geographic_data_available = hasGeographicData;

    if (!hasGeographicData && results.length > 0) {
      analysis.warnings.push(
        'No geographic data found in flow results. Geographic enrichment may be disabled or unavailable.'
      );
      analysis.warnings.push(
        'Consider enabling geographic enrichment in Firewalla settings or check API configuration.'
      );
    }

    // Convert sets to counts
    return {
      ...analysis,
      unique_countries: analysis.unique_countries.size,
      unique_continents: analysis.unique_continents.size,
      unique_asns: analysis.unique_asns.size,
      top_countries: Object.entries(analysis.top_countries)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .reduce(
          (acc, [country, count]) => {
            acc[country] = count;
            return acc;
          },
          {} as Record<string, number>
        ),
      top_asns: Object.entries(analysis.top_asns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .reduce(
          (acc, [asn, count]) => {
            acc[asn] = count;
            return acc;
          },
          {} as Record<string, number>
        ),
    };
  }

  /**
   * Analyze geographic threats for security insights
   */
  private analyzeGeographicThreats(results: any[]): any {
    const threats = {
      total_alarms: results.length,
      high_risk_countries: {} as Record<string, number>,
      threat_by_continent: {} as Record<string, number>,
      suspicious_asns: {} as Record<string, number>,
      cloud_threats: 0,
      vpn_threats: 0,
      proxy_threats: 0,
      risk_distribution: {
        low: 0, // 0-3
        medium: 0, // 4-6
        high: 0, // 7-8
        critical: 0, // 9-10
      },
    };

    results.forEach(alarm => {
      const country = getFieldValue(alarm, 'country', 'alarms');
      const continent = getFieldValue(alarm, 'continent', 'alarms');
      const asn = getFieldValue(alarm, 'asn', 'alarms');
      const isCloud = getFieldValue(alarm, 'is_cloud_provider', 'alarms');
      const isVpn = getFieldValue(alarm, 'is_vpn', 'alarms');
      const isProxy = getFieldValue(alarm, 'is_proxy', 'alarms');
      const riskScore =
        getFieldValue(alarm, 'geographic_risk_score', 'alarms') || 0;

      if (
        country &&
        typeof country === 'string' &&
        Number(riskScore) >= getRiskThresholds().highRiskCountryMin
      ) {
        threats.high_risk_countries[country] =
          (threats.high_risk_countries[country] || 0) + 1;
      }

      if (continent && typeof continent === 'string') {
        threats.threat_by_continent[continent] =
          (threats.threat_by_continent[continent] || 0) + 1;
      }

      if (
        asn &&
        typeof asn === 'string' &&
        Number(riskScore) >= getRiskThresholds().suspiciousAsnMin
      ) {
        threats.suspicious_asns[asn] = (threats.suspicious_asns[asn] || 0) + 1;
      }

      if (isCloud) {
        threats.cloud_threats++;
      }
      if (isVpn) {
        threats.vpn_threats++;
      }
      if (isProxy) {
        threats.proxy_threats++;
      }

      // Categorize risk
      if (Number(riskScore) <= getRiskThresholds().lowMax) {
        threats.risk_distribution.low++;
      } else if (Number(riskScore) <= getRiskThresholds().mediumMax) {
        threats.risk_distribution.medium++;
      } else if (Number(riskScore) <= getRiskThresholds().highMax) {
        threats.risk_distribution.high++;
      } else {
        threats.risk_distribution.critical++;
      }
    });

    return threats;
  }

  /**
   * Group results by geographic field for client-side processing
   */
  private groupResultsByGeographicField(
    results: any[],
    groupByField: string
  ): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    results.forEach(result => {
      let groupValue = 'Unknown';

      // Extract geographic field value from result
      if (result.remote) {
        switch (groupByField) {
          case 'country':
            groupValue =
              result.remote.country || result.remote.countryName || 'Unknown';
            break;
          case 'continent':
            groupValue = result.remote.continent || 'Unknown';
            break;
          case 'region':
            groupValue =
              result.remote.region || result.remote.regionName || 'Unknown';
            break;
          case 'asn':
            groupValue =
              result.remote.asn ||
              result.remote.autonomousSystemNumber ||
              'Unknown';
            break;
          case 'provider':
            groupValue =
              result.remote.isp ||
              result.remote.provider ||
              result.remote.organization ||
              'Unknown';
            break;
        }
      }

      if (!grouped[groupValue]) {
        grouped[groupValue] = [];
      }
      grouped[groupValue].push(result);
    });

    return grouped;
  }

  /**
   * Generate detailed geographic statistics
   */
  private generateGeographicStatistics(
    searchResult: any,
    analysisType: string,
    groupBy: string,
    groupedData?: Record<string, any[]>
  ): any {
    // Use grouped data if provided, otherwise fall back to searchResult aggregations
    const distribution = groupedData
      ? Object.fromEntries(
          Object.entries(groupedData).map(([key, values]) => [
            key,
            { count: values.length },
          ])
        )
      : searchResult.aggregations || {};

    const stats = {
      summary: {
        total_records: searchResult.count || 0,
        grouped_by: groupBy,
        analysis_type: analysisType,
      },
      distribution,
      insights: [] as string[],
    };

    // Add insights based on analysis
    if (distribution && Object.keys(distribution).length > 0) {
      const entries = Object.entries(distribution);
      const totalRecords = searchResult.count || 0;

      // Find top entries
      const sortedEntries = entries.sort(
        ([, a]: any, [, b]: any) => (b.count || 0) - (a.count || 0)
      );

      if (sortedEntries.length > 0) {
        const topEntry = sortedEntries[0];
        const percentage = Math.round(
          ((topEntry[1] as any).count / totalRecords) * 100
        );
        stats.insights.push(
          `Top ${groupBy}: ${topEntry[0]} (${percentage}% of total)`
        );
      }

      if (sortedEntries.length > 1) {
        const secondEntry = sortedEntries[1];
        const percentage = Math.round(
          ((secondEntry[1] as any).count / totalRecords) * 100
        );
        stats.insights.push(
          `Second most active ${groupBy}: ${secondEntry[0]} (${percentage}% of total)`
        );
      }

      // Geographic diversity insight
      stats.insights.push(
        `Geographic diversity: ${entries.length} unique ${groupBy}s`
      );
    }

    return stats;
  }
}

/**
 * Search tools interface for type safety
 */
interface SearchTools {
  search_flows: SearchEngine['searchFlows'];
  search_alarms: SearchEngine['searchAlarms'];
  search_rules: SearchEngine['searchRules'];
  search_devices: SearchEngine['searchDevices'];
  search_target_lists: SearchEngine['searchTargetLists'];
  search_cross_reference: SearchEngine['crossReferenceSearch'];
  search_enhanced_cross_reference: SearchEngine['enhancedCrossReferenceSearch'];
  get_correlation_suggestions: SearchEngine['getCorrelationSuggestions'];
  search_alarms_by_geography: SearchEngine['searchAlarmsByGeography'];
  get_geographic_statistics: SearchEngine['getGeographicStatistics'];
}

/**
 * Creates and returns a set of advanced search functions for querying Firewalla MCP server entities.
 *
 * The returned object provides methods for searching flows, alarms, rules, devices, target lists, and performing cross-reference searches, all using the provided Firewalla client instance.
 */
export function createSearchTools(firewalla: FirewallaClient): SearchTools {
  const searchEngine = new SearchEngine(firewalla);

  return {
    search_flows: searchEngine.searchFlows.bind(searchEngine),
    search_alarms: searchEngine.searchAlarms.bind(searchEngine),
    search_rules: searchEngine.searchRules.bind(searchEngine),
    search_devices: searchEngine.searchDevices.bind(searchEngine),
    search_target_lists: searchEngine.searchTargetLists.bind(searchEngine),
    search_cross_reference:
      searchEngine.crossReferenceSearch.bind(searchEngine),
    search_enhanced_cross_reference:
      searchEngine.enhancedCrossReferenceSearch.bind(searchEngine),
    get_correlation_suggestions:
      searchEngine.getCorrelationSuggestions.bind(searchEngine),
    search_alarms_by_geography:
      searchEngine.searchAlarmsByGeography.bind(searchEngine),
    get_geographic_statistics:
      searchEngine.getGeographicStatistics.bind(searchEngine),
  };
}
