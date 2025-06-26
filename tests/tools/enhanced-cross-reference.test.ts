/**
 * Comprehensive unit tests for enhanced cross-reference search functionality
 * Tests multi-field correlation, temporal windows, and advanced features
 */

import { createSearchTools } from '../../src/tools/search.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

// Mock FirewallaClient with enhanced data
const mockFirewallaClient = {
  searchFlows: jest.fn(),
  getActiveAlarms: jest.fn(),
  searchDevices: jest.fn(),
  getNetworkRules: jest.fn(),
  getTargetLists: jest.fn(),
} as unknown as FirewallaClient;

describe('Enhanced Cross-Reference Search Tools', () => {
  let searchTools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    searchTools = createSearchTools(mockFirewallaClient);
    jest.clearAllMocks();
  });

  describe('search_enhanced_cross_reference', () => {
    beforeEach(() => {
      // Create more specific mock data structures that accurately reflect real API responses
      const enhancedMockFlowsData = {
        results: [
          {
            source: { ip: '192.168.1.1', port: 54321 },
            destination: { ip: '203.0.113.1', port: 443 },
            protocol: 'tcp',
            bytes: 5124,
            ts: 1640995200,
            geo: { country: 'United States', asn: '12345', region: 'CA', city: 'San Francisco' },
            app: { name: 'Chrome', category: 'browser' },
            ssl: { subject: '*.google.com', issuer: 'Google Trust Services' },
            session_duration: 125,
            frequency_score: 8.5
          },
          {
            source: { ip: '192.168.1.2', port: 49152 },
            destination: { ip: '198.51.100.1', port: 80 },
            protocol: 'https',
            bytes: 2048,
            ts: 1640995260,
            geo: { country: 'Germany', asn: '67890', region: 'NRW', city: 'Cologne' },
            app: { name: 'Firefox', category: 'browser' },
            ssl: { subject: '*.example.com', issuer: 'Let\'s Encrypt' },
            session_duration: 89,
            frequency_score: 3.2
          }
        ],
        count: 2,
        metadata: { queryTime: 45, cacheHit: false }
      };

      const enhancedMockAlarmsData = {
        results: [
          {
            device: { ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' },
            remote: { ip: '203.0.113.1', country: 'United States', asn: '12345' },
            severity: 'high',
            type: 'network_intrusion',
            ts: 1640995250,
            target_value: 'malicious-domain.com',
            action: 'block',
            resolved: false,
            confidence: 0.95
          },
          {
            device: { ip: '192.168.1.3', mac: '11:22:33:44:55:66' },
            remote: { ip: '198.51.100.2', country: 'France', asn: '33891' },
            severity: 'medium',
            type: 'policy_violation',
            ts: 1640995300,
            target_value: 'social-media.com',
            action: 'timelimit',
            resolved: true,
            confidence: 0.78
          }
        ],
        count: 2,
        metadata: { queryTime: 23, cacheHit: true }
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(enhancedMockFlowsData);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(enhancedMockAlarmsData);
    });

    test('should perform multi-field correlation with AND logic', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip', 'country'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result).toHaveProperty('primary');
      expect(result.primary).toHaveProperty('query', 'protocol:tcp');
      expect(result).toHaveProperty('correlations');
      expect(Array.isArray(result.correlations)).toBe(true);
      expect(result).toHaveProperty('correlation_summary');
      expect(result.correlation_summary).toHaveProperty('correlation_fields', ['source_ip', 'country']);
      expect(result.correlation_summary).toHaveProperty('correlation_type', 'AND');
    });

    test('should perform multi-field correlation with OR logic', async () => {
      const params = {
        primary_query: 'bytes:>1000',
        secondary_queries: ['severity:medium'],
        correlation_params: {
          correlationFields: ['source_ip', 'destination_ip'],
          correlationType: 'OR' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.correlation_type).toBe('OR');
      expect(result.correlations.length).toBeGreaterThanOrEqual(0);
      if (result.correlations.length > 0) {
        expect(result.correlations[0]).toHaveProperty('correlation_stats');
        expect(result.correlations[0].correlation_stats).toHaveProperty('fieldCorrelationRates');
        expect(Array.isArray(result.correlations[0].correlation_stats.fieldCorrelationRates)).toBe(true);
      }
    });

    test('should apply temporal window filtering', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip', 'timestamp'],
          correlationType: 'AND' as const,
          temporalWindow: {
            windowSize: 30,
            windowUnit: 'minutes' as const
          }
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary).toHaveProperty('temporal_window_applied', true);
      if (result.correlations.length > 0) {
        expect(result.correlations[0].correlation_stats).toHaveProperty('temporallyFiltered');
      }
    });

    test('should include network scope options', async () => {
      const params = {
        primary_query: 'direction:outbound',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip', 'subnet'],
          correlationType: 'AND' as const,
          networkScope: {
            includeSubnets: true,
            includePorts: true
          }
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result).toHaveProperty('correlation_summary');
      expect(result.correlation_summary.total_correlated_count).toBeGreaterThanOrEqual(0);
    });

    test('should include device scope options', async () => {
      const params = {
        primary_query: 'bytes:>5000',
        secondary_queries: ['severity:medium'],
        correlation_params: {
          correlationFields: ['device_ip', 'device_vendor'],
          correlationType: 'OR' as const,
          deviceScope: {
            includeVendor: true,
            includeGroup: true
          }
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result).toHaveProperty('correlations');
      expect(Array.isArray(result.correlations)).toBe(true);
    });

    test('should validate required correlation fields', async () => {
      const paramsWithoutFields = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: [],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(paramsWithoutFields))
        .rejects.toThrow(/correlation field/i);
    });

    test('should validate correlation type', async () => {
      const paramsWithInvalidType = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'INVALID' as any
        },
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(paramsWithInvalidType))
        .rejects.toThrow(/correlation type/i);
    });

    test('should handle maximum correlation fields limit', async () => {
      const paramsWithTooManyFields = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip', 'destination_ip', 'protocol', 'country', 'asn', 'application'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(paramsWithTooManyFields))
        .rejects.toThrow(/maximum of 5/i);
    });

    test('should provide detailed correlation statistics', async () => {
      const params = {
        primary_query: 'application:Chrome',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip', 'application'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary).toMatchObject({
        primary_count: expect.any(Number),
        total_correlated_count: expect.any(Number),
        average_correlation_rate: expect.any(Number),
        correlation_fields: expect.any(Array)
      });

      if (result.correlations.length > 0 && result.correlations[0].correlation_stats.fieldCorrelationRates) {
        result.correlations[0].correlation_stats.fieldCorrelationRates.forEach((fieldRate: any) => {
          expect(fieldRate).toMatchObject({
            field: expect.any(String),
            matchingItems: expect.any(Number),
            correlationRate: expect.any(Number)
          });
        });
      }
    });
  });

  describe('get_correlation_suggestions', () => {
    test('should provide intelligent field combinations for flows and alarms', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result).toHaveProperty('entity_types');
      expect(result).toHaveProperty('single_field');
      expect(Array.isArray(result.single_field)).toBe(true);
      expect(result).toHaveProperty('dual_field');
      expect(Array.isArray(result.dual_field)).toBe(true);
      expect(result).toHaveProperty('recommended');
      expect(Array.isArray(result.recommended)).toBe(true);
    });

    test('should provide common correlation patterns', async () => {
      const params = {
        primary_query: 'bytes:>1000',
        secondary_queries: ['type:network_intrusion']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result).toHaveProperty('recommended');
      expect(Array.isArray(result.recommended)).toBe(true);
      expect(result).toHaveProperty('supported_fields');
      expect(Array.isArray(result.supported_fields)).toBe(true);
    });

    test('should provide entity type detection', async () => {
      const params = {
        primary_query: 'download:>1000',
        secondary_queries: ['severity:high', 'online:true']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result).toHaveProperty('entity_types');
      expect(result.entity_types).toHaveProperty('primary');
      expect(result.entity_types).toHaveProperty('secondary');
    });

    test('should handle single secondary query', async () => {
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:medium']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.entity_types.secondary).toHaveLength(1);
      expect(result.supported_fields).toBeDefined();
    });

    test('should handle multiple secondary queries', async () => {
      const params = {
        primary_query: 'blocked:true',
        secondary_queries: ['severity:high', 'online:false', 'action:block']
      };

      const result = await searchTools.get_correlation_suggestions(params);

      expect(result.entity_types.secondary).toHaveLength(3);
      expect(result.multi_field.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Advanced Correlation Fields', () => {
    test('should support application-level correlations', async () => {
      const params = {
        primary_query: 'application:Chrome',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['application', 'user_agent'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.correlation_fields).toContain('application');
      expect(result.correlation_summary.correlation_fields).toContain('user_agent');
    });

    test('should support behavioral pattern correlations', async () => {
      const params = {
        primary_query: 'session_duration:>300',
        secondary_queries: ['severity:medium'],
        correlation_params: {
          correlationFields: ['session_duration', 'frequency_score'],
          correlationType: 'OR' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.correlation_fields).toContain('session_duration');
      expect(result.correlation_summary.correlation_fields).toContain('frequency_score');
    });

    test('should support SSL/TLS correlations', async () => {
      const params = {
        primary_query: 'ssl_subject:*google*',
        secondary_queries: ['severity:medium'],
        correlation_params: {
          correlationFields: ['ssl_subject', 'ssl_issuer'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      const result = await searchTools.search_enhanced_cross_reference(params);

      expect(result.correlation_summary.correlation_fields).toContain('ssl_subject');
      expect(result.correlation_summary.correlation_fields).toContain('ssl_issuer');
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large datasets efficiently', async () => {
      const largeFlowData = {
        results: Array.from({ length: 1000 }, (_, i) => ({
          source: { ip: `192.168.1.${i % 255}` },
          protocol: 'tcp',
          ts: 1640995200 + i,
          geo: { country: `Country${i % 10}` }
        })),
        count: 1000
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(largeFlowData);

      const startTime = Date.now();
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'AND' as const
        },
        limit: 1000
      };

      const result = await searchTools.search_enhanced_cross_reference(params);
      const executionTime = Date.now() - startTime;

      expect(result.correlation_summary.total_correlated_count).toBeGreaterThanOrEqual(0);
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle API errors gracefully', async () => {
      mockFirewallaClient.searchFlows = jest.fn().mockRejectedValue(new Error('API Error'));

      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'AND' as const
        },
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(params))
        .rejects.toThrow(/Enhanced cross-reference search failed/);
    });

    test('should validate temporal window parameters', async () => {
      const paramsWithInvalidWindow = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'AND' as const,
          temporalWindow: {
            windowSize: -10,
            windowUnit: 'minutes' as const
          }
        },
        limit: 100
      };

      await expect(searchTools.search_enhanced_cross_reference(paramsWithInvalidWindow))
        .rejects.toThrow(/window size must be positive/i);
    });

    test('should handle concurrent searches', async () => {
      // Reset mocks to ensure they return data instead of errors
      const mockData = {
        results: [
          {
            source: { ip: '192.168.1.1' },
            destination: { ip: '203.0.113.1' },
            protocol: 'tcp',
            ts: 1640995200
          }
        ],
        count: 1
      };
      
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(mockData);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(mockData);
      
      const params = {
        primary_query: 'protocol:tcp',
        secondary_queries: ['severity:high'],
        correlation_params: {
          correlationFields: ['source_ip'],
          correlationType: 'AND' as const
        },
        limit: 10
      };

      const promises = Array.from({ length: 3 }, () =>
        searchTools.search_enhanced_cross_reference(params)
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('correlation_summary');
      });
    });
  });
});