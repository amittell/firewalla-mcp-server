/**
 * @fileoverview Cache Strategies for Firewalla MCP Server
 *
 * Provides data-specific caching strategies with optimized TTL values based on
 * data volatility and access patterns. Implements intelligent cache invalidation
 * triggers and background refresh configuration for different entity types.
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import { logger } from '../monitoring/logger.js';

/**
 * Cache strategy configuration for specific data types
 */
export interface CacheStrategy {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Function to generate consistent cache keys */
  keyGenerator: (...args: any[]) => string;
  /** Events that should trigger cache invalidation */
  invalidationEvents: string[];
  /** Threshold (0.0-1.0) for background refresh trigger */
  refreshThreshold: number;
  /** Enable background refresh for this data type */
  backgroundRefresh: boolean;
  /** Enable compression for large data sets */
  compressionEnabled?: boolean;
  /** Custom cache key prefix */
  keyPrefix?: string;
}

/**
 * Entity types supported by the cache system
 */
export type EntityType = 'alarms' | 'flows' | 'devices' | 'rules' | 'target_lists' | 'boxes' | 'search' | 'statistics' | 'trends';

/**
 * Data-specific cache strategies optimized for Firewalla API patterns
 */
export class DataCacheStrategies {
  /**
   * Cache strategy for security alarms - high volatility, short TTL
   */
  static getAlarmsStrategy(): CacheStrategy {
    return {
      ttl: 30 * 1000, // 30 seconds - alarms change frequently
      keyGenerator: (query?: string, limit?: number, cursor?: string) => 
        `alarms:${this.hashQuery(query || 'all')}:${limit || 'default'}:${cursor || 'first'}`,
      invalidationEvents: ['alarm_created', 'alarm_resolved', 'alarm_updated'],
      refreshThreshold: 0.5, // Refresh when 50% of TTL passed
      backgroundRefresh: false, // Too dynamic for background refresh
      keyPrefix: 'fw:alarms'
    };
  }

  /**
   * Cache strategy for network flows - time-sensitive, very short TTL
   */
  static getFlowsStrategy(): CacheStrategy {
    return {
      ttl: 30 * 1000, // 30 seconds - flows are real-time data
      keyGenerator: (query?: string, limit?: number, cursor?: string) => 
        `flows:${this.hashQuery(query || 'all')}:${limit || 'default'}:${cursor || 'first'}`,
      invalidationEvents: [], // Time-based only, too dynamic for events
      refreshThreshold: 0.3, // Refresh quickly for real-time data
      backgroundRefresh: false, // Too dynamic for background refresh
      keyPrefix: 'fw:flows'
    };
  }

  /**
   * Cache strategy for device information - moderate volatility, medium TTL
   */
  static getDevicesStrategy(): CacheStrategy {
    return {
      ttl: 2 * 60 * 1000, // 2 minutes - devices change moderately
      keyGenerator: (includeOffline?: boolean, limit?: number) => 
        `devices:${includeOffline || false}:${limit || 'default'}`,
      invalidationEvents: ['device_connected', 'device_disconnected', 'device_updated'],
      refreshThreshold: 0.7, // Refresh when 70% of TTL passed
      backgroundRefresh: true,
      keyPrefix: 'fw:devices'
    };
  }

  /**
   * Cache strategy for network rules - low volatility, longer TTL
   */
  static getRulesStrategy(): CacheStrategy {
    return {
      ttl: 10 * 60 * 1000, // 10 minutes - rules change infrequently
      keyGenerator: (query?: string, limit?: number, ruleType?: string) => 
        `rules:${this.hashQuery(query || 'all')}:${limit || 'default'}:${ruleType || 'all'}`,
      invalidationEvents: ['rule_created', 'rule_updated', 'rule_deleted', 'rule_paused', 'rule_resumed'],
      refreshThreshold: 0.8, // Refresh when 80% of TTL passed
      backgroundRefresh: true,
      keyPrefix: 'fw:rules'
    };
  }

  /**
   * Cache strategy for target lists - very stable data, long TTL
   */
  static getTargetListsStrategy(): CacheStrategy {
    return {
      ttl: 60 * 60 * 1000, // 1 hour - target lists are very stable
      keyGenerator: (listType?: string) => 
        `target_lists:${listType || 'all'}`,
      invalidationEvents: ['target_lists_updated', 'target_list_created', 'target_list_deleted'],
      refreshThreshold: 0.9, // Refresh when 90% of TTL passed
      backgroundRefresh: true,
      keyPrefix: 'fw:target_lists'
    };
  }

