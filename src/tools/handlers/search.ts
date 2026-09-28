/**
 * Advanced search tool handlers
 */

import {
  BaseToolHandler,
  mspQueryErrorResponse,
  type ToolArgs,
  type ToolResponse,
} from './base.js';
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
  queryShapeRefusal,
} from '../../validation/error-handler.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  validateFirewallaQuerySyntax,
  getExampleQueries,
} from '../../utils/query-validator.js';
import {
  withToolTimeout,
  TimeoutError,
  createTimeoutErrorResponse,
} from '../../utils/timeout-manager.js';
import { createSearchTools } from '../search.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';
import { SEARCH_FIELDS, type SearchParams } from '../../search/types.js';
// ResponseStandardizer import removed - using direct response creation
import {
  GeographicFilterError,
  geographicFiltersToMspQuery,
  type FlowGeographicFilters,
} from '../../utils/geographic-filters.js';
import { targetListEntryCount } from '../../utils/target-lists.js';
import { bracketRangeError, findBracketRange } from '../../utils/msp-query.js';
import { translateToMspQualifiers } from '../../utils/msp-qualifiers.js';
import { commaListValues, ipv4InCidr } from '../../search/client-filter.js';

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
  geographic_filters?: FlowGeographicFilters;
  include_analytics?: boolean;
}

export interface SearchAlarmsArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
  /** Countries of the remote end, sent as remote.region: */
  geographic_filters?: FlowGeographicFilters;
}

export interface SearchRulesArgs extends BaseSearchArgs {}

export interface SearchDevicesArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
  box?: string;
}

