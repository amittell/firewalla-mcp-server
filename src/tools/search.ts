/**
 * Search Tools Implementation for Firewalla MCP Server
 * Provides advanced search capabilities across all entity types
 */

import { queryParser } from '../search/parser.js';
import { filterFactory } from '../search/filters/index.js';
import { FilterContext } from '../search/filters/base.js';
import { SearchParams, SearchResult } from '../search/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { ErrorHandler, ParameterValidator, SafeAccess, QuerySanitizer } from '../validation/error-handler.js';
import { FieldMapper, EntityType } from '../validation/field-mapper.js';

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
      const queryValidation = ParameterValidator.validateRequiredString(params?.query, 'query');
      const limitValidation = ParameterValidator.validateNumber(params?.limit, 'limit', {
        required: true, min: 1, max: 10000, integer: true
      });
      const offsetValidation = ParameterValidator.validateNumber(params?.offset, 'offset', {
        min: 0, defaultValue: 0, integer: true
      });
      
      const validationResult = ParameterValidator.combineValidationResults([
        queryValidation, limitValidation, offsetValidation
      ]);
      
      if (!validationResult.isValid) {
        throw new Error(`Parameter validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      // Sanitize query
      const queryCheck = QuerySanitizer.sanitizeSearchQuery(queryValidation.sanitizedValue!);
      if (!queryCheck.isValid) {
        throw new Error(`Query validation failed: ${queryCheck.errors.join(', ')}`);
      }
      // Parse the sanitized query
      const validation = queryParser.parse(queryCheck.sanitizedValue!, 'flows');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query syntax: ${validation.errors.join(', ')}`);
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
        limit: params.limit,
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
        limit: limitValidation.sanitizedValue!,
        offset: offsetValidation.sanitizedValue!,
        query: queryCheck.sanitizedValue!,
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
      
      if (!params.limit) {
        throw new Error('limit parameter is required');
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
        params.limit
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
        limit: params.limit,
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
      
      if (!params.limit) {
        throw new Error('limit parameter is required');
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
        limit: params.limit,
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
   * Execute a search query for devices using cursor-based pagination
   */
  async searchDevices(params: SearchParams): Promise<SearchResult> {
    const startTime = Date.now();
    
    try {
      // Validate input parameters
      if (!params || !params.query || typeof params.query !== 'string') {
        throw new Error('Invalid search parameters: query is required and must be a string');
      }
      
      if (!params.limit) {
        throw new Error('limit parameter is required');
      }
      const validation = queryParser.parse(params.query, 'devices');
      if (!validation.isValid || !validation.ast) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
      }

      // Use cursor-based pagination with the searchDevices client method
      const searchQuery = {
        query: params.query,
        limit: params.limit,
        cursor: params.cursor,
        sort_by: params.sort_by,
        group_by: params.group_by,
        aggregate: params.aggregate
      };

      const searchOptions: any = {
        include_resolved: true // Include all devices for search
      };
      
      // Only add time_range if it has both start and end
      if (params.time_range && params.time_range.start && params.time_range.end) {
        searchOptions.time_range = {
          start: params.time_range.start,
          end: params.time_range.end
        };
      }

      // Use the proper searchDevices client method with cursor support
      const response = await this.firewalla.searchDevices(searchQuery, searchOptions);

      // Handle backward compatibility for offset-based pagination
      let results = response.results || [];
      if (params.offset && !params.cursor) {
        // Legacy offset support - only if cursor not provided
        results = results.slice(params.offset);
        if (params.limit) {
          results = results.slice(0, params.limit);
        }
      }

      return {
        results,
        count: response.count || results.length,
        limit: params.limit,
        offset: params.offset || 0, // For backward compatibility
        next_cursor: response.next_cursor, // Cursor-based pagination
        query: params.query,
        execution_time_ms: Date.now() - startTime,
        aggregations: response.aggregations
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
      
      if (!params.limit) {
        throw new Error('limit parameter is required');
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
        limit: params.limit,
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
   * Cross-reference search across multiple entity types with improved field mapping
   */
  async crossReferenceSearch(params: { primary_query: string; secondary_queries: string[]; correlation_field: string }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate cross-reference parameters
      const validation = FieldMapper.validateCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_field
      );
      
      if (!validation.isValid) {
        throw new Error(`Cross-reference validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Determine entity types based on query patterns
      const primaryType = FieldMapper.suggestEntityType(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(q => FieldMapper.suggestEntityType(q) || 'alarms');
      
      // Execute primary query based on detected type
      let primaryResult: SearchResult;
      switch (primaryType) {
        case 'flows':
          primaryResult = await this.searchFlows({ query: params.primary_query });
          break;
        case 'alarms':
          primaryResult = await this.searchAlarms({ query: params.primary_query });
          break;
        case 'rules':
          primaryResult = await this.searchRules({ query: params.primary_query });
          break;
        case 'devices':
          primaryResult = await this.searchDevices({ query: params.primary_query });
          break;
        case 'target_lists':
          primaryResult = await this.searchTargetLists({ query: params.primary_query });
          break;
        default:
          primaryResult = await this.searchFlows({ query: params.primary_query });
      }
      
      // Extract correlation values using proper field mapping
      const correlationValues = FieldMapper.extractCorrelationValues(
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

      for (const [index, secondaryQuery] of params.secondary_queries.entries()) {
        const secondaryType = secondaryTypes[index];
        
        // Execute secondary query based on detected type
        let secondaryResult: SearchResult;
        switch (secondaryType) {
          case 'flows':
            secondaryResult = await this.searchFlows({ query: secondaryQuery });
            break;
          case 'alarms':
            secondaryResult = await this.searchAlarms({ query: secondaryQuery });
            break;
          case 'rules':
            secondaryResult = await this.searchRules({ query: secondaryQuery });
            break;
          case 'devices':
            secondaryResult = await this.searchDevices({ query: secondaryQuery });
            break;
          case 'target_lists':
            secondaryResult = await this.searchTargetLists({ query: secondaryQuery });
            break;
          default:
            secondaryResult = await this.searchAlarms({ query: secondaryQuery });
        }
        
        // Filter by correlation using improved field mapping
        const correlatedItems = FieldMapper.filterByCorrelation(
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
   * Get nested value from object using dot notation (enhanced with field mapping)
   */
  private getNestedValue(obj: any, path: string): any {
    return SafeAccess.getNestedValue(obj, path);
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