/**
 * Traditional Device Status Tests - Shows the inefficient pattern
 * 
 * This test suite demonstrates the traditional approach with individual API calls
 * per test case, highlighting the performance difference compared to the optimized approach.
 */

import { FirewallaClient } from '../../src/firewalla/client';
import { FirewallaConfig } from '../../src/types';
import { ApiPerformanceMonitor, DEFAULT_THRESHOLDS } from '../utils/performance-monitor';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FirewallaClient Device Status (Traditional)', () => {
  let client: FirewallaClient;
  let mockConfig: FirewallaConfig;
  let mockAxiosInstance: any;

  beforeAll(() => {
    ApiPerformanceMonitor.startMonitoring();
  });

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

    // Create fresh mock for each test
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    client = new FirewallaClient(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    const metrics = ApiPerformanceMonitor.stopMonitoring();
    console.log(ApiPerformanceMonitor.generateReport());
    
    // Compare against individual API thresholds (less strict than optimized)
    const { passed, violations } = ApiPerformanceMonitor.checkThresholds(DEFAULT_THRESHOLDS.individual);
    
    if (!passed) {
      console.warn('⚠️ Performance thresholds exceeded (as expected for traditional approach):');
      violations.forEach(v => console.warn(`  • ${v}`));
    } else {
      console.log('✅ Traditional approach still within individual test thresholds');
    }
  });

  describe('Basic Device Operations (Individual API calls)', () => {
    it('should fetch and map device status with comprehensive field mapping', async () => {
      // INDIVIDUAL API CALL 1
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
          macVendor: 'Apple',
        },
        {
          gid: 'device-2',
          name: 'Android Phone',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: false,
          lastSeen: 1703980700,
          macVendor: 'Samsung',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/v2/devices`,
        { params: { box: mockConfig.boxId } }
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        id: 'device-1',
        name: 'iPhone',
        ip: '192.168.1.10',
        online: true,
      });
    });
  });

  describe('Device Filtering (Individual API calls)', () => {
    it('should filter devices by deviceId', async () => {
      // INDIVIDUAL API CALL 2 (DUPLICATE DATA FETCH)
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

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus('device-1');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('device-1');
    });

    it('should filter by MAC address', async () => {
      // INDIVIDUAL API CALL 3 (DUPLICATE DATA FETCH)
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

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus('AA:BB:CC:DD:EE:FF');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('device-1');
    });

    it('should exclude offline devices when includeOffline is false', async () => {
      // INDIVIDUAL API CALL 4 (DUPLICATE DATA FETCH)
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

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus(undefined, false);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].online).toBe(true);
    });

    it('should filter devices by name content', async () => {
      // INDIVIDUAL API CALL 5 (DUPLICATE DATA FETCH)
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
          name: 'Samsung Smart TV',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: true,
          lastSeen: 1703980700,
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();
      const smartDevices = result.results.filter(d => d.name.includes('Smart'));

      expect(smartDevices).toHaveLength(1);
      expect(smartDevices[0].name).toBe('Samsung Smart TV');
    });
  });

  describe('Device Type Operations (Individual API calls)', () => {
    it('should provide device statistics', async () => {
      // INDIVIDUAL API CALL 6 (DUPLICATE DATA FETCH)
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
          macVendor: 'Apple',
        },
        {
          gid: 'device-2',
          name: 'MacBook-Pro',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: true,
          lastSeen: 1703980700,
          macVendor: 'Apple',
        },
        {
          gid: 'device-3',
          name: 'Samsung Smart TV',
          ip: '192.168.1.12',
          mac: 'aa:bb:cc:dd:ee:22',
          online: false,
          lastSeen: 1703980600,
          macVendor: 'Samsung',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();

      // Manual statistics calculation (what would happen without shared data)
      const onlineCount = result.results.filter(d => d.online).length;
      const offlineCount = result.results.filter(d => !d.online).length;

      expect(onlineCount).toBe(2);
      expect(offlineCount).toBe(1);
      expect(result.results).toHaveLength(3);
    });

    it('should support vendor-based analysis', async () => {
      // INDIVIDUAL API CALL 7 (DUPLICATE DATA FETCH)
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
          macVendor: 'Apple',
        },
        {
          gid: 'device-2',
          name: 'MacBook-Pro',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: true,
          lastSeen: 1703980700,
          macVendor: 'Apple',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();
      const appleDevices = result.results.filter(d => d.macVendor === 'Apple');

      expect(appleDevices).toHaveLength(2);
    });
  });

  describe('Complex Device Operations (Individual API calls)', () => {
    it('should support complex filtering scenarios', async () => {
      // INDIVIDUAL API CALL 8 (DUPLICATE DATA FETCH)
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980800,
          macVendor: 'Apple',
        },
        {
          gid: 'device-2',
          name: 'Android Phone',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: false,
          lastSeen: 1703980700,
          macVendor: 'Samsung',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();
      
      // Complex filtering with multiple API calls and processing
      const onlineAppleDevices = result.results.filter(device =>
        device.online && device.macVendor === 'Apple'
      );

      expect(onlineAppleDevices).toHaveLength(1);
      expect(onlineAppleDevices[0].name).toBe('iPhone');
    });

    it('should support activity-based analysis', async () => {
      // INDIVIDUAL API CALL 9 (DUPLICATE DATA FETCH)
      const mockRawDevices = [
        {
          gid: 'device-1',
          name: 'iPhone',
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:ff',
          online: true,
          lastSeen: 1703980900, // Recent
          macVendor: 'Apple',
        },
        {
          gid: 'device-2',
          name: 'Old Device',
          ip: '192.168.1.11',
          mac: 'aa:bb:cc:dd:ee:11',
          online: false,
          lastSeen: 1703980600, // Older
          macVendor: 'Unknown',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockRawDevices,
      });

      const result = await client.getDeviceStatus();
      
      // Activity analysis
      const recentlyActive = result.results.filter(device =>
        (device.lastSeen || 0) > 1703980800
      );

      expect(recentlyActive).toHaveLength(1);
      expect(recentlyActive[0].name).toBe('iPhone');
    });
  });

  describe('Performance Analysis (Traditional)', () => {
    it('should demonstrate multiple API calls pattern', () => {
      const currentCallCount = ApiPerformanceMonitor.getCurrentCallCount();
      
      console.log(`⚠️ Traditional approach used ${currentCallCount} API calls for device testing`);
      
      // Should be significantly more calls than optimized approach
      expect(currentCallCount).toBeGreaterThan(5);
      
      // Compare with optimized threshold to show the difference
      const optimizedLimit = DEFAULT_THRESHOLDS.optimized.maxApiCalls;
      if (currentCallCount > optimizedLimit) {
        console.log(`📊 Exceeded optimized threshold by ${currentCallCount - optimizedLimit} calls`);
      }
    });

    it('should show performance impact of individual API calls', () => {
      const metrics = ApiPerformanceMonitor.calculateMetrics();
      
      console.log(`📈 Traditional metrics:`);
      console.log(`  • Total API calls: ${metrics.totalApiCalls}`);
      console.log(`  • Average call time: ${metrics.averageCallTime.toFixed(2)}ms`);
      console.log(`  • Unique endpoints accessed: ${metrics.uniqueEndpoints.length}`);
      
      // Demonstrate the efficiency difference
      const callsPerEndpoint = Object.values(metrics.callsByEndpoint);
      const duplicateCalls = callsPerEndpoint.filter(count => count > 1).length;
      
      if (duplicateCalls > 0) {
        console.log(`⚠️ Detected ${duplicateCalls} endpoints with duplicate calls`);
        console.log(`💡 Optimization opportunity: Use shared data to reduce redundancy`);
      }
    });
  });
});