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
 * Calculate approximate token count for text
 * Rough approximation: 1 token ≈ 4 characters
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to specified length with smart truncation
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
 * Create summary version of object by removing verbose fields
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
 * Optimize response based on configuration
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
 * Apply summary-based optimization
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
 * Apply head-based optimization (keep first N items)
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
 * Apply tail-based optimization (keep last N items)
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
 * Apply middle-based optimization (keep items from middle)
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
 * Check if response needs optimization
 */
export function needsOptimization(data: any, maxSize: number = DEFAULT_OPTIMIZATION_CONFIG.maxResponseSize): boolean {
  return JSON.stringify(data).length > maxSize;
}

/**
 * Get optimization statistics for a response
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