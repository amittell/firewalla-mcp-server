# Firewalla MCP Server - Rate Limiting Guide

This guide provides comprehensive documentation for API usage guidelines, rate limiting thresholds, caching strategies, and performance optimization techniques for the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Rate Limiting Thresholds](#rate-limiting-thresholds)
- [Caching Strategies](#caching-strategies)
- [Performance Optimization](#performance-optimization)
- [Request Management](#request-management)
- [Monitoring and Metrics](#monitoring-and-metrics)
- [Best Practices](#best-practices)
- [Troubleshooting Performance Issues](#troubleshooting-performance-issues)
- [Tool-Specific Guidelines](#tool-specific-guidelines)
- [Advanced Optimization Techniques](#advanced-optimization-techniques)

## Overview

The Firewalla MCP Server implements intelligent rate limiting and caching to ensure optimal performance while respecting Firewalla MSP API limits. Understanding these systems is crucial for building efficient applications that can handle high volumes of data without encountering rate limits or performance degradation.

### Performance Goals

1. **Responsiveness**: Sub-second response times for cached data
2. **Efficiency**: Minimize API calls through intelligent caching
3. **Reliability**: Graceful handling of rate limits and errors
4. **Scalability**: Support for high-volume data processing
5. **Resource Management**: Optimal memory and network usage

## Rate Limiting Thresholds

### Firewalla MSP API Limits

The Firewalla MSP API enforces the following rate limits:

```typescript
interface RateLimits {
  // Standard API endpoints
  standard: {
    requestsPerMinute: 100;     // 100 requests per minute
    requestsPerHour: 3000;      // 3000 requests per hour
    burstLimit: 10;             // 10 concurrent requests
  };

  // Search endpoints (more restrictive)
  search: {
    requestsPerMinute: 50;      // 50 search requests per minute
    requestsPerHour: 1500;      // 1500 search requests per hour
    burstLimit: 5;              // 5 concurrent search requests
  };

  // Write operations (most restrictive)
  write: {
    requestsPerMinute: 20;      // 20 write requests per minute
    requestsPerHour: 500;       // 500 write requests per hour
    burstLimit: 2;              // 2 concurrent write requests
  };
}
```

### Server-Side Rate Limiting

The MCP server implements additional client-side rate limiting:

```typescript
interface ClientRateLimits {
  // Request spacing
  minimumRequestInterval: 100;  // 100ms between requests

  // Concurrent request limits
  maxConcurrentRequests: 5;     // 5 concurrent requests max

  // Retry settings
  maxRetries: 3;                // Maximum retry attempts
  retryDelay: 1000;             // Base retry delay (ms)
  backoffMultiplier: 2;         // Exponential backoff multiplier
  
  // Polling settings
  pollInterval: 25;             // 25ms poll interval for request slots
}
```

### Rate Limit Headers

The server monitors rate limit headers from the Firewalla API:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-Type: standard
```

### Rate Limit Handling

```typescript
// Automatic rate limit detection and handling
class RateLimitManager {
  private activeRequests = 0;
  private lastRequestTime = 0;

  constructor(private readonly limits: ClientRateLimits = defaultClientLimits) {}

  async makeRequest<T>(request: () => Promise<T>): Promise<T> {
    // Wait for minimum interval
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minimumInterval = this.limits.minimumRequestInterval;

    if (timeSinceLastRequest < minimumInterval) {
      await new Promise(resolve =>
        setTimeout(resolve, minimumInterval - timeSinceLastRequest)
      );
    }

    // Check concurrent request limit
    if (this.activeRequests >= this.limits.maxConcurrentRequests) {
      await this.waitForRequestSlot();
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      while (true) {
        try {
          return await request();
        } catch (error) {
          if (error.errorType !== 'rate_limit_error') {
            throw error;
          }
          const retryAfter = error.details?.retryAfter || 60;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          // Continue the loop to retry in the same frame
        }
      }
    } finally {
      this.activeRequests--;
    }
  }

  private async waitForRequestSlot(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.activeRequests < this.limits.maxConcurrentRequests) {
          return resolve();
        }
        setTimeout(check, this.limits.pollInterval);
      };
      check();
    });
  }
}
```

## Caching Strategies

### Multi-Tiered Caching System

The server implements a sophisticated caching system with different TTL policies:

```typescript
interface CacheConfig {
  // Real-time data (short TTL)
  alarms: {
    ttl: 30000;              // 30 seconds
    reason: "Security alerts need real-time updates";
  };

  flows: {
    ttl: 120000;             // 2 minutes
    reason: "Network flows change frequently";
  };

  // Semi-static data (medium TTL)
  devices: {
    ttl: 300000;             // 5 minutes
    reason: "Device status changes moderately";
  };

  bandwidth: {
    ttl: 300000;             // 5 minutes
    reason: "Bandwidth stats aggregate over time";
  };

  // Static data (long TTL)
  rules: {
    ttl: 600000;             // 10 minutes
    reason: "Rules change infrequently";
  };

  statistics: {
    ttl: 3600000;            // 1 hour
    reason: "Statistics are computed periodically";
  };

  targetLists: {
    ttl: 3600000;            // 1 hour
    reason: "Target lists are relatively stable";
  };
}
```

### Intelligent Cache Keys

Cache keys are constructed to maximize hit rates:

```typescript
function generateCacheKey(
  tool: string,
  params: Record<string, any>
): string {
  // Normalize parameters for consistent keys
  const normalizedParams = {
    ...params,
    // Remove pagination-specific parameters from cache key
    cursor: undefined,
    offset: undefined,
    // Normalize query strings
    query: params.query?.trim().toLowerCase()
  };

  // Sort parameters for consistent key generation
  const sortedParams = Object.keys(normalizedParams)
    .sort()
    .reduce((acc, key) => {
      if (normalizedParams[key] !== undefined) {
        acc[key] = normalizedParams[key];
      }
      return acc;
    }, {} as Record<string, any>);

  return `${tool}:${JSON.stringify(sortedParams)}`;
}
```

### Cache Invalidation

Smart cache invalidation based on data relationships:

```typescript
class SmartCache {
  private cache = new Map<string, CacheEntry>();
  private dependencies = new Map<string, Set<string>>();

  // Invalidate related cache entries
  invalidateByPattern(pattern: string): void {
    const keysToInvalidate: string[] = [];

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        keysToInvalidate.push(key);
      }
    }

    keysToInvalidate.forEach(key => this.cache.delete(key));
  }

  // Invalidate when rules change (affects search results)
  onRuleUpdate(ruleId: string): void {
    this.invalidateByPattern('search_rules');
    this.invalidateByPattern('get_network_rules');
    this.invalidateByPattern('get_most_active_rules');
  }

  // Invalidate when device status changes
  onDeviceUpdate(deviceId: string): void {
    this.invalidateByPattern('search_devices');
    this.invalidateByPattern('get_device_status');
    this.invalidateByPattern('get_bandwidth_usage');
  }
}
```

### Geographic Data Caching

Specialized caching for geographic lookups:

```typescript
class GeographicCache {
  private geoCache: Map<string, GeographicData>;
  private readonly TTL = 3600000; // 1 hour for geographic data

  async getGeographicData(ip: string): Promise<GeographicData> {
    const cacheKey = `geo:${ip}`;
    const cached = this.geoCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

    // Fetch from external service
    const geoData = await this.fetchGeographicData(ip);

    this.geoCache.set(cacheKey, {
      data: geoData,
      timestamp: Date.now()
    });

    return geoData;
  }

  // Batch geographic lookups for efficiency
  async batchGeographicLookup(ips: string[]): Promise<Map<string, GeographicData>> {
    const results = new Map<string, GeographicData>();
    const uncachedIps: string[] = [];

    // Check cache first
    for (const ip of ips) {
      const cached = this.geoCache.get(`geo:${ip}`);
      if (cached && Date.now() - cached.timestamp < this.TTL) {
        results.set(ip, cached.data);
      } else {
        uncachedIps.push(ip);
      }
    }

    // Batch fetch uncached IPs
    if (uncachedIps.length > 0) {
      const freshData = await this.batchFetchGeographicData(uncachedIps);
      for (const [ip, data] of freshData) {
        this.geoCache.set(`geo:${ip}`, {
          data,
          timestamp: Date.now()
        });
        results.set(ip, data);
      }
    }

    return results;
  }
}
```

## Performance Optimization

### Request Batching

Combine multiple requests into single API calls:

```typescript
// Batch device status requests
async function batchGetDeviceStatus(
  deviceIds: string[],
  batchSize: number = 50
): Promise<Device[]> {
  const results: Device[] = [];

  for (let i = 0; i < deviceIds.length; i += batchSize) {
    const batch = deviceIds.slice(i, i + batchSize);
    const query = batch.map(id => `id:${id}`).join(' OR ');

    const response = await searchDevices({
      query,
      limit: batchSize
    });

    results.push(...response.results);
  }

  return results;
}
```

### Query Optimization

Optimize queries for better performance:

```typescript
class QueryOptimizer {
  // Optimize query structure for better performance
  optimizeQuery(query: string): string {
    return query
      // Move specific filters to the beginning
      .replace(/(\w+:[^\\s\\)]+)\\s+AND\\s+(.+)/, '$1 AND $2')
      // Simplify redundant patterns
      .replace(/(\\w+):\\*(.+?)\\*/, '$1:*$2*')
      // Remove unnecessary whitespace
      .replace(/\\s+/g, ' ')
      .trim();
  }

  // Estimate query cost for performance planning
  estimateQueryCost(query: string, limit: number): number {
    let baseCost = limit * 0.1; // Base cost per result

    // Wildcards increase cost
    const wildcardCount = (query.match(/\\*/g) || []).length;
    baseCost += wildcardCount * 10;

    // OR operations increase cost
    const orCount = (query.match(/\\bOR\\b/gi) || []).length;
    baseCost += orCount * 5;

    // NOT operations increase cost
    const notCount = (query.match(/\\bNOT\\b/gi) || []).length;
    baseCost += notCount * 3;

    return baseCost;
  }
}
```

### Connection Pooling

Manage HTTP connections efficiently:

```typescript
// Configure connection pooling for better performance
const axiosConfig = {
  // Keep connections alive
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 30000
  }),

  // Connection timeout settings
  timeout: 30000,

  // Compression for large responses
  compression: true,

  // Response size limits
  maxContentLength: 50 * 1024 * 1024, // 50MB
  maxBodyLength: 50 * 1024 * 1024
};
```

### Memory Management

Optimize memory usage for large datasets:

```typescript
// Stream processing for large datasets
async function* processLargeDataset(
  searchFunction: (params: any) => Promise<any>,
  query: string,
  batchSize: number = 1000
) {
  let cursor: string | undefined;

  do {
    const response = await searchFunction({
      query,
      limit: batchSize,
      cursor
    });

    // Yield batch for processing
    yield response.results;

    cursor = response.next_cursor;

    // Force garbage collection for large datasets
    if (global.gc && response.results.length === batchSize) {
      global.gc();
    }

  } while (cursor);
}
```

## Request Management

### Request Queue Management

```typescript
class RequestQueue {
  private queue: Array<{
    request: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    priority: number;
  }> = [];

