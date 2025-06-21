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
      mspBaseUrl: 'https://test.firewalla.com',
      boxId: 'test-box-id',
      apiTimeout: 30000,
      rateLimit: 100,
      cacheTtl: 300,
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
          'Authorization': `Bearer ${mockConfig.mspToken}`,
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
        data: { success: true, data: mockAlarms },
      });

      const result = await client.getActiveAlarms('high', 10);
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/alarms/${mockConfig.boxId}`,
        { params: { status: 'active', limit: 10, severity: 'high' } }
      );
      expect(result).toEqual(mockAlarms);
    });

    it('should handle API errors gracefully', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      await expect(client.getActiveAlarms()).rejects.toThrow('API Error: Network error');
    });

    it('should use cache for repeated requests', async () => {
      const mockAlarms = [{ id: 'test' }];
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { success: true, data: mockAlarms },
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

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { success: true, data: mockFlowData },
      });

      const result = await client.getFlowData(
        '2023-01-01T00:00:00Z',
        '2023-01-01T23:59:59Z',
        50,
        2
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/flow/${mockConfig.boxId}`,
        {
          params: {
            limit: 50,
            page: 2,
            start_time: '2023-01-01T00:00:00Z',
            end_time: '2023-01-01T23:59:59Z',
          },
        }
      );
      expect(result).toEqual(mockFlowData);
    });
  });

  describe('pauseRule', () => {
    it('should pause a firewall rule', async () => {
      const mockResponse = { success: true, message: 'Rule paused successfully' };
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { success: true, data: mockResponse },
      });

      const result = await client.pauseRule('rule-123', 120);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/rules/${mockConfig.boxId}/pause`,
        { rule_id: 'rule-123', duration_minutes: 120 }
      );
      expect(result).toEqual(mockResponse);
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
  });
});