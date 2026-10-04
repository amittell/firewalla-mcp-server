/**
 * Filter Factory and Registry
 * Centralized management of all search filters
 */
import type { QueryNode } from '../types.js';
import type { FilterContext, FilterResult } from './base.js';
/**
 * Filter Factory for managing and applying filters
 */
export declare class FilterFactory {
    private filters;
    /**
     * Apply all relevant filters to a query node
     */
    applyFilters(node: QueryNode, context: FilterContext): FilterResult;
}
export declare const filterFactory: FilterFactory;
//# sourceMappingURL=index.d.ts.map