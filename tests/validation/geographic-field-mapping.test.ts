/**
 * Comprehensive unit tests for enhanced geographic field mappings
 * Tests geographic correlation fields, field extraction, and cross-reference capabilities
 */

import { 
  getFieldValue,
  extractCorrelationValues,
  isFieldCompatible,
  getCompatibleFields,
  normalizeFieldValue,
  CORRELATION_FIELDS,
  FIELD_MAPPINGS,
  EntityType
} from '../../src/validation/field-mapper.js';

describe('Geographic Field Mapping', () => {
  describe('Geographic Correlation Fields', () => {
    test('should include all enhanced geographic correlation fields', () => {
      const expectedGeoFields = [
        'geo_location',
        'asn',
        'country',
        'country_code',
        'continent',
        'region',
        'city',
        'timezone',
        'isp',
        'organization',
        'hosting_provider',
        'is_cloud_provider',
        'is_proxy',
        'is_vpn',
        'geographic_risk_score'
      ];

      expectedGeoFields.forEach(field => {
        expect(CORRELATION_FIELDS).toHaveProperty(field);
        expect(CORRELATION_FIELDS[field]).toContain('flows');
        expect(CORRELATION_FIELDS[field]).toContain('alarms');
      });
    });

    test('should correctly define entity compatibility for geographic fields', () => {
      expect(isFieldCompatible('country', ['flows', 'alarms'])).toBe(true);
      expect(isFieldCompatible('continent', ['flows', 'alarms'])).toBe(true);
      expect(isFieldCompatible('asn', ['flows', 'alarms'])).toBe(true);
      expect(isFieldCompatible('geographic_risk_score', ['flows', 'alarms'])).toBe(true);
      
      // Should not be compatible with rules, devices, target_lists
      expect(isFieldCompatible('country', ['rules'])).toBe(false);
      expect(isFieldCompatible('continent', ['devices'])).toBe(false);
      expect(isFieldCompatible('asn', ['target_lists'])).toBe(false);
    });

    test('should find compatible geographic fields between flows and alarms', () => {
      const compatibleFields = getCompatibleFields('flows', 'alarms');
      
      const expectedGeoFields = [
        'country', 'country_code', 'continent', 'region', 'city', 
        'timezone', 'isp', 'organization', 'hosting_provider',
        'is_cloud_provider', 'is_proxy', 'is_vpn', 'geographic_risk_score'
      ];

      expectedGeoFields.forEach(field => {
        expect(compatibleFields).toContain(field);
      });
    });
  });

  describe('Geographic Field Mappings', () => {
    describe('Flows entity geographic mappings', () => {
      test('should map country fields correctly', () => {
        const countryMappings = FIELD_MAPPINGS.flows.country;
        expect(countryMappings).toEqual([
          'geo.country', 'location.country', 'country', 'region'
        ]);
      });

      test('should map continent fields correctly', () => {
        const continentMappings = FIELD_MAPPINGS.flows.continent;
        expect(continentMappings).toEqual([
          'geo.continent', 'location.continent'
        ]);
      });

      test('should map ISP and organization fields correctly', () => {
        const ispMappings = FIELD_MAPPINGS.flows.isp;
        expect(ispMappings).toEqual([
          'geo.isp', 'location.isp', 'isp'
        ]);

        const orgMappings = FIELD_MAPPINGS.flows.organization;
        expect(orgMappings).toEqual([
          'geo.organization', 'location.organization', 'org'
        ]);
      });

      test('should map cloud provider and VPN fields correctly', () => {
        const cloudMappings = FIELD_MAPPINGS.flows.is_cloud_provider;
        expect(cloudMappings).toEqual([
          'geo.isCloud', 'location.isCloud', 'cloud'
        ]);

        const vpnMappings = FIELD_MAPPINGS.flows.is_vpn;
        expect(vpnMappings).toEqual([
          'geo.isVPN', 'location.isVPN', 'vpn'
        ]);
      });

      test('should map geographic risk score correctly', () => {
        const riskMappings = FIELD_MAPPINGS.flows.geographic_risk_score;
        expect(riskMappings).toEqual([
          'geo.riskScore', 'location.riskScore', 'geoRisk'
        ]);
      });
    });

    describe('Alarms entity geographic mappings', () => {
      test('should map country fields for alarms', () => {
        const countryMappings = FIELD_MAPPINGS.alarms.country;
        expect(countryMappings).toEqual([
          'geo.country', 'location.country', 'country', 'remote.country'
        ]);
      });

      test('should include remote geographic data paths', () => {
        const cityMappings = FIELD_MAPPINGS.alarms.city;
        expect(cityMappings).toContain('remote.city');

        const ispMappings = FIELD_MAPPINGS.alarms.isp;
        expect(ispMappings).toContain('remote.isp');

        const riskMappings = FIELD_MAPPINGS.alarms.geographic_risk_score;
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

  describe('Geographic Correlation Value Extraction', () => {
    test('should extract unique countries from flow results', () => {
      const flowResults = [
        { geo: { country: 'United States' }, source: { ip: '1.1.1.1' } },
        { geo: { country: 'China' }, source: { ip: '2.2.2.2' } },
        { geo: { country: 'United States' }, source: { ip: '3.3.3.3' } },
        { region: 'DE' }, // legacy format
        { source: { ip: '4.4.4.4' } } // no geo data
      ];

      const countries = extractCorrelationValues(flowResults, 'country', 'flows');
      expect(countries.size).toBe(3);
      expect(countries.has('united states')).toBe(true);
      expect(countries.has('china')).toBe(true);
      expect(countries.has('de')).toBe(true);
    });

    test('should extract ASN values from mixed data sources', () => {
      const mixedResults = [
        { geo: { asn: '12345' } },
        { asn: '67890' },
        { as_number: '11111' },
        { geo: { asn: '12345' } }, // duplicate
        {} // no ASN data
      ];

      const asns = extractCorrelationValues(mixedResults, 'asn', 'flows');
      expect(asns.size).toBe(3);
      expect(asns.has('12345')).toBe(true);
      expect(asns.has('67890')).toBe(true);
      expect(asns.has('11111')).toBe(true);
    });

    test('should extract boolean geographic flags', () => {
      const flagResults = [
        { geo: { isCloud: true } },
        { location: { isVPN: false } },
        { cloud: true },
        { vpn: true },
        {} // no flags
      ];

      const cloudValues = extractCorrelationValues(flagResults, 'is_cloud_provider', 'flows');
      const vpnValues = extractCorrelationValues(flagResults, 'is_vpn', 'flows');

      expect(cloudValues.has(true)).toBe(true);
      expect(vpnValues.has(false)).toBe(true);
      expect(vpnValues.has(true)).toBe(true);
    });
  });

  describe('Geographic Value Normalization', () => {
    test('should normalize country codes consistently', () => {
      expect(normalizeFieldValue('US', 'country')).toBe('us');
      expect(normalizeFieldValue('  CN  ', 'country_code')).toBe('cn');
      expect(normalizeFieldValue('United States', 'country')).toBe('united states');
    });

    test('should normalize ASN values', () => {
      expect(normalizeFieldValue('AS12345', 'asn')).toBe('AS12345');
      expect(normalizeFieldValue('12345', 'asn')).toBe('12345');
      expect(normalizeFieldValue('  AS67890  ', 'asn')).toBe('AS67890');
    });

    test('should handle boolean values', () => {
      expect(normalizeFieldValue(true, 'is_cloud_provider')).toBe(true);
      expect(normalizeFieldValue(false, 'is_vpn')).toBe(false);
      expect(normalizeFieldValue('true', 'is_proxy')).toBe('true');
    });

    test('should handle numeric risk scores', () => {
      expect(normalizeFieldValue(8, 'geographic_risk_score')).toBe(8);
      expect(normalizeFieldValue('7.5', 'geographic_risk_score')).toBe('7.5');
    });
  });

  describe('Geographic Cross-Reference Scenarios', () => {
    test('should support country-based correlation between flows and alarms', () => {
      const flowData = [
        { geo: { country: 'Russia' }, source: { ip: '1.1.1.1' } },
        { geo: { country: 'China' }, source: { ip: '2.2.2.2' } }
      ];

      const alarmData = [
        { remote: { country: 'Russia' }, severity: 'high' },
        { remote: { country: 'United States' }, severity: 'low' },
        { geo: { country: 'China' }, severity: 'critical' }
      ];

      const flowCountries = extractCorrelationValues(flowData, 'country', 'flows');
      const correlatedAlarms = alarmData.filter(alarm => {
        const country = getFieldValue(alarm, 'country', 'alarms');
        return country && flowCountries.has(normalizeFieldValue(country, 'country'));
      });

      expect(correlatedAlarms).toHaveLength(2);
      expect(correlatedAlarms.some(alarm => alarm.severity === 'high')).toBe(true);
      expect(correlatedAlarms.some(alarm => alarm.severity === 'critical')).toBe(true);
    });

    test('should support ASN-based threat correlation', () => {
      const flowData = [
        { geo: { asn: '12345' } },
        { asn: '67890' }
      ];

      const alarmData = [
        { remote: { asn: '12345' }, type: 'malware' },
        { remote: { asn: '11111' }, type: 'intrusion' },
        { geo: { asn: '67890' }, type: 'policy_violation' }
      ];

      const flowAsns = extractCorrelationValues(flowData, 'asn', 'flows');
      const correlatedThreats = alarmData.filter(alarm => {
        const asn = getFieldValue(alarm, 'asn', 'alarms');
        return asn && flowAsns.has(normalizeFieldValue(asn, 'asn'));
      });

      expect(correlatedThreats).toHaveLength(2);
      expect(correlatedThreats.some(threat => threat.type === 'malware')).toBe(true);
      expect(correlatedThreats.some(threat => threat.type === 'policy_violation')).toBe(true);
    });

    test('should support cloud provider correlation', () => {
      const flowData = [
        { geo: { isCloud: true }, source: { ip: '1.1.1.1' } },
        { location: { isCloud: false }, source: { ip: '2.2.2.2' } }
      ];

      const alarmData = [
        { remote: { cloud: true }, severity: 'medium' },
        { location: { isCloud: true }, severity: 'high' },
        { remote: { cloud: false }, severity: 'low' }
      ];

      const cloudFlows = extractCorrelationValues(flowData, 'is_cloud_provider', 'flows');
      const cloudAlarms = alarmData.filter(alarm => {
        const isCloud = getFieldValue(alarm, 'is_cloud_provider', 'alarms');
        return isCloud !== undefined && cloudFlows.has(isCloud);
      });

      expect(cloudAlarms).toHaveLength(3); // All should match as we have both true and false
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined geographic values', () => {
      const dataWithNulls = [
        { geo: { country: null } },
        { geo: { country: undefined } },
        { geo: { country: '' } },
        { geo: { country: 'US' } }
      ];

      const countries = extractCorrelationValues(dataWithNulls, 'country', 'flows');
      expect(countries.size).toBe(1);
      expect(countries.has('us')).toBe(true);
    });

    test('should handle malformed geographic data', () => {
      const malformedData = [
        { geo: 'not-an-object' },
        { geo: { country: 123 } },
        { geo: { country: ['array-value'] } },
        { geo: { country: 'Valid Country' } }
      ];

      const countries = extractCorrelationValues(malformedData, 'country', 'flows');
      expect(countries.size).toBeGreaterThanOrEqual(1);
      expect(countries.has('valid country')).toBe(true);
    });

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

    test('should handle empty entity arrays', () => {
      const emptyResults: any[] = [];
      const countries = extractCorrelationValues(emptyResults, 'country', 'flows');
      expect(countries.size).toBe(0);
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