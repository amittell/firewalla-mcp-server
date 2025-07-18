/**
 * Resource Existence Validation Utilities for Firewalla MCP Server
 * Provides pre-flight checks for resource operations to prevent timeout errors
 */

import type { FirewallaClient } from '../firewalla/client.js';
import { ErrorType, createErrorResponse } from './error-handler.js';

/**
 * Resource types that can be validated
 */
export type ResourceType = 
  | 'rule' 
  | 'alarm' 
  | 'device' 
  | 'target_list' 
  | 'box'
  | 'flow';

/**
 * Resource existence check result
 */
export interface ResourceExistenceResult {
  exists: boolean;
  resourceId: string;
  resourceType: ResourceType;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resource operation wrapper result
 */
export interface ResourceOperationResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  existenceCheck?: ResourceExistenceResult;
}

/**
 * Configuration for resource operations
 */
export interface ResourceOperationConfig {
  /** Whether to skip existence check (for performance) */
  skipExistenceCheck?: boolean;
  /** Custom timeout for existence check */
  checkTimeoutMs?: number;
  /** Whether to cache existence results */
  cacheResults?: boolean;
}

/**
 * Resource validator class with existence checking capabilities
 */
export class ResourceValidator {
  private static existenceCache = new Map<string, { exists: boolean; timestamp: number }>();
  private static readonly CACHE_TTL_MS = 30000; // 30 seconds cache for existence checks

