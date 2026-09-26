/**
 * @fileoverview Access checks for the Streamable HTTP transport
 *
 * The MCP transport specification says a Streamable HTTP server MUST validate
 * the Origin header of every request and SHOULD listen only on localhost when
 * it runs locally: otherwise any web page the user opens can send requests to
 * the server, directly or by rebinding its own DNS name to 127.0.0.1. Every
 * request to this server can spend the Firewalla MSP token, so this module
 * reads the MCP_HTTP_* variables into these checks:
 *
 * - MCP_HTTP_HOST: the address to listen on (default 127.0.0.1)
 * - MCP_HTTP_ALLOWED_HOSTS: host names to accept in the Host header, besides
 *   localhost, 127.0.0.1, [::1] and MCP_HTTP_HOST (comma-separated)
 * - MCP_HTTP_ALLOWED_ORIGINS: browser origins to accept (comma-separated,
 *   e.g. http://localhost:6274). A request without an Origin header, which is
 *   what non-browser MCP clients send, is accepted; any other Origin is refused.
 * - MCP_HTTP_BEARER_TOKEN: when set, every request must carry
 *   `Authorization: Bearer <token>`
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Address the HTTP transport listens on when MCP_HTTP_HOST is not set */
export const DEFAULT_HTTP_HOST = '127.0.0.1';

/** Host header names accepted whatever the configuration */
const LOOPBACK_HOST_NAMES = ['localhost', '127.0.0.1', '[::1]'];

/** Listen addresses that mean every interface, which no Host header names */
const WILDCARD_ADDRESSES = new Set(['0.0.0.0', '::']);

/** host or [ipv6], then an optional :port, and nothing else */
const HOST_HEADER = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d{1,5})?$/i;

/** Request headers a browser client may send, for CORS preflight answers */
const CORS_ALLOW_HEADERS =
  'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID';

/** Response headers a browser client needs to read */
const CORS_EXPOSE_HEADERS = 'Mcp-Session-Id, Mcp-Protocol-Version';

export interface HttpSecurityConfig {
  /** Address the server listens on */
  host: string;
  /** Host header names accepted: lowercase, IPv6 in brackets, no port */
  allowedHosts: ReadonlySet<string>;
  /** Origin header values accepted, as URL.origin serializes them */
  allowedOrigins: ReadonlySet<string>;
  /** Token every request must present, when set */
  bearerToken?: string;
}

/** Why a request was refused: the status and a message for the client */
export interface HttpRefusal {
  status: 401 | 403;
  message: string;
  headers?: Record<string, string>;
}

function listFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

/**
 * The host name a Host header names, lowercase and without its port, or
 * undefined when the header is missing or is not a plain host[:port].
 */