  private processing = false;

  constructor(private readonly limits: ClientRateLimits = defaultClientLimits) {}

  async enqueue<T>(
    request: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        const result = await item.request();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Rate limiting delay - use configured minimum interval
      await new Promise(resolve => 
        setTimeout(resolve, this.limits.minimumRequestInterval)
      );
    }

    this.processing = false;
  }
}
```

### Priority-Based Requests

```typescript
enum RequestPriority {
  CRITICAL = 100,    // Security alerts, real-time data
  HIGH = 75,         // Interactive user requests
  NORMAL = 50,       // Background data retrieval
  LOW = 25,          // Bulk processing, analytics
  BACKGROUND = 0     // Maintenance, cache warming
}

// Usage example
const requestQueue = new RequestQueue();

// Critical security alert
await requestQueue.enqueue(
  () => getActiveAlarms({ limit: 50, severity: 'critical' }),
  RequestPriority.CRITICAL
);

// Background analytics
await requestQueue.enqueue(
  () => getBandwidthUsage({ period: '7d', limit: 1000 }),
  RequestPriority.BACKGROUND
);
```

## Monitoring and Metrics

### Performance Metrics Collection

```typescript
class PerformanceMonitor {
  private metrics = {
    requestCounts: new Map<string, number>(),
    responseTimes: new Map<string, number[]>(),
    cacheHitRates: new Map<string, { hits: number; misses: number }>(),
    errorRates: new Map<string, number>()
  };

