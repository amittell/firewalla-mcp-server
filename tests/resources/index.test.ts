import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupResources } from '../../src/resources/index';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

describe('MCP Resources', () => {
  let server: Server;
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let resourceHandler: (request: any) => Promise<any>;

  beforeEach(() => {
    server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
    
    setupResources(server, mockFirewalla);
    
    // Extract the resource handler for testing
    resourceHandler = (server as any).requestHandlers.get(ReadResourceRequestSchema);
  });

  describe('firewalla://summary', () => {
    it('should fetch and format firewall summary', async () => {
      const mockSummary = {
        status: 'online',
        uptime: 864000, // 10 days
        cpu_usage: 25,
        memory_usage: 45,
        active_connections: 150,
        blocked_attempts: 42,
        last_updated: '2023-01-01T00:00:00Z',
      };

      mockFirewalla.getFirewallSummary.mockResolvedValue(mockSummary);

      const response = await resourceHandler({
        params: { uri: 'firewalla://summary' },
      });

      expect(response.contents[0].uri).toBe('firewalla://summary');
      expect(response.contents[0].mimeType).toBe('application/json');

      const result = JSON.parse(response.contents[0].text);
      expect(result.firewall_status).toMatchObject({
        status: 'online',
        uptime_seconds: 864000,
        uptime_formatted: '10d 0h 0m',
        cpu_usage_percent: 25,
        memory_usage_percent: 45,
        active_connections: 150,
        blocked_attempts: 42,
      });

      expect(result.health_indicators).toMatchObject({
        status_ok: true,
        cpu_ok: true,
        memory_ok: true,
      });
      expect(typeof result.health_indicators.performance_score).toBe('number');
    });
  });

  describe('firewalla://devices', () => {
    it('should fetch and format device inventory', async () => {
      const mockDevices = [
        {
          id: 'device-1',
          name: 'Test Device 1',
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

      const response = await resourceHandler({
        params: { uri: 'firewalla://devices' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.device_inventory.statistics).toMatchObject({
        total: 2,
        online: 1,
        offline: 1,
      });
      expect(result.device_inventory.availability_percentage).toBe(50);
      expect(result.device_inventory.devices).toHaveLength(2);
      expect(result.device_inventory.devices[0].status_indicator).toBe('🟢');
      expect(result.device_inventory.devices[1].status_indicator).toBe('🔴');
    });
  });

  describe('firewalla://metrics/security', () => {
    it('should fetch and format security metrics', async () => {
      const mockMetrics = {
        total_alarms: 25,
        active_alarms: 3,
        blocked_connections: 150,
        suspicious_activities: 8,
        threat_level: 'medium' as const,
        last_threat_detected: '2023-01-01T00:00:00Z',
      };

      mockFirewalla.getSecurityMetrics.mockResolvedValue(mockMetrics);

      const response = await resourceHandler({
        params: { uri: 'firewalla://metrics/security' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.security_metrics.overview).toMatchObject({
        total_alarms: 25,
        active_alarms: 3,
        resolved_alarms: 22,
        blocked_connections: 150,
        suspicious_activities: 8,
        threat_level: 'medium',
      });

      expect(result.security_metrics.threat_indicators.level_emoji).toBe('🟡');
      expect(typeof result.security_metrics.threat_indicators.security_effectiveness).toBe('number');
      expect(typeof result.security_metrics.threat_indicators.recommendation).toBe('string');
    });
  });

  describe('firewalla://topology', () => {
    it('should fetch and format network topology', async () => {
      const mockTopology = {
        subnets: [
          {
            id: 'subnet-1',
            name: 'Main Network',
            cidr: '192.168.1.0/24',
            device_count: 10,
          },
        ],
        connections: [
          {
            source: 'router',
            destination: 'switch',
            type: 'ethernet',
            bandwidth: 1000000000, // 1Gbps
          },
        ],
      };

      mockFirewalla.getNetworkTopology.mockResolvedValue(mockTopology);

      const response = await resourceHandler({
        params: { uri: 'firewalla://topology' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.network_topology.overview).toMatchObject({
        total_subnets: 1,
        total_devices: 10,
        total_connections: 1,
      });

      expect(result.network_topology.subnets[0]).toMatchObject({
        name: 'Main Network',
        cidr: '192.168.1.0/24',
        device_count: 10,
        subnet_size: 256,
      });

      expect(result.network_topology.connections[0]).toMatchObject({
        source: 'router',
        destination: 'switch',
        type: 'ethernet',
        bandwidth_mbps: 1000,
        connection_strength: 'high',
      });
    });
  });

  describe('firewalla://threats/recent', () => {
    it('should fetch and format recent threats', async () => {
      const mockThreats = [
        {
          timestamp: '2023-01-01T00:00:00Z',
          type: 'malware',
          source_ip: '192.168.1.100',
          destination_ip: '8.8.8.8',
          action_taken: 'blocked',
          severity: 'high',
        },
        {
          timestamp: '2023-01-01T01:00:00Z',
          type: 'intrusion',
          source_ip: '10.0.0.1',
          destination_ip: '192.168.1.100',
          action_taken: 'blocked',
          severity: 'medium',
        },
      ];

      mockFirewalla.getRecentThreats.mockResolvedValue(mockThreats);

      const response = await resourceHandler({
        params: { uri: 'firewalla://threats/recent' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.recent_threats.time_period).toBe('24 hours');
      expect(result.recent_threats.statistics.total).toBe(2);
      expect(result.recent_threats.statistics.by_severity).toHaveProperty('high', 1);
      expect(result.recent_threats.statistics.by_severity).toHaveProperty('medium', 1);
      expect(result.recent_threats.statistics.by_type).toHaveProperty('malware', 1);
      expect(result.recent_threats.statistics.by_type).toHaveProperty('intrusion', 1);

      expect(result.recent_threats.threats).toHaveLength(2);
      expect(result.recent_threats.threats[0]).toMatchObject({
        type: 'malware',
        severity: 'high',
        severity_emoji: '🟠',
      });
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFirewalla.getFirewallSummary.mockRejectedValue(new Error('API Error'));

      const response = await resourceHandler({
        params: { uri: 'firewalla://summary' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.error).toBe(true);
      expect(result.message).toBe('API Error');
      expect(result.uri).toBe('firewalla://summary');
    });

    it('should handle unknown resource URIs', async () => {
      const response = await resourceHandler({
        params: { uri: 'firewalla://unknown' },
      });

      const result = JSON.parse(response.contents[0].text);
      expect(result.error).toBe(true);
      expect(result.message).toBe('Unknown resource URI: firewalla://unknown');
    });
  });
});