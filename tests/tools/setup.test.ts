import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupTools } from '../../src/tools/index.js';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { createErrorResponse, ErrorType } from '../../src/validation/error-handler.js';
import { logger } from '../../src/monitoring/logger.js';
import { metrics } from '../../src/monitoring/metrics.js';

// Mock dependencies
jest.mock('../../src/monitoring/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }
}));

jest.mock('../../src/monitoring/metrics.js', () => ({
  metrics: {
    count: jest.fn(),
    timing: jest.fn(),
  }
}));

jest.mock('../../src/tools/registry.js');
jest.mock('../../src/validation/error-handler.js');

describe('setupTools', () => {
  let mockServer: jest.Mocked<Server>;
  let mockFirewalla: jest.Mocked<FirewallaClient>;
  let mockRegistry: jest.Mocked<ToolRegistry>;
  let mockHandler: any;
  let requestHandler: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock server
    mockServer = {
      setRequestHandler: jest.fn(),
    } as any;

    // Create mock Firewalla client
    mockFirewalla = {} as any;

    // Create mock handler
    mockHandler = {
      execute: jest.fn(),
      constructor: { name: 'MockHandler' }
    };

    // Create mock registry
    mockRegistry = {
      getHandler: jest.fn(),
      getToolNames: jest.fn().mockReturnValue(['tool1', 'tool2', 'tool3']),
    } as any;

    // Mock ToolRegistry constructor
    (ToolRegistry as jest.MockedClass<typeof ToolRegistry>).mockImplementation(() => mockRegistry);

    // Mock createErrorResponse
    (createErrorResponse as jest.Mock).mockImplementation((name, message, type, metadata) => ({
      content: [{
        type: 'text',
        text: JSON.stringify({ error: message, tool: name, metadata })
      }],
      isError: true
    }));
  });

  it('should initialize tool registry and set request handler', () => {
    setupTools(mockServer, mockFirewalla);

    expect(ToolRegistry).toHaveBeenCalledTimes(1);
    expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
      CallToolRequestSchema,
      expect.any(Function)
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('MCP tools setup complete')
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Registered tools: tool1, tool2, tool3')
    );
  });

  describe('request handler', () => {
    beforeEach(() => {
      setupTools(mockServer, mockFirewalla);
      // Capture the request handler
      requestHandler = mockServer.setRequestHandler.mock.calls[0][1];
    });

    it('should execute tool successfully', async () => {
      const mockResponse = { content: [{ type: 'text', text: 'success' }] };
      mockHandler.execute.mockResolvedValue(mockResponse);
      mockRegistry.getHandler.mockReturnValue(mockHandler);

      const request = {
        params: {
          name: 'test_tool',
          arguments: { param1: 'value1' }
        }
      };

      const result = await requestHandler(request);

      expect(mockRegistry.getHandler).toHaveBeenCalledWith('test_tool');
      expect(mockHandler.execute).toHaveBeenCalledWith({ param1: 'value1' }, mockFirewalla);
      expect(logger.debug).toHaveBeenCalledWith(
        'Executing tool: test_tool with handler: MockHandler'
      );
      expect(metrics.count).toHaveBeenCalledWith('tool.success');
      expect(metrics.timing).toHaveBeenCalledWith('tool.latency_ms', expect.any(Number));
      expect(result).toBe(mockResponse);
    });

    it('should handle missing arguments gracefully', async () => {
      const mockResponse = { content: [{ type: 'text', text: 'success' }] };
      mockHandler.execute.mockResolvedValue(mockResponse);
      mockRegistry.getHandler.mockReturnValue(mockHandler);

      const request = {
        params: {
          name: 'test_tool'
          // No arguments provided
        }
      };

      const result = await requestHandler(request);

      expect(mockHandler.execute).toHaveBeenCalledWith({}, mockFirewalla);
      expect(result).toBe(mockResponse);
    });

    it('should handle unknown tool error', async () => {
      mockRegistry.getHandler.mockReturnValue(null);

      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const result = await requestHandler(request);

      expect(mockRegistry.getHandler).toHaveBeenCalledWith('unknown_tool');
      expect(logger.error).toHaveBeenCalledWith(
        'Tool execution failed for unknown_tool:',
        expect.any(Error)
      );
      expect(metrics.count).toHaveBeenCalledWith('tool.error');
      expect(createErrorResponse).toHaveBeenCalledWith(
        'unknown_tool',
        'Unknown tool: unknown_tool. Available tools: tool1, tool2, tool3',
        ErrorType.UNKNOWN_ERROR,
        expect.objectContaining({
          timestamp: expect.any(String),
          error_type: 'Error',
          available_tools: ['tool1', 'tool2', 'tool3']
        })
      );
    });

    it('should handle tool execution error', async () => {
      const executionError = new Error('Execution failed');
      mockHandler.execute.mockRejectedValue(executionError);
      mockRegistry.getHandler.mockReturnValue(mockHandler);

      const request = {
        params: {
          name: 'failing_tool',
          arguments: {}
        }
      };

      const result = await requestHandler(request);

      expect(logger.error).toHaveBeenCalledWith(
        'Tool execution failed for failing_tool:',
        executionError
      );
      expect(metrics.count).toHaveBeenCalledWith('tool.error');
      expect(createErrorResponse).toHaveBeenCalledWith(
        'failing_tool',
        'Execution failed',
        ErrorType.UNKNOWN_ERROR,
        expect.objectContaining({
          timestamp: expect.any(String),
          error_type: 'Error',
          available_tools: ['tool1', 'tool2', 'tool3']
        })
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockHandler.execute.mockRejectedValue('String error');
      mockRegistry.getHandler.mockReturnValue(mockHandler);

      const request = {
        params: {
          name: 'failing_tool',
          arguments: {}
        }
      };

      const result = await requestHandler(request);

      expect(logger.error).toHaveBeenCalledWith(
        'Tool execution failed for failing_tool:',
        'String error'
      );
      expect(createErrorResponse).toHaveBeenCalledWith(
        'failing_tool',
        'Unknown error occurred',
        ErrorType.UNKNOWN_ERROR,
        expect.objectContaining({
          error_type: 'UnknownError'
        })
      );
    });

    it('should handle registry returning empty tool names', async () => {
      mockRegistry.getHandler.mockReturnValue(null);
      mockRegistry.getToolNames.mockReturnValue([]);

      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const result = await requestHandler(request);

      expect(createErrorResponse).toHaveBeenCalledWith(
        'unknown_tool',
        'Unknown tool: unknown_tool. Available tools: ',
        ErrorType.UNKNOWN_ERROR,
        expect.objectContaining({
          available_tools: []
        })
      );
    });

    it('should handle registry returning null tool names', async () => {
      mockRegistry.getHandler.mockReturnValue(null);
      mockRegistry.getToolNames.mockReturnValue(null as any);

      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const result = await requestHandler(request);

      expect(createErrorResponse).toHaveBeenCalledWith(
        'unknown_tool',
        'Unknown tool: unknown_tool. Available tools: ',
        ErrorType.UNKNOWN_ERROR,
        expect.objectContaining({
          available_tools: []
        })
      );
    });
  });

  describe('logging output', () => {
    it('should log setup completion with correct tool count', () => {
      mockRegistry.getToolNames.mockReturnValue(Array(35).fill('tool'));

      setupTools(mockServer, mockFirewalla);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('35 handlers across 6 categories')
      );
    });

    it('should handle null tool names in logging', () => {
      mockRegistry.getToolNames.mockReturnValue(null as any);

      setupTools(mockServer, mockFirewalla);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('0 handlers across 6 categories')
      );
      expect(logger.info).toHaveBeenCalledWith('Registered tools: ');
    });
  });
});