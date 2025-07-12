/**
 * Advanced search tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import type {
  Flow,
  Alarm,
  Device,
  NetworkRule,
  TargetList,
  SearchMetadata,
} from '../../types.js';
import {
  SafeAccess,
  QuerySanitizer,
  ParameterValidator,
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  withToolTimeout,
  TimeoutError,
  createTimeoutErrorResponse,
} from '../../utils/timeout-manager.js';
import {
  withRetryAndTimeout,
  isRetryableError,
} from '../../utils/retry-manager.js';
import { createSearchTools } from '../search.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';
import { SEARCH_FIELDS, type SearchParams } from '../../search/types.js';
import type { ScoringCorrelationParams } from '../../validation/field-mapper.js';
import {
  ResponseStandardizer,
  BackwardCompatibilityLayer,
} from '../../utils/response-standardizer.js';
import { shouldUseLegacyFormat } from '../../config/response-config.js';
import { validateCountryCodes } from '../../utils/geographic.js';

// Base search interface to reduce duplication
export interface BaseSearchArgs extends ToolArgs {
  query: string;
  limit: number;
  offset?: number;
  cursor?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  group_by?: string;
  aggregate?: boolean;
  force_refresh?: boolean;
}

// Search argument interfaces for type safety
export interface SearchFlowsArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
  geographic_filters?: {
    countries?: string[];
    continents?: string[];
    regions?: string[];
    cities?: string[];
    asns?: string[];
    hosting_providers?: string[];
    exclude_vpn?: boolean;
    exclude_cloud?: boolean;
    min_risk_score?: number;
  };
  include_analytics?: boolean;
}

export interface SearchAlarmsArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };

  /**
   * Filter alarms by severity level.
   * Allowed values: low | medium | high | critical
   */
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SearchRulesArgs extends BaseSearchArgs {}

export interface SearchDevicesArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
}

export interface SearchTargetListsArgs extends BaseSearchArgs {}

export interface SearchCrossReferenceArgs extends ToolArgs {
  primary_query: string;
  secondary_queries: string[];
  correlation_field: string;
  limit?: number;
}

export interface SearchEnhancedCrossReferenceArgs extends ToolArgs {
  primary_query: string;
  secondary_queries: string[];
  correlation_params: ScoringCorrelationParams;
  limit?: number;
}

export interface GetCorrelationSuggestionsArgs extends ToolArgs {
  primary_query: string;
  secondary_queries: string[];
}

export interface SearchAlarmsByGeographyArgs extends ToolArgs {
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
}

export interface GetGeographicStatisticsArgs extends ToolArgs {
  entity_type: 'flows' | 'alarms';
  time_range?: {
    start: string;
    end: string;
  };
  analysis_type?: 'summary' | 'detailed' | 'threat_intelligence';
  group_by?: 'country' | 'continent' | 'region' | 'asn' | 'provider';
  limit?: number;
}

/**
 * Common search parameter validation helper
 */
type CommonSearchValidationResult =
  | {
      isValid: false;
      response: ToolResponse;
    }
  | {
      isValid: true;
      limit: number;
      query: string;
      cursor?: string;
      groupBy?: string;
    };

function validateCommonSearchParameters(
  args: BaseSearchArgs,
  toolName: string,
  entityType: 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists'
): CommonSearchValidationResult {
  // Validate required limit parameter
  const limitValidation = ParameterValidator.validateNumber(
    args.limit,
    'limit',
    { required: true, ...getLimitValidationConfig(toolName) }
  );

  if (!limitValidation.isValid) {
    return {
      isValid: false,
      response: createErrorResponse(
        toolName,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        limitValidation.errors
      ),
    };
  }

  // Validate required query parameter
  const queryValidation = ParameterValidator.validateRequiredString(
    args.query,
    'query'
  );

  if (!queryValidation.isValid) {
    return {
      isValid: false,
      response: createErrorResponse(
        toolName,
        'Query parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        queryValidation.errors
      ),
    };
  }

  // Validate field names in the query
  const fieldValidation = QuerySanitizer.validateQueryFields(
    args.query,
    entityType
  );

  if (!fieldValidation.isValid) {
    return {
      isValid: false,
      response: createErrorResponse(
        toolName,
        'Query contains invalid field names',
        ErrorType.VALIDATION_ERROR,
        {
          query: args.query,
          documentation:
            entityType === 'alarms'
              ? 'See /docs/error-handling-guide.md for troubleshooting'
              : 'See /docs/query-syntax-guide.md for valid field names',
        },
        fieldValidation.errors
      ),
    };
  }

  // Validate cursor format if provided
  if (args.cursor !== undefined) {
    const cursorValidation = ParameterValidator.validateCursor(
      args.cursor,
      'cursor'
    );
    if (!cursorValidation.isValid) {
      return {
        isValid: false,
        response: createErrorResponse(
          toolName,
          'Invalid cursor format',
          ErrorType.VALIDATION_ERROR,
          undefined,
          cursorValidation.errors
        ),
      };
    }
  }

  // Validate group_by parameter if provided
  if (args.group_by !== undefined) {
    const groupByValidation = ParameterValidator.validateEnum(
      args.group_by,
      'group_by',
      SEARCH_FIELDS[entityType],
      false
    );

    if (!groupByValidation.isValid) {
      return {
        isValid: false,
        response: createErrorResponse(
          toolName,
          'Invalid group_by field',
          ErrorType.VALIDATION_ERROR,
          {
            group_by: args.group_by,
            valid_fields: SEARCH_FIELDS[entityType],
            documentation: 'See /docs/query-syntax-guide.md for valid fields',
          },
          groupByValidation.errors
        ),
      };
    }
  }

  return {
    isValid: true,
    limit: args.limit,
    query: args.query,
    cursor: args.cursor,
    groupBy: args.group_by,
  };
}

