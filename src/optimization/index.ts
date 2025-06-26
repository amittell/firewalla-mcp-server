/**
 * Token usage optimization utilities for Firewalla MCP Server
 * Implements response truncation, summary modes, and token management
 */

import { safeUnixToISOString } from '../utils/timestamp.js';

/**
 * Default truncation limits for different text types
 */
const DEFAULT_TRUNCATION_LIMITS = {
  MESSAGE: 80,
  DEVICE_NAME: 30,
  REMOTE_NAME: 30,
  TARGET_VALUE: 60,
  NOTES: 60,
  VENDOR_NAME: 20,
  GENERIC_TEXT: 100,
  FLOW_DEVICE_NAME: 25
} as const;

/**
 * Current truncation limits (configurable)
 */
export let TRUNCATION_LIMITS = { ...DEFAULT_TRUNCATION_LIMITS };

/**
 * Configure truncation limits for different deployment scenarios
 */
export function setTruncationLimits(limits: Partial<typeof DEFAULT_TRUNCATION_LIMITS>): void {
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
  results: any[];
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
 * Sophisticated estimation accounting for word boundaries, punctuation, and content characteristics
 *
 * @param text - The text to estimate token count for
 * @returns The estimated token count
 */
export function estimateTokenCount(text: string): number {
  // More sophisticated estimation accounting for word boundaries and punctuation
  const words = text.split(/\s+/).length;
  const chars = text.length;
  const punctuation = (text.match(/[.,;:!?(){}[\]]/g) || []).length;
  
  // Adjust ratio based on content characteristics
  const baseRatio = 4;
  const wordAdjustment = words > chars / 6 ? 0.8 : 1.2; // Short words = more tokens
  const punctAdjustment = punctuation / chars > 0.1 ? 1.1 : 1.0; // Heavy punctuation
  
  return Math.ceil(chars / (baseRatio * wordAdjustment * punctAdjustment));
}

/**
 * Truncate text to specified length with smart truncation
 *
 * @param text - The text to truncate
 * @param maxLength - The maximum length to truncate to
 * @param strategy - The truncation strategy to use
 * @returns The truncated text
 */
export function truncateText(text: string, maxLength: number, strategy: 'ellipsis' | 'word' = 'word'): string {
  if (text.length <= maxLength) {
    return text;
  }
  
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
 *
 * @param obj - The object to summarize
 * @param config - The summary mode configuration
 * @returns The summarized object
 */
export function summarizeObject(obj: any, config: OptimizationConfig['summaryMode']): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const summarized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip excluded fields
    if (config.excludeFields.includes(key)) {
      continue;
    }
    
    // Include specific fields if specified
    if (config.includeFields.length > 0 && !config.includeFields.includes(key)) {
      continue;
    }
    
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
    } else if (typeof value === 'string') {
      // Truncate long strings
      summarized[key] = truncateText(value, TRUNCATION_LIMITS.GENERIC_TEXT);
    } else {
      summarized[key] = value;
    }
  }
  
  return summarized;
}

