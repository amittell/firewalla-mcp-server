/**
 * Test Data Cache - Modern module-based utilities for sharing test data across test cases
 * 
 * Enables optimization by loading data once and reusing across multiple tests,
 * reducing API calls while maintaining test isolation. Uses clean module functions
 * instead of static classes for better maintainability.
 * 
 * Key Functions:
 * - loadSharedTestData() - Smart caching with delta/TTL strategies
 * - filterDevices/Alarms/Flows() - Data filtering utilities  
 * - getCachedData() - Access cached data by type
 * - isOptimizationEnabled() - Conditional test execution
 * 
 * @example
 * ```typescript
 * import { loadSharedTestData, filterDevices } from './test-data-cache.js';
 * 
 * const cache = await loadSharedTestData(client, { includeDevices: true });
 * const devices = filterDevices(cache.devices, { online: true });
 * ```
 */

import { FirewallaClient } from '../../src/firewalla/client';

// Context-specific cache TTLs per coding guidelines
const CACHE_TTL = {
  devices: 2 * 60 * 1000,     // 2 minutes - devices/bandwidth
  alarms: 30 * 1000,          // 30 seconds - alarms/flows
  flows: 30 * 1000,           // 30 seconds - alarms/flows
  rules: 10 * 60 * 1000,      // 10 minutes - rules
  statistics: 60 * 60 * 1000  // 1 hour - statistics
} as const;

// Delta cache entry for time-series data
export interface DeltaCacheEntry<T = any> {
  data: T[];
  lastUpdateTimestamp: number;
  earliestDataTimestamp: number;
  totalItems: number;
  cacheHitCount: number;
  deltaFetchCount: number;
}

// Simple cache entry for relatively static data
export interface SimpleCacheEntry<T = any> {
  data: T | T[];
  loadedAt: number;
  hitCount: number;
}

export interface TestDataCache {
  // Time-series data with delta caching support
  alarms?: DeltaCacheEntry;
  flows?: DeltaCacheEntry;
  
  // Simple TTL-based data
  devices?: SimpleCacheEntry;
  rules?: SimpleCacheEntry;
  statistics?: SimpleCacheEntry;
}

export interface SharedTestDataOptions {
  includeDevices?: boolean;
  includeAlarms?: boolean;
  includeFlows?: boolean;
  includeRules?: boolean;
  includeStatistics?: boolean;
  limits?: {
    devices?: number;
    alarms?: number;
    flows?: number;
    rules?: number;
  };
  // Time range for time-series data (alarms, flows)
  timeRange?: {
    startTime?: string;  // ISO 8601 format
    endTime?: string;    // ISO 8601 format
  };
}

/**
 * Module-scoped variables for test data cache management
 */
let cache: TestDataCache = {};
let apiCallCount = 0;
let loadStartTime = 0;

/**
 * Reset the cache (called between test suites)
 */
export function resetCache(): void {
  cache = {};
  apiCallCount = 0;
  loadStartTime = 0;
}

/**
 * Get current API call count
 */
export function getApiCallCount(): number {
  return apiCallCount;
}

/**
 * Increment API call counter
 */
export function incrementApiCall(): void {
  apiCallCount++;
}

/**
 * Load shared test data with smart delta caching for time-series data
 */
