/**
 * Token usage optimization utilities for Firewalla MCP Server
 * Refactored from static class methods to regular functions for better TypeScript practices
 */

/**
 * Optimization configuration interface
 */
export interface OptimizationConfig {
  /** Maximum response size in characters */
  maxResponseSize: number;
  /** Enable automatic truncation */
  autoTruncate: boolean;
  /** Truncation strategy */
  truncationStrategy: 'head' | 'tail' | 'middle' | 'summary';
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
 * Default optimization configuration
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  maxResponseSize: 25000, // 25K characters for MCP token limit
  autoTruncate: true,
  truncationStrategy: 'summary',
  summaryMode: {
    maxItems: Number.MAX_SAFE_INTEGER, // No artificial limit - let response size determine truncation
    includeFields: [],
    excludeFields: ['notes', 'description', 'message']
  }
};

/**
 * Estimates the number of tokens in a string, assuming approximately one token per four characters.
 *
 * @param text - The input string to estimate token count for
 * @returns The estimated token count
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncates a string to a specified maximum length, optionally preserving whole words and appending an ellipsis.
 *
 * If the text exceeds `maxLength`, the function truncates at the nearest word boundary before the limit (when using the 'word' strategy and a suitable space is found), or strictly at the character limit minus space for an ellipsis.
 *
 * @param text - The input string to be truncated
 * @param maxLength - The maximum allowed length of the output string, including the ellipsis
 * @param strategy - The truncation strategy: 'word' preserves whole words when possible, 'ellipsis' truncates strictly at the limit
 * @returns The truncated string, with an ellipsis appended if truncation occurred
 */
export function truncateText(text: string, maxLength: number, strategy: 'ellipsis' | 'word' = 'word'): string {
  if (text.length <= maxLength) {return text;}
  
  if (strategy === 'word') {
    // Find last complete word before maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) { // If we're close to the limit, use word boundary
      return truncated.substring(0, lastSpace) + '...';
    }
  }
  
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Produces a summarized version of an object by recursively removing excluded fields, including only specified fields if set, truncating long strings, and limiting arrays to a maximum of five summarized items.
 *
 * @param obj - The object to be summarized
 * @param config - Summary mode configuration specifying fields to include or exclude
 * @returns A summarized object with verbose content reduced according to the provided configuration
 */
export function summarizeObject(obj: any, config: OptimizationConfig['summaryMode']): any {
  if (!obj || typeof obj !== 'object') {return obj;}
  
  const summarized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip excluded fields
    if (config.excludeFields.includes(key)) {continue;}
    
    // Include specific fields if specified
    if (config.includeFields.length > 0 && !config.includeFields.includes(key)) {continue;}
    
    // Handle nested objects
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        // Truncate arrays and summarize items
        summarized[key] = value.slice(0, Math.min(5, value.length)).map(item => 
          summarizeObject(item, config)
        );
        if (value.length > 5) {
          summarized[`${key}_truncated`] = `... ${value.length - 5} more items`;
        }
      } else {
        summarized[key] = summarizeObject(value, config);
      }
    } else if (typeof value === 'string' && value.length > 100) {
      // Truncate long strings
      summarized[key] = truncateText(value, 100);
    } else {
      summarized[key] = value;
    }
  }
  
  return summarized;
}

/**
 * Optimizes a response object or array according to the provided configuration, reducing its size if it exceeds the maximum allowed.
 *
 * If `autoTruncate` is disabled or the data is within the configured size limit, returns the original data unchanged. Otherwise, applies the specified truncation strategy (`summary`, `head`, `tail`, or `middle`) to reduce the response size, returning an optimized version with metadata describing the optimization.
 *
 * @returns The original or optimized response, depending on configuration and size constraints.
 */
export function optimizeResponse(data: any, config: OptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG): any {
  if (!config.autoTruncate) {return data;}
  
  const serialized = JSON.stringify(data);
  
  // If already under limit, return as-is
  if (serialized.length <= config.maxResponseSize) {
    return data;
  }
  
  // Apply optimization based on strategy
  switch (config.truncationStrategy) {
    case 'summary':
      return applySummaryOptimization(data, config);
    case 'head':
      return applyHeadOptimization(data, config);
    case 'tail':
      return applyTailOptimization(data, config);
    case 'middle':
      return applyMiddleOptimization(data, config);
    default:
      return applySummaryOptimization(data, config);
  }
}