export class SearchFlowsHandler extends BaseToolHandler {
  name = 'search_flows';
  description = `Advanced network flow searching with powerful query syntax and enhanced reliability. Requires query and limit parameters. Data cached for 15 seconds, use force_refresh=true for real-time network analysis.
  
Search through network traffic flows using complex queries with logical operators, wildcards, and field-specific filters.

REQUIRED PARAMETERS:
- query: Search query string using flow field syntax
- limit: Maximum number of results to return (1-10000)

OPTIONAL PARAMETERS:
- force_refresh: Bypass cache for real-time data (default: false)
- cursor: Pagination cursor from previous response
- time_range: Time window for search (start/end timestamps)
- sort_by: Field to sort results by
- group_by: Field to group results by for aggregation
- aggregate: Enable aggregation statistics

QUERY EXAMPLES:
- Basic field queries: "protocol:tcp", "blocked:true", "source_ip:192.168.1.100"
- Logical operators: "protocol:tcp AND blocked:false", "severity:high OR severity:critical"
- Wildcards: "source_ip:192.168.*", "destination_domain:*.facebook.com"
- Ranges: "bytes:[1000 TO 50000]", "timestamp:>=2024-01-01"
- Complex queries: "(protocol:tcp OR protocol:udp) AND source_ip:192.168.* NOT blocked:true"

CACHE CONTROL:
- Default: 15-second cache for optimal performance
- Real-time: Use force_refresh=true for live network monitoring
- Cache info included in responses for timing awareness

PERFORMANCE TIPS:
- Use specific time ranges for better performance: {"time_range": {"start": "2024-01-01T00:00:00Z", "end": "2024-01-02T00:00:00Z"}}
- Limit results with reasonable values (100-1000) for faster responses
- Use cursor for pagination with large datasets
- Group by fields like "source_ip" or "protocol" for aggregated insights

See the Query Syntax Guide for complete documentation: /docs/query-syntax-guide.md`;
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchFlowsArgs;
    const startTime = Date.now();

    try {
      // Validate common search parameters
      const validation = validateCommonSearchParameters(
        searchArgs,
        this.name,
        'flows'
      );

      if (!validation.isValid) {
        return validation.response;
      }

      // Validate force_refresh parameter if provided
      const forceRefreshValidation = ParameterValidator.validateBoolean(
        searchArgs.force_refresh,
        'force_refresh',
        false
      );

      if (!forceRefreshValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Force refresh parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          forceRefreshValidation.errors
        );
      }

      // ------------------------------------------------------------
      // WAVE-1: Severity handling
      // ------------------------------------------------------------
      let finalQuery = searchArgs.query;

      if (searchArgs.severity !== undefined) {
        // Validate severity enum value
        const severityValidation = ParameterValidator.validateEnum(
          searchArgs.severity,
          'severity',
          ['low', 'medium', 'high', 'critical'],
          true
        );

        if (!severityValidation.isValid) {
          return createErrorResponse(
            this.name,
            'Invalid severity parameter',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: searchArgs.severity,
              valid_values: ['low', 'medium', 'high', 'critical'],
            },
            severityValidation.errors
          );
        }

