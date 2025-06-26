/**
 * Advanced search tool handlers
 */

import { BaseToolHandler, ToolArgs, ToolResponse } from './base.js';
import { FirewallaClient } from '../../firewalla/client.js';
import { SafeAccess } from '../../validation/error-handler.js';
import { createSearchTools } from '../search.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';

export class SearchFlowsHandler extends BaseToolHandler {
  name = 'search_flows';
  description = 'Advanced flow searching with complex query syntax';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_flows(args as any);
      
      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        flows: SafeAccess.safeArrayMap(
          result.results,
          (flow: any) => ({
            timestamp: unixToISOStringOrNow(flow.ts),
            source_ip: SafeAccess.getNestedValue(flow, 'source.ip', 'unknown'),
            destination_ip: SafeAccess.getNestedValue(flow, 'destination.ip', 'unknown'),
            protocol: SafeAccess.getNestedValue(flow, 'protocol', 'unknown'),
            bytes: (SafeAccess.getNestedValue(flow, 'download', 0)) + (SafeAccess.getNestedValue(flow, 'upload', 0)),
            blocked: SafeAccess.getNestedValue(flow, 'block', false),
            direction: SafeAccess.getNestedValue(flow, 'direction', 'unknown'),
            device: SafeAccess.getNestedValue(flow, 'device', {})
          })
        ),
        aggregations: SafeAccess.getNestedValue(result, 'aggregations', null)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search flows: ${errorMessage}`);
    }
  }
}

export class SearchAlarmsHandler extends BaseToolHandler {
  name = 'search_alarms';
  description = 'Advanced alarm searching with severity, time, and IP filters';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_alarms(args as any);
      
      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        alarms: SafeAccess.safeArrayMap(
          result.results,
          (alarm: any) => ({
            timestamp: unixToISOStringOrNow(alarm.ts),
            type: SafeAccess.getNestedValue(alarm, 'type', 'unknown'),
            message: SafeAccess.getNestedValue(alarm, 'message', 'No message'),
            direction: SafeAccess.getNestedValue(alarm, 'direction', 'unknown'),
            protocol: SafeAccess.getNestedValue(alarm, 'protocol', 'unknown'),
            status: SafeAccess.getNestedValue(alarm, 'status', 'unknown'),
            severity: SafeAccess.getNestedValue(alarm, 'severity', 'unknown')
          })
        ),
        aggregations: SafeAccess.getNestedValue(result, 'aggregations', null)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search alarms: ${errorMessage}`);
    }
  }
}

export class SearchRulesHandler extends BaseToolHandler {
  name = 'search_rules';
  description = 'Advanced rule searching with target, action, and status filters';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_rules(args as any);
      
      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        rules: SafeAccess.safeArrayMap(
          result.results,
          (rule: any) => ({
            id: SafeAccess.getNestedValue(rule, 'id', 'unknown'),
            action: SafeAccess.getNestedValue(rule, 'action', 'unknown'),
            target_type: SafeAccess.getNestedValue(rule, 'target.type', 'unknown'),
            target_value: SafeAccess.getNestedValue(rule, 'target.value', 'unknown'),
            direction: SafeAccess.getNestedValue(rule, 'direction', 'unknown'),
            status: SafeAccess.getNestedValue(rule, 'status', 'unknown'),
            hit_count: SafeAccess.getNestedValue(rule, 'hit.count', 0)
          })
        ),
        aggregations: SafeAccess.getNestedValue(result, 'aggregations', null)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search rules: ${errorMessage}`);
    }
  }
}

export class SearchDevicesHandler extends BaseToolHandler {
  name = 'search_devices';
  description = 'Advanced device searching with network, status, and usage filters';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_devices(args as any);
      
      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        devices: SafeAccess.safeArrayMap(
          result.results,
          (device: any) => ({
            id: SafeAccess.getNestedValue(device, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(device, 'name', 'Unknown Device'),
            ip: SafeAccess.getNestedValue(device, 'ip', 'unknown'),
            online: SafeAccess.getNestedValue(device, 'online', false),
            macVendor: SafeAccess.getNestedValue(device, 'macVendor', 'unknown'),
            lastSeen: SafeAccess.getNestedValue(device, 'lastSeen', 0)
          })
        ),
        aggregations: SafeAccess.getNestedValue(result, 'aggregations', null)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search devices: ${errorMessage}`);
    }
  }
}

export class SearchTargetListsHandler extends BaseToolHandler {
  name = 'search_target_lists';
  description = 'Advanced target list searching with category and ownership filters';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_target_lists(args as any);
      
