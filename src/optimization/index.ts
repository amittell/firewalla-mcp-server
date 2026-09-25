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

import { safeUnixToISOString } from '../utils/timestamp.js';

/**
 * Interface for objects that can be optimized and summarized
 */
export type OptimizableObject = Record<string, unknown>;

/**
 * Default truncation limits for the rule summary
 */
const DEFAULT_TRUNCATION_LIMITS = {
  TARGET_VALUE: 60,
  NOTES: 60,
} as const;

/**
 * Current truncation limits (configurable)
 */
export let TRUNCATION_LIMITS = { ...DEFAULT_TRUNCATION_LIMITS };

/**
 * Configure truncation limits for different deployment scenarios
 */
export function setTruncationLimits(
  limits: Partial<typeof DEFAULT_TRUNCATION_LIMITS>
): void {
  TRUNCATION_LIMITS = { ...DEFAULT_TRUNCATION_LIMITS, ...limits };
}

/**
 * Reset truncation limits to defaults
 */
export function resetTruncationLimits(): void {
  TRUNCATION_LIMITS = { ...DEFAULT_TRUNCATION_LIMITS };
}

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
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  summaryMode: {
    maxItems: Number.MAX_SAFE_INTEGER,
    includeFields: [],
    excludeFields: ['notes', 'description', 'message'],
  },
};

/**
 * Truncate text to specified length with smart truncation
 *
 * @param text - The text to truncate
 * @param maxLength - The maximum length to truncate to
 * @param strategy - The truncation strategy to use
 * @returns The truncated text
 */
export function truncateText(
  text: string,
  maxLength: number,
  strategy: 'ellipsis' | 'word' = 'word'
): string {
  if (text.length <= maxLength) {
    return text;
  }

  if (strategy === 'word') {
    // Find last complete word before maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      // If we're close to the limit, use word boundary
      return `${truncated.substring(0, lastSpace)}...`;
    }
  }

  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Optimize rule response for token efficiency
 *
 * @param response - The rule response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function optimizeRuleResponse(
  response: BaseResponse,
  config: OptimizationConfig
): OptimizedResponse {
  if (!response || typeof response !== 'object') {
    return response;
  }

  if (!Array.isArray(response.results)) {
    return { ...response, results: [] };
  }
  const optimized = {
    count:
      typeof response.count === 'number'
        ? response.count
        : response.results?.length || 0,
    results: response.results
      .slice(0, config.summaryMode.maxItems)
      .map(rule => ({
        id: rule.id,
        action: rule.action,
        target_type: (rule.target as any)?.type,
        target_value: truncateText(
          (rule.target as any)?.value || '',
          TRUNCATION_LIMITS.TARGET_VALUE
        ),
        direction: rule.direction,
        status: rule.status || 'active',
        hit_count: (rule.hit as any)?.count || 0,
        last_hit: safeUnixToISOString((rule.hit as any)?.lastHitTs, 'Never'),
        created_at: safeUnixToISOString(
          rule.ts as any,
          new Date().toISOString()
        ),
        updated_at: safeUnixToISOString(
          rule.updateTs as any,
          new Date().toISOString()
        ),
        notes: truncateText((rule.notes as any) || '', TRUNCATION_LIMITS.NOTES),
        ...((rule.resumeTs as any) && {
          resume_at: safeUnixToISOString(
            rule.resumeTs as any,
            new Date().toISOString()
          ),
        }),
      })),
    next_cursor: response.next_cursor,
  };

  const result: OptimizedResponse = optimized;
  if (response.count > config.summaryMode.maxItems) {
    result.truncated = true;
    result.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return result;
}
