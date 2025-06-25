/**
 * Universal pagination utilities for cursor-based pagination
 * Provides consistent pagination interface across all MCP tools
 */

export interface CursorData {
  offset: number;
  page_size: number;
  total_items?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  results: T[];
  next_cursor?: string;
  total_count: number;
  page_size: number;
  has_more: boolean;
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
    throw new Error(`Failed to encode cursor: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    throw new Error(`Failed to decode cursor: ${error instanceof Error ? error.message : 'Invalid cursor format'}`);
  }
}

/**
 * Performs client-side cursor-based pagination and optional sorting on an array of items.
 *
 * Decodes the provided cursor to determine the current offset and page size, sorts the array by the specified field and order if requested, and returns a paginated result with metadata and a next cursor if more items remain.
 *
 * @param items - The array of items to paginate
 * @param cursor - Optional base64-encoded cursor string indicating the current pagination state
 * @param page_size - Number of items per page (default is 100)
 * @param sort_by - Optional field name to sort by
 * @param sort_order - Sort order, either 'asc' or 'desc' (default is 'asc')
 * @returns A paginated result containing the current page of items, pagination metadata, and a next cursor if more items are available
 */
export function paginateArray<T>(
  items: T[],
  cursor?: string,
  page_size: number = 100,
  sort_by?: string,
  sort_order: 'asc' | 'desc' = 'asc'
): PaginatedResult<T> {
  let offset = 0;
  
  // Decode cursor if provided
  if (cursor) {
    try {
      const cursorData = decodeCursor(cursor);
      offset = cursorData.offset;
      // Use cursor's page_size if available and consistent
      if (cursorData.page_size === page_size) {
        page_size = cursorData.page_size;
      }
    } catch {
      // Invalid cursor, start from beginning
      offset = 0;
    }
  }
  
  // Sort items if sort_by is specified
  const sortedItems = [...items];
  if (sort_by) {
    sortedItems.sort((a: any, b: any) => {
      const aVal = a[sort_by];
      const bVal = b[sort_by];
      
      if (aVal === bVal) {return 0;}
      
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
      sort_order
    };
    next_cursor = encodeCursor(nextCursorData);
  }
  
  return {
    results,
    next_cursor,
    total_count,
    page_size,
    has_more
  };
}

/**
 * Fetches all items using the provided data fetcher and returns a paginated result based on the given cursor, page size, and sorting options.
 *
 * @param dataFetcher - A function that asynchronously retrieves all items to be paginated
 * @param cursor - An optional base64-encoded cursor string representing the current pagination state
 * @param page_size - The number of items per page (default is 100)
 * @param sort_by - Optional field name to sort the items by
 * @param sort_order - Sort order, either 'asc' or 'desc' (default is 'asc')
 * @returns A paginated result containing the current page of items, pagination metadata, and next cursor if more items remain
 * @throws If data fetching or pagination fails
 */
export async function createPaginatedResponse<T>(
  dataFetcher: () => Promise<T[]>,
  cursor?: string,
  page_size: number = 100,
  sort_by?: string,
  sort_order: 'asc' | 'desc' = 'asc'
): Promise<PaginatedResult<T>> {
  try {
    const allItems = await dataFetcher();
    return paginateArray(allItems, cursor, page_size, sort_by, sort_order);
  } catch (error) {
    throw new Error(`Failed to create paginated response: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    execution_time_ms
  };
}