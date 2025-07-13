/**
 * @fileoverview Base types and interfaces for MCP tool handlers
 *
 * Provides foundational classes and interfaces for implementing MCP tools that
 * interact with Firewalla firewall data. Includes standardized error handling,
 * response formatting, and validation patterns for consistent tool behavior.
 *
 * The base infrastructure ensures all tools follow MCP protocol standards while
 * providing consistent error reporting and response structure across the entire
 * tool ecosystem.
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import type { FirewallaClient } from '../../firewalla/client.js';
import type { ToolResponseUnified } from '../../types.js';
import {
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  validateAndSanitizeParameters,
  type SanitizationConfig,
} from '../../validation/parameter-sanitizer.js';
import { toSnakeCaseDeep } from '../../utils/field-normalizer.js';
import {
  enrichWithGeographicData,
  getGlobalEnrichmentPipeline
} from '../../utils/geographic-enrichment-pipeline.js';
import { geoCache } from '../../utils/geographic.js';
import { featureFlags } from '../../config/feature-flags.js';

/**
 * Base arguments interface for MCP tool execution
 *
 * Provides type-safe foundation for all tool arguments while maintaining flexibility
 * for tool-specific parameter extensions. Tools should extend this interface with
 * their specific argument requirements to ensure proper type checking.
 */
export interface BaseToolArgs {
  /** @description Optional limit for paginated results (recommended: 1-1000) */
  limit?: number;
  /** @description Optional offset for paginated results */
  offset?: number;
  /** @description Optional cursor for cursor-based pagination */
  cursor?: string;
  /** @description Optional sorting field specification */
  sort_by?: string;
  /** @description Optional sort order (ascending or descending) */
  sort_order?: 'asc' | 'desc';
  /** @description Optional grouping field for result aggregation */
  group_by?: string;
  /** @description Optional flag to enable result aggregation */
  aggregate?: boolean;
  /** @description Optional flag to force refresh and bypass cache */
  force_refresh?: boolean;
  [key: string]: unknown; // Allow additional properties while maintaining base structure
}

/**
 * Common query parameters for search and filtering operations
 */
export interface QueryArgs {
  /** @description Query string for filtering results */
  query?: string;
  /** @description Alternative query field name for compatibility */
  queryBy?: string;
  /** @description Alternative sort field name for compatibility */
  sortBy?: string;
  /** @description Alternative group field name for compatibility */
  groupBy?: string;
}

/**
 * Time range parameters for temporal filtering
 */
export interface TimeRangeArgs {
  /** @description Start time for filtering (ISO string or Unix timestamp) */
  start_time?: string | number;
  /** @description End time for filtering (ISO string or Unix timestamp) */
  end_time?: string | number;
  /** @description Time range object with start and end */
  time_range?: {
    start?: string | number;
    end?: string | number;
  };
}

/**
 * Device-specific parameters
 */
export interface DeviceArgs {
  /** @description Specific device ID to filter by */
  device_id?: string;
  /** @description Whether to include offline devices */
  include_offline?: boolean;
}

/**
 * Geographic filtering parameters
 */
export interface GeographicArgs {
  /** @description Geographic filters object */
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
}

/**
 * Cross-reference and correlation parameters
 */
export interface CorrelationArgs {
  /** @description Primary query for correlation */
  primary_query?: string;
  /** @description Secondary queries for correlation */
  secondary_queries?: string[];
  /** @description Field to correlate on */
  correlation_field?: string;
  /** @description Correlation parameters object */
  correlation_params?: {
    correlationFields?: string[];
    correlationType?: 'AND' | 'OR';
    temporalWindow?: {
      windowSize?: number;
      windowUnit?: string;
    };
    networkScope?: {
      includeSubnets?: boolean;
      includePorts?: boolean;
    };
    enableScoring?: boolean;
    enableFuzzyMatching?: boolean;
    minimumScore?: number;
    customWeights?: Record<string, number>;
    fuzzyConfig?: {
      enabled?: boolean;
      stringThreshold?: number;
      ipSubnetMatching?: boolean;
      numericTolerance?: number;
      geographicRadius?: number;
    };
  };
}

/**
 * Box/Group management parameters
 */
export interface BoxArgs {
  /** @description Group ID for filtering boxes */
  group_id?: string;
}

/**
 * Comprehensive tool arguments interface that includes all common parameter patterns
 * used across the Firewalla MCP server tool handlers.
 *
 * This replaces the generic `any` type with specific, type-safe interfaces that
 * cover all the parameter patterns observed in the codebase while maintaining
 * backward compatibility.
 */
