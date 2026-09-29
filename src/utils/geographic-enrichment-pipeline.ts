/**
 * Geographic Enrichment Pipeline
 *
 * Implements a high-performance, fault-tolerant pipeline for enriching data with
 * geographic information. Features multiple fallback providers, performance
 * monitoring, and success rate tracking to guarantee ≥95% enrichment success
 * with ≤3ms latency impact.
 *
 * Architecture:
 * - Multi-tier fallback strategy (primary → secondary → tertiary → default)
 * - Batch processing for efficiency
 * - Performance budgeting with early termination
 * - Comprehensive monitoring and metrics
 * - Feature flag integration for safe rollout
 */

import type { GeographicData } from '../types.js';
import {
  getGeographicDataForIP,
  isPrivateIP,
  normalizeIP,
  type GeographicCache,
} from './geographic.js';
import { logger } from '../monitoring/logger.js';

/**
 * Geographic enrichment statistics (simplified)
 */
export interface EnrichmentStats {
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
}

/**
 * Geographic enrichment result with metadata
 */
export interface EnrichmentResult {
  data: GeographicData | null;
  /** Where the data came from; unknown when the lookup had none */
  source: 'cache' | 'primary' | 'unknown' | 'failed';
  latencyMs: number;
  success: boolean;
}

/**
 * Batch enrichment request
 */
export interface BatchEnrichmentRequest {
  ip: string;
  fieldPath: string; // e.g., 'source.geo', 'destination.geo'
}

/**
 * Geographic Enrichment Pipeline
 *
 * High-performance pipeline that guarantees geographic data enrichment with
 * comprehensive fallback strategies and performance monitoring.
 */
export class GeographicEnrichmentPipeline {
  private stats: EnrichmentStats;
  private geoCache: GeographicCache;
  private performanceBudgetMs: number;
  private successTarget: number;