        // Append severity filter to the existing query (if any)
        finalQuery = finalQuery
          ? `${finalQuery} AND severity:${searchArgs.severity}`
          : `severity:${searchArgs.severity}`;
      }

      // ------------------------------------------------------------
      // Validate geographic_filters if provided
      // ------------------------------------------------------------
      if (searchArgs.geographic_filters !== undefined) {
        // Validate it's an object
        if (
          typeof searchArgs.geographic_filters !== 'object' ||
          searchArgs.geographic_filters === null
        ) {
          return createErrorResponse(
            this.name,
            'Invalid geographic_filters parameter',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: searchArgs.geographic_filters,
              expected:
                'object with optional fields: countries, continents, regions, cities, etc.',
            }
          );
        }

        // Validate country codes if provided
        if (
          searchArgs.geographic_filters.countries &&
          searchArgs.geographic_filters.countries.length > 0
        ) {
          const countryValidation = validateCountryCodes(
            searchArgs.geographic_filters.countries
          );
          if (!countryValidation.valid) {
            return createErrorResponse(
              this.name,
              `Country code validation failed: Invalid country codes: ${countryValidation.invalid.join(', ')}`,
              ErrorType.VALIDATION_ERROR,
              {
                invalid_codes: countryValidation.invalid,
                valid_codes: countryValidation.valid,
                documentation:
                  'Country codes must be ISO 3166-1 alpha-2 format (e.g., US, CN, GB)',
              }
            );
          }
        }
      }

      // ------------------------------------------------------------
      // Validate include_analytics parameter if provided
      // ------------------------------------------------------------
      const includeAnalyticsValidation = ParameterValidator.validateBoolean(
        searchArgs.include_analytics,
        'include_analytics',
        false
      );

      if (!includeAnalyticsValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Include analytics parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          includeAnalyticsValidation.errors
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: finalQuery,
        limit: searchArgs.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
        geographic_filters: searchArgs.geographic_filters,
        include_analytics: includeAnalyticsValidation.sanitizedValue as boolean,
      };

      // Use retry logic for search operations as they can be prone to timeouts
      const result = await withRetryAndTimeout(
        async () => searchTools.search_flows(searchParams),
        this.name,
        {
          maxAttempts: 2, // Conservative retry for search operations
          initialDelayMs: 2000, // Wait 2 seconds before retry
          shouldRetry: (error, attempt) => {
            // Retry on timeouts and network errors, but not on validation errors
            if (error instanceof TimeoutError) {
              return true;
            }
            return isRetryableError(error) && attempt === 1; // Only retry once for search
          },
        }
      );
      const executionTime = Date.now() - startTime;

      // Process flow data
      const processedFlows = SafeAccess.safeArrayMap(
        (result as any).results,
        (flow: Flow) => ({
          timestamp: unixToISOStringOrNow(flow.ts),
          source_ip: SafeAccess.getNestedValue(
            flow as any,
            'source.ip',
            'unknown'
          ),
          source_country: SafeAccess.getNestedValue(
            flow as any,
            'source.geo.country',
            'unknown'
          ),
          source_city: SafeAccess.getNestedValue(
            flow as any,
            'source.geo.city',
            'unknown'
          ),
          source_continent: SafeAccess.getNestedValue(
            flow as any,
            'source.geo.continent',
            'unknown'
          ),
          destination_ip: SafeAccess.getNestedValue(
            flow as any,
            'destination.ip',
            'unknown'
          ),
          destination_country: SafeAccess.getNestedValue(
            flow as any,
            'destination.geo.country',
            'unknown'
          ),
          destination_city: SafeAccess.getNestedValue(
            flow as any,
            'destination.geo.city',
            'unknown'
          ),
          destination_continent: SafeAccess.getNestedValue(
            flow as any,
            'destination.geo.continent',
            'unknown'
          ),
          protocol: SafeAccess.getNestedValue(
            flow as any,
            'protocol',
            'unknown'
          ),
          // bytes field is calculated as total traffic: download + upload
          bytes:
            (SafeAccess.getNestedValue(flow as any, 'download', 0) as number) +
            (SafeAccess.getNestedValue(flow as any, 'upload', 0) as number),
          blocked: SafeAccess.getNestedValue(flow as any, 'block', false),
          direction: SafeAccess.getNestedValue(
            flow as any,
            'direction',
            'unknown'
          ),
          device: SafeAccess.getNestedValue(flow as any, 'device', {}),
        })
      );

      // Create metadata for standardized response
      const metadata: SearchMetadata = {
        query: SafeAccess.getNestedValue(
          result as any,
          'query',
          searchArgs.query || ''
        ) as string,
        entityType: 'flows',
        executionTime: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          executionTime
        ) as number,
        cached: false, // TODO: Detect from result if available
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ) as Record<string, any> | undefined,
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(
        processedFlows,
        metadata
      );

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(
          standardResponse,
          this.name
        );
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout from timeout-manager
        );
      }

      // Handle retry failure errors with enhanced context
      if (error instanceof Error && error.name === 'RetryFailureError') {
        const { retryContext } = error as any;
        const { userGuidance } = error as any;

        return createErrorResponse(
          this.name,
          `Search flows operation failed after ${retryContext?.attempts || 'multiple'} attempts: ${error.message}`,
          ErrorType.SEARCH_ERROR,
          {
            retry_attempts: retryContext?.attempts,
            total_duration_ms: retryContext?.totalDurationMs,
            final_error:
              retryContext?.originalError instanceof Error
                ? retryContext.originalError.message
                : 'Unknown error',
          },
          userGuidance || [
            'Multiple retry attempts failed',
            'Try reducing the scope of your search query',
            'Check network connectivity and try again later',
          ]
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to search flows: ${errorMessage}`,
        ErrorType.SEARCH_ERROR
      );
    }
  }
}

export class SearchAlarmsHandler extends BaseToolHandler {
  name = 'search_alarms';
  description = `Security alarm searching with powerful filtering and enhanced reliability. Requires query and limit parameters. Data cached for 15 seconds, use force_refresh=true for real-time security data.

Search through security alerts and alarms using flexible query syntax to identify threats and suspicious activities.

REQUIRED PARAMETERS:
- query: Search query string using alarm field syntax
- limit: Maximum number of results to return (1-10000)

OPTIONAL PARAMETERS:
- force_refresh: Bypass cache for real-time data (default: false)
- cursor: Pagination cursor from previous response
- sort_by: Field to sort results by
- aggregate: Enable aggregation statistics

QUERY EXAMPLES:
- Severity filtering: "severity:high", "severity:>=medium", "severity:critical"
- IP-based searches: "source_ip:192.168.1.100", "destination_ip:10.0.*"
- Type filtering: "type:intrusion_detection", "type:malware", "type:dns_anomaly"
- Status queries: "resolved:false", "acknowledged:true"
- Time-based: "timestamp:>=2024-01-01", "last_24_hours:true"
- Complex combinations: "severity:high AND source_ip:192.168.* NOT resolved:true"

CACHE CONTROL:
- Default: 15-second cache for optimal performance
- Real-time: Use force_refresh=true for incident response
- Cache info included in responses for timing awareness

COMMON USE CASES:
- Active threats: "severity:>=high AND resolved:false"
- Geographic threats: "country:China AND severity:medium"
- Malware detection: "type:malware OR type:trojan OR type:virus"
- Network intrusions: "type:intrusion AND source_ip:external"

ERROR RECOVERY:
- If no results, try broader time ranges or lower severity filters
- Check field names against the API documentation
- Use wildcards (*) for partial matches when exact queries fail

See the Error Handling Guide for troubleshooting: /docs/error-handling-guide.md`;
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchAlarmsArgs;
    const startTime = Date.now();

    try {
      // Validate common search parameters
      const validation = validateCommonSearchParameters(
        searchArgs,
        this.name,
        'alarms'
      );

      if (!validation.isValid) {
        return validation.response;
      }

      // Validate force_refresh parameter if provided
      const forceRefreshValidation = ParameterValidator.validateBoolean(
        searchArgs.force_refresh,
        'force_refresh',
        false
      );

      if (!forceRefreshValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Force refresh parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          forceRefreshValidation.errors
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: searchArgs.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_alarms(searchParams),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Process alarm data
      const processedAlarms = SafeAccess.safeArrayMap(
        (result as any).results,
        (alarm: Alarm) => ({
          timestamp: unixToISOStringOrNow(alarm.ts),
          type: SafeAccess.getNestedValue(alarm as any, 'type', 'unknown'),
          message: SafeAccess.getNestedValue(
            alarm as any,
            'message',
            'No message'
          ),
          direction: SafeAccess.getNestedValue(
            alarm as any,
            'direction',
            'unknown'
          ),
          protocol: SafeAccess.getNestedValue(
            alarm as any,
            'protocol',
            'unknown'
          ),
          status: SafeAccess.getNestedValue(alarm as any, 'status', 'unknown'),
          severity: SafeAccess.getNestedValue(
            alarm as any,
            'severity',
            'unknown'
          ),
        })
      );

      // Create metadata for standardized response
      const metadata: SearchMetadata = {
        query: SafeAccess.getNestedValue(
          result as any,
          'query',
          searchArgs.query || ''
        ) as string,
        entityType: 'alarms',
        executionTime: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          executionTime
        ) as number,
        cached: false,
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ) as Record<string, any> | undefined,
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(
        processedAlarms,
        metadata
      );

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(
          standardResponse,
          this.name
        );
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to search alarms: ${errorMessage}`,
        ErrorType.SEARCH_ERROR
      );
    }
  }
}

