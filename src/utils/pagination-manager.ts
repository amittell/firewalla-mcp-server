/**
 * Standardized Pagination Management for Firewalla MCP Server
 * Provides consistent pagination handling across all tools and operations
 */

import { SafeAccess } from '../validation/error-handler.js';

/**
 * Standardized pagination configuration
 */
export interface PaginationConfig {
  /** Maximum page size allowed */
  maxPageSize: number;
  /** Default page size if not specified */
  defaultPageSize: number;
  /** Whether to use cursor-based pagination (preferred) */
  useCursor: boolean;
  /** Whether to use offset-based pagination (legacy) */
  useOffset: boolean;
  /** Whether to calculate total count (performance impact) */
  includeTotalCount: boolean;
}

/**
 * Pagination parameters from user input
 */
export interface PaginationParams {
  /** Requested page size/limit */
  limit?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
  /** Offset for offset-based pagination (deprecated) */
  offset?: number;
  /** Whether to include total count in response */
  include_total_count?: boolean;
}

/**
 * Standardized pagination response format
 */
export interface PaginationResponse {
  /** Current page size */
  limit: number;
  /** Number of items in current page */
  count: number;
  /** Total count if requested and available */
  total?: number;
  /** Whether there are more pages available */
  has_more: boolean;
  /** Cursor for next page (preferred) */
  next_cursor?: string | null;
  /** Offset for next page (deprecated) */
  offset?: number;
  /** Current page number (for offset-based pagination) */
  page?: number;
  /** Additional pagination metadata */
  metadata?: {
    pages_traversed?: number;
    estimated_total?: number;
    warning?: string;
  };
}

/**
 * Default pagination configuration
 */
const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  maxPageSize: 1000,
  defaultPageSize: 100,
  useCursor: true,
  useOffset: false,
  includeTotalCount: false,
};

/**
 * Pagination manager for consistent pagination handling
 */
export class PaginationManager {
  private config: PaginationConfig;

  constructor(config: Partial<PaginationConfig> = {}) {
    this.config = { ...DEFAULT_PAGINATION_CONFIG, ...config };
  }

  /**
   * Normalize pagination parameters from user input
   */
  normalizePaginationParams(params: PaginationParams): {
    limit: number;
    cursor?: string;
    offset: number;
    includeTotalCount: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Normalize limit
    let limit = params.limit || this.config.defaultPageSize;
    if (limit > this.config.maxPageSize) {
      warnings.push(
        `Requested limit ${limit} exceeds maximum ${this.config.maxPageSize}, using maximum`
      );
      limit = this.config.maxPageSize;
    }
    if (limit < 1) {
      warnings.push(
        `Invalid limit ${limit}, using default ${this.config.defaultPageSize}`
      );
      limit = this.config.defaultPageSize;
    }

    // Normalize cursor
    const cursor =
      params.cursor && params.cursor.trim().length > 0
        ? params.cursor
        : undefined;

    // Normalize offset (for backward compatibility)
    let offset = params.offset || 0;
    if (offset < 0) {
      warnings.push(`Invalid offset ${offset}, using 0`);
      offset = 0;
    }

    // Warn about mixed pagination types
    if (cursor && offset > 0) {
      warnings.push(
        'Both cursor and offset provided, preferring cursor-based pagination'
      );
      offset = 0;
    }

    // Warn about deprecated offset usage
    if (!cursor && offset > 0 && this.config.useCursor) {
      warnings.push(
        'Offset-based pagination is deprecated, consider using cursor-based pagination'
      );
    }

    const includeTotalCount = Boolean(params.include_total_count);

    return {
      limit,
      cursor,
      offset,
      includeTotalCount,
      warnings,
    };
  }

  /**
   * Create standardized pagination response
   */
  createPaginationResponse(
    results: any[],
    params: PaginationParams,
    apiResponse: any = {}
  ): PaginationResponse {
    const normalized = this.normalizePaginationParams(params);

    const paginationResponse: PaginationResponse = {
      limit: normalized.limit,
      count: results.length,
      has_more: Boolean(apiResponse.next_cursor || apiResponse.hasMore),
    };

    // Add cursor information (preferred method)
    if (this.config.useCursor) {
      paginationResponse.next_cursor = apiResponse.next_cursor || null;
    }

    // Add offset information (legacy support)
    if (
      this.config.useOffset ||
      (!this.config.useCursor && normalized.offset >= 0)
    ) {
      paginationResponse.offset = normalized.offset;
      paginationResponse.page =
        Math.floor(normalized.offset / normalized.limit) + 1;
    }

    // Add total count if available
    if (normalized.includeTotalCount || apiResponse.total !== undefined) {
      paginationResponse.total = SafeAccess.getNestedValue(
        apiResponse,
        'total',
        SafeAccess.getNestedValue(apiResponse, 'count', results.length)
      ) as number;
    }

    // Add metadata if available
    if (
      apiResponse.pages_traversed ||
      apiResponse.estimated_total ||
      normalized.warnings.length > 0
    ) {
      paginationResponse.metadata = {};

      if (apiResponse.pages_traversed) {
        paginationResponse.metadata.pages_traversed =
          apiResponse.pages_traversed;
      }

      if (apiResponse.estimated_total) {
        paginationResponse.metadata.estimated_total =
          apiResponse.estimated_total;
      }

      if (normalized.warnings.length > 0) {
        paginationResponse.metadata.warning = normalized.warnings.join('; ');
      }
    }

    return paginationResponse;
  }

