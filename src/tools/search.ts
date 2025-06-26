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
import { 
  validateCrossReference, 
  validateEnhancedCrossReference,
  suggestEntityType, 
  extractCorrelationValues, 
  filterByCorrelation,
  performMultiFieldCorrelation,
  performEnhancedMultiFieldCorrelation,
  getSupportedCorrelationCombinations,
  getFieldValue,
  EnhancedCorrelationParams,
  ScoringCorrelationParams
} from '../validation/field-mapper.js';

/**
 * Risk threshold constants for geographic analysis
 */
const RISK_THRESHOLDS = {
  LOW_MAX: 3,
  MEDIUM_MAX: 6,
  HIGH_MAX: 8,
  HIGH_RISK_COUNTRY_MIN: 6,
  HIGH_RISK_FLOW_MIN: 7,
  SUSPICIOUS_ASN_MIN: 7
} as const;

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
  maxLimit?: number;
  allowEmptyQuery?: boolean;
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
        let queryString = params.query;
        
        // Add time range to query if provided
        if (searchOptions.time_range?.start && searchOptions.time_range?.end) {
          const startDate = new Date(searchOptions.time_range.start);
          const endDate = new Date(searchOptions.time_range.end);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid time range format');
          }
          
          if (startDate >= endDate) {
            throw new Error('Start time must be before end time');
          }
          
          const startTs = Math.floor(startDate.getTime() / 1000);
          const endTs = Math.floor(endDate.getTime() / 1000);
          queryString = `ts:${startTs}-${endTs} AND (${params.query})`;
        }
        
        return await client.searchFlows({ 
          query: queryString, 
          limit: apiParams.limit,
          group_by: params.group_by,
          aggregate: params.aggregate
        }, searchOptions);
      }
    });

    this.strategies.set('alarms', {
      entityType: 'alarms',
      executeApiCall: async (client, params, apiParams) => {
        return await client.getActiveAlarms(
          apiParams.queryString || params.query || undefined,
          undefined,
          'ts:desc',
          params.limit
        );
      }
    });

    this.strategies.set('rules', {
      entityType: 'rules',
      executeApiCall: async (client, params) => {
        // Use reasonable limit for search operations to prevent memory issues
        const searchLimit = params.limit ? Math.min(params.limit * 2, 2000) : 2000;
        return await client.getNetworkRules(undefined, searchLimit);
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
      executeApiCall: async (client, params, searchOptions) => {
        const searchQuery = {
          query: params.query,
          limit: params.limit,
          cursor: params?.cursor,
          sort_by: params?.sort_by,
          group_by: params?.group_by,
          aggregate: params?.aggregate
        };
        
        // Add time range to searchOptions if provided
        if (params.time_range?.start && params.time_range?.end) {
          searchOptions.time_range = {
            start: params.time_range.start,
            end: params.time_range.end
          };
        }
        
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
   * Standardized parameter validation for all search operations
   */
  private validateSearchParams(params: SearchParams, entityType: string, config: SearchValidationConfig): void {
    const errors: string[] = [];

    // Validate params is not null/undefined
    if (!params || typeof params !== 'object') {
      errors.push('Parameters object is required');
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }

    // Validate query parameter
    if (config.requireQuery !== false) {
      const queryValidation = ParameterValidator.validateRequiredString(params?.query, 'query');
      if (!queryValidation.isValid) {
        errors.push(...queryValidation.errors);
      } else if (!config.allowEmptyQuery && !queryValidation.sanitizedValue?.trim()) {
        errors.push('query cannot be empty');
      }
    }

    // Validate limit parameter with consistent boundary checking
    if (config.requireLimit !== false) {
      const maxLimit = config.maxLimit || (entityType === 'flows' ? 10000 : 5000);
      const limitValidation = ParameterValidator.validateNumber(params?.limit, 'limit', {
        required: true,
        min: 1,
        max: maxLimit,
        integer: true
      });
      
      if (!limitValidation.isValid) {
        errors.push(...limitValidation.errors);
      }
    }

    // Validate sort_by parameter if provided
    if (params.sort_by !== undefined) {
      const sortValidation = ParameterValidator.validateOptionalString(params.sort_by, 'sort_by');
      if (!sortValidation.isValid) {
        errors.push(...sortValidation.errors);
      }
    }

    // Validate group_by parameter if provided
    if (params.group_by !== undefined) {
      const groupValidation = ParameterValidator.validateOptionalString(params.group_by, 'group_by');
      if (!groupValidation.isValid) {
        errors.push(...groupValidation.errors);
      }
    }

    // Validate cursor parameter if cursor is supported
    if (config.supportsCursor && params.cursor !== undefined) {
      const cursorValidation = ParameterValidator.validateOptionalString(params.cursor, 'cursor');
      if (!cursorValidation.isValid) {
        errors.push(...cursorValidation.errors);
      }
    }

    // Validate time_range parameter if time range is supported
    if (config.supportsTimeRange && params.time_range !== undefined) {
      if (!params.time_range || typeof params.time_range !== 'object') {
        errors.push('time_range must be an object with start and end properties');
      } else {
        const { start, end } = params.time_range;
        
        if (start !== undefined) {
          const startDate = new Date(start);
          if (isNaN(startDate.getTime())) {
            errors.push('time_range.start must be a valid ISO 8601 date string');
          }
        }
        
        if (end !== undefined) {
          const endDate = new Date(end);
          if (isNaN(endDate.getTime())) {
            errors.push('time_range.end must be a valid ISO 8601 date string');
          }
        }
        
        if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate >= endDate) {
            errors.push('time_range.start must be before time_range.end');
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }
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

      // Use standardized parameter validation
      this.validateSearchParams(params, entityType, validationConfig);

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
      
      // Time range handling is done within individual strategies to avoid duplication

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
      supportsTimeRange: true,
      maxLimit: 10000
    });
  }

  /**
   * Execute a search query for alarms
   */
  async searchAlarms(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'alarms', {
      requireQuery: true,
      requireLimit: true,
      maxLimit: 5000
    });
  }

  /**
   * Execute a search query for rules
   */
  async searchRules(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'rules', {
      requireQuery: true,
      requireLimit: true,
      maxLimit: 3000
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
      supportsTimeRange: true,
      maxLimit: 2000
    });
  }

  /**
   * Execute a search query for target lists
   */
  async searchTargetLists(params: SearchParams): Promise<SearchResult> {
    return this.executeSearch(params, 'target_lists', {
      requireQuery: true,
      requireLimit: true,
      maxLimit: 1000
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
   * Enhanced cross-reference search with multi-field correlation capabilities
   */
  async enhancedCrossReferenceSearch(params: { 
    primary_query: string; 
    secondary_queries: string[]; 
    correlation_params: EnhancedCorrelationParams;
    limit?: number;
  }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(limit, 'limit', {
        min: 1, max: 5000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }
      
      // Validate enhanced cross-reference parameters
      const validation = validateEnhancedCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_params
      );
      
      if (!validation.isValid) {
        throw new Error(`Enhanced cross-reference validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Determine entity types based on query patterns
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const secondaryTypes = params.secondary_queries.map(q => suggestEntityType(q) || 'alarms');
      
      // Execute primary query
      const primaryResult = await this.executeSearchByType(primaryType, params.primary_query, limit);
      
      // Execute secondary queries and perform enhanced correlation
      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType
        },
        correlations: [],
        correlation_params: params.correlation_params
      };

      for (let index = 0; index < params.secondary_queries.length; index++) {
        const secondaryQuery = params.secondary_queries[index];
        const secondaryType = secondaryTypes[index];
        
        // Execute secondary query
        const secondaryResult = await this.executeSearchByType(secondaryType, secondaryQuery, limit);
        
        // Perform multi-field correlation
        const correlationResult = performMultiFieldCorrelation(
          primaryResult.results,
          secondaryResult.results,
          primaryType,
          secondaryType,
          params.correlation_params
        );

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: correlationResult.correlatedResults,
          count: correlationResult.correlatedResults.length,
          correlation_stats: correlationResult.correlationStats,
          entity_type: secondaryType
        });
      }

      // Calculate overall correlation summary
      const totalCorrelated = correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.count, 0);
      const avgCorrelationRate = correlatedResults.correlations.length > 0
        ? Math.round(correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.correlation_stats.correlationRate, 0) / correlatedResults.correlations.length)
        : 0;

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          total_correlated_count: totalCorrelated,
          average_correlation_rate: avgCorrelationRate,
          correlation_fields: params.correlation_params.correlationFields,
          correlation_type: params.correlation_params.correlationType,
          temporal_window_applied: !!params.correlation_params.temporalWindow
        }
      };

    } catch (error) {
      throw new Error(`Enhanced cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enhanced cross-reference search with scoring and fuzzy matching capabilities
   */
  async enhancedScoredCrossReferenceSearch(params: {
    primary_query: string;
    secondary_queries: string[];
    correlation_params: ScoringCorrelationParams;
    limit?: number;
  }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(limit, 'limit', {
        min: 1, max: 5000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }

      // Validate enhanced correlation parameters
      const validation = validateEnhancedCrossReference(
        params.primary_query,
        params.secondary_queries,
        params.correlation_params
      );
      
      if (!validation.isValid) {
        throw new Error(`Enhanced correlation validation failed: ${validation.errors.join(', ')}`);
      }

      // Execute primary query
      const primaryType = suggestEntityType(params.primary_query) || 'flows';
      const primaryResult = await this.executeSearchByType(primaryType, params.primary_query, limit);

      const correlatedResults: any = {
        primary: {
          query: params.primary_query,
          results: primaryResult.results,
          count: primaryResult.count,
          entity_type: primaryType
        },
        correlations: []
      };

      // Execute secondary queries and perform enhanced correlation
      for (let i = 0; i < params.secondary_queries.length; i++) {
        const secondaryQuery = params.secondary_queries[i];
        const secondaryType = suggestEntityType(secondaryQuery) || 'alarms';
        
        // Execute secondary query
        const secondaryResult = await this.executeSearchByType(secondaryType, secondaryQuery, limit);
        
        // Perform enhanced multi-field correlation with scoring
        const enhancedResult = performEnhancedMultiFieldCorrelation(
          primaryResult.results,
          secondaryResult.results,
          primaryType,
          secondaryType,
          params.correlation_params
        );

        correlatedResults.correlations.push({
          query: secondaryQuery,
          results: enhancedResult.correlatedResults,
          count: enhancedResult.correlatedResults.length,
          correlation_stats: enhancedResult.correlationStats,
          enhanced_stats: enhancedResult.enhancedStats,
          scored_results: enhancedResult.scoredResults,
          entity_type: secondaryType,
          scoring_enabled: params.correlation_params.enableScoring,
          fuzzy_matching_enabled: params.correlation_params.enableFuzzyMatching
        });
      }

      // Calculate enhanced correlation summary
      const totalCorrelated = correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.count, 0);
      const avgCorrelationRate = correlatedResults.correlations.length > 0
        ? Math.round(correlatedResults.correlations.reduce((sum: number, c: any) => sum + c.correlation_stats.correlationRate, 0) / correlatedResults.correlations.length)
        : 0;

      // Calculate enhanced metrics
      const enhancedMetrics = correlatedResults.correlations
        .filter((c: any) => c.enhanced_stats)
        .map((c: any) => c.enhanced_stats);

      const avgScore = enhancedMetrics.length > 0
        ? enhancedMetrics.reduce((sum: number, stats: any) => sum + stats.averageScore, 0) / enhancedMetrics.length
        : 0;

      const scoreDistribution = enhancedMetrics.length > 0
        ? enhancedMetrics.reduce((acc: any, stats: any) => ({
            high: acc.high + stats.scoreDistribution.high,
            medium: acc.medium + stats.scoreDistribution.medium,
            low: acc.low + stats.scoreDistribution.low
          }), { high: 0, medium: 0, low: 0 })
        : { high: 0, medium: 0, low: 0 };

      return {
        ...correlatedResults,
        execution_time_ms: Date.now() - startTime,
        correlation_summary: {
          primary_count: primaryResult.count,
          total_correlated_count: totalCorrelated,
          average_correlation_rate: avgCorrelationRate,
          correlation_fields: params.correlation_params.correlationFields,
          correlation_type: params.correlation_params.correlationType,
          temporal_window_applied: !!params.correlation_params.temporalWindow,
          // Enhanced scoring metrics
          scoring_enabled: params.correlation_params.enableScoring,
          fuzzy_matching_enabled: params.correlation_params.enableFuzzyMatching,
          average_correlation_score: Math.round(avgScore * 1000) / 1000,
          score_distribution: scoreDistribution,
          minimum_score_threshold: params.correlation_params.minimumScore || 0.3
        }
      };

    } catch (error) {
      throw new Error(`Enhanced scored cross-reference search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cross-reference search across multiple entity types with improved field mapping
   */
  async crossReferenceSearch(params: { primary_query: string; secondary_queries: string[]; correlation_field: string; limit?: number }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate limit parameter
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(limit, 'limit', {
        min: 1, max: 5000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }
      
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
      const primaryResult = await this.executeSearchByType(primaryType, params.primary_query, limit);
      
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
        const secondaryResult = await this.executeSearchByType(secondaryType, secondaryQuery, limit);
        
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
    // Pre-compute values for efficient sorting
    const itemsWithValues = results.map(item => ({
      item,
      value: this.getNestedValue(item, sortBy)
    }));
    
    itemsWithValues.sort((a, b) => {
      const valueA = a.value;
      const valueB = b.value;
      
      if (valueA === valueB) {
        return 0;
      }
      
      const comparison = valueA < valueB ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return itemsWithValues.map(({ item }) => item);
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

  /**
   * Get suggested correlation field combinations for given queries
   */
  async getCorrelationSuggestions(params: { 
    primary_query: string; 
    secondary_queries: string[] 
  }): Promise<any> {
    try {
      // Determine entity types from queries
      const primaryType = suggestEntityType(params.primary_query);
      const secondaryTypes = params.secondary_queries.map(q => suggestEntityType(q));
      const allTypes = [primaryType, ...secondaryTypes].filter(Boolean) as any[];
      
      // Get supported correlation combinations
      const combinations = getSupportedCorrelationCombinations(allTypes);
      
      // Categorize combinations by type and complexity
      const suggestions = {
        single_field: combinations.filter(combo => combo.length === 1),
        dual_field: combinations.filter(combo => combo.length === 2),
        multi_field: combinations.filter(combo => combo.length >= 3),
        recommended: [
          // Network-focused correlations
          ['source_ip', 'destination_ip'],
          ['device_ip', 'protocol'],
          // Temporal correlations
          ['timestamp', 'device_id'],
          // Security correlations
          ['source_ip', 'threat_level'],
          ['device_ip', 'geo_location']
        ].filter(combo => 
          combinations.some(c => c.length === combo.length && combo.every(f => c.includes(f)))
        ),
        entity_types: {
          primary: primaryType,
          secondary: secondaryTypes
        },
        supported_fields: combinations.reduce((acc: string[], combo) => {
          combo.forEach(field => {
            if (!acc.includes(field)) {
              acc.push(field);
            }
          });
          return acc;
        }, [])
      };
      
      return suggestions;
      
    } catch (error) {
      throw new Error(`Correlation suggestions failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Advanced geographic search for flows with location-based filtering and analysis
   */
  async searchFlowsByGeography(params: {
    query?: string;
    geographic_filters?: {
      countries?: string[];
      continents?: string[];
      regions?: string[];
      cities?: string[];
      asns?: string[];
      hosting_providers?: string[];
      exclude_cloud?: boolean;
      exclude_vpn?: boolean;
      min_risk_score?: number;
    };
    limit: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    aggregate?: boolean;
  }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate limit parameter
      const limitValidation = ParameterValidator.validateNumber(params.limit, 'limit', {
        required: true, min: 1, max: 10000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }

      // Build geographic query - simplified approach to avoid parsing issues
      let geographicQuery = params.query || '';
      
      if (params.geographic_filters) {
        const geoConditions: string[] = [];
        
        // Handle countries - take first one to avoid OR parsing issues
        if (params.geographic_filters.countries?.length) {
          const firstCountry = params.geographic_filters.countries[0];
          geoConditions.push(`country:${firstCountry}`);
        }
        
        // Handle continents - take first one
        if (params.geographic_filters.continents?.length) {
          const firstContinent = params.geographic_filters.continents[0];
          geoConditions.push(`continent:${firstContinent}`);
        }
        
        // Handle regions - take first one
        if (params.geographic_filters.regions?.length) {
          const firstRegion = params.geographic_filters.regions[0];
          geoConditions.push(`region:${firstRegion}`);
        }
        
        // Handle cities - take first one
        if (params.geographic_filters.cities?.length) {
          const firstCity = params.geographic_filters.cities[0];
          geoConditions.push(`city:${firstCity}`);
        }
        
        // Handle ASNs - take first one
        if (params.geographic_filters.asns?.length) {
          const firstAsn = params.geographic_filters.asns[0];
          geoConditions.push(`asn:${firstAsn}`);
        }
        
        // Handle hosting providers - take first one
        if (params.geographic_filters.hosting_providers?.length) {
          const firstProvider = params.geographic_filters.hosting_providers[0];
          geoConditions.push(`hosting_provider:${firstProvider}`);
        }
        
        if (params.geographic_filters.exclude_cloud) {
          geoConditions.push('NOT is_cloud_provider:true');
        }
        
        if (params.geographic_filters.exclude_vpn) {
          geoConditions.push('NOT is_vpn:true');
        }
        
        if (params.geographic_filters.min_risk_score !== undefined) {
          geoConditions.push(`geographic_risk_score:>=${params.geographic_filters.min_risk_score}`);
        }
        
        if (geoConditions.length > 0) {
          const geoQueryString = geoConditions.join(' AND ');
          geographicQuery = (!geographicQuery || geographicQuery.trim() === '') 
            ? geoQueryString
            : `${geographicQuery} AND ${geoQueryString}`;
        }
      }

      // Execute search with geographic query
      const searchParams = {
        query: geographicQuery || 'timestamp:>0',
        limit: params.limit,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
        group_by: params.group_by,
        aggregate: params.aggregate
      };

      const result = await this.searchFlows(searchParams);
      
      // Add geographic analysis
      const geographicAnalysis = this.analyzeGeographicData(result.results);
      
      return {
        ...result,
        geographic_analysis: geographicAnalysis,
        execution_time_ms: Date.now() - startTime
      };
      
    } catch (error) {
      throw new Error(`Geographic flows search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Advanced geographic search for alarms with location-based threat analysis
   */
  async searchAlarmsByGeography(params: {
    query?: string;
    geographic_filters?: {
      countries?: string[];
      continents?: string[];
      regions?: string[];
      high_risk_countries?: boolean;
      exclude_known_providers?: boolean;
      threat_analysis?: boolean;
    };
    limit: number;
    sort_by?: string;
    group_by?: string;
  }): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate limit parameter
      const limitValidation = ParameterValidator.validateNumber(params.limit, 'limit', {
        required: true, min: 1, max: 5000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }

      // Build geographic threat query - simplified approach
      let geographicQuery = params.query || '';
      
      if (params.geographic_filters) {
        const geoConditions: string[] = [];
        
        // Handle countries - take first one to avoid OR parsing issues
        if (params.geographic_filters.countries?.length) {
          const firstCountry = params.geographic_filters.countries[0];
          geoConditions.push(`country:${firstCountry}`);
        }
        
        // Handle continents - take first one
        if (params.geographic_filters.continents?.length) {
          const firstContinent = params.geographic_filters.continents[0];
          geoConditions.push(`continent:${firstContinent}`);
        }
        
        // Handle regions - take first one
        if (params.geographic_filters.regions?.length) {
          const firstRegion = params.geographic_filters.regions[0];
          geoConditions.push(`region:${firstRegion}`);
        }
        
        if (params.geographic_filters.high_risk_countries) {
          // Add query for countries with higher security risk
          geoConditions.push('geographic_risk_score:>=7');
        }
        
        if (params.geographic_filters.exclude_known_providers) {
          geoConditions.push('NOT is_cloud_provider:true');
          geoConditions.push('NOT hosting_provider:*');
        }
        
        if (geoConditions.length > 0) {
          const geoQueryString = geoConditions.join(' AND ');
          geographicQuery = (!geographicQuery || geographicQuery.trim() === '') 
            ? geoQueryString
            : `${geographicQuery} AND ${geoQueryString}`;
        }
      }

      // Execute alarm search
      const searchParams = {
        query: geographicQuery || 'timestamp:>0',
        limit: params.limit,
        sort_by: params.sort_by,
        group_by: params.group_by
      };

      const result = await this.searchAlarms(searchParams);
      
      // Add geographic threat analysis if requested
      let threatAnalysis;
      if (params.geographic_filters?.threat_analysis) {
        threatAnalysis = this.analyzeGeographicThreats(result.results);
      }
      
      return {
        ...result,
        geographic_threat_analysis: threatAnalysis,
        execution_time_ms: Date.now() - startTime
      };
      
    } catch (error) {
      throw new Error(`Geographic alarms search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Comprehensive geographic statistics and analytics
   */
  async getGeographicStatistics(params: {
    entity_type: 'flows' | 'alarms';
    time_range?: {
      start: string;
      end: string;
    };
    analysis_type?: 'summary' | 'detailed' | 'threat_intelligence';
    group_by?: 'country' | 'continent' | 'region' | 'asn' | 'provider';
    limit?: number;
  }): Promise<any> {
    const startTime = Date.now();
    
    try {
      const limit = params.limit || 1000;
      const limitValidation = ParameterValidator.validateNumber(limit, 'limit', {
        min: 1, max: 10000, integer: true
      });
      
      if (!limitValidation.isValid) {
        throw new Error(`Parameter validation failed: ${limitValidation.errors.join(', ')}`);
      }

      // Build base query for geographic analysis
      let baseQuery = 'timestamp:>0';
      
      // Add time range if specified
      if (params.time_range) {
        const startTs = Math.floor(new Date(params.time_range.start).getTime() / 1000);
        const endTs = Math.floor(new Date(params.time_range.end).getTime() / 1000);
        baseQuery = `timestamp:[${startTs} TO ${endTs}]`;
      }

      // Execute search based on entity type
      const searchParams = {
        query: baseQuery,
        limit,
        group_by: params.group_by || 'country',
        aggregate: true
      };

      let searchResult;
      if (params.entity_type === 'flows') {
        searchResult = await this.searchFlows(searchParams);
      } else {
        searchResult = await this.searchAlarms(searchParams);
      }

      // Generate geographic statistics
      const statistics = this.generateGeographicStatistics(
        searchResult, 
        params.analysis_type || 'summary',
        params.group_by || 'country'
      );
      
      return {
        entity_type: params.entity_type,
        time_range: params.time_range,
        analysis_type: params.analysis_type || 'summary',
        group_by: params.group_by || 'country',
        statistics,
        total_records: searchResult.count,
        execution_time_ms: Date.now() - startTime
      };
      
    } catch (error) {
      throw new Error(`Geographic statistics failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze geographic data for patterns and insights
   */
  private analyzeGeographicData(results: any[]): any {
    const analysis = {
      total_flows: results.length,
      unique_countries: new Set(),
      unique_continents: new Set(),
      unique_asns: new Set(),
      cloud_provider_flows: 0,
      vpn_flows: 0,
      high_risk_flows: 0,
      top_countries: {} as Record<string, number>,
      top_asns: {} as Record<string, number>
    };

    results.forEach(flow => {
      // Extract geographic data using field mapping
      const country = getFieldValue(flow, 'country', 'flows');
      const continent = getFieldValue(flow, 'continent', 'flows');
      const asn = getFieldValue(flow, 'asn', 'flows');
      const isCloud = getFieldValue(flow, 'is_cloud_provider', 'flows');
      const isVpn = getFieldValue(flow, 'is_vpn', 'flows');
      const riskScore = getFieldValue(flow, 'geographic_risk_score', 'flows');

      if (country) {
        analysis.unique_countries.add(country);
        analysis.top_countries[country] = (analysis.top_countries[country] || 0) + 1;
      }
      
      if (continent) {
        analysis.unique_continents.add(continent);
      }
      
      if (asn) {
        analysis.unique_asns.add(asn);
        analysis.top_asns[asn] = (analysis.top_asns[asn] || 0) + 1;
      }
      
      if (isCloud) { analysis.cloud_provider_flows++; }
      if (isVpn) { analysis.vpn_flows++; }
      if (riskScore && riskScore >= RISK_THRESHOLDS.HIGH_RISK_FLOW_MIN) { analysis.high_risk_flows++; }
    });

    // Convert sets to counts
    return {
      ...analysis,
      unique_countries: analysis.unique_countries.size,
      unique_continents: analysis.unique_continents.size,
      unique_asns: analysis.unique_asns.size,
      top_countries: Object.entries(analysis.top_countries)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .reduce((acc, [country, count]) => {
          acc[country] = count;
          return acc;
        }, {} as Record<string, number>),
      top_asns: Object.entries(analysis.top_asns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .reduce((acc, [asn, count]) => {
          acc[asn] = count;
          return acc;
        }, {} as Record<string, number>)
    };
  }

  /**
   * Analyze geographic threats for security insights
   */
  private analyzeGeographicThreats(results: any[]): any {
    const threats = {
      total_alarms: results.length,
      high_risk_countries: {} as Record<string, number>,
      threat_by_continent: {} as Record<string, number>,
      suspicious_asns: {} as Record<string, number>,
      cloud_threats: 0,
      vpn_threats: 0,
      proxy_threats: 0,
      risk_distribution: {
        low: 0,    // 0-3
        medium: 0, // 4-6
        high: 0,   // 7-8
        critical: 0 // 9-10
      }
    };

    results.forEach(alarm => {
      const country = getFieldValue(alarm, 'country', 'alarms');
      const continent = getFieldValue(alarm, 'continent', 'alarms');
      const asn = getFieldValue(alarm, 'asn', 'alarms');
      const isCloud = getFieldValue(alarm, 'is_cloud_provider', 'alarms');
      const isVpn = getFieldValue(alarm, 'is_vpn', 'alarms');
      const isProxy = getFieldValue(alarm, 'is_proxy', 'alarms');
      const riskScore = getFieldValue(alarm, 'geographic_risk_score', 'alarms') || 0;

      if (country && riskScore >= RISK_THRESHOLDS.HIGH_RISK_COUNTRY_MIN) {
        threats.high_risk_countries[country] = (threats.high_risk_countries[country] || 0) + 1;
      }
      
      if (continent) {
        threats.threat_by_continent[continent] = (threats.threat_by_continent[continent] || 0) + 1;
      }
      
      if (asn && riskScore >= RISK_THRESHOLDS.SUSPICIOUS_ASN_MIN) {
        threats.suspicious_asns[asn] = (threats.suspicious_asns[asn] || 0) + 1;
      }
      
      if (isCloud) { threats.cloud_threats++; }
      if (isVpn) { threats.vpn_threats++; }
      if (isProxy) { threats.proxy_threats++; }

      // Categorize risk
      if (riskScore <= RISK_THRESHOLDS.LOW_MAX) {threats.risk_distribution.low++;}
      else if (riskScore <= RISK_THRESHOLDS.MEDIUM_MAX) {threats.risk_distribution.medium++;}
      else if (riskScore <= RISK_THRESHOLDS.HIGH_MAX) {threats.risk_distribution.high++;}
      else {threats.risk_distribution.critical++;}
    });

    return threats;
  }

  /**
   * Generate detailed geographic statistics
   */
  private generateGeographicStatistics(searchResult: any, analysisType: string, groupBy: string): any {
    const stats = {
      summary: {
        total_records: searchResult.count || 0,
        grouped_by: groupBy,
        analysis_type: analysisType
      },
      distribution: searchResult.aggregations || {},
      insights: [] as string[]
    };

    // Add insights based on analysis
    if (searchResult.aggregations) {
      const entries = Object.entries(searchResult.aggregations);
      const totalRecords = searchResult.count || 0;
      
      // Find top entries
      const sortedEntries = entries.sort(([,a]: any, [,b]: any) => (b.count || 0) - (a.count || 0));
      
      if (sortedEntries.length > 0) {
        const topEntry = sortedEntries[0];
        const percentage = Math.round(((topEntry[1] as any).count / totalRecords) * 100);
        stats.insights.push(`Top ${groupBy}: ${topEntry[0]} (${percentage}% of total)`);
      }
      
      if (sortedEntries.length > 1) {
        const secondEntry = sortedEntries[1];
        const percentage = Math.round(((secondEntry[1] as any).count / totalRecords) * 100);
        stats.insights.push(`Second most active ${groupBy}: ${secondEntry[0]} (${percentage}% of total)`);
      }
      
      // Geographic diversity insight
      stats.insights.push(`Geographic diversity: ${entries.length} unique ${groupBy}s`);
    }

    return stats;
  }
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
  search_cross_reference: SearchEngine['crossReferenceSearch'];
  search_enhanced_cross_reference: SearchEngine['enhancedCrossReferenceSearch'];
  search_enhanced_scored_cross_reference: SearchEngine['enhancedScoredCrossReferenceSearch'];
  get_correlation_suggestions: SearchEngine['getCorrelationSuggestions'];
  search_flows_by_geography: SearchEngine['searchFlowsByGeography'];
  search_alarms_by_geography: SearchEngine['searchAlarmsByGeography'];
  get_geographic_statistics: SearchEngine['getGeographicStatistics'];
}

/**
 * Creates and returns a set of advanced search functions for querying Firewalla MCP server entities.
 *
 * The returned object provides methods for searching flows, alarms, rules, devices, target lists, and performing cross-reference searches, all using the provided Firewalla client instance.
 */
export function createSearchTools(firewalla: FirewallaClient): SearchTools {
  const searchEngine = new SearchEngine(firewalla);

  return {
    search_flows: searchEngine.searchFlows.bind(searchEngine),
    search_alarms: searchEngine.searchAlarms.bind(searchEngine),
    search_rules: searchEngine.searchRules.bind(searchEngine),
    search_devices: searchEngine.searchDevices.bind(searchEngine),
    search_target_lists: searchEngine.searchTargetLists.bind(searchEngine),
    search_cross_reference: searchEngine.crossReferenceSearch.bind(searchEngine),
    search_enhanced_cross_reference: searchEngine.enhancedCrossReferenceSearch.bind(searchEngine),
    search_enhanced_scored_cross_reference: searchEngine.enhancedScoredCrossReferenceSearch.bind(searchEngine),
    get_correlation_suggestions: searchEngine.getCorrelationSuggestions.bind(searchEngine),
    search_flows_by_geography: searchEngine.searchFlowsByGeography.bind(searchEngine),
    search_alarms_by_geography: searchEngine.searchAlarmsByGeography.bind(searchEngine),
    get_geographic_statistics: searchEngine.getGeographicStatistics.bind(searchEngine)
  };
}