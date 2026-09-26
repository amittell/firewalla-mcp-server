/**
 * @fileoverview The HTTP server behind MCP_TRANSPORT=http
 *
 * Serves the MCP Streamable HTTP transport at one path, with one MCP Server
 * instance per session. Every request passes the Host, Origin and bearer
 * token checks in http-security.ts before anything else runs.
 */

import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { initializeHttpSession } from './http-session.js';
import {
  checkHttpRequest,
  allowedOriginOf,
  corsPreflightHeaders,
  corsResponseHeaders,
  isLoopbackAddress,
  type HttpSecurityConfig,
} from './http-security.js';
import { logger } from './monitoring/logger.js';

/** Largest request body read, in bytes */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Time a client has to send a request's headers, in milliseconds */
export const HEADERS_TIMEOUT_MS = 10_000;

/**
 * Time a client has to send a whole request, headers and body, in
 * milliseconds. It ends when the request has arrived, so it does not cut off
 * a long SSE response.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** An error that becomes an HTTP status and a JSON-RPC error body */
class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {}
): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null })
  );
}

/**
 * Makes Node close the connection once the answer is sent. Call it before
 * answering a request whose body is not read. Otherwise Node keeps the
 * connection open to read and discard the rest of the body, so a client that
 * sends a body slowly, or never, holds the connection without a token: a byte
 * every 2 s held it for 60 s, until the request timeout and its check interval.
 */
function closeAfterAnswer(res: ServerResponse): void {
  res.setHeader('Connection', 'close');
}

/**
 * Reads a JSON request body of at most maxBytes. Over the limit is a 413,
 * a body that is not JSON a 400, and an empty body undefined.
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = MAX_BODY_BYTES
): Promise<unknown> {
  const tooLarge = new HttpRequestError(
    413,
    -32000,
    `Request body too large (max ${maxBytes} bytes)`
  );
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLarge;
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > maxBytes) {
        settle(() => reject(tooLarge));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      settle(() => {
        // Decode once: a multi-byte character can straddle two chunks
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text) {
          resolve(undefined);
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(
            new HttpRequestError(
              400,
              -32700,
              'Parse error: request body is not valid JSON'
            )
          );
        }
      });
    });
    req.on('error', error => settle(() => reject(error)));
    req.on('close', () =>
      settle(() => reject(new Error('Request closed before its body arrived')))
    );
  });
}

/**
 * Creates the HTTP server for the MCP Streamable HTTP transport. It does not
 * listen; see listenHttpTransport.
 */
