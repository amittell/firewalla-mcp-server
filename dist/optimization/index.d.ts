/**
 * @fileoverview The summary form of firewall rules for Firewalla MCP Server
 *
 * `get_network_rules` with `summary_only: true` returns each rule in a
 * shorter form: fewer fields, and the target value and notes truncated.
 * The handler applies it to the rules as the client returned them, so it
 * runs after every field has been read.
 *
 * Up to 1.4.1 this module also held an `@optimizeResponse` decorator that
 * rewrote any client result over 100,000 characters into a compact form
 * with other field names (an alarm's `aid` became `alarm_id`, a flow's
 * `source.ip` became `source_ip`, ...). The handlers read the API's field
 * names, so large responses came back with aid "unknown", the current time
 * and "unknown" IPs. The decorator is gone: each tool's `limit`, its
 * pagination and its own output mapping bound the size of what it returns.
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */
/**
 * Interface for objects that can be optimized and summarized
 */
export type OptimizableObject = Record<string, unknown>;
/**
 * Base response interface with optional pagination metadata
 */
export interface BaseResponse {
    count: number;
    results: OptimizableObject[];
    next_cursor?: string;
}
/**
 * Optimized response interface with truncation metadata
 */
export interface OptimizedResponse extends BaseResponse {
    truncated?: boolean;
    truncation_note?: string;
}
/**
 * Summary configuration
 */
export interface OptimizationConfig {
    /** Summary mode configuration */
    summaryMode: {
        /** Maximum items in summary */
        maxItems: number;
        /** Fields to include in summary */
        includeFields: string[];
        /** Fields to exclude from summary */
        excludeFields: string[];
    };
}
/**
 * Default summary configuration
 */
export declare const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig;
/**
 * Truncate text to specified length with smart truncation
 *
 * @param text - The text to truncate
 * @param maxLength - The maximum length to truncate to
 * @param strategy - The truncation strategy to use
 * @returns The truncated text
 */
export declare function truncateText(text: string, maxLength: number, strategy?: 'ellipsis' | 'word'): string;
/**
 * Optimize rule response for token efficiency
 *
 * @param response - The rule response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export declare function optimizeRuleResponse(response: BaseResponse, config: OptimizationConfig): OptimizedResponse;
//# sourceMappingURL=index.d.ts.map