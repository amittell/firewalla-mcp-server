/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */

import { queryParser } from '../search/parser.js';
import { filterFactory } from '../search/filters/index.js';
import type { FilterContext } from '../search/filters/base.js';
import type { SearchParams, SearchResult } from '../search/types.js';
import type { RulesTextCoverage, SearchOptions } from '../types.js';
import {
  readTrace,
  type FirewallaClient,
  type RequestTrace,
} from '../firewalla/client.js';
import { translateBooleanQuery } from '../utils/simple-boolean-translator.js';
import {
  hasRelativeTimestamp,
  translateRelativeTimestamps,
} from '../utils/timestamp.js';
import { ParameterValidator, SafeAccess } from '../validation/error-handler.js';
import { EnhancedQueryValidator } from '../validation/enhanced-query-validator.js';
import { getFieldValue, type EntityType } from '../validation/field-mapper.js';
import { ErrorFormatter } from '../validation/error-formatter.js';
import { enrichObjectWithGeo } from '../utils/geographic.js';
import { targetListMatchesQuery } from '../utils/target-lists.js';
import {
  MspQueryError,
  mspAnd,
  mspTerms,
  withNotForMinus,
  type MspTerm,
} from '../utils/msp-query.js';
import { unquoteQueryValue } from '../search/client-filter.js';
import { dataKeyed } from '../utils/field-normalizer.js';
import {
  GeographicFilterError,
  geographicFiltersToMspQuery,
} from '../utils/geographic-filters.js';

/**
 * Rule fields search_rules re-checks on the client, by the names its schema
 * uses. Terms on other fields (box.id, device.id, scope, notes) are left to
 * the API. Free text is not sent to the API, which matched none; the
 * client's getNetworkRules matches it against the rules' text instead.
 */
const RULE_FIELDS: Record<string, (rule: any) => unknown> = {
  action: rule => rule.action,
  status: rule => rule.status,
  target_value: rule => rule.target?.value,
  'target.value': rule => rule.target?.value,
};

/**
 * Whether a rule satisfies one term of the translated query, or undefined
 * when the term is on a field the client does not read. A value matches
 * case-insensitively; `*` is a wildcard, and a target value without one
 * matches as a substring. An excluded value drops only a rule that has
 * exactly that value.
 */
function ruleSatisfiesTerm(rule: any, term: MspTerm): boolean | undefined {
  const read = RULE_FIELDS[term.field.toLowerCase()];
  if (!read || (term.kind !== 'exact' && term.kind !== 'wildcard')) {
    return undefined;
  }
  const actual = String(read(rule) ?? '').toLowerCase();
  const values = term.values.map(value =>
    unquoteQueryValue(value).toLowerCase()
  );
  if (term.negated) {
    return !values.includes(actual);
  }
  const isTarget =
    term.field.toLowerCase() !== 'action' &&
    term.field.toLowerCase() !== 'status';
  return values.some(value => {
    if (value.includes('*')) {
      const pattern = value
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(actual);
    }
    return isTarget ? actual.includes(value) : actual === value;
  });
}

/**
 * Risk score from which search_flows' geographic analysis counts a flow as
 * high risk (default 7; RISK_THRESHOLD_FLOW_MIN overrides it)
 */
