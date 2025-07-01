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
} from '../../types.js';
import { SafeAccess } from '../../validation/error-handler.js';
import { createSearchTools } from '../search.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';
import type { SearchParams } from '../../search/types.js';
import type { ScoringCorrelationParams } from '../../validation/field-mapper.js';
import { ResponseStandardizer, BackwardCompatibilityLayer } from '../../utils/response-standardizer.js';
import { shouldUseLegacyFormat } from '../../config/response-config.js';
import type { SearchMetadata } from '../../types/standard-responses.js';

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
}

// Search argument interfaces for type safety
export interface SearchFlowsArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
}

export interface SearchAlarmsArgs extends BaseSearchArgs {
  time_range?: {
    start?: string;
    end?: string;
  };
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

export interface SearchFlowsByGeographyArgs extends ToolArgs {
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

export class SearchFlowsHandler extends BaseToolHandler {
  name = 'search_flows';
  description = 'Advanced flow searching with complex query syntax';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchFlowsArgs;
    const startTime = Date.now();
    
    try {
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
      };
      const result = await searchTools.search_flows(searchParams);
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
          destination_ip: SafeAccess.getNestedValue(
            flow as any,
            'destination.ip',
            'unknown'
          ),
          protocol: SafeAccess.getNestedValue(
            flow as any,
            'protocol',
            'unknown'
          ),
          // bytes field is calculated as total traffic: download + upload
          bytes:
            (SafeAccess.getNestedValue(
              flow as any,
              'download',
              0
            ) as number) +
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
        query: SafeAccess.getNestedValue(result as any, 'query', searchArgs.query || '') as string,
        entityType: 'flows',
        executionTime: SafeAccess.getNestedValue(result as any, 'execution_time_ms', executionTime) as number,
        cached: false, // TODO: Detect from result if available
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(result as any, 'aggregations', null) as Record<string, any> | undefined
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(processedFlows, metadata);

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(standardResponse, this.name);
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search flows: ${errorMessage}`
      );
    }
  }
}

export class SearchAlarmsHandler extends BaseToolHandler {
  name = 'search_alarms';
  description = 'Advanced alarm searching with severity, time, and IP filters';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchAlarmsArgs;
    const startTime = Date.now();
    
    try {
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
      };
      const result = await searchTools.search_alarms(searchParams);
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
          status: SafeAccess.getNestedValue(
            alarm as any,
            'status',
            'unknown'
          ),
          severity: SafeAccess.getNestedValue(
            alarm as any,
            'severity',
            'unknown'
          ),
        })
      );

      // Create metadata for standardized response
      const metadata: SearchMetadata = {
        query: SafeAccess.getNestedValue(result as any, 'query', searchArgs.query || '') as string,
        entityType: 'alarms',
        executionTime: SafeAccess.getNestedValue(result as any, 'execution_time_ms', executionTime) as number,
        cached: false,
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(result as any, 'aggregations', null) as Record<string, any> | undefined
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(processedAlarms, metadata);

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(standardResponse, this.name);
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search alarms: ${errorMessage}`
      );
    }
  }
}

export class SearchRulesHandler extends BaseToolHandler {
  name = 'search_rules';
  description =
    'Advanced rule searching with target, action, and status filters';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchRulesArgs;
    const startTime = Date.now();
    
    try {
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
      const result = await searchTools.search_rules(searchParams);
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
        query: SafeAccess.getNestedValue(result as any, 'query', searchArgs.query || '') as string,
        entityType: 'rules',
        executionTime: SafeAccess.getNestedValue(result as any, 'execution_time_ms', executionTime) as number,
        cached: false,
        cursor: (result as any).next_cursor,
        hasMore: !!(result as any).next_cursor,
        limit: searchArgs.limit,
        aggregations: SafeAccess.getNestedValue(result as any, 'aggregations', null) as Record<string, any> | undefined
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toSearchResponse(processedRules, metadata);

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse = BackwardCompatibilityLayer.toLegacySearchFormat(standardResponse, this.name);
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search rules: ${errorMessage}`
      );
    }
  }
}

export class SearchDevicesHandler extends BaseToolHandler {
  name = 'search_devices';
  description =
    'Advanced device searching with network, status, and usage filters';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchDevicesArgs;
    try {
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
      };
      const result = await searchTools.search_devices(searchParams);

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search devices: ${errorMessage}`
      );
    }
  }
}

