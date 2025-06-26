/**
 * Base Filter Interface and Abstract Classes
 * Provides foundation for specialized filter implementations
 */

import { QueryNode } from '../types.js';

/**
 * Base filter interface that all filters must implement
 */
export interface Filter {
  /** Filter name/type identifier */
  readonly name: string;
  
  /** Check if this filter can handle the given query node */
  canHandle(node: QueryNode): boolean;
  
  /** Apply the filter to convert query node to API parameters */
  apply(node: QueryNode, context: FilterContext): FilterResult;
  
  /** Get optimization hints for this filter */
  getOptimizations?(): OptimizationHint[];
}

/**
 * Context passed to filters during application
 */
export interface FilterContext {
  /** Entity type being searched */
  entityType: 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists';
  
  /** Existing API parameters */
  apiParams: Record<string, any>;
  
  /** Post-processing functions to apply */
  postProcessing: ((items: any[]) => any[])[];
  
  /** Metadata about filters applied */
  metadata: {
    filtersApplied: string[];
    optimizations: string[];
    cacheKey?: string;
  };
  
  /** Optional time margin for timestamp matching (in seconds) */
  timeMargin?: number;
  
  /** Debug mode for filter composition */
  debug?: boolean;
}

/**
 * Result of applying a filter
 */
export interface FilterResult {
  /** API parameters to add/modify */
  apiParams: Record<string, any>;
  
  /** Post-processing function to apply to results */
  postProcessing?: (items: any[]) => any[];
  
  /** Whether this filter can be optimized away */
  canOptimize?: boolean;
  
  /** Cache key component for this filter */
  cacheKeyComponent?: string;
}

/**
 * Optimization hint for query planning
 */
export interface OptimizationHint {
  type: 'index' | 'cache' | 'pushdown' | 'reorder';
  priority: number;
  description: string;
  condition?: (context: FilterContext) => boolean;
}

/**
 * Abstract base filter with common functionality
 */
export abstract class BaseFilter implements Filter {
  abstract readonly name: string;
  
  abstract canHandle(node: QueryNode): boolean;
  abstract apply(node: QueryNode, context: FilterContext): FilterResult;
  
  /**
   * Create a post-processing function for field-based filtering
   */
  protected createFieldFilter(field: string, predicate: (value: any) => boolean): (items: any[]) => any[] {
    return (items: any[]) => items.filter(item => {
      const value = this.getNestedValue(item, field);
      return predicate(value);
    });
  }
  
  /**
   * Get nested value from object using dot notation
   */
  protected getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  /**
   * Check if a value matches a wildcard pattern
   */
  protected matchWildcard(value: string, pattern: string): boolean {
    if (!value || !pattern) return false;
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars except * and ?
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(String(value));
  }
  
  /**
   * Parse numeric value with validation
   */
  protected parseNumeric(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
  
  /**
   * Parse timestamp value to Unix timestamp
   */
  protected parseTimestamp(value: any): number | null {
    if (typeof value === 'number') {
      // Assume Unix timestamp (seconds or milliseconds)
      return value > 1000000000000 ? Math.floor(value / 1000) : value;
    }
    
    if (typeof value === 'string') {
      // Try parsing as ISO date
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
      
      // Try parsing as relative time (1h, 24h, 7d, etc.)
      const relativeMatch = value.match(/^(\d+)([smhd])$/);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        const now = Math.floor(Date.now() / 1000);
        
        switch (unit) {
          case 's': return now - amount;
          case 'm': return now - (amount * 60);
          case 'h': return now - (amount * 60 * 60);
          case 'd': return now - (amount * 24 * 60 * 60);
        }
      }
    }
    
    return null;
  }
  
  /**
   * Create cache key component for this filter
   */
  protected createCacheKey(node: QueryNode): string {
    return `${this.name}:${JSON.stringify(node)}`;
  }
}