export function hostNameOf(hostHeader: string | undefined): string | undefined {
  const match = HOST_HEADER.exec(hostHeader?.trim() ?? '');
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * An http(s) origin as browsers send it (scheme://host[:port], default port
 * left out), or undefined for anything else, including the opaque "null".
 */
export function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

/** A configured host name as the Host header check compares it */
function hostEntry(value: string, variable: string): string {
  // A bare IPv6 address (::1) appears in the Host header in brackets
  const colons = value.split(':').length - 1;
  const candidate = colons > 1 && !value.startsWith('[') ? `[${value}]` : value;
  const name = hostNameOf(candidate);
  if (!name) {
    throw new Error(
      `${variable}: "${value}" is not a host name or IP address, e.g. localhost or 192.168.1.10`
    );
  }
  return name;
}

/**
 * Reads the HTTP transport's access settings from the environment.
 *
 * @throws {Error} If MCP_HTTP_HOST, MCP_HTTP_ALLOWED_HOSTS or
 * MCP_HTTP_ALLOWED_ORIGINS holds something that is not a host or an origin
 */
export function parseHttpSecurityConfig(
  env: typeof process.env = process.env
): HttpSecurityConfig {
  const host = env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;

  const allowedHosts = new Set(LOOPBACK_HOST_NAMES);
  if (!WILDCARD_ADDRESSES.has(host)) {
    allowedHosts.add(hostEntry(host, 'MCP_HTTP_HOST'));
  }
  for (const entry of listFromEnv(env.MCP_HTTP_ALLOWED_HOSTS)) {
    allowedHosts.add(hostEntry(entry, 'MCP_HTTP_ALLOWED_HOSTS'));
  }

  const allowedOrigins = new Set<string>();
  for (const entry of listFromEnv(env.MCP_HTTP_ALLOWED_ORIGINS)) {
    const origin = normalizeOrigin(entry);
    if (!origin) {
      throw new Error(
        `MCP_HTTP_ALLOWED_ORIGINS: "${entry}" is not an http(s) origin, e.g. http://localhost:6274; list each origin, there is no wildcard`
      );
    }
    allowedOrigins.add(origin);
  }

  const bearerToken = env.MCP_HTTP_BEARER_TOKEN?.trim() || undefined;

  return { host, allowedHosts, allowedOrigins, bearerToken };
}

/** Whether an address only accepts connections from this machine */
export function isLoopbackAddress(host: string): boolean {
  const name = host.toLowerCase();
  return (
    name === 'localhost' ||
    name === '::1' ||
    name === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
  );
}

/**
 * Whether an Authorization header carries the bearer token. Both sides are
 * hashed first so the comparison takes the same time whatever the lengths.
 */
export function bearerTokenMatches(
  authorization: string | undefined,
  token: string
): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
  const presented = match ? match[1].trim() : '';
  const expected = createHash('sha256').update(token).digest();
  const actual = createHash('sha256').update(presented).digest();
  return timingSafeEqual(expected, actual) && match !== null;
}

/**
 * The Origin of a request when it is present and allowed, for the CORS
 * headers; undefined when there is none. Call after checkHttpRequest.
 */
export function allowedOriginOf(
  req: IncomingMessage,
  config: HttpSecurityConfig
): string | undefined {
  const { origin } = req.headers;
  if (origin === undefined) {
    return undefined;
  }
  const normalized = normalizeOrigin(origin);
  return normalized && config.allowedOrigins.has(normalized)
    ? origin
    : undefined;
}

/**
 * Checks the Host and Origin headers, then the bearer token when one is
 * configured. Returns why the request is refused, or undefined to serve it.
 *
 * @param checkToken - false for a CORS preflight, which browsers send
 *   without credentials
 */
export function checkHttpRequest(
  req: IncomingMessage,
  config: HttpSecurityConfig,
  checkToken = true
): HttpRefusal | undefined {
  const { host } = req.headers;
  const hostName = hostNameOf(host);
  if (!hostName || !config.allowedHosts.has(hostName)) {
    return {
      status: 403,
      message: `Host not allowed: ${host ?? '(none)'}. Add the name to MCP_HTTP_ALLOWED_HOSTS to accept it.`,
    };
  }

  const { origin } = req.headers;
  if (origin !== undefined && !allowedOriginOf(req, config)) {
    return {
      status: 403,
      message: `Origin not allowed: ${origin}. Add it to MCP_HTTP_ALLOWED_ORIGINS to accept it.`,
    };
  }

  if (
    checkToken &&
    config.bearerToken !== undefined &&
    !bearerTokenMatches(req.headers.authorization, config.bearerToken)
  ) {
    return {
      status: 401,
      message:
        'Unauthorized: send Authorization: Bearer <MCP_HTTP_BEARER_TOKEN>',
      headers: { 'WWW-Authenticate': 'Bearer' },
    };
  }

  return undefined;
}

/** CORS headers for a response to an allowed browser origin */
export function corsResponseHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': CORS_EXPOSE_HEADERS,
    Vary: 'Origin',
  };
}

/** CORS headers for the answer to an allowed browser origin's preflight */
export function corsPreflightHeaders(origin: string): Record<string, string> {
  return {
    ...corsResponseHeaders(origin),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE',
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
  };
}
