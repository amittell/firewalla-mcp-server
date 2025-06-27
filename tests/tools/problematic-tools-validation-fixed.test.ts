/**
 * Comprehensive validation test suite for problematic MCP tools
 * Tests tools that were previously returning empty data or zero values
 * 
 * Fixed version that properly handles MCP response format with content array
 */

import { FirewallaClient } from '../../src/firewalla/client';
import { GetBandwidthUsageHandler } from '../../src/tools/handlers/network';
import { GetFlowTrendsHandler, GetStatisticsByBoxHandler } from '../../src/tools/handlers/analytics';
import { SearchFlowsHandler } from '../../src/tools/handlers/search';
import type { ToolArgs, ToolResponse } from '../../src/tools/handlers/base';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

// Helper function to parse MCP response content
function parseMCPResponse(response: ToolResponse): any {
  if (response.isError) {
    return JSON.parse(response.content[0].text);
  }
  return JSON.parse(response.content[0].text);
}

describe('Problematic MCP Tools Validation', () => {
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let getBandwidthUsageHandler: GetBandwidthUsageHandler;
  let getFlowTrendsHandler: GetFlowTrendsHandler;
  let searchFlowsHandler: SearchFlowsHandler;
  let getStatisticsByBoxHandler: GetStatisticsByBoxHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
    
    // Initialize handlers
    getBandwidthUsageHandler = new GetBandwidthUsageHandler();
    getFlowTrendsHandler = new GetFlowTrendsHandler();
    searchFlowsHandler = new SearchFlowsHandler();
    getStatisticsByBoxHandler = new GetStatisticsByBoxHandler();
  });

  describe('get_bandwidth_usage Tool', () => {
    const validArgs: ToolArgs = {
      period: '24h',
      limit: 10
    };

    const mockBandwidthData = {
      results: [
        {
          device_id: 'device-123',
          device_name: 'MacBook Pro',
          ip: '192.168.1.100',
          bytes_uploaded: 1024000000,
          bytes_downloaded: 2048000000,
          total_bytes: 3072000000
        },
        {
          device_id: 'device-456',
          device_name: 'iPhone',
          ip: '192.168.1.101',
          bytes_uploaded: 512000000,
          bytes_downloaded: 1024000000,
          total_bytes: 1536000000
        }
      ]
    };

    it('should execute without errors and return properly formatted data', async () => {
      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockBandwidthData);

      const result = await getBandwidthUsageHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(parsedContent.period).toBe('24h');
      expect(parsedContent.top_devices).toBe(2);
      expect(parsedContent.bandwidth_usage).toHaveLength(2);
    });

    it('should properly format bandwidth data with MB and GB calculations', async () => {
      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockBandwidthData);

      const result = await getBandwidthUsageHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      const firstDevice = parsedContent.bandwidth_usage[0];
      expect(firstDevice.device_name).toBe('MacBook Pro');
      expect(firstDevice.total_bytes).toBe(3072000000);
      expect(firstDevice.total_mb).toBe(2929.69); // 3072000000 / (1024*1024)
      expect(firstDevice.total_gb).toBe(2.86); // 3072000000 / (1024*1024*1024)
    });

    it('should require period and limit parameters', async () => {
      const invalidArgs: ToolArgs = { period: '24h' }; // missing limit

      const result = await getBandwidthUsageHandler.execute(invalidArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeTruthy();
      expect(parsedContent.error).toBeTruthy();
      expect(parsedContent.tool).toBe('get_bandwidth_usage');
    });

    it('should validate period enum values', async () => {
      const invalidArgs: ToolArgs = { period: 'invalid', limit: 10 };

      const result = await getBandwidthUsageHandler.execute(invalidArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeTruthy();
      expect(parsedContent.error).toBeTruthy();
      expect(parsedContent.tool).toBe('get_bandwidth_usage');
    });

    it('should handle empty results gracefully', async () => {
      mockFirewalla.getBandwidthUsage.mockResolvedValue({ results: [] });

      const result = await getBandwidthUsageHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.top_devices).toBe(0);
      expect(parsedContent.bandwidth_usage).toHaveLength(0);
    });

    it('should call FirewallaClient with correct parameters', async () => {
      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockBandwidthData);

      await getBandwidthUsageHandler.execute(validArgs, mockFirewalla);

      expect(mockFirewalla.getBandwidthUsage).toHaveBeenCalledWith('24h', 10);
    });
  });

  describe('get_flow_trends Tool', () => {
    const validArgs: ToolArgs = {
      period: '24h',
      interval: 3600
    };

    const mockTrendsData = {
      results: [
        { ts: 1640995200, value: 1500 },
        { ts: 1640998800, value: 1750 },
        { ts: 1641002400, value: 2000 },
        { ts: 1641006000, value: 1800 },
        { ts: 1641009600, value: 2200 }
      ]
    };

    it('should execute without errors and return trend data', async () => {
      mockFirewalla.getFlowTrends.mockResolvedValue(mockTrendsData);

      const result = await getFlowTrendsHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.period).toBe('24h');
      expect(parsedContent.interval_seconds).toBe(3600);
      expect(parsedContent.data_points).toBe(5);
      expect(parsedContent.trends).toHaveLength(5);
    });

    it('should properly format trend data with timestamps', async () => {
      mockFirewalla.getFlowTrends.mockResolvedValue(mockTrendsData);

      const result = await getFlowTrendsHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      const firstTrend = parsedContent.trends[0];
      expect(firstTrend.timestamp).toBe(1640995200);
      expect(firstTrend.timestamp_iso).toContain('2022-01-01'); // Unix timestamp conversion
      expect(firstTrend.flow_count).toBe(1500);
    });

    it('should calculate summary statistics correctly', async () => {
      mockFirewalla.getFlowTrends.mockResolvedValue(mockTrendsData);

      const result = await getFlowTrendsHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(parsedContent.summary.total_flows).toBe(9250); // Sum of all values
      expect(parsedContent.summary.avg_flows_per_interval).toBe(1850); // Average
      expect(parsedContent.summary.peak_flow_count).toBe(2200); // Maximum
      expect(parsedContent.summary.min_flow_count).toBe(1500); // Minimum
    });

    it('should use default values for optional parameters', async () => {
      const minimalArgs: ToolArgs = {}; // No parameters provided
      mockFirewalla.getFlowTrends.mockResolvedValue(mockTrendsData);

      const result = await getFlowTrendsHandler.execute(minimalArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.period).toBe('24h'); // Default value
      expect(parsedContent.interval_seconds).toBe(3600); // Default value
    });

    it('should validate interval parameter range', async () => {
      const invalidArgs: ToolArgs = { period: '24h', interval: 30 }; // Below minimum of 60

      const result = await getFlowTrendsHandler.execute(invalidArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeTruthy();
      expect(parsedContent.error).toBeTruthy();
      expect(parsedContent.tool).toBe('get_flow_trends');
    });

    it('should handle invalid trend data gracefully', async () => {
      const invalidTrendsData = {
        results: [
          { ts: 'invalid', value: 1500 }, // Invalid timestamp
          { ts: 1640995200, value: 'invalid' }, // Invalid value
          { ts: 1640998800, value: 1750 } // Valid entry
        ]
      };
      mockFirewalla.getFlowTrends.mockResolvedValue(invalidTrendsData);

      const result = await getFlowTrendsHandler.execute(validArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.data_points).toBe(1); // Only valid entries counted
    });
  });

  describe('search_flows Tool', () => {
    const validArgs: ToolArgs = {
      query: 'protocol:tcp AND bytes:>1000',
      limit: 50
    };

    it('should require query and limit parameters', async () => {
      const invalidArgs: ToolArgs = { query: 'protocol:tcp' }; // missing limit

      const result = await searchFlowsHandler.execute(invalidArgs, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      // SearchFlowsHandler uses createSearchTools which will validate parameters
      // If it fails, it should return an error response
      expect(result.isError || parsedContent.error).toBeTruthy();
    });

    it('should handle search tool creation properly', async () => {
      // This test verifies the handler can be instantiated and basic functionality works
      expect(searchFlowsHandler.name).toBe('search_flows');
      expect(searchFlowsHandler.description).toContain('Advanced flow searching');
      expect(searchFlowsHandler.category).toBe('search');
    });
  });

  describe('get_statistics_by_box Tool', () => {
    const mockBoxStatsData = {
      results: [
        {
          value: 850, // activity score
          meta: {
            gid: 'box-123-456',
            name: 'Home Firewalla',
            model: 'Gold',
            online: true,
            version: '1.975',
            location: 'Living Room',
            deviceCount: 15,
            ruleCount: 8,
            alarmCount: 3,
            lastSeen: 1640995200
          }
        },
        {
          value: 650,
          meta: {
            gid: 'box-789-012',
            name: 'Office Firewalla',
            model: 'Purple',
            online: false,
            version: '1.974',
            location: 'Office',
            deviceCount: 12,
            ruleCount: 5,
            alarmCount: 1,
            lastSeen: 1640990000
          }
        }
      ]
    };

    it('should execute without errors and return box statistics', async () => {
      mockFirewalla.getStatisticsByBox.mockResolvedValue(mockBoxStatsData);

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.total_boxes).toBe(2);
      expect(parsedContent.box_statistics).toHaveLength(2);
    });

    it('should properly format box statistics with all required fields', async () => {
      mockFirewalla.getStatisticsByBox.mockResolvedValue(mockBoxStatsData);

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      const firstBox = parsedContent.box_statistics[0];
      expect(firstBox.box_id).toBe('box-123-456');
      expect(firstBox.name).toBe('Home Firewalla');
      expect(firstBox.model).toBe('Gold');
      expect(firstBox.status).toBe('online');
      expect(firstBox.version).toBe('1.975');
      expect(firstBox.location).toBe('Living Room');
      expect(firstBox.device_count).toBe(15);
      expect(firstBox.rule_count).toBe(8);
      expect(firstBox.alarm_count).toBe(3);
      expect(firstBox.activity_score).toBe(850);
      expect(firstBox.last_seen).toContain('2022-01-01'); // ISO string format
    });

    it('should sort boxes by activity score in descending order', async () => {
      mockFirewalla.getStatisticsByBox.mockResolvedValue(mockBoxStatsData);

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      const boxes = parsedContent.box_statistics;
      expect(boxes[0].activity_score).toBe(850); // Higher score first
      expect(boxes[1].activity_score).toBe(650); // Lower score second
    });

    it('should calculate summary statistics correctly', async () => {
      mockFirewalla.getStatisticsByBox.mockResolvedValue(mockBoxStatsData);

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      const summary = parsedContent.summary;
      expect(summary.online_boxes).toBe(1); // Only first box is online
      expect(summary.total_devices).toBe(27); // 15 + 12
      expect(summary.total_rules).toBe(13); // 8 + 5
      expect(summary.total_alarms).toBe(4); // 3 + 1
    });

    it('should handle empty results gracefully', async () => {
      mockFirewalla.getStatisticsByBox.mockResolvedValue({ results: [] });

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeFalsy();
      expect(parsedContent.total_boxes).toBe(0);
      expect(parsedContent.box_statistics).toHaveLength(0);
      expect(parsedContent.summary.online_boxes).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFirewalla.getStatisticsByBox.mockRejectedValue(new Error('API connection failed'));

      const result = await getStatisticsByBoxHandler.execute({}, mockFirewalla);
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeTruthy();
      expect(parsedContent.error).toBeTruthy();
      expect(parsedContent.message).toContain('API connection failed');
    });
  });

  describe('Integration Tests', () => {
    it('should handle rapid successive calls without interference', async () => {
      const mockData = { results: [{ device_id: 'test', total_bytes: 1000 }] };
      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockData);

      const promises = Array(5).fill(null).map(() =>
        getBandwidthUsageHandler.execute({ period: '24h', limit: 10 }, mockFirewalla)
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.isError).toBeFalsy();
        const parsedContent = parseMCPResponse(result);
        expect(parsedContent.bandwidth_usage).toBeDefined();
      });
    });

    it('should maintain performance under load', async () => {
      const mockTrendsData = { results: Array(100).fill(null).map((_, i) => ({ ts: i, value: i })) };
      mockFirewalla.getFlowTrends.mockResolvedValue(mockTrendsData);

      const startTime = Date.now();
      await getFlowTrendsHandler.execute({ period: '24h', interval: 3600 }, mockFirewalla);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Response Format Validation', () => {
    it('should return properly formatted MCP responses', async () => {
      const mockData = { results: [] };
      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockData);

      const result = await getBandwidthUsageHandler.execute({ period: '24h', limit: 10 }, mockFirewalla);

      // Validate MCP response structure
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');

      // Validate JSON content is parseable
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include tool name in error responses', async () => {
      const result = await getBandwidthUsageHandler.execute({}, mockFirewalla); // Missing required params
      const parsedContent = parseMCPResponse(result);

      expect(result.isError).toBeTruthy();
      expect(parsedContent.error).toBeTruthy();
      expect(parsedContent.tool).toBe('get_bandwidth_usage');
      expect(parsedContent.message).toBeDefined();
    });
  });
});