export async function loadSharedTestData(
  client: FirewallaClient,
  options: SharedTestDataOptions = {}
): Promise<TestDataCache> {
  loadStartTime = Date.now();
    
    const {
      includeDevices = true,
      includeAlarms = true,
      includeFlows = true,
      includeRules = true,
      includeStatistics = false,
      limits = {},
      timeRange
    } = options;

    const {
      devices: deviceLimit = 100,
      alarms: alarmLimit = 50,
      flows: flowLimit = 50,
      rules: ruleLimit = 50
    } = limits;

    console.log('🔄 Loading shared test data with smart caching...');
    
    try {
      const loadPromises: Promise<any>[] = [];
      let strategiesUsed: string[] = [];
      
      // Handle devices with simple TTL caching
      if (includeDevices) {
        if (isSimpleCacheFresh(cache.devices, CACHE_TTL.devices)) {
          cache.devices!.hitCount++;
          console.log('📱 Using cached devices data');
          strategiesUsed.push('devices:cache');
        } else {
          loadPromises.push(
            trackApiCall(() => client.getDeviceStatus(undefined, true, deviceLimit))
              .then(result => {
                cache.devices = {
                  data: result.results,
                  loadedAt: Date.now(),
                  hitCount: 0
                };
                console.log(`📱 Loaded ${result.results.length} devices for shared testing`);
                strategiesUsed.push('devices:fresh');
              })
          );
        }
      }

      // Handle alarms with smart delta caching
      if (includeAlarms) {
        const alarmStrategy = resolveTimeSeriesQuery(
          cache.alarms,
          timeRange?.startTime,
          timeRange?.endTime
        );
        
        strategiesUsed.push(`alarms:${alarmStrategy.cacheStrategy}`);
        
        if (alarmStrategy.needsDelta) {
          const startTime = alarmStrategy.deltaStartTime || timeRange?.startTime;
          const endTime = timeRange?.endTime;
          
          loadPromises.push(
            trackApiCall(() => client.getActiveAlarms(undefined, undefined, undefined, alarmLimit))
              .then(result => {
                const newData = result.results;
                
                if (alarmStrategy.useCache && cache.alarms) {
                  // Merge with existing cache
                  const mergedData = mergeTimeSeriesData(
                    cache.alarms.data,
                    newData,
                    timeRange?.startTime,
                    timeRange?.endTime
                  );
                  
                  cache.alarms = {
                    ...cache.alarms,
                    data: mergedData,
                    lastUpdateTimestamp: Date.now(),
                    totalItems: mergedData.length,
                    deltaFetchCount: (cache.alarms.deltaFetchCount || 0) + 1
                  };
                  console.log(`⚠️ Merged ${newData.length} new alarms with ${cache.alarms.data.length - newData.length} cached alarms`);
                } else {
                  // Fresh load
                  cache.alarms = {
                    data: newData,
                    lastUpdateTimestamp: Date.now(),
                    earliestDataTimestamp: newData.length > 0 ? Math.min(...newData.map((a: any) => a.timestamp || a.ts || Date.now())) : Date.now(),
                    totalItems: newData.length,
                    cacheHitCount: 0,
                    deltaFetchCount: 0
                  };
                  console.log(`⚠️ Loaded ${newData.length} alarms for shared testing`);
                }
              })
          );
        } else if (alarmStrategy.useCache) {
          console.log(`⚠️ Using cached alarms data (${cache.alarms!.data.length} items)`);
        }
      }

      // Handle flows with smart delta caching  
      if (includeFlows) {
        const flowStrategy = resolveTimeSeriesQuery(
          cache.flows,
          timeRange?.startTime,
          timeRange?.endTime
        );
        
        strategiesUsed.push(`flows:${flowStrategy.cacheStrategy}`);
        
        if (flowStrategy.needsDelta) {
          const startTime = flowStrategy.deltaStartTime || timeRange?.startTime;
          const endTime = timeRange?.endTime;
          
          loadPromises.push(
            trackApiCall(() => client.getFlowData(startTime, endTime, undefined, flowLimit))
              .then(result => {
                const newData = result.results;
                
                if (flowStrategy.useCache && cache.flows) {
                  // Merge with existing cache
                  const mergedData = mergeTimeSeriesData(
                    cache.flows.data,
                    newData,
                    timeRange?.startTime,
                    timeRange?.endTime
                  );
                  
                  cache.flows = {
                    ...cache.flows,
                    data: mergedData,
                    lastUpdateTimestamp: Date.now(),
                    totalItems: mergedData.length,
                    deltaFetchCount: (cache.flows.deltaFetchCount || 0) + 1
                  };
                  console.log(`🌐 Merged ${newData.length} new flows with ${cache.flows.data.length - newData.length} cached flows`);
                } else {
                  // Fresh load
                  cache.flows = {
                    data: newData,
                    lastUpdateTimestamp: Date.now(),
                    earliestDataTimestamp: newData.length > 0 ? Math.min(...newData.map((f: any) => f.timestamp || f.ts || Date.now())) : Date.now(),
                    totalItems: newData.length,
                    cacheHitCount: 0,
                    deltaFetchCount: 0
                  };
                  console.log(`🌐 Loaded ${newData.length} flows for shared testing`);
                }
              })
          );
        } else if (flowStrategy.useCache) {
          console.log(`🌐 Using cached flows data (${cache.flows!.data.length} items)`);
        }
      }

      // Handle rules with simple TTL caching
      if (includeRules) {
        if (isSimpleCacheFresh(cache.rules, CACHE_TTL.rules)) {
          cache.rules!.hitCount++;
          console.log('📋 Using cached rules data');
          strategiesUsed.push('rules:cache');
        } else {
          loadPromises.push(
            trackApiCall(() => client.getNetworkRules(ruleLimit))
              .then(result => {
                cache.rules = {
                  data: result.results,
                  loadedAt: Date.now(),
                  hitCount: 0
                };
                console.log(`📋 Loaded ${result.results.length} rules for shared testing`);
                strategiesUsed.push('rules:fresh');
              })
          );
        }
      }

      // Handle statistics with simple TTL caching
      if (includeStatistics) {
        if (isSimpleCacheFresh(cache.statistics, CACHE_TTL.statistics)) {
          cache.statistics!.hitCount++;
          console.log('📊 Using cached statistics data');
          strategiesUsed.push('statistics:cache');
        } else {
          loadPromises.push(
            trackApiCall(() => client.getStatisticsByBox())
              .then(result => {
                cache.statistics = {
                  data: result.results[0],
                  loadedAt: Date.now(),
                  hitCount: 0
                };
                console.log(`📊 Loaded statistics for shared testing`);
                strategiesUsed.push('statistics:fresh');
              })
          );
        }
      }

      await Promise.all(loadPromises);
      
      const loadTime = Date.now() - loadStartTime;
      console.log(`✅ Smart cached data loaded in ${loadTime}ms with ${apiCallCount} API calls`);
      console.log(`📈 Cache strategies: ${strategiesUsed.join(', ')}`);
      
      return cache;
      
    } catch (error) {
      console.error('❌ Failed to load shared test data:', error);
      throw error;
    }
}

