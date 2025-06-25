/**
 * Token usage optimization utilities for Firewalla MCP Server
 * Implements response truncation, summary modes, and token management
 */

import { safeUnixToISOString, unixToISOString } from '../utils/timestamp.js';

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
 * Response optimization utilities
 */
export class ResponseOptimizer {
  
  /**
   * Calculate approximate token count for text
   * Rough approximation: 1 token ≈ 4 characters
   */
  static estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to specified length with smart truncation
   */
  static truncateText(text: string, maxLength: number, strategy: 'ellipsis' | 'word' = 'word'): string {
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
  static summarizeObject(obj: any, config: OptimizationConfig['summaryMode']): any {
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
            ResponseOptimizer.summarizeObject(item, config)
          );
          if (value.length > 5) {
            summarized[`${key}_truncated`] = `... ${value.length - 5} more items`;
          }
        } else {
          summarized[key] = ResponseOptimizer.summarizeObject(value, config);
        }
      } else if (typeof value === 'string') {
        // Truncate long strings
        summarized[key] = ResponseOptimizer.truncateText(value, 100);
      } else {
        summarized[key] = value;
      }
    }
    
    return summarized;
  }

  /**
   * Optimize alarm response for token efficiency
   */
  static optimizeAlarmResponse(
    response: {count: number; results: any[]; next_cursor?: string},
    config: OptimizationConfig
  ): any {
    const optimized = {
      count: response.count,
      results: response.results.slice(0, config.summaryMode.maxItems).map(alarm => ({
        aid: alarm.aid,
        timestamp: alarm.timestamp || unixToISOString(alarm.ts),
        type: alarm.type,
        status: alarm.status,
        message: ResponseOptimizer.truncateText(alarm.message || '', 80),
        direction: alarm.direction,
        protocol: alarm.protocol,
        gid: alarm.gid,
        // Include only essential device info
        ...(alarm.device && {
          device_ip: alarm.device.ip,
          device_name: ResponseOptimizer.truncateText(alarm.device.name || '', 30)
        }),
        // Include only essential remote info
        ...(alarm.remote && {
          remote_ip: alarm.remote.ip,
          remote_name: ResponseOptimizer.truncateText(alarm.remote.name || '', 30)
        })
      })),
      next_cursor: response.next_cursor
    };

    // Note: Showing limited results based on configuration

    return optimized;
  }

  /**
   * Optimize flow response for token efficiency
   */
  static optimizeFlowResponse(
    response: {count: number; results: any[]; next_cursor?: string},
    config: OptimizationConfig
  ): any {
    const optimized = {
      count: response.count,
      results: response.results.slice(0, config.summaryMode.maxItems).map(flow => ({
        timestamp: flow.timestamp || unixToISOString(flow.ts),
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
        device_name: ResponseOptimizer.truncateText(flow.device?.name || '', 25),
        ...(flow.region && { region: flow.region }),
        ...(flow.category && { category: flow.category })
      })),
      next_cursor: response.next_cursor
    };

    if (response.count > config.summaryMode.maxItems) {
      // Note: Showing limited results based on configuration
    }

    return optimized;
  }

  /**
   * Optimize rule response for token efficiency
   */
  static optimizeRuleResponse(
    response: {count: number; results: any[]; next_cursor?: string},
    config: OptimizationConfig
  ): any {
    const optimized = {
      count: response.count,
      results: response.results.slice(0, config.summaryMode.maxItems).map(rule => ({
        id: rule.id,
        action: rule.action,
        target_type: rule.target?.type,
        target_value: ResponseOptimizer.truncateText(rule.target?.value || '', 60),
        direction: rule.direction,
        status: rule.status || 'active',
        hit_count: rule.hit?.count || 0,
        last_hit: safeUnixToISOString(rule.hit?.lastHitTs, 'Never'),
        created_at: unixToISOString(rule.ts),
        updated_at: unixToISOString(rule.updateTs),
        notes: ResponseOptimizer.truncateText(rule.notes || '', 60),
        ...(rule.resumeTs && { resume_at: unixToISOString(rule.resumeTs) })
      })),
      next_cursor: response.next_cursor
    };

    if (response.count > config.summaryMode.maxItems) {
      // Note: Showing limited results based on configuration
    }

    return optimized;
  }

  /**
   * Optimize device response for token efficiency
   */
  static optimizeDeviceResponse(
    response: {count: number; results: any[]; next_cursor?: string},
    config: OptimizationConfig
  ): any {
    const optimized = {
      count: response.count,
      online_count: response.results.filter(d => d.online).length,
      offline_count: response.results.filter(d => !d.online).length,
      results: response.results.slice(0, config.summaryMode.maxItems).map(device => ({
        id: device.id,
        gid: device.gid,
        name: this.truncateText(device.name || '', 30),
        ip: device.ip,
        macVendor: this.truncateText(device.macVendor || '', 20),
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

    if (response.count > config.summaryMode.maxItems) {
      // Note: Showing limited results based on configuration
    }

    return optimized;
  }

  /**
   * Auto-optimize response based on size and type
   */
  static autoOptimizeResponse(response: any, responseType: string, config: OptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG): any {
    if (!config.autoTruncate) {return response;}
    
    const responseText = JSON.stringify(response);
    
    // If response is within limits, return as-is
    if (responseText.length <= config.maxResponseSize) {
      return response;
    }

    // Apply type-specific optimization
    switch (responseType) {
      case 'alarms':
        return this.optimizeAlarmResponse(response, config);
      case 'flows':
        return this.optimizeFlowResponse(response, config);
      case 'rules':
        return this.optimizeRuleResponse(response, config);
      case 'devices':
        return this.optimizeDeviceResponse(response, config);
      default:
        // Generic optimization
        return this.genericOptimization(response, config);
    }
  }

  /**
   * Generic optimization for unknown response types
   */
  static genericOptimization(response: any, config: OptimizationConfig): any {
    if (!response.results || !Array.isArray(response.results)) {
      return response;
    }

    const optimized = {
      count: response.count,
      results: response.results.slice(0, config.summaryMode.maxItems).map((item: any) => 
        this.summarizeObject(item, config.summaryMode)
      ),
      next_cursor: response.next_cursor
    };

    if (response.count > config.summaryMode.maxItems) {
      // Note: Showing limited results based on configuration
    }

    return optimized;
  }

  /**
   * Calculate optimization statistics
   */
  static getOptimizationStats(original: any, optimized: any): {
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    tokensSaved: number;
  } {
    const originalText = JSON.stringify(original);
    const optimizedText = JSON.stringify(optimized);
    
    return {
      originalSize: originalText.length,
      optimizedSize: optimizedText.length,
      compressionRatio: optimizedText.length / originalText.length,
      tokensSaved: this.estimateTokenCount(originalText) - this.estimateTokenCount(optimizedText)
    };
  }

  /**
   * Create optimization summary for debugging
   */
  static createOptimizationSummary(stats: ReturnType<typeof ResponseOptimizer.getOptimizationStats>): string {
    const compressionPercent = Math.round((1 - stats.compressionRatio) * 100);
    return `Optimized response: ${stats.originalSize} -> ${stats.optimizedSize} chars (${compressionPercent}% reduction, ~${stats.tokensSaved} tokens saved)`;
  }
}

/**
 * Decorator for automatic response optimization
 */
export function optimizeResponse(responseType: string, config?: Partial<OptimizationConfig>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const finalConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

    descriptor.value = async function (...args: any[]): Promise<any> {
      const result = await originalMethod.apply(this, args);
      
      const optimized = ResponseOptimizer.autoOptimizeResponse(result, responseType, finalConfig);
      
      // Log optimization stats in debug mode
      if (process.env.DEBUG) {
        const stats = ResponseOptimizer.getOptimizationStats(result, optimized);
        const summary = ResponseOptimizer.createOptimizationSummary(stats);
        process.stderr.write(`[${propertyKey}] ${summary}\n`);
      }
      
      return optimized;
    };

    return descriptor;
  };
}