export interface ToolArgs
  extends BaseToolArgs,
    QueryArgs,
    TimeRangeArgs,
    DeviceArgs,
    GeographicArgs,
    CorrelationArgs,
    BoxArgs {
  // Additional tool-specific parameters can be added here
  // while maintaining type safety through the constituent interfaces
}

/**
 * Standardized response structure for MCP tool execution
 *
 * All tools must return responses in this format for consistent MCP protocol compliance.
 * The content array supports multiple response blocks with different types and formatting.
 */
export interface ToolResponse {
  /** @description Array of content blocks containing tool output */
  content: Array<{
    /** @description Content type (typically 'text' for JSON responses) */
    type: string;
    /** @description The actual content text (usually JSON.stringify result) */
    text: string;
  }>;
  /** @description Optional flag indicating if the response represents an error condition */
  isError?: boolean;
  /** @description Additional metadata or context for the response */
  [key: string]: unknown;
}

/**
 * Interface defining the contract for all MCP tool handlers
 *
 * Provides the foundation for implementing interactive tools that can be invoked
 * by Claude through the MCP protocol to access and manipulate Firewalla data.
 */
export interface ToolHandler {
  /**
   * Execute the tool with given arguments and return formatted response
   *
   * @param args - Tool-specific arguments provided by the MCP client
   * @param firewalla - Authenticated Firewalla client for API access
   * @returns Promise resolving to formatted tool response
   */
  execute: (
    args: ToolArgs,
    firewalla: FirewallaClient
  ) => Promise<ToolResponse>;

  /** @description Unique tool identifier used in MCP tool registration */
  name: string;

  /** @description Human-readable description of tool functionality */
  description: string;

  /** @description Tool category for organizational and filtering purposes */
  category: 'security' | 'network' | 'device' | 'rule' | 'analytics' | 'search';
}

/**
 * Configuration options for BaseToolHandler
 */
export interface BaseToolOptions {
  /** Whether to enable geographic enrichment for IP addresses */
  enableGeoEnrichment?: boolean;
  /** Whether to enable field normalization to snake_case */
  enableFieldNormalization?: boolean;
  /** Additional metadata to include in responses */
  additionalMeta?: Record<string, any>;
}

/**
 * Generate a simple request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Base class for tool handlers with common validation and error handling
 *
 * Provides standardized implementation patterns for MCP tools including:
 * - Unified response formatting with consistent metadata
 * - Automatic geographic enrichment for IP addresses
 * - Field normalization to snake_case
 * - JSON serialization with proper error handling
 * - Tool metadata structure validation
 * - Common utility methods for response construction
 *
 * All concrete tool implementations should extend this class to ensure
 * uniform behavior across the tool ecosystem.
 *
 * @abstract
 * @implements {ToolHandler}
 */
export abstract class BaseToolHandler implements ToolHandler {
  /** @description Tool identifier - must be implemented by concrete classes */
  abstract name: string;

  /** @description Tool description - must be implemented by concrete classes */
  abstract description: string;

  /** @description Tool category - must be implemented by concrete classes */
  abstract category:
    | 'security'
    | 'network'
    | 'device'
    | 'rule'
    | 'analytics'
    | 'search';

  /** @description Configuration options for this handler */
  protected options: BaseToolOptions;

  /**
   * Constructor with default configuration
   */
  constructor(options: BaseToolOptions = {}) {
    this.options = {
      enableGeoEnrichment: true, // Default to enabled for consistency
      enableFieldNormalization: true, // Default to enabled for consistency
      ...options,
    };
  }

  /**
   * Execute the tool logic - must be implemented by concrete classes
   *
   * @param args - Tool arguments from MCP client
   * @param firewalla - Firewalla API client instance
   * @returns Promise resolving to tool response
   */
  abstract execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse>;

