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