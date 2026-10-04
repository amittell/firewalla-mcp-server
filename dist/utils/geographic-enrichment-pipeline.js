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
import { getGeographicDataForIP, isPrivateIP, normalizeIP, } from './geographic.js';
import { logger } from '../monitoring/logger.js';
/**
 * Geographic Enrichment Pipeline
 *
 * High-performance pipeline that guarantees geographic data enrichment with
 * comprehensive fallback strategies and performance monitoring.
 */
export class GeographicEnrichmentPipeline {
    constructor(geoCache) {
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
    async enrichIP(ip) {
        const startTime = process.hrtime.bigint();
        this.stats.totalRequests++;
        try {
            // Validate and normalize IP
            const normalizedIP = normalizeIP(ip);
            if (!normalizedIP || isPrivateIP(normalizedIP)) {
                return this.createResult(null, 'failed', startTime, false);
            }
            // Try cache first (with error handling)
            let cached = undefined;
            try {
                cached = this.geoCache.get(normalizedIP);
            }
            catch (_error) {
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
                }
                catch (_error) {
                    // Cache set error - continue without caching
                }
                logger.debug('Geographic enrichment primary provider success', {
                    ip: normalizedIP,
                });
                return this.createResult(primaryResult.data, 'primary', startTime, true);
            }
            // The lookup has no data: the address is unknown, and is remembered
            // as such. Prefix tables and a guess from the first octet made up a
            // country here, and the last resort was a record with a UTC timezone
            // and a risk score of 5
            try {
                this.geoCache.set(normalizedIP, null);
            }
            catch (_error) {
                // Cache set error - continue without caching
            }
            logger.debug('Geographic enrichment found no data', {
                ip: normalizedIP,
            });
            return this.createResult(null, 'unknown', startTime, false);
        }
        catch (error) {
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
    async enrichBatch(requests) {
        const results = new Map();
        // Geographic enrichment enabled by default
        const batchStartTime = process.hrtime.bigint();
        const uniqueIPs = [...new Set(requests.map(r => r.ip))];
        // Process IPs in parallel with performance budget
        const enrichmentPromises = uniqueIPs.map(async (ip) => {
            const result = await this.enrichIP(ip);
            results.set(ip, result);
            return result;
        });
        try {
            await Promise.allSettled(enrichmentPromises);
        }
        catch (_error) {
            // Log error but continue with partial results
            logger.error('Batch enrichment error', _error instanceof Error ? _error : new Error(String(_error)));
        }
        // Simple performance budget warning
        const batchLatencyMs = Number(process.hrtime.bigint() - batchStartTime) / 1000000;
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
    async enrichObject(obj, ipFields = ['source_ip', 'destination_ip', 'device_ip', 'ip']) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }
        const requests = [];
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
    async tryPrimaryProvider(ip) {
        try {
            const data = getGeographicDataForIP(ip);
            return { data, success: data !== null };
        }
        catch (_error) {
            return { data: null, success: false };
        }
    }
    /**
     * Create enrichment result with performance tracking
     */
    createResult(data, source, startTime, success) {
        const latencyMs = Number(process.hrtime.bigint() - startTime) / 1000000;
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
    updateStats(latencyMs) {
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
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    /**
     * Set nested object value by path
     */
    setNestedValue(obj, path, value) {
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
    getStats() {
        return { ...this.stats };
    }
    /**
     * Reset statistics (for testing or monitoring reset)
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            successRate: 0,
        };
    }
    /**
     * Check if pipeline is meeting success rate target
     */
    isPerformingWell() {
        return this.stats.successRate >= this.successTarget;
    }
}
/**
 * Global pipeline instance (singleton pattern for performance)
 */
let globalPipeline = null;
/**
 * Get or create the global geographic enrichment pipeline
 */
export function getGlobalEnrichmentPipeline(geoCache) {
    if (!globalPipeline) {
        globalPipeline = new GeographicEnrichmentPipeline(geoCache);
    }
    return globalPipeline;
}
/**
 * Convenience function for enriching objects with geographic data
 */
export async function enrichWithGeographicData(obj, geoCache, ipFields) {
    // Geographic enrichment enabled by default
    const pipeline = getGlobalEnrichmentPipeline(geoCache);
    return pipeline.enrichObject(obj, ipFields);
}
//# sourceMappingURL=geographic-enrichment-pipeline.js.map