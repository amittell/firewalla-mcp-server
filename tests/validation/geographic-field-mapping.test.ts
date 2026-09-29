/**
 * Comprehensive unit tests for enhanced geographic field mappings
 * Tests geographic correlation fields, field extraction, and cross-reference capabilities
 */

import { 
  getFieldValue,
  FIELD_MAPPINGS,
  EntityType
} from '../../src/validation/field-mapper.js';

describe('Geographic Field Mapping', () => {
  describe('Geographic Field Mappings', () => {
    describe('Flows entity geographic mappings', () => {
      test('should map country fields correctly', () => {
        const countryMappings = FIELD_MAPPINGS.flows.country;
        expect(countryMappings).toEqual([
          'destination.geo.country', 
          'source.geo.country',
          'geo.country', 
          'location.country', 
          'country', 
          'region'
        ]);
      });

      test('should map continent fields correctly', () => {
        const continentMappings = FIELD_MAPPINGS.flows.continent;
        expect(continentMappings).toEqual([
          'destination.geo.continent',
          'source.geo.continent',
          'geo.continent', 
          'location.continent'
        ]);
      });

      test('should map ISP and organization fields correctly', () => {
        const ispMappings = FIELD_MAPPINGS.flows.isp;
        expect(ispMappings).toEqual([
          'destination.geo.isp',
          'source.geo.isp',
          'geo.isp', 
          'location.isp', 
          'isp'
        ]);

        const orgMappings = FIELD_MAPPINGS.flows.organization;
        expect(orgMappings).toEqual([
          'destination.geo.organization',
          'source.geo.organization',
          'geo.organization', 
          'location.organization', 
          'org'
        ]);
      });

      test('should map cloud provider and VPN fields correctly', () => {
        const cloudMappings = FIELD_MAPPINGS.flows.is_cloud_provider;
        expect(cloudMappings).toEqual([
          'destination.geo.is_cloud_provider',
          'source.geo.is_cloud_provider',
          'geo.isCloud', 
          'location.isCloud', 
          'cloud'
        ]);

        const vpnMappings = FIELD_MAPPINGS.flows.is_vpn;
        expect(vpnMappings).toEqual([
          'destination.geo.is_vpn',
          'source.geo.is_vpn',
          'geo.isVPN', 
          'location.isVPN', 
          'vpn'
        ]);
      });

      test('should map geographic risk score correctly', () => {
        const riskMappings = FIELD_MAPPINGS.flows.geographic_risk_score;
        expect(riskMappings).toEqual([
          'destination.geo.geographic_risk_score',
          'source.geo.geographic_risk_score',
          'geo.riskScore', 
          'location.riskScore', 
          'geoRisk'
        ]);
      });
    });

    describe('Alarms entity geographic mappings', () => {
      test('should map country fields for alarms', () => {
        const countryMappings = FIELD_MAPPINGS.alarms.country;
        expect(countryMappings).toEqual([
          'remote.geo.country',
          'geo.country', 
          'location.country', 
          'country', 
          'remote.country'
        ]);
      });

      test('should include remote geographic data paths', () => {
        const cityMappings = FIELD_MAPPINGS.alarms.city;
        expect(cityMappings).toContain('remote.geo.city');
        expect(cityMappings).toContain('remote.city');

        const ispMappings = FIELD_MAPPINGS.alarms.isp;
        expect(ispMappings).toContain('remote.geo.isp');
        expect(ispMappings).toContain('remote.isp');

        const riskMappings = FIELD_MAPPINGS.alarms.geographic_risk_score;
        expect(riskMappings).toContain('remote.geo.geographic_risk_score');
        expect(riskMappings).toContain('remote.geoRisk');
      });
    });
  });

  describe('Geographic Field Value Extraction', () => {
    test('should extract country from flow data', () => {
      const flowData = {
        geo: {
          country: 'United States',
          countryCode: 'US'
        },
        source: { ip: '192.168.1.1' }
      };

      const country = getFieldValue(flowData, 'country', 'flows');
      expect(country).toBe('United States');

      const countryCode = getFieldValue(flowData, 'country_code', 'flows');
      expect(countryCode).toBe('US');
    });

    test('should extract geographic data from alarm remote info', () => {
      const alarmData = {
        remote: {
          country: 'China',
          city: 'Beijing',
          isp: 'China Telecom',
          geoRisk: 8
        },
        device: { ip: '192.168.1.1' }
      };

      const country = getFieldValue(alarmData, 'country', 'alarms');
      expect(country).toBe('China');

      const city = getFieldValue(alarmData, 'city', 'alarms');
      expect(city).toBe('Beijing');

      const isp = getFieldValue(alarmData, 'isp', 'alarms');
      expect(isp).toBe('China Telecom');

      const riskScore = getFieldValue(alarmData, 'geographic_risk_score', 'alarms');
      expect(riskScore).toBe(8);
    });

    test('should handle alternative field paths', () => {
      const flowWithLocation = {
        location: {
          country: 'Germany',
          continent: 'Europe',
          isCloud: true
        }
      };

      const country = getFieldValue(flowWithLocation, 'country', 'flows');
      expect(country).toBe('Germany');

      const continent = getFieldValue(flowWithLocation, 'continent', 'flows');
      expect(continent).toBe('Europe');

      const isCloud = getFieldValue(flowWithLocation, 'is_cloud_provider', 'flows');
      expect(isCloud).toBe(true);
    });

    test('should handle legacy region field mapping', () => {
      const flowWithRegion = {
        region: 'US'
      };

      const country = getFieldValue(flowWithRegion, 'country', 'flows');
      expect(country).toBe('US');
    });

    test('should return undefined for missing geographic data', () => {
      const flowWithoutGeo = {
        source: { ip: '192.168.1.1' },
        protocol: 'tcp'
      };

      const country = getFieldValue(flowWithoutGeo, 'country', 'flows');
      expect(country).toBeUndefined();

      const continent = getFieldValue(flowWithoutGeo, 'continent', 'flows');
      expect(continent).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle deeply nested geographic paths', () => {
      const deeplyNested = {
        deep: {
          geo: {
            location: {
              country: 'Nested Country'
            }
          }
        }
      };

      // Should return undefined for unmapped deep paths
      const country = getFieldValue(deeplyNested, 'country', 'flows');
      expect(country).toBeUndefined();
    });

    test('should handle unknown entity types gracefully', () => {
      const flowData = { geo: { country: 'US' } };
      
      // Should not throw for unknown entity type
      expect(() => {
        getFieldValue(flowData, 'country', 'unknown' as EntityType);
      }).not.toThrow();
    });
  });
});