  recordRequest(tool: string, responseTime: number, cached: boolean): void {
    // Request counts
    const count = this.metrics.requestCounts.get(tool) || 0;
    this.metrics.requestCounts.set(tool, count + 1);

    // Response times
    const times = this.metrics.responseTimes.get(tool) || [];
    times.push(responseTime);
    if (times.length > 100) times.shift(); // Keep last 100 measurements
    this.metrics.responseTimes.set(tool, times);

    // Cache hit rates
    const cacheStats = this.metrics.cacheHitRates.get(tool) || { hits: 0, misses: 0 };
    if (cached) {
      cacheStats.hits++;
    } else {
      cacheStats.misses++;
    }
    this.metrics.cacheHitRates.set(tool, cacheStats);
  }

  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      tools: {}
    };

    for (const [tool, count] of this.metrics.requestCounts) {
      const times = this.metrics.responseTimes.get(tool) || [];
      const cacheStats = this.metrics.cacheHitRates.get(tool) || { hits: 0, misses: 0 };

      report.tools[tool] = {
        requestCount: count,
        averageResponseTime: times.reduce((a, b) => a + b, 0) / times.length,
        medianResponseTime: this.median(times),
        p95ResponseTime: this.percentile(times, 0.95),
        cacheHitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses),
        totalCacheHits: cacheStats.hits,
        totalCacheMisses: cacheStats.misses
      };
    }

    return report;
  }
}
```

### Cache Performance Monitoring

```typescript
class CacheMonitor {
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    memoryUsage: 0
  };

  recordHit(): void {
    this.stats.hits++;
  }

  recordMiss(): void {
    this.stats.misses++;
  }

  recordEviction(): void {
    this.stats.evictions++;
  }

  updateSize(size: number): void {
    this.stats.size = size;
  }

  updateMemoryUsage(bytes: number): void {
    this.stats.memoryUsage = bytes;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      missRate: total > 0 ? this.stats.misses / total : 0
    };
  }
}
```

## Best Practices

### Efficient Data Retrieval

```typescript
// Good: Use appropriate limits and caching
async function efficientAlarmRetrieval() {
  const cacheKey = 'recent_critical_alarms';
  let alarms = cache.get(cacheKey);

  if (!alarms) {
    alarms = await getActiveAlarms({
      limit: 100,
      severity: 'critical',
      sort_by: 'timestamp',
      sort_order: 'desc'
    });

    // Cache for 30 seconds
    cache.set(cacheKey, alarms, 30000);
  }

  return alarms;
}

