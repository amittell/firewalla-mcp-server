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
 * - **Search (5 tools)**: Flow, alarm, rule, device and target-list search
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
import type { FirewallaClient } from '../firewalla/client.js';
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
export declare function setupTools(server: Server, firewalla: FirewallaClient, options?: SetupToolsOptions): void;
//# sourceMappingURL=index.d.ts.map