/**
 * Optimize alarm response for token efficiency
 *
 * @param response - The alarm response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function optimizeAlarmResponse(
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
    count: typeof response.count === 'number' ? response.count : response.results?.length || 0,
    results: response.results.slice(0, config.summaryMode.maxItems).map(alarm => ({
      aid: alarm?.aid || 'unknown',
      timestamp: alarm?.timestamp || (alarm?.ts ? safeUnixToISOString(alarm.ts, new Date().toISOString()) : new Date().toISOString()),
      type: alarm.type,
      status: alarm.status,
      message: truncateText(alarm.message || '', TRUNCATION_LIMITS.MESSAGE),
      direction: alarm.direction,
      protocol: alarm.protocol,
      gid: alarm.gid,
      // Include only essential device info
      ...(alarm.device && {
        device_ip: alarm.device.ip,
        device_name: truncateText(alarm.device.name || '', TRUNCATION_LIMITS.DEVICE_NAME)
      }),
      // Include only essential remote info
      ...(alarm.remote && {
        remote_ip: alarm.remote.ip,
        remote_name: truncateText(alarm.remote.name || '', TRUNCATION_LIMITS.REMOTE_NAME)
      })
    })),
    next_cursor: response.next_cursor
  };

  const result: OptimizedResponse = optimized;
  if (response.count > config.summaryMode.maxItems) {
    result.truncated = true;
    result.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return result;
}

/**
 * Optimize flow response for token efficiency
 *
 * @param response - The flow response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function optimizeFlowResponse(
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
    count: typeof response.count === 'number' ? response.count : response.results?.length || 0,
    results: response.results.slice(0, config.summaryMode.maxItems).map(flow => ({
      timestamp: flow.timestamp || safeUnixToISOString(flow.ts, new Date().toISOString()),
      source_ip: flow.source?.ip || flow.device?.ip || 'unknown',
      destination_ip: flow.destination?.ip || 'unknown',
      protocol: flow.protocol,
      bytes: (flow.download || 0) + (flow.upload || 0),
      download: flow.download || 0,
      upload: flow.upload || 0,
      packets: flow.count,
      duration: flow.duration || 0,
      direction: flow.direction,
      blocked: flow.block,
      ...(flow.blockType && { block_type: flow.blockType }),
      device_name: truncateText(flow.device?.name || '', TRUNCATION_LIMITS.FLOW_DEVICE_NAME),
      ...(flow.region && { region: flow.region }),
      ...(flow.category && { category: flow.category })
    })),
    next_cursor: response.next_cursor
  };

  const result: OptimizedResponse = optimized;
  if (response.count > config.summaryMode.maxItems) {
    result.truncated = true;
    result.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return result;
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
    count: typeof response.count === 'number' ? response.count : response.results?.length || 0,
    results: response.results.slice(0, config.summaryMode.maxItems).map(rule => ({
      id: rule.id,
      action: rule.action,
      target_type: rule.target?.type,
      target_value: truncateText(rule.target?.value || '', TRUNCATION_LIMITS.TARGET_VALUE),
      direction: rule.direction,
      status: rule.status || 'active',
      hit_count: rule.hit?.count || 0,
      last_hit: safeUnixToISOString(rule.hit?.lastHitTs, 'Never'),
      created_at: safeUnixToISOString(rule.ts, new Date().toISOString()),
      updated_at: safeUnixToISOString(rule.updateTs, new Date().toISOString()),
      notes: truncateText(rule.notes || '', TRUNCATION_LIMITS.NOTES),
      ...(rule.resumeTs && { resume_at: safeUnixToISOString(rule.resumeTs, new Date().toISOString()) })
    })),
    next_cursor: response.next_cursor
  };

  const result: OptimizedResponse = optimized;
  if (response.count > config.summaryMode.maxItems) {
    result.truncated = true;
    result.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return result;
}

/**
 * Optimize device response for token efficiency
 *
 * @param response - The device response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function optimizeDeviceResponse(
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
    count: typeof response.count === 'number' ? response.count : response.results?.length || 0,
    online_count: response.results.filter(d => d.online).length,
    offline_count: response.results.filter(d => !d.online).length,
    results: response.results.slice(0, config.summaryMode.maxItems).map(device => ({
      id: device.id,
      gid: device.gid,
      name: truncateText(device.name || '', TRUNCATION_LIMITS.DEVICE_NAME),
      ip: device.ip,
      macVendor: truncateText(device.macVendor || '', TRUNCATION_LIMITS.VENDOR_NAME),
      online: device.online,
      lastSeen: device.lastSeen,
      network_name: device.network?.name,
      group_name: device.group?.name,
      totalDownload: device.totalDownload,
      totalUpload: device.totalUpload,
      total_mb: Math.round((device.totalDownload + device.totalUpload) / (1024 * 1024))
    })),
    next_cursor: response.next_cursor
  };

  const result: OptimizedResponse = optimized;
  if (response.count > config.summaryMode.maxItems) {
    result.truncated = true;
    result.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return result;
}

/**
 * Auto-optimize response based on size and type
 *
 * @param response - The response to optimize
 * @param responseType - The type of response
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function autoOptimizeResponse(response: any, responseType: string, config: OptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG): any {
  if (!config.autoTruncate) {
    return response;
  }
  
  // Quick size estimation before expensive JSON.stringify
  let estimatedSize: number;
  try {
    estimatedSize = response?.results?.length 
      ? response.results.length * 200 + (JSON.stringify(response).length / Math.max(response.results.length, 1))
      : JSON.stringify(response).length;
  } catch (error) {
    // Fallback for circular references or other JSON.stringify errors
    process.stderr.write(`JSON.stringify failed for size estimation, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    estimatedSize = response?.results?.length ? response.results.length * 1000 : 10000;
  }
  
  // If estimated size is well within limits, return as-is
  if (estimatedSize <= config.maxResponseSize * 0.8) {
    return response;
  }
  
  // Only do expensive size check if we're close to the limit
  let responseText: string;
  try {
    responseText = JSON.stringify(response);
  } catch (error) {
    // Handle circular references or other JSON.stringify errors
    process.stderr.write(`JSON.stringify failed for response size check, applying optimization: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    // Force optimization since we can't measure the response size
    responseText = '';
  }
  
  if (responseText && responseText.length <= config.maxResponseSize) {
    return response;
  }

  // Apply type-specific optimization
  switch (responseType) {
    case 'alarms':
      return optimizeAlarmResponse(response, config);
    case 'flows':
      return optimizeFlowResponse(response, config);
    case 'rules':
      return optimizeRuleResponse(response, config);
    case 'devices':
      return optimizeDeviceResponse(response, config);
    default:
      // Generic optimization
      return genericOptimization(response, config);
  }
}

/**
 * Generic optimization for unknown response types
 *
 * @param response - The response to optimize
 * @param config - The optimization configuration
 * @returns The optimized response
 */
