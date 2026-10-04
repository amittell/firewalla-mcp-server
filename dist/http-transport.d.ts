/**
 * @fileoverview The HTTP server behind MCP_TRANSPORT=http
 *
 * Serves the MCP Streamable HTTP transport at one path, with one MCP Server
 * instance per session. Every request passes the Host, Origin and bearer
 * token checks in http-security.ts before anything else runs.
 */
import { type IncomingMessage, type Server as HttpServer } from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { type HttpSecurityConfig } from './http-security.js';
/** Largest request body read, in bytes */
export declare const MAX_BODY_BYTES: number;
/** Time a client has to send a request's headers, in milliseconds */
export declare const HEADERS_TIMEOUT_MS = 10000;
/**
 * Time a client has to send a whole request, headers and body, in
 * milliseconds. It ends when the request has arrived, so it does not cut off
 * a long SSE response.
 */
export declare const REQUEST_TIMEOUT_MS = 30000;
export interface HttpTransportOptions {
    /** Path the MCP endpoint is served at, e.g. /mcp */
    path: string;
    security: HttpSecurityConfig;
    /** Creates the MCP Server instance for a new session */
    createServerInstance: () => Server;
    /**
     * Sessions idle this long are closed. Default: MCP_SESSION_IDLE_TIMEOUT_MS,
     * else 30 minutes.
     */
    idleTimeoutMs?: number;
}
export interface HttpTransportServer {
    httpServer: HttpServer;
    /** Closes every session and stops the idle-session sweep */
    closeSessions: () => Promise<void>;
}
/**
 * Whether a request target names the MCP endpoint: its path is `path`, or
 * `path` with one trailing slash, with or without a query string. Any other
 * path, including /mcpx, /mcp-typo and /mcp/x for /mcp, is not the endpoint.
 */
export declare function isEndpointPath(url: string | undefined, path: string): boolean;
/**
 * Reads a JSON request body of at most maxBytes. Over the limit is a 413,
 * a body that is not JSON a 400, and an empty body undefined.
 */
export declare function readJsonBody(req: IncomingMessage, maxBytes?: number): Promise<unknown>;
/**
 * Creates the HTTP server for the MCP Streamable HTTP transport. It does not
 * listen; see listenHttpTransport.
 */
export declare function createHttpTransportServer(options: HttpTransportOptions): HttpTransportServer;
/**
 * Starts listening on host:port and logs how the server is exposed. Warns
 * when it accepts connections from other machines without a bearer token,
 * which the server does only with MCP_HTTP_ALLOW_NO_TOKEN=true (see
 * httpStartRefusal).
 */
export declare function listenHttpTransport(httpServer: HttpServer, port: number, path: string, security: HttpSecurityConfig): Promise<void>;
//# sourceMappingURL=http-transport.d.ts.map