/**
 * Get cached data by type
 */
export function getCachedData<T = any>(type: keyof TestDataCache): T[] | T | undefined {
  const cacheEntry = cache[type];
  if (!cacheEntry) return undefined;
  
  // All cache entries now have a 'data' property
  return cacheEntry.data as T[] | T;
}

/**
 * Check if data is cached
 */
export function hasData(type: keyof TestDataCache): boolean {
  return cache[type] !== undefined;
}

/**
 * Get cache performance metrics and analytics
 */
export function getCacheAnalytics() {
  const stats = {
    apiCallCount: apiCallCount,
    loadTime: Date.now() - loadStartTime,
    hasCachedData: Object.keys(cache).length > 0,
    cacheStrategies: {} as Record<string, any>
  };
  
  // Delta cache analytics (time-series data)
  if (cache.alarms) {
    stats.cacheStrategies.alarms = {
      type: 'delta',
      totalItems: cache.alarms.totalItems,
      cacheHits: cache.alarms.cacheHitCount,
      deltaFetches: cache.alarms.deltaFetchCount,
      lastUpdate: new Date(cache.alarms.lastUpdateTimestamp).toISOString(),
      efficiency: cache.alarms.cacheHitCount / (cache.alarms.cacheHitCount + cache.alarms.deltaFetchCount) || 0
    };
  }
  
  if (cache.flows) {
    stats.cacheStrategies.flows = {
      type: 'delta',
      totalItems: cache.flows.totalItems,
      cacheHits: cache.flows.cacheHitCount,
      deltaFetches: cache.flows.deltaFetchCount,
      lastUpdate: new Date(cache.flows.lastUpdateTimestamp).toISOString(),
      efficiency: cache.flows.cacheHitCount / (cache.flows.cacheHitCount + cache.flows.deltaFetchCount) || 0
    };
  }
  
  // Simple cache analytics (semi-static data)
  if (cache.devices) {
    stats.cacheStrategies.devices = {
      type: 'simple',
      totalItems: Array.isArray(cache.devices.data) ? cache.devices.data.length : 0,
      cacheHits: cache.devices.hitCount,
      lastUpdate: new Date(cache.devices.loadedAt).toISOString(),
      age: Date.now() - cache.devices.loadedAt
    };
  }
  
  if (cache.rules) {
    stats.cacheStrategies.rules = {
      type: 'simple',
      totalItems: Array.isArray(cache.rules.data) ? cache.rules.data.length : 0,
      cacheHits: cache.rules.hitCount,
      lastUpdate: new Date(cache.rules.loadedAt).toISOString(),
      age: Date.now() - cache.rules.loadedAt
    };
  }
  
  if (cache.statistics) {
    stats.cacheStrategies.statistics = {
      type: 'simple',
      cacheHits: cache.statistics.hitCount,
      lastUpdate: new Date(cache.statistics.loadedAt).toISOString(),
      age: Date.now() - cache.statistics.loadedAt
    };
  }
  
  return stats;
}

