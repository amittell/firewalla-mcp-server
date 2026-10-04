/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */
import type { SearchParams, SearchResult } from '../search/types.js';
import { type FirewallaClient, type RequestTrace } from '../firewalla/client.js';
/**
 * Search Engine for executing complex queries
 */
export declare class SearchEngine {
    private firewalla;
    private strategies;
    constructor(firewalla: FirewallaClient);
    /**
     * Validate basic search parameters
     */
    private validateBasicSearchParams;
    /**
     * The strategies of executeSearch, which searchRules, searchDevices and
     * searchTargetLists run. searchFlows and searchAlarms call the client
     * themselves; the flow and alarm strategies here were never run, and the
     * alarm one re-filtered results with regexes read from the raw query
     * (source_ip:.*+* made the invalid RegExp ..*+.*), so both are gone.
     */
    private initializeStrategies;
    /**
     * Shared helper for validating limit parameter across all search methods
     * @param limit - The limit value to validate
     * @param entityType - The entity type for context-specific limits
     * @param options - Additional validation options
     */
    private validateLimitParameter;
    /**
     * Standardized parameter validation for all search operations
     */
    private validateSearchParams;
    /**
     * Generic search execution method that handles common patterns
     */
    private executeSearch;
    /**
     * Execute a search query for flows using simplified implementation with direct API calls.
     * Performs basic validation and uses getFlowData API directly for improved reliability.
     * Supports time range filtering and proper limit enforcement.
     *
     * @param trace - The client's RequestTrace: counts the requests sent and
     *   the pages answered from the cache, adding to what it already holds
     */
    searchFlows(params: SearchParams, trace?: RequestTrace): Promise<SearchResult>;
    /**
     * Execute a search query for alarms using simplified implementation with direct API calls.
     * Performs basic validation and uses getActiveAlarms API directly for improved reliability.
     * Supports query filtering and proper limit enforcement.
     */
    searchAlarms(params: SearchParams): Promise<SearchResult>;
    /**
     * Execute a search query for rules
     */
    searchRules(params: SearchParams): Promise<SearchResult>;
    /**
     * Execute a search query for devices using cursor-based pagination
     */
    searchDevices(params: SearchParams): Promise<SearchResult>;
    /**
     * Execute a search query for target lists
     */
    searchTargetLists(params: SearchParams): Promise<SearchResult>;
    /**
     * Recursively apply filters to a query AST
     */
    private applyFiltersRecursively;
    /**
     * Sort results by a field
     */
    private sortResults;
    /**
     * Generate aggregations for results
     */
    private generateAggregations;
    /**
     * Get nested value from object using dot notation (enhanced with field mapping)
     */
    private getNestedValue;
}
/**
 * Search tools interface for type safety
 */
interface SearchTools {
    search_flows: SearchEngine['searchFlows'];
    search_alarms: SearchEngine['searchAlarms'];
    search_rules: SearchEngine['searchRules'];
    search_devices: SearchEngine['searchDevices'];
    search_target_lists: SearchEngine['searchTargetLists'];
}
/**
 * Creates and returns a set of advanced search functions for querying Firewalla MCP server entities.
 *
 * The returned object provides methods for searching flows, alarms, rules, devices and target lists, all using the provided Firewalla client instance.
 */
export declare function createSearchTools(firewalla: FirewallaClient): SearchTools;
export {};
//# sourceMappingURL=search.d.ts.map