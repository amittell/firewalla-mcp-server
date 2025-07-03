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
import { ParameterValidator, SafeAccess } from '../validation/error-handler.js';
import { EnhancedQueryValidator } from '../validation/enhanced-query-validator.js';
import {
  validateCrossReference,
  validateEnhancedCrossReference,
  suggestEntityType,
  extractCorrelationValues,
  filterByCorrelation,
  performMultiFieldCorrelation,
  performEnhancedMultiFieldCorrelation,
  getSupportedCorrelationCombinations,
  getFieldValue,
  FIELD_MAPPINGS,
  type EntityType,
  type CorrelationFieldName,
  type EnhancedCorrelationParams,
  type ScoringCorrelationParams,
} from '../validation/field-mapper.js';
import { FieldValidator } from '../validation/field-validator.js';
import { ErrorFormatter } from '../validation/error-formatter.js';

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
        return client.getActiveAlarms(
          apiParams.queryString || params.query || undefined,
          undefined,
          'timestamp:desc',
          params.limit
        );
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
        return client.getNetworkRules(undefined, searchLimit);
      },
      processResults: (results, params) => {
        if (params.limit) {
          return results.slice(0, params.limit);
        }
        return results;
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
      const maxLimit = config.maxLimit || (entityType === 'flows' ? 1000 : 500);
      const limitValidation = ParameterValidator.validateNumber(
        params?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: maxLimit,
          integer: true,
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
      // Basic parameter validation with security checks
      if (
        !params.query ||
        typeof params.query !== 'string' ||
        !params.query.trim()
      ) {
        throw new Error(
          'query parameter is required and must be a non-empty string'
        );
      }

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

      // Build query string with time range if provided
      let queryString = params.query;
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
        queryString = `ts:${startTs}-${endTs} AND (${params.query})`;
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
      if (params.offset && !params.cursor) {
        results = results.slice(params.offset);
      }

      // Apply client-side limit enforcement to ensure exact limit compliance
      if (results.length > params.limit) {
        results = results.slice(0, params.limit);
      }

      return {
        results,
        count: results.length,
        limit: params.limit,
        offset: params.offset || 0,
        query: queryString,
        execution_time_ms: Date.now() - startTime,
        next_cursor: response.next_cursor,
      };
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
      // Basic parameter validation with security checks
      if (
        !params.query ||
        typeof params.query !== 'string' ||
        !params.query.trim()
      ) {
        throw new Error(
          'query parameter is required and must be a non-empty string'
        );
      }

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

      // Call API directly without complex validation/parsing
      const response = await this.firewalla.getActiveAlarms(
        params.query,
        params.group_by,
        params.sort_by || 'timestamp:desc',
        params.limit,
        params.cursor
      );

      // Apply client-side offset if needed (for backward compatibility)
      let results = response.results || [];
      if (params.offset && !params.cursor) {
        results = results.slice(params.offset);
      }

      // Apply client-side limit enforcement to ensure exact limit compliance
      if (results.length > params.limit) {
        results = results.slice(0, params.limit);
      }

      return {
        results,
        count: results.length,
        limit: params.limit,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        next_cursor: response.next_cursor,
      };
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
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(
        limit,
        'limit',
        {
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

      // Determine entity types based on query patterns
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(
        q => suggestEntityType(q) || 'alarms'
      );

      // Execute primary query
      const primaryResult = await this.executeSearchByType(
        primaryType,
        params.primary_query,
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
        const secondaryQuery = params.secondary_queries[index];
        const secondaryType = secondaryTypes[index];

        // Execute secondary query
        const secondaryResult = await this.executeSearchByType(
          secondaryType,
          secondaryQuery,
          limit
        );

        // Perform multi-field correlation
        const correlationResult = performMultiFieldCorrelation(
          primaryResult.results,
          secondaryResult.results,
          primaryType,
          secondaryType,
          params.correlation_params
        );

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: correlationResult.correlatedResults,
          count: correlationResult.correlatedResults.length,
          correlation_stats: correlationResult.correlationStats,
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
   * Enhanced cross-reference search with scoring and fuzzy matching capabilities
   */
  async enhancedScoredCrossReferenceSearch(params: {
    primary_query: string;
    secondary_queries: string[];
    correlation_params: ScoringCorrelationParams;
    limit?: number;
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(
        limit,
        'limit',
        {
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

      // Validate enhanced correlation parameters
      const validation = validateEnhancedCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_params
      );

      if (!validation.isValid) {
        throw new Error(
          `Enhanced correlation validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Execute primary query
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const primaryResult = await this.executeSearchByType(
        primaryType,
        params.primary_query,
        limit
      );

      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType,
        },
        correlations: [],
      };

      // Execute secondary queries and perform enhanced correlation
      for (let i = 0; i < params.secondary_queries.length; i++) {
        const secondaryQuery = params.secondary_queries[i];
        const secondaryType = suggestEntityType(secondaryQuery) || 'alarms';

        // Execute secondary query
        const secondaryResult = await this.executeSearchByType(
          secondaryType,
          secondaryQuery,
          limit
        );

        // Perform enhanced multi-field correlation with scoring
        const enhancedResult = performEnhancedMultiFieldCorrelation(
          primaryResult.results,
          secondaryResult.results,
          primaryType,
          secondaryType,
          params.correlation_params
        );

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: enhancedResult.correlatedResults,
          count: enhancedResult.correlatedResults.length,
          correlation_stats: enhancedResult.correlationStats,
          enhanced_stats: enhancedResult.enhancedStats,
          scored_results: enhancedResult.scoredResults,
          entity_type: secondaryType,
          scoring_enabled: params.correlation_params.enableScoring,
          fuzzy_matching_enabled: params.correlation_params.enableFuzzyMatching,
        });
      }

      // Calculate enhanced correlation summary
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

      // Calculate enhanced metrics
      const enhancedMetrics = correlatedResults.correlations
        .filter((c: any) => c.enhanced_stats)
        .map((c: any) => c.enhanced_stats);

      const avgScore =
        enhancedMetrics.length > 0
          ? enhancedMetrics.reduce(
              (sum: number, stats: any) => sum + stats.averageScore,
              0
            ) / enhancedMetrics.length
          : 0;

      const scoreDistribution =
        enhancedMetrics.length > 0
          ? enhancedMetrics.reduce(
              (acc: any, stats: any) => ({
                high: acc.high + stats.scoreDistribution.high,
                medium: acc.medium + stats.scoreDistribution.medium,
                low: acc.low + stats.scoreDistribution.low,
              }),
              { high: 0, medium: 0, low: 0 }
            )
          : { high: 0, medium: 0, low: 0 };

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
          // Enhanced scoring metrics
          scoring_enabled: params.correlation_params.enableScoring,
          fuzzy_matching_enabled: params.correlation_params.enableFuzzyMatching,
          average_correlation_score: Math.round(avgScore * 1000) / 1000,
          score_distribution: scoreDistribution,
          minimum_score_threshold:
            params.correlation_params.minimumScore || 0.3,
        },
      };
    } catch (error) {
      throw new Error(
        `Enhanced scored cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(
        limit,
        'limit',
        {
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

      // Validate cross-reference parameters
      const validation = validateCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_field
      );

      if (!validation.isValid) {
        throw new Error(
          `Cross-reference validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Determine entity types based on query patterns
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(
        q => suggestEntityType(q) || 'alarms'
      );

      // Execute primary query using generic method
      const primaryResult = await this.executeSearchByType(
        primaryType,
        params.primary_query,
        limit
      );

      // Extract correlation values using proper field mapping
      const correlationValues = extractCorrelationValues(
        primaryResult.results,
        params.correlation_field,
        primaryType
      );

      // Execute secondary queries and correlate
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
        const secondaryQuery = params.secondary_queries[index];
        const secondaryType = secondaryTypes[index];

        // Execute secondary query using generic method
        const secondaryResult = await this.executeSearchByType(
          secondaryType,
          secondaryQuery,
          limit
        );

        // Filter by correlation using improved field mapping
        const correlatedItems = filterByCorrelation(
          secondaryResult.results,
          params.correlation_field,
          secondaryType,
          correlationValues
        );

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

      if (
        !Array.isArray(params.secondary_queries) ||
        params.secondary_queries.length === 0
      ) {
        throw new Error('At least one secondary query is required');
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
   * Advanced geographic search for flows with location-based filtering and analysis.
   * Supports multiple values for each geographic filter (countries, continents, regions, etc.)
   * using OR logic. Enhanced from previous single-value limitation.
   */
  async searchFlowsByGeography(params: {
    query?: string;
    geographic_filters?: {
      countries?: string[];
      continents?: string[];
      regions?: string[];
      cities?: string[];
      asns?: string[];
      hosting_providers?: string[];
      exclude_cloud?: boolean;
      exclude_vpn?: boolean;
      min_risk_score?: number;
    };
    limit: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    aggregate?: boolean;
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
          max: 1000,
          integer: true,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      // Build geographic query - simplified approach to avoid parsing issues
      let geographicQuery = params.query || '';

      if (params.geographic_filters) {
        const geoConditions: string[] = [];

        // Handle countries - support multiple countries with OR logic
        if (params.geographic_filters.countries?.length) {
          if (params.geographic_filters.countries.length === 1) {
            geoConditions.push(
              `country:${params.geographic_filters.countries[0]}`
            );
          } else {
            const countryQueries = params.geographic_filters.countries.map(
              country => `country:${country}`
            );
            geoConditions.push(`(${countryQueries.join(' OR ')})`);
          }
        }

        // Handle continents - support multiple continents with OR logic
        if (params.geographic_filters.continents?.length) {
          if (params.geographic_filters.continents.length === 1) {
            const continent = params.geographic_filters.continents[0];
            geoConditions.push(
              `continent:${continent.includes(' ') ? `"${continent}"` : continent}`
            );
          } else {
            const continentQueries = params.geographic_filters.continents.map(
              continent =>
                `continent:${continent.includes(' ') ? `"${continent}"` : continent}`
            );
            geoConditions.push(`(${continentQueries.join(' OR ')})`);
          }
        }

        // Handle regions - support multiple regions with OR logic
        if (params.geographic_filters.regions?.length) {
          if (params.geographic_filters.regions.length === 1) {
            geoConditions.push(
              `region:${params.geographic_filters.regions[0]}`
            );
          } else {
            const regionQueries = params.geographic_filters.regions.map(
              region => `region:${region}`
            );
            geoConditions.push(`(${regionQueries.join(' OR ')})`);
          }
        }

        // Handle cities - support multiple cities with OR logic
        if (params.geographic_filters.cities?.length) {
          if (params.geographic_filters.cities.length === 1) {
            geoConditions.push(`city:${params.geographic_filters.cities[0]}`);
          } else {
            const cityQueries = params.geographic_filters.cities.map(
              city => `city:${city}`
            );
            geoConditions.push(`(${cityQueries.join(' OR ')})`);
          }
        }

        // Handle ASNs - support multiple ASNs with OR logic
        if (params.geographic_filters.asns?.length) {
          if (params.geographic_filters.asns.length === 1) {
            geoConditions.push(`asn:${params.geographic_filters.asns[0]}`);
          } else {
            const asnQueries = params.geographic_filters.asns.map(
              asn => `asn:${asn}`
            );
            geoConditions.push(`(${asnQueries.join(' OR ')})`);
          }
        }

        // Handle hosting providers - support multiple providers with OR logic
        if (params.geographic_filters.hosting_providers?.length) {
          if (params.geographic_filters.hosting_providers.length === 1) {
            geoConditions.push(
              `hosting_provider:${params.geographic_filters.hosting_providers[0]}`
            );
          } else {
            const providerQueries =
              params.geographic_filters.hosting_providers.map(
                provider => `hosting_provider:${provider}`
              );
            geoConditions.push(`(${providerQueries.join(' OR ')})`);
          }
        }

        if (params.geographic_filters.exclude_cloud) {
          geoConditions.push('NOT is_cloud_provider:true');
        }

        if (params.geographic_filters.exclude_vpn) {
          geoConditions.push('NOT is_vpn:true');
        }

        if (params.geographic_filters.min_risk_score !== undefined) {
          geoConditions.push(
            `geographic_risk_score:>=${params.geographic_filters.min_risk_score}`
          );
        }

        if (geoConditions.length > 0) {
          const geoQueryString = geoConditions.join(' AND ');
          geographicQuery =
            !geographicQuery || geographicQuery.trim() === ''
              ? geoQueryString
              : `${geographicQuery} AND ${geoQueryString}`;
        }
      }

      // Execute search with geographic query
      const searchParams = {
        query: geographicQuery || '*',
        limit: params.limit,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
        group_by: params.group_by,
        aggregate: params.aggregate,
      };

      const result = await this.searchFlows(searchParams);

      // Add geographic analysis
      const geographicAnalysis = this.analyzeGeographicData(result.results);

      return {
        ...result,
        geographic_analysis: geographicAnalysis,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Geographic flows search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced geographic search for alarms with location-based threat analysis
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

      // Build geographic threat query - simplified approach
      let geographicQuery = params.query || '';

      if (params.geographic_filters) {
        const geoConditions: string[] = [];

        // Handle countries - take first one to avoid OR parsing issues
        if (params.geographic_filters.countries?.length) {
          const firstCountry = params.geographic_filters.countries[0];
          geoConditions.push(`country:${firstCountry}`);
        }

        // Handle continents - take first one
        if (params.geographic_filters.continents?.length) {
          const firstContinent = params.geographic_filters.continents[0];
          geoConditions.push(
            `continent:${firstContinent.includes(' ') ? `"${firstContinent}"` : firstContinent}`
          );
        }

        // Handle regions - take first one
        if (params.geographic_filters.regions?.length) {
          const firstRegion = params.geographic_filters.regions[0];
          geoConditions.push(`region:${firstRegion}`);
        }

        if (params.geographic_filters.high_risk_countries) {
          // Add query for countries with higher security risk
          geoConditions.push('geographic_risk_score:>=7');
        }

        if (params.geographic_filters.exclude_known_providers) {
          geoConditions.push('NOT is_cloud_provider:true');
          geoConditions.push('NOT hosting_provider:*');
        }

        if (geoConditions.length > 0) {
          const geoQueryString = geoConditions.join(' AND ');
          geographicQuery =
            !geographicQuery || geographicQuery.trim() === ''
              ? geoQueryString
              : `${geographicQuery} AND ${geoQueryString}`;
        }
      }

      // Execute alarm search
      const searchParams = {
        query: geographicQuery || '*',
        limit: params.limit,
        sort_by: params.sort_by,
        group_by: params.group_by,
      };

      const result = await this.searchAlarms(searchParams);

      // Add geographic threat analysis if requested
      let threatAnalysis;
      if (params.geographic_filters?.threat_analysis) {
        threatAnalysis = this.analyzeGeographicThreats(result.results);
      }

      return {
        ...result,
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
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(
        limit,
        'limit',
        {
          min: 1,
          max: 1000,
          integer: true,
        }
      );

      if (!limitValidation.isValid) {
        throw new Error(
          `Parameter validation failed: ${limitValidation.errors.join(', ')}`
        );
      }

      // Build base query for geographic analysis
      let baseQuery = '*';

      // Add time range if specified
      if (params.time_range) {
        const startTs = Math.floor(
          new Date(params.time_range.start).getTime() / 1000
        );
        const endTs = Math.floor(
          new Date(params.time_range.end).getTime() / 1000
        );
        baseQuery = `timestamp:[${startTs} TO ${endTs}]`;
      }

      // Execute search based on entity type
      const searchParams = {
        query: baseQuery,
        limit,
        group_by: params.group_by || 'country',
        aggregate: true,
      };

      let searchResult;
      if (params.entity_type === 'flows') {
        searchResult = await this.searchFlows(searchParams);
      } else {
        searchResult = await this.searchAlarms(searchParams);
      }

      // Generate geographic statistics
      const statistics = this.generateGeographicStatistics(
        searchResult,
        params.analysis_type || 'summary',
        params.group_by || 'country'
      );

      return {
        entity_type: params.entity_type,
        time_range: params.time_range,
        analysis_type: params.analysis_type || 'summary',
        group_by: params.group_by || 'country',
        statistics,
        total_records: searchResult.count,
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
   * Generate detailed geographic statistics
   */
  private generateGeographicStatistics(
    searchResult: any,
    analysisType: string,
    groupBy: string
  ): any {
    const stats = {
      summary: {
        total_records: searchResult.count || 0,
        grouped_by: groupBy,
        analysis_type: analysisType,
      },
      distribution: searchResult.aggregations || {},
      insights: [] as string[],
    };

    // Add insights based on analysis
    if (searchResult.aggregations) {
      const entries = Object.entries(searchResult.aggregations);
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
  search_enhanced_scored_cross_reference: SearchEngine['enhancedScoredCrossReferenceSearch'];
  get_correlation_suggestions: SearchEngine['getCorrelationSuggestions'];
  search_flows_by_geography: SearchEngine['searchFlowsByGeography'];
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
    search_enhanced_scored_cross_reference:
      searchEngine.enhancedScoredCrossReferenceSearch.bind(searchEngine),
    get_correlation_suggestions:
      searchEngine.getCorrelationSuggestions.bind(searchEngine),
    search_flows_by_geography:
      searchEngine.searchFlowsByGeography.bind(searchEngine),
    search_alarms_by_geography:
      searchEngine.searchAlarmsByGeography.bind(searchEngine),
    get_geographic_statistics:
      searchEngine.getGeographicStatistics.bind(searchEngine),
  };
}