  /**
   * Extract pagination information from API response
   */
  extractPaginationFromApiResponse(apiResponse: any): {
    hasMore: boolean;
    nextCursor?: string | null;
    total?: number;
    count?: number;
  } {
    const hasMoreIndicators = [
      'hasMore',
      'has_more',
      'next_cursor',
      'nextCursor',
      'more',
    ];

    const hasMore = hasMoreIndicators.some(key => {
      const value = SafeAccess.getNestedValue(apiResponse, key, false);
      return Boolean(value);
    });

    const nextCursor = SafeAccess.getNestedValue(
      apiResponse,
      'next_cursor',
      SafeAccess.getNestedValue(apiResponse, 'nextCursor', null)
    ) as string | null;

    const total = SafeAccess.getNestedValue(
      apiResponse,
      'total',
      SafeAccess.getNestedValue(apiResponse, 'totalCount', undefined)
    ) as number | undefined;

    const count = SafeAccess.getNestedValue(
      apiResponse,
      'count',
      SafeAccess.getNestedValue(apiResponse, 'size', undefined)
    ) as number | undefined;

    return {
      hasMore,
      nextCursor,
      total,
      count,
    };
  }

  /**
   * Get configuration for specific tool types
   */
  static getConfigForTool(toolName: string): Partial<PaginationConfig> {
    const configs: Record<string, Partial<PaginationConfig>> = {
      // Search tools - prefer cursor pagination
      search_flows: {
        maxPageSize: 1000,
        defaultPageSize: 100,
        useCursor: true,
        useOffset: false,
      },
      search_alarms: {
        maxPageSize: 1000,
        defaultPageSize: 100,
        useCursor: true,
        useOffset: false,
      },
      search_devices: {
        maxPageSize: 1000,
        defaultPageSize: 100,
        useCursor: true,
        useOffset: false,
      },

      // Basic listing tools - simpler pagination
      get_active_alarms: {
        maxPageSize: 1000,
        defaultPageSize: 50,
        useCursor: true,
        useOffset: true, // Support both for compatibility
      },
      get_device_status: {
        maxPageSize: 1000,
        defaultPageSize: 50,
        useCursor: true,
        useOffset: true,
      },

      // Analytics tools - often don't need pagination
      get_bandwidth_usage: {
        maxPageSize: 500,
        defaultPageSize: 20,
        useCursor: false,
        useOffset: false,
        includeTotalCount: false,
      },

      // Large result sets - need efficient pagination
      get_flow_data: {
        maxPageSize: 1000,
        defaultPageSize: 100,
        useCursor: true,
        useOffset: false,
        includeTotalCount: false, // Performance consideration
      },
    };

    return configs[toolName] || {};
  }

  /**
   * Create pagination manager for specific tool
   */
  static forTool(toolName: string): PaginationManager {
    const toolConfig = PaginationManager.getConfigForTool(toolName);
    return new PaginationManager(toolConfig);
  }
}

/**
 * Global pagination manager with default configuration
 */
export const globalPaginationManager = new PaginationManager();

/**
 * Convenience function for creating standardized pagination responses
 */
export function createStandardPaginationResponse(
  results: any[],
  params: PaginationParams,
  apiResponse: any = {},
  toolName?: string
): PaginationResponse {
  const manager = toolName
    ? PaginationManager.forTool(toolName)
    : globalPaginationManager;

  return manager.createPaginationResponse(results, params, apiResponse);
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(
  params: PaginationParams,
  toolName?: string
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalized: ReturnType<PaginationManager['normalizePaginationParams']>;
} {
  const manager = toolName
    ? PaginationManager.forTool(toolName)
    : globalPaginationManager;

  const errors: string[] = [];

  // Basic validation
  if (
    params.limit !== undefined &&
    (typeof params.limit !== 'number' || params.limit < 1)
  ) {
    errors.push('limit must be a positive number');
  }

  if (
    params.offset !== undefined &&
    (typeof params.offset !== 'number' || params.offset < 0)
  ) {
    errors.push('offset must be a non-negative number');
  }

  if (params.cursor !== undefined && typeof params.cursor !== 'string') {
    errors.push('cursor must be a string');
  }

  const normalized = manager.normalizePaginationParams(params);

  return {
    isValid: errors.length === 0,
    errors,
    warnings: normalized.warnings,
    normalized,
  };
}

/**
 * Migration utility for converting offset-based to cursor-based pagination
 */
export function convertOffsetToCursorParams(params: {
  limit?: number;
  offset?: number;
}): {
  limit?: number;
  cursor?: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (params.offset && params.offset > 0) {
    warnings.push(
      'Offset-based pagination is deprecated and has been converted to cursor-based pagination'
    );
    // Note: This is a simplified conversion. In practice, you'd need to implement
    // offset-to-cursor conversion based on your specific API requirements.
  }

  return {
    limit: params.limit,
    cursor: undefined, // Would need actual conversion logic based on your API
    warnings,
  };
}