// Bad: Inefficient retrieval pattern
async function inefficientAlarmRetrieval() {
  // Don't do this - no caching, no limits
  return await getActiveAlarms({ limit: 10000 });
}
```

### Batch Processing

```typescript
// Good: Process in manageable batches
async function processManyDevices(deviceIds: string[]) {
  const batchSize = 50;
  const results: Device[] = [];

  for (let i = 0; i < deviceIds.length; i += batchSize) {
    const batch = deviceIds.slice(i, i + batchSize);
    const devices = await batchGetDevices(batch);
    results.push(...devices);

    // Small delay between batches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}
```

### Smart Query Construction

```typescript
// Good: Optimize queries for performance
function buildOptimizedQuery(filters: QueryFilters): string {
  const parts: string[] = [];

  // Most selective filters first
  if (filters.deviceId) {
    parts.push(`device_id:${filters.deviceId}`);
  }

  if (filters.severity) {
    parts.push(`severity:${filters.severity}`);
  }

  // Less selective filters last
  if (filters.timeRange) {
    parts.push(`timestamp:[${filters.timeRange.start} TO ${filters.timeRange.end}]`);
  }

  return parts.join(' AND ');
}
```

### Error Handling with Retry Logic

```typescript
async function robustApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;

      // Don't retry validation errors
      if (error.errorType === 'validation_error') {
        throw error;
      }

      // Handle rate limits with exponential backoff
      if (error.errorType === 'rate_limit_error') {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Retry network errors with delay
      if (error.errorType === 'network_error' && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      throw error;
    }
  }

  throw lastError!;
}
```

## Troubleshooting Performance Issues

### Common Performance Problems

#### Slow Response Times

```typescript
// Diagnose slow responses
async function diagnoseSlowResponse(tool: string, params: any) {
  const startTime = Date.now();

  try {
    // Check if data is cached
    const cacheKey = generateCacheKey(tool, params);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`${tool}: Cache hit, response in ${Date.now() - startTime}ms`);
      return cached;
    }

    // Measure API call time
    const apiStartTime = Date.now();
    const result = await makeApiCall(tool, params);
    const apiTime = Date.now() - apiStartTime;

    console.log(`${tool}: API call took ${apiTime}ms`);

    // Check if result processing is slow
    const processStartTime = Date.now();
    const processedResult = processResult(result);
    const processTime = Date.now() - processStartTime;

    console.log(`${tool}: Processing took ${processTime}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`${tool}: Total response time ${totalTime}ms`);

    return processedResult;
  } catch (error) {
    console.error(`${tool}: Error after ${Date.now() - startTime}ms:`, error);
    throw error;
  }
}
```

#### High Memory Usage

```typescript
// Monitor memory usage
function monitorMemoryUsage(operation: string) {
  const memBefore = process.memoryUsage();

  return {
    end: () => {
      const memAfter = process.memoryUsage();
      const diff = {
        heapUsed: memAfter.heapUsed - memBefore.heapUsed,
        heapTotal: memAfter.heapTotal - memBefore.heapTotal,
        external: memAfter.external - memBefore.external
      };

      console.log(`${operation} memory delta:`, {
        heapUsed: `${(diff.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(diff.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(diff.external / 1024 / 1024).toFixed(2)}MB`
      });
    }
  };
}

// Usage
const monitor = monitorMemoryUsage('large_search');
try {
  const results = await searchFlows({ query: 'protocol:tcp', limit: 5000 });
  return results;
} finally {
  monitor.end();
}
```

#### Rate Limit Breaches

```typescript
// Monitor and prevent rate limit breaches
class RateLimitPreventor {
  private requestTimes: number[] = [];
  private readonly windowSize = 60000; // 1 minute window
  private readonly maxRequests = 90;   // 90% of API limit

  canMakeRequest(): boolean {
    const now = Date.now();

    // Remove old requests outside the window
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.windowSize
    );

    return this.requestTimes.length < this.maxRequests;
  }

  recordRequest(): void {
    this.requestTimes.push(Date.now());
  }

  timeUntilNextRequest(): number {
    if (this.canMakeRequest()) {
      return 0;
    }

    const oldestRequest = Math.min(...this.requestTimes);
    return this.windowSize - (Date.now() - oldestRequest);
  }
}
```

## Tool-Specific Guidelines

### Search Tools

```typescript
// Optimize search tool usage
const searchOptimization = {
  // Flow searches - use time ranges and specific protocols
  searchFlows: {
    maxLimit: 1000,
    recommendedFilters: ['protocol', 'source_ip', 'timestamp'],
    cacheTime: 120000 // 2 minutes
  },

  // Alarm searches - focus on severity and status
  searchAlarms: {
    maxLimit: 500,
    recommendedFilters: ['severity', 'status', 'type'],
    cacheTime: 30000 // 30 seconds
  },

  // Device searches - use network and status filters
  searchDevices: {
    maxLimit: 200,
    recommendedFilters: ['online', 'network_id', 'mac_vendor'],
    cacheTime: 300000 // 5 minutes
  }
};
```

### Data Retrieval Tools

```typescript
// Optimize data retrieval patterns
const retrievalOptimization = {
  // Bandwidth data - use appropriate time periods
  getBandwidthUsage: {
    periods: {
      realTime: '1h',
      dashboard: '24h',
      analysis: '7d',
      reporting: '30d'
    },
    maxLimit: 1000,
    cacheTime: 300000
  },

  // Device status - batch requests when possible
  getDeviceStatus: {
    batchSize: 100,
    maxLimit: 500,
    cacheTime: 300000
  },

  // Network rules - cache aggressively
  getNetworkRules: {
    maxLimit: 2000,
    cacheTime: 600000,
    filters: ['status:active'] // Default to active rules
  }
};
```

## Advanced Optimization Techniques

### Predictive Caching

```typescript
// Predictive cache warming based on usage patterns
class PredictiveCache {
  private usagePatterns = new Map<string, number[]>();

  recordAccess(cacheKey: string): void {
    const times = this.usagePatterns.get(cacheKey) || [];
    times.push(Date.now());

    // Keep only recent access times
    const oneHourAgo = Date.now() - 3600000;
    this.usagePatterns.set(
      cacheKey,
      times.filter(time => time > oneHourAgo)
    );
  }

  shouldWarmCache(cacheKey: string): boolean {
    const times = this.usagePatterns.get(cacheKey) || [];

    // Warm cache if accessed more than 5 times in the last hour
    return times.length > 5;
  }

  async warmFrequentlyAccessedData(): Promise<void> {
    const candidates = Array.from(this.usagePatterns.entries())
      .filter(([_, times]) => times.length > 5)
      .map(([key, _]) => key);

    for (const cacheKey of candidates) {
      try {
        // Parse cache key and warm the data
        await this.warmCacheKey(cacheKey);
      } catch (error) {
        console.warn(`Failed to warm cache for ${cacheKey}:`, error);
      }
    }
  }
}
```

### Adaptive Query Optimization

```typescript
// Adapt query strategies based on performance
class AdaptiveQueryOptimizer {
  private queryPerformance = new Map<string, {
    avgTime: number;
    count: number;
    lastOptimized: number;
  }>();

  recordQueryPerformance(query: string, executionTime: number): void {
    const stats = this.queryPerformance.get(query) || {
      avgTime: 0,
      count: 0,
      lastOptimized: 0
    };

    stats.avgTime = (stats.avgTime * stats.count + executionTime) / (stats.count + 1);
    stats.count++;

    this.queryPerformance.set(query, stats);
  }

  shouldOptimizeQuery(query: string): boolean {
    const stats = this.queryPerformance.get(query);
    if (!stats) return false;

    // Optimize if slow and frequently used
    return stats.avgTime > 5000 && stats.count > 10;
  }

  optimizeQuery(query: string): string {
    // Apply various optimization strategies
    let optimized = query;

    // Move most selective terms first
    optimized = this.reorderTerms(optimized);

    // Convert OR chains to more efficient patterns
    optimized = this.optimizeOrChains(optimized);

    // Simplify redundant conditions
    optimized = this.simplifyConditions(optimized);

    return optimized;
  }
}
```

### Connection Pool Optimization

```typescript
// Dynamic connection pool management
class DynamicConnectionPool {
  private pools = new Map<string, http.Agent>();
  private poolStats = new Map<string, {
    activeConnections: number;
    queuedRequests: number;
    avgResponseTime: number;
  }>();

  getAgent(endpoint: string): http.Agent {
    let agent = this.pools.get(endpoint);

    if (!agent) {
      agent = new http.Agent({
        keepAlive: true,
        maxSockets: this.calculateOptimalPoolSize(endpoint),
        maxFreeSockets: 5,
        timeout: 30000
      });

      this.pools.set(endpoint, agent);
    }

    return agent;
  }

  private calculateOptimalPoolSize(endpoint: string): number {
    const stats = this.poolStats.get(endpoint);

    if (!stats) {
      return 10; // Default pool size
    }

    // Adjust pool size based on load and performance
    if (stats.queuedRequests > 5 && stats.avgResponseTime < 1000) {
      return Math.min(20, stats.activeConnections + 5);
    }

    if (stats.avgResponseTime > 5000) {
      return Math.max(5, Math.floor(stats.activeConnections * 0.8));
    }

    return 10;
  }
}
```

This comprehensive rate limiting and performance guide provides everything you need to optimize the Firewalla MCP Server for maximum efficiency and reliability. Remember to monitor your usage patterns and adjust strategies based on your specific requirements and traffic patterns.