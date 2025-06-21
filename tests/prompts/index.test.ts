import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupPrompts } from '../../src/prompts/index';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

describe('MCP Prompts', () => {
  let server: Server;
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let promptHandler: (request: any) => Promise<any>;

  beforeEach(() => {
    server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
    
    setupPrompts(server, mockFirewalla);
    
    // Extract the prompt handler for testing
    promptHandler = (server as any).requestHandlers.get(GetPromptRequestSchema);
  });

  describe('security_report', () => {
    it('should generate comprehensive security report prompt', async () => {
      const mockData = {
        alarms: [
          {
            id: 'alarm-1',
            timestamp: '2023-01-01T00:00:00Z',
            severity: 'high' as const,
            type: 'intrusion',
            description: 'Suspicious activity detected',
            status: 'active' as const,
          },
        ],
        summary: {
          status: 'online',
          uptime: 86400,
          cpu_usage: 25,
          memory_usage: 45,
          active_connections: 150,
          blocked_attempts: 42,
        },
        metrics: {
          total_alarms: 25,
          active_alarms: 3,
          blocked_connections: 150,
          threat_level: 'medium' as const,
        },
        threats: [
          {
            type: 'malware',
            source_ip: '192.168.1.100',
            destination_ip: '8.8.8.8',
            action_taken: 'blocked',
          },
        ],
      };

      mockFirewalla.getActiveAlarms.mockResolvedValue(mockData.alarms);
      mockFirewalla.getFirewallSummary.mockResolvedValue(mockData.summary);
      mockFirewalla.getSecurityMetrics.mockResolvedValue(mockData.metrics);
      mockFirewalla.getRecentThreats.mockResolvedValue(mockData.threats);

      const response = await promptHandler({
        params: {
          name: 'security_report',
          arguments: { period: '24h' },
        },
      });

      expect(response.messages).toHaveLength(1);
      expect(response.messages[0].role).toBe('user');
      expect(response.messages[0].content.type).toBe('text');
      expect(response.messages[0].content.text).toContain('Firewalla Security Report');
      expect(response.messages[0].content.text).toContain('Executive Summary');
      expect(response.messages[0].content.text).toContain('Firewall Status');
      expect(response.messages[0].content.text).toContain('Security Metrics');
      expect(response.messages[0].content.text).toContain('Active Alarms');
    });
  });

  describe('threat_analysis', () => {
    it('should generate threat analysis prompt', async () => {
      const mockData = {
        alarms: [
          {
            id: 'alarm-1',
            severity: 'high' as const,
            type: 'intrusion',
            description: 'Multiple failed login attempts',
            source_ip: '10.0.0.1',
            destination_ip: '192.168.1.100',
            timestamp: '2023-01-01T00:00:00Z',
            status: 'active' as const,
          },
        ],
        threats: [
          {
            type: 'brute_force',
            source_ip: '10.0.0.1',
            destination_ip: '192.168.1.100',
            action_taken: 'blocked',
            timestamp: '2023-01-01T00:00:00Z',
            severity: 'high',
          },
        ],
        rules: [
          {
            id: 'rule-1',
            name: 'Block Suspicious IPs',
            type: 'security',
            action: 'block' as const,
            status: 'active' as const,
            conditions: {},
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
      };

      mockFirewalla.getActiveAlarms.mockResolvedValue(mockData.alarms);
      mockFirewalla.getRecentThreats.mockResolvedValue(mockData.threats);
      mockFirewalla.getNetworkRules.mockResolvedValue(mockData.rules);

      const response = await promptHandler({
        params: {
          name: 'threat_analysis',
          arguments: { severity_threshold: 'high' },
        },
      });

      expect(response.messages[0].content.text).toContain('Threat Analysis - Pattern Detection');
      expect(response.messages[0].content.text).toContain('Current Threat Landscape');
      expect(response.messages[0].content.text).toContain('Recent Threat Patterns');
      expect(response.messages[0].content.text).toContain('brute_force');
      expect(response.messages[0].content.text).toContain('10.0.0.1');
    });
  });

  describe('bandwidth_analysis', () => {
    it('should generate bandwidth analysis prompt', async () => {
      const mockData = {
        usage: [
          {
            device_id: 'device-1',
            device_name: 'Heavy User',
            ip_address: '192.168.1.100',
            bytes_uploaded: 1024 * 1024 * 100,
            bytes_downloaded: 1024 * 1024 * 500,
            total_bytes: 1024 * 1024 * 600,
            period: '24h',
          },
        ],
        devices: [
          {
            id: 'device-1',
            name: 'Heavy User',
            ip_address: '192.168.1.100',
            mac_address: '00:11:22:33:44:55',
            status: 'online' as const,
            last_seen: '2023-01-01T00:00:00Z',
          },
        ],
        flows: {
          flows: [
            {
              timestamp: '2023-01-01T00:00:00Z',
              source_ip: '192.168.1.100',
              destination_ip: '8.8.8.8',
              source_port: 443,
              destination_port: 80,
              protocol: 'TCP',
              bytes: 1024000,
              packets: 100,
              duration: 60,
            },
          ],
        },
      };

      mockFirewalla.getBandwidthUsage.mockResolvedValue(mockData.usage);
      mockFirewalla.getDeviceStatus.mockResolvedValue(mockData.devices);
      mockFirewalla.getFlowData.mockResolvedValue(mockData.flows);

      const response = await promptHandler({
        params: {
          name: 'bandwidth_analysis',
          arguments: { period: '24h', threshold_mb: 100 },
        },
      });

      expect(response.messages[0].content.text).toContain('Bandwidth Usage Analysis');
      expect(response.messages[0].content.text).toContain('Network Usage Overview');
      expect(response.messages[0].content.text).toContain('Top Bandwidth Consumers');
      expect(response.messages[0].content.text).toContain('Heavy User');
      expect(response.messages[0].content.text).toContain('600MB');
    });

    it('should require period parameter', async () => {
      const response = await promptHandler({
        params: {
          name: 'bandwidth_analysis',
          arguments: {},
        },
      });

      expect(response.messages[0].content.text).toContain('Error generating prompt');
      expect(response.messages[0].content.text).toContain('Period parameter is required');
    });
  });

  describe('device_investigation', () => {
    it('should generate device investigation prompt', async () => {
      const mockData = {
        devices: [
          {
            id: 'device-123',
            name: 'Suspicious Device',
            ip_address: '192.168.1.100',
            mac_address: '00:11:22:33:44:55',
            status: 'online' as const,
            last_seen: '2023-01-01T00:00:00Z',
            device_type: 'laptop',
          },
        ],
        flows: {
          flows: [
            {
              timestamp: '2023-01-01T00:00:00Z',
              source_ip: '192.168.1.100',
              destination_ip: '8.8.8.8',
              source_port: 443,
              destination_port: 80,
              protocol: 'TCP',
              bytes: 1024,
              packets: 10,
              duration: 30,
            },
          ],
        },
        alarms: [
          {
            id: 'alarm-1',
            severity: 'medium' as const,
            type: 'suspicious_activity',
            description: 'Unusual traffic pattern',
            source_ip: '192.168.1.100',
            timestamp: '2023-01-01T00:00:00Z',
            status: 'active' as const,
          },
        ],
      };

      mockFirewalla.getDeviceStatus.mockResolvedValue(mockData.devices);
      mockFirewalla.getFlowData.mockResolvedValue(mockData.flows);
      mockFirewalla.getActiveAlarms.mockResolvedValue(mockData.alarms);

      const response = await promptHandler({
        params: {
          name: 'device_investigation',
          arguments: { device_id: 'device-123', lookback_hours: 48 },
        },
      });

      expect(response.messages[0].content.text).toContain('Device Investigation Report');
      expect(response.messages[0].content.text).toContain('Target Device: Suspicious Device');
      expect(response.messages[0].content.text).toContain('192.168.1.100');
      expect(response.messages[0].content.text).toContain('Network Activity');
      expect(response.messages[0].content.text).toContain('Security Alerts');
    });

    it('should require device_id parameter', async () => {
      const response = await promptHandler({
        params: {
          name: 'device_investigation',
          arguments: {},
        },
      });

      expect(response.messages[0].content.text).toContain('Error generating prompt');
      expect(response.messages[0].content.text).toContain('Device ID parameter is required');
    });

    it('should handle device not found', async () => {
      mockFirewalla.getDeviceStatus.mockResolvedValue([]);

      const response = await promptHandler({
        params: {
          name: 'device_investigation',
          arguments: { device_id: 'nonexistent' },
        },
      });

      expect(response.messages[0].content.text).toContain('Device with ID nonexistent not found');
    });
  });

  describe('network_health_check', () => {
    it('should generate network health check prompt', async () => {
      const mockData = {
        summary: {
          status: 'online',
          uptime: 864000,
          cpu_usage: 25,
          memory_usage: 45,
          active_connections: 150,
          blocked_attempts: 42,
        },
        devices: [
          {
            id: 'device-1',
            name: 'Device 1',
            ip_address: '192.168.1.100',
            mac_address: '00:11:22:33:44:55',
            status: 'online' as const,
            last_seen: '2023-01-01T00:00:00Z',
          },
        ],
        metrics: {
          total_alarms: 5,
          active_alarms: 1,
          blocked_connections: 150,
          suspicious_activities: 2,
          threat_level: 'low' as const,
          last_threat_detected: '2023-01-01T00:00:00Z',
        },
        topology: {
          subnets: [
            {
              id: 'subnet-1',
              name: 'Main',
              cidr: '192.168.1.0/24',
              device_count: 10,
            },
          ],
          connections: [],
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Allow HTTPS',
            type: 'firewall',
            action: 'allow' as const,
            status: 'active' as const,
            conditions: {},
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
      };

      mockFirewalla.getFirewallSummary.mockResolvedValue(mockData.summary);
      mockFirewalla.getDeviceStatus.mockResolvedValue(mockData.devices);
      mockFirewalla.getSecurityMetrics.mockResolvedValue(mockData.metrics);
      mockFirewalla.getNetworkTopology.mockResolvedValue(mockData.topology);
      mockFirewalla.getNetworkRules.mockResolvedValue(mockData.rules);

      const response = await promptHandler({
        params: {
          name: 'network_health_check',
          arguments: {},
        },
      });

      expect(response.messages[0].content.text).toContain('Network Health Assessment');
      expect(response.messages[0].content.text).toContain('System Health');
      expect(response.messages[0].content.text).toContain('Network Connectivity');
      expect(response.messages[0].content.text).toContain('Security Posture');
      expect(response.messages[0].content.text).toContain('Overall Health Score');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFirewalla.getActiveAlarms.mockRejectedValue(new Error('API Error'));

      const response = await promptHandler({
        params: {
          name: 'security_report',
          arguments: {},
        },
      });

      expect(response.messages[0].content.text).toContain('Error generating prompt');
      expect(response.messages[0].content.text).toContain('API Error');
    });

    it('should handle unknown prompts', async () => {
      const response = await promptHandler({
        params: {
          name: 'unknown_prompt',
          arguments: {},
        },
      });

      expect(response.messages[0].content.text).toContain('Error generating prompt');
      expect(response.messages[0].content.text).toContain('Unknown prompt: unknown_prompt');
    });
  });
});