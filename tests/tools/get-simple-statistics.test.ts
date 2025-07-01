/**
 * Comprehensive tests for get_simple_statistics tool
 * Tests client-side aggregation, parameter validation, and error handling
 */

import { GetSimpleStatisticsHandler } from '../../src/tools/handlers/analytics.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

// Mock FirewallaClient
const mockFirewallaClient = {
  getSimpleStatistics: jest.fn(),
  getBoxes: jest.fn(),
  getActiveAlarms: jest.fn(),
  getNetworkRules: jest.fn(),
  getFlowData: jest.fn().mockResolvedValue({
    results: [],
    count: 0,
    next_cursor: undefined,
  }),
} as unknown as jest.Mocked<FirewallaClient>;

describe('GetSimpleStatisticsHandler', () => {
  let handler: GetSimpleStatisticsHandler;

  beforeEach(() => {
    handler = new GetSimpleStatisticsHandler();
    jest.clearAllMocks();
  });

  describe('tool metadata', () => {
    test('should have correct tool properties', () => {
      expect(handler.name).toBe('get_simple_statistics');
      expect(handler.description).toBe('Get basic statistics about boxes, alarms, and rules');
      expect(handler.category).toBe('analytics');
    });
  });

  describe('client-side aggregation', () => {
    beforeEach(() => {
      // Mock getSimpleStatistics to return aggregated data (what the client-side aggregation produces)
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockResolvedValue({
        count: 1,
        results: [{
          onlineBoxes: 2,
          offlineBoxes: 1,
          alarms: 5,
          rules: 3
        }]
      });
    });

    test('should call getSimpleStatistics method', async () => {
      const result = await handler.execute({}, mockFirewallaClient);

      // Verify the getSimpleStatistics method was called
      expect(mockFirewallaClient.getSimpleStatistics).toHaveBeenCalledTimes(1);

      // Verify the result structure (MCP response format)
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      // Parse the JSON response
      const parsedData = JSON.parse(result.content[0].text);
      expect(parsedData).toHaveProperty('statistics');
      expect(parsedData).toHaveProperty('summary');
    });

    test('should correctly calculate online/offline box statistics', async () => {
      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const stats = parsedData.statistics;

      expect(stats.online_boxes).toBe(2);
      expect(stats.offline_boxes).toBe(1);
      expect(stats.total_boxes).toBe(3);
      expect(stats.box_availability).toBe(67); // (2/3) * 100 rounded
    });

    test('should correctly aggregate alarm and rule counts', async () => {
      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const stats = parsedData.statistics;

      expect(stats.total_alarms).toBe(5);
      expect(stats.total_rules).toBe(3);
    });

    test('should calculate correct summary information', async () => {
      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const summary = parsedData.summary;

      expect(summary.status).toBe('operational');
      expect(summary.active_monitoring).toBe(true);
      expect(typeof summary.health_score).toBe('number');
      expect(summary.health_score).toBeGreaterThanOrEqual(0);
      expect(summary.health_score).toBeLessThanOrEqual(100);
    });
  });

  describe('edge cases', () => {
    test('should handle all boxes offline scenario', async () => {
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockResolvedValue({
        count: 1,
        results: [{
          onlineBoxes: 0,
          offlineBoxes: 2,
          alarms: 1,
          rules: 1
        }]
      });

      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const stats = parsedData.statistics;
      const summary = parsedData.summary;

      expect(stats.online_boxes).toBe(0);
      expect(stats.offline_boxes).toBe(2);
      expect(stats.box_availability).toBe(0);
      expect(summary.status).toBe('offline');
      expect(summary.active_monitoring).toBe(false);
    });

    test('should handle empty data sets', async () => {
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockResolvedValue({
        count: 1,
        results: [{
          onlineBoxes: 0,
          offlineBoxes: 0,
          alarms: 0,
          rules: 0
        }]
      });

      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const stats = parsedData.statistics;

      expect(stats.online_boxes).toBe(0);
      expect(stats.offline_boxes).toBe(0);
      expect(stats.total_boxes).toBe(0);
      expect(stats.total_alarms).toBe(0);
      expect(stats.total_rules).toBe(0);
      expect(stats.box_availability).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle API errors gracefully', async () => {
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await handler.execute({}, mockFirewallaClient);

      expect(result.isError).toBe(true);
      const parsedData = JSON.parse(result.content[0].text);
      expect(parsedData.error).toBe(true);
      expect(parsedData.message).toContain('Failed to get simple statistics');
    });
  });

  describe('implementation verification', () => {
    test('should call getSimpleStatistics method', async () => {
      // This test verifies the implementation calls the correct method
      await handler.execute({}, mockFirewallaClient);

      // Verify it calls getSimpleStatistics (which internally does client-side aggregation)
      expect(mockFirewallaClient.getSimpleStatistics).toHaveBeenCalledTimes(1);
    });

    test('should not require any parameters', async () => {
      // Reset to ensure clean state for this test
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockResolvedValue({
        count: 1,
        results: [{
          onlineBoxes: 1,
          offlineBoxes: 0,
          alarms: 0,
          rules: 0
        }]
      });

      // The tool should work with empty args object
      const result = await handler.execute({}, mockFirewallaClient);
      
      // Check that it's a valid response
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('text');
      
      // Should be able to parse as JSON
      const parsedData = JSON.parse(result.content[0].text);
      expect(parsedData).toHaveProperty('statistics');
    });

    test('should calculate health score correctly', async () => {
      // Test health score calculation with known values
      (mockFirewallaClient.getSimpleStatistics as jest.Mock).mockResolvedValue({
        count: 1,
        results: [{
          onlineBoxes: 2,  // 2 online boxes
          offlineBoxes: 0, // 0 offline boxes
          alarms: 2,       // 2 alarms
          rules: 10        // 10 rules
        }]
      });

      const result = await handler.execute({}, mockFirewallaClient);
      const parsedData = JSON.parse(result.content[0].text);
      const summary = parsedData.summary;

      // Health score calculation:
      // Start with 100
      // No offline boxes penalty (100 - 0 = 100)
      // Alarm penalty: 2 alarms * 2 = 4 (100 - 4 = 96)
      // Rule bonus: min(10/10, 10) = 1 (96 + 1 = 97)
      expect(summary.health_score).toBe(97);
    });
  });
});