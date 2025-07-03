/**
 * Test Data Cache - Utilities for sharing test data across test cases
 * 
 * Enables optimization by loading data once and reusing across multiple tests,
 * reducing API calls while maintaining test isolation.
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
 * Test data cache manager for optimized test execution
 */
export class TestDataCacheManager {
  private static cache: TestDataCache = {};
  private static apiCallCount = 0;
  private static loadStartTime = 0;

  /**
   * Reset the cache (called between test suites)
   */
  static reset(): void {
    this.cache = {};
    this.apiCallCount = 0;
    this.loadStartTime = 0;
  }

  /**
   * Get current API call count
   */
  static getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Increment API call counter
   */
  static incrementApiCall(): void {
    this.apiCallCount++;
  }

  /**
   * Load shared test data with smart delta caching for time-series data
   */
  static async loadSharedTestData(
    client: FirewallaClient,
    options: SharedTestDataOptions = {}
  ): Promise<TestDataCache> {
    this.loadStartTime = Date.now();
    
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
        if (this.isSimpleCacheFresh(this.cache.devices, CACHE_TTL.devices)) {
          this.cache.devices!.hitCount++;
          console.log('📱 Using cached devices data');
          strategiesUsed.push('devices:cache');
        } else {
          loadPromises.push(
            this.trackApiCall(() => client.getDeviceStatus(undefined, true, deviceLimit))
              .then(result => {
                this.cache.devices = {
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
        const alarmStrategy = this.resolveTimeSeriesQuery(
          this.cache.alarms,
          timeRange?.startTime,
          timeRange?.endTime
        );
        
        strategiesUsed.push(`alarms:${alarmStrategy.cacheStrategy}`);
        
        if (alarmStrategy.needsDelta) {
          const startTime = alarmStrategy.deltaStartTime || timeRange?.startTime;
          const endTime = timeRange?.endTime;
          
          loadPromises.push(
            this.trackApiCall(() => client.getActiveAlarms(undefined, undefined, undefined, alarmLimit))
              .then(result => {
                const newData = result.results;
                
                if (alarmStrategy.useCache && this.cache.alarms) {
                  // Merge with existing cache
                  const mergedData = this.mergeTimeSeriesData(
                    this.cache.alarms.data,
                    newData,
                    timeRange?.startTime,
                    timeRange?.endTime
                  );
                  
                  this.cache.alarms = {
                    ...this.cache.alarms,
                    data: mergedData,
                    lastUpdateTimestamp: Date.now(),
                    totalItems: mergedData.length,
                    deltaFetchCount: (this.cache.alarms.deltaFetchCount || 0) + 1
                  };
                  console.log(`⚠️ Merged ${newData.length} new alarms with ${this.cache.alarms.data.length - newData.length} cached alarms`);
                } else {
                  // Fresh load
                  this.cache.alarms = {
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
          console.log(`⚠️ Using cached alarms data (${this.cache.alarms!.data.length} items)`);
        }
      }

      // Handle flows with smart delta caching  
      if (includeFlows) {
        const flowStrategy = this.resolveTimeSeriesQuery(
          this.cache.flows,
          timeRange?.startTime,
          timeRange?.endTime
        );
        
        strategiesUsed.push(`flows:${flowStrategy.cacheStrategy}`);
        
        if (flowStrategy.needsDelta) {
          const startTime = flowStrategy.deltaStartTime || timeRange?.startTime;
          const endTime = timeRange?.endTime;
          
          loadPromises.push(
            this.trackApiCall(() => client.getFlowData(startTime, endTime, undefined, flowLimit))
              .then(result => {
                const newData = result.results;
                
                if (flowStrategy.useCache && this.cache.flows) {
                  // Merge with existing cache
                  const mergedData = this.mergeTimeSeriesData(
                    this.cache.flows.data,
                    newData,
                    timeRange?.startTime,
                    timeRange?.endTime
                  );
                  
                  this.cache.flows = {
                    ...this.cache.flows,
                    data: mergedData,
                    lastUpdateTimestamp: Date.now(),
                    totalItems: mergedData.length,
                    deltaFetchCount: (this.cache.flows.deltaFetchCount || 0) + 1
                  };
                  console.log(`🌐 Merged ${newData.length} new flows with ${this.cache.flows.data.length - newData.length} cached flows`);
                } else {
                  // Fresh load
                  this.cache.flows = {
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
          console.log(`🌐 Using cached flows data (${this.cache.flows!.data.length} items)`);
        }
      }

      // Handle rules with simple TTL caching
      if (includeRules) {
        if (this.isSimpleCacheFresh(this.cache.rules, CACHE_TTL.rules)) {
          this.cache.rules!.hitCount++;
          console.log('📋 Using cached rules data');
          strategiesUsed.push('rules:cache');
        } else {
          loadPromises.push(
            this.trackApiCall(() => client.getNetworkRules(ruleLimit))
              .then(result => {
                this.cache.rules = {
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
        if (this.isSimpleCacheFresh(this.cache.statistics, CACHE_TTL.statistics)) {
          this.cache.statistics!.hitCount++;
          console.log('📊 Using cached statistics data');
          strategiesUsed.push('statistics:cache');
        } else {
          loadPromises.push(
            this.trackApiCall(() => client.getStatisticsByBox())
              .then(result => {
                this.cache.statistics = {
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
      
      const loadTime = Date.now() - this.loadStartTime;
      console.log(`✅ Smart cached data loaded in ${loadTime}ms with ${this.apiCallCount} API calls`);
      console.log(`📈 Cache strategies: ${strategiesUsed.join(', ')}`);
      
      return this.cache;
      
    } catch (error) {
      console.error('❌ Failed to load shared test data:', error);
      throw error;
    }
  }

  /**
   * Get cached data by type
   */
  static getCachedData<T = any>(type: keyof TestDataCache): T[] | T | undefined {
    const cacheEntry = this.cache[type];
    if (!cacheEntry) return undefined;
    
    // All cache entries now have a 'data' property
    return cacheEntry.data as T[] | T;
  }

  /**
   * Check if data is cached
   */
  static hasData(type: keyof TestDataCache): boolean {
    return this.cache[type] !== undefined;
  }

  /**
   * Get cache performance metrics and analytics
   */
  static getCacheAnalytics() {
    const stats = {
      apiCallCount: this.apiCallCount,
      loadTime: Date.now() - this.loadStartTime,
      hasCachedData: Object.keys(this.cache).length > 0,
      cacheStrategies: {} as Record<string, any>
    };
    
    // Delta cache analytics (time-series data)
    if (this.cache.alarms) {
      stats.cacheStrategies.alarms = {
        type: 'delta',
        totalItems: this.cache.alarms.totalItems,
        cacheHits: this.cache.alarms.cacheHitCount,
        deltaFetches: this.cache.alarms.deltaFetchCount,
        lastUpdate: new Date(this.cache.alarms.lastUpdateTimestamp).toISOString(),
        efficiency: this.cache.alarms.cacheHitCount / (this.cache.alarms.cacheHitCount + this.cache.alarms.deltaFetchCount) || 0
      };
    }
    
    if (this.cache.flows) {
      stats.cacheStrategies.flows = {
        type: 'delta',
        totalItems: this.cache.flows.totalItems,
        cacheHits: this.cache.flows.cacheHitCount,
        deltaFetches: this.cache.flows.deltaFetchCount,
        lastUpdate: new Date(this.cache.flows.lastUpdateTimestamp).toISOString(),
        efficiency: this.cache.flows.cacheHitCount / (this.cache.flows.cacheHitCount + this.cache.flows.deltaFetchCount) || 0
      };
    }
    
    // Simple cache analytics (semi-static data)
    if (this.cache.devices) {
      stats.cacheStrategies.devices = {
        type: 'simple',
        totalItems: Array.isArray(this.cache.devices.data) ? this.cache.devices.data.length : 0,
        cacheHits: this.cache.devices.hitCount,
        lastUpdate: new Date(this.cache.devices.loadedAt).toISOString(),
        age: Date.now() - this.cache.devices.loadedAt
      };
    }
    
    if (this.cache.rules) {
      stats.cacheStrategies.rules = {
        type: 'simple',
        totalItems: Array.isArray(this.cache.rules.data) ? this.cache.rules.data.length : 0,
        cacheHits: this.cache.rules.hitCount,
        lastUpdate: new Date(this.cache.rules.loadedAt).toISOString(),
        age: Date.now() - this.cache.rules.loadedAt
      };
    }
    
    if (this.cache.statistics) {
      stats.cacheStrategies.statistics = {
        type: 'simple',
        cacheHits: this.cache.statistics.hitCount,
        lastUpdate: new Date(this.cache.statistics.loadedAt).toISOString(),
        age: Date.now() - this.cache.statistics.loadedAt
      };
    }
    
    return stats;
  }

  /**
   * Track API calls for monitoring
   */
  private static async trackApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
    this.incrementApiCall();
    return await apiCall();
  }

  /**
   * Print cache status summary for debugging
   */
  static printCacheStatus(): void {
    const analytics = this.getCacheAnalytics();
    
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
  private static resolveTimeSeriesQuery(
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
  private static isSimpleCacheFresh(
    cacheEntry: SimpleCacheEntry | undefined,
    ttl: number
  ): boolean {
    if (!cacheEntry) return false;
    return (Date.now() - cacheEntry.loadedAt) < ttl;
  }

  /**
   * Merge cached data with delta data for time-series
   */
  private static mergeTimeSeriesData<T extends { timestamp?: number; ts?: number }>(
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
}

/**
 * Utility functions for test data filtering and manipulation
 */
export class TestDataUtils {
  /**
   * Filter devices by various criteria
   */
  static filterDevices(devices: any[], criteria: {
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
  static filterAlarms(alarms: any[], criteria: {
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
  static filterFlows(flows: any[], criteria: {
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
  static getDeviceTypeStats(devices: any[]): Record<string, number> {
    const stats: Record<string, number> = {};
    devices.forEach(device => {
      // Infer device type from name and vendor since actual deviceType might not be available
      const type = this.inferDeviceType(device);
      stats[type] = (stats[type] || 0) + 1;
    });
    return stats;
  }

  /**
   * Infer device type from device name and vendor (enhanced patterns)
   */
  private static inferDeviceType(device: any): string {
    const name = (device.name || '').toLowerCase();
    const vendor = (device.macVendor || '').toLowerCase();
    
    // Mobile devices - enhanced patterns
    if (name.includes('iphone') || name.includes('ipad') || name.includes('android') || 
        name.includes('phone') || name.includes('mobile') || name.includes('samsung galaxy') ||
        name.includes('pixel') || name.includes('oneplus') || name.includes('xiaomi') ||
        (vendor.includes('samsung') && (name.includes('phone') || name.includes('tablet'))) ||
        (vendor.includes('apple') && (name.includes('iphone') || name.includes('ipad')))) {
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
    
    // Gaming devices
    if (name.includes('xbox') || name.includes('playstation') || name.includes('ps4') ||
        name.includes('ps5') || name.includes('nintendo') || name.includes('switch') ||
        name.includes('steam deck') || vendor.includes('microsoft') && name.includes('xbox')) {
      return 'gaming';
    }
    
    // Entertainment devices - enhanced patterns
    if (name.includes('tv') || name.includes('smart tv') || name.includes('roku') ||
        name.includes('chromecast') || name.includes('apple tv') || name.includes('fire tv') ||
        name.includes('netflix') || name.includes('hulu') || name.includes('shield') ||
        vendor.includes('roku') || vendor.includes('google') && name.includes('chromecast')) {
      return 'entertainment';
    }
    
    // Smart home devices - enhanced patterns
    if (name.includes('alexa') || name.includes('echo') || name.includes('google home') ||
        name.includes('nest') || name.includes('smart') || name.includes('ring') ||
        name.includes('philips hue') || name.includes('wemo') || name.includes('tp-link') ||
        name.includes('thermostat') || name.includes('camera') || name.includes('doorbell') ||
        vendor.includes('amazon') || vendor.includes('google') && name.includes('nest') ||
        vendor.includes('philips') || vendor.includes('tp-link')) {
      return 'smart_home';
    }
    
    // Network infrastructure
    if (name.includes('router') || name.includes('modem') || name.includes('access point') ||
        name.includes('switch') || name.includes('bridge') || name.includes('extender') ||
        vendor.includes('cisco') || vendor.includes('netgear') || vendor.includes('linksys') ||
        vendor.includes('ubiquiti') || vendor.includes('tp-link') && name.includes('router')) {
      return 'network';
    }
    
    // IoT and sensors
    if (name.includes('sensor') || name.includes('monitor') || name.includes('tracker') ||
        name.includes('scale') || name.includes('fitness') || name.includes('watch') ||
        name.includes('band') || name.includes('fitbit') || vendor.includes('fitbit')) {
      return 'iot';
    }
    
    return 'unknown';
  }

  /**
   * Get online/offline device counts
   */
  static getDeviceStatusCounts(devices: any[]): { online: number; offline: number; total: number } {
    const online = devices.filter(d => d.online).length;
    const offline = devices.filter(d => !d.online).length;
    return { online, offline, total: devices.length };
  }
}

/**
 * Conditional test execution based on optimization settings
 */
export class OptimizedTestRunner {
  /**
   * Check if test optimization is enabled
   */
  static isOptimizationEnabled(): boolean {
    return process.env.OPTIMIZE_TESTS === 'true';
  }

  /**
   * Check if integration tests should use real API
   */
  static shouldUseRealApi(): boolean {
    return !!(process.env.FIREWALLA_MSP_TOKEN && process.env.INTEGRATION_TESTS === 'true');
  }

  /**
   * Conditional describe block for optimized tests
   */
  static describeOptimized(description: string, suiteFn: () => void): void {
    if (this.isOptimizationEnabled()) {
      describe(`${description} (Optimized)`, suiteFn);
    } else {
      describe.skip(`${description} (Optimized - disabled)`, suiteFn);
    }
  }

  /**
   * Conditional describe block for individual API tests
   */
  static describeIndividual(description: string, suiteFn: () => void): void {
    if (!this.isOptimizationEnabled()) {
      describe(`${description} (Individual)`, suiteFn);
    } else {
      describe.skip(`${description} (Individual - optimization enabled)`, suiteFn);
    }
  }
}