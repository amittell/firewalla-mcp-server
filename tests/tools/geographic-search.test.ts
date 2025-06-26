/**
 * Comprehensive unit tests for geographic search functionality
 * Tests geographic filtering, analysis, and threat intelligence features
 */

import { createSearchTools } from '../../src/tools/search.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

// Mock FirewallaClient with geographic data
const mockFirewallaClient = {
  searchFlows: jest.fn(),
  getActiveAlarms: jest.fn(),
  searchDevices: jest.fn(),
  getNetworkRules: jest.fn(),
  getTargetLists: jest.fn(),
} as unknown as FirewallaClient;

describe('Geographic Search Tools', () => {
  let searchTools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    searchTools = createSearchTools(mockFirewallaClient);
    jest.clearAllMocks();
  });

  describe('search_flows_by_geography', () => {
    const mockFlowsWithGeoData = {
      results: [
        {
          source: { ip: '192.168.1.1' },
          geo: { 
            country: 'United States', 
            countryCode: 'US', 
            continent: 'North America',
            city: 'New York',
            timezone: 'America/New_York',
            isp: 'Comcast',
            organization: 'Comcast Cable',
            isCloud: false,
            isVPN: false,
            riskScore: 2
          },
          bytes: 1024,
          protocol: 'tcp'
        },
        {
          source: { ip: '203.0.113.1' },
          geo: { 
            country: 'China', 
            countryCode: 'CN', 
            continent: 'Asia',
            city: 'Beijing',
            timezone: 'Asia/Shanghai',
            isp: 'China Telecom',
            organization: 'China Telecom',
            isCloud: false,
            isVPN: true,
            riskScore: 8
          },
          bytes: 2048,
          protocol: 'tcp'
        },
        {
          source: { ip: '198.51.100.1' },
          geo: { 
            country: 'Germany', 
            countryCode: 'DE', 
            continent: 'Europe',
            city: 'Frankfurt',
            timezone: 'Europe/Berlin',
            isp: 'AWS',
            organization: 'Amazon Web Services',
            isCloud: true,
            isVPN: false,
            riskScore: 3
          },
          bytes: 4096,
          protocol: 'https'
        }
      ],
      count: 3
    };

    beforeEach(() => {
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(mockFlowsWithGeoData);
    });

    test('should perform basic geographic search with country filter', async () => {
      const params = {
        query: 'protocol:tcp',
        geographic_filters: {
          countries: ['US', 'DE']
        },
        limit: 100
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('country:US')
        }),
        expect.any(Object)
      );
      expect(result).toHaveProperty('geographic_analysis');
      expect(result.geographic_analysis).toHaveProperty('total_flows', 3);
      expect(result.geographic_analysis).toHaveProperty('unique_countries');
      expect(result.geographic_analysis).toHaveProperty('cloud_provider_flows');
    });

    test('should filter by continent', async () => {
      const params = {
        geographic_filters: {
          continents: ['Europe', 'Asia']
        },
        limit: 50
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('continent:Europe')
        }),
        expect.any(Object)
      );
      expect(result).toHaveProperty('geographic_analysis');
    });

    test('should exclude cloud providers', async () => {
      const params = {
        geographic_filters: {
          exclude_cloud: true
        },
        limit: 100
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('NOT is_cloud_provider:true')
        }),
        expect.any(Object)
      );
    });

    test('should filter by minimum risk score', async () => {
      const params = {
        geographic_filters: {
          min_risk_score: 7
        },
        limit: 100
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('geographic_risk_score:>=7')
        }),
        expect.any(Object)
      );
    });

    test('should combine multiple geographic filters', async () => {
      const params = {
        query: 'bytes:>1000',
        geographic_filters: {
          countries: ['CN'],
          exclude_vpn: true,
          min_risk_score: 5
        },
        limit: 100
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('bytes:>1000') &&
                 expect.stringContaining('country:CN') &&
                 expect.stringContaining('NOT is_vpn:true') &&
                 expect.stringContaining('geographic_risk_score:>=5')
        }),
        expect.any(Object)
      );
    });

    test('should generate comprehensive geographic analysis', async () => {
      const params = {
        limit: 100,
        aggregate: true,
        group_by: 'country'
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(result.geographic_analysis).toMatchObject({
        total_flows: 3,
        unique_countries: expect.any(Number),
        unique_continents: expect.any(Number),
        cloud_provider_flows: expect.any(Number),
        vpn_flows: expect.any(Number),
        high_risk_flows: expect.any(Number),
        top_countries: expect.any(Object),
        top_asns: expect.any(Object)
      });
    });

    test('should validate required limit parameter', async () => {
      const paramsWithoutLimit = {
        geographic_filters: {
          countries: ['US']
        }
      };

      await expect(searchTools.search_flows_by_geography(paramsWithoutLimit as any))
        .rejects.toThrow(/Parameter validation failed.*limit/);
    });

    test('should handle API errors gracefully', async () => {
      mockFirewallaClient.searchFlows = jest.fn().mockRejectedValue(new Error('API Error'));

      const params = {
        geographic_filters: {
          countries: ['US']
        },
        limit: 100
      };

      await expect(searchTools.search_flows_by_geography(params))
        .rejects.toThrow(/Geographic flows search failed/);
    });
  });

  describe('search_alarms_by_geography', () => {
    const mockAlarmsWithGeoData = {
      results: [
        {
          device: { ip: '192.168.1.1' },
          remote: { 
            country: 'Russia', 
            countryCode: 'RU',
            continent: 'Europe',
            isCloud: false,
            isVPN: false,
            riskScore: 9
          },
          severity: 'high',
          type: 'network_intrusion'
        },
        {
          device: { ip: '192.168.1.2' },
          remote: { 
            country: 'United States', 
            countryCode: 'US',
            continent: 'North America',
            isCloud: true,
            isVPN: false,
            riskScore: 3
          },
          severity: 'medium',
          type: 'policy_violation'
        },
        {
          device: { ip: '192.168.1.3' },
          remote: { 
            country: 'North Korea', 
            countryCode: 'KP',
            continent: 'Asia',
            isCloud: false,
            isVPN: true,
            riskScore: 10
          },
          severity: 'critical',
          type: 'malware_detected'
        }
      ],
      count: 3
    };

    beforeEach(() => {
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(mockAlarmsWithGeoData);
    });

    test('should perform geographic alarm search with threat analysis', async () => {
      const params = {
        query: 'severity:high',
        geographic_filters: {
          high_risk_countries: true,
          threat_analysis: true
        },
        limit: 100
      };

      const result = await searchTools.search_alarms_by_geography(params);

      expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalledWith(
        expect.stringContaining('geographic_risk_score:>=7'),
        undefined,
        'timestamp:desc',
        100
      );
      expect(result).toHaveProperty('geographic_threat_analysis');
      expect(result.geographic_threat_analysis).toHaveProperty('total_alarms');
      expect(result.geographic_threat_analysis).toHaveProperty('high_risk_countries');
      expect(result.geographic_threat_analysis).toHaveProperty('risk_distribution');
    });

    test('should filter by specific countries', async () => {
      const params = {
        geographic_filters: {
          countries: ['RU', 'CN', 'KP']
        },
        limit: 50
      };

      const result = await searchTools.search_alarms_by_geography(params);

      expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalledWith(
        expect.stringContaining('country:RU'),
        undefined,
        'timestamp:desc',
        50
      );
    });

    test('should exclude known hosting providers', async () => {
      const params = {
        geographic_filters: {
          exclude_known_providers: true
        },
        limit: 100
      };

      const result = await searchTools.search_alarms_by_geography(params);

      expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalledWith(
        expect.stringContaining('NOT is_cloud_provider:true'),
        undefined,
        'timestamp:desc',
        100
      );
    });

    test('should generate threat analysis statistics', async () => {
      const params = {
        geographic_filters: {
          threat_analysis: true
        },
        limit: 100
      };

      const result = await searchTools.search_alarms_by_geography(params);

      expect(result.geographic_threat_analysis).toMatchObject({
        total_alarms: 3,
        high_risk_countries: expect.any(Object),
        threat_by_continent: expect.any(Object),
        suspicious_asns: expect.any(Object),
        cloud_threats: expect.any(Number),
        vpn_threats: expect.any(Number),
        proxy_threats: expect.any(Number),
        risk_distribution: {
          low: expect.any(Number),
          medium: expect.any(Number),
          high: expect.any(Number),
          critical: expect.any(Number)
        }
      });
    });

    test('should validate limit parameter bounds', async () => {
      const paramsWithLargeLimit = {
        geographic_filters: {
          countries: ['US']
        },
        limit: 10000
      };

      await expect(searchTools.search_alarms_by_geography(paramsWithLargeLimit))
        .rejects.toThrow(/Parameter validation failed.*limit/);
    });

    test('should handle empty results gracefully', async () => {
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue({
        results: [],
        count: 0
      });

      const params = {
        geographic_filters: {
          threat_analysis: true
        },
        limit: 100
      };

      const result = await searchTools.search_alarms_by_geography(params);

      expect(result.geographic_threat_analysis.total_alarms).toBe(0);
      expect(result.geographic_threat_analysis.risk_distribution.critical).toBe(0);
    });
  });

  describe('get_geographic_statistics', () => {
    const mockStatisticsResult = {
      results: [
        { geo: { country: 'US' }, bytes: 1000 },
        { geo: { country: 'CN' }, bytes: 2000 },
        { geo: { country: 'DE' }, bytes: 1500 }
      ],
      count: 3,
      aggregations: {
        'US': { count: 15, percentage: 50 },
        'CN': { count: 10, percentage: 33 },
        'DE': { count: 5, percentage: 17 }
      }
    };

    beforeEach(() => {
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(mockStatisticsResult);
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue(mockStatisticsResult);
    });

    test('should generate flow statistics by country', async () => {
      const params = {
        entity_type: 'flows' as const,
        group_by: 'country' as const,
        analysis_type: 'summary' as const,
        limit: 1000
      };

      const result = await searchTools.get_geographic_statistics(params);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'timestamp:>0',
          group_by: 'country',
          aggregate: true
        }),
        expect.any(Object)
      );
      expect(result).toMatchObject({
        entity_type: 'flows',
        group_by: 'country',
        analysis_type: 'summary',
        statistics: expect.objectContaining({
          summary: expect.any(Object),
          distribution: expect.any(Object),
          insights: expect.any(Array)
        }),
        total_records: 3
      });
    });

    test('should generate alarm statistics by continent', async () => {
      const params = {
        entity_type: 'alarms' as const,
        group_by: 'continent' as const,
        limit: 500
      };

      const result = await searchTools.get_geographic_statistics(params);

      expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalledWith(
        'timestamp:>0',
        undefined,
        'timestamp:desc',
        500
      );
      expect(result.entity_type).toBe('alarms');
      expect(result.group_by).toBe('continent');
    });

    test('should handle time range filtering', async () => {
      const params = {
        entity_type: 'flows' as const,
        time_range: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z'
        },
        limit: 1000
      };

      const result = await searchTools.get_geographic_statistics(params);

      const expectedStartTs = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
      const expectedEndTs = Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: `timestamp:[${expectedStartTs} TO ${expectedEndTs}]`
        }),
        expect.any(Object)
      );
    });

    test('should generate insights from aggregated data', async () => {
      const params = {
        entity_type: 'flows' as const,
        analysis_type: 'detailed' as const,
        limit: 1000
      };

      const result = await searchTools.get_geographic_statistics(params);

      expect(result.statistics.insights.some((insight: string) => 
        /Top country: .* \(.*% of total\)/.test(insight)
      )).toBe(true);
      expect(result.statistics.insights.some((insight: string) => 
        /Geographic diversity: .* unique countrys/.test(insight)
      )).toBe(true);
    });

    test('should validate entity_type parameter', async () => {
      const paramsWithInvalidType = {
        entity_type: 'invalid' as any,
        limit: 1000
      };

      // This should be handled by TypeScript, but test runtime behavior
      const result = await searchTools.get_geographic_statistics(paramsWithInvalidType);
      expect(result.entity_type).toBe('invalid');
    });

    test('should handle large limit values', async () => {
      const paramsWithLargeLimit = {
        entity_type: 'flows' as const,
        limit: 50000
      };

      await expect(searchTools.get_geographic_statistics(paramsWithLargeLimit))
        .rejects.toThrow(/Parameter validation failed.*limit/);
    });

    test('should default to reasonable values', async () => {
      const minimalParams = {
        entity_type: 'flows' as const
      };

      const result = await searchTools.get_geographic_statistics(minimalParams);

      expect(mockFirewallaClient.searchFlows).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'timestamp:>0',
          limit: 1000,
          group_by: 'country',
          aggregate: true
        }),
        expect.any(Object)
      );
      expect(result.analysis_type).toBe('summary');
      expect(result.group_by).toBe('country');
    });
  });

  describe('Geographic Analysis Integration', () => {
    test('should handle complex geographic correlation queries', async () => {
      const flowData = {
        results: [
          {
            source: { ip: '1.2.3.4' },
            geo: { country: 'US', continent: 'North America', asn: '12345', riskScore: 2 },
            protocol: 'tcp'
          }
        ],
        count: 1
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(flowData);

      const params = {
        query: 'protocol:tcp',
        geographic_filters: {
          countries: ['US', 'CA'],
          continents: ['North America'],
          exclude_cloud: true,
          min_risk_score: 1
        },
        limit: 100,
        group_by: 'country',
        aggregate: true
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(result).toHaveProperty('geographic_analysis');
      expect(result.geographic_analysis.total_flows).toBe(1);
      expect(result.query).toMatch(/protocol:tcp/);
    });

    test('should provide meaningful geographic insights', async () => {
      const diverseGeoData = {
        results: Array.from({ length: 50 }, (_, i) => ({
          geo: { 
            country: `Country${i % 10}`, 
            asn: `ASN${i % 5}`,
            isCloud: i % 3 === 0,
            riskScore: i % 10
          }
        })),
        count: 50,
        aggregations: {
          'Country0': { count: 5 },
          'Country1': { count: 5 },
          'Country2': { count: 5 }
        }
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(diverseGeoData);

      const result = await searchTools.get_geographic_statistics({
        entity_type: 'flows',
        analysis_type: 'detailed'
      });

      expect(result.statistics.insights.some((insight: string) => 
        /Geographic diversity: .* unique countrys/.test(insight)
      )).toBe(true);
    });

    test('should handle missing geographic data gracefully', async () => {
      const incompleteGeoData = {
        results: [
          { source: { ip: '1.2.3.4' } }, // missing geo data
          { geo: {} }, // empty geo data
          { geo: { country: 'US' } } // partial geo data
        ],
        count: 3
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(incompleteGeoData);

      const params = {
        limit: 100
      };

      const result = await searchTools.search_flows_by_geography(params);

      expect(result.geographic_analysis).toBeDefined();
      expect(result.geographic_analysis.total_flows).toBe(3);
      // Should handle missing data without crashing
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large geographic datasets efficiently', async () => {
      const largeGeoData = {
        results: Array.from({ length: 1000 }, (_, i) => ({
          geo: {
            country: `Country${i % 50}`,
            continent: `Continent${i % 7}`,
            asn: `ASN${i % 100}`,
            riskScore: i % 10
          }
        })),
        count: 1000
      };

      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue(largeGeoData);

      const startTime = Date.now();
      const result = await searchTools.search_flows_by_geography({
        limit: 1000
      });
      const executionTime = Date.now() - startTime;

      expect(result.geographic_analysis.total_flows).toBe(1000);
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should validate geographic filter formats', async () => {
      const invalidFilters = {
        geographic_filters: {
          countries: 'not-an-array' as any,
          min_risk_score: 'invalid' as any
        },
        limit: 100
      };

      // The query builder should handle this gracefully or validate
      const result = await searchTools.search_flows_by_geography(invalidFilters);
      expect(result).toBeDefined();
    });

    test('should handle concurrent geographic searches', async () => {
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({
        results: [{ geo: { country: 'US' } }],
        count: 1
      });

      const promises = Array.from({ length: 5 }, () =>
        searchTools.search_flows_by_geography({
          geographic_filters: { countries: ['US'] },
          limit: 10
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.geographic_analysis).toBeDefined();
      });
    });
  });
});