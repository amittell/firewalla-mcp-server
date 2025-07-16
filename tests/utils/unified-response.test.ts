/**
 * Tests for Unified Response Format
 */

import {
  createSuccessResponse,
  createErrorResponse,
  toToolResponse,
  isUnifiedResponse,
  withUnifiedResponse,
  type UnifiedResponse,
} from '../../src/utils/unified-response.js';

describe('Unified Response Format', () => {
  describe('createSuccessResponse', () => {
    it('should create a proper success response', () => {
      const data = { message: 'Hello, world!' };
      const response = createSuccessResponse(data, 'test-tool');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta.tool).toBe('test-tool');
      expect(response.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.meta.request_id).toMatch(/^req_/);
      expect(response.error).toBeUndefined();
    });

    it('should include count for array data', () => {
      const data = [1, 2, 3];
      const response = createSuccessResponse(data, 'test-tool');

      expect(response.meta.count).toBe(3);
    });

    it('should include execution time when provided', () => {
      const data = { test: true };
      const response = createSuccessResponse(data, 'test-tool', {
        executionTimeMs: 123,
      });

      expect(response.meta.execution_time_ms).toBe(123);
    });
  });

  describe('createErrorResponse', () => {
    it('should create a proper error response', () => {
      const error = 'Something went wrong';
      const response = createErrorResponse(error, 'test-tool');

      expect(response.success).toBe(false);
      expect(response.error).toBe(error);
      expect(response.meta.tool).toBe('test-tool');
      expect(response.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.meta.request_id).toMatch(/^req_/);
      expect(response.data).toBeUndefined();
    });
  });

  describe('toToolResponse', () => {
    it('should convert unified success response to ToolResponse', () => {
      const unifiedResponse = createSuccessResponse({ test: true }, 'test-tool');
      const toolResponse = toToolResponse(unifiedResponse);

      expect(toolResponse.content).toHaveLength(1);
      expect(toolResponse.content[0].type).toBe('text');
      expect(toolResponse.isError).toBe(false);

      const parsedContent = JSON.parse(toolResponse.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.test).toBe(true);
    });

    it('should convert unified error response to ToolResponse', () => {
      const unifiedResponse = createErrorResponse('Error message', 'test-tool');
      const toolResponse = toToolResponse(unifiedResponse);

      expect(toolResponse.content).toHaveLength(1);
      expect(toolResponse.content[0].type).toBe('text');
      expect(toolResponse.isError).toBe(true);

      const parsedContent = JSON.parse(toolResponse.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Error message');
    });
  });

  describe('isUnifiedResponse', () => {
    it('should identify valid unified responses', () => {
      const response = createSuccessResponse({ test: true }, 'test-tool');
      expect(isUnifiedResponse(response)).toBe(true);
    });

    it('should reject invalid objects', () => {
      expect(isUnifiedResponse({})).toBe(false);
      expect(isUnifiedResponse({ success: true })).toBe(false);
      expect(isUnifiedResponse(null)).toBe(false);
      expect(isUnifiedResponse('string')).toBe(false);
      expect(isUnifiedResponse(undefined)).toBe(false);
    });
  });

  describe('withUnifiedResponse wrapper', () => {
    it('should wrap a successful handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ result: 'success' }) }],
        isError: false,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.result).toBe('success');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should wrap an error handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ message: 'Error occurred' }) }],
        isError: true,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Error occurred');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle thrown exceptions', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler threw error'));

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Handler threw error');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle non-JSON error text from handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'This is not JSON' }],
        isError: true,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('This is not JSON');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle non-string error content from handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 12345 }], // Non-string content
        isError: true,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Unknown error');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle non-JSON success text from handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Plain text response' }],
        isError: false,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toBe('Plain text response');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle non-string success content from handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: { nested: 'object' } }], // Non-string content
        isError: false,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual({ nested: 'object' });
      expect(parsedContent.meta.tool).toBe('test-tool');
    });

    it('should handle missing error field in parsed error', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ someField: 'value' }) }], // No message or error field
        isError: true,
      });

      const wrappedHandler = withUnifiedResponse(mockHandler, 'test-tool');
      const result = await wrappedHandler();

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Unknown error');
      expect(parsedContent.meta.tool).toBe('test-tool');
    });
  });
});