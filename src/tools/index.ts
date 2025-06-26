/**
 * @fileoverview MCP Tool Setup and Registry Management
 * 
 * Implements a clean, modular registry pattern for managing 25 distinct MCP tools
 * that provide comprehensive Firewalla firewall management capabilities. Replaces
 * the original 1000+ line switch statement with maintainable, testable handler classes.
 * 
 * Tool Categories:
 * - **Security (3 tools)**: Alarm management and threat monitoring
 * - **Network (3 tools)**: Flow analysis and bandwidth monitoring
 * - **Device (1 tool)**: Device status and inventory management
 * - **Rule (6 tools)**: Firewall rule configuration and analytics
 * - **Analytics (6 tools)**: Statistical analysis and trend reporting
 * - **Search (6 tools)**: Advanced search with cross-reference capabilities
 * 
 * Architecture Benefits:
 * - Single Responsibility Principle for each tool handler
 * - Improved testability with isolated handler units
 * - Enhanced maintainability through registry pattern
 * - Centralized error handling and validation
 * - Comprehensive logging and monitoring integration
 * 
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { createErrorResponse } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';
import { ToolRegistry } from './registry.js';
import { getCurrentTimestamp } from '../utils/timestamp.js';

/**
 * Registers and configures all Firewalla MCP tools on the server using a modular registry pattern
 * 
 * Sets up the complete toolkit of 25 distinct firewall management tools, each encapsulated
 * in its own handler class and organized by functional category. The registry pattern provides
 * clean separation of concerns and enables easy testing and maintenance.
 * 
 * Key Features:
 * - Automated tool discovery and registration through ToolRegistry
 * - Centralized error handling with detailed diagnostic information
 * - Category-based organization for better tool discoverability
 * - Comprehensive logging for debugging and monitoring
 * - Type-safe tool execution with parameter validation
 * 
 * @param server - The MCP server instance where tools will be registered
 * @param firewalla - Authenticated Firewalla client for API communication
 * @returns {void}
 * 
 * @example
 * ```typescript
 * const server = new Server({ name: 'firewalla-mcp' });
 * const client = new FirewallaClient(config);
 * setupTools(server, client);
 * 
 * // Tools are now available for MCP clients:
 * // - get_active_alarms, search_flows, get_device_status, etc.
 * ```
 * 
 * @public
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
      return await handler.execute(args || {}, firewalla);
      
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
  const categories = ['security', 'network', 'device', 'rule', 'analytics', 'search'];
  const totalCategories = categories.length;
  
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