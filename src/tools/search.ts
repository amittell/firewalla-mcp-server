/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */

import { queryParser } from '../search/parser.js';
import { filterFactory } from '../search/filters/index.js';
import { FilterContext } from '../search/filters/base.js';
import { SearchParams, SearchResult } from '../search/types.js';
import { FirewallaClient } from '../firewalla/client.js';

/**
 * Search Engine for executing complex queries
 */
export class SearchEngine {
  constructor(private firewalla: FirewallaClient) {}

  /**
   * Execute a search query for flows
   */
  async searchFlows(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      // Parse the query
      const validation = queryParser.parse(params.query, 'flows');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      // Apply filters to build API parameters
      const context: FilterContext = {
        entityType: 'flows',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      // Execute API call with filtered parameters
      const apiParams = {
        ...filterResult.apiParams,
        limit: params.limit || 100,
        start_time: params.time_range?.start,
        end_time: params.time_range?.end
      };

      // Build query string for Firewalla API
      let queryString = '';
      
      // Add time range to query if provided
      if (params.time_range?.start && params.time_range?.end) {
        const startTs = Math.floor(new Date(params.time_range.start).getTime() / 1000);
        const endTs = Math.floor(new Date(params.time_range.end).getTime() / 1000);
        queryString += `ts:${startTs}-${endTs}`;
      }
      
      // Combine with the parsed query
      const finalQuery = queryString ? `${queryString} AND (${params.query})` : params.query;
      
      const searchOptions: any = {};
      if (params.time_range && params.time_range.start && params.time_range.end) {
        searchOptions.time_range = {
          start: params.time_range.start,
          end: params.time_range.end
        };
      }
      
      const flowData = await this.firewalla.searchFlows(
        { query: finalQuery, limit: apiParams.limit },
        searchOptions
      );

      // Apply post-processing filters
      let results = flowData.results || [];
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      // Apply sorting and pagination
      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      if (params.offset) {
        results = results.slice(params.offset);
      }

      // Generate aggregations if requested
      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      return {
        results,
        count: results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

    } catch (error) {
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a search query for alarms
   */
  async searchAlarms(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      const validation = queryParser.parse(params.query, 'alarms');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      const context: FilterContext = {
        entityType: 'alarms',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      const alarms = await this.firewalla.getActiveAlarms(
        filterResult.queryString || undefined,
        undefined,
        'ts:desc',
        params.limit || 100
      );

      let results = alarms.results || [];
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      if (params.offset) {
        results = results.slice(params.offset);
      }

      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      return {
        results,
        count: results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

    } catch (error) {
      throw new Error(`Alarm search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a search query for rules
   */
  async searchRules(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      const validation = queryParser.parse(params.query, 'rules');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      const context: FilterContext = {
        entityType: 'rules',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      const rules = await this.firewalla.getNetworkRules();

      let results = rules.results || [];
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      if (params.offset) {
        results = results.slice(params.offset);
      }

      if (params.limit) {
        results = results.slice(0, params.limit);
      }

      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      return {
        results,
        count: results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

    } catch (error) {
      throw new Error(`Rule search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a search query for devices
   */
  async searchDevices(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      const validation = queryParser.parse(params.query, 'devices');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      const context: FilterContext = {
        entityType: 'devices',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      const devices = await this.firewalla.getDeviceStatus();

      let results = devices.results || [];
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      if (params.offset) {
        results = results.slice(params.offset);
      }

      if (params.limit) {
        results = results.slice(0, params.limit);
      }

      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      return {
        results,
        count: results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

    } catch (error) {
      throw new Error(`Device search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a search query for target lists
   */
  async searchTargetLists(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      const validation = queryParser.parse(params.query, 'target_lists');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      const context: FilterContext = {
        entityType: 'target_lists',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      const targetLists = await this.firewalla.getTargetLists();

      let results = targetLists.results || [];
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      if (params.offset) {
        results = results.slice(params.offset);
      }

      if (params.limit) {
        results = results.slice(0, params.limit);
      }

      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      return {
        results,
        count: results.length,
        limit: params.limit || 100,
        offset: params.offset || 0,
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

    } catch (error) {
      throw new Error(`Target list search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cross-reference search across multiple entity types
   */
  async crossReferenceSearch(params: { primary_query: string; secondary_queries: string[]; correlation_field: string }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Execute primary query (assume it's for flows)
      const primaryResult = await this.searchFlows({ query: params.primary_query });
      
      // Extract correlation values
      const correlationValues = new Set(
        (Array.isArray(primaryResult.results) ? primaryResult.results : []).map(item => this.getNestedValue(item, params.correlation_field)).filter(Boolean)
      );

      // Execute secondary queries and correlate
      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count
        },
        correlations: []
      };

      for (const [, secondaryQuery] of params.secondary_queries.entries()) {
        // For simplicity, assume secondary queries are for alarms
        const secondaryResult = await this.searchAlarms({ query: secondaryQuery });
        
        const correlatedItems = secondaryResult.results.filter(item => {
          const value = this.getNestedValue(item, params.correlation_field);
          return correlationValues.has(value);
        });

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: correlatedItems,
          count: correlatedItems.length,
          correlation_field: params.correlation_field
        });
      }

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          correlated_count: correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.count, 0),
          correlation_rate: primaryResult.count > 0 
            ? Math.round((correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.count, 0) / primaryResult.count) * 100)
            : 0
        }
      };

    } catch (error) {
      throw new Error(`Cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursively apply filters to a query AST
   */
  private applyFiltersRecursively(node: any, context: FilterContext): any {
    switch (node.type) {
      case 'logical': {
        // For logical nodes, apply filters to operands and combine
        const combinedResult: { apiParams: any, postProcessing?: (items: any[]) => any[] } = { apiParams: {}, postProcessing: undefined };
        
        if (node.left) {
          const leftResult = this.applyFiltersRecursively(node.left, context);
          Object.assign(combinedResult.apiParams, leftResult.apiParams);
          if (leftResult.postProcessing) {
            combinedResult.postProcessing = leftResult.postProcessing;
          }
        }
        
        if (node.right) {
          const rightResult = this.applyFiltersRecursively(node.right, context);
          Object.assign(combinedResult.apiParams, rightResult.apiParams);
          
          // Combine post-processing for logical operations
          if (rightResult.postProcessing) {
            const existingPostProcessing = combinedResult.postProcessing;
            if (existingPostProcessing && node.operator === 'AND') {
              combinedResult.postProcessing = (items: any[]) => 
                rightResult.postProcessing!(existingPostProcessing(items));
            } else if (node.operator === 'OR') {
              // OR logic is more complex, simplified for now
              combinedResult.postProcessing = rightResult.postProcessing;
            } else {
              combinedResult.postProcessing = rightResult.postProcessing;
            }
          }
        }
        
        if (node.operand) {
          // NOT operation
          const operandResult = this.applyFiltersRecursively(node.operand, context);
          if (operandResult.postProcessing) {
            combinedResult.postProcessing = (items: any[]) => {
              const filtered = operandResult.postProcessing!(items);
              return items.filter(item => !filtered.includes(item));
            };
          }
        }
        
        return combinedResult;
      }
      case 'group':
        return this.applyFiltersRecursively(node.query, context);
        
      default:
        // Apply filters for leaf nodes
        return filterFactory.applyFilters(node, context);
    }
  }

  /**
   * Sort results by a field
   */
  private sortResults(results: any[], sortBy: string, sortOrder: 'asc' | 'desc' = 'desc'): any[] {
    return results.sort((a, b) => {
      const valueA = this.getNestedValue(a, sortBy);
      const valueB = this.getNestedValue(b, sortBy);
      
      if (valueA === valueB) {return 0;}
      
      const comparison = valueA < valueB ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Generate aggregations for results
   */
  private generateAggregations(results: any[], groupBy?: string): any {
    if (!groupBy) {
      return {
        total: { count: results.length }
      };
    }

    const groups: { [key: string]: any[] } = {};
    
    for (const item of results) {
      const groupValue = String(this.getNestedValue(item, groupBy) || 'unknown');
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(item);
    }

    const aggregations: any = {};
    
    for (const [groupValue, groupItems] of Object.entries(groups)) {
      aggregations[groupValue] = {
        count: groupItems.length,
        percentage: Math.round((groupItems.length / results.length) * 100)
      };
    }

    return aggregations;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Create search tools for MCP server
 */
export function createSearchTools(firewalla: FirewallaClient) {
  const searchEngine = new SearchEngine(firewalla);

  return {
    search_flows: searchEngine.searchFlows.bind(searchEngine),
    search_alarms: searchEngine.searchAlarms.bind(searchEngine),
    search_rules: searchEngine.searchRules.bind(searchEngine),
    search_devices: searchEngine.searchDevices.bind(searchEngine),
    search_target_lists: searchEngine.searchTargetLists.bind(searchEngine),
    search_cross_reference: searchEngine.crossReferenceSearch.bind(searchEngine)
  };
}