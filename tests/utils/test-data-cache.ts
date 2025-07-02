/**
 * Test Data Cache - Utilities for sharing test data across test cases
 * 
 * Enables optimization by loading data once and reusing across multiple tests,
 * reducing API calls while maintaining test isolation.
 */

import { FirewallaClient } from '../../src/firewalla/client';

export interface TestDataCache {
  devices?: any[];
  alarms?: any[];
  flows?: any[];
  rules?: any[];
  statistics?: any;
  loadedAt?: number;
  apiCallCount?: number;
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
   * Load shared test data once for the entire test suite
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
      limits = {}
    } = options;

    const {
      devices: deviceLimit = 100,
      alarms: alarmLimit = 50,
      flows: flowLimit = 50,
      rules: ruleLimit = 50
    } = limits;

    // Check if data is already cached and fresh (within 5 minutes)
    if (this.cache.loadedAt && Date.now() - this.cache.loadedAt < 300000) {
      return this.cache;
    }

    console.log('🔄 Loading shared test data...');
    
    try {
      const loadPromises: Promise<any>[] = [];
      
      if (includeDevices) {
        loadPromises.push(
          this.trackApiCall(() => client.getDeviceStatus(undefined, true, deviceLimit))
            .then(result => {
              this.cache.devices = result.results;
              console.log(`📱 Loaded ${result.results.length} devices for shared testing`);
            })
        );
      }

      if (includeAlarms) {
        loadPromises.push(
          this.trackApiCall(() => client.getActiveAlarms(undefined, undefined, undefined, alarmLimit))
            .then(result => {
              this.cache.alarms = result.results;
              console.log(`⚠️ Loaded ${result.results.length} alarms for shared testing`);
            })
        );
      }

      if (includeFlows) {
        loadPromises.push(
          this.trackApiCall(() => client.getFlowData(undefined, undefined, undefined, flowLimit))
            .then(result => {
              this.cache.flows = result.results;
              console.log(`🌐 Loaded ${result.results.length} flows for shared testing`);
            })
        );
      }

      if (includeRules) {
        loadPromises.push(
          this.trackApiCall(() => client.getNetworkRules(ruleLimit))
            .then(result => {
              this.cache.rules = result.results;
              console.log(`📋 Loaded ${result.results.length} rules for shared testing`);
            })
        );
      }

      if (includeStatistics) {
        loadPromises.push(
          this.trackApiCall(() => client.getStatisticsByBox())
            .then(result => {
              this.cache.statistics = result.results[0];
              console.log(`📊 Loaded statistics for shared testing`);
            })
        );
      }

      await Promise.all(loadPromises);
      
      this.cache.loadedAt = Date.now();
      this.cache.apiCallCount = this.apiCallCount;
      
      const loadTime = Date.now() - this.loadStartTime;
      console.log(`✅ Shared test data loaded in ${loadTime}ms with ${this.apiCallCount} API calls`);
      
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
    return this.cache[type] as T[] | T | undefined;
  }

  /**
   * Check if data is cached
   */
  static hasData(type: keyof TestDataCache): boolean {
    return this.cache[type] !== undefined;
  }

  /**
   * Get performance metrics
   */
  static getPerformanceMetrics(): {
    apiCallCount: number;
    loadTime: number;
    cacheAge: number;
    hasCachedData: boolean;
  } {
    return {
      apiCallCount: this.apiCallCount,
      loadTime: this.cache.loadedAt ? this.cache.loadedAt - this.loadStartTime : 0,
      cacheAge: this.cache.loadedAt ? Date.now() - this.cache.loadedAt : 0,
      hasCachedData: Object.keys(this.cache).length > 0
    };
  }

  /**
   * Track API calls for monitoring
   */
  private static async trackApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
    this.incrementApiCall();
    return await apiCall();
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
   * Infer device type from device name and vendor
   */
  private static inferDeviceType(device: any): string {
    const name = (device.name || '').toLowerCase();
    const vendor = (device.macVendor || '').toLowerCase();
    
    // Mobile devices
    if (name.includes('iphone') || name.includes('android') || name.includes('phone') || 
        name.includes('mobile') || vendor.includes('samsung') && name.includes('phone')) {
      return 'mobile';
    }
    
    // Computers
    if (name.includes('macbook') || name.includes('laptop') || name.includes('computer') ||
        name.includes('pc') || name.includes('desktop') || vendor.includes('apple') && 
        (name.includes('macbook') || name.includes('imac'))) {
      return 'computer';
    }
    
    // Entertainment devices
    if (name.includes('tv') || name.includes('smart tv') || name.includes('roku') ||
        name.includes('chromecast') || name.includes('apple tv')) {
      return 'entertainment';
    }
    
    // Smart home devices
    if (name.includes('alexa') || name.includes('echo') || name.includes('google') ||
        name.includes('nest') || name.includes('smart') || vendor.includes('amazon')) {
      return 'smart_home';
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
    return process.env.OPTIMIZE_TESTS === 'true' || process.env.NODE_ENV === 'test';
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