export class SearchRulesHandler extends BaseToolHandler {
  name = 'search_rules';
  description = `Firewall rule searching with comprehensive filtering for actions, targets, and status.

Search through firewall rules to manage policies, troubleshoot blocking issues, and analyze rule effectiveness.

QUERY EXAMPLES:
- Action filtering: "action:block", "action:allow", "action:timelimit"
- Target searches: "target_value:*.facebook.com", "target_type:domain", "target_value:192.168.*"
- Status queries: "enabled:true", "paused:false", "active:true"
- Direction: "direction:inbound", "direction:outbound", "direction:bidirection"
- Combined filters: "action:block AND target_value:*.social.* AND enabled:true"

RULE MANAGEMENT EXAMPLES:
- Social media blocks: "action:block AND (target_value:*.facebook.com OR target_value:*.twitter.com)"
- Gaming restrictions: "action:timelimit AND target_category:gaming"
- Security rules: "action:block AND target_type:malware_domain"
- Active blocking rules: "action:block AND enabled:true AND paused:false"

TROUBLESHOOTING:
- Find conflicting rules: "target_value:example.com" (then check different actions)
- Identify inactive rules: "enabled:false OR paused:true"
- Review recent changes: "modified:>=yesterday"

PERFORMANCE NOTES:
- Rules are cached for 10 minutes for optimal performance
- Use specific target_value searches for fastest results
- Group by action or target_type for rule analysis

For rule management operations, see pause_rule and resume_rule tools.`;
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchRulesArgs;
    const startTime = Date.now();

