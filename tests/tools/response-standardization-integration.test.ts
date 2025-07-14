/**
 * Test to validate the standardization works correctly with legacy compatibility
 */

import { SearchFlowsHandler } from '../../src/tools/handlers/search';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the search tools module
jest.mock('../../src/tools/search.js', () => ({
  createSearchTools: jest.fn(() => ({
    search_flows: jest.fn(() => Promise.resolve({
      results: [
        { 
          protocol: 'tcp', 
          download: 500, 
          upload: 500,
          ts: Date.now() / 1000,
          device: { name: 'test-device' }
        },
        { 
          protocol: 'udp', 
          download: 1000, 
          upload: 1000,
          ts: Date.now() / 1000,
          device: { name: 'test-device2' }
        }
      ],
      query: 'protocol:tcp AND bytes:>1000',
      execution_time_ms: 45
    }))
  }))
}));

describe('Response Standardization Integration Test', () => {
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let handler: SearchFlowsHandler;

  beforeEach(() => {
    mockFirewalla = {} as jest.Mocked<FirewallaClient>;
    handler = new SearchFlowsHandler();
  });

  it('should return legacy format for search_flows when configured', async () => {
    const args = {
      query: 'protocol:tcp AND bytes:>1000',
      limit: 100
    };

    const result = await handler.execute(args, mockFirewalla);
    
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    
    const parsedContent = JSON.parse(result.content[0].text);
    console.log('Actual response:', JSON.stringify(parsedContent, null, 2));
    
    // Should have unified response structure
    expect(parsedContent.success).toBe(true);
    expect(parsedContent.data).toBeDefined();
    expect(parsedContent.meta).toBeDefined();
    
    // Should have current response format
    expect(parsedContent.data.flows).toBeDefined();
    expect(parsedContent.data.flows).toHaveLength(2);
    expect(parsedContent.data.metadata.query).toBe('protocol:tcp AND bytes:>1000');
    expect(parsedContent.data.metadata.execution_time_ms).toBe(45);
    
    // Should NOT have standard format fields in data
    expect(parsedContent.data.results).toBeUndefined();
    expect(parsedContent.data.entity_type).toBeUndefined();
  });
});