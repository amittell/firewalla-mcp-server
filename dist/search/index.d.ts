/**
 * Advanced search utilities for Firewalla MCP Server
 * Implements complex query parsing and search optimization
 */
import type { SearchFilter } from '../types.js';
/**
 * Parsed query component interface
 */
interface QueryComponent {
    field?: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startswith' | 'endswith' | 'wildcard' | 'range';
    value: string | number | boolean | Array<string | number | boolean>;
    logical?: 'AND' | 'OR' | 'NOT';
}
/**
 * Query parsing result interface
 */
interface ParsedQuery {
    components: QueryComponent[];
    filters: SearchFilter[];
    optimized: string;
    complexity: number;
}
/**
 * Parses a raw search query string into structured query components and filters.
 *
 * Supports advanced syntax including logical operators (AND, OR, NOT), field comparisons, ranges, wildcards, arrays, and free-text search. Returns an object containing parsed components, filters for backend search, an optimized query string, and a complexity score.
 *
 * @param query - The raw search query string to parse
 * @returns An object with parsed query components, filters, optimized query string, and complexity score
 */
export declare function parseSearchQuery(query: string): ParsedQuery;
/**
 * Returns an optimized version of the search query string for API use.
 *
 * Parses the input query and generates an optimized query string; if optimization is not possible, returns the original query.
 *
 * @param query - The raw search query string to format
 * @returns The optimized query string suitable for API consumption
 */
export declare function formatQueryForAPI(query: string): string;
export {};
//# sourceMappingURL=index.d.ts.map