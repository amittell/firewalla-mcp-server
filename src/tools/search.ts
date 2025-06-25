/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */

import { queryParser } from '../search/parser.js';
import { filterFactory } from '../search/filters/index.js';
import { FilterContext } from '../search/filters/base.js';
import { SearchParams, SearchResult } from '../search/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { ParameterValidator, SafeAccess, QuerySanitizer } from '../validation/error-handler.js';
import { validateCrossReference, suggestEntityType, extractCorrelationValues, filterByCorrelation } from '../validation/field-mapper.js';

/**
 * Strategy interface for different entity search implementations
 */
interface SearchStrategy {
  entityType: string;
  // eslint-disable-next-line no-unused-vars
  executeApiCall(client: FirewallaClient, params: SearchParams, apiParams: any, searchOptions: any): Promise<any>;
  // eslint-disable-next-line no-unused-vars
  validateParams?(params: SearchParams): { isValid: boolean; errors: string[] };
  // eslint-disable-next-line no-unused-vars
  processResults?(results: any[], params: SearchParams): any[];
}

/**
 * Configuration for search parameter validation
 */
interface SearchValidationConfig {
  requireQuery?: boolean;
  requireLimit?: boolean;
  supportsCursor?: boolean;
  supportsTimeRange?: boolean;
}

/**
 * Search Engine for executing complex queries
 */
export class SearchEngine {
  private strategies: Map<string, SearchStrategy> = new Map();

  constructor(
    // eslint-disable-next-line no-unused-vars
    private firewalla: FirewallaClient
  ) {
    this.initializeStrategies();
  }

  /**
   * Initialize search strategies for different entity types
   */
  private initializeStrategies(): void {
    this.strategies.set('flows', {
      entityType: 'flows',
      executeApiCall: async (client, params, apiParams, searchOptions) => {
        const queryString = searchOptions.time_range ? 
          `ts:${Math.floor(new Date(searchOptions.time_range.start).getTime() / 1000)}-${Math.floor(new Date(searchOptions.time_range.end).getTime() / 1000)} AND (${params.query})` : 
          params.query;
        return await client.searchFlows({ query: queryString, limit: apiParams.limit }, searchOptions);
      }
    });

    this.strategies.set('alarms', {
      entityType: 'alarms',
      executeApiCall: async (client, params, apiParams) => {
        return await client.getActiveAlarms(
          apiParams.queryString || undefined,
          undefined,
          'ts:desc',
          params.limit
        );
      }
    });

    this.strategies.set('rules', {
      entityType: 'rules',
      executeApiCall: async (client) => {
        return await client.getNetworkRules();
      },
      processResults: (results, params) => {
        if (params.limit) {
          return results.slice(0, params.limit);
        }
        return results;
      }
    });

    this.strategies.set('devices', {
      entityType: 'devices',
      executeApiCall: async (client, params, apiParams, searchOptions) => {
        const searchQuery = {
          query: params.query,
          limit: params.limit,
          cursor: params?.cursor,
          sort_by: params?.sort_by,
          group_by: params?.group_by,
          aggregate: params?.aggregate
        };
        return await client.searchDevices(searchQuery, searchOptions);
      },
      processResults: (results, params) => {
        if (params.offset && !params.cursor) {
          // Legacy offset support - only if cursor not provided
          let processedResults = results.slice(params.offset);
          if (params.limit) {
            processedResults = processedResults.slice(0, params.limit);
          }
          return processedResults;
        }
        return results;
      }
    });

    this.strategies.set('target_lists', {
      entityType: 'target_lists',
      executeApiCall: async (client) => {
        return await client.getTargetLists();
      },
      processResults: (results, params) => {
        if (params.limit) {
          return results.slice(0, params.limit);
        }
        return results;
      }
    });
  }

