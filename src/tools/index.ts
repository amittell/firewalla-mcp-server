/**
 * @fileoverview MCP Tool Setup and Registry Management
 *
 * Implements a clean, modular registry pattern for managing the MCP tools (24
 * read-only, plus 11 write tools with FIREWALLA_ENABLE_WRITE_TOOLS=true) that
 * provide Firewalla firewall monitoring and management capabilities. Replaces
 * the original 1000+ line switch statement with maintainable, testable handler classes.
 *
 * Tool Categories:
 * - **Security (3 tools)**: Alarm management and threat monitoring
 * - **Network (3 tools)**: Flow analysis and bandwidth monitoring
 * - **Device (1 tool)**: Device status and inventory management
 * - **Rule (7 tools)**: Firewall rule configuration and analytics
 * - **Analytics (7 tools)**: Statistical analysis and trend reporting
 * - **Search (11 tools)**: Advanced search with cross-reference capabilities
 * - **Bulk Operations (3 tools)**: Alarm and rule bulk management
 *
 * Architecture Benefits:
 * - Single Responsibility Principle for each tool handler
 * - Improved testability with isolated handler units
 * - Enhanced maintainability through registry pattern
 * - Centralized error handling and validation
 * - Comprehensive logging and monitoring integration
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FirewallaClient } from '../firewalla/client.js';
import { createErrorResponse, ErrorType } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';
import { ToolRegistry } from './registry.js';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import {
  takeResponseFormat,
  toMarkdownResponse,
  type ResponseFormat,
} from '../utils/response-format.js';

import { metrics } from '../monitoring/metrics.js';

/** Options for setupTools */
export interface SetupToolsOptions {
  /**
   * The tools that take response_format: the read-only tools src/server.ts
   * lists. Their calls lose the argument before the tool sees it, and a
   * markdown call's success response is rendered as markdown. Any other tool
   * gets its arguments as sent. Default: none.
   */
  responseFormatTools?: ReadonlySet<string>;
  /** Most rows a markdown table shows (default 100) */
  markdownMaxRows?: number;
}

/**
 * Registers and configures all Firewalla MCP tools on the server using a modular registry pattern
 *
 * Sets up the registered firewall tools (see ToolRegistry), each encapsulated
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
 * @param options - Which tools take response_format, and the markdown row cap
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
export function setupTools(
  server: Server,
  firewalla: FirewallaClient,
  options: SetupToolsOptions = {}
): void {
  // The registry holds the read-only tools, and the write tools when enabled
  const toolRegistry = new ToolRegistry();

  // Set up the main request handler using the registry
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name } = request.params;
    let args = request.params.arguments;

    const startTime = Date.now();

    try {
      // Get handler from the registry
      const handler = toolRegistry.getHandler(name);
      if (!handler) {
        const availableTools = toolRegistry.getToolNames() || [];
        throw new Error(
          `Unknown tool: ${name}. Available tools: ${availableTools.join(', ')}`
        );
      }

      // response_format is handled here, for every read tool, and never
      // reaches the tool
      let format: ResponseFormat = 'json';
      if (options.responseFormatTools?.has(name)) {
        const taken = takeResponseFormat(args);
        if ('error' in taken) {
          return createErrorResponse(
            name,
            taken.error,
            ErrorType.VALIDATION_ERROR,
            { response_format: args?.response_format },
            [taken.error]
          );
        }
        ({ format, args } = taken);
      }

      // Execute the tool handler with proper error handling
      logger.debug(
        `Executing tool: ${name} with handler: ${handler.constructor.name}`
      );
      const response = await handler.execute(args || {}, firewalla);

      // <add success telemetry>
      metrics.count('tool.success');
      metrics.timing('tool.latency_ms', Date.now() - startTime);
      // </add>

      return format === 'markdown'
        ? toMarkdownResponse(name, response, {
            maxRows: options.markdownMaxRows,
          })
        : response;
    } catch (error: unknown) {
      // <add error metric>
      metrics.count('tool.error');
      // </add>
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Tool execution failed for ${name}:`, error as Error);

      // Use centralized error handling
      return createErrorResponse(name, errorMessage, ErrorType.UNKNOWN_ERROR, {
        timestamp: getCurrentTimestamp(),
        error_type:
          error instanceof Error ? error.constructor.name : 'UnknownError',
        available_tools: toolRegistry.getToolNames() || [],
      });
    }
  });

  const allToolNames = toolRegistry.getToolNames() || [];
  const categories = [
    'security',
    'network',
    'device',
    'rule',
    'analytics',
    'search',
  ];
  const totalCategories = categories.length;

  logger.info(
    `MCP tools setup complete. Registry contains ${allToolNames.length} handlers across ${totalCategories} categories.`
  );
  logger.info(`Registered tools: ${allToolNames.join(', ')}`);
}

/**
 * Migration Complete!
 *
 * ✅ Migrated to Registry (35 handlers total):
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
