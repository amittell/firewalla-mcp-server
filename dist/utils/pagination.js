/**
 * Client-side cursor pagination over an array, for the client's
 * createPaginatedResponse, and the pagination parameters the streaming
 * manager takes
 */
import { config } from '../config/config.js';
/**
 * Default pagination configuration loaded from main configuration
 * Falls back to environment variables for backward compatibility
 */
const DEFAULT_PAGINATION_CONFIG = {
    maxPageSize: config.maxPageSize || parseInt(process.env.MAX_PAGE_SIZE || '10000', 10),
    defaultPageSize: config.defaultPageSize ||
        parseInt(process.env.DEFAULT_PAGE_SIZE || '100', 10),
    useCursor: true,
    useOffset: false,
    includeTotalCount: false,
};
/**
 * Get current pagination configuration
 */
export function getPaginationConfig() {
    return DEFAULT_PAGINATION_CONFIG;
}
/**
 * Get default page size with validation
 */
export function getDefaultPageSize(requestedSize) {
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
export function encodeCursor(data) {
    try {
        const json = JSON.stringify(data);
        return Buffer.from(json, 'utf-8').toString('base64');
    }
    catch (error) {
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
export function decodeCursor(cursor) {
    try {
        const json = Buffer.from(cursor, 'base64').toString('utf-8');
        const data = JSON.parse(json);
        // Validate cursor data structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid cursor data structure');
        }
        // Whole numbers: slice() truncated an offset of 1.5 to 1 and used it
        if (!Number.isSafeInteger(data.offset) || data.offset < 0) {
            throw new Error('Invalid cursor offset');
        }
        if (!Number.isSafeInteger(data.page_size) || data.page_size < 1) {
            throw new Error('Invalid cursor page_size');
        }
        return data;
    }
    catch (error) {
        throw new Error(`Failed to decode cursor: ${error instanceof Error ? error.message : 'Invalid cursor format'}`);
    }
}
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
export function paginateArray(items, cursor, page_size = getDefaultPageSize(), sort_by, sort_order = 'asc') {
    let offset = 0;
    // Decode cursor if provided. One that does not decode is refused: it was
    // read as the first page, so a bad cursor restarted the listing unseen
    if (cursor) {
        const cursorData = decodeCursor(cursor);
        const { offset: cursorOffset, page_size: cursorPageSize } = cursorData;
        offset = cursorOffset;
        // Use cursor's page_size if available and consistent
        if (cursorPageSize === page_size) {
            page_size = cursorPageSize;
        }
    }
    // Sort items if sort_by is specified
    const sortedItems = [...items];
    if (sort_by) {
        sortedItems.sort((a, b) => {
            const aVal = a[sort_by];
            const bVal = b[sort_by];
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
    let next_cursor;
    if (has_more) {
        const nextCursorData = {
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
export async function createPaginatedResponse(dataFetcher, cursor, page_size = getDefaultPageSize(), sort_by, sort_order = 'asc') {
    const allItems = await dataFetcher();
    return paginateArray(allItems, cursor, page_size, sort_by, sort_order);
}
//# sourceMappingURL=pagination.js.map