  /**
   * Check if a rule exists
   */
  static async checkRuleExists(
    ruleId: string,
    firewalla: FirewallaClient
  ): Promise<ResourceExistenceResult> {
    try {
      // Use a cached check if available and recent
      const cacheKey = `rule:${ruleId}`;
      const cached = this.existenceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        return {
          exists: cached.exists,
          resourceId: ruleId,
          resourceType: 'rule',
          metadata: { cached: true },
        };
      }

      // Get all rules to check for existence (with a reasonable limit)
      const ruleResponse = await firewalla.getNetworkRules(undefined, 1000);
      
      if (!ruleResponse || !ruleResponse.results) {
        throw new Error('Invalid response from getNetworkRules');
      }

      const exists = ruleResponse.results.some((rule: any) => rule.gid === ruleId || rule.id === ruleId);

      // Cache the result
      this.existenceCache.set(cacheKey, { exists, timestamp: Date.now() });

      return {
        exists,
        resourceId: ruleId,
        resourceType: 'rule',
        metadata: {
          totalRules: ruleResponse.results.length,
          matchFound: exists,
        },
      };
    } catch (error) {
      return {
        exists: false,
        resourceId: ruleId,
        resourceType: 'rule',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if an alarm exists
   */
  static async checkAlarmExists(
    alarmId: string,
    firewalla: FirewallaClient
  ): Promise<ResourceExistenceResult> {
    try {
      const cacheKey = `alarm:${alarmId}`;
      const cached = this.existenceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        return {
          exists: cached.exists,
          resourceId: alarmId,
          resourceType: 'alarm',
          metadata: { cached: true },
        };
      }

      // Try to get the specific alarm
      const alarmResponse = await firewalla.getSpecificAlarm(alarmId);
      
      const exists = !!(alarmResponse && alarmResponse.results && alarmResponse.results.length > 0);

      // Cache the result
      this.existenceCache.set(cacheKey, { exists, timestamp: Date.now() });

      return {
        exists,
        resourceId: alarmId,
        resourceType: 'alarm',
        metadata: {
          alarmFound: exists,
        },
      };
    } catch (error) {
      // If we get a 404 or similar, the alarm doesn't exist
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const exists = !errorMessage.includes('404') && !errorMessage.includes('not found');
      
      return {
        exists,
        resourceId: alarmId,
        resourceType: 'alarm',
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a device exists
   */
  static async checkDeviceExists(
    deviceId: string,
    firewalla: FirewallaClient
  ): Promise<ResourceExistenceResult> {
    try {
      const cacheKey = `device:${deviceId}`;
      const cached = this.existenceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        return {
          exists: cached.exists,
          resourceId: deviceId,
          resourceType: 'device',
          metadata: { cached: true },
        };
      }

      // Get device status to check existence
      const deviceResponse = await firewalla.getDeviceStatus(undefined, true, 1000); // Get all devices
      
      if (!deviceResponse || !deviceResponse.results) {
        throw new Error('Invalid response from getDeviceStatus');
      }

      const exists = deviceResponse.results.some((device: any) => 
        device.gid === deviceId || device.id === deviceId || device.mac === deviceId
      );

      // Cache the result
      this.existenceCache.set(cacheKey, { exists, timestamp: Date.now() });

      return {
        exists,
        resourceId: deviceId,
        resourceType: 'device',
        metadata: {
          totalDevices: deviceResponse.results.length,
          deviceFound: exists,
        },
      };
    } catch (error) {
      return {
        exists: false,
        resourceId: deviceId,
        resourceType: 'device',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generic resource existence checker
   */
  static async checkResourceExists(
    resourceType: ResourceType,
    resourceId: string,
    firewalla: FirewallaClient
  ): Promise<ResourceExistenceResult> {
    switch (resourceType) {
      case 'rule':
        return this.checkRuleExists(resourceId, firewalla);
      case 'alarm':
        return this.checkAlarmExists(resourceId, firewalla);
      case 'device':
        return this.checkDeviceExists(resourceId, firewalla);
      case 'box':
        return {
          exists: true,
          resourceId,
          resourceType,
          metadata: { note: 'Box existence not implemented yet' },
        };
      case 'flow':
        return {
          exists: true,
          resourceId,
          resourceType,
          metadata: { note: 'Flow existence not implemented yet' },
        };
      case 'target_list':
        return {
          exists: true,
          resourceId,
          resourceType,
          metadata: { note: 'Target list existence not implemented yet' },
        };
      default:
        return {
          exists: false,
          resourceId,
          resourceType,
          error: `Resource type '${resourceType}' not supported for existence checking`,
        };
    }
  }

  /**
   * Wrapper for resource operations that includes existence checking
   */
  static async withResourceCheck<T>(
    resourceType: ResourceType,
    resourceId: string,
    firewalla: FirewallaClient,
    operation: () => Promise<T>,
    config: ResourceOperationConfig = {}
  ): Promise<ResourceOperationResult<T>> {
    try {
      // Skip existence check if configured
      if (config.skipExistenceCheck) {
        const result = await operation();
        return { success: true, result };
      }

      // Check if resource exists
      const existenceCheck = await this.checkResourceExists(resourceType, resourceId, firewalla);
      
      if (!existenceCheck.exists) {
        return {
          success: false,
          existenceCheck,
          error: new Error(`${resourceType} with ID '${resourceId}' not found`),
        };
      }

      // Resource exists, proceed with operation
      const result = await operation();
      return { 
        success: true, 
        result, 
        existenceCheck,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Create standardized "resource not found" error response
   */
  static createResourceNotFoundResponse(
    toolName: string,
    resourceType: ResourceType,
    resourceId: string,
    existenceCheck?: ResourceExistenceResult
  ) {
    return createErrorResponse(
      toolName,
      `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found`,
      ErrorType.API_ERROR,
      {
        resource_type: resourceType,
        resource_id: resourceId,
        existence_check: existenceCheck,
        troubleshooting: [
          `Verify that ${resourceType} '${resourceId}' exists`,
          `Check if the ${resourceType} ID is correct`,
          `Ensure you have permission to access this ${resourceType}`,
          `The ${resourceType} may have been deleted or moved`,
        ],
        documentation: `/docs/firewalla-api-reference.md#${resourceType}-operations`,
      },
      [`${resourceType} with ID '${resourceId}' not found`]
    );
  }

  /**
   * Clear existence cache (useful for testing or when resources change frequently)
   */
  static clearCache(): void {
    this.existenceCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number; exists: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.existenceCache.entries()).map(([key, value]) => ({
      key,
      age: now - value.timestamp,
      exists: value.exists,
    }));

    return {
      size: this.existenceCache.size,
      entries,
    };
  }

  /**
   * Clean up expired cache entries
   */
  static cleanupCache(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of this.existenceCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL_MS) {
        this.existenceCache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Convenience function for checking rule existence and creating error response
 */
export async function validateRuleExists(
  ruleId: string,
  toolName: string,
  firewalla: FirewallaClient
): Promise<{ exists: true } | { exists: false; errorResponse: any }> {
  const existenceCheck = await ResourceValidator.checkRuleExists(ruleId, firewalla);
  
  if (!existenceCheck.exists) {
    return {
      exists: false,
      errorResponse: ResourceValidator.createResourceNotFoundResponse(
        toolName,
        'rule',
        ruleId,
        existenceCheck
      ),
    };
  }
  
  return { exists: true };
}

/**
 * Convenience function for checking alarm existence and creating error response
 */
export async function validateAlarmExists(
  alarmId: string,
  toolName: string,
  firewalla: FirewallaClient
): Promise<{ exists: true } | { exists: false; errorResponse: any }> {
  const existenceCheck = await ResourceValidator.checkAlarmExists(alarmId, firewalla);
  
  if (!existenceCheck.exists) {
    return {
      exists: false,
      errorResponse: ResourceValidator.createResourceNotFoundResponse(
        toolName,
        'alarm',
        alarmId,
        existenceCheck
      ),
    };
  }
  
  return { exists: true };
}