const HIGH_RISK_FLOW_MIN = parseInt(
  process.env.RISK_THRESHOLD_FLOW_MIN || '7',
  10
);

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
  ) => Promise<{
    results: any[];
    count: number;
    next_cursor?: string;
    // Rules searched with free text: what was checked
    free_text_coverage?: RulesTextCoverage;
  }>;

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
          queryString = mspAnd(`ts:${startTs}-${endTs}`, params.query);
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
        // The API applies the query (sent in its grammar, see client.ts);
        // the rules it returns are re-checked against every term of that
        // query the client can read. This used to check only the first
        // action: and status: value, so action:block OR action:allow kept
        // block rules alone.
        const terms = mspTerms(params.query || '');
        const filteredResults = results.filter(rule =>
          terms.every(term => ruleSatisfiesTerm(rule, term) !== false)
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
        if (params.box) {
          searchOptions.box = params.box;
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

      executeApiCall: async (client, params, _apiParams, _searchOptions) => {
        // owner is the endpoint's documented filter; without it the API
        // returns global and Firewalla-managed lists
        return client.getTargetLists(undefined, undefined, params.owner);
      },
      processResults: (results, params) => {
        // The API does not search target lists: apply the query here
        const matching = params.query?.trim()
          ? results.filter(list => targetListMatchesQuery(list, params.query))
          : results;
        if (params.limit) {
          return matching.slice(0, params.limit);
        }
        return matching;
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

      // The validator and parser know NOT but not the API's `-` prefix
      // (-status:paused), which the query sent to the API keeps
      const booleanQuery = withNotForMinus(params.query);

      // Enhanced query validation with detailed error messages and comprehensive checks
      const enhancedValidation = EnhancedQueryValidator.validateQuery(
        booleanQuery,
        entityType as EntityType
      );

      if (!enhancedValidation.isValid) {
        // Try instance method for detailed position tracking if static method fails
        const enhancedValidator = new EnhancedQueryValidator();
        const detailedValidation = enhancedValidator.validateQuery(
          booleanQuery,
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
        booleanQuery;

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
        // The alarm, rule and target-list strategies filter on the client,
        // so the API's count can include records they dropped. Devices keep
        // the API's count: their strategy only pages.
        count:
          entityType === 'devices'
            ? response.count || results.length
            : results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: finalQuery,
        execution_time_ms: Date.now() - startTime,
        aggregations,
      };

      // Rules searched with free text: how many rules were checked, and
      // whether they were all the rules the other terms match
      if (entityType === 'rules' && response.free_text_coverage) {
        result.free_text_coverage = response.free_text_coverage;
      }

      // Add cursor for devices with proper typing
      if (entityType === 'devices' && response.next_cursor) {
        const resultWithCursor = result as SearchResult & {
          next_cursor?: string;
        };
        resultWithCursor.next_cursor = response.next_cursor;
      }

      return result;
    } catch (error) {
      // A query the API cannot run is reported as it is
      if (error instanceof MspQueryError) {
        throw error;
      }
      throw new Error(
        `${entityType} search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute a search query for flows using simplified implementation with direct API calls.
   * Performs basic validation and uses getFlowData API directly for improved reliability.
   * Supports time range filtering and proper limit enforcement.
   *
   * @param trace - The client's RequestTrace: counts the requests sent and
   *   the pages answered from the cache, adding to what it already holds
   */
  async searchFlows(
    params: SearchParams,
    trace: RequestTrace = { sent: 0, cached: 0 }
  ): Promise<SearchResult> {
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

      // Apply boolean and relative-time translation before building query
      // string. The client sees only the seconds, so it is told the query
      // was relative, and does not cache its pages.
      if (hasRelativeTimestamp(params.query)) {
        trace.relativeTime = true;
      }
      const translatedQuery = translateRelativeTimestamps(
        translateBooleanQuery(params.query, 'flows')
      );

      // The query, time range and geographic filters, ANDed in the API's
      // grammar: a space, with no parentheses (the API has neither AND nor
      // parentheses, and answered `ts:a-b AND (query)` with HTTP 400)
      let timeQuery: string | undefined;
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
        timeQuery = `ts:${startTs}-${endTs}`;
      }

      // Geographic filters: countries as the documented region: qualifier;
      // a filter with no documented equivalent throws GeographicFilterError
      const geographicQuery = geographicFiltersToMspQuery(
        params.geographic_filters
      );

      const queryString = mspAnd(timeQuery, translatedQuery, geographicQuery);

      // Call API directly without complex validation/parsing
      const response = await this.firewalla.getFlowData(
        queryString,
        params.group_by,
        params.sort_by || 'ts:desc',
        params.limit,
        params.cursor,
        trace
      );

      // Grouped: the API returned groups, not flows
      if (response.groups) {
        return {
          results: [],
          groups: response.groups,
          group_by: response.group_by,
          count: response.groups.length,
          limit: params.limit,
          offset: 0,
          query: queryString,
          execution_time_ms: Date.now() - startTime,
          next_cursor: response.next_cursor,
        };
      }

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
        coverage: response.coverage,
      };

      // Add boolean translation debug info if translation was applied
      if (translatedQuery !== params.query) {
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
      // Applied only when they restricted the query: filters that ask for
      // nothing ({ countries: [] }) add no term
      if (geographicQuery) {
        (result as any).geographic_filters_applied = true;
      }

      return result;
    } catch (error) {
      // A query or filter the API cannot run is reported as it is
      if (
        error instanceof MspQueryError ||
        error instanceof GeographicFilterError
      ) {
        throw error;
      }
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
      const translatedQuery = translateBooleanQuery(params.query, 'alarms');

      // The query and time range, ANDed in the API's grammar (a space, no
      // parentheses). Alarms have no severity qualifier, so none is added.
      let timeQuery: string | undefined;
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
        timeQuery = `ts:${Math.floor(startDate.getTime() / 1000)}-${Math.floor(endDate.getTime() / 1000)}`;
      }
      const alarmQuery = mspAnd(timeQuery, translatedQuery);

      // Call API directly without complex validation/parsing
      // mspAnd turned a relative time into seconds; the trace says it was
      // relative, so the alarms are not cached
      const response = await this.firewalla.getActiveAlarms(
        alarmQuery,
        params.group_by,
        params.sort_by || 'timestamp:desc',
        params.limit,
        params.cursor,
        false,
        readTrace(params.query)
      );

      // Grouped: the API returned groups, not alarms
      if (response.groups) {
        return {
          results: [],
          groups: response.groups,
          group_by: response.group_by,
          count: response.groups.length,
          limit: params.limit,
          offset: 0,
          query: params.query,
          execution_time_ms: Date.now() - startTime,
          next_cursor: response.next_cursor,
        };
      }

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
      if (translatedQuery !== params.query) {
        (result as any).boolean_translation = {
          original_query: params.query,
          translated_query: translatedQuery,
          translation_applied: true,
        };
      }

      return result;
    } catch (error) {
      // A query the API cannot run is reported as it is
      if (error instanceof MspQueryError) {
        throw error;
      }
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
          const existingPostProcessing = combinedResult.postProcessing;
          if (node.operator === 'OR') {
            // An item passes if either branch keeps it. A branch without
            // post-processing does not narrow here, so neither does the OR.
            combinedResult.postProcessing =
              existingPostProcessing && rightResult.postProcessing
                ? (items: any[]): any[] => {
                    const left = new Set(existingPostProcessing(items));
                    const right = new Set(rightResult.postProcessing!(items));
                    return items.filter(
                      item => left.has(item) || right.has(item)
                    );
                  }
                : undefined;
          } else if (rightResult.postProcessing) {
            if (existingPostProcessing && node.operator === 'AND') {
              combinedResult.postProcessing = (items: any[]): any[] =>
                rightResult.postProcessing!(existingPostProcessing(items));
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

    // Keyed by the groups' values, which are not field names to rename
    const aggregations: any = dataKeyed({});

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
      if (riskScore && Number(riskScore) >= HIGH_RISK_FLOW_MIN) {
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
}

/**
 * Creates and returns a set of advanced search functions for querying Firewalla MCP server entities.
 *
 * The returned object provides methods for searching flows, alarms, rules, devices and target lists, all using the provided Firewalla client instance.
 */
export function createSearchTools(firewalla: FirewallaClient): SearchTools {
  const searchEngine = new SearchEngine(firewalla);

  return {
    search_flows: searchEngine.searchFlows.bind(searchEngine),
    search_alarms: searchEngine.searchAlarms.bind(searchEngine),
    search_rules: searchEngine.searchRules.bind(searchEngine),
    search_devices: searchEngine.searchDevices.bind(searchEngine),
    search_target_lists: searchEngine.searchTargetLists.bind(searchEngine),
  };
}