  /**
   * Generic search execution method that handles common patterns
   */
  private async executeSearch(params: SearchParams, entityType: string, validationConfig: SearchValidationConfig = {}): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Get strategy for entity type
      const strategy = this.strategies.get(entityType);
      if (!strategy) {
        throw new Error(`No search strategy found for entity type: ${entityType}`);
      }

      // Validate parameters based on configuration
      if (validationConfig.requireQuery !== false) {
        const queryValidation = entityType === 'flows' ?
          ParameterValidator.validateRequiredString(params?.query, 'query') :
          this.validateBasicQuery(params);
        
        if (!queryValidation.isValid) {
          throw new Error(`Parameter validation failed: ${queryValidation.errors?.join(', ') || 'Invalid query'}`);
        }
      }
      
      if (validationConfig.requireLimit !== false) {
        if (!params.limit) {
          throw new Error('limit parameter is required');
        }
      }

      // Parse and validate query
      let queryCheck;
      if (entityType === 'flows') {
        queryCheck = QuerySanitizer.sanitizeSearchQuery(params.query);
        if (!queryCheck.isValid) {
          throw new Error(`Query validation failed: ${queryCheck.errors.join(', ')}`);
        }
      }
      
      const validation = queryParser.parse(queryCheck?.sanitizedValue || params.query, entityType as 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query syntax: ${validation.errors.join(', ')}`);
      }

      // Set up filter context
      const context: FilterContext = {
        entityType: entityType as 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists',
        apiParams: {},
        postProcessing: [],
        metadata: {
          filtersApplied: [],
          optimizations: []
        }
      };

      const filterResult = this.applyFiltersRecursively(validation.ast, context);
      
      // Prepare API parameters
      const apiParams = {
        ...filterResult.apiParams,
        limit: params.limit,
        start_time: params.time_range?.start,
        end_time: params.time_range?.end,
        queryString: filterResult.queryString
      };

      // Prepare search options
      const searchOptions: any = {};
      if (entityType === 'devices') {
        searchOptions.include_resolved = true;
      }
      
      if (params.time_range?.start && params.time_range?.end && validationConfig.supportsTimeRange) {
        searchOptions.time_range = {
          start: params.time_range.start,
          end: params.time_range.end
        };
      }

      // Execute API call using strategy
      const response = await strategy.executeApiCall(this.firewalla, params, apiParams, searchOptions);

      // Process results
      let results = response.results || [];
      
      // Apply post-processing filters
      if (filterResult.postProcessing && results.length > 0) {
        results = filterResult.postProcessing(results);
      }

      // Apply strategy-specific result processing
      if (strategy.processResults) {
        results = strategy.processResults(results, params);
      }

      // Apply sorting
      if (params.sort_by) {
        results = this.sortResults(results, params.sort_by, params.sort_order);
      }

      // Apply pagination (for non-cursor based)
      if (params.offset && entityType !== 'devices') {
        results = results.slice(params.offset);
      }

      // Generate aggregations
      const aggregations = params.aggregate ? this.generateAggregations(results, params.group_by) : undefined;

      // Build result object
      const result: SearchResult = {
        results,
        count: response.count || results.length,
        limit: params.limit,
        offset: params.offset || 0,
        query: queryCheck?.sanitizedValue || params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations
      };

      // Add cursor for devices
      if (entityType === 'devices' && response.next_cursor) {
        (result as any).next_cursor = response.next_cursor;
      }

      return result;

    } catch (error) {
      throw new Error(`${entityType} search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate basic query parameters
   */
  private validateBasicQuery(params: SearchParams): { isValid: boolean; errors?: string[] } {
    if (!params || !params.query || typeof params.query !== 'string') {
      return { isValid: false, errors: ['Invalid search parameters: query is required and must be a string'] };
    }
    return { isValid: true };
  }

  /**
   * Execute a search query for flows
   */
  async searchFlows(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'flows', {
      requireQuery: true,
      requireLimit: true,
      supportsTimeRange: true
    });
  }