/**
 * Track API calls for monitoring
 */
export async function trackApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  incrementApiCall();
  return await apiCall();
}

/**
 * Print cache status summary for debugging
 */
export function printCacheStatus(): void {
  const analytics = getCacheAnalytics();
  
  console.log('\n🔍 Smart Cache Status:');
  console.log(`API Calls Made: ${analytics.apiCallCount}`);
  console.log(`Load Time: ${analytics.loadTime}ms`);
  
  Object.entries(analytics.cacheStrategies).forEach(([type, stats]) => {
    if (stats.type === 'delta') {
      console.log(`📊 ${type}: Delta cache - ${stats.totalItems} items, ${stats.cacheHits} hits, ${stats.deltaFetches} deltas (${(stats.efficiency * 100).toFixed(1)}% efficient)`);
    } else {
      console.log(`📊 ${type}: Simple cache - ${stats.totalItems || 'N/A'} items, ${stats.cacheHits} hits, age: ${Math.round(stats.age / 1000)}s`);
    }
  });
  console.log('');
}

/**
 * Smart cache resolution for time-series data (alarms, flows)
 */
export function resolveTimeSeriesQuery(
  cacheEntry: DeltaCacheEntry | undefined,
  queryStartTime?: string,
  queryEndTime?: string
): {
  useCache: boolean;
  needsDelta: boolean;
  deltaStartTime?: string;
  cacheStrategy: 'cache_only' | 'delta_only' | 'cache_plus_delta';
} {
  const now = Date.now();
  const queryStart = queryStartTime ? new Date(queryStartTime).getTime() : now - (24 * 60 * 60 * 1000); // Default: last 24h
  const queryEnd = queryEndTime ? new Date(queryEndTime).getTime() : now;

  // No cached data - fetch fresh
  if (!cacheEntry || cacheEntry.data.length === 0) {
    return { useCache: false, needsDelta: true, cacheStrategy: 'delta_only' };
  }

  const cacheLastUpdate = cacheEntry.lastUpdateTimestamp;
  
  // Query is entirely historical (before last cache update)
  if (queryEnd <= cacheLastUpdate) {
    cacheEntry.cacheHitCount++;
    return { useCache: true, needsDelta: false, cacheStrategy: 'cache_only' };
  }
  
  // Query is entirely after cache (fetch fresh only)  
  if (queryStart > cacheLastUpdate) {
    return { useCache: false, needsDelta: true, cacheStrategy: 'delta_only' };
  }
  
  // Query spans cached + new data (hybrid approach)
  cacheEntry.cacheHitCount++;
  cacheEntry.deltaFetchCount++;
  return { 
    useCache: true, 
    needsDelta: true, 
    deltaStartTime: new Date(cacheLastUpdate).toISOString(),
    cacheStrategy: 'cache_plus_delta' 
  };
}

/**
 * Check if simple cache entry is fresh
 */
export function isSimpleCacheFresh(
  cacheEntry: SimpleCacheEntry | undefined,
  ttl: number
): boolean {
  if (!cacheEntry) return false;
  return (Date.now() - cacheEntry.loadedAt) < ttl;
}

/**
 * Merge cached data with delta data for time-series
 */
