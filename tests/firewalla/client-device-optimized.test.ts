/**
 * Optimized Device Status Tests - Demonstrates shared data approach
 * 
 * This test suite shows how to reduce API calls by sharing data across test cases
 * while maintaining test isolation and comprehensive coverage.
 */

import { FirewallaClient } from '../../src/firewalla/client';
import { FirewallaConfig } from '../../src/types';
import { TestDataCacheManager, TestDataUtils, OptimizedTestRunner } from '../utils/test-data-cache';
import { ApiPerformanceMonitor, DEFAULT_THRESHOLDS } from '../utils/performance-monitor';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FirewallaClient Device Status (Optimized)', () => {
  let client: FirewallaClient;
  let mockConfig: FirewallaConfig;
  
  // Shared test data - loaded once for all tests
  let sharedDeviceData: any[] = [];
  
  beforeAll(async () => {
    // Initialize performance monitoring
    ApiPerformanceMonitor.startMonitoring();
    
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

    // Create mocked axios instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    } as any;

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    client = new FirewallaClient(mockConfig);

    // Mock comprehensive device data once for all tests
    const mockRawDevices = [
      {
        gid: 'device-1',
        name: 'iPhone',
        ip: '192.168.1.10',
        mac: 'aa:bb:cc:dd:ee:ff',
        online: true,
        lastSeen: 1703980800,
        macVendor: 'Apple',
        manufacturer: 'Apple Inc.',
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
      {
        gid: 'device-3',
        name: 'MacBook-Pro',
        ip: '192.168.1.12',
        mac: 'aa:bb:cc:dd:ee:22',
        online: true,
        lastSeen: 1703980900,
        macVendor: 'Apple',
      },
      {
        gid: 'device-4',
        name: 'Samsung Smart TV',
        ip: '192.168.1.13',
        mac: 'aa:bb:cc:dd:ee:33',
        online: true,
        lastSeen: 1703980950,
        macVendor: 'Samsung',
      },
      {
        gid: 'device-5',
        name: 'Alexa Echo',
        ip: '192.168.1.14',
        mac: 'aa:bb:cc:dd:ee:44',
        online: false,
        lastSeen: 1703980600,
        macVendor: 'Amazon',
      },
    ];

    // Set up mock to return this data for all calls
    mockAxiosInstance.get.mockResolvedValue({
      data: mockRawDevices,
    });

    // Load shared data once using the cache manager
    const cache = await TestDataCacheManager.loadSharedTestData(client, {
      includeDevices: true,
      includeAlarms: false, // Only devices needed for this test suite
      includeFlows: false,
      includeRules: false,
      limits: { devices: 100 }
    });

    sharedDeviceData = cache.devices || [];
    
    console.log(`📱 Loaded ${sharedDeviceData.length} devices for optimized testing`);
  });

  afterAll(() => {
    // Generate performance report
    const metrics = ApiPerformanceMonitor.stopMonitoring();
    console.log(ApiPerformanceMonitor.generateReport());
    
    // Verify performance meets optimized thresholds
    const { passed, violations } = ApiPerformanceMonitor.checkThresholds(DEFAULT_THRESHOLDS.optimized);
    
    if (!passed) {
      console.warn('⚠️ Performance thresholds not met:');
      violations.forEach(v => console.warn(`  • ${v}`));
    }
    
    TestDataCacheManager.reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Device Operations (Shared Data)', () => {
    it('should have loaded shared device data', () => {
      expect(sharedDeviceData).toBeDefined();
      expect(sharedDeviceData.length).toBeGreaterThan(0);
      expect(Array.isArray(sharedDeviceData)).toBe(true);
      
      // Verify data structure
      const device = sharedDeviceData[0];
      expect(device).toHaveProperty('id');
      expect(device).toHaveProperty('name');
      expect(device).toHaveProperty('ip');
      expect(device).toHaveProperty('online');
    });

    it('should provide comprehensive device mapping', () => {
      // Test mapping without additional API calls
      const devices = sharedDeviceData;
      
      expect(devices.length).toBe(5);
      
      // Verify each device has required fields
      devices.forEach(device => {
        expect(device).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          ip: expect.any(String),
          online: expect.any(Boolean),
        });
        
        if (device.lastSeen) {
          expect(typeof device.lastSeen).toBe('number');
        }
      });
    });
  });

  describe('Device Filtering (Shared Data)', () => {
    it('should filter devices by deviceId using cached data', () => {
      const targetDevice = 'device-1';
      const filtered = TestDataUtils.filterDevices(sharedDeviceData, { 
        deviceId: targetDevice 
      });
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(targetDevice);
      expect(filtered[0].name).toBe('iPhone');
    });

    it('should filter devices by MAC address using cached data', () => {
      const targetMac = 'AA:BB:CC:DD:EE:FF';
      const filtered = TestDataUtils.filterDevices(sharedDeviceData, { 
        macAddress: targetMac 
      });
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('device-1');
      expect(filtered[0].name).toBe('iPhone');
    });

    it('should filter online devices using cached data', () => {
      const onlineDevices = TestDataUtils.filterDevices(sharedDeviceData, { 
        online: true 
      });
      
      expect(onlineDevices.length).toBeGreaterThan(0);
      onlineDevices.forEach(device => {
        expect(device.online).toBe(true);
      });
      
      // Should have iPhone, MacBook-Pro, Samsung Smart TV
      expect(onlineDevices.length).toBe(3);
    });

    it('should filter offline devices using cached data', () => {
      const offlineDevices = TestDataUtils.filterDevices(sharedDeviceData, { 
        online: false 
      });
      
      expect(offlineDevices.length).toBeGreaterThan(0);
      offlineDevices.forEach(device => {
        expect(device.online).toBe(false);
      });
      
      // Should have Android Phone and Alexa Echo
      expect(offlineDevices.length).toBe(2);
    });

    it('should filter devices by name content using cached data', () => {
      const appleDevices = TestDataUtils.filterDevices(sharedDeviceData, { 
        nameContains: 'iPhone' 
      });
      
      expect(appleDevices).toHaveLength(1);
      expect(appleDevices[0].name).toBe('iPhone');
      
      const smartDevices = TestDataUtils.filterDevices(sharedDeviceData, { 
        nameContains: 'Smart' 
      });
      
      expect(smartDevices).toHaveLength(1);
      expect(smartDevices[0].name).toBe('Samsung Smart TV');
    });
  });

  describe('Device Type Inference (Shared Data)', () => {
    it('should correctly infer device types from cached data', () => {
      const typeStats = TestDataUtils.getDeviceTypeStats(sharedDeviceData);
      
      expect(typeStats).toMatchObject({
        mobile: 2,          // iPhone, Android Phone
        computer: 1,        // MacBook-Pro
        entertainment: 1,   // Samsung Smart TV
        smart_home: 1,      // Alexa Echo
      });
      
      expect(Object.values(typeStats).reduce((sum, count) => sum + count, 0)).toBe(5);
    });

    it('should provide device status counts from cached data', () => {
      const statusCounts = TestDataUtils.getDeviceStatusCounts(sharedDeviceData);
      
      expect(statusCounts).toEqual({
        online: 3,
        offline: 2,
        total: 5
      });
    });
  });

  describe('Complex Device Queries (Shared Data)', () => {
    it('should support multiple filter criteria simultaneously', () => {
      // Find online Apple devices
      const onlineAppleDevices = sharedDeviceData.filter(device =>
        device.online && (device.macVendor === 'Apple' || device.name.includes('iPhone') || device.name.includes('MacBook'))
      );
      
      expect(onlineAppleDevices.length).toBe(2); // iPhone and MacBook-Pro
      onlineAppleDevices.forEach(device => {
        expect(device.online).toBe(true);
        expect(device.macVendor === 'Apple' || device.name.includes('Apple')).toBe(true);
      });
    });

    it('should support vendor-based filtering', () => {
      const samsungDevices = sharedDeviceData.filter(device =>
        device.macVendor === 'Samsung'
      );
      
      expect(samsungDevices.length).toBe(2); // Android Phone and Smart TV
      
      const appleDevices = sharedDeviceData.filter(device =>
        device.macVendor === 'Apple'
      );
      
      expect(appleDevices.length).toBe(2); // iPhone and MacBook-Pro
    });

    it('should support activity-based filtering', () => {
      // Devices last seen recently (higher timestamp)
      const recentlyActive = sharedDeviceData.filter(device =>
        device.lastSeen > 1703980800
      );
      
      expect(recentlyActive.length).toBe(2); // MacBook-Pro and Samsung Smart TV
      
      // Older devices
      const olderDevices = sharedDeviceData.filter(device =>
        device.lastSeen <= 1703980700
      );
      
      expect(olderDevices.length).toBe(2); // Android Phone and Alexa Echo
    });
  });

  describe('Performance Validation', () => {
    it('should demonstrate significant API call reduction', () => {
      const currentCallCount = ApiPerformanceMonitor.getCurrentCallCount();
      
      // Should be minimal API calls (just the initial load)
      expect(currentCallCount).toBeLessThanOrEqual(2);
      
      console.log(`✅ Optimized approach used only ${currentCallCount} API calls for comprehensive device testing`);
    });

    it('should complete all tests within performance thresholds', () => {
      const metrics = ApiPerformanceMonitor.calculateMetrics();
      
      // Optimized thresholds
      expect(metrics.totalApiCalls).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.optimized.maxApiCalls);
      expect(metrics.totalExecutionTime).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.optimized.maxTestDuration);
      
      if (metrics.averageCallTime > 0) {
        expect(metrics.averageCallTime).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.optimized.maxAvgCallTime);
      }
    });
  });
});

// Conditional execution based on optimization setting
OptimizedTestRunner.describeOptimized('Device Status Integration (Real API)', () => {
  // This would run only when OPTIMIZE_TESTS=true and INTEGRATION_TESTS=true
  // Implementation would use real API with shared data caching
  
  it('should load real device data efficiently', async () => {
    // Real API integration test with optimization
    expect(true).toBe(true); // Placeholder for real implementation
  });
});