    try {
      // Validate common search parameters
      const validation = validateCommonSearchParameters(
        searchArgs,
        this.name,
        'rules'
      );

      if (!validation.isValid) {
        return validation.response;
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: searchArgs.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_rules(searchParams),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Process rule data
      const processedRules = SafeAccess.safeArrayMap(
        (result as any).results,
        (rule: NetworkRule) => ({
          id: SafeAccess.getNestedValue(rule as any, 'id', 'unknown'),
          action: SafeAccess.getNestedValue(rule as any, 'action', 'unknown'),
          target_type: SafeAccess.getNestedValue(
            rule as any,
            'target.type',
            'unknown'
          ),
          target_value: SafeAccess.getNestedValue(
            rule as any,
            'target.value',
            'unknown'
          ),
          direction: SafeAccess.getNestedValue(
            rule as any,
            'direction',
            'unknown'
          ),
          status: SafeAccess.getNestedValue(rule as any, 'status', 'unknown'),
          hit_count: SafeAccess.getNestedValue(rule as any, 'hit.count', 0),
        })
      );

      // Create metadata for standardized response
      const metadata: SearchMetadata = {
        query: SafeAccess.getNestedValue(
          result as any,
          'query',
          searchArgs.query || ''
        ) as string,
        entityType: 'rules',
        executionTime: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          executionTime
        ) as number,
        cached: false,
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ) as Record<string, any> | undefined,
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(
        processedRules,
        metadata
      );

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(
          standardResponse,
          this.name
        );
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to search rules: ${errorMessage}`,
        ErrorType.SEARCH_ERROR
      );
    }
  }
}

export class SearchDevicesHandler extends BaseToolHandler {
  name = 'search_devices';
  description = `Network device searching with comprehensive filtering for status, usage patterns, and network properties. Requires query and limit parameters. Data cached for 5 minutes, use force_refresh=true for real-time device status.

Search through network devices to monitor connectivity, identify issues, and analyze usage patterns.

REQUIRED PARAMETERS:
- query: Search query string using device field syntax
- limit: Maximum number of results to return (1-10000)

OPTIONAL PARAMETERS:
- force_refresh: Bypass cache for real-time status (default: false)
- cursor: Pagination cursor from previous response
- time_range: Time window for search (start/end timestamps)
- sort_by: Field to sort results by
- group_by: Field to group results by for aggregation
- aggregate: Enable aggregation statistics

QUERY EXAMPLES:
- Status filtering: "online:true", "online:false", "last_seen:>=yesterday"
- Device identification: "mac_vendor:Apple", "name:*iPhone*", "ip:192.168.1.*"
- Network properties: "network_id:main", "dhcp:true", "static_ip:true"
- Usage patterns: "bandwidth_usage:>1000000", "active_connections:>10"
- Device types: "device_type:smartphone", "os_type:iOS", "manufacturer:Samsung"

CACHE CONTROL:
- Default: 5-minute cache for optimal performance
- Real-time: Use force_refresh=true for device troubleshooting
- Cache info included in responses for timing awareness

NETWORK MONITORING:
- Offline devices: "online:false AND last_seen:>=24h" (recently offline)
- Heavy bandwidth users: "bandwidth_usage:>5000000 AND online:true"
- Unknown devices: "name:unknown OR mac_vendor:unknown"
- Mobile devices: "device_type:smartphone OR device_type:tablet"
- IoT devices: "device_category:IoT OR manufacturer:smart_*"

TROUBLESHOOTING:
- Connection issues: "online:false AND dhcp_errors:>0"
- Security concerns: "new_device:true AND trust_level:low"
- Performance problems: "packet_loss:>5 OR latency:>100"

PAGINATION:
- Use cursor-based pagination for large device lists
- Supports up to 10,000 devices per query
- Include offline devices with include_offline:true

FIELD CONSISTENCY:
- Device names normalized to remove unknown/null inconsistencies
- IP addresses validated and standardized
- Timestamps converted to ISO format for consistency

See the Data Normalization Guide for field details.`;
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchDevicesArgs;
    try {
      // Validate common search parameters
      const validation = validateCommonSearchParameters(
        searchArgs,
        this.name,
        'devices'
      );

      if (!validation.isValid) {
        return validation.response;
      }

      // Validate that both cursor and offset are not provided simultaneously
      if (searchArgs.cursor !== undefined && searchArgs.offset !== undefined) {
        return createErrorResponse(
          this.name,
          'Cannot provide both cursor and offset parameters simultaneously',
          ErrorType.VALIDATION_ERROR,
          {
            provided_cursor: searchArgs.cursor,
            provided_offset: searchArgs.offset,
            documentation:
              'Use either cursor-based pagination (cursor) or offset-based pagination (offset), but not both',
          },
          ['cursor and offset parameters are mutually exclusive']
        );
      }

      // Validate force_refresh parameter if provided
      const forceRefreshValidation = ParameterValidator.validateBoolean(
        searchArgs.force_refresh,
        'force_refresh',
        false
      );

      if (!forceRefreshValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Force refresh parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          forceRefreshValidation.errors
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: searchArgs.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_devices(searchParams),
        this.name
      );

      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(
          (result as any).results,
          arr => arr.length,
          0
        ),
        query_executed: SafeAccess.getNestedValue(result as any, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          0
        ),
        devices: SafeAccess.safeArrayMap(
          (result as any).results,
          (device: Device) => ({
            id: SafeAccess.getNestedValue(device as any, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(
              device as any,
              'name',
              'Unknown Device'
            ),
            ip: SafeAccess.getNestedValue(device as any, 'ip', 'unknown'),
            online: SafeAccess.getNestedValue(device as any, 'online', false),
            macVendor: SafeAccess.getNestedValue(
              device as any,
              'macVendor',
              'unknown'
            ),
            lastSeen: SafeAccess.getNestedValue(device as any, 'lastSeen', 0),
          })
        ),
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to search devices: ${errorMessage}`,
        ErrorType.SEARCH_ERROR
      );
    }
  }
}

export class SearchTargetListsHandler extends BaseToolHandler {
  name = 'search_target_lists';
  description = `Target list searching with comprehensive filtering for categories, ownership, and content analysis.

Search through Firewalla target lists including domains, IPs, and security categories for policy management and analysis.

QUERY EXAMPLES:
- Category filtering: "category:ad", "category:social_media", "category:malware"
- Ownership: "owner:global", "owner:custom", "owner:user_defined"
- Content type: "type:domain", "type:ip", "type:url_pattern"
- Size filtering: "target_count:>100", "active_targets:>50"
- Status queries: "enabled:true", "updated:>=2024-01-01"

TARGET LIST MANAGEMENT:
- Ad blocking lists: "category:ad AND enabled:true"
- Security lists: "category:malware OR category:phishing OR category:threat"
- Social media controls: "category:social_media AND owner:custom"
- Custom domain lists: "owner:user_defined AND type:domain"
- Large lists analysis: "target_count:>1000 AND category:security"

CONTENT ANALYSIS:
- Popular categories: group_by:"category" for category distribution
- List effectiveness: "hit_count:>0 AND enabled:true"
- Maintenance needed: "updated:<=30d AND enabled:true"
- Unused lists: "hit_count:0 AND enabled:true"

PERFORMANCE CONSIDERATIONS:
- Target lists cached for 10 minutes for optimal performance
- Use specific category filters for faster searches
- Large lists (>10,000 targets) may have slower response times
- Aggregate queries provide faster overview statistics

FIELD NORMALIZATION:
- Categories standardized to lowercase with consistent naming
- Target counts validated as non-negative numbers
- Timestamps normalized to ISO format
- Unknown values replaced with "unknown" for consistency

See the Target List Management guide for configuration details.`;
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchTargetListsArgs;
    try {
      // Validate common search parameters
      const validation = validateCommonSearchParameters(
        searchArgs,
        this.name,
        'target_lists'
      );

      if (!validation.isValid) {
        return validation.response;
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: searchArgs.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_target_lists(searchParams),
        this.name
      );

      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(
          (result as any).results,
          arr => arr.length,
          0
        ),
        query_executed: SafeAccess.getNestedValue(result as any, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          0
        ),
        target_lists: SafeAccess.safeArrayMap(
          result.results,
          (list: TargetList) => ({
            id: SafeAccess.getNestedValue(list as any, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(
              list as any,
              'name',
              'Unknown List'
            ),
            category: SafeAccess.getNestedValue(
              list as any,
              'category',
              'unknown'
            ),
            owner: SafeAccess.getNestedValue(list as any, 'owner', 'unknown'),
            entry_count: SafeAccess.safeArrayAccess(
              list.targets,
              arr => arr.length,
              0
            ),
          })
        ),
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to search target lists: ${errorMessage}`,
        ErrorType.SEARCH_ERROR
      );
    }
  }
}

export class SearchCrossReferenceHandler extends BaseToolHandler {
  name = 'search_cross_reference';
  description =
    'Multi-entity searches with correlation across different data types';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchCrossReferenceArgs;
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await withToolTimeout(
        async () =>
          searchTools.search_cross_reference({
            primary_query: searchArgs.primary_query,
            secondary_queries: searchArgs.secondary_queries,
            correlation_field: searchArgs.correlation_field,
            limit: searchArgs.limit,
          }),
        this.name
      );

      return this.createSuccessResponse({
        primary_query: SafeAccess.getNestedValue(result, 'primary.query', ''),
        primary_results: SafeAccess.getNestedValue(result, 'primary.count', 0),
        correlations: SafeAccess.safeArrayMap(
          result.correlations,
          (corr: any) => ({
            query: SafeAccess.getNestedValue(corr, 'query', ''),
            matches: SafeAccess.getNestedValue(corr, 'count', 0),
            correlation_field: SafeAccess.getNestedValue(
              corr,
              'correlation_field',
              ''
            ),
          })
        ),
        correlation_summary: SafeAccess.getNestedValue(
          result,
          'correlation_summary',
          {}
        ),
        execution_time_ms: SafeAccess.getNestedValue(
          result,
          'execution_time_ms',
          0
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search cross reference: ${errorMessage}`
      );
    }
  }
}

