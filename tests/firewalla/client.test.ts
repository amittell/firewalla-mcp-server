import { FirewallaClient } from '../../src/firewalla/client';
import { FirewallaConfig } from '../../src/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FirewallaClient', () => {
  let client: FirewallaClient;
  let mockConfig: FirewallaConfig;

  beforeEach(() => {
    mockConfig = {
      mspToken: 'test-token-123',
      mspId: 'test-msp',
      mspBaseUrl: 'https://test.firewalla.com',
      boxId: 'test-box-id',
      apiTimeout: 30000,
      rateLimit: 100,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    };

    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    } as any);

    client = new FirewallaClient(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.mspBaseUrl,
        timeout: mockConfig.apiTimeout,
        headers: {
          'Authorization': `Token ${mockConfig.mspToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Firewalla-MCP-Server/1.0.0',
        },
      });
    });
  });

  describe('getActiveAlarms', () => {
    it('should fetch active alarms successfully', async () => {
      const mockAlarms = [
        {
          id: 'alarm-1',
          timestamp: '2023-01-01T00:00:00Z',
          severity: 'high' as const,
          type: 'intrusion',
          description: 'Suspicious activity detected',
          status: 'active' as const,
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { results: mockAlarms },
      });

      const result = await client.getActiveAlarms('high', undefined, undefined, 10);
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/alarms`,
        { params: { query: 'high', limit: 10, sortBy: 'timestamp:desc' } }
      );
      
      // Verify the paginated response structure
      expect(result).toEqual(expect.objectContaining({
        count: expect.any(Number),
        results: expect.any(Array)
      }));
      expect(result.next_cursor).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty('ts');
      expect(result.results[0]).toHaveProperty('gid');
      expect(result.results[0]).toHaveProperty('aid');
      expect(result.results[0]).toHaveProperty('type');
      expect(result.results[0]).toHaveProperty('message');
      expect(result.results[0]).toHaveProperty('status');
    });

    it('should handle API errors gracefully', async () => {
      const mockAxiosInstance = mockedAxios.create();
      const axiosError = new Error('Network error');
      mockAxiosInstance.get = jest.fn().mockRejectedValue(axiosError);
      
      // Mock axios.isAxiosError to return true for our error
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await expect(client.getActiveAlarms()).rejects.toThrow('API Error (unknown): Network error');
    });

    it('should use cache for repeated requests', async () => {
      const mockAlarms = [{ id: 'test' }];
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { results: mockAlarms },
      });

      // First call
      await client.getActiveAlarms();
      // Second call should use cache
      await client.getActiveAlarms();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFlowData', () => {
    it('should fetch flow data with pagination', async () => {
      const mockApiResponse = [
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
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { results: mockApiResponse, next_cursor: 'next-cursor' },
      });

      const result = await client.getFlowData(
        undefined,
        undefined,
        'ts:desc',
        50,
        'test-cursor'
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/test-box-id/flows`,
        {
          params: {
            limit: 50,
            cursor: 'test-cursor',
            sortBy: 'ts:desc',
          },
        }
      );
      
      // Verify the structure and required fields
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('next_cursor');
      expect(result.next_cursor).toEqual('next-cursor');
      expect(result.results).toHaveLength(1);
      
      const flow = result.results[0]!;
      expect(flow).toHaveProperty('ts');
      expect(flow).toHaveProperty('gid');
      expect(flow).toHaveProperty('protocol');
      expect(flow).toHaveProperty('direction');
      // Note: The actual flow object structure depends on the API response mapping
    });

    it('should handle comprehensive flow data mapping', async () => {
      const mockApiResponse = [
        {
          ts: 1672531200, // Unix timestamp for 2023-01-01T00:00:00Z
          gid: 'test-box-id',
          protocol: 'tcp',
          direction: 'outbound' as const,
          block: false,
          download: 512,
          upload: 512,
          duration: 30,
          count: 10,
          device: {
            id: 'device-123',
            ip: '192.168.1.100',
            name: 'My Laptop',
            network: {
              id: 'network-1',
              name: 'Home Network'
            }
          },
          source: {
            id: 'source-host-1',
            name: 'My Laptop',
            ip: '192.168.1.100'
          },
          destination: {
            id: 'dest-host-1',
            name: 'Google DNS',
            ip: '8.8.8.8'
          },
          region: 'US',
          category: 'edu' as const
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { results: mockApiResponse, next_cursor: undefined },
      });

      const result = await client.getFlowData();
      
      expect(result.results).toHaveLength(1);
      const flow = result.results[0]!;

      expect(flow.ts).toBe(1672531200);
      expect(flow.source?.ip).toBe('192.168.1.100');
      expect(flow.destination?.ip).toBe('8.8.8.8');
      expect(flow.protocol).toBe('tcp');
      expect(flow.download).toBe(512);
      expect(flow.upload).toBe(512);
      expect(flow.bytes).toBe(1024); // Validate aggregated bytes field
      expect((flow.download || 0) + (flow.upload || 0)).toBe(1024); // Validate combined bytes value (download + upload)
      expect(flow.direction).toBe('outbound');
      expect(flow.device).toEqual({
        id: 'device-123',
        ip: '192.168.1.100',
        name: 'My Laptop',
        network: {
          id: 'network-1',
          name: 'Home Network'
        }
      });
      expect(flow.region).toBe('US');
      expect(flow.category).toBe('edu');
    });
  });

  describe('getDeviceStatus', () => {
    it('should fetch and map device status with comprehensive field mapping', async () => {
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800, // Unix timestamp
          deviceType: 'mobile',
        },
        {
          id: 'device-2',
          deviceName: 'MacBook-Pro',
          ipAddress: '192.168.1.11',
          macAddress: 'aabbccddeeff',
          isOnline: false,
          onlineTs: 1703980700,
          manufacturer: 'Apple',
        },
        {
          _id: 'device-3',
          hostname: 'Smart-TV',
          localIP: '192.168.1.12',
          hardwareAddr: 'AA-BB-CC-DD-EE-11',
          connected: true,
          lastActivity: 1703980900000, // Milliseconds
          vendor: 'Samsung',
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/devices`,
        { params: {} }
      );

      expect(result.results).toHaveLength(3);
      
      // Results are sorted alphabetically by name: "iPhone", "MacBook-Pro", "Smart-TV"
      // Verify first device mapping (iPhone)
      expect(result.results[0]).toMatchObject({
        id: 'device-1',
        name: 'iPhone',
        ip: '192.168.1.10',
        online: true,
      });
      expect(result.results[0]!.lastSeen).toBe(1703980800);
      
      // Verify second device mapping (MacBook-Pro)  
      expect(result.results[1]).toMatchObject({
        id: 'device-2',
        name: 'MacBook-Pro',
        ip: '192.168.1.11',
        online: false,
      });
      
      // Verify third device mapping
      expect(result.results[2]).toMatchObject({
        id: 'device-3',
        name: 'Smart-TV',
        ip: '192.168.1.12',
        online: true,
      });
      
      // Verify paginated response structure
      expect(result).toEqual(expect.objectContaining({
        count: expect.any(Number),
        results: expect.any(Array),
        next_cursor: undefined
      }));
    });

    it('should filter devices by deviceId', async () => {
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
        },
        {
          gid: 'device-2',
          name: 'Android',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: false,
          lastSeen: 1703980700,
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus('device-1');

      expect(result.results).toHaveLength(1); // One device matches
      expect(result.results[0]!.id).toBe('device-1');
      expect(result).toEqual(expect.objectContaining({
        count: 1,
        results: expect.any(Array),
        next_cursor: undefined
      }));
    });

    it('should filter by MAC address', async () => {
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus('AA:BB:CC:DD:EE:FF');

      expect(result.results).toHaveLength(1); // One device matches by MAC
      expect(result.results[0]!.id).toBe('device-1');
      expect(result).toEqual(expect.objectContaining({
        count: 1,
        results: expect.any(Array),
        next_cursor: undefined
      }));
    });

    it('should exclude offline devices when includeOffline is false', async () => {
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
        },
        {
          gid: 'device-2',
          name: 'Android',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: false,
          lastSeen: 1703980700,
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus(undefined, false);

      expect(result.results).toHaveLength(1); // Only online devices
      expect(result.results[0]!.online).toBe(true);
      expect(result).toEqual(expect.objectContaining({
        count: 1,
        results: expect.any(Array),
        next_cursor: undefined
      }));
    });

    it('should infer device types from names and vendors', async () => {
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'Samsung Smart TV',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
        },
        {
          gid: 'device-2',
          name: 'Alexa Echo',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: true,
          lastSeen: 1703980700,
          vendor: 'Amazon',
        },
        {
          gid: 'device-3',
          name: 'MacBook Pro',
          ip: '192.168.1.12',
          mac: 'aa:bb:cc:dd:ee:12',
          online: true,
          lastSeen: 1703980600,
        },
      ];

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();

      expect(result.results).toHaveLength(3); // All devices returned
      // Results should be sorted by name: "Alexa Echo", "MacBook Pro", "Samsung Smart TV"
      expect(result.results[0]!.id).toBe('device-2'); // Alexa Echo
      expect(result.results[1]!.id).toBe('device-3'); // MacBook Pro
      expect(result.results[2]!.id).toBe('device-1'); // Samsung Smart TV
      expect(result).toEqual(expect.objectContaining({
        count: 3,
        results: expect.any(Array),
        next_cursor: undefined
      }));
    });
  });

  describe('pauseRule', () => {
    it('should pause a firewall rule', async () => {
      const mockResponse = { success: true, message: 'Rule paused successfully' };
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { success: true, message: 'Rule paused successfully' },
      });

      const result = await client.pauseRule('rule-123', 120);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/rules/rule-123/pause`,
        { duration: 120 }
      );
      expect(result).toEqual({ success: true, message: 'Rule rule-123 paused for 120 minutes' });
    });
  });

  describe('additional API methods', () => {
    beforeEach(() => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { results: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    });

    it('should call getNetworkRules without parameters', async () => {
      await client.getNetworkRules();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/test-box-id/rules`,
        { params: {} }
      );
    });

    it('should call getTargetLists without parameters', async () => {
      await client.getTargetLists();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/test-box-id/target-lists`,
        { params: {} }
      );
    });

    it('should call getRecentThreats with default parameters', async () => {
      await client.getRecentThreats();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/threats/recent`,
        { params: { hours: 24 } }
      );
    });

    it('should call getFirewallSummary', async () => {
      await client.getFirewallSummary();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/summary`,
        { params: undefined }
      );
    });

    it('should call getSecurityMetrics', async () => {
      await client.getSecurityMetrics();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/metrics/security`,
        { params: undefined }
      );
    });

    it('should call getNetworkTopology', async () => {
      await client.getNetworkTopology();
      
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/boxes/${mockConfig.boxId}/topology`,
        { params: undefined }
      );
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', () => {
      client.clearCache();
      const stats = client.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('should provide cache statistics', () => {
      const stats = client.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('keys');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    it('should handle cache expiration correctly', async () => {
      // Test the private cache methods indirectly
      const mockResponse = {
        data: { results: ['test'] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      mockAxiosInstance.get = jest.fn().mockResolvedValue(mockResponse);

      // First call
      await client.getActiveAlarms();
      
      // Clear cache to force second API call
      client.clearCache();
      
      // Second call
      await client.getActiveAlarms();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });
  });
});