  /**
   * Create a legacy success response (DEPRECATED - Use createUnifiedResponse)
   *
   * @param data - The data to include in the response
   * @returns Formatted success response compliant with MCP protocol
   * @protected
   * @deprecated Use createUnifiedResponse for new handlers
   */
  protected createSuccessResponse(data: any): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Create a unified success response with consistent formatting and enrichment
   *
   * @param data - The data to include in the response
   * @param options - Additional options for response generation
   * @returns Formatted success response with unified structure
   * @protected
   */
  protected async createUnifiedResponse(
    data: any,
    options: {
      executionTimeMs?: number;
      requestId?: string;
      additionalMeta?: Record<string, any>;
    } = {}
  ): Promise<ToolResponse> {
    const startTime = Date.now();
    let processedData = data;
    const meta: Record<string, any> = {};

    // Apply geographic enrichment if enabled
    if (this.options.enableGeoEnrichment && featureFlags.GEOGRAPHIC_ENRICHMENT_ENABLED) {
      try {
        processedData = await enrichWithGeographicData(processedData, geoCache);
        meta.geo_enriched = true;
      } catch (error) {
        // Geographic enrichment failure shouldn't break the response
        meta.geo_enriched = false;
        meta.geo_enrichment_error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // Apply field normalization if enabled
    if (this.options.enableFieldNormalization) {
      try {
        processedData = toSnakeCaseDeep(processedData);
        meta.field_normalized = true;
      } catch (error) {
        // Field normalization failure shouldn't break the response
        meta.field_normalized = false;
        meta.field_normalization_error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // Build unified response
    const unifiedResponse: ToolResponseUnified = {
      success: true,
      data: processedData,
      meta: {
        request_id: options.requestId || generateRequestId(),
        execution_time_ms: options.executionTimeMs || (Date.now() - startTime),
        handler: this.name,
        timestamp: new Date().toISOString(),
        count: Array.isArray(processedData) ? processedData.length : undefined,
        ...meta,
        ...this.options.additionalMeta,
        ...options.additionalMeta,
      },
    };

    // Convert to MCP ToolResponse format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(unifiedResponse, null, 2),
        },
      ],
    };
  }

  /**
   * Helper method for geographic enrichment that can be called by handlers
   *
   * @param payload - Data to enrich with geographic information
   * @param ipFields - Array of IP field names to enrich (defaults to common fields)
   * @returns Promise resolving to enriched data
   * @protected
   */
  protected async enrichGeoIfNeeded<T>(
    payload: T,
    ipFields: string[] = ['source_ip', 'destination_ip', 'device_ip', 'ip']
  ): Promise<T> {
    if (!this.options.enableGeoEnrichment || !featureFlags.GEOGRAPHIC_ENRICHMENT_ENABLED) {
      return payload;
    }

    try {
      const pipeline = getGlobalEnrichmentPipeline(geoCache);
      return await pipeline.enrichObject(payload as any, ipFields) as T;
    } catch (error) {
      // Return original payload if enrichment fails
      return payload;
    }
  }

  /**
   * Create a standardized error response with diagnostic information
   *
   * @param message - Human-readable error message
   * @param errorType - Specific type of error (defaults to UNKNOWN_ERROR)
   * @param details - Optional additional error context or debugging information
   * @param validationErrors - Optional array of validation error messages
   * @returns Formatted error response with isError flag set
   * @protected
   */
  protected createErrorResponse(
    message: string,
    errorType: ErrorType = ErrorType.UNKNOWN_ERROR,
    details?: any,
    validationErrors?: string[]
  ): ToolResponse {
    return createErrorResponse(
      this.name,
      message,
      errorType,
      details,
      validationErrors
    );
  }

  /**
   * Sanitize and validate parameters early in the execution pipeline
   *
   * @param rawArgs - Raw arguments from MCP client
   * @param config - Optional sanitization configuration
   * @returns Sanitized arguments or error response
   * @protected
   */
  protected sanitizeParameters(
    rawArgs: unknown,
    config?: Partial<SanitizationConfig>
  ): { sanitizedArgs: ToolArgs } | { errorResponse: ToolResponse } {
    const result = validateAndSanitizeParameters(rawArgs, this.name, config);

    if ('errorResponse' in result) {
      return { errorResponse: result.errorResponse };
    }

    return { sanitizedArgs: result.sanitizedArgs };
  }

  /**
   * Execute tool with automatic parameter sanitization
   *
   * This is a convenience method that automatically sanitizes parameters
   * before calling the tool's main execution logic. Tools can override
   * this to customize sanitization behavior.
   *
   * @param rawArgs - Raw arguments from MCP client
   * @param firewalla - Firewalla API client instance
   * @param config - Optional sanitization configuration
   * @returns Promise resolving to tool response
   * @protected
   */
  protected async executeWithSanitization(
    rawArgs: unknown,
    firewalla: FirewallaClient,
    config?: Partial<SanitizationConfig>
  ): Promise<ToolResponse> {
    // Early parameter sanitization
    const sanitizationResult = this.sanitizeParameters(rawArgs, config);

    if ('errorResponse' in sanitizationResult) {
      return sanitizationResult.errorResponse;
    }

    // Call the tool's execute method with sanitized parameters
    return this.execute(sanitizationResult.sanitizedArgs, firewalla);
  }
}