export class SearchEnhancedCrossReferenceHandler extends BaseToolHandler {
  name = 'search_enhanced_cross_reference';
  description =
    'Advanced multi-field correlation with temporal windows and network scoping';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchEnhancedCrossReferenceArgs;
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await withToolTimeout(
        async () =>
          searchTools.search_enhanced_cross_reference({
            primary_query: searchArgs.primary_query,
            secondary_queries: searchArgs.secondary_queries,
            correlation_params: searchArgs.correlation_params,
            limit: searchArgs.limit,
          }),
        this.name
      );

      // Simplified correlation response structure for better user experience
      const simplifiedResponse = {
        // Basic query information
        query_info: {
          primary_query: SafeAccess.getNestedValue(result, 'primary.query', ''),
          secondary_queries: SafeAccess.safeArrayMap(
            SafeAccess.getNestedValue(result, 'correlations', []),
            (corr: any) => SafeAccess.getNestedValue(corr, 'query', '')
          ),
          correlation_method: SafeAccess.getNestedValue(
            result,
            'correlation_summary.correlation_type',
            'AND'
          ),
          correlation_fields: (
            SafeAccess.getNestedValue(
              result,
              'correlation_summary.correlation_fields',
              []
            ) as string[]
          ).join(', '),
        },

        // Summary statistics in simple format
        summary: {
          primary_results_count: SafeAccess.getNestedValue(
            result,
            'primary.count',
            0
          ),
          total_correlated_items: SafeAccess.getNestedValue(
            result,
            'correlation_summary.total_correlated_count',
            0
          ),
          correlations_found: SafeAccess.safeArrayAccess(
            SafeAccess.getNestedValue(result, 'correlations', []),
            arr => arr.length,
            0
          ),
          execution_time_ms: SafeAccess.getNestedValue(
            result,
            'execution_time_ms',
            0
          ),
          temporal_filtering_used: SafeAccess.getNestedValue(
            result,
            'correlation_summary.temporal_window_applied',
            false
          ),
        },

        // Simplified correlation results - focus on actionable information
        correlations: SafeAccess.safeArrayMap(
          SafeAccess.getNestedValue(result, 'correlations', []),
          (correlation: any) => {
            const correlationResults = SafeAccess.getNestedValue(
              correlation,
              'results',
              []
            ) as any[];
            const topResults = correlationResults.slice(0, 5); // Show top 5 matches only

            return {
              query: SafeAccess.getNestedValue(correlation, 'query', ''),
              entity_type: SafeAccess.getNestedValue(
                correlation,
                'entity_type',
                'unknown'
              ),
              matches_found: SafeAccess.getNestedValue(correlation, 'count', 0),

              // Simplified correlation matches - key information only
              top_matches: SafeAccess.safeArrayMap(topResults, (item: any) => ({
                correlation_strength: Math.round(
                  (SafeAccess.getNestedValue(
                    item,
                    'correlation_strength',
                    0
                  ) as number) * 100
                ), // Convert to percentage
                matched_on: (
                  SafeAccess.getNestedValue(
                    item,
                    'matched_fields',
                    []
                  ) as string[]
                ).join(', '),
                summary: this.extractItemSummary(
                  SafeAccess.getNestedValue(item, 'data', {})
                ),
              })),

              // Simple statistics
              stats: {
                average_correlation: Math.round(
                  (correlationResults.reduce(
                    (sum: number, item: any) =>
                      sum +
                      (SafeAccess.getNestedValue(
                        item,
                        'correlation_strength',
                        0
                      ) as number),
                    0
                  ) /
                    Math.max(correlationResults.length, 1)) *
                    100
                ),
                strongest_match: Math.round(
                  Math.max(
                    ...correlationResults.map(
                      (item: any) =>
                        SafeAccess.getNestedValue(
                          item,
                          'correlation_strength',
                          0
                        ) as number
                    ),
                    0
                  ) * 100
                ),
              },
            };
          }
        ),

        // User guidance for interpreting results
        interpretation: {
          correlation_quality: this.assessCorrelationQuality(result),
          recommendations: this.generateCorrelationRecommendations(result),
        },
      };

