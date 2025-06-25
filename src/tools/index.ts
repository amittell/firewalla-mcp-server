import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { ErrorHandler } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';
import { ToolRegistry } from './registry.js';
import { getCurrentTimestamp } from '../utils/timestamp.js';

/**
 * Sets up MCP tools for Firewalla firewall management using a clean registry pattern
 * 
 * This refactored version replaces the massive 1000+ line switch statement with
 * a maintainable tool registry system where each tool is a separate handler.
 * 
 * Benefits:
 * - Each tool handler is independently testable
 * - Better code organization and separation of concerns
 * - Easier to add/remove tools
 * - Reduced file size and improved readability
 * - Following Single Responsibility Principle
 * - Fixed null safety issues that existed in the original switch statement
 * 
 * Available tools:
 * Core tools:
 * - get_active_alarms: Retrieve active security alarms
 * - get_flow_data: Get network flow information
 * - get_device_status: Check device connectivity status
 * - get_bandwidth_usage: Analyze bandwidth consumption
 * - get_network_rules: Get firewall rules (with token optimization and limits)
 * - pause_rule: Temporarily disable firewall rules
 * - resume_rule: Resume paused firewall rules
 * - get_target_lists: Access security target lists
 * 
 * Specialized rule tools:
 * - get_network_rules_summary: Overview statistics and counts by category
 * - get_most_active_rules: Rules with highest hit counts for traffic analysis
 * - get_recent_rules: Recently created or modified firewall rules
 * 
 * Analytics tools:
 * - get_boxes: List all managed Firewalla boxes
 * - get_simple_statistics: Basic statistics about boxes, alarms, and rules
 * - get_statistics_by_region: Flow statistics grouped by country/region
 * - get_statistics_by_box: Statistics for each Firewalla box with activity scores
 * - get_flow_trends: Historical flow data trends over time
 * - get_alarm_trends: Historical alarm data trends over time
 * - get_rule_trends: Historical rule activity trends over time
 * 
 * Device tools:
 * - get_offline_devices: Get all offline devices with last seen timestamps
 * - get_specific_alarm: Get detailed information for a specific alarm
 * - delete_alarm: Delete/dismiss a specific alarm
 * 
 * Advanced search tools:
 * - search_flows: Advanced flow searching with complex queries
 * - search_alarms: Alarm searching with severity, time, IP filters
 * - search_rules: Rule searching with target, action, status filters
 * - search_devices: Device searching with network, status, usage filters
 * - search_target_lists: Target list searching with category, ownership filters
 * - search_cross_reference: Multi-entity searches with correlation
 * 
 * @param server - MCP server instance to register tools with
 * @param firewalla - Firewalla client for API communication
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
      return ErrorHandler.createErrorResponse(name, errorMessage, {
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