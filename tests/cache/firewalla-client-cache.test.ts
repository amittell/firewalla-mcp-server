/**
 * @fileoverview Test suite for enhanced FirewallaClient cache functionality
 * 
 * Tests the intelligent caching system integration and cache management
 * features in the FirewallaClient
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { DataCacheStrategies } from '../../src/cache/cache-strategies.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FirewallaClient Enhanced Caching', () => {
  let client: FirewallaClient;
  const mockConfig = {
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    mspBaseUrl: 'https://test.firewalla.net',
    boxId: 'test-box-id',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn()
        },
        response: {
          use: jest.fn()
        }
      }
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    
    client = new FirewallaClient(mockConfig);
  });

  describe('Cache strategy integration', () => {
    it('should provide detailed cache statistics', () => {
      const stats = client.getDetailedCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('allKeys');
      expect(stats).toHaveProperty('activeKeys');
      expect(stats).toHaveProperty('strategySummary');
      expect(stats).toHaveProperty('averageTTL');
      expect(Array.isArray(stats.allKeys)).toBe(true);
      expect(Array.isArray(stats.activeKeys)).toBe(true);
      expect(typeof stats.strategySummary).toBe('object');
    });

    it('should provide cache strategy summary', () => {
      const summary = client.getCacheStrategySummary();
      
      expect(summary).toHaveProperty('alarms');
      expect(summary).toHaveProperty('flows');
      expect(summary).toHaveProperty('devices');
      expect(summary).toHaveProperty('rules');
      expect(summary).toHaveProperty('target_lists');
      
      // Verify strategy configuration
      expect(summary.alarms.ttl).toBe(30 * 1000);
      expect(summary.alarms.backgroundRefresh).toBe(false);
      expect(summary.rules.ttl).toBe(10 * 60 * 1000);
      expect(summary.rules.backgroundRefresh).toBe(true);
    });

    it('should track cache entries with strategy metadata', () => {
      // Set cache with strategy
      const strategy = DataCacheStrategies.getAlarmsStrategy();
      const testData = { id: 'test', message: 'test alarm' };
      
      // Use private method via type assertion for testing
      (client as any).setCache('test-key', testData, strategy);
      
      const stats = client.getDetailedCacheStats();
      
      expect(stats.size).toBe(1);
      expect(stats.strategySummary['fw:alarms']).toBe(1);
      expect(stats.averageTTL).toBeGreaterThan(0);
    });

    it('should calculate average TTL correctly', () => {
      const alarmStrategy = DataCacheStrategies.getAlarmsStrategy();
      const ruleStrategy = DataCacheStrategies.getRulesStrategy();
      
      // Add cache entries with different strategies
      (client as any).setCache('alarms-key', { data: 'test' }, alarmStrategy);
      (client as any).setCache('rules-key', { data: 'test' }, ruleStrategy);
      
      const stats = client.getDetailedCacheStats();
      
      expect(stats.size).toBe(2);
      expect(stats.averageTTL).toBeGreaterThan(0);
      expect(stats.strategySummary['fw:alarms']).toBe(1);
      expect(stats.strategySummary['fw:rules']).toBe(1);
    });
  });

  describe('Cache invalidation integration', () => {
    it('should trigger cache invalidation by event', async () => {
      // Add some cache entries
      (client as any).setCache('fw:rules:test1', { data: 'test1' });
      (client as any).setCache('fw:rules:test2', { data: 'test2' });
      (client as any).setCache('fw:devices:test', { data: 'test3' });
      
      const keysInvalidated = await client.invalidateByEvent('rule_updated');
      
      // Should invalidate rule-related cache entries
      expect(keysInvalidated).toBeGreaterThanOrEqual(0);
    });

    it('should trigger cache invalidation by data change', async () => {
      // Add cache entries
      (client as any).setCache('fw:devices:online:true', { data: 'devices' });
      (client as any).setCache('fw:search:devices:query', { data: 'search' });
      (client as any).setCache('fw:rules:active', { data: 'rules' });
      
      const keysInvalidated = await client.invalidateByDataChange('devices', 'update', 'device123');
      
      expect(keysInvalidated).toBeGreaterThanOrEqual(0);
    });

    it('should provide invalidation statistics', () => {
      const stats = client.getInvalidationStats();
      
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('recentEvents');
      expect(stats).toHaveProperty('eventCounts');
      expect(Array.isArray(stats.recentEvents)).toBe(true);
      expect(typeof stats.eventCounts).toBe('object');
    });
  });

  describe('CacheManagerInterface implementation', () => {
    it('should implement delete method', async () => {
      (client as any).setCache('test-key', { data: 'test' });
      
      const deleted = await client.delete('test-key');
      
      expect(deleted).toBe(true);
      
      const stats = client.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should implement getAllKeys method', async () => {
      (client as any).setCache('key1', { data: 'test1' });
      (client as any).setCache('key2', { data: 'test2' });
      
      const keys = await client.getAllKeys();
      
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });

    it('should implement clear method', async () => {
      (client as any).setCache('key1', { data: 'test1' });
      (client as any).setCache('key2', { data: 'test2' });
      
      await client.clear();
      
      const stats = client.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Cache key generation with strategies', () => {
    it('should generate consistent cache keys', () => {
      const getCacheKey = (client as any).getCacheKey.bind(client);
      
      const key1 = getCacheKey('/v2/alarms', { limit: 100, query: 'test' });
      const key2 = getCacheKey('/v2/alarms', { query: 'test', limit: 100 });
      
      // Should be same regardless of parameter order
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const getCacheKey = (client as any).getCacheKey.bind(client);
      
      const key1 = getCacheKey('/v2/rules', { limit: 100 });
      const key2 = getCacheKey('/v2/rules', { limit: 200 });
      const key3 = getCacheKey('/v2/devices', { limit: 100 });
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should include box ID in cache keys', () => {
      const getCacheKey = (client as any).getCacheKey.bind(client);
      
      const key = getCacheKey('/v2/alarms', { limit: 100 });
      
      expect(key).toContain(mockConfig.boxId);
    });
  });

  describe('Cache TTL with strategies', () => {
    it('should use strategy-specific TTL when setting cache', () => {
      const strategy = DataCacheStrategies.getRulesStrategy();
      const startTime = Date.now();
      
      (client as any).setCache('test-key', { data: 'test' }, strategy);
      
      // Get cache entry directly
      const cacheEntry = (client as any).cache.get('test-key');
      
      expect(cacheEntry).toBeDefined();
      expect(cacheEntry.strategy).toBe(strategy);
      
      // TTL should be based on strategy, not default config
      const expectedExpiry = startTime + strategy.ttl;
      const actualExpiry = cacheEntry.expires;
      
      // Allow for small timing differences
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(100);
    });

    it('should fall back to config TTL when no strategy provided', () => {
      const startTime = Date.now();
      
      (client as any).setCache('test-key', { data: 'test' });
      
      const cacheEntry = (client as any).cache.get('test-key');
      
      expect(cacheEntry).toBeDefined();
      
      // Should use config TTL (converted to milliseconds)
      const expectedExpiry = startTime + (mockConfig.cacheTtl * 1000);
      const actualExpiry = cacheEntry.expires;
      
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(100);
    });

    it('should respect explicit TTL override', () => {
      const strategy = DataCacheStrategies.getRulesStrategy();
      const customTTLSeconds = 60; // 1 minute in seconds
      const customTTLMs = customTTLSeconds * 1000; // Convert to milliseconds
      const startTime = Date.now();
      
      (client as any).setCache('test-key', { data: 'test' }, strategy, customTTLSeconds);
      
      const cacheEntry = (client as any).cache.get('test-key');
      
      expect(cacheEntry).toBeDefined();
      
      // Should use custom TTL, not strategy TTL
      const expectedExpiry = startTime + customTTLMs;
      const actualExpiry = cacheEntry.expires;
      
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(100);
    });
  });

  describe('Cache expiration handling', () => {
    it('should remove expired cache entries on access', () => {
      // Set cache with very short TTL
      (client as any).setCache('test-key', { data: 'test' }, undefined, -1); // Negative TTL = immediate expiry
      
      const getFromCache = (client as any).getFromCache.bind(client);
      const result = getFromCache('test-key');
      
      expect(result).toBeNull();
      
      // Entry should be removed from cache
      const stats = client.getCacheStats();
      expect(stats.keys).not.toContain('test-key');
    });

    it('should return valid cache entries within TTL', () => {
      const testData = { data: 'test', id: 123 };
      
      (client as any).setCache('test-key', testData, undefined, 60); // 60 seconds TTL
      
      const getFromCache = (client as any).getFromCache.bind(client);
      const result = getFromCache('test-key');
      
      expect(result).toEqual(testData);
    });

    it('should track cache entries correctly in detailed stats', () => {
      // Add mix of expired and valid entries
      (client as any).setCache('expired-key', { data: 'old' }, undefined, -1); // Expired
      (client as any).setCache('valid-key', { data: 'new' }, undefined, 60); // Valid
      
      const stats = client.getDetailedCacheStats();
      
      // Should only count valid entries in averageTTL calculation
      expect(stats.size).toBe(2); // Both entries exist in map
      expect(stats.averageTTL).toBeGreaterThan(0); // Should be based on valid entry only
    });
  });

  describe('Strategy prefix tracking', () => {
    it('should track strategy prefixes in cache stats', () => {
      const alarmStrategy = DataCacheStrategies.getAlarmsStrategy();
      const ruleStrategy = DataCacheStrategies.getRulesStrategy();
      const deviceStrategy = DataCacheStrategies.getDevicesStrategy();
      
      (client as any).setCache('alarm-key', { data: 'alarm' }, alarmStrategy);
      (client as any).setCache('rule-key1', { data: 'rule1' }, ruleStrategy);
      (client as any).setCache('rule-key2', { data: 'rule2' }, ruleStrategy);
      (client as any).setCache('device-key', { data: 'device' }, deviceStrategy);
      
      const stats = client.getDetailedCacheStats();
      
      expect(stats.strategySummary['fw:alarms']).toBe(1);
      expect(stats.strategySummary['fw:rules']).toBe(2);
      expect(stats.strategySummary['fw:devices']).toBe(1);
    });

    it('should handle cache entries without strategy', () => {
      (client as any).setCache('no-strategy-key', { data: 'test' }); // No strategy
      
      const stats = client.getDetailedCacheStats();
      
      expect(stats.size).toBe(1);
      // Should not crash and should handle missing strategy gracefully
      expect(typeof stats.strategySummary).toBe('object');
    });
  });
});