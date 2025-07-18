/**
 * Test suite to validate IP geolocation enrichment functionality
 * Tests the core geographic enrichment features added to FirewallaClient
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GeographicData } from '../../src/types.js';
import {
  isPrivateIP,
  mapContinent,
  calculateRiskScore,
  getGeographicDataForIP,
} from '../../src/utils/geographic.js';

// Mock axios completely
jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(() => ({
      interceptors: {
        request: {
          use: jest.fn()
        },
        response: {
          use: jest.fn()
        }
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    })),
    interceptors: {
      request: {
        use: jest.fn()
      },
      response: {
        use: jest.fn()
      }
    }
  };
  return mockAxios;
});

// Create a test configuration
const testConfig = {
  mspToken: 'test-token',
  mspId: 'test.firewalla.net',
  boxId: 'test-box-123',
  apiTimeout: 30000,
  rateLimit: 100,
  cacheTtl: 300,
  defaultPageSize: 100,
  maxPageSize: 10000,
};

describe('IP Geolocation Enrichment', () => {
  let client: FirewallaClient;

  beforeEach(() => {
    client = new FirewallaClient(testConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clear geographic cache between tests
    if (client && client.clearGeographicCache) {
      client.clearGeographicCache();
    }
  });

  describe('Geographic Cache Management', () => {
    test('should initialize geographic cache', () => {
      const stats = client.getGeographicCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(10000);
      expect(stats.hitRate).toBe(0);
    });

    test('should clear geographic cache', () => {
      // Cache should be empty initially
      const initialStats = client.getGeographicCacheStats();
      expect(initialStats.size).toBe(0);

      client.clearGeographicCache();
      
      const clearedStats = client.getGeographicCacheStats();
      expect(clearedStats.size).toBe(0);
      expect(clearedStats.hitCount).toBe(0);
      expect(clearedStats.missCount).toBe(0);
    });
  });

  describe('Private IP Detection', () => {
    test('should detect private IP ranges correctly', () => {
      // Test using the utility function directly instead of private method
      
      // Private IP ranges that should be skipped
      expect(isPrivateIP('192.168.1.1')).toBe(true);
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('169.254.1.1')).toBe(true);
      
      // Public IPs that should be geolocated
      expect(isPrivateIP('8.8.8.8')).toBe(false);        // Google DNS
      expect(isPrivateIP('1.1.1.1')).toBe(false);        // Cloudflare DNS
      expect(isPrivateIP('208.67.222.222')).toBe(false); // OpenDNS
      expect(isPrivateIP('74.125.224.72')).toBe(false);  // Google
    });
  });

  describe('Continent Mapping', () => {
    test('should map country codes to continents correctly', () => {
      // Test using the utility function directly
      
      // Test major continents
      expect(mapContinent('US')).toBe('North America');
      expect(mapContinent('CA')).toBe('North America');
      expect(mapContinent('MX')).toBe('North America');
      
      expect(mapContinent('BR')).toBe('South America');
      expect(mapContinent('AR')).toBe('South America');
      
      expect(mapContinent('GB')).toBe('Europe');
      expect(mapContinent('DE')).toBe('Europe');
      expect(mapContinent('FR')).toBe('Europe');
      
      expect(mapContinent('CN')).toBe('Asia');
      expect(mapContinent('JP')).toBe('Asia');
      expect(mapContinent('IN')).toBe('Asia');
      
      expect(mapContinent('AU')).toBe('Oceania');
      expect(mapContinent('NZ')).toBe('Oceania');
      
      // Unknown country code should return Unknown
      expect(mapContinent('XX')).toBe('Unknown');
    });
  });

  describe('Risk Score Calculation', () => {
    test('should calculate risk scores based on country and organization', () => {
      // Test using the utility function directly
      
      // High risk countries
      expect(calculateRiskScore('CN')).toBeGreaterThanOrEqual(7);
      expect(calculateRiskScore('RU')).toBeGreaterThanOrEqual(7);
      expect(calculateRiskScore('KP')).toBeGreaterThanOrEqual(7);
      expect(calculateRiskScore('IR')).toBeGreaterThanOrEqual(7);
      
      // Medium risk countries
      expect(calculateRiskScore('PK')).toBeGreaterThanOrEqual(4);
      expect(calculateRiskScore('BD')).toBeGreaterThanOrEqual(4);
      
      // Low risk countries
      expect(calculateRiskScore('US')).toBeLessThan(6);
      expect(calculateRiskScore('CA')).toBeLessThan(6);
      expect(calculateRiskScore('GB')).toBeLessThan(6);
      
      // Unknown countries should get default score
      expect(calculateRiskScore('XX')).toBe(5);
    });
  });

  describe('Geographic Data Enrichment', () => {
    test('should enrich flows with geographic data for public IPs', () => {
      const clientAny = client as any;
      
      const mockFlow = {
        ts: 1672531200,
        gid: 'test-box-1',
        protocol: 'tcp',
        direction: 'outbound' as const,
        block: false,
        bytes: 1024,
        count: 1,
        device: {
          id: 'device-1',
          ip: '192.168.1.100', // Private IP - should not be enriched
          name: 'Test Device'
        },
        destination: {
          id: 'dest-1',
          ip: '8.8.8.8', // Public IP - should be enriched
          name: 'Google DNS'
        },
        source: {
          id: 'src-1',
          ip: '192.168.1.100', // Private IP - should not be enriched
          name: 'Test Source'
        }
      };

      const enrichedFlow = clientAny.enrichWithGeographicData(mockFlow);

      // Should have enriched destination but not source (private IP)
      expect(enrichedFlow.destination.geo).toBeDefined();
      expect(enrichedFlow.destination.geo.country).toBe('US');
      expect(enrichedFlow.destination.geo.continent).toBe('North America');
      expect(enrichedFlow.source.geo).toBeUndefined();
    });

    test('should enrich alarms with geographic data for public IPs', () => {
      const clientAny = client as any;
      
      const mockAlarm = {
        ts: 1672531200,
        gid: 'test-box-1',
        aid: 123,
        type: 1,
        status: 1,
        message: 'Test alarm',
        direction: 'inbound',
        protocol: 'tcp',
        remote: {
          id: 'remote-1',
          ip: '8.8.8.8', // Google DNS - should be enriched
          name: 'Google DNS'
        }
      };

      const enrichedAlarm = clientAny.enrichAlarmWithGeographicData(mockAlarm);

      // Should have enriched remote IP
      expect(enrichedAlarm.remote.geo).toBeDefined();
      expect(enrichedAlarm.remote.geo.country).toBe('US');
      expect(enrichedAlarm.remote.geo.continent).toBe('North America');
    });

    test('should not enrich private IPs', () => {
      const clientAny = client as any;
      
      const mockFlow = {
        destination: {
          ip: '192.168.1.1', // Private IP
          name: 'Internal Server'
        },
        source: {
          ip: '10.0.0.1', // Private IP
          name: 'Internal Client'
        }
      };

      const enrichedFlow = clientAny.enrichWithGeographicData(mockFlow);

      // Should not have geographic data for private IPs
      expect(enrichedFlow.destination.geo).toBeUndefined();
      expect(enrichedFlow.source.geo).toBeUndefined();
    });
  });

  describe('Geographic Data Structure', () => {
    test('should create properly structured geographic data', () => {
      const clientAny = client as any;
      
      // Test with a known public IP (this will use the actual geoip-lite lookup)
      const geoData = clientAny.getGeographicData('8.8.8.8');
      
      if (geoData) {
        // Validate structure
        expect(geoData).toHaveProperty('country');
        expect(geoData).toHaveProperty('country_code');
        expect(geoData).toHaveProperty('continent');
        expect(geoData).toHaveProperty('region');
        expect(geoData).toHaveProperty('city');
        expect(geoData).toHaveProperty('timezone');
        expect(geoData).toHaveProperty('geographic_risk_score');
        
        // Validate types
        expect(typeof geoData.country).toBe('string');
        expect(typeof geoData.country_code).toBe('string');
        expect(typeof geoData.continent).toBe('string');
        expect(typeof geoData.geographic_risk_score).toBe('number');
        
        // Google DNS should resolve to US
        expect(geoData.country_code).toBe('US');
        expect(geoData.continent).toBe('North America');
        expect(geoData.geographic_risk_score).toBeGreaterThanOrEqual(0);
        expect(geoData.geographic_risk_score).toBeLessThanOrEqual(10);
      }
    });

    test('should return null for private IPs', () => {
      const clientAny = client as any;
      
      // Private IPs should return null
      expect(clientAny.getGeographicData('192.168.1.1')).toBeNull();
      expect(clientAny.getGeographicData('10.0.0.1')).toBeNull();
      expect(clientAny.getGeographicData('172.16.0.1')).toBeNull();
    });

    test('should return null for invalid IPs', () => {
      const clientAny = client as any;
      
      // Invalid IPs should return null
      expect(clientAny.getGeographicData('999.999.999.999')).toBeNull();
      expect(clientAny.getGeographicData('not.an.ip.address')).toBeNull();
      expect(clientAny.getGeographicData('')).toBeNull();
    });
  });

  describe('Cache Performance', () => {
    test('should cache geographic lookups to improve performance', () => {
      const clientAny = client as any;
      
      // First lookup - should be cached
      const firstLookup = clientAny.getGeographicData('8.8.8.8');
      
      // Second lookup - should come from cache
      const secondLookup = clientAny.getGeographicData('8.8.8.8');
      
      // Results should be identical
      expect(firstLookup).toEqual(secondLookup);
      
      // Cache stats should show entries
      const stats = client.getGeographicCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(1);
      
      // If we got valid data, we should have a cache hit
      if (firstLookup) {
        expect(stats.hitCount).toBeGreaterThan(0);
      }
    });

    test('should cache null results for private IPs', () => {
      const clientAny = client as any;
      
      // Lookup private IP multiple times
      const result1 = clientAny.getGeographicData('192.168.1.1');
      const result2 = clientAny.getGeographicData('192.168.1.1');
      const result3 = clientAny.getGeographicData('192.168.1.1');
      
      // All should be null
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
      
      // Should be cached (even null results)
      const stats = client.getGeographicCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(1);
      expect(stats.hitCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid IPs gracefully', () => {
      // Test with clearly invalid IPs
      const result1 = getGeographicDataForIP('invalid-ip');
      const result2 = getGeographicDataForIP('999.999.999.999');
      const result3 = getGeographicDataForIP('');
      
      // Should return default data or null for invalid IPs
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });
});