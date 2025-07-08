/**
 * @fileoverview Tool Registry - Centralized MCP Tool Management
 *
 * Implements a registry pattern for managing 32+ MCP tool handlers with clean
 * organization and easy discovery. Replaces the original monolithic switch statement
 * with a maintainable, testable architecture where each tool is encapsulated in
 * its own handler class.
 *
 * Registry Features:
 * - **Automatic Registration**: All handlers are auto-registered during construction
 * - **Category Organization**: Tools grouped by functionality (security, network, etc.)
 * - **Type Safety**: Full TypeScript support with proper handler interfaces
 * - **Easy Discovery**: Methods to find tools by name, category, or list all tools
 * - **Extensibility**: Simple registration process for adding new tools
 *
 * Tool Distribution:
 * - Security: 3 handlers (alarms, threats) + 4 bulk alarm handlers
 * - Network: 3 handlers (flows, bandwidth)
 * - Device: 1 handler (status, inventory)
 * - Rules: 7 handlers (firewall rules, management) + 6 bulk rule handlers
 * - Analytics: 7 handlers (statistics, trends)
 * - Search: 11 handlers (advanced search, correlations, geography)
 * - Bulk Operations: 10 handlers (alarm & rule bulk operations)
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import type { ToolHandler } from './handlers/base.js';
import {
  GetActiveAlarmsHandler,
  GetSpecificAlarmHandler,
  DeleteAlarmHandler,
} from './handlers/security.js';
import {
  GetFlowDataHandler,
  GetBandwidthUsageHandler,
  GetOfflineDevicesHandler,
} from './handlers/network.js';
import { GetDeviceStatusHandler } from './handlers/device.js';
import {
  GetNetworkRulesHandler,
  PauseRuleHandler,
  ResumeRuleHandler,
  GetTargetListsHandler,
  GetNetworkRulesSummaryHandler,
  GetMostActiveRulesHandler,
  GetRecentRulesHandler,
} from './handlers/rules.js';
import {
  GetBoxesHandler,
  GetSimpleStatisticsHandler,
  GetStatisticsByRegionHandler,
  GetStatisticsByBoxHandler,
  GetFlowTrendsHandler,
  GetAlarmTrendsHandler,
  GetRuleTrendsHandler,
} from './handlers/analytics.js';
import {
  SearchFlowsHandler,
  SearchAlarmsHandler,
  SearchRulesHandler,
  SearchDevicesHandler,
  SearchTargetListsHandler,
  SearchCrossReferenceHandler,
  SearchEnhancedCrossReferenceHandler,
  GetCorrelationSuggestionsHandler,
  SearchFlowsByGeographyHandler,
  SearchAlarmsByGeographyHandler,
  GetGeographicStatisticsHandler,
} from './handlers/search.js';
import {
  BulkDeleteAlarmsHandler,
  BulkDismissAlarmsHandler,
  BulkAcknowledgeAlarmsHandler,
  BulkUpdateAlarmsHandler,
} from './handlers/bulk-alarms.js';
import {
  BulkPauseRulesHandler,
  BulkResumeRulesHandler,
  BulkEnableRulesHandler,
  BulkDisableRulesHandler,
  BulkUpdateRulesHandler,
  BulkDeleteRulesHandler,
} from './handlers/bulk-rules.js';

/**
 * Central registry for managing all MCP tool handlers
 *
 * Provides a clean, organized approach to tool registration and discovery.
 * Each tool handler is automatically registered during construction and can be
 * retrieved by name, filtered by category, or listed for discovery purposes.
 *
 * The registry pattern enables:
 * - Easy addition of new tools without modifying existing code
 * - Clean separation between tool implementation and registration
 * - Type-safe tool discovery and execution
 * - Category-based tool organization for better UX
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 *
 * // Get a specific tool
 * const alarmHandler = registry.getHandler('get_active_alarms');
 *
 * // Get tools by category
 * const searchTools = registry.getToolsByCategory('search');
 *
 * // List all available tools
 * const allTools = registry.getToolNames();
 * ```
 *
 * @class
 * @public
 */
export class ToolRegistry {
  /** @private Map storing tool name to handler instances */
  private handlers = new Map<string, ToolHandler>();

  /**
   * Creates a new tool registry and automatically registers all available handlers
   *
   * @constructor
   */
  constructor() {
    this.registerHandlers();
  }