export function genericOptimization(response: BaseResponse, config: OptimizationConfig): OptimizedResponse {
  if (!response.results || !Array.isArray(response.results)) {
    return response;
  }

  const optimized: OptimizedResponse = {
    count: typeof response.count === 'number' ? response.count : response.results?.length || 0,
    results: response.results.slice(0, config.summaryMode.maxItems).map((item: any) => 
      summarizeObject(item, config.summaryMode)
    ),
    next_cursor: response.next_cursor
  };

  if (response.count > config.summaryMode.maxItems) {
    optimized.truncated = true;
    optimized.truncation_note = `Showing ${config.summaryMode.maxItems} of ${response.count} results`;
  }

  return optimized;
}

/**
 * Calculate optimization statistics
 *
 * @param original - The original response
 * @param optimized - The optimized response
 * @returns Statistics about the optimization
 */
export function getOptimizationStats(original: any, optimized: any): {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  tokensSaved: number;
} {
  let originalText: string;
  let optimizedText: string;
  
  try {
    originalText = JSON.stringify(original);
  } catch (error) {
    process.stderr.write(`JSON.stringify failed for original data, using fallback size: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    originalText = '[circular or invalid data]';
  }
  
  try {
    optimizedText = JSON.stringify(optimized);
  } catch (error) {
    process.stderr.write(`JSON.stringify failed for optimized data, using fallback size: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    optimizedText = '[circular or invalid data]';
  }
  
  return {
    originalSize: originalText.length,
    optimizedSize: optimizedText.length,
    compressionRatio: optimizedText.length / originalText.length,
    tokensSaved: estimateTokenCount(originalText) - estimateTokenCount(optimizedText)
  };
}

/**
 * Create optimization summary for debugging
 *
 * @param stats - The optimization statistics
 * @returns A human-readable optimization summary
 */
export function createOptimizationSummary(stats: ReturnType<typeof getOptimizationStats>): string {
  const compressionPercent = Math.round((1 - stats.compressionRatio) * 100);
  return `Optimized response: ${stats.originalSize} -> ${stats.optimizedSize} chars (${compressionPercent}% reduction, ~${stats.tokensSaved} tokens saved)`;
}

/**
 * Method decorator that automatically optimizes the response of an asynchronous method based on the specified response type and optional configuration.
 *
 * Applies response truncation, summarization, and token management strategies to reduce payload size. If debug mode is enabled, logs optimization statistics to standard error.
 *
 * @param responseType - The type of response to optimize (e.g., 'alarms', 'flows', 'rules', 'devices')
 * @param config - Optional optimization configuration to override defaults
 */
export function optimizeResponse(responseType: string, config?: Partial<OptimizationConfig>) {
  // Input validation for responseType parameter
  if (!responseType || typeof responseType !== 'string') {
    throw new Error('ResponseType parameter must be a non-empty string');
  }

  return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    // Type checking for originalMethod
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('Decorator can only be applied to methods');
    }

    const originalMethod = descriptor.value;
    const finalConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

    descriptor.value = async function (...args: any[]): Promise<any> {
      try {
        const result = await originalMethod.apply(this, args);
        
        // Null checking for result before optimization
        if (result === null || result === undefined) {
          return result;
        }
        
        const optimized = autoOptimizeResponse(result, responseType, finalConfig);
        
        // Log optimization stats in debug mode
        if (process.env.DEBUG) {
          const stats = getOptimizationStats(result, optimized);
          const summary = createOptimizationSummary(stats);
          process.stderr.write(`[${propertyKey}] ${summary}\n`);
        }
        
        return optimized;
      } catch (error) {
        // Log error and re-throw with context
        process.stderr.write(`[${propertyKey}] Optimization failed: ${error}\n`);
        throw error;
      }
    };

    return descriptor;
  };
}