      return this.createSuccessResponse({
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        target_lists: SafeAccess.safeArrayMap(
          result.results,
          (list: any) => ({
            id: SafeAccess.getNestedValue(list, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(list, 'name', 'Unknown List'),
            category: SafeAccess.getNestedValue(list, 'category', 'unknown'),
            owner: SafeAccess.getNestedValue(list, 'owner', 'unknown'),
            entry_count: SafeAccess.safeArrayAccess(list.targets, (arr) => arr.length, 0)
          })
        ),
        aggregations: SafeAccess.getNestedValue(result, 'aggregations', null)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search target lists: ${errorMessage}`);
    }
  }
}

export class SearchCrossReferenceHandler extends BaseToolHandler {
  name = 'search_cross_reference';
  description = 'Multi-entity searches with correlation across different data types';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_cross_reference(args as any);
      
      return this.createSuccessResponse({
        primary_query: SafeAccess.getNestedValue(result, 'primary.query', ''),
        primary_results: SafeAccess.getNestedValue(result, 'primary.count', 0),
        correlations: SafeAccess.safeArrayMap(
          result.correlations,
          (corr: any) => ({
            query: SafeAccess.getNestedValue(corr, 'query', ''),
            matches: SafeAccess.getNestedValue(corr, 'count', 0),
            correlation_field: SafeAccess.getNestedValue(corr, 'correlation_field', '')
          })
        ),
        correlation_summary: SafeAccess.getNestedValue(result, 'correlation_summary', {}),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search cross reference: ${errorMessage}`);
    }
  }
}

export class SearchEnhancedCrossReferenceHandler extends BaseToolHandler {
  name = 'search_enhanced_cross_reference';
  description = 'Advanced multi-field correlation with temporal windows and network scoping';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_enhanced_cross_reference(args as any);
      
      return this.createSuccessResponse({
        primary_query: SafeAccess.getNestedValue(result, 'primary_query', ''),
        secondary_queries: SafeAccess.getNestedValue(result, 'secondary_queries', []),
        correlation_fields: SafeAccess.getNestedValue(result, 'correlation_fields', []),
        correlation_type: SafeAccess.getNestedValue(result, 'correlation_type', 'AND'),
        primary_results: SafeAccess.getNestedValue(result, 'primary_results', 0),
        correlated_results: SafeAccess.getNestedValue(result, 'correlated_results', 0),
        correlation_stats: SafeAccess.getNestedValue(result, 'correlation_stats', {}),
        temporal_filter_applied: SafeAccess.getNestedValue(result, 'temporal_filter_applied', false),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
        results: SafeAccess.safeArrayMap(
          result.results,
          (item: any) => ({
            entity_type: SafeAccess.getNestedValue(item, 'entity_type', 'unknown'),
            correlation_strength: SafeAccess.getNestedValue(item, 'correlation_strength', 0),
            matched_fields: SafeAccess.getNestedValue(item, 'matched_fields', []),
            data: SafeAccess.getNestedValue(item, 'data', {})
          })
        )
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to execute enhanced cross reference search: ${errorMessage}`);
    }
  }
}

export class GetCorrelationSuggestionsHandler extends BaseToolHandler {
  name = 'get_correlation_suggestions';
  description = 'Get intelligent field combination recommendations for cross-reference searches';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.get_correlation_suggestions(args as any);
      
      return this.createSuccessResponse({
        entity_types: SafeAccess.getNestedValue(result, 'entity_types', []),
        suggested_combinations: SafeAccess.safeArrayMap(
          result.combinations,
          (combo: any) => ({
            fields: SafeAccess.getNestedValue(combo, 'fields', []),
            description: SafeAccess.getNestedValue(combo, 'description', ''),
            compatibility_score: SafeAccess.getNestedValue(combo, 'compatibility_score', 0),
            performance_rating: SafeAccess.getNestedValue(combo, 'performance_rating', 'unknown'),
            use_cases: SafeAccess.getNestedValue(combo, 'use_cases', [])
          })
        ),
        common_patterns: SafeAccess.safeArrayMap(
          result.patterns,
          (pattern: any) => ({
            name: SafeAccess.getNestedValue(pattern, 'name', ''),
            fields: SafeAccess.getNestedValue(pattern, 'fields', []),
            description: SafeAccess.getNestedValue(pattern, 'description', '')
          })
        ),
        field_compatibility_matrix: SafeAccess.getNestedValue(result, 'compatibility_matrix', {}),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get correlation suggestions: ${errorMessage}`);
    }
  }
}

export class SearchFlowsByGeographyHandler extends BaseToolHandler {
  name = 'search_flows_by_geography';
  description = 'Advanced geographic flow search with location-based filtering and analysis';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_flows_by_geography(args as any);
      
