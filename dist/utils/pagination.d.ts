/**
 * Client-side cursor pagination over an array, for the client's
 * createPaginatedResponse, and the pagination parameters the streaming
 * manager takes
 */
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
 * Get current pagination configuration
 */
export declare function getPaginationConfig(): PaginationConfig;
/**
 * Get default page size with validation
 */
export declare function getDefaultPageSize(requestedSize?: number): number;
/**
 * Encodes a `CursorData` object into a base64 string for use as a pagination cursor.
 *
 * @param data - The cursor data to encode
 * @returns The base64-encoded string representing the cursor
 * @throws If the cursor data cannot be serialized or encoded
 */
export declare function encodeCursor(data: CursorData): string;
/**
 * Decodes a base64-encoded cursor string into a validated `CursorData` object.
 *
 * Throws an error if the cursor is not valid base64, cannot be parsed as JSON, or does not contain required pagination fields.
 *
 * @param cursor - The base64-encoded cursor string to decode
 * @returns The decoded and validated cursor data
 */
export declare function decodeCursor(cursor: string): CursorData;
/**
 * Performs client-side cursor-based pagination and optional sorting on an array of items.
 *
 * Decodes the provided cursor to determine the current offset and page size, sorts the array by the specified field and order if requested, and returns a paginated result with metadata and a next cursor if more items remain.
 *
 * @param items - The array of items to paginate
 * @param cursor - Optional base64-encoded cursor string indicating the current pagination state; one that does not decode throws
 * @param page_size - Number of items per page (default: configured DEFAULT_PAGE_SIZE or 100)
 * @param sort_by - Optional field name to sort by
 * @param sort_order - Sort order, either 'asc' or 'desc' (default is 'asc')
 * @returns A paginated result containing the current page of items, pagination metadata, and a next cursor if more items are available
 */
export declare function paginateArray<T extends object>(items: T[], cursor?: string, page_size?: number, sort_by?: string, sort_order?: 'asc' | 'desc'): PaginatedResult<T>;
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
export declare function createPaginatedResponse<T extends object>(dataFetcher: () => Promise<T[]>, cursor?: string, page_size?: number, sort_by?: string, sort_order?: 'asc' | 'desc'): Promise<PaginatedResult<T>>;
//# sourceMappingURL=pagination.d.ts.map