/**
 * Response standardization utilities
 *
 * Provides consistent response formatting across all MCP tools.
 */
import type { StandardSearchResponse, StandardPaginatedResponse, StandardStatisticalResponse, SearchMetadata, PaginationMetadata, StatisticalMetadata } from '../types.js';
/**
 * Response standardizer class providing unified formatting utilities
 */
export declare class ResponseStandardizer {
    /**
     * Convert data and metadata to standardized search response format
     *
     * @param data - Array of search results
     * @param metadata - Search operation metadata
     * @returns Standardized search response
     */
    static toSearchResponse<T>(data: T[], metadata: SearchMetadata): StandardSearchResponse<T>;
    /**
     * Convert data and metadata to standardized paginated response format
     *
     * @param data - Array of paginated results
     * @param metadata - Pagination operation metadata
     * @returns Standardized paginated response
     */
    static toPaginatedResponse<T>(data: T[], metadata: PaginationMetadata): StandardPaginatedResponse<T>;
    /**
     * Convert data and metadata to standardized statistical response format
     *
     * @param data - Array of statistical results
     * @param metadata - Statistical analysis metadata
     * @returns Standardized statistical response
     */
    static toStatisticalResponse<T>(data: T[], metadata: StatisticalMetadata): StandardStatisticalResponse<T>;
    /**
     * Determine query complexity based on query string analysis
     *
     * @param query - Query string to analyze
     * @returns Complexity level
     * @private
     */
    private static determineQueryComplexity;
}
//# sourceMappingURL=response-standardizer.d.ts.map