export function mergeTimeSeriesData<T extends { timestamp?: number; ts?: number }>(
  cachedData: T[],
  deltaData: T[],
  queryStartTime?: string,
  queryEndTime?: string
): T[] {
  const queryStart = queryStartTime ? new Date(queryStartTime).getTime() : 0;
  const queryEnd = queryEndTime ? new Date(queryEndTime).getTime() : Date.now();

  // Filter cached data to query range
  const relevantCachedData = cachedData.filter(item => {
    const itemTime = (item.timestamp || item.ts || 0) * 1000; // Convert to ms if needed
    return itemTime >= queryStart && itemTime <= queryEnd;
  });

  // Combine and deduplicate by timestamp or id
  const combined = [...relevantCachedData, ...deltaData];
  const seen = new Set<string>();
  
  return combined.filter(item => {
    // Use timestamp or id for deduplication
    const key = (item as any).id || (item.timestamp || item.ts || Math.random()).toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    const aTime = (a.timestamp || a.ts || 0);
    const bTime = (b.timestamp || b.ts || 0);
    return bTime - aTime; // Most recent first
  });
}


/**
 * Filter devices by various criteria
 */
export function filterDevices(devices: any[], criteria: {
  deviceId?: string;
  online?: boolean;
  macAddress?: string;
  nameContains?: string;
}): any[] {
  return devices.filter(device => {
    if (criteria.deviceId && device.id !== criteria.deviceId) return false;
    if (criteria.online !== undefined && device.online !== criteria.online) return false;
    if (criteria.macAddress && device.mac?.toLowerCase().replace(/[:-]/g, '') !== 
        criteria.macAddress.toLowerCase().replace(/[:-]/g, '')) return false;
    if (criteria.nameContains && !device.name?.toLowerCase().includes(criteria.nameContains.toLowerCase())) return false;
    return true;
  });
}

/**
 * Filter alarms by severity or other criteria
 */
export function filterAlarms(alarms: any[], criteria: {
  severity?: string;
  type?: string;
  sourceIp?: string;
}): any[] {
  return alarms.filter(alarm => {
    if (criteria.severity && alarm.severity !== criteria.severity) return false;
    if (criteria.type && alarm.type !== criteria.type) return false;
    if (criteria.sourceIp && alarm.sourceIp !== criteria.sourceIp) return false;
    return true;
  });
}

/**
 * Filter flows by various criteria
 */
export function filterFlows(flows: any[], criteria: {
  protocol?: string;
  blocked?: boolean;
  minBytes?: number;
  deviceId?: string;
}): any[] {
  return flows.filter(flow => {
    if (criteria.protocol && flow.protocol !== criteria.protocol) return false;
    if (criteria.blocked !== undefined && flow.blocked !== criteria.blocked) return false;
    if (criteria.minBytes && (flow.bytes || 0) < criteria.minBytes) return false;
    if (criteria.deviceId && flow.device?.id !== criteria.deviceId) return false;
    return true;
  });
}

/**
 * Get device type statistics from cached data
 */
export function getDeviceTypeStats(devices: any[]): Record<string, number> {
  const stats: Record<string, number> = {};
  devices.forEach(device => {
    // Infer device type from name and vendor since actual deviceType might not be available
    const type = inferDeviceType(device);
    stats[type] = (stats[type] || 0) + 1;
  });
  return stats;
}

/**
 * Infer device type from device name and vendor (enhanced patterns)
 */
