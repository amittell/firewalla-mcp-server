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
   * Parse timestamp value to Unix timestamp with robust detection
   */
  protected parseTimestamp(value: any): number | null {
    if (typeof value === 'number') {
      // Handle invalid numbers (NaN, Infinity)
      if (!isFinite(value)) {
        return null;
      }
      
      // Handle negative timestamps (invalid)
      if (value < 0) {
        return null;
      }
      
      // Handle Unix epoch (1970-01-01): 0 seconds
      if (value === 0) {
        return 0;
      }
      
      // More robust detection: timestamps after year 3000 in seconds would be > 32503680000
      // Timestamps in milliseconds for current era would be > 1000000000000
      // This handles both current millisecond timestamps and future second timestamps correctly
      if (value > 32503680000 && value < 1000000000000) {
        // Likely seconds for far future dates
        return value;
      } else if (value > 1000000000000) {
        // Likely milliseconds - validate reasonable range (not beyond year 9999)
        if (value > 253402300800000) { // Year 9999 in milliseconds
          return null;
        }
        return Math.floor(value / 1000);
      } else if (value > 946684800) {
        // Likely seconds for dates after 2000-01-01
        return value;
      } else if (value >= 31536000) {
        // Valid Unix timestamp for dates after 1971 (to account for older logs)
        return value;
      } else {
        // Too small to be a valid timestamp
        return null;
      }
    }
    
    if (typeof value === 'string') {
      // Trim whitespace and check for empty string
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      
      // Try parsing as number string first
      const numericValue = parseFloat(trimmed);
      if (!isNaN(numericValue) && isFinite(numericValue)) {
        return this.parseTimestamp(numericValue);
      }
      
      // Try parsing as ISO date
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        const timestamp = Math.floor(date.getTime() / 1000);
        // Validate the parsed timestamp is reasonable
        if (timestamp >= 0 && timestamp <= 253402300800) { // Year 9999
          return timestamp;
        }
      }
      
      // Try parsing as relative time (1h, 24h, 7d, etc.)
      const relativeMatch = trimmed.match(/^(\d+)([smhdw])$/i);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        
        // Validate amount is reasonable
        if (amount < 0 || amount > 1000000) {
          return null;
        }
        
        const now = Math.floor(Date.now() / 1000);
        
        switch (unit) {
          case 's': return now - amount;
          case 'm': return now - (amount * 60);
          case 'h': return now - (amount * 60 * 60);
          case 'd': return now - (amount * 24 * 60 * 60);
          case 'w': return now - (amount * 7 * 24 * 60 * 60);
          default: return null;
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