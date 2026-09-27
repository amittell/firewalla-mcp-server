/**
 * Tests for user experience improvements
 */

import { describe, test, expect } from '@jest/globals';
import { createTimeoutErrorResponse } from '../src/utils/timeout-manager.js';

describe('User Experience Improvements', () => {
  describe('Enhanced Timeout Error Messages', () => {
    test('should generate actionable guidance for search operations', () => {
      const errorResponse = createTimeoutErrorResponse('search_flows', 15000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Search Optimization Tips');
      expect(errorResponse.content[0].text).toContain('Reduce the limit parameter');
      expect(errorResponse.content[0].text).toContain('protocol filters');
      expect(errorResponse.content[0].text).toContain('Troubleshooting Steps');
    });

    test('should generate guidance for rule operations', () => {
      const errorResponse = createTimeoutErrorResponse('get_network_rules', 20000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Rule Operation Tips');
      expect(errorResponse.content[0].text).toContain('active_only:true');
      expect(errorResponse.content[0].text).toContain('Recovery Suggestions');
    });

    test('should generate guidance for device operations', () => {
      const errorResponse = createTimeoutErrorResponse('get_device_status', 25000, 10000);
      
      expect(errorResponse.content[0].text).toContain('Device Query Tips');
      expect(errorResponse.content[0].text).toContain('online:true');
      expect(errorResponse.content[0].text).toContain('cursor pagination');
    });

    test('should include performance context in error response', () => {
      const errorResponse = createTimeoutErrorResponse('search_flows', 15000, 10000);
      
      expect(errorResponse.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Operation timed out after 15000ms'),
      });
      
      // Should have structured context in the response
      expect(errorResponse).toMatchObject({
        isError: true,
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('timeout_guide'),
          }),
        ]),
      });
    });
  });
});
