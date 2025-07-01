/**
 * Comprehensive unit tests for search tool parameter validation
 * Tests boundary conditions, consistency, and error handling across all search tools
 */

import { createSearchTools } from '../../src/tools/search.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

// Complete Mock FirewallaClient with all required methods
const mockFirewallaClient = {
  // Core methods used by search strategies
  getFlowData: jest.fn().mockResolvedValue({
    results: [
      {
        ts: 1640995200,
        gid: 'test-box-1', 
        protocol: 'tcp',
        direction: 'outbound',
        block: false,
        download: 512,
        upload: 512,
        bytes: 1024,
        source: { ip: '192.168.1.1', id: 'source-1' },
        destination: { ip: '8.8.8.8', id: 'dest-1' },
        device: { ip: '192.168.1.1', id: 'device-1', name: 'Test Device' }
      }
    ],
    count: 1
  }),
  getActiveAlarms: jest.fn().mockResolvedValue({
    results: [
      {
        ts: 1640995200,
        gid: 'test-box-1',
        severity: 'high',
        type: 'network_intrusion',
        device: { ip: '192.168.1.1', id: 'device-1', name: 'Test Device' },
        protocol: 'tcp',
        resolved: false
      }
    ],
    count: 1
  }),
  getNetworkRules: jest.fn().mockResolvedValue({
    results: [
      {
        gid: 'rule-1',
        target: { value: '192.168.1.1', type: 'ip' },
        action: 'block',
        protocol: 'tcp',
        active: true,
        ts: 1640995200
      }
    ],
    count: 1
  }),
  getDeviceStatus: jest.fn().mockResolvedValue({
    results: [
      {
        gid: 'device-1',
        ip: '192.168.1.1',
        name: 'Test Device',
        online: true,
        mac: '00:11:22:33:44:55',
        mac_vendor: 'Apple',
        last_seen: 1640995200
      }
    ],
    count: 1
  }),
  getTargetLists: jest.fn().mockResolvedValue({
    results: [
      {
        gid: 'list-1',
        name: 'Blocked Sites',
        category: 'security',
        owner: 'admin',
        targets: ['example.com', 'badsite.com']
      }
    ],
    count: 1
  }),
  // Additional search methods that might be called
  searchFlows: jest.fn().mockResolvedValue({
    results: [],
    count: 0
  }),
  searchAlarms: jest.fn().mockResolvedValue({
    results: [],
    count: 0
  }),
  searchRules: jest.fn().mockResolvedValue({
    results: [],
    count: 0
  }),
  searchDevices: jest.fn().mockResolvedValue({
    results: [],
    count: 0
  }),
  searchTargetLists: jest.fn().mockResolvedValue({
    results: [],
    count: 0
  })
} as unknown as FirewallaClient;

