/**
 * @fileoverview Tool Registry
 *
 * Implements a registry pattern for managing the MCP tool handlers with clean
 * organization and easy discovery. Each tool maps to Firewalla API endpoints
 * with parameter validation.
 *
 * Registry Features:
 * - **Automatic Registration**: The 24 read-only handlers are registered during
 *   construction, and the 11 write tools too with FIREWALLA_ENABLE_WRITE_TOOLS=true
 * - **API Mapping**: Direct mapping to verified Firewalla API endpoints
 * - **Type Safety**: Full TypeScript support with proper handler interfaces
 * - **Easy Discovery**: Methods to find tools by name, category, or list all tools
 * - **Proper Schemas**: All limits set to API maximum (500), required parameters added
 * - **CRUD Operations**: Create, Read, Update, Delete operations for all resources
 *
 * 24 read-only tools, always registered:
 * - Direct API Endpoints (19 tools):
 *   * Security: 2 handlers (get_active_alarms, get_specific_alarm)
 *   * Network: 1 handler (get_flow_data)
 *   * Device: 1 handler (get_device_status)
 *   * Rules: 3 handlers (get_network_rules, get_target_lists, get_specific_target_list)
 *   * Search: 3 handlers (search_flows, search_alarms, search_rules)
 *   * Analytics: 9 handlers (get_boxes, get_simple_statistics, get_statistics_by_region,
 *     get_statistics_by_box, get_recent_flow_activity, get_flow_insights,
 *     get_flow_trends, get_alarm_trends, get_rule_trends)
 * - Convenience Wrappers (5 tools):
 *   * get_bandwidth_usage, get_offline_devices, search_devices, search_target_lists, get_network_rules_summary
 * - Write tools (11, opt-in with FIREWALLA_ENABLE_WRITE_TOOLS=true; the names
 *   are WRITE_TOOL_NAMES in src/config/write-tools.ts):
 *   * create_rule, delete_rule, pause_rule, resume_rule, create_target_list,
 *     update_target_list, delete_target_list, rename_device, archive_alarm,
 *     mute_alarm, delete_alarm
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */
import type { ToolHandler } from './handlers/base.js';
/**
 * Central registry for managing the MCP tool handlers
 *
 * Provides a clean, organized approach to tool registration and discovery.
 * Each tool handler maps to actual Firewalla API endpoints with corrected
 * schemas and proper parameter validation for API coverage.
 *
 * The registry pattern enables:
 * - 24 read-only tools (19 direct API + 5 convenience wrappers), plus 11
 *   opt-in write tools
 * - Comprehensive Firewalla API coverage including CRUD operations
 * - Clean separation between tool implementation and registration
 * - Type-safe tool discovery and execution
 * - API-verified tool schemas with corrected limits and required parameters
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
 * // List all available tools (24, or 35 with write tools enabled)
 * const allTools = registry.getToolNames();
 * ```
 *
 * @class
 * @public
 */
export declare class ToolRegistry {
    /** @private Map storing tool name to handler instances */
    private handlers;
    /**
     * Creates a new tool registry and automatically registers all available handlers
     *
     * @param options.enableWriteTools - Also register the write tools named in
     *   WRITE_TOOL_NAMES. Defaults to FIREWALLA_ENABLE_WRITE_TOOLS=true.
     * @constructor
     */
    constructor(options?: {
        enableWriteTools?: boolean;
    });
    /**
     * Registers the tool handlers: the 24 read-only tools (19 direct API
     * endpoints and 5 convenience wrappers), and with `enableWriteTools` the 11
     * write tools. A tool counts as a write tool when WRITE_TOOL_NAMES in
     * src/config/write-tools.ts names it, the same list that decides whether
     * the server lists it, so registering and listing cannot disagree.
     *
     * @private
     * @returns {void}
     */
    private registerHandlers;
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
    register(handler: ToolHandler): void;
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
    forceRegister(handler: ToolHandler, reason?: string): string | null;
    /**
     * Retrieves a tool handler by its registered name
     *
     * @param toolName - The name of the tool to retrieve
     * @returns The tool handler if found, undefined otherwise
     * @public
     */
    getHandler(toolName: string): ToolHandler | undefined;
    /**
     * Gets a list of all registered tool names
     *
     * Useful for tool discovery, error messages, and debugging.
     *
     * @returns Array of all registered tool names
     * @public
     */
    getToolNames(): string[];
    /**
     * Retrieves all tools belonging to a specific category
     *
     * Categories include: 'security', 'network', 'device', 'rule', 'analytics', 'search'
     *
     * @param category - The category to filter by
     * @returns Array of tool handlers in the specified category
     * @public
     */
    getToolsByCategory(category: string): ToolHandler[];
    /**
     * Checks if a tool with the given name is registered
     *
     * @param toolName - The tool name to check
     * @returns True if the tool is registered, false otherwise
     * @public
     */
    isRegistered(toolName: string): boolean;
}
//# sourceMappingURL=registry.d.ts.map