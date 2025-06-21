import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FirewallaMCPServer } from '../../src/server';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../../src/config/config.js', () => ({
  config: {
    mspToken: 'test-token',
    mspBaseUrl: 'https://test.firewalla.com',
    boxId: 'test-box',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
  },
}));

const MockedStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;

describe('Firewalla MCP Server Integration', () => {
  let server: any;
  let mockTransport: jest.Mocked<StdioServerTransport>;

  beforeEach(() => {
    mockTransport = new MockedStdioServerTransport() as jest.Mocked<StdioServerTransport>;
    MockedStdioServerTransport.mockImplementation(() => mockTransport);
    
    // Mock process.stderr.write to avoid console output during tests
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('server initialization', () => {
    it('should create server with correct capabilities', () => {
      // Access the FirewallaMCPServer class from the module
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      expect(server).toBeDefined();
      expect(server.server).toBeInstanceOf(Server);
      expect(server.firewalla).toBeDefined();
    });

    it('should set up all request handlers', () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const handlers = server.server.requestHandlers;
      
      // Check that tool handlers are set up
      expect(handlers.has('tools/list')).toBe(true);
      expect(handlers.has('tools/call')).toBe(true);
      
      // Check that resource handlers are set up
      expect(handlers.has('resources/list')).toBe(true);
      expect(handlers.has('resources/read')).toBe(true);
      
      // Check that prompt handlers are set up
      expect(handlers.has('prompts/list')).toBe(true);
      expect(handlers.has('prompts/get')).toBe(true);
    });
  });

  describe('server startup', () => {
    it('should start server and connect transport', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();
      
      // Mock the server connect method
      server.server.connect = jest.fn().mockResolvedValue(undefined);

      await server.start();

      expect(MockedStdioServerTransport).toHaveBeenCalled();
      expect(server.server.connect).toHaveBeenCalledWith(mockTransport);
      expect(process.stderr.write).toHaveBeenCalledWith('Firewalla MCP Server running on stdio\\n');
    });

    it('should handle startup errors', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();
      
      const error = new Error('Connection failed');
      server.server.connect = jest.fn().mockRejectedValue(error);

      await expect(server.start()).rejects.toThrow('Connection failed');
    });
  });

  describe('tool integration', () => {
    it('should list all available tools', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listToolsHandler = server.server.requestHandlers.get('tools/list');
      const response = await listToolsHandler({});

      expect(response.tools).toHaveLength(7);
      expect(response.tools.map((t: any) => t.name)).toEqual([
        'get_active_alarms',
        'get_flow_data',
        'get_device_status',
        'get_bandwidth_usage',
        'get_network_rules',
        'pause_rule',
        'get_target_lists',
      ]);
    });

    it('should have valid tool schemas', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listToolsHandler = server.server.requestHandlers.get('tools/list');
      const response = await listToolsHandler({});

      response.tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
      });
    });
  });

  describe('resource integration', () => {
    it('should list all available resources', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listResourcesHandler = server.server.requestHandlers.get('resources/list');
      const response = await listResourcesHandler({});

      expect(response.resources).toHaveLength(5);
      expect(response.resources.map((r: any) => r.uri)).toEqual([
        'firewalla://summary',
        'firewalla://devices',
        'firewalla://metrics/security',
        'firewalla://topology',
        'firewalla://threats/recent',
      ]);
    });

    it('should have valid resource metadata', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listResourcesHandler = server.server.requestHandlers.get('resources/list');
      const response = await listResourcesHandler({});

      response.resources.forEach((resource: any) => {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('mimeType', 'application/json');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
      });
    });
  });

  describe('prompt integration', () => {
    it('should list all available prompts', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listPromptsHandler = server.server.requestHandlers.get('prompts/list');
      const response = await listPromptsHandler({});

      expect(response.prompts).toHaveLength(5);
      expect(response.prompts.map((p: any) => p.name)).toEqual([
        'security_report',
        'threat_analysis',
        'bandwidth_analysis',
        'device_investigation',
        'network_health_check',
      ]);
    });

    it('should have valid prompt metadata', async () => {
      const FirewallaMCPServerClass = require('../../src/server').FirewallaMCPServer;
      server = new FirewallaMCPServerClass();

      const listPromptsHandler = server.server.requestHandlers.get('prompts/list');
      const response = await listPromptsHandler({});

      response.prompts.forEach((prompt: any) => {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
        expect(prompt).toHaveProperty('arguments');
        expect(Array.isArray(prompt.arguments)).toBe(true);
      });
    });
  });
});