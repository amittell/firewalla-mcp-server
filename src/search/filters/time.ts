/**
 * Time Range Filter Implementation
 * Handles timestamp-based filtering for flows, alarms, and rules
 */

import { QueryNode, FieldQuery, RangeQuery, ComparisonQuery } from '../types.js';
import { BaseFilter, FilterContext, FilterResult } from './base.js';

export class TimeRangeFilter extends BaseFilter {
  readonly name = 'time_range';

  private readonly timeFields = [
    'timestamp', 'ts', 'created_at', 'updated_at', 'last_updated', 'lastSeen'
  ];

  canHandle(node: QueryNode): boolean {
    if (node.type === 'field' || node.type === 'range' || node.type === 'comparison') {
      return this.timeFields.includes(node.field);
    }
    return false;
  }

  apply(node: QueryNode, context: FilterContext): FilterResult {
    switch (node.type) {
      case 'field':
        return this.handleFieldQuery(node as FieldQuery, context);
      case 'range':
        return this.handleRangeQuery(node as RangeQuery, context);
      case 'comparison':
        return this.handleComparisonQuery(node as ComparisonQuery, context);
      default:
        return { apiParams: {} };
    }
  }

  private handleFieldQuery(node: FieldQuery, context: FilterContext): FilterResult {
    const timestamp = this.parseTimestamp(node.value);
    if (timestamp === null) {
      return { apiParams: {} };
    }

    // For exact timestamp matches, use a small range (±1 minute)
    const margin = 60; // 1 minute
    return {
      apiParams: this.buildTimeParams(timestamp - margin, timestamp + margin, context),
      cacheKeyComponent: this.createCacheKey(node)
    };
  }

  private handleRangeQuery(node: RangeQuery, context: FilterContext): FilterResult {
    const minTime = node.min ? this.parseTimestamp(node.min) : null;
    const maxTime = node.max ? this.parseTimestamp(node.max) : null;

    return {
      apiParams: this.buildTimeParams(minTime, maxTime, context),
      cacheKeyComponent: this.createCacheKey(node)
    };
  }

  private handleComparisonQuery(node: ComparisonQuery, context: FilterContext): FilterResult {
    const timestamp = this.parseTimestamp(node.value);
    if (timestamp === null) {
      return { apiParams: {} };
    }

    let minTime: number | null = null;
    let maxTime: number | null = null;

    switch (node.operator) {
      case '>':
        minTime = timestamp + 1;
        break;
      case '>=':
        minTime = timestamp;
        break;
      case '<':
        maxTime = timestamp - 1;
        break;
      case '<=':
        maxTime = timestamp;
        break;
    }

    return {
      apiParams: this.buildTimeParams(minTime, maxTime, context),
      cacheKeyComponent: this.createCacheKey(node)
    };
  }

  private buildTimeParams(minTime: number | null, maxTime: number | null, context: FilterContext): Record<string, any> {
    const params: Record<string, any> = {};

    // Different entities use different parameter names
    switch (context.entityType) {
      case 'flows':
        if (minTime) params.start_time = new Date(minTime * 1000).toISOString();
        if (maxTime) params.end_time = new Date(maxTime * 1000).toISOString();
        break;
      
      case 'alarms':
        if (minTime) params.since = minTime;
        if (maxTime) params.until = maxTime;
        break;
      
      case 'rules':
        // Rules API might not support time filtering directly
        // Will need post-processing
        break;
      
      case 'devices':
        // Device API doesn't typically support time filtering
        break;
      
      case 'target_lists':
        // Target lists might filter by last_updated
        if (minTime) params.updated_since = minTime;
        break;
    }

    return params;
  }

  /**
   * Create post-processing filter for entities that don't support API-level time filtering
   */
  createPostProcessingFilter(node: QueryNode): (items: any[]) => any[] {
    return (items: any[]) => {
      return items.filter(item => {
        const timestamp = this.extractTimestamp(item);
        if (timestamp === null) return true; // Keep items without timestamps

        return this.matchesTimeCondition(timestamp, node);
      });
    };
  }

  private extractTimestamp(item: any): number | null {
    // Try different timestamp fields
    for (const field of this.timeFields) {
      const value = this.getNestedValue(item, field);
      if (value) {
        const parsed = this.parseTimestamp(value);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  private matchesTimeCondition(timestamp: number, node: QueryNode): boolean {
    switch (node.type) {
      case 'field':
        const targetTime = this.parseTimestamp((node as FieldQuery).value);
        return targetTime ? Math.abs(timestamp - targetTime) <= 60 : false;

      case 'range':
        const rangeNode = node as RangeQuery;
        const min = rangeNode.min ? this.parseTimestamp(rangeNode.min) : null;
        const max = rangeNode.max ? this.parseTimestamp(rangeNode.max) : null;
        
        if (min && timestamp < min) return false;
        if (max && timestamp > max) return false;
        return true;

      case 'comparison':
        const compNode = node as ComparisonQuery;
        const compTime = this.parseTimestamp(compNode.value);
        if (!compTime) return false;

        switch (compNode.operator) {
          case '>': return timestamp > compTime;
          case '>=': return timestamp >= compTime;
          case '<': return timestamp < compTime;
          case '<=': return timestamp <= compTime;
          default: return false;
        }
    }
    return false;
  }

  getOptimizations() {
    return [
      {
        type: 'index' as const,
        priority: 10,
        description: 'Time-based queries can use timestamp indexes',
        condition: (context: FilterContext) => context.entityType === 'flows' || context.entityType === 'alarms'
      },
      {
        type: 'pushdown' as const,
        priority: 8,
        description: 'Time filters should be applied at API level when possible',
        condition: (context: FilterContext) => context.entityType !== 'rules'
      }
    ];
  }
}