  /**
   * Cache strategy for box information - very stable data, long TTL
   */
  static getBoxesStrategy(): CacheStrategy {
    return {
      ttl: 30 * 60 * 1000, // 30 minutes - box info rarely changes
      keyGenerator: (groupId?: string) => 
        `boxes:${groupId || 'all'}`,
      invalidationEvents: ['box_updated', 'box_status_changed'],
      refreshThreshold: 0.9,
      backgroundRefresh: true,
      keyPrefix: 'fw:boxes'
    };
  }

  /**
   * Cache strategy for search results - complex queries, medium TTL
   */
  static getSearchStrategy(): CacheStrategy {
    return {
      ttl: 5 * 60 * 1000, // 5 minutes - search results can be cached briefly
      keyGenerator: (entityType: string, query: string, limit?: number) =>
        `search:${entityType}:${this.hashQuery(query)}:${limit || 'default'}`,
      invalidationEvents: [], // Time-based only, too complex for events
      refreshThreshold: 0.6,
      backgroundRefresh: true,
      compressionEnabled: true, // Search results can be large
      keyPrefix: 'fw:search'
    };
  }

  /**
   * Cache strategy for statistics - aggregated data, medium TTL
   */
  static getStatisticsStrategy(): CacheStrategy {
    return {
      ttl: 15 * 60 * 1000, // 15 minutes - statistics are relatively stable
      keyGenerator: (statsType: string, region?: string, boxId?: string) =>
        `statistics:${statsType}:${region || 'all'}:${boxId || 'all'}`,
      invalidationEvents: ['stats_updated'],
      refreshThreshold: 0.8,
      backgroundRefresh: true,
      keyPrefix: 'fw:statistics'
    };
  }

  /**
   * Cache strategy for trends data - time-series data, medium TTL
   */
  static getTrendsStrategy(): CacheStrategy {
    return {
      ttl: 10 * 60 * 1000, // 10 minutes - trends are relatively stable
      keyGenerator: (trendType: string, timeRange: string, granularity?: string) =>
        `trends:${trendType}:${timeRange}:${granularity || 'default'}`,
      invalidationEvents: ['trends_updated'],
      refreshThreshold: 0.7,
      backgroundRefresh: true,
      keyPrefix: 'fw:trends'
    };
  }

  /**
   * Get cache strategy for a specific entity type
   */
  static getStrategyForEntity(entityType: EntityType): CacheStrategy {
    switch (entityType) {
      case 'alarms':
        return this.getAlarmsStrategy();
      case 'flows':
        return this.getFlowsStrategy();
      case 'devices':
        return this.getDevicesStrategy();
      case 'rules':
        return this.getRulesStrategy();
      case 'target_lists':
        return this.getTargetListsStrategy();
      case 'boxes':
        return this.getBoxesStrategy();
      case 'search':
        return this.getSearchStrategy();
      case 'statistics':
        return this.getStatisticsStrategy();
      case 'trends':
        return this.getTrendsStrategy();
      default:
        logger.warn(`Unknown entity type: ${entityType}, using default strategy`);
        return this.getDefaultStrategy();
    }
  }

  /**
   * Default cache strategy for unknown entity types
   */
  static getDefaultStrategy(): CacheStrategy {
    return {
      ttl: 5 * 60 * 1000, // 5 minutes default
      keyGenerator: (...args: any[]) => 
        `default:${args.map(arg => String(arg)).join(':')}`,
      invalidationEvents: [],
      refreshThreshold: 0.7,
      backgroundRefresh: false,
      keyPrefix: 'fw:default'
    };
  }

  /**
   * Generate a consistent hash for query strings
   * @private
   */
  private static hashQuery(query: string): string {
    if (!query || query.trim() === '') {
      return 'empty';
    }
    
    // Simple hash function for cache keys (not cryptographic)
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Get all available entity types
   */
  static getAllEntityTypes(): EntityType[] {
    return ['alarms', 'flows', 'devices', 'rules', 'target_lists', 'boxes', 'search', 'statistics', 'trends'];
  }

  /**
   * Get cache configuration summary for monitoring
   */
  static getCacheConfigSummary(): Record<EntityType, { ttl: number; backgroundRefresh: boolean }> {
    const summary: Record<string, { ttl: number; backgroundRefresh: boolean }> = {};
    
    for (const entityType of this.getAllEntityTypes()) {
      const strategy = this.getStrategyForEntity(entityType);
      summary[entityType] = {
        ttl: strategy.ttl,
        backgroundRefresh: strategy.backgroundRefresh
      };
    }
    
    return summary as Record<EntityType, { ttl: number; backgroundRefresh: boolean }>;
  }
}