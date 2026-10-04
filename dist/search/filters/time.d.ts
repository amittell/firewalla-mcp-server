/**
 * Time Range Filter Implementation
 * Handles timestamp-based filtering for flows, alarms, and rules
 */
import type { QueryNode } from '../types.js';
import { BaseFilter, type FilterContext, type FilterResult } from './base.js';
export declare class TimeRangeFilter extends BaseFilter {
    readonly name = "time_range";
    private readonly timeFields;
    canHandle(node: QueryNode): boolean;
    apply(node: QueryNode, context: FilterContext): FilterResult;
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
    private readonly STANDARD_TIME_MARGIN;
    private handleFieldQuery;
    private handleRangeQuery;
    private handleComparisonQuery;
    private buildTimeParams;
    getOptimizations(): ({
        type: "index";
        priority: number;
        description: string;
        condition: (context: FilterContext) => boolean;
    } | {
        type: "pushdown";
        priority: number;
        description: string;
        condition: (context: FilterContext) => boolean;
    })[];
}
//# sourceMappingURL=time.d.ts.map