/**
 * @fileoverview Tool Registry Tests - Comprehensive test suite for ToolRegistry
 *
 * Tests all aspects of the tool registry including:
 * - Automatic handler registration
 * - Duplicate registration protection
 * - Force registration capabilities
 * - Tool discovery and retrieval
 * - Category-based filtering
 *
 * @version 1.0.0
 */

import { ToolRegistry } from '../../src/tools/registry.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';

// Mock tool handlers for testing
class MockToolHandler implements ToolHandler {
  constructor(
    public readonly name: string,
    public readonly category: string,
    public readonly description: string = `Test handler for ${name}`
  ) {}

  get schema() {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  async execute(): Promise<any> {
    return { success: true, handler: this.name };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  // Create a fresh registry for each test to avoid interference
  beforeEach(() => {
    // We can't easily test the auto-registration without mocking all handlers,
    // so we'll create a minimal registry for testing core functionality
    registry = new ToolRegistry();
  });

  describe('Duplicate Registration Protection', () => {
    it('should prevent registering a handler with duplicate name', () => {
      const handler1 = new MockToolHandler('test_tool', 'security');
      const handler2 = new MockToolHandler('test_tool', 'network'); // Same name, different category

      // First registration should succeed
      expect(() => registry.register(handler1)).not.toThrow();
      expect(registry.isRegistered('test_tool')).toBe(true);

      // Second registration with same name should throw error
      expect(() => registry.register(handler2)).toThrow(/Tool registration conflict/);
      expect(() => registry.register(handler2)).toThrow(/test_tool.*already registered/);
    });

    it('should include diagnostic information in duplicate registration error', () => {
      const handler1 = new MockToolHandler('duplicate_test', 'security');
      const handler2 = new MockToolHandler('duplicate_test', 'analytics');

      registry.register(handler1);

      let errorMessage = '';
      try {
        registry.register(handler2);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toContain("Existing handler category: 'security'");
      expect(errorMessage).toContain("New handler category: 'analytics'");
      expect(errorMessage).toContain('Tool registration conflict');
    });

    it('should maintain registry integrity after failed duplicate registration', () => {
      const handler1 = new MockToolHandler('integrity_test', 'security');
      const handler2 = new MockToolHandler('integrity_test', 'network');

      registry.register(handler1);
      const originalHandler = registry.getHandler('integrity_test');

      try {
        registry.register(handler2);
      } catch (error) {
        // Error expected, ignore it
      }

      // Original handler should still be registered
      expect(registry.getHandler('integrity_test')).toBe(originalHandler);
      expect(registry.getHandler('integrity_test')?.category).toBe('security');
    });
  });

  describe('Force Registration', () => {
    it('should allow force registration to replace existing handler', () => {
      const handler1 = new MockToolHandler('force_test', 'security');
      const handler2 = new MockToolHandler('force_test', 'analytics');

      registry.register(handler1);
      expect(registry.getHandler('force_test')?.category).toBe('security');

      const replaced = registry.forceRegister(handler2);
      expect(replaced).toBe('force_test');
      expect(registry.getHandler('force_test')?.category).toBe('analytics');
    });

    it('should return null when force registering a new handler', () => {
      const handler = new MockToolHandler('new_force_test', 'network');

      const replaced = registry.forceRegister(handler);
      expect(replaced).toBeNull();
      expect(registry.isRegistered('new_force_test')).toBe(true);
    });

    it('should log warning when force registering with reason', () => {
      const handler1 = new MockToolHandler('warning_test', 'security');
      const handler2 = new MockToolHandler('warning_test', 'network');
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

      registry.register(handler1);
      registry.forceRegister(handler2, 'Testing force registration');

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[WARNING\] Forced tool registration.*warning_test.*Testing force registration/)
      );

      stderrSpy.mockRestore();
    });

    it('should not log warning when force registering without reason', () => {
      const handler1 = new MockToolHandler('no_warning_test', 'security');
      const handler2 = new MockToolHandler('no_warning_test', 'network');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      registry.register(handler1);
      registry.forceRegister(handler2); // No reason provided

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Tool Discovery and Retrieval', () => {
    beforeEach(() => {
      // Add some test handlers for discovery tests
      registry.forceRegister(new MockToolHandler('security_tool_1', 'security'));
      registry.forceRegister(new MockToolHandler('security_tool_2', 'security'));
      registry.forceRegister(new MockToolHandler('network_tool_1', 'network'));
      registry.forceRegister(new MockToolHandler('analytics_tool_1', 'analytics'));
    });

    it('should retrieve handler by name', () => {
      const handler = registry.getHandler('security_tool_1');
      expect(handler).toBeDefined();
      expect(handler?.name).toBe('security_tool_1');
      expect(handler?.category).toBe('security');
    });

    it('should return undefined for non-existent handler', () => {
      const handler = registry.getHandler('non_existent_tool');
      expect(handler).toBeUndefined();
    });

    it('should check if tool is registered', () => {
      expect(registry.isRegistered('security_tool_1')).toBe(true);
      expect(registry.isRegistered('non_existent_tool')).toBe(false);
    });

    it('should get all tool names', () => {
      const toolNames = registry.getToolNames();
      expect(toolNames).toContain('security_tool_1');
      expect(toolNames).toContain('network_tool_1');
      expect(toolNames).toContain('analytics_tool_1');
      expect(toolNames.length).toBeGreaterThan(3); // Includes auto-registered tools
    });

    it('should filter tools by category', () => {
      const securityTools = registry.getToolsByCategory('security');
      const networkTools = registry.getToolsByCategory('network');

      expect(securityTools.length).toBeGreaterThanOrEqual(2); // At least our test tools
      expect(networkTools.length).toBeGreaterThanOrEqual(1);

      // Check that all returned tools have the correct category
      securityTools.forEach(tool => {
        expect(tool.category).toBe('security');
      });
      networkTools.forEach(tool => {
        expect(tool.category).toBe('network');
      });
    });

    it('should return empty array for non-existent category', () => {
      const tools = registry.getToolsByCategory('non_existent_category');
      expect(tools).toEqual([]);
    });
  });

  describe('Auto-Registration Verification', () => {
    it('should have pre-registered security tools', () => {
      const securityTools = registry.getToolsByCategory('security');
      expect(securityTools.length).toBeGreaterThan(0);
      
      // Check for specific security tools that should be auto-registered
      expect(registry.isRegistered('get_active_alarms')).toBe(true);
      expect(registry.isRegistered('get_specific_alarm')).toBe(true);
      expect(registry.isRegistered('delete_alarm')).toBe(true);
    });

    it('should have pre-registered network tools', () => {
      const networkTools = registry.getToolsByCategory('network');
      expect(networkTools.length).toBeGreaterThan(0);
      
      expect(registry.isRegistered('get_flow_data')).toBe(true);
      expect(registry.isRegistered('get_bandwidth_usage')).toBe(true);
      expect(registry.isRegistered('get_offline_devices')).toBe(true);
    });

    it('should have pre-registered search tools', () => {
      const searchTools = registry.getToolsByCategory('search');
      expect(searchTools.length).toBeGreaterThan(5); // Should have many search tools
      
      expect(registry.isRegistered('search_flows')).toBe(true);
      expect(registry.isRegistered('search_alarms')).toBe(true);
      expect(registry.isRegistered('search_enhanced_cross_reference')).toBe(true);
    });

    it('should have expected total number of registered tools', () => {
      const allTools = registry.getToolNames();
      // Based on the registry.ts file, we expect 34+ tools (after unifying search_flows)
      expect(allTools.length).toBeGreaterThanOrEqual(34);
    });
  });

  describe('Registry State Management', () => {
    it('should maintain consistent state across operations', () => {
      const initialCount = registry.getToolNames().length;
      const testHandler = new MockToolHandler('state_test', 'test');

      // Add a handler
      registry.register(testHandler);
      expect(registry.getToolNames().length).toBe(initialCount + 1);
      expect(registry.isRegistered('state_test')).toBe(true);

      // Force register replacement
      const replacementHandler = new MockToolHandler('state_test', 'replacement');
      registry.forceRegister(replacementHandler);
      expect(registry.getToolNames().length).toBe(initialCount + 1); // Count unchanged
      expect(registry.getHandler('state_test')?.category).toBe('replacement');
    });

    it('should handle edge cases gracefully', () => {
      // Empty string tool name (edge case)
      const emptyNameHandler = new MockToolHandler('', 'test');
      expect(() => registry.register(emptyNameHandler)).not.toThrow();

      // Check retrieval with empty string
      expect(registry.getHandler('')).toBe(emptyNameHandler);
      expect(registry.isRegistered('')).toBe(true);
    });
  });
});