      return this.createSuccessResponse(simplifiedResponse);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to execute enhanced cross reference search: ${errorMessage}`
      );
    }
  }

  /**
   * Extract a simple summary from correlation item data
   */
  private extractItemSummary(data: any): string {
    if (!data || typeof data !== 'object') {
      return 'No details available';
    }

    // Extract key identifying information
    const parts: string[] = [];

    if (data.source_ip) {
      parts.push(`IP: ${data.source_ip}`);
    }
    if (data.destination_ip) {
      parts.push(`→ ${data.destination_ip}`);
    }
    if (data.protocol) {
      parts.push(`(${data.protocol})`);
    }
    if (data.action) {
      parts.push(`Action: ${data.action}`);
    }
    if (data.severity) {
      parts.push(`Severity: ${data.severity}`);
    }
    if (data.type) {
      parts.push(`Type: ${data.type}`);
    }
    if (data.device?.name) {
      parts.push(`Device: ${data.device.name}`);
    }

    return parts.length > 0 ? parts.join(' ') : 'Correlation match found';
  }

  /**
   * Assess the overall quality of correlations found
   */
  private assessCorrelationQuality(result: any): string {
    const correlations = SafeAccess.getNestedValue(
      result,
      'correlations',
      []
    ) as any[];
    if (correlations.length === 0) {
      return 'No correlations found';
    }

    const totalMatches = correlations.reduce(
      (sum: number, corr: any) =>
        sum + (SafeAccess.getNestedValue(corr, 'count', 0) as number),
      0
    );

    const avgStrength =
      correlations.reduce((sum: number, corr: any) => {
        const results = SafeAccess.getNestedValue(corr, 'results', []) as any[];
        const avgForCorr =
          results.reduce(
            (s: number, item: any) =>
              s +
              (SafeAccess.getNestedValue(
                item,
                'correlation_strength',
                0
              ) as number),
            0
          ) / Math.max(results.length, 1);
        return sum + avgForCorr;
      }, 0) / correlations.length;

    if (avgStrength > 0.8) {
      return `Excellent (${totalMatches} strong correlations found)`;
    }
    if (avgStrength > 0.6) {
      return `Good (${totalMatches} moderate correlations found)`;
    }
    if (avgStrength > 0.4) {
      return `Fair (${totalMatches} weak correlations found)`;
    }
    return `Poor (${totalMatches} very weak correlations found)`;
  }

  /**
   * Generate actionable recommendations based on correlation results
   */
  private generateCorrelationRecommendations(result: any): string[] {
    const recommendations: string[] = [];
    const correlations = SafeAccess.getNestedValue(
      result,
      'correlations',
      []
    ) as any[];
    const primaryCount = SafeAccess.getNestedValue(
      result,
      'primary.count',
      0
    ) as number;

    if (correlations.length === 0) {
      recommendations.push(
        'No correlations found. Try broader correlation fields or different time windows.',
        'Consider using fuzzy matching or expanding the search criteria.',
        'Verify that the primary query returns meaningful results first.'
      );
    } else {
      const totalCorrelated = SafeAccess.getNestedValue(
        result,
        'correlation_summary.total_correlated_count',
        0
      ) as number;
      const correlationRate = totalCorrelated / Math.max(primaryCount, 1);

      if (correlationRate > 0.5) {
        recommendations.push(
          'High correlation rate detected - consider investigating these patterns.',
          'Strong correlations suggest related security events or network patterns.'
        );
      } else if (correlationRate > 0.1) {
        recommendations.push(
          'Moderate correlations found - review the strongest matches first.',
          'Consider refining correlation fields for more precise results.'
        );
      } else {
        recommendations.push(
          'Low correlation rate - results may be coincidental.',
          'Try different correlation fields or adjust time windows.',
          'Focus on the highest correlation strength matches only.'
        );
      }

      recommendations.push(
        'Review top matches with correlation strength > 70% for actionable insights.',
        'Use correlation results to guide further investigation or rule creation.'
      );
    }

    return recommendations;
  }
}

export class GetCorrelationSuggestionsHandler extends BaseToolHandler {
  name = 'get_correlation_suggestions';
  description =
    'Get intelligent field combination recommendations for cross-reference searches';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as GetCorrelationSuggestionsArgs;
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await withToolTimeout(
        async () =>
          searchTools.get_correlation_suggestions({
            primary_query: searchArgs.primary_query,
            secondary_queries: searchArgs.secondary_queries,
          }),
        this.name
      );

      return this.createSuccessResponse({
        entity_types: SafeAccess.getNestedValue(result, 'entity_types', []),
        suggested_combinations: SafeAccess.safeArrayMap(
          result.combinations,
          (combo: any) => ({
            fields: SafeAccess.getNestedValue(combo, 'fields', []),
            description: SafeAccess.getNestedValue(combo, 'description', ''),
            compatibility_score: SafeAccess.getNestedValue(
              combo,
              'compatibility_score',
              0
            ),
            performance_rating: SafeAccess.getNestedValue(
              combo,
              'performance_rating',
              'unknown'
            ),
            use_cases: SafeAccess.getNestedValue(combo, 'use_cases', []),
          })
        ),
        common_patterns: SafeAccess.safeArrayMap(
          result.patterns,
          (pattern: any) => ({
            name: SafeAccess.getNestedValue(pattern, 'name', ''),
            fields: SafeAccess.getNestedValue(pattern, 'fields', []),
            description: SafeAccess.getNestedValue(pattern, 'description', ''),
          })
        ),
        field_compatibility_matrix: SafeAccess.getNestedValue(
          result,
          'compatibility_matrix',
          {}
        ),
        execution_time_ms: SafeAccess.getNestedValue(
          result,
          'execution_time_ms',
          0
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get correlation suggestions: ${errorMessage}`
      );
    }
  }
}