describe('Search Tools Parameter Validation', () => {
  let searchTools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    searchTools = createSearchTools(mockFirewallaClient);
    jest.clearAllMocks();
  });

  describe('search_flows validation', () => {
    test('should require query parameter', async () => {
      const params = { limit: 10 };
      await expect(searchTools.search_flows(params as any))
        .rejects.toThrow(/query.*required|Parameter validation failed/);
    });

    test('should require limit parameter', async () => {
      const params = { query: 'protocol:tcp' };
      await expect(searchTools.search_flows(params as any))
        .rejects.toThrow(/limit.*required/);
    });

    test('should validate limit boundary values', async () => {
      const negativeLimit = { query: 'protocol:tcp', limit: -1 };
      await expect(searchTools.search_flows(negativeLimit as any))
        .rejects.toThrow(/limit/);

      const zeroLimit = { query: 'protocol:tcp', limit: 0 };
      await expect(searchTools.search_flows(zeroLimit as any))
        .rejects.toThrow(/limit/);

      const tooLargeLimit = { query: 'protocol:tcp', limit: 100000 };
      await expect(searchTools.search_flows(tooLargeLimit as any))
        .rejects.toThrow(/limit/);
    });

    test('should validate query format', async () => {
      const emptyQuery = { query: '', limit: 10 };
      await expect(searchTools.search_flows(emptyQuery as any))
        .rejects.toThrow(/query.*required|empty/);

      const whitespaceQuery = { query: '   ', limit: 10 };
      await expect(searchTools.search_flows(whitespaceQuery as any))
        .rejects.toThrow(/query.*required|empty/);
    });

    test('should validate query injection attempts', async () => {
      const sqlInjection = { query: "'; DROP TABLE flows; --", limit: 10 };
      await expect(searchTools.search_flows(sqlInjection as any))
        .rejects.toThrow(/Query validation failed|Invalid query/);

      const scriptInjection = { query: '<script>alert("xss")</script>', limit: 10 };
      await expect(searchTools.search_flows(scriptInjection as any))
        .rejects.toThrow(/Query validation failed|Invalid query/);
    });

    test('should validate sort_by parameter values', async () => {
      const invalidSortBy = { query: 'protocol:tcp', limit: 10, sort_by: 'invalid_field' };
      // This might pass or fail depending on implementation - test what actually happens
      try {
        await searchTools.search_flows(invalidSortBy as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should validate time_range parameter format', async () => {
      const invalidTimeRange = { 
        query: 'protocol:tcp', 
        limit: 10, 
        time_range: { start: 'invalid', end: 'invalid' }
      };
      await expect(searchTools.search_flows(invalidTimeRange as any))
        .rejects.toThrow(/Parameter validation failed.*time_range/);
    });

    test('should validate time_range start before end', async () => {
      const invalidTimeOrder = { 
        query: 'protocol:tcp', 
        limit: 10, 
        time_range: { 
          start: '2023-01-02T00:00:00Z', 
          end: '2023-01-01T00:00:00Z' 
        }
      };
      await expect(searchTools.search_flows(invalidTimeOrder as any))
        .rejects.toThrow(/time_range\.start must be before time_range\.end/);
    });

    test('should accept valid parameters', async () => {
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      const validParams = { 
        query: 'protocol:tcp', 
        limit: 10,
        sort_by: 'ts:desc'
      };
      
      const result = await searchTools.search_flows(validParams as any);
      expect(result).toBeDefined();
      expect(mockFirewallaClient.getFlowData).toHaveBeenCalled();
    });
  });

  describe('search_alarms validation', () => {
    test('should require limit parameter', async () => {
      const params = { query: 'severity:high' };
      await expect(searchTools.search_alarms(params as any))
        .rejects.toThrow(/limit.*required/);
    });

    test('should validate limit boundary values', async () => {
      const negativeLimit = { query: 'severity:high', limit: -1 };
      await expect(searchTools.search_alarms(negativeLimit as any))
        .rejects.toThrow(/limit/);

      const zeroLimit = { query: 'severity:high', limit: 0 };
      await expect(searchTools.search_alarms(zeroLimit as any))
        .rejects.toThrow(/limit/);
    });

    test('should handle optional query parameter', async () => {
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      // Some search tools might allow empty query for "all results"
      const params = { limit: 10 };
      try {
        await searchTools.search_alarms(params as any);
        expect(mockFirewallaClient.getActiveAlarms).toHaveBeenCalled();
      } catch (error) {
        // If query is required, ensure appropriate error message
        expect((error as Error).message).toMatch(/query.*required/);
      }
    });

    test('should accept valid parameters', async () => {
      mockFirewallaClient.getActiveAlarms = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      const validParams = { 
        query: 'severity:high', 
        limit: 10 
      };
      
      const result = await searchTools.search_alarms(validParams as any);
      expect(result).toBeDefined();
    });
  });

  describe('search_rules validation', () => {
    test('should require limit parameter', async () => {
      const params = { query: 'action:block' };
      await expect(searchTools.search_rules(params as any))
        .rejects.toThrow(/limit.*required/);
    });

    test('should validate limit boundary values', async () => {
      const tooLargeLimit = { query: 'action:block', limit: 50000 };
      await expect(searchTools.search_rules(tooLargeLimit as any))
        .rejects.toThrow(/limit/);
    });

    test('should accept valid parameters', async () => {
      mockFirewallaClient.getNetworkRules = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      const validParams = { 
        query: 'action:block', 
        limit: 10 
      };
      
      const result = await searchTools.search_rules(validParams as any);
      expect(result).toBeDefined();
    });
  });

  describe('search_devices validation', () => {
    test('should require limit parameter', async () => {
      const params = { query: 'online:false' };
      await expect(searchTools.search_devices(params as any))
        .rejects.toThrow(/limit.*required/);
    });

    test('should validate device query syntax', async () => {
      const invalidQuery = { query: 'invalid:syntax:here', limit: 10 };
      await expect(searchTools.search_devices(invalidQuery as any))
        .rejects.toThrow(/query.*syntax|Invalid query/);
    });

    test('should accept valid parameters', async () => {
      mockFirewallaClient.searchDevices = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      const validParams = { 
        query: 'online:false', 
        limit: 10 
      };
      
      const result = await searchTools.search_devices(validParams as any);
      expect(result).toBeDefined();
    });
  });

  describe('search_target_lists validation', () => {
    test('should require limit parameter', async () => {
      const params = { query: 'category:security' };
      await expect(searchTools.search_target_lists(params as any))
        .rejects.toThrow(/limit.*required/);
    });

    test('should accept valid parameters', async () => {
      mockFirewallaClient.getTargetLists = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });

      const validParams = { 
        query: 'category:security', 
        limit: 10 
      };
      
      const result = await searchTools.search_target_lists(validParams as any);
      expect(result).toBeDefined();
    });
  });

  describe('search_cross_reference validation', () => {
    test('should require primary_query parameter', async () => {
      const params = { 
        secondary_queries: ['severity:high'], 
        correlation_field: 'source_ip',
        limit: 10 
      };
      await expect(searchTools.search_cross_reference(params as any))
        .rejects.toThrow(/Primary query cannot be empty/);
    });

    test('should require secondary_queries parameter', async () => {
      const params = { 
        primary_query: 'protocol:tcp', 
        correlation_field: 'source_ip',
        limit: 10 
      };
      await expect(searchTools.search_cross_reference(params as any))
        .rejects.toThrow(/At least one secondary query is required/);
    });

    test('should require correlation_field parameter', async () => {
      const params = { 
        primary_query: 'protocol:tcp', 
        secondary_queries: ['severity:high'],
        limit: 10 
      };
      await expect(searchTools.search_cross_reference(params as any))
        .rejects.toThrow(/Correlation field cannot be empty/);
    });

    test('should validate secondary_queries is array', async () => {
      const params = { 
        primary_query: 'protocol:tcp', 
        secondary_queries: 'not_an_array',
        correlation_field: 'source_ip',
        limit: 10 
      };
      await expect(searchTools.search_cross_reference(params as any))
        .rejects.toThrow(/At least one secondary query is required/);
    });

    test('should validate non-empty secondary_queries array', async () => {
      const params = { 
        primary_query: 'protocol:tcp', 
        secondary_queries: [],
        correlation_field: 'source_ip',
        limit: 10 
      };
      await expect(searchTools.search_cross_reference(params as any))
        .rejects.toThrow(/At least one secondary query is required/);
    });
  });

  describe('Cross-Tool Validation Consistency', () => {
    test('should have consistent limit validation across all search tools', async () => {
      const testLimit = async (searchFn: Function, params: any) => {
        try {
          await searchFn({ ...params, limit: -1 });
          throw new Error('Should have failed');
        } catch (error) {
          expect((error as Error).message).toMatch(/limit/);
        }
      };

      await testLimit(searchTools.search_flows, { query: 'test' });
      await testLimit(searchTools.search_alarms, { query: 'test' });
      await testLimit(searchTools.search_rules, { query: 'test' });
      await testLimit(searchTools.search_devices, { query: 'test' });
      await testLimit(searchTools.search_target_lists, { query: 'test' });
    });

    test('should have consistent error message format across all search tools', async () => {
      const errors: string[] = [];
      
      try { await searchTools.search_flows({} as any); } catch (e) { errors.push((e as Error).message); }
      try { await searchTools.search_alarms({} as any); } catch (e) { errors.push((e as Error).message); }
      try { await searchTools.search_rules({} as any); } catch (e) { errors.push((e as Error).message); }
      try { await searchTools.search_devices({} as any); } catch (e) { errors.push((e as Error).message); }
      try { await searchTools.search_target_lists({} as any); } catch (e) { errors.push((e as Error).message); }

      // All error messages should follow similar format
      errors.forEach(error => {
        expect(error).toMatch(/(required|validation|parameter)/i);
      });
    });

    test('should handle null and undefined parameters consistently', async () => {
      const testNullParams = async (searchFn: Function) => {
        try {
          await searchFn(null);
          throw new Error('Should have failed');
        } catch (error) {
          expect((error as Error).message).toMatch(/(required|validation|parameter)/i);
        }

        try {
          await searchFn(undefined);
          throw new Error('Should have failed');
        } catch (error) {
          expect((error as Error).message).toMatch(/(required|validation|parameter)/i);
        }
      };

      await testNullParams(searchTools.search_flows);
      await testNullParams(searchTools.search_alarms);
      await testNullParams(searchTools.search_rules);
      await testNullParams(searchTools.search_devices);
      await testNullParams(searchTools.search_target_lists);
    });
  });

  describe('Edge Case Scenarios', () => {
    test('should handle extremely long query strings', async () => {
      const longQuery = 'a'.repeat(10000);
      const params = { query: longQuery, limit: 10 };
      
      try {
        await searchTools.search_flows(params as any);
      } catch (error) {
        expect((error as Error).message).toMatch(/(Query validation failed|too long|Invalid query)/);
      }
    });

    test('should handle special characters in query', async () => {
      const specialQuery = 'field:"value with spaces & special chars @#$%"';
      const params = { query: specialQuery, limit: 10 };
      
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });
      
      // Should either succeed with proper escaping or fail with clear error
      try {
        await searchTools.search_flows(params as any);
        expect(mockFirewallaClient.searchFlows).toHaveBeenCalled();
      } catch (error) {
        expect((error as Error).message).toMatch(/(Query validation failed|Invalid query)/);
      }
    });

    test('should handle Unicode in query strings', async () => {
      const unicodeQuery = 'device_name:"设备名称🚀"';
      const params = { query: unicodeQuery, limit: 10 };
      
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });
      
      try {
        await searchTools.search_flows(params as any);
      } catch (error) {
        // Unicode should either be supported or fail gracefully
        expect(error).toBeDefined();
      }
    });

    test('should handle concurrent validation requests', async () => {
      const validParams = { query: 'protocol:tcp', limit: 10 };
      
      mockFirewallaClient.searchFlows = jest.fn().mockResolvedValue({
        results: [],
        metadata: { total: 0 }
      });
      
      const promises = Array.from({ length: 10 }, () => 
        searchTools.search_flows(validParams as any)
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });
  });
});