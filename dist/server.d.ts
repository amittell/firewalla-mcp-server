#!/usr/bin/env node
/**
 * @fileoverview Firewalla MCP Server
 *
 * This file implements the primary MCP server class that provides Claude with access to
 * Firewalla firewall data through 24 read-only tools that map to Firewalla API
 * endpoints, plus 11 opt-in write tools (FIREWALLA_ENABLE_WRITE_TOOLS=true).
 * Without that setting no listed tool changes anything.
 * Tools include parameter validation and error handling.
 *
 * Architecture:
 * - 19 Direct API Endpoints (read-only)
 * - 5 Convenience Wrappers (read-only)
 * - 11 opt-in write tools, named in src/config/write-tools.ts
 * - Limits set to API maximum (500)
 * - Required parameters for proper API calls
 * - CRUD operations for all resources
 * - Dual transport support (stdio and HTTP)
 *
 * @version 2.0.2
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */
/**
 * Main MCP Server class for Firewalla integration: 24 read-only tools, plus 11
 * opt-in write tools
 */
export declare class FirewallaMCPServer {
    private static signalHandlersRegistered;
    private server;
    private firewalla;
    constructor();
    /**
     * Creates a new MCP Server instance with all handlers registered.
     * Used once for stdio transport, and per-session for HTTP transport
     * (each HTTP session needs its own Server instance to avoid
     * "Already connected to a transport" errors).
     */
    private createServerInstance;
    /**
     * Registers all MCP protocol request handlers on a Server instance
     */
    private registerHandlers;
    /**
     * Starts the MCP server using configured transport (stdio or HTTP)
     */
    start(): Promise<void>;
    /**
     * Starts the MCP server using stdio transport
     */
    private startStdioTransport;
    /**
     * Starts the MCP server using HTTP transport with StreamableHTTP. Listens
     * on MCP_HTTP_HOST (default 127.0.0.1) and checks every request's Host,
     * Origin and bearer token; see http-security.ts. Exits with code 1 before
     * listening when httpStartRefusal refuses the settings: beyond loopback
     * without MCP_HTTP_BEARER_TOKEN, or with a token that is too short.
     */
    private startHttpTransport;
}
//# sourceMappingURL=server.d.ts.map