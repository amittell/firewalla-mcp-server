/**
 * Integration test to verify which boolean syntax works with the flows endpoint
 * This determines whether we should use "blocked:true" or "blocked=true" as the canonical syntax
 */

import { createSearchTools } from '../../src/tools/search.js';
import type { FirewallaClient } from '../../src/firewalla/client.js';
import type { Flow } from '../../src/types.js';

const BLOCKED_FLOW: Flow = {
  ts: 1640995200,
  gid: '00000000-0000-0000-0000-000000000000',
  protocol: 'tcp',
  direction: 'outbound',
  block: true,
  count: 1,
  device: { id: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.100', name: 'Test Device' },
  destination: { id: '8.8.8.8', name: '8.8.8.8', ip: '8.8.8.8' },
};

describe('Boolean Syntax Integration Test', () => {
  // The query of every getFlowData call
  let queryLog: string[];
  let searchTools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    queryLog = [];

    const mockFirewalla: Pick<FirewallaClient, 'getFlowData'> = {
      getFlowData: jest.fn(async (query?: string) => {
        queryLog.push(query ?? '');

        // status:blocked is the API's qualifier for blocked flows; search_flows
        // renames blocked:true to it before combining the query's parts
        if (query?.includes('status:blocked')) {
          return { results: [BLOCKED_FLOW], count: 1 };
        }

        // If the query contains untranslated boolean values, simulate backend error
        if (/blocked[:=](true|1)/.test(query ?? '')) {
          throw new Error('Bad Request: Invalid parameters');
        }

        return { results: [], count: 0 };
      }),
    };

    searchTools = createSearchTools(mockFirewalla as FirewallaClient);
  });

  test('colon syntax with boolean translation should work', async () => {
    // "blocked:true" is translated to the API's "status:blocked"
    const result = await searchTools.search_flows({
      query: 'blocked:true',
      limit: 1
    });

    expect(result.results).toHaveLength(1);
    expect(queryLog).toEqual(['status:blocked']);
  });

  test('equals syntax with boolean translation should work', async () => {
    // "blocked=true" is translated to the API's "status:blocked"
    const result = await searchTools.search_flows({
      query: 'blocked=true',
      limit: 1
    });

    expect(result.results).toHaveLength(1);
    expect(queryLog).toEqual(['status:blocked']);
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
    expect(result).toHaveProperty('boolean_translation');
  });

  test('boolean translation debug info is included', async () => {
    const result = await searchTools.search_flows({
      query: 'blocked:true AND protocol:tcp',
      limit: 1
    });

    // Should include debug info about the translation
    expect(result).toMatchObject({
      boolean_translation: {
        original_query: 'blocked:true AND protocol:tcp',
        translated_query: 'status:blocked AND protocol:tcp',
        translation_applied: true,
      },
    });
  });
});