export class SearchTargetListsHandler extends BaseToolHandler {
  name = 'search_target_lists';
  description =
    'Advanced target list searching with category and ownership filters';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchTargetListsArgs;
    try {
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
      const result = await searchTools.search_target_lists(searchParams);

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search target lists: ${errorMessage}`
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
      const result = await searchTools.search_cross_reference({
        primary_query: searchArgs.primary_query,
        secondary_queries: searchArgs.secondary_queries,
        correlation_field: searchArgs.correlation_field,
        limit: searchArgs.limit,
      });

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
      const result = await searchTools.search_enhanced_cross_reference({
        primary_query: searchArgs.primary_query,
        secondary_queries: searchArgs.secondary_queries,
        correlation_params: searchArgs.correlation_params,
        limit: searchArgs.limit,
      });

      return this.createSuccessResponse({
        primary_query: SafeAccess.getNestedValue(result, 'primary_query', ''),
        secondary_queries: SafeAccess.getNestedValue(
          result,
          'secondary_queries',
          []
        ),
        correlation_fields: SafeAccess.getNestedValue(
          result,
          'correlation_fields',
          []
        ),
        correlation_type: SafeAccess.getNestedValue(
          result,
          'correlation_type',
          'AND'
        ),
        primary_results: SafeAccess.getNestedValue(
          result,
          'primary_results',
          0
        ),
        correlated_results: SafeAccess.getNestedValue(
          result,
          'correlated_results',
          0
        ),
        correlation_stats: SafeAccess.getNestedValue(
          result,
          'correlation_stats',
          {}
        ),
        temporal_filter_applied: SafeAccess.getNestedValue(
          result,
          'temporal_filter_applied',
          false
        ),
        execution_time_ms: SafeAccess.getNestedValue(
          result,
          'execution_time_ms',
          0
        ),
        results: SafeAccess.safeArrayMap(result.results, (item: any) => ({
          entity_type: SafeAccess.getNestedValue(
            item,
            'entity_type',
            'unknown'
          ),
          correlation_strength: SafeAccess.getNestedValue(
            item,
            'correlation_strength',
            0
          ),
          matched_fields: SafeAccess.getNestedValue(item, 'matched_fields', []),
          data: SafeAccess.getNestedValue(item, 'data', {}),
        })),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to execute enhanced cross reference search: ${errorMessage}`
      );
    }
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
      const result = await searchTools.get_correlation_suggestions({
        primary_query: searchArgs.primary_query,
        secondary_queries: searchArgs.secondary_queries,
      });

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get correlation suggestions: ${errorMessage}`
      );
    }
  }
}

export class SearchFlowsByGeographyHandler extends BaseToolHandler {
  name = 'search_flows_by_geography';
  description =
    'Advanced geographic flow search with location-based filtering and analysis';
  category = 'search' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const searchArgs = args as SearchFlowsByGeographyArgs;
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_flows_by_geography({
        query: searchArgs.query,
        geographic_filters: searchArgs.geographic_filters,
        limit: searchArgs.limit,
        sort_by: searchArgs.sort_by,
        sort_order: searchArgs.sort_order,
        group_by: searchArgs.group_by,
        aggregate: searchArgs.aggregate,
      });

      return this.createSuccessResponse({
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        count: SafeAccess.safeArrayAccess(result.results, arr => arr.length, 0),
        geographic_analysis: {
          total_flows: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.total_flows',
            0
          ),
          unique_countries: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.unique_countries',
            0
          ),
          unique_continents: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.unique_continents',
            0
          ),
          cloud_provider_flows: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.cloud_provider_flows',
            0
          ),
          vpn_flows: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.vpn_flows',
            0
          ),
          high_risk_flows: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.high_risk_flows',
            0
          ),
          top_countries: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.top_countries',
            {}
          ),
          top_asns: SafeAccess.getNestedValue(
            result,
            'geographic_analysis.top_asns',
            {}
          ),
        },
        flows: SafeAccess.safeArrayMap(result.results, (flow: Flow) => ({
          timestamp: unixToISOStringOrNow(flow.ts),
          source_ip: SafeAccess.getNestedValue(
            flow as any,
            'source.ip',
            'unknown'
          ),
          destination_ip: SafeAccess.getNestedValue(
            flow as any,
            'destination.ip',
            'unknown'
          ),
          protocol: SafeAccess.getNestedValue(
            flow as any,
            'protocol',
            'unknown'
          ),
          bytes: SafeAccess.getNestedValue(flow as any, 'bytes', 0),
          geographic_data: {
            country: SafeAccess.getNestedValue(
              flow as any,
              'geo.country',
              'unknown'
            ),
            continent: SafeAccess.getNestedValue(
              flow as any,
              'geo.continent',
              'unknown'
            ),
            city: SafeAccess.getNestedValue(flow as any, 'geo.city', 'unknown'),
            asn: SafeAccess.getNestedValue(flow as any, 'geo.asn', 'unknown'),
            is_cloud: SafeAccess.getNestedValue(
              flow as any,
              'geo.isCloud',
              false
            ),
            is_vpn: SafeAccess.getNestedValue(flow as any, 'geo.isVPN', false),
            risk_score: SafeAccess.getNestedValue(
              flow as any,
              'geo.riskScore',
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to search flows by geography: ${errorMessage}`
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
      const result = await searchTools.search_alarms_by_geography({
        query: searchArgs.query,
        geographic_filters: searchArgs.geographic_filters,
        limit: searchArgs.limit,
        sort_by: searchArgs.sort_by,
        group_by: searchArgs.group_by,
      });

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
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.get_geographic_statistics({
        entity_type: searchArgs.entity_type,
        time_range: searchArgs.time_range,
        analysis_type: searchArgs.analysis_type,
        group_by: searchArgs.group_by,
        limit: searchArgs.limit,
      });

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get geographic statistics: ${errorMessage}`
      );
    }
  }
}
