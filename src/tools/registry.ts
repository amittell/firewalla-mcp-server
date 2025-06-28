/**
<<<<<<< HEAD
 * Tool Registry - Centralized management of MCP tools
 * 
 * This registry pattern replaces the massive switch statement with a cleaner,
 * more maintainable architecture where each tool is a separate handler.
=======
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
 * - Security: 3 handlers (alarms, threats)
 * - Network: 3 handlers (flows, bandwidth)
 * - Device: 1 handler (status, inventory)
 * - Rules: 7 handlers (firewall rules, management)
 * - Analytics: 7 handlers (statistics, trends)
 * - Search: 11 handlers (advanced search, correlations, geography)
 * 
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
 */

import { ToolHandler } from './handlers/base.js';
import { GetActiveAlarmsHandler, GetSpecificAlarmHandler, DeleteAlarmHandler } from './handlers/security.js';
import { GetFlowDataHandler, GetBandwidthUsageHandler, GetOfflineDevicesHandler } from './handlers/network.js';
import { GetDeviceStatusHandler } from './handlers/device.js';
import { 
  GetNetworkRulesHandler, 
  PauseRuleHandler, 
  ResumeRuleHandler, 
  GetTargetListsHandler,
  GetNetworkRulesSummaryHandler,
  GetMostActiveRulesHandler,
  GetRecentRulesHandler
} from './handlers/rules.js';
import { 
  GetBoxesHandler,
  GetSimpleStatisticsHandler,
  GetStatisticsByRegionHandler,
  GetStatisticsByBoxHandler,
  GetFlowTrendsHandler,
  GetAlarmTrendsHandler,
  GetRuleTrendsHandler
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
  GetGeographicStatisticsHandler
} from './handlers/search.js';

<<<<<<< HEAD
export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>();

=======
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
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
  constructor() {
    this.registerHandlers();
  }

  /**
<<<<<<< HEAD
   * Register all tool handlers
=======
   * Automatically registers all available tool handlers organized by category
   * 
   * Registers handlers across 6 functional categories with a total of 32+ tools.
   * Each handler implements the ToolHandler interface and provides a specific
   * piece of Firewalla functionality.
   * 
   * @private
   * @returns {void}
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
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
  }

  /**
<<<<<<< HEAD
   * Register a tool handler
=======
   * Registers a single tool handler in the registry
   * 
   * @param handler - The tool handler instance to register
   * @returns {void}
   * @public
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
   */
  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  /**
<<<<<<< HEAD
   * Get a tool handler by name
=======
   * Retrieves a tool handler by its registered name
   * 
   * @param toolName - The name of the tool to retrieve
   * @returns The tool handler if found, undefined otherwise
   * @public
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
   */
  getHandler(toolName: string): ToolHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
<<<<<<< HEAD
   * Get all registered tool names
=======
   * Gets a list of all registered tool names
   * 
   * Useful for tool discovery, error messages, and debugging.
   * 
   * @returns Array of all registered tool names
   * @public
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
   */
  getToolNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
<<<<<<< HEAD
   * Get tools by category
=======
   * Retrieves all tools belonging to a specific category
   * 
   * Categories include: 'security', 'network', 'device', 'rule', 'analytics', 'search'
   * 
   * @param category - The category to filter by
   * @returns Array of tool handlers in the specified category
   * @public
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
   */
  getToolsByCategory(category: string): ToolHandler[] {
    return Array.from(this.handlers.values()).filter(handler => handler.category === category);
  }

  /**
<<<<<<< HEAD
   * Check if a tool is registered
=======
   * Checks if a tool with the given name is registered
   * 
   * @param toolName - The tool name to check
   * @returns True if the tool is registered, false otherwise
   * @public
>>>>>>> origin/feature/comprehensive-jsdoc-documentation
   */
  isRegistered(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}