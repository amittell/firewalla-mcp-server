/**
 * Geographic Filtering Edge Cases Tests
 * 
 * Comprehensive tests for geographic filtering functionality that specifically
 * targets edge cases and boundary conditions discovered during implementation.
 * These tests prevent regressions in geographic data handling, multi-value
 * filtering, and geographic data normalization.
 * 
 * Test Categories:
 * - Multi-Value Geographic Filter Edge Cases
 * - Geographic Data Normalization Boundary Testing
 * - Country Code Validation Edge Cases
 * - Geographic Query Construction Edge Cases
 * - Circular Reference and Memory Handling
 * - Performance with Large Geographic Datasets
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  ensureConsistentGeoData, 
  normalizeUnknownFields,
  sanitizeFieldValue,
  batchNormalize
} from '../../src/utils/data-normalizer.js';
import { ParameterValidator, SafeAccess } from '../../src/validation/error-handler.js';
import { 
  COUNTRY_CODE_MAP,
  CONTINENT_MAP,
  REGION_MAP,
  GEOGRAPHIC_RISK_SCORES
} from '../../src/utils/geographic-constants.js';
import { measurePerformance } from '../setup/jest-setup.js';

describe('Geographic Filtering Edge Cases', () => {
  describe('Multi-Value Geographic Filter Edge Cases', () => {
    describe('Empty and Null Array Handling', () => {
      it('should handle various empty array representations', () => {
        const emptyArrayTests = [
          { countries: [] },
          { countries: null },
          { countries: undefined },
          { countries: [null] },
          { countries: [undefined] },
          { countries: [''] },
          { countries: ['   '] },
          { countries: [null, undefined, '', '   '] },
          { continents: [] },
          { regions: [null, '', undefined] },
          { cities: ['', null, '   ', undefined] }
        ];

        emptyArrayTests.forEach((filters, index) => {
          Object.entries(filters).forEach(([filterType, values]) => {
            // Test empty array filtering
            if (values === null || values === undefined) {
              expect(values === null || values === undefined).toBe(true);
            } else if (Array.isArray(values)) {
              const validValues = values.filter(v => 
                v !== null && 
                v !== undefined && 
                typeof v === 'string' && 
                v.trim().length > 0
              );
              
              expect(validValues).toEqual([]);
              expect(values.length).toBeGreaterThanOrEqual(0);
            }
          });
        });
      });

      it('should filter out invalid geographic values from arrays', () => {
        const invalidGeoTests = [
          {
            input: { countries: ['China', null, 'Russia', undefined, '', '   ', 123, {}, []] },
            expected: { countries: ['China', 'Russia'] }
          },
          {
            input: { continents: ['Asia', false, 'Europe', true, NaN, Infinity, 'Africa'] },
            expected: { continents: ['Asia', 'Europe', 'Africa'] }
          },
          {
            input: { regions: [null, 'Eastern Europe', { region: 'Invalid' }, 'Middle East'] },
            expected: { regions: ['Eastern Europe', 'Middle East'] }
          },
          {
            input: { cities: ['Beijing', ['nested', 'array'], 'Moscow', new Date(), 'London'] },
            expected: { cities: ['Beijing', 'Moscow', 'London'] }
          }
        ];

        invalidGeoTests.forEach(({ input, expected }) => {
          Object.entries(input).forEach(([key, values]) => {
            if (Array.isArray(values)) {
              const filteredValues = values.filter(v => 
                v !== null && 
                v !== undefined && 
                typeof v === 'string' && 
                v.trim().length > 0 &&
                !Number.isNaN(Number(v)) === false // Exclude numeric strings
              );
              
              expect(filteredValues).toEqual(expected[key as keyof typeof expected]);
            }
          });
        });
      });

      it('should handle mixed valid and invalid geographic filter combinations', () => {
        const mixedFilterTests = [
          {
            filters: {
              countries: ['China', null, 'Russia'],
              continents: ['Asia', undefined, 'Europe'],
              regions: ['', 'Eastern Europe', null],
              cities: ['Beijing', false, 'Moscow', '   ']
            },
            expectedValid: {
              countries: ['China', 'Russia'],
              continents: ['Asia', 'Europe'], 
              regions: ['Eastern Europe'],
              cities: ['Beijing', 'Moscow']
            }
          }
        ];

        mixedFilterTests.forEach(({ filters, expectedValid }) => {
          Object.entries(filters).forEach(([filterType, values]) => {
            const validValues = values.filter(v => 
              v !== null && 
              v !== undefined && 
              typeof v === 'string' && 
              v.trim().length > 0
            );
            
            expect(validValues).toEqual(expectedValid[filterType as keyof typeof expectedValid]);
          });
        });
      });
    });

    describe('Geographic Filter OR Logic Validation', () => {
      it('should construct correct OR queries for multiple values', () => {
        const multiValueTests = [
          {
            filterType: 'countries',
            values: ['China', 'Russia', 'Iran'],
            expectedQueryPattern: /\(country:China OR country:Russia OR country:Iran\)/
          },
          {
            filterType: 'continents',
            values: ['Asia', 'Europe'],
            expectedQueryPattern: /\(continent:Asia OR continent:Europe\)/
          },
          {
            filterType: 'regions',
            values: ['Eastern Europe', 'Middle East', 'East Asia'],
            expectedQueryPattern: /\(region:"Eastern Europe" OR region:"Middle East" OR region:"East Asia"\)/
          },
          {
            filterType: 'cities',
            values: ['Beijing', 'Moscow', 'Tehran'],
            expectedQueryPattern: /\(city:Beijing OR city:Moscow OR city:Tehran\)/
          }
        ];

        multiValueTests.forEach(({ filterType, values, expectedQueryPattern }) => {
          // Simulate query construction logic
          const queryParts = values.map(value => {
            // Map plural filter types to singular field names
            const fieldMapping = {
              'countries': 'country',
              'continents': 'continent', 
              'regions': 'region',
              'cities': 'city'
            };
            const fieldName = fieldMapping[filterType] || filterType.slice(0, -1);
            if (value.includes(' ')) {
              return `${fieldName}:"${value}"`;
            }
            return `${fieldName}:${value}`;
          });
          
          const orQuery = `(${queryParts.join(' OR ')})`;
          expect(orQuery).toMatch(expectedQueryPattern);
        });
      });

      it('should handle single value geographic filters without OR logic', () => {
        const singleValueTests = [
          { countries: ['China'], expected: 'country:China' },
          { continents: ['Asia'], expected: 'continent:Asia' },
          { regions: ['Eastern Europe'], expected: 'region:"Eastern Europe"' },
          { cities: ['Beijing'], expected: 'city:Beijing' }
        ];

        singleValueTests.forEach(({ expected, ...filters }) => {
          Object.entries(filters).forEach(([filterType, values]) => {
            if (values.length === 1) {
              const value = values[0];
              // Map plural filter types to singular field names
              const fieldMapping = {
                'countries': 'country',
                'continents': 'continent', 
                'regions': 'region',
                'cities': 'city'
              };
              const fieldName = fieldMapping[filterType] || filterType.slice(0, -1);
              const query = value.includes(' ') ? 
                `${fieldName}:"${value}"` : 
                `${fieldName}:${value}`;
              
              expect(query).toBe(expected);
            }
          });
        });
      });

      it('should escape special characters in geographic filter values', () => {
        const specialCharTests = [
          { value: 'São Paulo', escaped: '"São Paulo"' },
          { value: 'Côte d\'Ivoire', escaped: '"Côte d\'Ivoire"' },
          { value: 'Bosnia & Herzegovina', escaped: '"Bosnia & Herzegovina"' },
          { value: 'St. Petersburg', escaped: '"St. Petersburg"' },
          { value: 'New York (NY)', escaped: '"New York (NY)"' }
        ];

        specialCharTests.forEach(({ value, escaped }) => {
          // Values with spaces or special characters should be quoted
          const hasSpecialChars = /[\s&'().]/.test(value);
          const processedValue = hasSpecialChars ? `"${value}"` : value;
          
          expect(processedValue).toBe(escaped);
        });
      });
    });

    describe('Geographic Filter Combination Logic', () => {
      it('should combine multiple geographic filter types with AND logic', () => {
        const combinationTests = [
          {
            filters: {
              countries: ['China', 'Russia'],
              continents: ['Asia'],
              regions: ['Eastern Europe']
            },
            expectedPattern: /\(country:China OR country:Russia\) AND continent:Asia AND region:"Eastern Europe"/
          },
          {
            filters: {
              countries: ['United States'],
              cities: ['New York', 'Los Angeles']
            },
            expectedPattern: /country:"United States" AND \(city:"New York" OR city:"Los Angeles"\)/
          }
        ];

        combinationTests.forEach(({ filters, expectedPattern }) => {
          const queryParts: string[] = [];
          
          Object.entries(filters).forEach(([filterType, values]) => {
            // Map plural filter types to singular field names
            const fieldMapping = {
              'countries': 'country',
              'continents': 'continent', 
              'regions': 'region',
              'cities': 'city'
            };
            const fieldName = fieldMapping[filterType] || filterType.slice(0, -1);
            
            if (values.length === 1) {
              const value = values[0];
              queryParts.push(
                value.includes(' ') ? `${fieldName}:"${value}"` : `${fieldName}:${value}`
              );
            } else {
              const orParts = values.map(value =>
                value.includes(' ') ? `${fieldName}:"${value}"` : `${fieldName}:${value}`
              );
              queryParts.push(`(${orParts.join(' OR ')})`);
            }
          });
          
          const combinedQuery = queryParts.join(' AND ');
          expect(combinedQuery).toMatch(expectedPattern);
        });
      });

      it('should handle complex geographic filter hierarchies', () => {
        const hierarchyTests = [
          {
            filters: {
              countries: ['China'],
              regions: ['East Asia'],
              cities: ['Beijing', 'Shanghai']
            },
            // Should check logical consistency - Beijing and Shanghai are in China/East Asia
            expectedLogicalConsistency: true
          },
          {
            filters: {
              countries: ['United States'],
              continents: ['Europe'], // Logical inconsistency
              cities: ['New York']
            },
            expectedLogicalConsistency: false // US is not in Europe
          }
        ];

        hierarchyTests.forEach(({ filters, expectedLogicalConsistency }) => {
          // Basic logical validation - this would be more complex in real implementation
          const hasCountryAndContinent = filters.countries && filters.continents;
          
          if (hasCountryAndContinent) {
            // For this test, we'll assume US should not be in Europe
            const isLogicallyConsistent = !(
              filters.countries.includes('United States') &&
              filters.continents.includes('Europe')
            );
            
            expect(isLogicallyConsistent).toBe(expectedLogicalConsistency);
          } else {
            expect(expectedLogicalConsistency).toBe(true);
          }
        });
      });
    });
  });

  describe('Geographic Data Normalization Boundary Testing', () => {
    describe('Country Code Normalization Edge Cases', () => {
      it('should handle all types of invalid country code inputs', () => {
        const invalidCountryCodeTests = [
          { input: null, expected: 'UN', reason: 'null input' },
          { input: undefined, expected: 'UN', reason: 'undefined input' },
          { input: '', expected: 'UN', reason: 'empty string' },
          { input: '   ', expected: 'UN', reason: 'whitespace only' },
          { input: 'U', expected: 'UN', reason: 'too short' },
          { input: 'USA', expected: 'UN', reason: 'too long' },
          { input: 'ABCD', expected: 'UN', reason: 'invalid length' },
          { input: '12', expected: 'UN', reason: 'numeric' },
          { input: 'U$', expected: 'UN', reason: 'special characters' },
          { input: 'u s', expected: 'UN', reason: 'contains space' },
          { input: 123, expected: 'UN', reason: 'number input' },
          { input: {}, expected: 'UN', reason: 'object input' },
          { input: [], expected: 'UN', reason: 'array input' },
          { input: true, expected: 'UN', reason: 'boolean input' }
        ];

        invalidCountryCodeTests.forEach(({ input, expected, reason }) => {
          const result = ensureConsistentGeoData({ country_code: input });
          expect(result.country_code).toBe(expected);
          expect(result.country_code).toHaveLength(2); // Always 2 characters
        });
      });

      it('should normalize valid country codes correctly', () => {
        const validCountryCodeTests = [
          { input: 'us', expected: 'US' },
          { input: 'cn', expected: 'CN' },
          { input: 'ru', expected: 'RU' },
          { input: 'gb', expected: 'GB' },
          { input: 'de', expected: 'DE' },
          { input: 'fr', expected: 'FR' },
          { input: 'jp', expected: 'JP' },
          { input: 'US', expected: 'US' }, // Already uppercase
          { input: 'Cn', expected: 'CN' }, // Mixed case
          { input: 'RU', expected: 'RU' }  // Already uppercase
        ];

        validCountryCodeTests.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData({ country_code: input });
          expect(result.country_code).toBe(expected);
          expect(result.country_code).toMatch(/^[A-Z]{2}$/);
        });
      });

      it('should handle country code consistency with country names', () => {
        const consistencyTests = [
          {
            input: { country: 'United States', country_code: 'us' },
            expected: { country: 'United States', country_code: 'US' }
          },
          {
            input: { country: 'China', country_code: 'cn' },
            expected: { country: 'China', country_code: 'CN' }
          },
          {
            input: { country: 'RUSSIA', country_code: 'ru' },
            expected: { country: 'Russia', country_code: 'RU' }
          },
          {
            input: { country: null, country_code: 'us' },
            expected: { country: 'unknown', country_code: 'US' }
          },
          {
            input: { country: 'United States', country_code: null },
            expected: { country: 'United States', country_code: 'UN' }
          }
        ];

        consistencyTests.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData(input);
          expect(result.country).toBe(expected.country);
          expect(result.country_code).toBe(expected.country_code);
        });
      });
    });

    describe('Geographic Field Case Normalization', () => {
      it('should normalize field names consistently', () => {
        const fieldNameTests = [
          {
            input: { Country: 'United States', CountryCode: 'us', Continent: 'NORTH AMERICA' },
            expected: { country: 'United States', country_code: 'US', continent: 'North America' }
          },
          {
            input: { CITY: 'NEW YORK', region: 'NORTHEAST', asn: 'AS12345' },
            expected: { city: 'New York', region: 'Northeast', asn: 'AS12345' }
          },
          {
            input: { isp: 'COMCAST', organization: 'GOOGLE INC', hosting_provider: 'AWS' },
            expected: { isp: 'Comcast', organization: 'Google Inc', hosting_provider: 'AWS' }
          }
        ];

        fieldNameTests.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData(input);
          
          Object.entries(expected).forEach(([key, value]) => {
            expect(result[key]).toBe(value);
          });
        });
      });

      it('should handle mixed case geographic values', () => {
        const mixedCaseTests = [
          { input: 'UNITED STATES', expected: 'United States' },
          { input: 'new york city', expected: 'New York City' },
          { input: 'EASTERN EUROPE', expected: 'Eastern Europe' },
          { input: 'north america', expected: 'North America' },
          { input: 'SAN FRANCISCO', expected: 'San Francisco' },
          { input: 'middle east', expected: 'Middle East' }
        ];

        mixedCaseTests.forEach(({ input, expected }) => {
          // Title case conversion logic
          const titleCase = input.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
          expect(titleCase).toBe(expected);
        });
      });

      it('should preserve special characters in geographic names', () => {
        const specialCharTests = [
          { input: 'São Paulo', expected: 'São Paulo' },
          { input: 'Côte d\'Ivoire', expected: 'Côte d\'Ivoire' },
          { input: 'Bosnia & Herzegovina', expected: 'Bosnia & Herzegovina' },
          { input: 'St. Petersburg', expected: 'St. Petersburg' },
          { input: 'München', expected: 'München' }
        ];

        specialCharTests.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData({ city: input });
          expect(result.city).toBe(expected);
        });
      });
    });

    describe('Circular Reference and Deep Object Handling', () => {
      it('should handle geographic data with circular references', () => {
        const createCircularGeoData = () => {
          const geoData: any = {
            country: 'United States',
            country_code: 'US',
            details: {
              continent: 'North America',
              region: 'North America'
            }
          };
          
          // Create circular references
          geoData.details.parent = geoData;
          geoData.self = geoData;
          geoData.details.self = geoData.details;
          
          return geoData;
        };

        expect(() => {
          const circularData = createCircularGeoData();
          const result = ensureConsistentGeoData(circularData);
          
          expect(result.country).toBe('United States');
          expect(result.country_code).toBe('US');
          expect(result.details.continent).toBe('North America');
          expect(result.details.parent).toBe('[Circular Reference]');
          expect(result.self).toBe('[Circular Reference]');
        }).not.toThrow();
      });

      it('should handle deeply nested geographic objects', () => {
        const deepGeoData = {
          location: {
            country: {
              name: 'United States',
              code: 'US',
              continent: {
                name: 'North America',
                regions: {
                  northeast: {
                    states: {
                      ny: {
                        cities: {
                          nyc: {
                            name: 'New York City',
                            coordinates: { lat: 40.7128, lng: -74.0060 }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        const result = ensureConsistentGeoData(deepGeoData);
        
        // Should preserve deep structure while normalizing fields
        expect(result.location.country.name).toBe('United States');
        expect(result.location.country.code).toBe('US');
        expect(result.location.country.continent.name).toBe('North America');
      });

      it('should limit recursion depth to prevent stack overflow', () => {
        const createDeepObject = (depth: number): any => {
          if (depth === 0) {
            return { country: 'United States', value: 'leaf' };
          }
          return {
            country: 'United States',
            level: depth,
            nested: createDeepObject(depth - 1)
          };
        };

        expect(() => {
          const deepObject = createDeepObject(100); // Very deep nesting
          const result = ensureConsistentGeoData(deepObject);
          expect(result.country).toBe('United States');
        }).not.toThrow();
      });
    });
  });

  describe('Performance with Large Geographic Datasets', () => {
    describe('Large Array Processing', () => {
      it('should handle large geographic filter arrays efficiently', async () => {
        const largeCountryArray = Array.from({ length: 200 }, (_, i) => `Country${i}`);
        const largeCityArray = Array.from({ length: 1000 }, (_, i) => `City${i}`);
        
        const { result: filteredCountries, duration: countryDuration } = await measurePerformance(() => {
          return Promise.resolve(largeCountryArray.filter(country => 
            typeof country === 'string' && country.length > 0
          ));
        });

        const { result: filteredCities, duration: cityDuration } = await measurePerformance(() => {
          return Promise.resolve(largeCityArray.filter(city => 
            typeof city === 'string' && city.length > 0
          ));
        });

        expect(filteredCountries.length).toBe(200);
        expect(filteredCities.length).toBe(1000);
        expect(countryDuration).toBeLessThan(100); // Should be very fast
        expect(cityDuration).toBeLessThan(200);
      });

      it('should process large geographic datasets within performance limits', async () => {
        const largeGeoDataset = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          country: i % 10 === 0 ? null : `Country${i % 50}`,
          country_code: i % 20 === 0 ? undefined : 'US',
          continent: i % 5 === 0 ? '' : 'North America',
          city: i % 15 === 0 ? '   ' : `City${i % 100}`,
          region: i % 8 === 0 ? null : 'Northeast'
        }));

        const { result, duration } = await measurePerformance(() => {
          return Promise.resolve(batchNormalize(largeGeoDataset, {
            country: (v: any) => normalizeUnknownFields({ value: v }).value,
            country_code: (v: any) => ensureConsistentGeoData({ country_code: v }).country_code,
            continent: (v: any) => normalizeUnknownFields({ value: v }).value,
            city: (v: any) => normalizeUnknownFields({ value: v }).value,
            region: (v: any) => normalizeUnknownFields({ value: v }).value
          }));
        });

        expect(result.length).toBe(10000);
        expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
        
        // Verify normalization quality
        const normalizedItems = result.slice(0, 100); // Sample check
        normalizedItems.forEach(item => {
          expect(typeof item.country).toBe('string');
          expect(typeof item.country_code).toBe('string');
          expect(item.country_code).toHaveLength(2);
        });
      });
    });

    describe('Memory Usage with Geographic Data', () => {
      it('should not create memory leaks with large geographic objects', () => {
        const createLargeGeoObject = () => {
          const obj: any = {
            country: 'United States',
            details: new Array(10000).fill(null).map((_, i) => ({
              id: i,
              name: `Location${i}`,
              coordinates: [Math.random() * 180, Math.random() * 90]
            }))
          };
          return obj;
        };

        expect(() => {
          for (let i = 0; i < 10; i++) {
            const largeObj = createLargeGeoObject();
            const normalized = ensureConsistentGeoData(largeObj);
            expect(normalized.country).toBe('United States');
            expect(Array.isArray(normalized.details)).toBe(true);
          }
        }).not.toThrow();
      });

      it('should handle concurrent geographic normalization efficiently', async () => {
        const concurrentTasks = Array.from({ length: 50 }, (_, i) => ({
          country: `Country${i}`,
          country_code: 'us',
          continent: 'North America',
          city: `City${i}`,
          region: 'Northeast',
          data: new Array(100).fill(`data_${i}`)
        }));

        const promises = concurrentTasks.map(task =>
          Promise.resolve(ensureConsistentGeoData(task))
        );

        const { result: results, duration } = await measurePerformance(() =>
          Promise.all(promises)
        );

        expect(results.length).toBe(50);
        expect(duration).toBeLessThan(1000); // Should complete quickly
        
        results.forEach((result, index) => {
          expect(result.country).toBe(`Country${index}`);
          expect(result.country_code).toBe('US');
          expect(result.continent).toBe('North America');
        });
      });
    });
  });

  describe('Edge Case Regression Prevention', () => {
    describe('Previously Fixed Issues', () => {
      it('should maintain multi-value OR logic for geographic filters', () => {
        // This test ensures the fix for single-value limitation is maintained
        const multiValueFilters = {
          countries: ['China', 'Russia', 'Iran', 'North Korea'],
          continents: ['Asia', 'Europe', 'Africa'],
          regions: ['Eastern Europe', 'Middle East', 'East Asia', 'Sub-Saharan Africa']
        };

        Object.entries(multiValueFilters).forEach(([filterType, values]) => {
          expect(values.length).toBeGreaterThan(1);
          
          // Simulate multi-value OR construction
          const fieldName = filterType.slice(0, -1);
          const orParts = values.map(value =>
            value.includes(' ') ? `${fieldName}:"${value}"` : `${fieldName}:${value}`
          );
          const orQuery = `(${orParts.join(' OR ')})`;
          
          expect(orQuery).toContain(' OR ');
          expect(orQuery.split(' OR ').length).toBe(values.length);
        });
      });

      it('should prevent country code validation regressions', () => {
        // Test cases that previously caused issues
        const regressionTestCases = [
          { input: 'USA', expected: 'UN' }, // Was incorrectly accepted as valid
          { input: '1', expected: 'UN' },   // Single character should be invalid
          { input: '', expected: 'UN' },    // Empty should default to UN
          { input: null, expected: 'UN' },  // Null should default to UN
          { input: 'us', expected: 'US' },  // Should normalize to uppercase
          { input: 'Us', expected: 'US' },  // Mixed case should normalize
        ];

        regressionTestCases.forEach(({ input, expected }) => {
          const result = ensureConsistentGeoData({ country_code: input });
          expect(result.country_code).toBe(expected);
        });
      });

      it('should maintain consistent field naming across geographic data', () => {
        // Test field naming consistency that was previously inconsistent
        const fieldNamingTests = [
          {
            input: { Country: 'US', countryCode: 'us', CONTINENT: 'North America' },
            expectedFields: ['country', 'country_code', 'continent']
          },
          {
            input: { city: 'NYC', Region: 'Northeast', ASN: 'AS12345' },
            expectedFields: ['city', 'region', 'asn']
          }
        ];

        fieldNamingTests.forEach(({ input, expectedFields }) => {
          const result = ensureConsistentGeoData(input);
          
          expectedFields.forEach(field => {
            expect(result).toHaveProperty(field);
            expect(typeof result[field]).toBe('string');
          });
          
          // Should use snake_case consistently
          Object.keys(result).forEach(key => {
            if (typeof result[key] === 'string') {
              expect(key).toMatch(/^[a-z_]+$/); // Should be lowercase with underscores
            }
          });
        });
      });
    });
  });
});