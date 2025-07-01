/**
 * @fileoverview Test suite for cache invalidation manager
 * 
 * Tests the smart cache invalidation functionality including
 * event-based invalidation and pattern matching
 */

import { InvalidationManager, InvalidationEvent, CacheManagerInterface } from '../../src/cache/invalidation-manager.js';
import { EntityType } from '../../src/cache/cache-strategies.js';

describe('InvalidationManager', () => {
  let invalidationManager: InvalidationManager;
  let mockCacheManager: jest.Mocked<CacheManagerInterface>;

  beforeEach(() => {
    invalidationManager = new InvalidationManager();
    
    mockCacheManager = {
      delete: jest.fn().mockResolvedValue(true),
      getAllKeys: jest.fn().mockResolvedValue([]),
      clear: jest.fn().mockResolvedValue(undefined)
    };
  });

  describe('Event registration and invalidation', () => {
    it('should register invalidation patterns for events', () => {
      const event: InvalidationEvent = 'rule_created';
      const pattern = 'fw:rules:*';
      
      invalidationManager.registerInvalidation(event, pattern);
      
      const patterns = invalidationManager.getRegisteredPatterns();
      expect(patterns[event]).toContain(pattern);
    });

    it('should trigger invalidation for registered events', async () => {
      const event: InvalidationEvent = 'rule_updated';
      const pattern = 'fw:rules:*';
      
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:rules:status:active',
        'fw:rules:type:block',
        'fw:devices:online',
        'fw:alarms:recent'
      ]);
      
      invalidationManager.registerInvalidation(event, pattern);
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        event,
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(2); // Should match 2 rule keys
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:status:active');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:type:block');
    });

    it('should handle multiple patterns for same event', async () => {
      const event: InvalidationEvent = 'rule_deleted';
      
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:rules:status:active',
        'fw:search:rules:query1',
        'fw:statistics:rules:summary'
      ]);
      
      invalidationManager.registerInvalidation(event, 'fw:rules:*');
      invalidationManager.registerInvalidation(event, 'fw:search:rules:*');
      invalidationManager.registerInvalidation(event, 'fw:statistics:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        event,
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(3);
      expect(mockCacheManager.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('Data change invalidation', () => {
    it('should invalidate cache for rule operations', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:rules:status:active',
        'fw:search:rules:query1',
        'fw:statistics:rules:count',
        'fw:devices:online'
      ]);
      
      const keysInvalidated = await invalidationManager.invalidateByDataChange(
        'rules',
        'create',
        mockCacheManager,
        'rule123'
      );
      
      expect(keysInvalidated).toBe(3); // Should invalidate rules, search, and stats
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:status:active');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:search:rules:query1');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:statistics:rules:count');
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:devices:online');
    });

    it('should invalidate cache for device operations', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:devices:online:true',
        'fw:search:devices:query1',
        'fw:rules:active'
      ]);
      
      const keysInvalidated = await invalidationManager.invalidateByDataChange(
        'devices',
        'update',
        mockCacheManager,
        'device456'
      );
      
      expect(keysInvalidated).toBe(2); // Should invalidate devices and search
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:devices:online:true');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:search:devices:query1');
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:rules:active');
    });

    it('should handle flows invalidation appropriately', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:flows:recent',
        'fw:statistics:flows:summary',
        'fw:trends:flows:hourly'
      ]);
      
      const keysInvalidated = await invalidationManager.invalidateByDataChange(
        'flows',
        'create',
        mockCacheManager
      );
      
      // Flows are too dynamic, only invalidate aggregations
      expect(keysInvalidated).toBe(2);
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:flows:recent');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:statistics:flows:summary');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:trends:flows:hourly');
    });
  });

  describe('Pattern matching', () => {
    it('should match wildcard patterns correctly', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:rules:status:active',
        'fw:rules:type:block',
        'fw:rules:direction:inbound',
        'fw:devices:online:true',
        'fw:alarms:severity:high'
      ]);
      
      invalidationManager.registerInvalidation('rule_paused', 'fw:rules:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'rule_paused',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(3); // Should match only rule keys
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:status:active');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:type:block');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:rules:direction:inbound');
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:devices:online:true');
    });

    it('should handle exact key matching', async () => {
      const exactKey = 'fw:statistics:rules:summary';
      mockCacheManager.getAllKeys.mockResolvedValue([exactKey, 'fw:rules:active']);
      
      invalidationManager.registerInvalidation('stats_updated', exactKey);
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'stats_updated',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(1);
      expect(mockCacheManager.delete).toHaveBeenCalledWith(exactKey);
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:rules:active');
    });

    it('should handle complex wildcard patterns', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue([
        'fw:search:rules:query1',
        'fw:search:rules:query2',
        'fw:search:devices:query1',
        'fw:search:alarms:query1',
        'fw:rules:active'
      ]);
      
      invalidationManager.registerInvalidation('rule_resumed', 'fw:search:rules:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'rule_resumed',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(2); // Should match only search rule keys
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:search:rules:query1');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('fw:search:rules:query2');
      expect(mockCacheManager.delete).not.toHaveBeenCalledWith('fw:search:devices:query1');
    });
  });

  describe('Default pattern setup', () => {
    it('should register default patterns for all entity types', () => {
      const patterns = invalidationManager.getRegisteredPatterns();
      
      // Check that major invalidation events are registered
      expect(patterns).toHaveProperty('rule_created');
      expect(patterns).toHaveProperty('rule_updated');
      expect(patterns).toHaveProperty('device_connected');
      expect(patterns).toHaveProperty('alarm_created');
      
      // Check cross-entity patterns
      expect(patterns['rule_created']).toContain('fw:statistics:*');
      expect(patterns['device_connected']).toContain('fw:statistics:*');
    });

    it('should handle events without registered patterns gracefully', async () => {
      const unknownEvent = 'unknown_event' as InvalidationEvent;
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        unknownEvent,
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(0);
      expect(mockCacheManager.delete).not.toHaveBeenCalled();
    });
  });

  describe('Statistics and monitoring', () => {
    it('should track invalidation history', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue(['fw:rules:test']);
      
      invalidationManager.registerInvalidation('rule_created', 'fw:rules:*');
      
      await invalidationManager.invalidateByEvent('rule_created', mockCacheManager);
      
      const stats = invalidationManager.getInvalidationStats();
      
      expect(stats.totalEvents).toBe(1);
      expect(stats.recentEvents).toHaveLength(1);
      expect(stats.recentEvents[0].event).toBe('rule_created');
      expect(stats.recentEvents[0].keysInvalidated).toBe(1);
      expect(stats.eventCounts['rule_created']).toBe(1);
    });

    it('should limit invalidation history size', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue(['fw:test:key']);
      
      invalidationManager.registerInvalidation('rule_updated', 'fw:test:*');
      
      // Trigger many invalidation events
      for (let i = 0; i < 150; i++) {
        await invalidationManager.invalidateByEvent('rule_updated', mockCacheManager);
      }
      
      const stats = invalidationManager.getInvalidationStats();
      
      expect(stats.totalEvents).toBe(100); // Should limit to 100
      expect(stats.eventCounts['rule_updated']).toBe(100);
    });

    it('should clear invalidation history', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue(['fw:rules:test']);
      
      invalidationManager.registerInvalidation('rule_deleted', 'fw:rules:*');
      await invalidationManager.invalidateByEvent('rule_deleted', mockCacheManager);
      
      let stats = invalidationManager.getInvalidationStats();
      expect(stats.totalEvents).toBe(1);
      
      invalidationManager.clearHistory();
      
      stats = invalidationManager.getInvalidationStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.recentEvents).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should handle cache manager errors gracefully', async () => {
      mockCacheManager.getAllKeys.mockRejectedValue(new Error('Cache error'));
      
      invalidationManager.registerInvalidation('alarm_resolved', 'fw:alarms:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'alarm_resolved',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(0);
    });

    it('should handle individual key deletion errors', async () => {
      mockCacheManager.getAllKeys.mockResolvedValue(['fw:rules:key1', 'fw:rules:key2']);
      mockCacheManager.delete
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Delete error'));
      
      invalidationManager.registerInvalidation('rule_paused', 'fw:rules:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'rule_paused',
        mockCacheManager
      );
      
      // Should report partial success
      expect(keysInvalidated).toBe(0); // Pattern invalidation handles errors internally
    });

    it('should handle cache manager errors during pattern matching', async () => {
      mockCacheManager.getAllKeys.mockRejectedValue(new Error('Cache error'));
      
      invalidationManager.registerInvalidation('alarm_resolved', 'fw:alarms:*');
      
      // Should not throw, but return 0 for failed patterns
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'alarm_resolved',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(0);
    });

    it('should handle complex pattern matching efficiently', async () => {
      const keys = [
        'fw:search:rules:complex:query:with:many:parts',
        'fw:search:devices:another:complex:query',
        'fw:statistics:flows:very:long:key:name:here',
        'fw:trends:alarms:time:series:data:key'
      ];
      mockCacheManager.getAllKeys.mockResolvedValue(keys);
      
      invalidationManager.registerInvalidation('stats_updated', 'fw:*');
      
      const keysInvalidated = await invalidationManager.invalidateByEvent(
        'stats_updated',
        mockCacheManager
      );
      
      expect(keysInvalidated).toBe(4); // Should match all keys
    });
  });
});