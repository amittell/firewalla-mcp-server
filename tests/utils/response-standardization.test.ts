/**
 * Test suite for response format standardization
 * 
 * Validates that the standardization utilities work correctly and provide
 * backward compatibility for existing tool integrations.
 */

import { ResponseStandardizer, ResponseFormatUtils } from '../../src/utils/response-standardizer';
import type { 
  StandardSearchResponse, 
  StandardPaginatedResponse, 
  StandardStatisticalResponse,
  SearchMetadata,
  PaginationMetadata,
  StatisticalMetadata
} from '../../src/types/standard-responses';

describe('Response Format Standardization', () => {
  
  describe('ResponseStandardizer', () => {
    
    describe('toSearchResponse', () => {
      it('should create standardized search response with all metadata', () => {
        const testData = [
          { id: 1, value: 'test1' },
          { id: 2, value: 'test2' }
        ];
        
        const metadata: SearchMetadata = {
          query: 'protocol:tcp',
          entityType: 'flows',
          executionTime: 45,
          cached: false,
          cursor: 'cursor123',
          hasMore: true,
          limit: 100,
          totalPossible: 250,
          strategy: 'optimized',
          optimizations: ['field_mapping', 'query_rewrite']
        };
        
        const result = ResponseStandardizer.toSearchResponse(testData, metadata);
        
        expect(result.results).toEqual(testData);
        expect(result.count).toBe(2);
        expect(result.query_executed).toBe('protocol:tcp');
        expect(result.entity_type).toBe('flows');
        expect(result.execution_time_ms).toBe(45);
        expect(result.cached).toBe(false);
        expect(result.pagination?.cursor).toBe('cursor123');
        expect(result.pagination?.has_more).toBe(true);
        expect(result.pagination?.limit_applied).toBe(100);
        expect(result.search_metadata?.total_possible_results).toBe(250);
        expect(result.search_metadata?.search_strategy).toBe('optimized');
        expect(result.search_metadata?.optimizations_applied).toEqual(['field_mapping', 'query_rewrite']);
      });
      
      it('should handle search response without pagination', () => {
        const testData = [{ id: 1, value: 'test' }];
        const metadata: SearchMetadata = {
          query: 'simple_query',
          entityType: 'alarms',
          executionTime: 30,
          cached: true
        };
        
        const result = ResponseStandardizer.toSearchResponse(testData, metadata);
        
        expect(result.pagination).toBeUndefined();
        expect(result.cached).toBe(true);
        expect(result.search_metadata?.query_complexity).toBe('simple');
      });
    });
    
    describe('toPaginatedResponse', () => {
      it('should create standardized paginated response', () => {
        const testData = [
          { id: 1, name: 'device1' },
          { id: 2, name: 'device2' }
        ];
        
        const metadata: PaginationMetadata = {
          cursor: 'page_cursor_123',
          hasMore: true,
          limit: 50,
          offset: 100,
          executionTime: 120,
          cached: false,
          source: 'firewalla_api',
          queryParams: { filter: 'active' },
          totalCount: 500
        };
        
        const result = ResponseStandardizer.toPaginatedResponse(testData, metadata);
        
        expect(result.results).toEqual(testData);
        expect(result.count).toBe(2);
        expect(result.pagination.cursor).toBe('page_cursor_123');
        expect(result.pagination.has_more).toBe(true);
        expect(result.pagination.limit_applied).toBe(50);
        expect(result.pagination.offset).toBe(100);
        expect(result.execution_time_ms).toBe(120);
        expect(result.data_source).toBe('firewalla_api');
        expect(result.query_parameters).toEqual({ filter: 'active' });
        expect(result.total_count).toBe(500);
      });
    });
    
    describe('toStatisticalResponse', () => {
      it('should create standardized statistical response', () => {
        const testData = [
          { device: 'laptop', bytes: 1000000 },
          { device: 'phone', bytes: 500000 }
        ];
        
        const metadata: StatisticalMetadata = {
          period: '24h',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-01T23:59:59Z',
          totalAnalyzed: 1000,
          criteria: { period: '24h', min_bytes: 1000 },
          executionTime: 200,
          cached: true,
          statistics: {
            min: 500000,
            max: 1000000,
            average: 750000,
            total: 1500000
          }
        };
        
        const result = ResponseStandardizer.toStatisticalResponse(testData, metadata);
        
        expect(result.results).toEqual(testData);
        expect(result.count).toBe(2);
        expect(result.analysis.period).toBe('24h');
        expect(result.analysis.start_time).toBe('2024-01-01T00:00:00Z');
        expect(result.analysis.total_analyzed).toBe(1000);
        expect(result.execution_time_ms).toBe(200);
        expect(result.statistics?.min).toBe(500000);
        expect(result.statistics?.max).toBe(1000000);
        expect(result.statistics?.average).toBe(750000);
      });
    });
  });
  
  describe('ResponseFormatUtils', () => {
    
    describe('detectResponseCategory', () => {
      it('should detect search category for search tools', () => {
        expect(ResponseFormatUtils.detectResponseCategory('search_flows', {})).toBe('search');
        expect(ResponseFormatUtils.detectResponseCategory('search_alarms', {})).toBe('search');
        expect(ResponseFormatUtils.detectResponseCategory('search_rules', {})).toBe('search');
      });
      
      it('should detect statistical category for analytics tools', () => {
        expect(ResponseFormatUtils.detectResponseCategory('get_bandwidth_usage', {})).toBe('statistical');
        expect(ResponseFormatUtils.detectResponseCategory('get_statistics', {})).toBe('statistical');
        expect(ResponseFormatUtils.detectResponseCategory('get_most_active_rules', {})).toBe('statistical');
      });
      
      it('should detect paginated category for tools with cursor', () => {
        expect(ResponseFormatUtils.detectResponseCategory('get_flow_data', { next_cursor: 'abc' })).toBe('paginated');
        expect(ResponseFormatUtils.detectResponseCategory('get_devices', { cursor: 'def' })).toBe('paginated');
      });
      
      it('should detect correlation category for correlation tools', () => {
        expect(ResponseFormatUtils.detectResponseCategory('search_cross_reference', {})).toBe('correlation');
        expect(ResponseFormatUtils.detectResponseCategory('enhanced_correlation', {})).toBe('correlation');
      });
    });
    
    describe('isStandardFormat', () => {
      it('should validate standard search response format', () => {
        const validSearchResponse = {
          results: [],
          count: 0,
          execution_time_ms: 50,
          query_executed: 'test',
          entity_type: 'flows'
        };
        
        expect(ResponseFormatUtils.isStandardFormat(validSearchResponse, 'search')).toBe(true);
        
        const invalidSearchResponse = {
          flows: [], // Wrong field name
          count: 0,
          execution_time_ms: 50
        };
        
        expect(ResponseFormatUtils.isStandardFormat(invalidSearchResponse, 'search')).toBe(false);
      });
      
      it('should validate standard paginated response format', () => {
        const validPaginatedResponse = {
          results: [],
          count: 0,
          execution_time_ms: 50,
          pagination: { has_more: false, limit_applied: 100 },
          data_source: 'api'
        };
        
        expect(ResponseFormatUtils.isStandardFormat(validPaginatedResponse, 'paginated')).toBe(true);
      });
      
      it('should validate standard statistical response format', () => {
        const validStatisticalResponse = {
          results: [],
          count: 0,
          execution_time_ms: 50,
          analysis: { period: '24h', total_analyzed: 100, criteria: {} }
        };
        
        expect(ResponseFormatUtils.isStandardFormat(validStatisticalResponse, 'statistical')).toBe(true);
      });
    });
  });
  
  describe('Query Complexity Detection', () => {
    // Test the private method through public interface
    it('should detect simple queries', () => {
      const metadata: SearchMetadata = {
        query: 'protocol:tcp',
        entityType: 'flows',
        executionTime: 30
      };
      
      const result = ResponseStandardizer.toSearchResponse([], metadata);
      expect(result.search_metadata?.query_complexity).toBe('simple');
    });
    
    it('should detect medium complexity queries', () => {
      const metadata: SearchMetadata = {
        query: 'protocol:tcp AND blocked:true',
        entityType: 'flows',
        executionTime: 30
      };
      
      const result = ResponseStandardizer.toSearchResponse([], metadata);
      expect(result.search_metadata?.query_complexity).toBe('medium');
    });
    
    it('should detect complex queries', () => {
      const metadata: SearchMetadata = {
        query: '(protocol:tcp OR protocol:udp) AND (blocked:true OR action:block) AND source_ip:192.168.*',
        entityType: 'flows',
        executionTime: 30
      };
      
      const result = ResponseStandardizer.toSearchResponse([], metadata);
      expect(result.search_metadata?.query_complexity).toBe('complex');
    });
  });
});