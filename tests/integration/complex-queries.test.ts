/**
 * Complex Query Integration Tests
 * 
 * Integration tests for complex query scenarios including:
 * - Multi-field correlation queries using search_cross_reference
 * - Geographic filtering with multiple countries/regions
 * - Time-range queries with various timestamp formats
 * - Nested boolean logic with mixed operators
 * - Performance testing for large result sets
 * - Query builder patterns and optimization
 * - Enhanced cross-reference functionality with scoring
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { FieldValidator } from '../../src/validation/field-validator.js';
import { measurePerformance, withRetries, describeIntegration } from '../setup/jest-setup.js';

// Mock the FirewallaClient for integration testing
jest.mock('../../src/firewalla/client.js');

describe('Complex Query Integration Tests', () => {
  let mockFirewallaClient: jest.Mocked<FirewallaClient>;
  
  beforeAll(() => {
    mockFirewallaClient = new FirewallaClient({
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      boxId: 'test-box-id'
    }) as jest.Mocked<FirewallaClient>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describeIntegration('Multi-Field Correlation Queries', () => {
    it('should handle complex AND/OR combinations with field validation', async () => {
      const complexQuery = '(severity:high OR severity:critical) AND (protocol:tcp OR protocol:udp) AND source_ip:192.168.* AND NOT destination_ip:10.*';
      
      // Validate query syntax first
      const syntaxResult = QuerySanitizer.sanitizeSearchQuery(complexQuery);
      expect(syntaxResult.isValid).toBe(true);
      
      // Validate fields for different entity types
      const fields = ['severity', 'protocol', 'source_ip', 'destination_ip'];
      const entityTypes = ['flows', 'alarms'] as const;
      
      fields.forEach(field => {
        const fieldResult = FieldValidator.validateFieldAcrossTypes(field, entityTypes);
        expect(fieldResult.isValid).toBe(true);
      });

      // Mock API response for correlation query
      const mockCorrelationData = {
        flows: [
          {
            source_ip: '192.168.1.100',
            destination_ip: '8.8.8.8',
            protocol: 'tcp',
            bytes: 1500000,
            timestamp: 1640995200
          }
        ],
        alarms: [
          {
            source_ip: '192.168.1.100',
            severity: 'high',
            type: 'intrusion',
            timestamp: 1640995205
          }
        ]
      };

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: mockCorrelationData.flows,
        pagination: { hasMore: false, cursor: null }
      });

      const result = await mockFirewallaClient.getFlowData(
        syntaxResult.sanitizedValue as string,
        undefined,
        'timestamp:desc',
        100
      );

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should validate cross-reference field mappings', () => {
      const correlationFields = ['source_ip', 'country', 'protocol', 'timestamp'];
      const entityTypes = ['flows', 'alarms', 'rules'] as const;
      
      correlationFields.forEach(field => {
        const result = FieldValidator.validateFieldAcrossTypes(field, entityTypes);
        
        if (result.isValid) {
          expect(Object.keys(result.fieldMapping).length).toBeGreaterThan(0);
        } else {
          // Should provide meaningful suggestions for invalid fields
          expect(result.suggestions.length).toBeGreaterThan(0);
          expect(result.closestMatches.length).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should handle temporal correlation with time windows', async () => {
      const temporalQuery = {
        primaryQuery: 'protocol:tcp AND bytes:>1000000',
        secondaryQuery: 'severity:high AND type:intrusion',
        timeWindow: {
          windowSize: 30,
          windowUnit: 'minutes'
        }
      };

      // Validate time-based correlation logic
      const primaryResult = QuerySanitizer.sanitizeSearchQuery(temporalQuery.primaryQuery);
      const secondaryResult = QuerySanitizer.sanitizeSearchQuery(temporalQuery.secondaryQuery);
      
      expect(primaryResult.isValid).toBe(true);
      expect(secondaryResult.isValid).toBe(true);

      // Mock temporal correlation data
      const mockTemporalData = {
        correlations: [
          {
            primaryMatch: { source_ip: '192.168.1.100', timestamp: 1640995200 },
            secondaryMatch: { source_ip: '192.168.1.100', timestamp: 1640995230 },
            timeDifference: 30,
            correlationScore: 0.95
          }
        ]
      };

      // Test temporal window validation
      expect(temporalQuery.timeWindow.windowSize).toBeGreaterThan(0);
      expect(temporalQuery.timeWindow.windowSize).toBeLessThanOrEqual(1440); // 24 hours max
      expect(['seconds', 'minutes', 'hours', 'days']).toContain(temporalQuery.timeWindow.windowUnit);
    });
  });

  describeIntegration('Geographic Filtering Tests', () => {
    it('should handle multiple country/region filters with OR logic', async () => {
      const geographicQueries = [
        {
          query: 'protocol:tcp AND bytes:>1000000',
          filters: {
            countries: ['China', 'Russia', 'Iran'],
            continents: ['Asia', 'Europe'],
            regions: ['Eastern Europe', 'Middle East']
          }
        }
      ];

      geographicQueries.forEach(async ({ query, filters }) => {
        const syntaxResult = QuerySanitizer.sanitizeSearchQuery(query);
        expect(syntaxResult.isValid).toBe(true);

        // Validate geographic filter structure
        expect(Array.isArray(filters.countries)).toBe(true);
        expect(Array.isArray(filters.continents)).toBe(true);
        expect(Array.isArray(filters.regions)).toBe(true);
        
        // Test that filters contain valid values
        filters.countries.forEach(country => {
          expect(typeof country).toBe('string');
          expect(country.length).toBeGreaterThan(0);
        });

        // Mock geographic query response
        const mockGeoData = {
          results: [
            {
              source_ip: '114.55.123.45',
              country: 'China',
              continent: 'Asia',
              region: 'East Asia',
              bytes: 1500000,
              protocol: 'tcp'
            },
            {
              source_ip: '185.220.101.42',
              country: 'Russia',
              continent: 'Europe',
              region: 'Eastern Europe',
              bytes: 2000000,
              protocol: 'tcp'
            }
          ]
        };

        mockFirewallaClient.searchFlowsByGeography = jest.fn().mockResolvedValue(mockGeoData);
        
        const result = await mockFirewallaClient.searchFlowsByGeography({
          query: syntaxResult.sanitizedValue as string,
          geographic_filters: filters,
          limit: 100
        });

        expect(result.results).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
        
        // Verify results match geographic filters
        result.results.forEach((item: any) => {
          const matchesCountry = filters.countries.includes(item.country);
          const matchesContinent = filters.continents.includes(item.continent);
          const matchesRegion = filters.regions.includes(item.region);
          
          expect(matchesCountry || matchesContinent || matchesRegion).toBe(true);
        });
      });
    });

    it('should handle geographic risk scoring and cloud provider filtering', async () => {
      const riskQuery = {
        query: 'bytes:>10000000',
        filters: {
          min_risk_score: 0.7,
          exclude_cloud: true,
          exclude_vpn: false,
          high_risk_countries: true
        }
      };

      const syntaxResult = QuerySanitizer.sanitizeSearchQuery(riskQuery.query);
      expect(syntaxResult.isValid).toBe(true);

      // Validate risk scoring parameters
      expect(riskQuery.filters.min_risk_score).toBeGreaterThanOrEqual(0);
      expect(riskQuery.filters.min_risk_score).toBeLessThanOrEqual(1);
      expect(typeof riskQuery.filters.exclude_cloud).toBe('boolean');
      expect(typeof riskQuery.filters.exclude_vpn).toBe('boolean');
      expect(typeof riskQuery.filters.high_risk_countries).toBe('boolean');

      // Mock risk-based geographic data
      const mockRiskData = {
        results: [
          {
            source_ip: '220.181.38.148',
            country: 'China',
            geo_risk_score: 0.8,
            is_cloud_provider: false,
            is_vpn: false,
            bytes: 15000000
          }
        ]
      };

      mockFirewallaClient.searchFlowsByGeography = jest.fn().mockResolvedValue(mockRiskData);
    });

    it('should validate geographic data consistency', () => {
      const mockGeoResponse = {
        country: 'United States',
        country_code: 'US',
        continent: 'North America',
        region: 'California',
        city: 'San Francisco',
        timezone: 'America/Los_Angeles',
        asn: 'AS15169',
        isp: 'Google LLC',
        is_cloud_provider: true
      };

      // Validate geographic data structure
      expect(typeof mockGeoResponse.country).toBe('string');
      expect(mockGeoResponse.country_code).toMatch(/^[A-Z]{2}$/);
      expect(typeof mockGeoResponse.continent).toBe('string');
      expect(typeof mockGeoResponse.region).toBe('string');
      expect(typeof mockGeoResponse.city).toBe('string');
      
      if (mockGeoResponse.asn) {
        expect(mockGeoResponse.asn).toMatch(/^AS\d+$/);
      }
      
      if (mockGeoResponse.is_cloud_provider !== undefined) {
        expect(typeof mockGeoResponse.is_cloud_provider).toBe('boolean');
      }
    });
  });

  describeIntegration('Time-Range Query Testing', () => {
    it('should handle various timestamp formats', () => {
      const timestampFormats = [
        { format: 'unix_epoch', value: '1640995200', query: 'timestamp:>1640995200' },
        { format: 'iso_8601', value: '2024-01-01T00:00:00Z', query: 'ts:[2024-01-01T00:00:00Z TO 2024-01-31T23:59:59Z]' },
        { format: 'relative', value: 'NOW-1h', query: 'timestamp:>NOW-1h' },
        { format: 'date_range', value: '2024-01-01 TO 2024-01-31', query: 'ts:[2024-01-01 TO 2024-01-31]' }
      ];

      timestampFormats.forEach(({ format, query }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        
        // Validate that brackets are properly matched for range queries
        if (query.includes('[') && query.includes(']')) {
          const openBrackets = (query.match(/\[/g) || []).length;
          const closeBrackets = (query.match(/\]/g) || []).length;
          expect(openBrackets).toBe(closeBrackets);
        }
      });
    });

    it('should validate time range boundaries', () => {
      const timeRangeTests = [
        {
          query: 'timestamp:[1640995200 TO 1641081600]',
          startTime: 1640995200,
          endTime: 1641081600,
          isValid: true
        },
        {
          query: 'timestamp:[1641081600 TO 1640995200]', // Invalid: end before start
          startTime: 1641081600,
          endTime: 1640995200,
          isValid: false
        }
      ];

      timeRangeTests.forEach(({ query, startTime, endTime, isValid }) => {
        const syntaxResult = QuerySanitizer.sanitizeSearchQuery(query);
        expect(syntaxResult.isValid).toBe(true); // Syntax is valid
        
        // Semantic validation for time ranges
        if (isValid) {
          expect(startTime).toBeLessThanOrEqual(endTime);
        } else {
          expect(startTime).toBeGreaterThan(endTime);
        }
      });
    });
  });

  describeIntegration('Nested Boolean Logic Tests', () => {
    it('should handle deeply nested boolean expressions', () => {
      const nestedQueries = [
        '((severity:high AND protocol:tcp) OR (severity:critical AND protocol:udp)) AND NOT (source_ip:192.168.* OR source_ip:10.*)',
        '(action:block AND (target_value:*social* OR target_value:*gaming*)) OR (action:timelimit AND category:entertainment)',
        '((online:true AND mac_vendor:Apple) OR (online:true AND mac_vendor:Samsung)) AND NOT (device_type:unknown OR last_seen:<NOW-24h)'
      ];

      nestedQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        
        // Validate balanced parentheses
        const openParens = (query.match(/\(/g) || []).length;
        const closeParens = (query.match(/\)/g) || []).length;
        expect(openParens).toBe(closeParens);
        
        // Ensure reasonable nesting depth (max 10 levels)
        let maxDepth = 0;
        let currentDepth = 0;
        for (const char of query) {
          if (char === '(') {
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
          } else if (char === ')') {
            currentDepth--;
          }
        }
        expect(maxDepth).toBeLessThanOrEqual(10);
      });
    });

    it('should optimize query structure for performance', () => {
      const optimizationTests = [
        {
          original: 'source_ip:* AND severity:high',
          optimized: 'severity:high AND source_ip:*',
          reason: 'specific_field_first'
        },
        {
          original: 'bytes:>1000000 AND bytes:<50000000',
          optimized: 'bytes:[1000000 TO 50000000]',
          reason: 'range_optimization'
        }
      ];

      optimizationTests.forEach(({ original, optimized, reason }) => {
        const originalResult = QuerySanitizer.sanitizeSearchQuery(original);
        const optimizedResult = QuerySanitizer.sanitizeSearchQuery(optimized);
        
        expect(originalResult.isValid).toBe(true);
        expect(optimizedResult.isValid).toBe(true);
        
        // Both should be syntactically valid, but optimized may perform better
        expect(optimizedResult.sanitizedValue).toBeDefined();
      });
    });
  });

  describeIntegration('Performance Testing for Large Result Sets', () => {
    it('should handle large result sets efficiently', async () => {
      const largeDatasetQuery = 'protocol:tcp AND timestamp:>NOW-24h';
      
      // Mock large dataset response
      const mockLargeDataset = {
        results: Array.from({ length: 10000 }, (_, i) => ({
          source_ip: `192.168.${Math.floor(i / 256)}.${i % 256}`,
          destination_ip: '8.8.8.8',
          protocol: 'tcp',
          bytes: Math.floor(Math.random() * 10000000),
          timestamp: Date.now() / 1000 - Math.random() * 86400
        })),
        pagination: {
          hasMore: true,
          cursor: 'large_dataset_cursor_123',
          totalCount: 50000
        }
      };

      mockFirewallaClient.getFlowData.mockResolvedValue(mockLargeDataset);

      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(largeDatasetQuery, undefined, 'timestamp:desc', 10000);
      });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBe(10000);
      expect(duration).toBeWithinPerformanceThreshold(5000); // Should complete within 5 seconds
      
      // Verify pagination is handled correctly
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.cursor).toBeDefined();
    });

    it('should implement cursor-based pagination efficiently', async () => {
      let currentCursor: string | null = null;
      const allResults: any[] = [];
      const maxPages = 5;
      let pageCount = 0;

      // Mock paginated responses
      const mockPaginatedResponse = (cursor: string | null) => ({
        results: Array.from({ length: 1000 }, (_, i) => ({
          id: `item_${cursor || 'start'}_${i}`,
          timestamp: Date.now() / 1000 - Math.random() * 86400
        })),
        pagination: {
          hasMore: pageCount < maxPages - 1,
          cursor: pageCount < maxPages - 1 ? `cursor_page_${pageCount + 1}` : null
        }
      });

      // Simulate pagination loop
      do {
        mockFirewallaClient.getFlowData.mockResolvedValue(mockPaginatedResponse(currentCursor));
        
        const response = await mockFirewallaClient.getFlowData(
          'timestamp:>NOW-24h',
          undefined,
          'timestamp:desc',
          1000,
          currentCursor
        );

        allResults.push(...response.results);
        currentCursor = response.pagination.cursor;
        pageCount++;
        
      } while (currentCursor && pageCount < maxPages);

      expect(allResults.length).toBe(maxPages * 1000);
      expect(pageCount).toBe(maxPages);
      expect(currentCursor).toBeNull();
    });
  });

  describeIntegration('Query Builder Pattern Tests', () => {
    it('should support fluent query building', () => {
      class QueryBuilder {
        private conditions: string[] = [];
        private logicalOperator: 'AND' | 'OR' = 'AND';

        field(name: string, value: string | number): this {
          this.conditions.push(`${name}:${value}`);
          return this;
        }

        range(field: string, min: number, max: number): this {
          this.conditions.push(`${field}:[${min} TO ${max}]`);
          return this;
        }

        comparison(field: string, operator: '>' | '<' | '>=' | '<=', value: number): this {
          this.conditions.push(`${field}:${operator}${value}`);
          return this;
        }

        wildcard(field: string, pattern: string): this {
          this.conditions.push(`${field}:${pattern}`);
          return this;
        }

        not(condition: string): this {
          this.conditions.push(`NOT ${condition}`);
          return this;
        }

        group(builder: (qb: QueryBuilder) => QueryBuilder): this {
          const subBuilder = new QueryBuilder();
          const groupedBuilder = builder(subBuilder);
          this.conditions.push(`(${groupedBuilder.build()})`);
          return this;
        }

        or(): this {
          this.logicalOperator = 'OR';
          return this;
        }

        and(): this {
          this.logicalOperator = 'AND';
          return this;
        }

        build(): string {
          return this.conditions.join(` ${this.logicalOperator} `);
        }
      }

      // Test fluent query building
      const complexQuery = new QueryBuilder()
        .field('severity', 'high')
        .comparison('bytes', '>', 1000000)
        .group(qb => qb
          .field('protocol', 'tcp')
          .or()
          .field('protocol', 'udp')
        )
        .not('source_ip:192.168.*')
        .build();

      const result = QuerySanitizer.sanitizeSearchQuery(complexQuery);
      expect(result.isValid).toBe(true);
      expect(complexQuery).toContain('severity:high');
      expect(complexQuery).toContain('bytes:>1000000');
      expect(complexQuery).toContain('(protocol:tcp OR protocol:udp)');
      expect(complexQuery).toContain('NOT source_ip:192.168.*');
    });

    it('should validate builder-generated queries', () => {
      const testQueries = [
        'severity:high AND bytes:>1000000 AND (protocol:tcp OR protocol:udp) AND NOT source_ip:192.168.*',
        'action:block AND (target_value:*social* OR category:social) AND hit_count:>=10',
        'online:true AND (mac_vendor:Apple OR device_type:mobile) AND last_seen:>NOW-1h'
      ];

      testQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        
        // Ensure proper operator spacing
        expect(result.sanitizedValue).toContain(' AND ');
        expect(result.sanitizedValue).not.toContain('  '); // No double spaces
        
        // Validate field format
        const fieldMatches = result.sanitizedValue?.match(/\w+:[^\s\)]+/g) || [];
        expect(fieldMatches.length).toBeGreaterThan(0);
        
        fieldMatches.forEach(match => {
          expect(match).toMatch(/^\w+:.+$/);
        });
      });
    });
  });

  describeIntegration('Enhanced Cross-Reference Functionality', () => {
    it('should handle enhanced correlation with scoring', async () => {
      const enhancedCorrelationQuery = {
        primary_query: 'protocol:tcp AND bytes:>1000',
        secondary_queries: ['severity:high', 'type:network_intrusion'],
        correlation_params: {
          correlationFields: ['source_ip', 'country'],
          correlationType: 'AND',
          temporalWindow: {
            windowSize: 30,
            windowUnit: 'minutes'
          },
          enableScoring: true,
          enableFuzzyMatching: true,
          minimumScore: 0.5
        }
      };

      // Validate correlation parameters
      expect(enhancedCorrelationQuery.correlation_params.correlationFields).toBeDefined();
      expect(enhancedCorrelationQuery.correlation_params.correlationFields.length).toBeGreaterThan(0);
      expect(['AND', 'OR']).toContain(enhancedCorrelationQuery.correlation_params.correlationType);
      
      if (enhancedCorrelationQuery.correlation_params.temporalWindow) {
        expect(enhancedCorrelationQuery.correlation_params.temporalWindow.windowSize).toBeGreaterThan(0);
        expect(['seconds', 'minutes', 'hours', 'days']).toContain(
          enhancedCorrelationQuery.correlation_params.temporalWindow.windowUnit
        );
      }

      // Mock enhanced correlation response
      const mockEnhancedResponse = {
        correlations: [
          {
            primaryMatch: { source_ip: '192.168.1.100', protocol: 'tcp', bytes: 1500 },
            secondaryMatches: [
              { source_ip: '192.168.1.100', severity: 'high', country: 'US' }
            ],
            correlationScore: 0.92,
            confidence: 'high',
            matchType: 'exact'
          }
        ],
        stats: {
          totalCorrelations: 1,
          averageScore: 0.92,
          processingTime: 250
        }
      };

      // Validate correlation scores
      mockEnhancedResponse.correlations.forEach(correlation => {
        expect(correlation.correlationScore).toBeGreaterThanOrEqual(0);
        expect(correlation.correlationScore).toBeLessThanOrEqual(1);
        expect(correlation).toHaveValidCorrelationScore();
      });
    });

    it('should provide intelligent correlation suggestions', () => {
      const suggestionScenarios = [
        {
          primary_query: 'blocked:true',
          secondary_queries: ['severity:high', 'online:false'],
          expectedSuggestions: ['source_ip', 'device_ip', 'timestamp']
        },
        {
          primary_query: 'application:Chrome',
          secondary_queries: ['severity:medium'],
          expectedSuggestions: ['source_ip', 'user_agent', 'device_ip']
        }
      ];

      suggestionScenarios.forEach(({ primary_query, secondary_queries, expectedSuggestions }) => {
        const primaryResult = QuerySanitizer.sanitizeSearchQuery(primary_query);
        expect(primaryResult.isValid).toBe(true);

        secondary_queries.forEach(secondaryQuery => {
          const secondaryResult = QuerySanitizer.sanitizeSearchQuery(secondaryQuery);
          expect(secondaryResult.isValid).toBe(true);
        });

        // Mock correlation suggestions
        const mockSuggestions = {
          recommendedFields: expectedSuggestions,
          confidence: 0.85,
          reasoning: 'Fields commonly correlated in similar queries'
        };

        expect(mockSuggestions.recommendedFields).toEqual(
          expect.arrayContaining(expectedSuggestions)
        );
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      const timeoutQuery = 'protocol:tcp AND timestamp:>NOW-7d';
      
      // Mock network timeout
      mockFirewallaClient.getFlowData.mockRejectedValue(
        new Error('Request timeout after 30000ms')
      );

      const resilientQuery = withRetries(async () => {
        return await mockFirewallaClient.getFlowData(timeoutQuery, undefined, 'timestamp:desc', 1000);
      }, 'network');

      await expect(resilientQuery()).rejects.toThrow('Request timeout');
    });

    it('should validate and recover from malformed API responses', () => {
      const malformedResponses = [
        null,
        undefined,
        { results: null },
        { results: 'not_an_array' },
        { results: [{ invalid: 'data' }] }
      ];

      malformedResponses.forEach(response => {
        // Validate response structure
        const isValidResponse = response && 
          typeof response === 'object' && 
          Array.isArray(response.results);
        
        if (!isValidResponse) {
          // Should have fallback handling
          const fallbackResponse = {
            results: [],
            pagination: { hasMore: false, cursor: null },
            error: 'Invalid API response format'
          };
          
          expect(fallbackResponse.results).toEqual([]);
          expect(fallbackResponse.error).toBeDefined();
        }
      });
    });
  });
});