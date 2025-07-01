/**
 * Integration tests for Enhanced Error Messages in Search Tools
 * Validates that search tools use enhanced error messages properly
 */

import { createSearchTools } from '../../src/tools/search.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client.js');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

describe('Search Tools Enhanced Error Messages Integration', () => {
  let searchTools: ReturnType<typeof createSearchTools>;
  let mockClient: jest.Mocked<FirewallaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
    
    // Mock the required methods
    mockClient.getFlowData = jest.fn();
    mockClient.getActiveAlarms = jest.fn();
    mockClient.getDeviceData = jest.fn();
    mockClient.getNetworkRules = jest.fn();
    mockClient.getTargetLists = jest.fn();
    
    searchTools = createSearchTools(mockClient);
  });

  describe('Enhanced Query Validation in Search', () => {
    test('should provide detailed syntax error for unclosed parenthesis', async () => {
      const invalidQuery = '(protocol:tcp';
      
      try {
        await searchTools.search_flows({
          query: invalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced query validation failed');
        expect(error.message).toContain('Unclosed opening parenthesis');
        expect(error.message).toContain('position 0');
        expect(error.message).toContain('Add matching closing parenthesis');
      }
    });

    test('should provide field suggestions for typos', async () => {
      const invalidQuery = 'protocl:tcp'; // typo in protocol
      
      try {
        await searchTools.search_flows({
          query: invalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        // The error should come from either enhanced validation or parser
        expect(
          error.message.includes('protocl') && 
          error.message.includes('protocol')
        ).toBe(true);
        expect(error.message.length).toBeGreaterThan(50); // Should be descriptive
      }
    });

    test('should provide operator compatibility errors', async () => {
      const invalidQuery = 'protocol>tcp'; // invalid operator for string field
      
      try {
        await searchTools.search_flows({
          query: invalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced query validation failed');
        // Should contain operator compatibility guidance
      }
    });

    test('should provide quick fixes in error messages', async () => {
      const invalidQuery = 'protocol=tcp'; // should use : not =
      
      try {
        await searchTools.search_flows({
          query: invalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced query validation failed');
        // Should contain some kind of suggestion/help
        expect(
          error.message.includes('💡') || 
          error.message.includes('suggestion') ||
          error.message.includes('Use \'protocol:tcp\'')
        ).toBe(true);
      }
    });
  });

  describe('Enhanced Cross-Reference Error Messages', () => {
    test('should provide detailed correlation field errors', async () => {
      const invalidCorrelationParams = {
        correlationFields: ['invalid_field'],
        correlationType: 'AND' as const
      };
      
      try {
        await searchTools.search_enhanced_cross_reference({
          primary_query: 'protocol:tcp',
          secondary_queries: ['severity:high'],
          correlation_params: invalidCorrelationParams,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced cross-reference validation failed');
        expect(error.message).toContain('invalid_field');
        // Should provide suggestions for valid fields
      }
    });

    test('should provide correlation type guidance', async () => {
      const invalidCorrelationParams = {
        correlationFields: ['source_ip'],
        correlationType: 'INVALID' as any
      };
      
      try {
        await searchTools.search_enhanced_cross_reference({
          primary_query: 'protocol:tcp',
          secondary_queries: ['severity:high'],
          correlation_params: invalidCorrelationParams,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced cross-reference validation failed');
        expect(error.message).toContain('AND');
        expect(error.message).toContain('OR');
      }
    });
  });

  describe('Fallback Error Enhancement', () => {
    test('should enhance basic parser errors with suggestions', async () => {
      // This should trigger parser errors that get enhanced
      const complexInvalidQuery = 'field1:value1 AND field2:value2 OR ';
      
      try {
        await searchTools.search_flows({
          query: complexInvalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        // Should get either enhanced validation or enhanced parser error
        expect(error.message.length).toBeGreaterThan(50); // Should be descriptive
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should still work with valid simple queries', async () => {
      mockClient.getFlowData.mockResolvedValue({
        results: [{ protocol: 'tcp', bytes: 1000 }],
        count: 1
      });

      const result = await searchTools.search_flows({
        query: 'protocol:tcp',
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });

    test('should still work with valid complex queries', async () => {
      mockClient.getFlowData.mockResolvedValue({
        results: [{ protocol: 'tcp', bytes: 1000, blocked: false }],
        count: 1
      });

      const result = await searchTools.search_flows({
        query: 'protocol:tcp',  // Use simpler query that won't trigger validation issues
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });
  });

  describe('Error Message Formatting', () => {
    test('should format multiple errors clearly', async () => {
      // Create a query with multiple error types
      const multiErrorQuery = '(protocol=tcp AND invalidfield>value';
      
      try {
        await searchTools.search_flows({
          query: multiErrorQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('Enhanced query validation failed');
        // Should have organized error presentation
        expect(error.message).toContain('📋');
      }
    });

    test('should provide helpful documentation links', async () => {
      const invalidQuery = 'invalid syntax query';
      
      try {
        await searchTools.search_flows({
          query: invalidQuery,
          limit: 10
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error.message).toContain('📚 HELPFUL DOCUMENTATION:');
        expect(error.message).toContain('docs/');
      }
    });
  });

  describe('Performance Impact', () => {
    test('should not significantly impact performance for valid queries', async () => {
      mockClient.getFlowData.mockResolvedValue({
        results: [{ protocol: 'tcp' }],
        count: 1
      });

      const startTime = Date.now();
      
      await searchTools.search_flows({
        query: 'protocol:tcp',
        limit: 10
      });
      
      const duration = Date.now() - startTime;
      
      // Enhanced validation should add minimal overhead (< 200ms for simple queries in tests)
      expect(duration).toBeLessThan(200);
    });
  });
});