      return this.createSuccessResponse({
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        geographic_analysis: {
          total_flows: SafeAccess.getNestedValue(result, 'geographic_analysis.total_flows', 0),
          unique_countries: SafeAccess.getNestedValue(result, 'geographic_analysis.unique_countries', 0),
          unique_continents: SafeAccess.getNestedValue(result, 'geographic_analysis.unique_continents', 0),
          cloud_provider_flows: SafeAccess.getNestedValue(result, 'geographic_analysis.cloud_provider_flows', 0),
          vpn_flows: SafeAccess.getNestedValue(result, 'geographic_analysis.vpn_flows', 0),
          high_risk_flows: SafeAccess.getNestedValue(result, 'geographic_analysis.high_risk_flows', 0),
          top_countries: SafeAccess.getNestedValue(result, 'geographic_analysis.top_countries', {}),
          top_asns: SafeAccess.getNestedValue(result, 'geographic_analysis.top_asns', {})
        },
        flows: SafeAccess.safeArrayMap(
          result.results,
          (flow: any) => ({
            timestamp: unixToISOStringOrNow(flow.ts),
            source_ip: SafeAccess.getNestedValue(flow, 'source.ip', 'unknown'),
            destination_ip: SafeAccess.getNestedValue(flow, 'destination.ip', 'unknown'),
            protocol: SafeAccess.getNestedValue(flow, 'protocol', 'unknown'),
            bytes: SafeAccess.getNestedValue(flow, 'bytes', 0),
            geographic_data: {
              country: SafeAccess.getNestedValue(flow, 'geo.country', 'unknown'),
              continent: SafeAccess.getNestedValue(flow, 'geo.continent', 'unknown'),
              city: SafeAccess.getNestedValue(flow, 'geo.city', 'unknown'),
              asn: SafeAccess.getNestedValue(flow, 'geo.asn', 'unknown'),
              is_cloud: SafeAccess.getNestedValue(flow, 'geo.isCloud', false),
              is_vpn: SafeAccess.getNestedValue(flow, 'geo.isVPN', false),
              risk_score: SafeAccess.getNestedValue(flow, 'geo.riskScore', 0)
            }
          })
        ),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search flows by geography: ${errorMessage}`);
    }
  }
}

export class SearchAlarmsByGeographyHandler extends BaseToolHandler {
  name = 'search_alarms_by_geography';
  description = 'Geographic alarm search with location-based threat analysis';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.search_alarms_by_geography(args as any);
      
      return this.createSuccessResponse({
        query_executed: SafeAccess.getNestedValue(result, 'query', ''),
        count: SafeAccess.safeArrayAccess(result.results, (arr) => arr.length, 0),
        geographic_threat_analysis: SafeAccess.getNestedValue(result, 'geographic_threat_analysis', null) ? {
          total_alarms: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.total_alarms', 0),
          high_risk_countries: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.high_risk_countries', {}),
          threat_by_continent: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.threat_by_continent', {}),
          suspicious_asns: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.suspicious_asns', {}),
          cloud_threats: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.cloud_threats', 0),
          vpn_threats: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.vpn_threats', 0),
          proxy_threats: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.proxy_threats', 0),
          risk_distribution: SafeAccess.getNestedValue(result, 'geographic_threat_analysis.risk_distribution', {})
        } : null,
        alarms: SafeAccess.safeArrayMap(
          result.results,
          (alarm: any) => ({
            timestamp: unixToISOStringOrNow(alarm.ts),
            type: SafeAccess.getNestedValue(alarm, 'type', 'unknown'),
            severity: SafeAccess.getNestedValue(alarm, 'severity', 'unknown'),
            message: SafeAccess.getNestedValue(alarm, 'message', 'No message'),
            geographic_data: {
              country: SafeAccess.getNestedValue(alarm, 'remote.country', 'unknown'),
              continent: SafeAccess.getNestedValue(alarm, 'remote.continent', 'unknown'),
              city: SafeAccess.getNestedValue(alarm, 'remote.city', 'unknown'),
              asn: SafeAccess.getNestedValue(alarm, 'remote.asn', 'unknown'),
              is_cloud: SafeAccess.getNestedValue(alarm, 'remote.cloud', false),
              is_vpn: SafeAccess.getNestedValue(alarm, 'remote.vpn', false),
              risk_score: SafeAccess.getNestedValue(alarm, 'remote.geoRisk', 0)
            }
          })
        ),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to search alarms by geography: ${errorMessage}`);
    }
  }
}

export class GetGeographicStatisticsHandler extends BaseToolHandler {
  name = 'get_geographic_statistics';
  description = 'Comprehensive geographic statistics and analytics for flows and alarms';
  category = 'search' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const searchTools = createSearchTools(firewalla);
      const result = await searchTools.get_geographic_statistics(args as any);
      
      return this.createSuccessResponse({
        entity_type: SafeAccess.getNestedValue(result, 'entity_type', 'unknown'),
        group_by: SafeAccess.getNestedValue(result, 'group_by', 'country'),
        analysis_type: SafeAccess.getNestedValue(result, 'analysis_type', 'summary'),
        total_records: SafeAccess.getNestedValue(result, 'total_records', 0),
        statistics: {
          summary: SafeAccess.getNestedValue(result, 'statistics.summary', {}),
          distribution: SafeAccess.getNestedValue(result, 'statistics.distribution', {}),
          insights: SafeAccess.getNestedValue(result, 'statistics.insights', [])
        },
        time_range: SafeAccess.getNestedValue(result, 'time_range', null),
        execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get geographic statistics: ${errorMessage}`);
    }
  }
}