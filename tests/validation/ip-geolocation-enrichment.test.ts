/**
 * Test suite to validate IP geolocation enrichment functionality
 * Tests the core geographic enrichment features added to FirewallaClient
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GeographicData } from '../../src/types.js';

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
      // Access private method for testing using type assertion
      const clientAny = client as any;
      
      // Private IP ranges that should be skipped
      expect(clientAny.isPrivateIP('192.168.1.1')).toBe(true);
      expect(clientAny.isPrivateIP('10.0.0.1')).toBe(true);
      expect(clientAny.isPrivateIP('172.16.0.1')).toBe(true);
      expect(clientAny.isPrivateIP('127.0.0.1')).toBe(true);
      expect(clientAny.isPrivateIP('169.254.1.1')).toBe(true);
      
      // Public IPs that should be geolocated
      expect(clientAny.isPrivateIP('8.8.8.8')).toBe(false);        // Google DNS
      expect(clientAny.isPrivateIP('1.1.1.1')).toBe(false);        // Cloudflare DNS
      expect(clientAny.isPrivateIP('208.67.222.222')).toBe(false); // OpenDNS
      expect(clientAny.isPrivateIP('74.125.224.72')).toBe(false);  // Google
    });
  });

  describe('Continent Mapping', () => {
    test('should map country codes to continents correctly', () => {
      const clientAny = client as any;
      
      // Test major continents
      expect(clientAny.mapContinent('US')).toBe('North America');
      expect(clientAny.mapContinent('CA')).toBe('North America');
      expect(clientAny.mapContinent('MX')).toBe('North America');
      
      expect(clientAny.mapContinent('BR')).toBe('South America');
      expect(clientAny.mapContinent('AR')).toBe('South America');
      
      expect(clientAny.mapContinent('GB')).toBe('Europe');
      expect(clientAny.mapContinent('DE')).toBe('Europe');
      expect(clientAny.mapContinent('FR')).toBe('Europe');
      
      expect(clientAny.mapContinent('CN')).toBe('Asia');
      expect(clientAny.mapContinent('JP')).toBe('Asia');
      expect(clientAny.mapContinent('IN')).toBe('Asia');
      
      expect(clientAny.mapContinent('AU')).toBe('Oceania');
      expect(clientAny.mapContinent('NZ')).toBe('Oceania');
      
      // Unknown country code should return Unknown
      expect(clientAny.mapContinent('XX')).toBe('Unknown');
    });
  });

  describe('Risk Score Calculation', () => {
    test('should calculate risk scores based on country and organization', () => {
      const clientAny = client as any;
      
      // High risk countries
      expect(clientAny.calculateRiskScore('CN')).toBeGreaterThanOrEqual(7);
      expect(clientAny.calculateRiskScore('RU')).toBeGreaterThanOrEqual(7);
      expect(clientAny.calculateRiskScore('KP')).toBeGreaterThanOrEqual(7);
      expect(clientAny.calculateRiskScore('IR')).toBeGreaterThanOrEqual(7);
      
      // Medium risk countries
      expect(clientAny.calculateRiskScore('PK')).toBeGreaterThanOrEqual(4);
      expect(clientAny.calculateRiskScore('BD')).toBeGreaterThanOrEqual(4);
      
      // Low risk countries
      expect(clientAny.calculateRiskScore('US')).toBeLessThan(6);
      expect(clientAny.calculateRiskScore('CA')).toBeLessThan(6);
      expect(clientAny.calculateRiskScore('GB')).toBeLessThan(6);
      
      // Cloud providers should have lower risk
      expect(clientAny.calculateRiskScore('CN', 'Amazon Web Services')).toBeLessThan(
        clientAny.calculateRiskScore('CN')
      );
      expect(clientAny.calculateRiskScore('US', 'Google LLC')).toBeLessThan(4);
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
    test('should handle geolocation errors gracefully', () => {
      const clientAny = client as any;
      
      // Mock geoip.lookup to throw an error
      const originalLookup = require('geoip-lite').lookup;
      require('geoip-lite').lookup = jest.fn().mockImplementation(() => {
        throw new Error('Mocked geoip error');
      });
      
      // Should not throw and should return null
      expect(() => {
        const result = clientAny.getGeographicData('8.8.8.8');
        expect(result).toBeNull();
      }).not.toThrow();
      
      // Restore original function
      require('geoip-lite').lookup = originalLookup;
    });
  });
});