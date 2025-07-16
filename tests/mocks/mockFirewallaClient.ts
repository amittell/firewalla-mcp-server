/**
 * Comprehensive mock Firewalla client for testing
 * Includes all methods used across the test suite
 */

import type { FirewallaClient } from '../../src/firewalla/client.js';

export const createMockFirewallaClient = () => {
  return {
    // Security methods
    getActiveAlarms: jest.fn(),
    getSpecificAlarm: jest.fn(),
    deleteAlarm: jest.fn(),
    searchAlarms: jest.fn(),
    getAlarmTrends: jest.fn(),

    // Network/Flow methods
    getFlowData: jest.fn(),
    searchFlows: jest.fn(),
    getFlowTrends: jest.fn(),
    searchFlowsByGeography: jest.fn(),

    // Device methods
    getDeviceStatus: jest.fn(),
    getOfflineDevices: jest.fn(),
    searchDevices: jest.fn(),

    // Bandwidth methods
    getBandwidthUsage: jest.fn(),

    // Rule methods
    getNetworkRules: jest.fn(),
    getNetworkRulesSummary: jest.fn(),
    getMostActiveRules: jest.fn(),
    getRecentRules: jest.fn(),
    searchRules: jest.fn(),
    getRuleTrends: jest.fn(),
    pauseRule: jest.fn(),
    resumeRule: jest.fn(),
    createRule: jest.fn(),

    // Target list methods
    getTargetLists: jest.fn(),
    searchTargetLists: jest.fn(),

    // Statistics methods
    getBoxes: jest.fn(),
    getSimpleStatistics: jest.fn(),
    getStatisticsByRegion: jest.fn(),
    getStatisticsByBox: jest.fn(),

    // Summary methods
    getFirewallSummary: jest.fn(),
    getSecurityMetrics: jest.fn(),
    getNetworkTopology: jest.fn(),
    getRecentThreats: jest.fn(),

    // Cross-reference methods
    searchCrossReference: jest.fn(),

    // Bulk operation methods (if any)
    bulkDeleteAlarms: jest.fn(),
    bulkDismissAlarms: jest.fn(),
    bulkAcknowledgeAlarms: jest.fn(),
    bulkUpdateAlarms: jest.fn(),
    bulkPauseRules: jest.fn(),
    bulkResumeRules: jest.fn(),
    bulkEnableRules: jest.fn(),
    bulkDisableRules: jest.fn(),
    bulkUpdateRules: jest.fn(),
    bulkDeleteRules: jest.fn(),
  } as unknown as FirewallaClient;
};

// Default mock responses
export const mockResponses = {
  alarms: {
    items: [
      {
        aid: '12345',
        id: { aid: '12345' },
        type: 'blocked_site',
        severity: 'high',
        message: 'Blocked malicious site',
        sh: '192.168.1.100',
        dh: '8.8.8.8',
        protocol: 'tcp',
        port: 443,
        ts: Date.now()
      }
    ],
    total: 1,
    next_cursor: undefined
  },
  flows: {
    items: [
      {
        fd: 'flow123',
        sh: '192.168.1.100',
        dh: '8.8.8.8',
        protocol: 'tcp',
        port: 443,
        ob: 1024,
        rb: 2048,
        blocked: false,
        ts: Date.now()
      }
    ],
    total: 1,
    next_cursor: undefined
  },
  devices: {
    items: [
      {
        id: 'device123',
        name: 'Test Device',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
        online: true,
        lastSeen: Date.now()
      }
    ],
    total: 1,
    next_cursor: undefined
  },
  rules: {
    items: [
      {
        rid: 'rule123',
        id: { rid: 'rule123' },
        type: 'block',
        target: 'domain',
        target_value: 'example.com',
        action: 'block',
        enabled: true,
        hit_count: 10
      }
    ],
    total: 1,
    next_cursor: undefined
  },
  statistics: {
    total_devices: 10,
    online_devices: 8,
    total_alarms: 50,
    critical_alarms: 5,
    total_rules: 25,
    active_rules: 20,
    blocked_flows_today: 100,
    total_bandwidth_gb: 150.5
  },
  boxes: [
    {
      gid: 'box123',
      id: 'box123',
      name: 'Test Box',
      ip: '192.168.1.1',
      online: true,
      version: '2.0.0'
    }
  ]
};

// Helper to reset all mocks
export const resetMockFirewallaClient = (mockClient: any) => {
  Object.keys(mockClient).forEach(key => {
    if (typeof mockClient[key] === 'function' && mockClient[key].mockReset) {
      mockClient[key].mockReset();
    }
  });
};

// Helper to setup default mock implementations
export const setupDefaultMocks = (mockClient: any) => {
  mockClient.getActiveAlarms.mockResolvedValue(mockResponses.alarms);
  mockClient.getFlowData.mockResolvedValue(mockResponses.flows);
  mockClient.getDeviceStatus.mockResolvedValue(mockResponses.devices);
  mockClient.getNetworkRules.mockResolvedValue(mockResponses.rules);
  mockClient.getSimpleStatistics.mockResolvedValue(mockResponses.statistics);
  mockClient.getBoxes.mockResolvedValue(mockResponses.boxes);
  
  // Setup specific alarm mock
  mockClient.getSpecificAlarm.mockImplementation((alarmId: string) => {
    if (alarmId === '12345') {
      return Promise.resolve(mockResponses.alarms.items[0]);
    }
    return Promise.resolve({ aid: null, id: null });
  });
  
  // Setup delete alarm mock
  mockClient.deleteAlarm.mockResolvedValue({ success: true });
  
  // Setup rule mocks
  mockClient.pauseRule.mockResolvedValue({ success: true });
  mockClient.resumeRule.mockResolvedValue({ success: true });
};