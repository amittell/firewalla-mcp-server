/**
 * @fileoverview Test suite for cache strategies
 * 
 * Tests the data-specific cache strategies and configuration
 * to ensure proper TTL values and invalidation patterns
 */

import { DataCacheStrategies, EntityType } from '../../src/cache/cache-strategies.js';

describe('DataCacheStrategies', () => {
  describe('Entity-specific strategies', () => {
    it('should provide appropriate TTL for alarms (high volatility)', () => {
      const strategy = DataCacheStrategies.getAlarmsStrategy();
      
      expect(strategy.ttl).toBe(30 * 1000); // 30 seconds
      expect(strategy.backgroundRefresh).toBe(false);
      expect(strategy.refreshThreshold).toBe(0.5);
      expect(strategy.invalidationEvents).toContain('alarm_created');
      expect(strategy.invalidationEvents).toContain('alarm_resolved');
    });

    it('should provide appropriate TTL for flows (real-time data)', () => {
      const strategy = DataCacheStrategies.getFlowsStrategy();
      
      expect(strategy.ttl).toBe(30 * 1000); // 30 seconds
      expect(strategy.backgroundRefresh).toBe(false);
      expect(strategy.refreshThreshold).toBe(0.3);
      expect(strategy.invalidationEvents).toHaveLength(0); // Time-based only
    });

    it('should provide appropriate TTL for devices (moderate volatility)', () => {
      const strategy = DataCacheStrategies.getDevicesStrategy();
      
      expect(strategy.ttl).toBe(2 * 60 * 1000); // 2 minutes
      expect(strategy.backgroundRefresh).toBe(true);
      expect(strategy.refreshThreshold).toBe(0.7);
      expect(strategy.invalidationEvents).toContain('device_connected');
    });

    it('should provide appropriate TTL for rules (low volatility)', () => {
      const strategy = DataCacheStrategies.getRulesStrategy();
      
      expect(strategy.ttl).toBe(10 * 60 * 1000); // 10 minutes
      expect(strategy.backgroundRefresh).toBe(true);
      expect(strategy.refreshThreshold).toBe(0.8);
      expect(strategy.invalidationEvents).toContain('rule_created');
    });

    it('should provide appropriate TTL for target lists (very stable)', () => {
      const strategy = DataCacheStrategies.getTargetListsStrategy();
      
      expect(strategy.ttl).toBe(60 * 60 * 1000); // 1 hour
      expect(strategy.backgroundRefresh).toBe(true);
      expect(strategy.refreshThreshold).toBe(0.9);
      expect(strategy.invalidationEvents).toContain('target_lists_updated');
    });

    it('should provide appropriate TTL for search results', () => {
      const strategy = DataCacheStrategies.getSearchStrategy();
      
      expect(strategy.ttl).toBe(5 * 60 * 1000); // 5 minutes
      expect(strategy.compressionEnabled).toBe(true);
      expect(strategy.backgroundRefresh).toBe(true);
    });

    it('should provide appropriate TTL for statistics', () => {
      const strategy = DataCacheStrategies.getStatisticsStrategy();
      
      expect(strategy.ttl).toBe(15 * 60 * 1000); // 15 minutes
      expect(strategy.backgroundRefresh).toBe(true);
      expect(strategy.refreshThreshold).toBe(0.8);
    });
  });

  describe('Strategy selection', () => {
    it('should return correct strategy for each entity type', () => {
      const alarmStrategy = DataCacheStrategies.getStrategyForEntity('alarms');
      expect(alarmStrategy.keyPrefix).toBe('fw:alarms');
      
      const ruleStrategy = DataCacheStrategies.getStrategyForEntity('rules');
      expect(ruleStrategy.keyPrefix).toBe('fw:rules');
      
      const deviceStrategy = DataCacheStrategies.getStrategyForEntity('devices');
      expect(deviceStrategy.keyPrefix).toBe('fw:devices');
    });

    it('should return default strategy for unknown entity type', () => {
      const unknownStrategy = DataCacheStrategies.getStrategyForEntity('unknown' as EntityType);
      expect(unknownStrategy.ttl).toBe(5 * 60 * 1000); // 5 minutes default
      expect(unknownStrategy.backgroundRefresh).toBe(false);
    });

    it('should generate unique cache keys', () => {
      const strategy = DataCacheStrategies.getAlarmsStrategy();
      
      const key1 = strategy.keyGenerator('query1', 100, 'cursor1');
      const key2 = strategy.keyGenerator('query2', 100, 'cursor1');
      const key3 = strategy.keyGenerator('query1', 200, 'cursor1');
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  describe('Cache configuration summary', () => {
    it('should provide complete configuration summary', () => {
      const summary = DataCacheStrategies.getCacheConfigSummary();
      
      expect(summary).toHaveProperty('alarms');
      expect(summary).toHaveProperty('flows');
      expect(summary).toHaveProperty('devices');
      expect(summary).toHaveProperty('rules');
      expect(summary).toHaveProperty('target_lists');
      expect(summary).toHaveProperty('search');
      expect(summary).toHaveProperty('statistics');
      expect(summary).toHaveProperty('trends');
      
      // Verify alarm strategy summary
      expect(summary.alarms.ttl).toBe(30 * 1000);
      expect(summary.alarms.backgroundRefresh).toBe(false);
      
      // Verify rules strategy summary
      expect(summary.rules.ttl).toBe(10 * 60 * 1000);
      expect(summary.rules.backgroundRefresh).toBe(true);
    });

    it('should provide all entity types', () => {
      const entityTypes = DataCacheStrategies.getAllEntityTypes();
      
      expect(entityTypes).toContain('alarms');
      expect(entityTypes).toContain('flows');
      expect(entityTypes).toContain('devices');
      expect(entityTypes).toContain('rules');
      expect(entityTypes).toContain('target_lists');
      expect(entityTypes).toContain('boxes');
      expect(entityTypes).toContain('search');
      expect(entityTypes).toContain('statistics');
      expect(entityTypes).toContain('trends');
    });
  });

  describe('Key generation', () => {
    it('should handle empty/null parameters gracefully', () => {
      const strategy = DataCacheStrategies.getFlowsStrategy();
      
      const key1 = strategy.keyGenerator();
      const key2 = strategy.keyGenerator(undefined);
      const key3 = strategy.keyGenerator('');
      
      expect(key1).toContain('flows:');
      expect(key1).toContain(':default:first');
      expect(key2).toContain('flows:');
      expect(key2).toContain(':default:first');
      expect(key3).toBeDefined();
    });

    it('should generate consistent keys for same parameters', () => {
      const strategy = DataCacheStrategies.getRulesStrategy();
      
      const key1 = strategy.keyGenerator('status:active', 100, 'block');
      const key2 = strategy.keyGenerator('status:active', 100, 'block');
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const strategy = DataCacheStrategies.getDevicesStrategy();
      
      const key1 = strategy.keyGenerator(true, 50);
      const key2 = strategy.keyGenerator(false, 50);
      const key3 = strategy.keyGenerator(true, 100);
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  describe('TTL validation', () => {
    it('should have reasonable TTL values for different data types', () => {
      const strategies = [
        { name: 'alarms', strategy: DataCacheStrategies.getAlarmsStrategy() },
        { name: 'flows', strategy: DataCacheStrategies.getFlowsStrategy() },
        { name: 'devices', strategy: DataCacheStrategies.getDevicesStrategy() },
        { name: 'rules', strategy: DataCacheStrategies.getRulesStrategy() },
        { name: 'target_lists', strategy: DataCacheStrategies.getTargetListsStrategy() },
        { name: 'search', strategy: DataCacheStrategies.getSearchStrategy() },
        { name: 'statistics', strategy: DataCacheStrategies.getStatisticsStrategy() },
        { name: 'trends', strategy: DataCacheStrategies.getTrendsStrategy() }
      ];

      strategies.forEach(({ name, strategy }) => {
        expect(strategy.ttl).toBeGreaterThan(0);
        expect(strategy.ttl).toBeLessThan(24 * 60 * 60 * 1000); // Less than 24 hours
        expect(strategy.refreshThreshold).toBeGreaterThan(0);
        expect(strategy.refreshThreshold).toBeLessThanOrEqual(1);
      });
    });

    it('should order TTL values appropriately by data volatility', () => {
      const alarmTTL = DataCacheStrategies.getAlarmsStrategy().ttl;
      const flowTTL = DataCacheStrategies.getFlowsStrategy().ttl;
      const deviceTTL = DataCacheStrategies.getDevicesStrategy().ttl;
      const ruleTTL = DataCacheStrategies.getRulesStrategy().ttl;
      const targetListTTL = DataCacheStrategies.getTargetListsStrategy().ttl;

      // More volatile data should have shorter TTL
      expect(alarmTTL).toBeLessThanOrEqual(flowTTL);
      expect(flowTTL).toBeLessThan(deviceTTL);
      expect(deviceTTL).toBeLessThan(ruleTTL);
      expect(ruleTTL).toBeLessThan(targetListTTL);
    });
  });

  describe('Invalidation events', () => {
    it('should have appropriate invalidation events for each entity type', () => {
      const alarmEvents = DataCacheStrategies.getAlarmsStrategy().invalidationEvents;
      expect(alarmEvents).toContain('alarm_created');
      expect(alarmEvents).toContain('alarm_resolved');
      expect(alarmEvents).toContain('alarm_updated');

      const ruleEvents = DataCacheStrategies.getRulesStrategy().invalidationEvents;
      expect(ruleEvents).toContain('rule_created');
      expect(ruleEvents).toContain('rule_updated');
      expect(ruleEvents).toContain('rule_deleted');
      expect(ruleEvents).toContain('rule_paused');
      expect(ruleEvents).toContain('rule_resumed');

      const deviceEvents = DataCacheStrategies.getDevicesStrategy().invalidationEvents;
      expect(deviceEvents).toContain('device_connected');
      expect(deviceEvents).toContain('device_disconnected');
      expect(deviceEvents).toContain('device_updated');
    });

    it('should not have invalidation events for highly dynamic data', () => {
      const flowEvents = DataCacheStrategies.getFlowsStrategy().invalidationEvents;
      expect(flowEvents).toHaveLength(0); // Flows are too dynamic

      const searchEvents = DataCacheStrategies.getSearchStrategy().invalidationEvents;
      expect(searchEvents).toHaveLength(0); // Search results are complex
    });
  });
});