/**
 * Optimizes an object by summarizing its content and appending metadata about the optimization.
 *
 * Applies summary-based truncation to reduce verbose fields and nested structures according to the provided configuration. The result includes an `_optimization` property detailing the strategy used, original and optimized sizes, and compression ratio.
 *
 * @returns The summarized object with optimization metadata.
 */
function applySummaryOptimization(data: any, config: OptimizationConfig): any {
  const optimized = summarizeObject(data, config.summaryMode);
  
  // Add metadata about optimization
  return {
    ...optimized,
    _optimization: {
      strategy: 'summary',
      original_size: JSON.stringify(data).length,
      optimized_size: JSON.stringify(optimized).length,
      compression_ratio: Math.round((1 - JSON.stringify(optimized).length / JSON.stringify(data).length) * 100)
    }
  };
}

/**
 * Returns the first N items of an array, along with metadata describing the truncation.
 *
 * If the input is not an array, returns the data unchanged.
 */
function applyHeadOptimization(data: any, config: OptimizationConfig): any {
  if (Array.isArray(data)) {
    const truncated = data.slice(0, Math.min(config.summaryMode.maxItems, data.length));
    return {
      results: truncated,
      _optimization: {
        strategy: 'head',
        total_items: data.length,
        returned_items: truncated.length,
        message: `Showing first ${truncated.length} of ${data.length} items`
      }
    };
  }
  
  return data;
}

/**
 * Returns the last N items of an array, along with metadata describing the tail-based optimization.
 *
 * If the input is not an array, returns the data unchanged.
 */
function applyTailOptimization(data: any, config: OptimizationConfig): any {
  if (Array.isArray(data)) {
    const maxItems = Math.min(config.summaryMode.maxItems, data.length);
    const truncated = data.slice(-maxItems);
    return {
      results: truncated,
      _optimization: {
        strategy: 'tail',
        total_items: data.length,
        returned_items: truncated.length,
        message: `Showing last ${truncated.length} of ${data.length} items`
      }
    };
  }
  
  return data;
}

/**
 * Returns a middle slice of items from an array, limited by the configured maximum, and includes metadata about the optimization.
 *
 * If the input is not an array, returns the data unchanged.
 *
 * @returns An object containing the middle items and optimization metadata, or the original data if not an array.
 */
function applyMiddleOptimization(data: any, config: OptimizationConfig): any {
  if (Array.isArray(data)) {
    const maxItems = Math.min(config.summaryMode.maxItems, data.length);
    const startIndex = Math.floor((data.length - maxItems) / 2);
    const truncated = data.slice(startIndex, startIndex + maxItems);
    return {
      results: truncated,
      _optimization: {
        strategy: 'middle',
        total_items: data.length,
        returned_items: truncated.length,
        start_index: startIndex,
        message: `Showing ${truncated.length} items from middle of ${data.length} total`
      }
    };
  }
  
  return data;
}

/**
 * Determines whether the serialized data exceeds the specified maximum size and requires optimization.
 *
 * @param data - The data to evaluate for optimization need
 * @param maxSize - The maximum allowed size in characters for the serialized data
 * @returns True if the data's serialized length is greater than `maxSize`; otherwise, false
 */
export function needsOptimization(data: any, maxSize: number = DEFAULT_OPTIMIZATION_CONFIG.maxResponseSize): boolean {
  return JSON.stringify(data).length > maxSize;
}

/**
 * Calculates statistics comparing the size and token usage of original and optimized data.
 *
 * @param original - The original data before optimization
 * @param optimized - The data after optimization
 * @returns An object containing the original and optimized sizes (in characters), compression ratio (percentage), and estimated token savings
 */
export function getOptimizationStats(original: any, optimized: any): {
  original_size: number;
  optimized_size: number;
  compression_ratio: number;
  token_savings: number;
} {
  const originalSize = JSON.stringify(original).length;
  const optimizedSize = JSON.stringify(optimized).length;
  
  return {
    original_size: originalSize,
    optimized_size: optimizedSize,
    compression_ratio: Math.round((1 - optimizedSize / originalSize) * 100),
    token_savings: estimateTokenCount(originalSize.toString()) - estimateTokenCount(optimizedSize.toString())
  };
}