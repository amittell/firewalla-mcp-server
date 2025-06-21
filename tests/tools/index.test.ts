import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupTools } from '../../src/tools/index';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

describe('MCP Tools', () => {
  let server: Server;
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let toolHandler: (request: any) => Promise<any>;

  beforeEach(() => {
    server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
    
    setupTools(server, mockFirewalla);
    
    // Extract the tool handler for testing
    toolHandler = (server as any).requestHandlers.get(CallToolRequestSchema);
  });

  describe('get_active_alarms', () => {
    it('should fetch and format active alarms', async () => {
      const mockAlarms = [
        {
          id: 'alarm-1',
          timestamp: '2023-01-01T00:00:00Z',
          severity: 'high' as const,
          type: 'intrusion',
          description: 'Suspicious activity detected',
          source_ip: '192.168.1.100',
          destination_ip: '8.8.8.8',
          status: 'active' as const,
        },
      ];

      mockFirewalla.getActiveAlarms.mockResolvedValue(mockAlarms);

      const response = await toolHandler({
        params: {
          name: 'get_active_alarms',
          arguments: { severity: 'high', limit: 10 },
        },
      });

      expect(mockFirewalla.getActiveAlarms).toHaveBeenCalledWith('high', 10);
      expect(response.content[0].type).toBe('text');
      
      const result = JSON.parse(response.content[0].text);
      expect(result.total).toBe(1);
      expect(result.alarms).toHaveLength(1);
      expect(result.alarms[0]).toMatchObject({
        id: 'alarm-1',
        severity: 'high',
        type: 'intrusion',
      });
    });

    it('should handle errors gracefully', async () => {
      mockFirewalla.getActiveAlarms.mockRejectedValue(new Error('API Error'));

      const response = await toolHandler({
        params: {
          name: 'get_active_alarms',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.error).toBe(true);
      expect(result.message).toBe('API Error');
    });
  });

  describe('get_flow_data', () => {
    it('should fetch and format flow data', async () => {
      const mockFlowData = {
        flows: [
          {
            timestamp: '2023-01-01T00:00:00Z',
            source_ip: '192.168.1.100',
            destination_ip: '8.8.8.8',
            source_port: 12345,
            destination_port: 80,
            protocol: 'TCP',
            bytes: 1024,
            packets: 10,
            duration: 30,
          },
        ],
        pagination: { page: 1, total_pages: 5, total_count: 100 },
      };

      mockFirewalla.getFlowData.mockResolvedValue(mockFlowData);

      const response = await toolHandler({
        params: {
          name: 'get_flow_data',
          arguments: {
            start_time: '2023-01-01T00:00:00Z',
            end_time: '2023-01-01T23:59:59Z',
            limit: 50,
            page: 1,
          },
        },
      });

      expect(mockFirewalla.getFlowData).toHaveBeenCalledWith(
        '2023-01-01T00:00:00Z',
        '2023-01-01T23:59:59Z',
        50,
        1
      );

      const result = JSON.parse(response.content[0].text);
      expect(result.flows).toHaveLength(1);
      expect(result.pagination).toMatchObject({
        page: 1,
        total_pages: 5,
        total_count: 100,
      });
    });
  });

  describe('get_device_status', () => {
    it('should fetch and format device status', async () => {
      const mockDevices = [
        {
          id: 'device-1',
          name: 'Test Device',
          ip_address: '192.168.1.100',
          mac_address: '00:11:22:33:44:55',
          status: 'online' as const,
          last_seen: '2023-01-01T00:00:00Z',
          device_type: 'laptop',
        },
        {
          id: 'device-2',
          name: 'Test Device 2',
          ip_address: '192.168.1.101',
          mac_address: '00:11:22:33:44:56',
          status: 'offline' as const,
          last_seen: '2023-01-01T00:00:00Z',
          device_type: 'phone',
        },
      ];

      mockFirewalla.getDeviceStatus.mockResolvedValue(mockDevices);

      const response = await toolHandler({
        params: {
          name: 'get_device_status',
          arguments: { include_offline: true },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.total_devices).toBe(2);
      expect(result.online_devices).toBe(1);
      expect(result.offline_devices).toBe(1);
      expect(result.devices).toHaveLength(2);
    });
  });

  describe('get_bandwidth_usage', () => {
    it('should fetch and format bandwidth usage', async () => {
      const mockUsage = [
        {
          device_id: 'device-1',
          device_name: 'Heavy User',
          ip_address: '192.168.1.100',
          bytes_uploaded: 1024 * 1024 * 100, // 100MB
          bytes_downloaded: 1024 * 1024 * 500, // 500MB
          total_bytes: 1024 * 1024 * 600, // 600MB
          period: '24h',
        },
      ];

      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockUsage);

      const response = await toolHandler({
        params: {
          name: 'get_bandwidth_usage',
          arguments: { period: '24h', top: 10 },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.period).toBe('24h');
      expect(result.top_devices).toBe(1);
      expect(result.bandwidth_usage[0]).toMatchObject({
        device_name: 'Heavy User',
        total_mb: 600,
        total_gb: 0.6,
      });
    });

    it('should require period parameter', async () => {
      const response = await toolHandler({
        params: {
          name: 'get_bandwidth_usage',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.message).toBe('Period parameter is required');
    });
  });

  describe('pause_rule', () => {
    it('should pause a firewall rule', async () => {
      const mockResponse = { success: true, message: 'Rule paused successfully' };
      mockFirewalla.pauseRule.mockResolvedValue(mockResponse);

      const response = await toolHandler({
        params: {
          name: 'pause_rule',
          arguments: { rule_id: 'rule-123', duration: 120 },
        },
      });

      expect(mockFirewalla.pauseRule).toHaveBeenCalledWith('rule-123', 120);

      const result = JSON.parse(response.content[0].text);
      expect(result).toMatchObject({
        success: true,
        message: 'Rule paused successfully',
        rule_id: 'rule-123',
        duration_minutes: 120,
        action: 'pause_rule',
      });
    });

    it('should require rule_id parameter', async () => {
      const response = await toolHandler({
        params: {
          name: 'pause_rule',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.message).toBe('Rule ID parameter is required');
    });
  });

  describe('get_target_lists', () => {
    it('should fetch and format target lists', async () => {
      const mockLists = [
        {
          id: 'list-1',
          name: 'CloudFlare IPs',
          type: 'cloudflare' as const,
          entries: ['1.1.1.1', '8.8.8.8', '9.9.9.9'],
          last_updated: '2023-01-01T00:00:00Z',
        },
      ];

      mockFirewalla.getTargetLists.mockResolvedValue(mockLists);

      const response = await toolHandler({
        params: {
          name: 'get_target_lists',
          arguments: { list_type: 'cloudflare' },
        },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.total_lists).toBe(1);
      expect(result.list_types).toEqual(['cloudflare']);
      expect(result.target_lists[0]).toMatchObject({
        name: 'CloudFlare IPs',
        type: 'cloudflare',
        entry_count: 3,
      });
    });
  });

  describe('unknown tool', () => {
    it('should handle unknown tools', async () => {
      const response = await toolHandler({
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.message).toBe('Unknown tool: unknown_tool');
    });
  });
});