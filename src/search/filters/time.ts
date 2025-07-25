/**
 * Time Range Filter Implementation
 * Handles timestamp-based filtering for flows, alarms, and rules
 */

import type {
  QueryNode,
  FieldQuery,
  RangeQuery,
  ComparisonQuery,
} from '../types.js';
import { BaseFilter, type FilterContext, type FilterResult } from './base.js';
import { unixToISOString } from '../../utils/timestamp.js';

export class TimeRangeFilter extends BaseFilter {
  readonly name = 'time_range';

  private readonly timeFields = [
    'timestamp',
    'ts',
    'created_at',
    'updated_at',
    'last_updated',
    'lastSeen',
  ];

  canHandle(node: QueryNode): boolean {
    if (
      node.type === 'field' ||
      node.type === 'range' ||
      node.type === 'comparison'
    ) {
      return this.timeFields.includes(node.field);
    }
    return false;
  }

  apply(node: QueryNode, context: FilterContext): FilterResult {
    switch (node.type) {
      case 'field': {
        return this.handleFieldQuery(node, context);
      }
      case 'range': {
        return this.handleRangeQuery(node, context);
      }
      case 'comparison': {
        return this.handleComparisonQuery(node, context);
      }
      case 'logical':
      case 'group':
      case 'wildcard': {
        // These node types are not handled by time filter
        return { apiParams: {} };
      }
      default: {
        return { apiParams: {} };
      }
    }
  }

  /**
   * Standardized time margin for timestamp matching (30 seconds)
   *
   * This margin is used consistently across both API-level filtering and
   * post-processing to ensure identical behavior regardless of where
   * the filtering occurs. The 30-second value provides a reasonable
   * balance between accuracy and flexibility while accounting for:
   *
   * - Network latency between client and Firewalla API (typically <5s)
   * - Clock synchronization differences between systems (typically <10s)
   * - Timestamp precision variations (seconds vs milliseconds)
   * - Small delays in data processing pipelines (<15s)
   *
   * Using a consistent value prevents subtle bugs where the same query
   * might return different results for different entity types based on
   * whether they support API-level time filtering or require post-processing.
   *
   * Note: Previously used inconsistent values (10s for API, 60s for post-processing)
   * which caused discrepancies. Standardized to 30s for optimal balance.
   */
  private readonly STANDARD_TIME_MARGIN = 30; // seconds

  private handleFieldQuery(
    node: FieldQuery,
    context: FilterContext
  ): FilterResult {
    const timestamp = this.parseTimestamp(node.value);
    if (timestamp === null) {
      return { apiParams: {} };
    }

    // For exact timestamp matches, use a configurable small range
    const margin = context.timeMargin || this.STANDARD_TIME_MARGIN;
    return {
      apiParams: this.buildTimeParams(
        timestamp - margin,
        timestamp + margin,
        context
      ),
      cacheKeyComponent: this.createCacheKey(node),
    };
  }

  private handleRangeQuery(
    node: RangeQuery,
    context: FilterContext
  ): FilterResult {
    const minTime = node.min ? this.parseTimestamp(node.min) : null;
    const maxTime = node.max ? this.parseTimestamp(node.max) : null;

    return {
      apiParams: this.buildTimeParams(minTime, maxTime, context),
      cacheKeyComponent: this.createCacheKey(node),
    };
  }

  private handleComparisonQuery(
    node: ComparisonQuery,
    context: FilterContext
  ): FilterResult {
    const timestamp = this.parseTimestamp(node.value);
    if (timestamp === null) {
      return { apiParams: {} };
    }

    let minTime: number | null = null;
    let maxTime: number | null = null;

    switch (node.operator) {
      case '>': {
        minTime = timestamp + 1;
        break;
      }
      case '>=': {
        minTime = timestamp;
        break;
      }
      case '<': {
        maxTime = timestamp - 1;
        break;
      }
      case '<=': {
        maxTime = timestamp;
        break;
      }
    }

    return {
      apiParams: this.buildTimeParams(minTime, maxTime, context),
      cacheKeyComponent: this.createCacheKey(node),
    };
  }

  private buildTimeParams(
    minTime: number | null,
    maxTime: number | null,
    context: FilterContext
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Different entities use different parameter names
    switch (context.entityType) {
      case 'flows': {
        if (minTime) {
          params.start_time = unixToISOString(minTime);
        }
        if (maxTime) {
          params.end_time = unixToISOString(maxTime);
        }
        break;
      }

      case 'alarms': {
        if (minTime) {
          params.since = minTime;
        }
        if (maxTime) {
          params.until = maxTime;
        }
        break;
      }

      case 'rules': {
        // Rules API might not support time filtering directly
        // Will need post-processing
        break;
      }

      case 'devices': {
        // Device API doesn't typically support time filtering
        break;
      }

      case 'target_lists': {
        // Target lists might filter by last_updated
        if (minTime) {
          params.updated_since = minTime;
        }
        break;
      }
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
        if (timestamp === null) {
          return true;
        } // Keep items without timestamps

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
        if (parsed !== null) {
          return parsed;
        }
      }
    }
    return null;
  }

  private matchesTimeCondition(timestamp: number, node: QueryNode): boolean {
    switch (node.type) {
      case 'field': {
        const targetTime = this.parseTimestamp(node.value);
        return Boolean(
          targetTime &&
            Math.abs(timestamp - targetTime) <= this.STANDARD_TIME_MARGIN
        );
      }

      case 'range': {
        const rangeNode = node;
        const min = rangeNode.min ? this.parseTimestamp(rangeNode.min) : null;
        const max = rangeNode.max ? this.parseTimestamp(rangeNode.max) : null;

        if (min && timestamp < min) {
          return false;
        }
        if (max && timestamp > max) {
          return false;
        }
        return true;
      }

      case 'comparison': {
        const compNode = node;
        const compTime = this.parseTimestamp(compNode.value);
        if (!compTime) {
          return false;
        }

        switch (compNode.operator) {
          case '>': {
            return timestamp > compTime;
          }
          case '>=': {
            return timestamp >= compTime;
          }
          case '<': {
            return timestamp < compTime;
          }
          case '<=': {
            return timestamp <= compTime;
          }
          default: {
            return false;
          }
        }
      }

      case 'group':
      case 'logical':
      case 'wildcard':
        // These node types are not applicable for time-based filtering
        return false;

      default:
        return false;
    }
  }

  getOptimizations() {
    return [
      {
        type: 'index' as const,
        priority: 10,
        description: 'Time-based queries can use timestamp indexes',
        condition: (context: FilterContext) =>
          context.entityType === 'flows' || context.entityType === 'alarms',
      },
      {
        type: 'pushdown' as const,
        priority: 8,
        description:
          'Time filters should be applied at API level when possible',
        condition: (context: FilterContext) => context.entityType !== 'rules',
      },
    ];
  }
}