  /**
   * Automatically registers all available tool handlers organized by category
   *
   * Registers handlers across 6 functional categories with a total of 32+ tools.
   * Each handler implements the ToolHandler interface and provides a specific
   * piece of Firewalla functionality.
   *
   * @private
   * @returns {void}
   */
  private registerHandlers(): void {
    // Security tools (3 handlers)
    this.register(new GetActiveAlarmsHandler());
    this.register(new GetSpecificAlarmHandler());
    this.register(new DeleteAlarmHandler());

    // Network tools (3 handlers)
    this.register(new GetFlowDataHandler());
    this.register(new GetBandwidthUsageHandler());
    this.register(new GetOfflineDevicesHandler());

    // Device tools (1 handler)
    this.register(new GetDeviceStatusHandler());

    // Rule tools (7 handlers)
    this.register(new GetNetworkRulesHandler());
    this.register(new PauseRuleHandler());
    this.register(new ResumeRuleHandler());
    this.register(new GetTargetListsHandler());
    this.register(new GetNetworkRulesSummaryHandler());
    this.register(new GetMostActiveRulesHandler());
    this.register(new GetRecentRulesHandler());

    // Analytics tools (7 handlers)
    this.register(new GetBoxesHandler());
    this.register(new GetSimpleStatisticsHandler());
    this.register(new GetStatisticsByRegionHandler());
    this.register(new GetStatisticsByBoxHandler());
    this.register(new GetFlowTrendsHandler());
    this.register(new GetAlarmTrendsHandler());
    this.register(new GetRuleTrendsHandler());

    // Search tools (11 handlers)
    this.register(new SearchFlowsHandler());
    this.register(new SearchAlarmsHandler());
    this.register(new SearchRulesHandler());
    this.register(new SearchDevicesHandler());
    this.register(new SearchTargetListsHandler());
    this.register(new SearchCrossReferenceHandler());

    // Enhanced cross-reference and geographic search tools (5 handlers)
    this.register(new SearchEnhancedCrossReferenceHandler());
    this.register(new GetCorrelationSuggestionsHandler());
    this.register(new SearchFlowsByGeographyHandler());
    this.register(new SearchAlarmsByGeographyHandler());
    this.register(new GetGeographicStatisticsHandler());

    // Bulk operation tools (10 handlers)
    // Bulk alarm operations (4 handlers)
    this.register(new BulkDeleteAlarmsHandler());
    this.register(new BulkDismissAlarmsHandler());
    this.register(new BulkAcknowledgeAlarmsHandler());
    this.register(new BulkUpdateAlarmsHandler());

    // Bulk rule operations (6 handlers)
    this.register(new BulkPauseRulesHandler());
    this.register(new BulkResumeRulesHandler());
    this.register(new BulkEnableRulesHandler());
    this.register(new BulkDisableRulesHandler());
    this.register(new BulkUpdateRulesHandler());
    this.register(new BulkDeleteRulesHandler());
  }

  /**
   * Registers a single tool handler in the registry
   *
   * Includes duplicate registration protection to prevent accidental overwrites
   * and ensure tool registry integrity. If a tool with the same name is already
   * registered, this method will throw an error with diagnostic information.
   *
   * @param handler - The tool handler instance to register
   * @throws {Error} If a handler with the same name is already registered
   * @returns {void}
   * @public
   */
  register(handler: ToolHandler): void {
    if (this.handlers.has(handler.name)) {
      const existingHandler = this.handlers.get(handler.name);
      throw new Error(
        `Tool registration conflict: A handler named '${handler.name}' is already registered. ` +
          `Existing handler category: '${existingHandler?.category}', ` +
          `New handler category: '${handler.category}'. ` +
          `Tool names must be unique across the registry.`
      );
    }

    this.handlers.set(handler.name, handler);
  }

  /**
   * Forcefully registers a tool handler, replacing any existing handler with the same name
   *
   * Use this method only when you explicitly want to replace an existing handler.
   * This bypasses the duplicate registration protection for testing or dynamic
   * handler replacement scenarios.
   *
   * @param handler - The tool handler instance to register
   * @param reason - Optional reason for the forced registration (for logging)
   * @returns {string | null} Name of the replaced handler if any, null otherwise
   * @public
   */
  forceRegister(handler: ToolHandler, reason?: string): string | null {
    const existingHandler = this.handlers.get(handler.name);

    if (existingHandler && reason) {
      // Optional logging for forced replacements using stderr to avoid no-console lint issue
      process.stderr.write(
        `[WARNING] Forced tool registration: Replacing '${handler.name}' ` +
          `(${existingHandler.category} -> ${handler.category}). Reason: ${reason}\n`
      );
    }

    this.handlers.set(handler.name, handler);
    return existingHandler ? existingHandler.name : null;
  }

  /**
   * Retrieves a tool handler by its registered name
   *
   * @param toolName - The name of the tool to retrieve
   * @returns The tool handler if found, undefined otherwise
   * @public
   */
  getHandler(toolName: string): ToolHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Gets a list of all registered tool names
   *
   * Useful for tool discovery, error messages, and debugging.
   *
   * @returns Array of all registered tool names
   * @public
   */
  getToolNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Retrieves all tools belonging to a specific category
   *
   * Categories include: 'security', 'network', 'device', 'rule', 'analytics', 'search'
   *
   * @param category - The category to filter by
   * @returns Array of tool handlers in the specified category
   * @public
   */
  getToolsByCategory(category: string): ToolHandler[] {
    return Array.from(this.handlers.values()).filter(
      handler => handler.category === category
    );
  }

  /**
   * Checks if a tool with the given name is registered
   *
   * @param toolName - The tool name to check
   * @returns True if the tool is registered, false otherwise
   * @public
   */
  isRegistered(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}