export interface SearchTargetListsArgs extends BaseSearchArgs {
  owner?: string;
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
  entityType: 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists',
  // The default the tool's schema advertises for limit
  defaultLimit = 200
): CommonSearchValidationResult {
  // Validate optional limit parameter with default
  const limitValidation = ParameterValidator.validateNumber(
    args.limit,
    'limit',
    {
      required: false,
      defaultValue: defaultLimit,
      ...getLimitValidationConfig(toolName),
    }
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

  // Balanced parentheses, brackets and quotes, the nesting and length
  // limits, no control characters, and the complexity limits, each message
  // naming the limit it hit, before any translation or request; every tool
  // that takes a query runs the same checks (queryShapeRefusal).
  // search_flows and search_alarms sent an unclosed [, a NUL and a
  // 2,001-character query to the API, and the complexity limits ran in the
  // field check, refusing as "Query contains invalid field names".
  const shapeRefusal = queryShapeRefusal(toolName, args.query);
  if (shapeRefusal) {
    return { isValid: false, response: shapeRefusal };
  }

  // [low TO high] ranges: the API's are field:low-high. The suggestion has
  // the qualifiers the client sends (bytes: goes out as total: on flows).
  const bracketRange = findBracketRange(args.query);
  if (bracketRange) {
    return {
      isValid: false,
      response: mspQueryErrorResponse(
        toolName,
        bracketRangeError(
          args.query,
          bracketRange,
          translateToMspQualifiers(bracketRange.query, entityType)
        )
      )!,
    };
  }

  // Validate query syntax
  const querySyntaxValidation = validateFirewallaQuerySyntax(args.query);

  if (!querySyntaxValidation.isValid) {
    const examples = getExampleQueries(entityType);
    return {
      isValid: false,
      response: createErrorResponse(
        toolName,
        'Invalid query syntax',
        ErrorType.VALIDATION_ERROR,
        {
          query: args.query,
          syntax_errors: querySyntaxValidation.errors,
          examples: examples.slice(0, 3),
          hint: 'Use field:value terms joined by spaces or AND; OR works between values of one field (type:1 OR type:10); NOT or a leading - excludes',
        },
        querySyntaxValidation.errors
      ),
    };
  }

  // Validate field names in the query
  const fieldValidation = QuerySanitizer.validateQueryFields(
    args.query,
    entityType
  );

  if (!fieldValidation.isValid) {
    // A bare MAC address reads as a field (`aa:` in aa:bb:cc:dd:ee:ff)
    const bareMac =
      /(?:^|[\s(])-?((?:[0-9a-f]{2}:){5}[0-9a-f]{2})(?=$|[\s)])/i.exec(
        args.query
      )?.[1];
    const macHint = bareMac
      ? entityType === 'devices'
        ? `To search by MAC address, write mac:${bareMac}`
        : `To search by MAC address, write device.id:"${bareMac}"`
      : undefined;
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
          ...(macHint && { hint: macHint }),
        },
        macHint ? [...fieldValidation.errors, macHint] : fieldValidation.errors
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

  // Flows and alarms send group_by to the API as groupBy, which takes
  // comma-separated API fields (for flows e.g. device, category, domain,
  // box; for alarms type, box, device, status) and answers an unknown one
  // with 400 (measured 2026-09-25). Other entities group on the client by
  // one of their search fields.
  let groupBy = args.group_by;
  if (
    args.group_by !== undefined &&
    (entityType === 'flows' || entityType === 'alarms')
  ) {
    // An empty group_by asks for no grouping
    groupBy =
      typeof args.group_by === 'string'
        ? args.group_by.replace(/\s+/g, '') || undefined
        : args.group_by;
    if (
      groupBy !== undefined &&
      (typeof groupBy !== 'string' ||
        !/^[A-Za-z_.]+(,[A-Za-z_.]+)*$/.test(groupBy))
    ) {
      return {
        isValid: false,
        response: createErrorResponse(
          toolName,
          'Invalid group_by field',
          ErrorType.VALIDATION_ERROR,
          { group_by: args.group_by },
          [
            'group_by must be one or more comma-separated API fields, e.g. "category" or "device,category"',
          ]
        ),
      };
    }
  } else if (args.group_by !== undefined) {
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
    // The limit to use: the one given, else the default
    limit: limitValidation.sanitizedValue as number,
    query: args.query,
    cursor: args.cursor,
    groupBy,
  };
}

export class SearchFlowsHandler extends BaseToolHandler {
  name = 'search_flows';
  description =
    'Search network flows with advanced query filters. Use this for: historical analysis, specific time ranges, complex filtering, or when you need more than 50 flows. Supports pagination, time-based queries (e.g., "ts:>1h" for the last hour, or Unix seconds such as "ts:1735689600-1735693200"), and all flow fields including geographic filtering. For quick "what\'s happening now" snapshots, use get_recent_flow_activity instead. Reads GET /v2/flows, 500 per request, following the cursor up to limit; coverage gives the oldest and newest ts returned and why paging stopped. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'search' as const;

  constructor() {
    // Enable full standardization: geographic enrichment and field normalization for network flows
    super({
      enableGeoEnrichment: true, // Network flows have IP addresses that require geographic enrichment
      enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
      additionalMeta: {
        data_source: 'flows',
        entity_type: 'network_flows',
        supports_geographic_enrichment: true,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // The tool schema names the grouping groupBy and the sort sortBy;
    // group_by and sort_by are read too
    const searchArgs = {
      ...args,
      group_by: args.group_by ?? args.groupBy,
      sort_by: args.sort_by ?? args.sortBy,
    } as SearchFlowsArgs;
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

      const finalQuery = searchArgs.query;

      // ------------------------------------------------------------
      // geographic_filters: countries go to the API as region:, the one
      // geographic flow qualifier it documents; any other filter is refused
      // here, before a request, as the API would match nothing
      // ------------------------------------------------------------
      let geographicTerm: string | undefined;
      try {
        geographicTerm = geographicFiltersToMspQuery(
          searchArgs.geographic_filters
        );
      } catch (error) {
        if (!(error instanceof GeographicFilterError)) {
          throw error;
        }
        return createErrorResponse(
          this.name,
          error.message,
          ErrorType.VALIDATION_ERROR,
          {
            geographic_filters: searchArgs.geographic_filters,
            ...(error.unsupported.length > 0 && {
              unsupported_filters: error.unsupported,
            }),
            ...(Object.keys(error.invalid).length > 0 && {
              invalid_values: error.invalid,
            }),
            supported_filters: {
              countries:
                'ISO 3166-1 alpha-2 country codes, sent as region:US,CN (any of them)',
              regions:
                "country codes too, merged with countries (the API's region is a country)",
            },
          },
          error.problems
        );
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
        limit: validation.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: validation.groupBy,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
        geographic_filters: searchArgs.geographic_filters,
        include_analytics: includeAnalyticsValidation.sanitizedValue as boolean,
      };

      // The read's requests, counted into coverage.api_requests, retries
      // included. The client sends a GET again once after a timeout, a
      // dropped connection or a 502, 503 or 504; this handler does not retry
      // on top of that.
      const trace = { sent: 0, cached: 0 };

      const result = await withToolTimeout(
        async () => searchTools.search_flows(searchParams, trace),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Grouped: the API returned one item per group, not flows
      if (result.groups) {
        return this.createUnifiedResponse(
          {
            group_by: result.group_by,
            count: result.groups.length,
            groups: result.groups,
            next_cursor: result.next_cursor,
            has_more: !!result.next_cursor,
            query_executed: result.query,
          },
          { executionTimeMs: executionTime }
        );
      }

      // Process flow data with enhanced standardization
      let processedFlows = SafeAccess.safeArrayMap(
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
          domain: SafeAccess.getNestedValue(flow as any, 'domain', null),
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
          network: SafeAccess.getNestedValue(flow as any, 'network', null),
        })
      );

      // Apply geographic enrichment pipeline for IP addresses
      processedFlows = await this.enrichGeoIfNeeded(processedFlows, [
        'source_ip',
        'destination_ip',
      ]);

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
        cached: false,
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: validation.limit,
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ) as Record<string, any> | undefined,
      };

      // Create unified response with standardized metadata. coverage: the
      // oldest and newest ts the API returned, and why paging stopped
      const unifiedResponseData = {
        flows: processedFlows,
        metadata,
        coverage: result.coverage,
        query_info: {
          original_query: searchArgs.query,
          // The query sent to the API; final_query repeated original_query
          final_query: metadata.query,
          applied_filters: {
            // only when the filters added a term to the query
            geographic: !!geographicTerm,
            time_range: !!searchArgs.time_range,
            analytics: !!searchArgs.include_analytics,
          },
        },
      };

      // Return unified response
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      // A query the MSP API cannot run was refused before any request
      const queryError = mspQueryErrorResponse(this.name, error);
      if (queryError) {
        return queryError;
      }
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          error.timeoutMs
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
  description =
    'Search alarms using full-text or field filters. Alarm types: 1=Security Activity, 2=Abnormal Upload, 3=Large Bandwidth Usage, 4=Monthly Data Plan, 5=New Device, 6=Device Back Online, 7=Device Offline, 8=Video Activity, 9=Gaming Activity, 10=Porn Activity, 11=VPN Activity, 12=VPN Connection Restored, 13=VPN Connection Error, 14=Open Port, 15=Internet Connectivity Update, 16=Large Upload. Reads GET /v2/alarms, 500 per request, following the cursor up to limit. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'search' as const;

  constructor() {
    // Enable full standardization: geographic enrichment and field normalization for security alarms
    super({
      enableGeoEnrichment: true, // Security alarms often contain IP addresses that require geographic enrichment
      enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
      additionalMeta: {
        data_source: 'alarms',
        entity_type: 'security_alarms',
        supports_geographic_enrichment: true,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // The tool schema names the grouping groupBy and the sort sortBy;
    // group_by and sort_by are read too
    const searchArgs = {
      ...args,
      group_by: args.group_by ?? args.groupBy,
      sort_by: args.sort_by ?? args.sortBy,
    } as SearchAlarmsArgs;
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

      // geographic_filters: countries go to the API as remote.region:, the
      // remote end's country, the one geographic alarm qualifier it
      // documents; any other filter is refused here, before a request. The
      // argument was read by no one: {countries: ["CN"]} sent the query
      // alone and answered as if every country matched
      let geographicTerm: string | undefined;
      try {
        geographicTerm = geographicFiltersToMspQuery(
          searchArgs.geographic_filters,
          'alarms'
        );
      } catch (error) {
        if (!(error instanceof GeographicFilterError)) {
          throw error;
        }
        return createErrorResponse(
          this.name,
          error.message,
          ErrorType.VALIDATION_ERROR,
          {
            geographic_filters: searchArgs.geographic_filters,
            ...(error.unsupported.length > 0 && {
              unsupported_filters: error.unsupported,
            }),
            ...(Object.keys(error.invalid).length > 0 && {
              invalid_values: error.invalid,
            }),
            supported_filters: {
              countries:
                'ISO 3166-1 alpha-2 country codes of the remote end, sent as remote.region:US,CN (any of them)',
              regions:
                "country codes too, merged with countries (the API's remote.region is a country)",
            },
          },
          error.problems
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: validation.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: validation.groupBy,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
        geographic_filters: searchArgs.geographic_filters,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_alarms(searchParams),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Grouped: the API returned one item per group, not alarms
      if (result.groups) {
        return this.createUnifiedResponse(
          {
            group_by: result.group_by,
            count: result.groups.length,
            groups: result.groups,
            next_cursor: result.next_cursor,
            has_more: !!result.next_cursor,
            query_executed: result.query,
          },
          { executionTimeMs: executionTime }
        );
      }

      // Process alarm data with enhanced standardization and schema harmonization
      let processedAlarms = SafeAccess.safeArrayMap(
        (result as any).results,
        (alarm: Alarm) => {
          // Try to extract device information from various possible locations
          const deviceInfo = {
            id: SafeAccess.getNestedValue(
              alarm as any,
              'device.id',
              SafeAccess.getNestedValue(
                alarm as any,
                'deviceId',
                SafeAccess.getNestedValue(alarm as any, 'mac', 'unknown')
              )
            ),
            name: SafeAccess.getNestedValue(
              alarm as any,
              'device.name',
              SafeAccess.getNestedValue(alarm as any, 'deviceName', 'unknown')
            ),
            ip: SafeAccess.getNestedValue(
              alarm as any,
              'device.ip',
              SafeAccess.getNestedValue(
                alarm as any,
                'deviceIp',
                SafeAccess.getNestedValue(alarm as any, 'ip', 'unknown')
              )
            ),
            mac: SafeAccess.getNestedValue(
              alarm as any,
              'device.mac',
              SafeAccess.getNestedValue(alarm as any, 'mac', 'unknown')
            ),
          };

          const rawAid = SafeAccess.getNestedValue(alarm as any, 'aid', null);

          // Use the actual alarm ID directly, properly handling 0 as a valid ID
          const finalAid =
            rawAid !== null && rawAid !== undefined
              ? String(rawAid)
              : 'unknown';

          return {
            aid: finalAid,
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
            status: SafeAccess.getNestedValue(
              alarm as any,
              'status',
              'unknown'
            ),
            // Enhanced device information (only include if meaningful data found)
            device:
              deviceInfo.id !== 'unknown' || deviceInfo.name !== 'unknown'
                ? deviceInfo
                : undefined,
            // Extract IP addresses for potential geographic enrichment
            source_ip: SafeAccess.getNestedValue(
              alarm as any,
              'remote.ip',
              SafeAccess.getNestedValue(
                alarm as any,
                'source_ip',
                SafeAccess.getNestedValue(alarm as any, 'src', 'unknown')
              )
            ),
            destination_ip: SafeAccess.getNestedValue(
              alarm as any,
              'destination.ip',
              SafeAccess.getNestedValue(
                alarm as any,
                'destination_ip',
                SafeAccess.getNestedValue(alarm as any, 'dst', 'unknown')
              )
            ),
          };
        }
      );

      // Apply geographic enrichment pipeline for IP addresses in alarms
      processedAlarms = await this.enrichGeoIfNeeded(processedAlarms, [
        'source_ip',
        'destination_ip',
      ]);

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
        limit: validation.limit,
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ) as Record<string, any> | undefined,
      };

      // Add schema harmonization warning for search vs active alarms
      const schemaNote = {
        warning:
          'Search endpoint returns limited fields compared to get_active_alarms',
        recommendation:
          'Use get_active_alarms for complete device and alarm information',
        differences: [
          'Device objects may not be fully populated in search results',
          "Some severity and status fields may show 'unknown' values",
          'Geographic enrichment is applied but original data may be limited',
        ],
      };

      // Create unified response with standardized metadata
      const unifiedResponseData = {
        alarms: processedAlarms,
        metadata,
        schema_harmonization: schemaNote,
        query_info: {
          original_query: searchArgs.query,
          // The query sent to the API
          final_query: metadata.query,
          applied_filters: {
            time_range: !!searchArgs.time_range,
            force_refresh: !!searchArgs.force_refresh,
            // The remote.region term sent for geographic_filters, if any
            geographic: geographicTerm ?? false,
          },
        },
      };

      // Return unified response
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      // A query the MSP API cannot run was refused before any request
      const queryError = mspQueryErrorResponse(this.name, error);
      if (queryError) {
        return queryError;
      }
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          error.timeoutMs
        );
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
  description =
    'Search firewall rules by target, action or status; the MSP API applies the query (GET /v2/rules). Supports all rule fields. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'search' as const;

  constructor() {
    // Enable field normalization for firewall rules (no geographic enrichment needed)
    super({
      enableGeoEnrichment: false, // Firewall rules don't typically contain IP addresses
      enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
      additionalMeta: {
        data_source: 'rules',
        entity_type: 'firewall_rules',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

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

      // Create unified response with standardized metadata
      const unifiedResponseData = {
        rules: processedRules,
        metadata,
        // With free text: the rules checked for the words, and whether they
        // were every rule the other terms match
        ...(result.free_text_coverage && {
          free_text_coverage: result.free_text_coverage,
        }),
        query_info: {
          original_query: searchArgs.query,
          // The terms sent to the API; free text is not sent (GET
          // /v2/rules matches none) but matched here, and
          // free_text_coverage says how many rules were checked
          final_query: metadata.query,
          applied_filters: {
            grouping: !!searchArgs.group_by,
            sorting: !!searchArgs.sort_by,
            aggregation: !!searchArgs.aggregate,
          },
        },
      };

      // Return unified response
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      // A query the MSP API cannot run was refused before any request
      const queryError = mspQueryErrorResponse(this.name, error);
      if (queryError) {
        return queryError;
      }
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          error.timeoutMs
        );
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

/**
 * The `ip:` values of a search_devices query that have a `/` but are not an
 * IPv4 CIDR block (an IPv6 block, a prefix past 32, a typo)
 */
function invalidIpBlocks(query: string): string[] {
  const values = [
    ...query.matchAll(
      /(?:^|[\s(])-?ip:("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s()]+)/gi
    ),
  ].flatMap(match => commaListValues(match[1]));
  return values.filter(
    value => value.includes('/') && ipv4InCidr('0.0.0.0', value) === undefined
  );
}

export class SearchDevicesHandler extends BaseToolHandler {
  name = 'search_devices';
  description =
    'Search devices by name, IP, MAC or status (convenience wrapper with client-side filtering): reads the device list from GET /v2/devices (box, else FIREWALLA_BOX_ID, else every box) and filters it locally.';
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
        'devices',
        50
      );

      if (!validation.isValid) {
        return validation.response;
      }

      // ip: takes an IPv4 CIDR block (192.168.1.0/24); any other value with
      // a / would match no device
      const badBlocks = invalidIpBlocks(searchArgs.query);
      if (badBlocks.length > 0) {
        const problems = badBlocks.map(
          block =>
            `ip:${block} is not an IPv4 CIDR block; ip: takes an address, a * wildcard (192.168.1.*) or an IPv4 block such as 192.168.1.0/24.`
        );
        return createErrorResponse(
          this.name,
          problems.join(' '),
          ErrorType.VALIDATION_ERROR,
          { query: searchArgs.query, invalid_ip_blocks: badBlocks },
          problems
        );
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

      // The box to search; searchDevices falls back to FIREWALLA_BOX_ID
      const boxValidation = ParameterValidator.validateOptionalString(
        searchArgs.box,
        'box'
      );
      if (!boxValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Box parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          boxValidation.errors
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: validation.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
        time_range: searchArgs.time_range,
        force_refresh: forceRefreshValidation.sanitizedValue as boolean,
        box: boxValidation.sanitizedValue as string | undefined,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_devices(searchParams),
        this.name
      );

      // Process and enrich device data with geographic information
      const deviceData = await this.enrichGeoIfNeeded(
        SafeAccess.safeArrayMap((result as any).results, (device: Device) => ({
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
        })),
        ['ip'] // Enrich the device IP addresses
      );

      const unifiedResponseData = {
        devices: deviceData,
        count: deviceData.length,
        query_executed: SafeAccess.getNestedValue(result as any, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(
          result as any,
          'execution_time_ms',
          0
        ),
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ),
        query_info: {
          original_query: searchArgs.query,
          // The query the devices were matched against, as query_executed
          final_query: SafeAccess.getNestedValue(result as any, 'query', ''),
          applied_filters: {
            time_range: !!searchArgs.time_range,
            force_refresh: !!searchArgs.force_refresh,
            cursor_pagination: !!searchArgs.cursor,
            offset_pagination: !!searchArgs.offset,
          },
        },
      };

      // Return unified response
      return this.createUnifiedResponse(unifiedResponseData);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          error.timeoutMs
        );
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
  description =
    'Search target lists (convenience wrapper with client-side filtering): reads GET /v2/target-lists, sending owner if given (without it, the global and Firewalla-managed lists), and applies the query locally.';
  category = 'search' as const;

  constructor() {
    // Enable field normalization for target lists (no geographic enrichment needed)
    super({
      enableGeoEnrichment: false, // Target lists don't typically contain IP addresses
      enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
      additionalMeta: {
        data_source: 'target_lists',
        entity_type: 'target_lists',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

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
        'target_lists',
        100
      );

      if (!validation.isValid) {
        return validation.response;
      }

      // Sent to the API as its owner filter
      const ownerValidation = ParameterValidator.validateOptionalString(
        searchArgs.owner,
        'owner'
      );
      if (!ownerValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Owner parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          ownerValidation.errors
        );
      }

      const searchTools = createSearchTools(firewalla);
      const searchParams: SearchParams = {
        query: searchArgs.query,
        limit: validation.limit,
        offset: searchArgs.offset,
        cursor: searchArgs.cursor,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
        owner: ownerValidation.sanitizedValue as string | undefined,
      };

      const result = await withToolTimeout(
        async () => searchTools.search_target_lists(searchParams),
        this.name
      );

      // Create unified response with standardized target list data
      const unifiedResponseData = {
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
            // The targets' length, else the API's count: it sends no
            // targets for Firewalla-managed lists
            entry_count: targetListEntryCount(list),
          })
        ),
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
        aggregations: SafeAccess.getNestedValue(
          result as any,
          'aggregations',
          null
        ),
        query_info: {
          original_query: searchArgs.query,
          // The query the lists were matched against, as query_executed
          final_query: SafeAccess.getNestedValue(result as any, 'query', ''),
          applied_filters: {
            grouping: !!searchArgs.group_by,
            sorting: !!searchArgs.sort_by,
            aggregation: !!searchArgs.aggregate,
          },
        },
      };

      // Return unified response
      return this.createUnifiedResponse(unifiedResponseData);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          error.timeoutMs
        );
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
