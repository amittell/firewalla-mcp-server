import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { createErrorResponse } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';
import { ToolRegistry } from './registry.js';
import { getCurrentTimestamp } from '../utils/timestamp.js';

/**
 * Registers and configures all Firewalla MCP tools on the server using a modular registry pattern.
 *
 * Sets up 25 distinct firewall management tools, each encapsulated in its own handler and organized by category. Replaces a monolithic switch statement with a registry for improved maintainability, testability, and code organization. Handles tool execution requests, error reporting, and logs setup details.
 *
 * @param server - The MCP server instance where tools are registered
 * @param firewalla - The Firewalla client used for API communication
 */
export function setupTools(server: Server, firewalla: FirewallaClient): void {
  // Initialize the tool registry with all 25 handlers
  const toolRegistry = new ToolRegistry();
  
  // Set up the main request handler using the registry
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Get handler from the registry
      const handler = toolRegistry.getHandler(name);
      if (!handler) {
        const availableTools = toolRegistry.getToolNames() || [];
        throw new Error(`Unknown tool: ${name}. Available tools: ${availableTools.join(', ')}`);
      }

      // Execute the tool handler with proper error handling
      logger.debug(`Executing tool: ${name} with handler: ${handler.constructor.name}`);
      return await handler.execute(args, firewalla);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Tool execution failed for ${name}:`, error as Error);
      
      // Use centralized error handling
      return createErrorResponse(name, errorMessage, {
        timestamp: getCurrentTimestamp(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
        available_tools: toolRegistry.getToolNames() || []
      });
    }
  });

  const allToolNames = toolRegistry.getToolNames() || [];
  const securityTools = toolRegistry.getToolsByCategory('security') || [];
  const networkTools = toolRegistry.getToolsByCategory('network') || [];
  const deviceTools = toolRegistry.getToolsByCategory('device') || [];
  const ruleTools = toolRegistry.getToolsByCategory('rule') || [];
  const analyticsTools = toolRegistry.getToolsByCategory('analytics') || [];
  const searchTools = toolRegistry.getToolsByCategory('search') || [];
  
  const totalCategories = securityTools.length + networkTools.length + deviceTools.length + ruleTools.length + analyticsTools.length + searchTools.length;
  
  logger.info(`MCP tools setup complete. Registry contains ${allToolNames.length} handlers across ${totalCategories} categories.`);
  logger.info(`Registered tools: ${allToolNames.join(', ')}`);
}

/**
 * Migration Complete! 
 * 
 * ✅ Migrated to Registry (25 handlers total):
 * 
 * Security (3):
 * - get_active_alarms, get_specific_alarm, delete_alarm
 * 
 * Network (3): 
 * - get_flow_data, get_bandwidth_usage, get_offline_devices
 * 
 * Device (1):
 * - get_device_status
 * 
 * Rule (6):
 * - get_network_rules, pause_rule, resume_rule, get_target_lists,
 *   get_network_rules_summary, get_most_active_rules, get_recent_rules
 * 
 * Analytics (6):
 * - get_boxes, get_simple_statistics, get_statistics_by_region,
 *   get_statistics_by_box, get_flow_trends, get_alarm_trends, get_rule_trends
 * 
 * Search (6):
 * - search_flows, search_alarms, search_rules, search_devices,
 *   search_target_lists, search_cross_reference
 * 
 * 🗑️ Removed: 1000+ line switch statement replaced with clean registry pattern
 * 🔧 Fixed: Null safety issues in device mapping (lines 1263-1270 in original)
 * 📊 Architecture: Single Responsibility Principle, better testability, maintainability
 */