export class SearchAlarmsByGeographyHandler extends BaseToolHandler {
  name = 'search_alarms_by_geography';
  description = 'Geographic alarm search with location-based threat analysis';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchAlarmsByGeographyArgs;
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await withToolTimeout(
        async () =>
          searchTools.search_alarms_by_geography({
            query: searchArgs.query,
            geographic_filters: searchArgs.geographic_filters,
            limit: searchArgs.limit,
            sort_by: searchArgs.sort_by,
            group_by: searchArgs.group_by,
          }),
        this.name
      );

      return this.createSuccessResponse({
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        count: SafeAccess.safeArrayAccess(result.results, arr => arr.length, 0),
        geographic_threat_analysis: SafeAccess.getNestedValue(
          result,
          'geographic_threat_analysis',
          null
        )
          ? {
              total_alarms: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.total_alarms',
                0
              ),
              high_risk_countries: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.high_risk_countries',
                {}
              ),
              threat_by_continent: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.threat_by_continent',
                {}
              ),
              suspicious_asns: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.suspicious_asns',
                {}
              ),
              cloud_threats: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.cloud_threats',
                0
              ),
              vpn_threats: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.vpn_threats',
                0
              ),
              proxy_threats: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.proxy_threats',
                0
              ),
              risk_distribution: SafeAccess.getNestedValue(
                result,
                'geographic_threat_analysis.risk_distribution',
                {}
              ),
            }
          : null,
        alarms: SafeAccess.safeArrayMap(result.results, (alarm: Alarm) => ({
          timestamp: unixToISOStringOrNow(alarm.ts),
          type: SafeAccess.getNestedValue(alarm as any, 'type', 'unknown'),
          severity: SafeAccess.getNestedValue(
            alarm as any,
            'severity',
            'unknown'
          ),
          message: SafeAccess.getNestedValue(
            alarm as any,
            'message',
            'No message'
          ),
          geographic_data: {
            country: SafeAccess.getNestedValue(
              alarm as any,
              'remote.country',
              'unknown'
            ),
            continent: SafeAccess.getNestedValue(
              alarm as any,
              'remote.continent',
              'unknown'
            ),
            city: SafeAccess.getNestedValue(
              alarm as any,
              'remote.city',
              'unknown'
            ),
            asn: SafeAccess.getNestedValue(
              alarm as any,
              'remote.asn',
              'unknown'
            ),
            is_cloud: SafeAccess.getNestedValue(
              alarm as any,
              'remote.cloud',
              false
            ),
            is_vpn: SafeAccess.getNestedValue(
              alarm as any,
              'remote.vpn',
              false
            ),
            risk_score: SafeAccess.getNestedValue(
              alarm as any,
              'remote.geoRisk',
              0
            ),
          },
        })),
        execution_time_ms: SafeAccess.getNestedValue(
          result,
          'execution_time_ms',
          0
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search alarms by geography: ${errorMessage}`
      );
    }
  }
}

export class GetGeographicStatisticsHandler extends BaseToolHandler {
  name = 'get_geographic_statistics';
  description =
    'Comprehensive geographic statistics and analytics for flows and alarms';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as GetGeographicStatisticsArgs;
    try {
      // Validate entity_type parameter
      const entityTypeValidation = ParameterValidator.validateEnum(
        searchArgs.entity_type,
        'entity_type',
        ['flows', 'alarms'],
        true // required parameter
      );

      if (!entityTypeValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Invalid entity_type parameter',
          ErrorType.VALIDATION_ERROR,
          {
            provided_value: searchArgs.entity_type,
            valid_values: ['flows', 'alarms'],
            documentation: 'entity_type must be either "flows" or "alarms"',
          },
          entityTypeValidation.errors
        );
      }

      // Validate group_by parameter if provided
      if (searchArgs.group_by !== undefined) {
        const groupByValidation = ParameterValidator.validateEnum(
          searchArgs.group_by,
          'group_by',
          ['country', 'continent', 'region', 'asn', 'provider'],
          false // optional parameter
        );

        if (!groupByValidation.isValid) {
          return createErrorResponse(
            this.name,
            'Invalid group_by parameter',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: searchArgs.group_by,
              valid_values: [
                'country',
                'continent',
                'region',
                'asn',
                'provider',
              ],
              documentation:
                'group_by must be one of: country, continent, region, asn, provider',
            },
            groupByValidation.errors
          );
        }
      }

      const searchTools = createSearchTools(firewalla);
      const result = await withToolTimeout(
        async () =>
          searchTools.get_geographic_statistics({
            entity_type: searchArgs.entity_type,
            time_range: searchArgs.time_range,
            analysis_type: searchArgs.analysis_type,
            group_by: searchArgs.group_by,
            limit: searchArgs.limit,
          }),
        this.name
      );

      return this.createSuccessResponse({
        entity_type: SafeAccess.getNestedValue(
          result,
          'entity_type',
          'unknown'
        ),
        group_by: SafeAccess.getNestedValue(result, 'group_by', 'country'),
        analysis_type: SafeAccess.getNestedValue(
          result,
          'analysis_type',
          'summary'
        ),
        total_records: SafeAccess.getNestedValue(result, 'total_records', 0),
        statistics: {
          summary: SafeAccess.getNestedValue(result, 'statistics.summary', {}),
          distribution: SafeAccess.getNestedValue(
            result,
            'statistics.distribution',
            {}
          ),
          insights: SafeAccess.getNestedValue(
            result,
            'statistics.insights',
            []
          ),
        },
        time_range: SafeAccess.getNestedValue(result, 'time_range', null),
        execution_time_ms: SafeAccess.getNestedValue(
          result,
          'execution_time_ms',
          0
        ),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(this.name, error.duration, 10000);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get geographic statistics: ${errorMessage}`
      );
    }
  }
}