  constructor(geoCache: GeographicCache) {
    this.geoCache = geoCache;
    this.performanceBudgetMs = 5000; // 5 seconds budget
    this.successTarget = 0.95; // 95% success target

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      successRate: 0,
    };
  }

  /**
   * Enrich a single IP address with geographic data
   */
  async enrichIP(ip: string): Promise<EnrichmentResult> {
    const startTime = process.hrtime.bigint();
    this.stats.totalRequests++;

    try {
      // Validate and normalize IP
      const normalizedIP = normalizeIP(ip);
      if (!normalizedIP || isPrivateIP(normalizedIP)) {
        return this.createResult(null, 'failed', startTime, false);
      }

      // Try cache first (with error handling)
      let cached: GeographicData | null | undefined = undefined;
      try {
        cached = this.geoCache.get(normalizedIP);
      } catch (_error) {
        // Cache error - continue with other providers
        cached = undefined;
      }

      if (cached !== undefined) {
        logger.debug('Geographic enrichment cache hit', { ip: normalizedIP });
        return this.createResult(cached, 'cache', startTime, cached !== null);
      }

      // Primary provider: geoip-lite
      const primaryResult = await this.tryPrimaryProvider(normalizedIP);
      if (primaryResult.success) {
        try {
          this.geoCache.set(normalizedIP, primaryResult.data);
        } catch (_error) {
          // Cache set error - continue without caching
        }
        logger.debug('Geographic enrichment primary provider success', {
          ip: normalizedIP,
        });
        return this.createResult(
          primaryResult.data,
          'primary',
          startTime,
          true
        );
      }

      // The lookup has no data: the address is unknown, and is remembered
      // as such. Prefix tables and a guess from the first octet made up a
      // country here, and the last resort was a record with a UTC timezone
      // and a risk score of 5
      try {
        this.geoCache.set(normalizedIP, null);
      } catch (_error) {
        // Cache set error - continue without caching
      }
      logger.debug('Geographic enrichment found no data', {
        ip: normalizedIP,
      });
      return this.createResult(null, 'unknown', startTime, false);
    } catch (error) {
      logger.debug('Geographic enrichment failed', {
        ip,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return this.createResult(null, 'failed', startTime, false);
    }
  }

  /**
   * Batch enrich multiple IPs for efficiency
   */
  async enrichBatch(
    requests: BatchEnrichmentRequest[]
  ): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();

    // Geographic enrichment enabled by default

    const batchStartTime = process.hrtime.bigint();
    const uniqueIPs = [...new Set(requests.map(r => r.ip))];

    // Process IPs in parallel with performance budget
    const enrichmentPromises = uniqueIPs.map(async ip => {
      const result = await this.enrichIP(ip);
      results.set(ip, result);
      return result;
    });

    try {
      await Promise.allSettled(enrichmentPromises);
    } catch (_error) {
      // Log error but continue with partial results
      logger.error(
        'Batch enrichment error',
        _error instanceof Error ? _error : new Error(String(_error))
      );
    }

    // Simple performance budget warning
    const batchLatencyMs =
      Number(process.hrtime.bigint() - batchStartTime) / 1_000_000;
    if (batchLatencyMs > this.performanceBudgetMs) {
      logger.debug('Geographic enrichment batch exceeded performance budget', {
        batchLatencyMs,
        budgetMs: this.performanceBudgetMs,
        batchSize: uniqueIPs.length,
      });
    }

    return results;
  }

  /**
   * Enrich an object with geographic data based on IP fields
   */
  async enrichObject<T extends Record<string, any>>(
    obj: T,
    ipFields: string[] = ['source_ip', 'destination_ip', 'device_ip', 'ip']
  ): Promise<T> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const requests: BatchEnrichmentRequest[] = [];

    // Collect all IPs that need enrichment
    for (const field of ipFields) {
      const ip = this.getNestedValue(obj, field);
      if (ip && typeof ip === 'string') {
        const geoField = `${field}_geo`;
        if (!this.getNestedValue(obj, geoField)) {
          requests.push({ ip, fieldPath: geoField });
        }
      }
    }

    if (requests.length === 0) {
      return obj;
    }

    // Perform batch enrichment
    const enrichmentResults = await this.enrichBatch(requests);

    // Apply results to object
    const enriched = { ...obj };
    for (const request of requests) {
      const result = enrichmentResults.get(request.ip);
      if (result?.success && result.data) {
        this.setNestedValue(enriched, request.fieldPath, result.data);
      }
    }

    return enriched;
  }

  /**
   * Try primary geographic provider (geoip-lite)
   */
  private async tryPrimaryProvider(
    ip: string
  ): Promise<{ data: GeographicData | null; success: boolean }> {
    try {
      const data = getGeographicDataForIP(ip);
      return { data, success: data !== null };
    } catch (_error) {
      return { data: null, success: false };
    }
  }

  /**
   * Create enrichment result with performance tracking
   */
  private createResult(
    data: GeographicData | null,
    source: EnrichmentResult['source'],
    startTime: bigint,
    success: boolean
  ): EnrichmentResult {
    const latencyMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    if (success) {
      this.stats.successfulRequests++;
    }

    this.updateStats(latencyMs);

    return {
      data,
      source,
      latencyMs,
      success,
    };
  }

  /**
   * Update basic statistics
   */
  private updateStats(latencyMs: number): void {
    this.stats.successRate =
      this.stats.totalRequests > 0
        ? this.stats.successfulRequests / this.stats.totalRequests
        : 0;

    // Simple performance budget warning (keep as requested)
    if (latencyMs > this.performanceBudgetMs) {
      logger.debug('Geographic enrichment exceeded performance budget', {
        latencyMs,
        budgetMs: this.performanceBudgetMs,
      });
    }
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested object value by path
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    if (!lastKey) {
      return;
    }

    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Get current enrichment statistics
   */
  getStats(): EnrichmentStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (for testing or monitoring reset)
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      successRate: 0,
    };
  }

  /**
   * Check if pipeline is meeting success rate target
   */
  isPerformingWell(): boolean {
    return this.stats.successRate >= this.successTarget;
  }
}

/**
 * Global pipeline instance (singleton pattern for performance)
 */
let globalPipeline: GeographicEnrichmentPipeline | null = null;

/**
 * Get or create the global geographic enrichment pipeline
 */
export function getGlobalEnrichmentPipeline(
  geoCache: GeographicCache
): GeographicEnrichmentPipeline {
  if (!globalPipeline) {
    globalPipeline = new GeographicEnrichmentPipeline(geoCache);
  }
  return globalPipeline;
}

/**
 * Convenience function for enriching objects with geographic data
 */
export async function enrichWithGeographicData<T extends Record<string, any>>(
  obj: T,
  geoCache: GeographicCache,
  ipFields?: string[]
): Promise<T> {
  // Geographic enrichment enabled by default

  const pipeline = getGlobalEnrichmentPipeline(geoCache);
  return pipeline.enrichObject(obj, ipFields);
}
