/**
 * Base Filter Interface and Abstract Classes
 * Provides foundation for specialized filter implementations
 */
import type { QueryNode } from '../types.js';
/**
 * Base filter interface that all filters must implement
 */
export interface Filter {
    /** Filter name/type identifier */
    readonly name: string;
    /** Check if this filter can handle the given query node */
    canHandle: (node: QueryNode) => boolean;
    /** Apply the filter to convert query node to API parameters */
    apply: (node: QueryNode, context: FilterContext) => FilterResult;
    /** Get optimization hints for this filter */
    getOptimizations?: () => OptimizationHint[];
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
    postProcessing: Array<(items: any[]) => any[]>;
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
export declare abstract class BaseFilter implements Filter {
    abstract readonly name: string;
    abstract canHandle(node: QueryNode): boolean;
    abstract apply(node: QueryNode, context: FilterContext): FilterResult;
    /**
     * Parse timestamp value to Unix timestamp with robust detection
     */
    protected parseTimestamp(value: any): number | null;
    /**
     * Create cache key component for this filter
     */
    protected createCacheKey(node: QueryNode): string;
}
//# sourceMappingURL=base.d.ts.map