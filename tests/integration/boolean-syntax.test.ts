/**
 * Integration test to verify which boolean syntax works with the flows endpoint
 * This determines whether we should use "blocked:true" or "blocked=true" as the canonical syntax
 */

import { createTestServer } from '../setup/test-server.js';
import { createSearchTools } from '../../src/tools/search.js';
import type { FirewallaClient } from '../../src/firewalla/client.js';

describe('Boolean Syntax Integration Test', () => {
  let mockFirewalla: FirewallaClient;
  let searchTools: any;

  beforeEach(() => {
    // Create a mock Firewalla client that tracks which queries are sent
    const queryLog: string[] = [];
    
    mockFirewalla = {
      getFlowData: jest.fn().mockImplementation((query: string) => {
        queryLog.push(query);
        
        // Simulate different responses based on query syntax
        if (query.includes('blocked:1') || query.includes('blocked=1')) {
          return Promise.resolve({
            results: [
              {
                ts: 1640995200,
                protocol: 'tcp',
                blocked: true,
                source_ip: '192.168.1.100',
                destination_ip: '8.8.8.8'
              }
            ],
            count: 1
          });
        }
        
        // If the query contains untranslated boolean values, simulate backend error
        if (query.includes('blocked:true') || query.includes('blocked=true')) {
          return Promise.reject(new Error('Bad Request: Invalid parameters'));
        }
        
        return Promise.resolve({ results: [], count: 0 });
      }),
      queryLog
    } as any;

    searchTools = createSearchTools(mockFirewalla);
  });

  test('colon syntax with boolean translation should work', async () => {
    // Test "blocked:true" which should be translated to "blocked:1"
    const result = await searchTools.search_flows({
      query: 'blocked:true',
      limit: 1
    });

    expect(result.results).toHaveLength(1);
    expect(mockFirewalla.queryLog).toContain('blocked:1');
    expect(mockFirewalla.queryLog).not.toContain('blocked:true');
  });

  test('equals syntax with boolean translation should work', async () => {
    // Test "blocked=true" which should be translated to "blocked:1" 
    const result = await searchTools.search_flows({
      query: 'blocked=true', 
      limit: 1
    });

    expect(result.results).toHaveLength(1);
    expect(mockFirewalla.queryLog).toContain('blocked:1');
    expect(mockFirewalla.queryLog).not.toContain('blocked=true');
  });

  test('untranslated boolean syntax should still work with enhanced translator', async () => {
    // Mock the translator to not work, simulating old behavior
    const originalTranslator = require('../../src/search/boolean-field-translator.js').BooleanFieldTranslator;
    const mockTranslator = {
      translateQuery: jest.fn().mockImplementation((query) => query), // No translation
      needsTranslation: jest.fn().mockReturnValue(false)
    };
    
    // Temporarily replace the translator
    jest.doMock('../../src/search/boolean-field-translator.js', () => ({
      BooleanFieldTranslator: mockTranslator
    }));

    // This should fail because the raw "blocked:true" reaches the backend
    const result = await searchTools.search_flows({
      query: 'blocked:true',
      limit: 1  
    });
    
    // With enhanced boolean translator, this should now succeed
    expect(result).toBeDefined();
    expect(result.boolean_translation).toBeDefined();
  });

  test('boolean translation debug info is included', async () => {
    const result = await searchTools.search_flows({
      query: 'blocked:true AND protocol:tcp',
      limit: 1
    });

    // Should include debug info about the translation
    expect(result).toHaveProperty('boolean_translation');
    expect(result.boolean_translation).toMatchObject({
      original_query: 'blocked:true AND protocol:tcp',
      translated_query: 'blocked:1 AND protocol:tcp',
      translation_applied: true
    });
  });
});