  /**
   * Execute a search query for alarms
   */
  async searchAlarms(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'alarms', {
      requireQuery: true,
      requireLimit: true
    });
  }

  /**
   * Execute a search query for rules
   */
  async searchRules(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'rules', {
      requireQuery: true,
      requireLimit: true
    });
  }

  /**
   * Execute a search query for devices using cursor-based pagination
   */
  async searchDevices(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'devices', {
      requireQuery: true,
      requireLimit: true,
      supportsCursor: true,
      supportsTimeRange: true
    });
  }

  /**
   * Execute a search query for target lists
   */
  async searchTargetLists(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'target_lists', {
      requireQuery: true,
      requireLimit: true
    });
  }

  /**
   * Execute search for a specific entity type and query
   */
  private async executeSearchByType(
    entityType: string,
    query: string,
    limit: number = 1000
  ): Promise<SearchResult> {
    switch (entityType) {
      case 'flows':
        return this.searchFlows({ query, limit });
      case 'alarms':
        return this.searchAlarms({ query, limit });
      case 'rules':
        return this.searchRules({ query, limit });
      case 'devices':
        return this.searchDevices({ query, limit });
      case 'target_lists':
        return this.searchTargetLists({ query, limit });
      default:
        return this.searchFlows({ query, limit });
    }
  }

  /**
   * Cross-reference search across multiple entity types with improved field mapping
   */
  async crossReferenceSearch(params: { primary_query: string; secondary_queries: string[]; correlation_field: string }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate cross-reference parameters
      const validation = validateCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_field
      );
      
      if (!validation.isValid) {
        throw new Error(`Cross-reference validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Determine entity types based on query patterns
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(q => suggestEntityType(q) || 'alarms');
      
      // Execute primary query using generic method
      const primaryResult = await this.executeSearchByType(primaryType, params.primary_query, 1000);
      
      // Extract correlation values using proper field mapping
      const correlationValues = extractCorrelationValues(
        primaryResult.results,
        params.correlation_field,
        primaryType
      );

      // Execute secondary queries and correlate
      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType
        },
        correlations: []
      };

      for (let index = 0; index < params.secondary_queries.length; index++) {
        const secondaryQuery = params.secondary_queries[index];
        const secondaryType = secondaryTypes[index];
        
        // Execute secondary query using generic method
        const secondaryResult = await this.executeSearchByType(secondaryType, secondaryQuery, 1000);
        
        // Filter by correlation using improved field mapping
        const correlatedItems = filterByCorrelation(
          secondaryResult.results,
          params.correlation_field,
          secondaryType,
          correlationValues
        );

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: correlatedItems,
          count: correlatedItems.length,
          correlation_field: params.correlation_field,
          entity_type: secondaryType
        });
      }

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          unique_correlation_values: correlationValues.size,
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
        // eslint-disable-next-line no-unused-vars
        const combinedResult: { apiParams: any, postProcessing?: ((items: any[]) => any[]) } = { apiParams: {} };
        
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
              combinedResult.postProcessing = (items: any[]): any[] => 
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
            combinedResult.postProcessing = (items: any[]): any[] => {
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
   * Get nested value from object using dot notation (enhanced with field mapping)
   */
  private getNestedValue(obj: any, path: string): any {
    return SafeAccess.getNestedValue(obj, path);
  }
}

/**
 * Create search tools for MCP server
 */
export function createSearchTools(firewalla: FirewallaClient): {
  search_flows: typeof SearchEngine.prototype.searchFlows;
  search_alarms: typeof SearchEngine.prototype.searchAlarms;
  search_rules: typeof SearchEngine.prototype.searchRules;
  search_devices: typeof SearchEngine.prototype.searchDevices;
  search_target_lists: typeof SearchEngine.prototype.searchTargetLists;
  search_cross_reference: typeof SearchEngine.prototype.crossReferenceSearch;
} {
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