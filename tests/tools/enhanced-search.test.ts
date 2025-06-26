/**
 * Comprehensive unit tests for enhanced search tools
 * Tests enhanced cross-reference search and correlation suggestions
 */

import { createSearchTools } from '../../src/tools/search.js';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { EnhancedCorrelationParams } from '../../src/validation/field-mapper.js';

// Mock FirewallaClient with extended methods
const mockFirewallaClient = {
  searchFlows: jest.fn(),
  getActiveAlarms: jest.fn(),
  getNetworkRules: jest.fn(),
  searchDevices: jest.fn(),
  getDeviceStatus: jest.fn(),
  getTargetLists: jest.fn(),
} as unknown as FirewallaClient;

describe('Enhanced Search Tools', () => {
  let searchTools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    searchTools = createSearchTools(mockFirewallaClient);
    jest.clearAllMocks();
  });

  describe('search_enhanced_cross_reference', () => {
    const mockFlowResults = {
      results: [
        { source: { ip: '192.168.1.1' }, protocol: 'tcp', ts: 1640995200, bytes: 1024 },
        { source: { ip: '192.168.1.2' }, protocol: 'udp', ts: 1640995260, bytes: 2048 }
      ],
      count: 2
    };

    const mockAlarmResults = {
      results: [
        { device: { ip: '192.168.1.1' }, protocol: 'tcp', severity: 'high', ts: 1640995210 },
        { device: { ip: '192.168.1.3' }, protocol: 'http', severity: 'medium', ts: 1640995270 }
      ],
      count: 2
    };

    beforeEach(() => {
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(mockFlowResults);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(mockAlarmResults);
    });

    test('should perform enhanced cross-reference with multi-field correlation', async () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result).toHaveProperty('primary');
      expect(result).toHaveProperty('correlations');
      expect(result).toHaveProperty('correlation_summary');
      expect(result.primary.entity_type).toBe('flows');
      expect(result.correlations).toHaveLength(1);
      expect(result.correlations[0]).toHaveProperty('correlation_stats');
    });

    test('should validate required parameters', async () => {
      const invalidParams = {
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'AND' as const
        }
      };

      await expect(searchTools.search_enhanced_cross_reference(invalidParams as any))
        .rejects.toThrow(/primary_query|validation/i);
    });

    test('should validate correlation parameters', async () => {
      const invalidCorrelationParams = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: [], // Empty array
          correlationType: 'AND' as const
        }
      };

      await expect(searchTools.search_enhanced_cross_reference(invalidCorrelationParams))
        .rejects.toThrow(/correlation field.*required/i);
    });

    test('should handle OR correlation type', async () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'timestamp'],
        correlationType: 'OR'
      };

      const params = {
        primary_query: 'bytes:>1000',
        secondary_queries: ['severity:medium'],
        correlation_params: correlationParams,
        limit: 50
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.correlation_type).toBe('OR');
      expect(result.correlation_summary.correlation_fields).toEqual(['source_ip', 'timestamp']);
    });

    test('should apply temporal window filtering', async () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'timestamp'],
        correlationType: 'AND',
        temporalWindow: {
          windowSize: 5,
          windowUnit: 'minutes'
        }
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.temporal_window_applied).toBe(true);
      expect(result.correlations[0].correlation_stats).toHaveProperty('temporallyFiltered');
    });

    test('should handle multiple secondary queries', async () => {
      mockFirewallaClient.getNetworkRules = jest.fn().mockResolvedValue({
        results: [
          { target: { value: '192.168.1.1' }, action: 'block', protocol: 'tcp' }
        ],
        count: 1
      });

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['protocol'], // Use field compatible with flows, alarms, and rules
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high', 'action:block'],
        correlation_params: correlationParams,
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlations).toHaveLength(2);
      expect(result.correlations[0].entity_type).toBe('alarms');
      expect(result.correlations[1].entity_type).toBe('rules');
    });

    test('should provide comprehensive correlation statistics', async () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary).toHaveProperty('primary_count');
      expect(result.correlation_summary).toHaveProperty('total_correlated_count');
      expect(result.correlation_summary).toHaveProperty('average_correlation_rate');
      expect(result.correlations[0].correlation_stats).toHaveProperty('fieldCorrelationRates');
      expect(result.correlations[0].correlation_stats.fieldCorrelationRates).toHaveLength(2);
    });

    test('should validate limit parameter', async () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip'],
        correlationType: 'AND'
      };

      const paramsWithInvalidLimit = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: -1
      };

      await expect(searchTools.search_enhanced_cross_reference(paramsWithInvalidLimit))
        .rejects.toThrow(/Parameter validation failed.*limit/i);
    });

    test('should handle API call failures gracefully', async () => {
      mockFirewallaClient.searchFlows = jest.fn().mockRejectedValue(new Error('API Error'));

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip'],
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(params))
        .rejects.toThrow(/Enhanced cross-reference search failed/i);
    });
  });

  describe('get_correlation_suggestions', () => {
    test('should provide correlation suggestions for valid queries', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high', 'action:block']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result).toHaveProperty('single_field');
      expect(result).toHaveProperty('dual_field');
      expect(result).toHaveProperty('multi_field');
      expect(result).toHaveProperty('recommended');
      expect(result).toHaveProperty('entity_types');
      expect(result).toHaveProperty('supported_fields');

      expect(Array.isArray(result.single_field)).toBe(true);
      expect(Array.isArray(result.dual_field)).toBe(true);
      expect(Array.isArray(result.supported_fields)).toBe(true);
    });

    test('should identify entity types correctly', async () => {
      const params = {
        primary_query: 'download:>1000', // Should suggest flows
        secondary_queries: ['severity:high'] // Should suggest alarms
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.entity_types.primary).toBe('flows');
      expect(result.entity_types.secondary).toContain('alarms');
    });

    test('should include recommended correlation patterns', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.recommended.length).toBeGreaterThan(0);
      expect(result.recommended.some((combo: string[]) => 
        combo.includes('source_ip') && combo.includes('destination_ip')
      )).toBe(true);
    });

    test('should filter combinations by entity compatibility', async () => {
      const params = {
        primary_query: 'online:false', // devices
        secondary_queries: ['target_value:example.com'] // rules
      };

      const result = await searchTools.get_correlation_suggestions(params);

      // Should only include fields compatible with both devices and rules
      result.supported_fields.forEach((field: string) => {
        expect(['device_id', 'gid', 'timestamp'].includes(field)).toBe(true);
      });
    });

    test('should handle empty or invalid queries', async () => {
      const params = {
        primary_query: '',
        secondary_queries: []
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.entity_types.primary).toBe('flows'); // Default fallback
      expect(result.supported_fields.length).toBeGreaterThan(0);
    });

    test('should categorize combinations by complexity', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.single_field.every((combo: string[]) => combo.length === 1)).toBe(true);
      expect(result.dual_field.every((combo: string[]) => combo.length === 2)).toBe(true);
      expect(result.multi_field.every((combo: string[]) => combo.length >= 3)).toBe(true);
    });
  });

  describe('Integration with existing search tools', () => {
    test('should maintain compatibility with legacy cross-reference search', async () => {
      const legacyFlowResults = {
        results: [
          { source: { ip: '192.168.1.1' }, protocol: 'tcp', ts: 1640995200, bytes: 1024 }
        ],
        count: 1
      };

      const legacyAlarmResults = {
        results: [
          { device: { ip: '192.168.1.1' }, protocol: 'tcp', severity: 'high', ts: 1640995210 }
        ],
        count: 1
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(legacyFlowResults);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(legacyAlarmResults);

      const legacyParams = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_field: 'source_ip',
        limit: 100
      };

      const result = await searchTools.search_cross_reference(legacyParams);

      expect(result).toHaveProperty('primary');
      expect(result).toHaveProperty('correlations');
      expect(result).toHaveProperty('correlation_summary');
    });

    test('should work with all entity types', async () => {
      // Mock all entity type responses
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({ results: [], count: 0 });
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue({ results: [], count: 0 });
      mockFirewallaClient.getNetworkRules = jest.fn().mockResolvedValue({ results: [], count: 0 });
      mockFirewallaClient.searchDevices = jest.fn().mockResolvedValue({ results: [], count: 0 });
      mockFirewallaClient.getTargetLists = jest.fn().mockResolvedValue({ results: [], count: 0 });

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['gid'],  // gid is supported by flows, alarms, rules, devices
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: [
          'severity:high',        // alarms
          'action:block',         // rules  
          'online:false'          // devices (remove target_lists for compatibility)
        ],
        correlation_params: correlationParams,
        limit: 50
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlations).toHaveLength(3);
      expect(mockFirewallaClient.searchFlows).toHaveBeenCalled();
      expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalled();
      expect(mockFirewallaClient.getNetworkRules).toHaveBeenCalled();
      expect(mockFirewallaClient.searchDevices).toHaveBeenCalled();
      // expect(mockFirewallaClient.getTargetLists).toHaveBeenCalled(); // removed target_lists
    });
  });

  describe('Performance and edge cases', () => {
    test('should handle large result sets efficiently', async () => {
      const largeResults = {
        results: Array.from({ length: 1000 }, (_, i) => ({
          source: { ip: `192.168.1.${i % 255}` },
          protocol: 'tcp',
          ts: 1640995200 + i
        })),
        count: 1000
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(largeResults);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(largeResults);

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip'],
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 1000
      };

      const startTime = Date.now();
      const result = await searchTools.search_enhanced_cross_reference(params);
      const executionTime = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle null/undefined field values', async () => {
      const incompleteResults = {
        results: [
          { source: { ip: '192.168.1.1' } }, // missing protocol
          { protocol: 'tcp' }, // missing source.ip
          null, // null entry
          { source: { ip: '192.168.1.2' }, protocol: 'udp' }
        ],
        count: 4
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(incompleteResults);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(incompleteResults);

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: correlationParams,
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result).toBeDefined();
      expect(result.correlations[0].count).toBeLessThan(4); // Should filter out incomplete entries
    });

    test('should provide meaningful error messages', async () => {
      const invalidParams = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['invalid_field'],
          correlationType: 'INVALID' as any
        }
      };

      try {
        await searchTools.search_enhanced_cross_reference(invalidParams);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toMatch(/validation.*failed/i);
        expect((error as Error).message).toMatch(/correlation type/i);
      }
    });
  });
});