export function inferDeviceType(device: any): string {
  const name = (device.name || '').toLowerCase();
  const vendor = (device.macVendor || '').toLowerCase();
  
  // IoT/Smart Home devices (check first as they often have generic names)
  if (vendor.includes('espressif') || vendor.includes('tuya') || 
      name.includes('esp32') || name.includes('esp8266') ||
      vendor.includes('shenzhen') || vendor.includes('xiaomi') ||
      name.includes('bulb') || name.includes('switch') || name.includes('plug')) {
    return 'iot';
  }
  
  // Gaming consoles
  if (name.includes('playstation') || name.includes('xbox') || 
      name.includes('nintendo') || name.includes('switch') ||
      name.includes('ps4') || name.includes('ps5') || name.includes('steam deck')) {
    return 'gaming';
  }
  
  // Tablets
  if (name.includes('ipad') || name.includes('tablet') || 
      (vendor.includes('samsung') && name.includes('tab')) ||
      name.includes('surface') && !name.includes('laptop')) {
    return 'tablet';
  }
  
  // Mobile devices - enhanced patterns
  if (name.includes('iphone') || name.includes('android') || 
      name.includes('phone') || name.includes('mobile') || name.includes('samsung galaxy') ||
      name.includes('pixel') || name.includes('oneplus') || name.includes('huawei') ||
      (vendor.includes('samsung') && (name.includes('phone') || name.includes('galaxy'))) ||
      (vendor.includes('apple') && name.includes('iphone'))) {
    return 'mobile';
  }
  
  // Computers - enhanced patterns
  if (name.includes('macbook') || name.includes('laptop') || name.includes('computer') ||
      name.includes('pc') || name.includes('desktop') || name.includes('imac') ||
      name.includes('surface') || name.includes('thinkpad') || name.includes('dell') ||
      name.includes('hp') || name.includes('asus') || name.includes('lenovo') ||
      (vendor.includes('apple') && (name.includes('macbook') || name.includes('imac'))) ||
      vendor.includes('dell') || vendor.includes('lenovo') || vendor.includes('hp inc')) {
    return 'computer';
  }
  
  // Entertainment devices - enhanced patterns
  if (name.includes('tv') || name.includes('smart tv') || name.includes('roku') ||
      name.includes('chromecast') || name.includes('apple tv') || name.includes('fire tv') ||
      name.includes('netflix') || name.includes('hulu') || name.includes('shield') ||
      vendor.includes('roku') || (vendor.includes('google') && name.includes('chromecast')) ||
      name.includes('soundbar') || name.includes('speaker')) {
    return 'entertainment';
  }
  
  // Smart home devices - enhanced patterns
  if (name.includes('alexa') || name.includes('echo') || name.includes('google home') ||
      name.includes('nest') || name.includes('smart') || name.includes('ring') ||
      name.includes('philips hue') || name.includes('wemo') || name.includes('tp-link') ||
      name.includes('thermostat') || name.includes('camera') || name.includes('doorbell') ||
      vendor.includes('amazon') || (vendor.includes('google') && name.includes('nest')) ||
      vendor.includes('philips') || vendor.includes('tp-link')) {
    return 'smart_home';
  }
  
  // Network infrastructure
  if (name.includes('router') || name.includes('modem') || name.includes('access point') ||
      name.includes('switch') || name.includes('bridge') || name.includes('extender') ||
      vendor.includes('cisco') || vendor.includes('netgear') || vendor.includes('linksys') ||
      vendor.includes('ubiquiti') || (vendor.includes('tp-link') && name.includes('router'))) {
    return 'network';
  }
  
  // Wearables and fitness devices
  if (name.includes('watch') || name.includes('band') || name.includes('fitbit') ||
      name.includes('tracker') || name.includes('scale') || name.includes('fitness') ||
      vendor.includes('fitbit') || vendor.includes('garmin') || 
      (vendor.includes('apple') && name.includes('watch'))) {
    return 'wearable';
  }
  
  return 'unknown';
}

/**
 * Get online/offline device counts
 */
export function getDeviceStatusCounts(devices: any[]): { online: number; offline: number; total: number } {
  const online = devices.filter(d => d.online).length;
  const offline = devices.filter(d => !d.online).length;
  return { online, offline, total: devices.length };
}


/**
 * Check if test optimization is enabled
 */
export function isOptimizationEnabled(): boolean {
  return process.env.OPTIMIZE_TESTS === 'true';
}

/**
 * Check if integration tests should use real API
 */
export function shouldUseRealApi(): boolean {
  return !!(process.env.FIREWALLA_MSP_TOKEN && process.env.INTEGRATION_TESTS === 'true');
}

/**
 * Conditional describe block for optimized tests
 */
export function describeOptimized(description: string, suiteFn: () => void): void {
  if (isOptimizationEnabled()) {
    describe(`${description} (Optimized)`, suiteFn);
  } else {
    describe.skip(`${description} (Optimized - disabled)`, suiteFn);
  }
}

/**
 * Conditional describe block for individual API tests
 */
export function describeIndividual(description: string, suiteFn: () => void): void {
  if (!isOptimizationEnabled()) {
    describe(`${description} (Individual)`, suiteFn);
  } else {
    describe.skip(`${description} (Individual - optimization enabled)`, suiteFn);
  }
}

// Clean module-based API - no legacy class interface needed