export function createHttpTransportServer(
  options: HttpTransportOptions
): HttpTransportServer {
  const { path, security, createServerInstance } = options;

  // Transports and their Server instances, by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const servers = new Map<string, Server>();

  // Abandoned-session reaper: transport.onclose only fires on an explicit
  // client DELETE or shutdown, so clients that crash / lose network would pin
  // their Server + transport in the maps forever. Stamp activity per request
  // and close sessions idle past the timeout.
  const lastActivity = new Map<string, number>();
  const idleTimeoutMs =
    options.idleTimeoutMs ??
    (Number(process.env.MCP_SESSION_IDLE_TIMEOUT_MS) || 30 * 60 * 1000);
  const reapEveryMs = Math.min(60_000, idleTimeoutMs); // sweep at least as often as the timeout
  const reaper = setInterval(() => {
    const now = Date.now();
    for (const [sid, seen] of lastActivity.entries()) {
      if (!transports.has(sid)) {
        lastActivity.delete(sid); // closed elsewhere; drop the stamp
      } else if (now - seen > idleTimeoutMs) {
        logger.info(`Reaping idle HTTP session: ${sid}`);
        lastActivity.delete(sid);
        void transports.get(sid)?.close(); // onclose cleans transports/servers
      }
    }
  }, reapEveryMs);
  reaper.unref();

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    // Host, Origin and token before anything else. A CORS preflight carries
    // no credentials, so it is checked for Host and Origin only. Every answer
    // before the POST body is read closes the connection.
    const isPreflight =
      req.method === 'OPTIONS' && req.headers.origin !== undefined;
    const refusal = checkHttpRequest(req, security, !isPreflight);
    if (refusal) {
      logger.warn(`Refused HTTP request: ${refusal.message}`, {
        method: req.method,
        status: refusal.status,
      });
      closeAfterAnswer(res);
      sendJsonRpcError(
        res,
        refusal.status,
        -32000,
        refusal.message,
        refusal.headers
      );
      return;
    }

    const origin = allowedOriginOf(req, security);
    if (origin) {
      if (isPreflight) {
        closeAfterAnswer(res);
        res.writeHead(204, corsPreflightHeaders(origin));
        res.end();
        return;
      }
      for (const [name, value] of Object.entries(corsResponseHeaders(origin))) {
        res.setHeader(name, value);
      }
    }

    // Only handle requests to our configured path
    if (!req.url?.startsWith(path)) {
      closeAfterAnswer(res);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      lastActivity.set(sessionId, Date.now());
    }

    // Validate session ID format if present
    if (sessionId && !UUID_V4.test(sessionId)) {
      closeAfterAnswer(res);
      sendJsonRpcError(
        res,
        400,
        -32000,
        'Invalid session ID format (must be UUID v4)'
      );
      return;
    }

    if (req.method === 'POST') {
      const parsedBody = await readJsonBody(req);

      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = transports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(parsedBody)) {
        // New initialization request - create new transport
        // Generate session ID immediately to prevent race condition
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (initializedSessionId: string) => {
            logger.info(`HTTP session initialized: ${initializedSessionId}`);
            // Transport already in map, no need to add again
          },
        });

        lastActivity.set(newSessionId, Date.now());
        await initializeHttpSession({
          sessionId: newSessionId,
          transport,
          transports,
          servers,
          createServerInstance,
        });
      } else {
        // Invalid request - no session ID or not initialization request
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: No valid session ID provided'
        );
        return;
      }

      await transport.handleRequest(req, res, parsedBody);
    } else if (req.method === 'GET' || req.method === 'DELETE') {
      // GET opens the SSE stream, DELETE ends the session
      if (!sessionId || !transports.has(sessionId)) {
        closeAfterAnswer(res);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid or missing session ID');
        return;
      }

      await transports.get(sessionId)!.handleRequest(req, res);
    } else {
      closeAfterAnswer(res);
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
    }
  };

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpRequestError) {
        if (!res.headersSent) {
          // Stop reading a body that was refused, rather than drain it
          closeAfterAnswer(res);
          sendJsonRpcError(res, error.status, error.code, error.message);
        }
        return;
      }
      logger.error(
        'Error handling HTTP request:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      }
    });
  });

  // Node's defaults give a client 60 s for the headers and 300 s for the
  // whole request; a request here is at most 1 MB of JSON.
  httpServer.headersTimeout = HEADERS_TIMEOUT_MS;
  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;

  const closeSessions = async (): Promise<void> => {
    clearInterval(reaper);
    for (const [sessionId, transport] of transports.entries()) {
      try {
        await transport.close();
        transports.delete(sessionId);
        servers.delete(sessionId);
      } catch (error) {
        logger.error(
          `Error closing transport for session ${sessionId}:`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  };

  return { httpServer, closeSessions };
}

/**
 * Starts listening on host:port and logs how the server is exposed. Warns
 * when it accepts connections from other machines without a bearer token.
 */
export async function listenHttpTransport(
  httpServer: HttpServer,
  port: number,
  path: string,
  security: HttpSecurityConfig
): Promise<void> {
  httpServer.on('error', (err: Error) => {
    logger.error('HTTP server error (port conflict or permission issue):', err);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, security.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const boundPort =
    typeof address === 'object' && address ? address.port : port;
  const shownHost = security.host.includes(':')
    ? `[${security.host}]`
    : security.host;
  logger.info('Firewalla MCP Server running on HTTP transport');
  logger.info(
    `HTTP server listening on http://${shownHost}:${boundPort}${path}`,
    {
      authorization: security.bearerToken ? 'bearer' : 'none',
      allowed_hosts: [...security.allowedHosts],
      allowed_origins: [...security.allowedOrigins],
    }
  );
  if (!isLoopbackAddress(security.host) && !security.bearerToken) {
    logger.warn(
      `HTTP transport is listening on ${security.host}, not only on this machine's loopback, without MCP_HTTP_BEARER_TOKEN: any client that reaches port ${boundPort} can use the Firewalla MSP token through it. Set MCP_HTTP_BEARER_TOKEN; outside a container, MCP_HTTP_HOST=127.0.0.1 keeps the server local.`
    );
  }
}
