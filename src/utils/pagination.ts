/**
 * Universal pagination utilities for cursor-based and offset-based pagination
 * Provides consistent pagination interface across all MCP tools
 *
 * This module combines functionality from the original pagination.ts and pagination-manager.ts
 * to provide a unified, comprehensive pagination solution.
 */

import { config } from '../config/config.js';
import { SafeAccess } from '../validation/error-handler.js';

/**
 * Type for any object that can be paginated
 */
export type Paginatable = Record<string, unknown> | object;

/**
 * Pagination configuration interface
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
 * Cursor data structure for cursor-based pagination
 */
export interface CursorData {
  offset: number;
  page_size: number;
  total_items?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Paginated result interface
 */
export interface PaginatedResult<T> {
  results: T[];
  next_cursor?: string;
  total_count: number;
  page_size: number;
  has_more: boolean;
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
 * Default pagination configuration loaded from main configuration
 * Falls back to environment variables for backward compatibility
 */
const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  maxPageSize:
    config.maxPageSize || parseInt(process.env.MAX_PAGE_SIZE || '10000', 10),
  defaultPageSize:
    config.defaultPageSize ||
    parseInt(process.env.DEFAULT_PAGE_SIZE || '100', 10),
  useCursor: true,
  useOffset: false,
  includeTotalCount: false,
};

/**
 * Current pagination configuration (can be updated at runtime)
 */
let currentPaginationConfig: PaginationConfig = DEFAULT_PAGINATION_CONFIG;

/**
 * Update pagination configuration at runtime
 */
export function updatePaginationConfig(
  newConfig: Partial<PaginationConfig>
): void {
  currentPaginationConfig = {
    ...currentPaginationConfig,
    ...newConfig,
  };
}

/**
 * Get current pagination configuration
 */
export function getPaginationConfig(): PaginationConfig {
  return currentPaginationConfig;
}

/**
 * Get default page size with validation
 */
export function getDefaultPageSize(requestedSize?: number): number {
  const config = getPaginationConfig();

  if (requestedSize) {
    // Validate requested size against max
    return Math.min(requestedSize, config.maxPageSize);
  }

  return config.defaultPageSize;
}

/**
 * Encodes a `CursorData` object into a base64 string for use as a pagination cursor.
 *
 * @param data - The cursor data to encode
 * @returns The base64-encoded string representing the cursor
 * @throws If the cursor data cannot be serialized or encoded
 */
export function encodeCursor(data: CursorData): string {
  try {
    const json = JSON.stringify(data);
    return Buffer.from(json, 'utf-8').toString('base64');
  } catch (error) {
    throw new Error(
      `Failed to encode cursor: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decodes a base64-encoded cursor string into a validated `CursorData` object.
 *
 * Throws an error if the cursor is not valid base64, cannot be parsed as JSON, or does not contain required pagination fields.
 *
 * @param cursor - The base64-encoded cursor string to decode
 * @returns The decoded and validated cursor data
 */
export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    const data = JSON.parse(json);

    // Validate cursor data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid cursor data structure');
    }

    if (typeof data.offset !== 'number' || data.offset < 0) {
      throw new Error('Invalid cursor offset');
    }

    if (typeof data.page_size !== 'number' || data.page_size < 1) {
      throw new Error('Invalid cursor page_size');
    }

    return data as CursorData;
  } catch (error) {
    throw new Error(
      `Failed to decode cursor: ${error instanceof Error ? error.message : 'Invalid cursor format'}`
    );
  }
}

/**
 * Performs client-side cursor-based pagination and optional sorting on an array of items.
 *
 * Decodes the provided cursor to determine the current offset and page size, sorts the array by the specified field and order if requested, and returns a paginated result with metadata and a next cursor if more items remain.
 *
 * @param items - The array of items to paginate
 * @param cursor - Optional base64-encoded cursor string indicating the current pagination state
 * @param page_size - Number of items per page (default: configured DEFAULT_PAGE_SIZE or 100)
 * @param sort_by - Optional field name to sort by
 * @param sort_order - Sort order, either 'asc' or 'desc' (default is 'asc')
 * @returns A paginated result containing the current page of items, pagination metadata, and a next cursor if more items are available
 */
export function paginateArray<T extends object>(
  items: T[],
  cursor?: string,
  page_size: number = getDefaultPageSize(),
  sort_by?: string,
  sort_order: 'asc' | 'desc' = 'asc'
): PaginatedResult<T> {
  let offset = 0;

  // Decode cursor if provided
  if (cursor) {
    try {
      const cursorData = decodeCursor(cursor);
      const { offset: cursorOffset, page_size: cursorPageSize } = cursorData;
      offset = cursorOffset;
      // Use cursor's page_size if available and consistent
      if (cursorPageSize === page_size) {
        page_size = cursorPageSize;
      }
    } catch {
      // Invalid cursor, start from beginning
      offset = 0;
    }
  }

  // Sort items if sort_by is specified
  const sortedItems = [...items];
  if (sort_by) {
    sortedItems.sort((a: T, b: T) => {
      const aVal = (a as any)[sort_by];
      const bVal = (b as any)[sort_by];

      if (aVal === bVal) {
        return 0;
      }

      // Case-insensitive string comparison for consistent sorting
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      const comparison = aStr < bStr ? -1 : 1;
      return sort_order === 'desc' ? -comparison : comparison;
    });
  }

  // Calculate pagination
  const total_count = sortedItems.length;
  const start_index = offset;
  const end_index = Math.min(start_index + page_size, total_count);
  const results = sortedItems.slice(start_index, end_index);
  const has_more = end_index < total_count;

  // Generate next cursor if there are more items
  let next_cursor: string | undefined;
  if (has_more) {
    const nextCursorData: CursorData = {
      offset: end_index,
      page_size,
      total_items: total_count,
      sort_by,
      sort_order,
    };
    next_cursor = encodeCursor(nextCursorData);
  }

  return {
    results,
    next_cursor,
    total_count,
    page_size,
    has_more,
  };
}

/**
 * Fetches all items using the provided data fetcher and returns a paginated result based on the given cursor, page size, and sorting options.
 *
 * @param dataFetcher - A function that asynchronously retrieves all items to be paginated
 * @param cursor - An optional base64-encoded cursor string representing the current pagination state
 * @param page_size - The number of items per page (default: configured DEFAULT_PAGE_SIZE or 100)
 * @param sort_by - Optional field name to sort the items by
 * @param sort_order - Sort order, either 'asc' or 'desc' (default is 'asc')
 * @returns A paginated result containing the current page of items, pagination metadata, and next cursor if more items remain
 * @throws If data fetching or pagination fails
 */
export async function createPaginatedResponse<T extends object>(
  dataFetcher: () => Promise<T[]>,
  cursor?: string,
  page_size: number = getDefaultPageSize(),
  sort_by?: string,
  sort_order: 'asc' | 'desc' = 'asc'
): Promise<PaginatedResult<T>> {
  try {
    const allItems = await dataFetcher();
    return paginateArray(allItems, cursor, page_size, sort_by, sort_order);
  } catch (error) {
    throw new Error(
      `Failed to create paginated response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Formats a paginated result into a standardized response object for MCP tools.
 *
 * @param paginatedResult - The paginated data and metadata to include in the response
 * @param query - The original query string associated with the request
 * @param execution_time_ms - The time taken to execute the query, in milliseconds
 * @returns An object containing the current page of results, counts, pagination metadata, the original query, and execution time
 */
export function formatPaginationResponse<T>(
  paginatedResult: PaginatedResult<T>,
  query: string,
  execution_time_ms: number
): {
  results: T[];
  count: number;
  total_count: number;
  next_cursor?: string;
  has_more: boolean;
  query: string;
  execution_time_ms: number;
} {
  return {
    results: paginatedResult.results,
    count: paginatedResult.results.length,
    total_count: paginatedResult.total_count,
    next_cursor: paginatedResult.next_cursor,
    has_more: paginatedResult.has_more,
    query,
    execution_time_ms,
  };
}

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
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}): {
  limit?: number;
  cursor?: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  // If offset is provided and greater than 0, create a cursor
  if (params.offset && params.offset > 0) {
    warnings.push(
      'Converting offset-based pagination to cursor-based. ' +
        'Consider using cursor-based pagination directly for better performance.'
    );

    // Create cursor data representing the offset
    const cursorData: CursorData = {
      offset: params.offset,
      page_size: params.limit || getDefaultPageSize(),
      sort_by: params.sort_by,
      sort_order: params.sort_order || 'asc',
    };

    // Encode the cursor
    const cursor = encodeCursor(cursorData);

    return {
      limit: params.limit,
      cursor,
      warnings,
    };
  }

  // No offset or offset is 0, no cursor needed
  return {
    limit: params.limit,
    cursor: undefined,
    warnings,
  };
}
