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
 * - MCP_HTTP_HOST: the address to listen on (default 127.0.0.1), without a
 *   port; an IPv6 address with or without brackets
 * - MCP_HTTP_ALLOWED_HOSTS: host names to accept in the Host header, besides
 *   localhost, 127.0.0.1, [::1] and MCP_HTTP_HOST (comma-separated)
 * - MCP_HTTP_ALLOWED_ORIGINS: browser origins to accept (comma-separated,
 *   e.g. http://localhost:6274; a path is dropped, and there is no
 *   wildcard, so an entry whose host has `*` is refused at startup). A
 *   request without an Origin header, which is what non-browser MCP clients
 *   send, is accepted; any other Origin is refused.
 * - MCP_HTTP_BEARER_TOKEN: when set, every request must carry
 *   `Authorization: Bearer <token>`. At least MIN_BEARER_TOKEN_LENGTH
 *   characters, and required when MCP_HTTP_HOST is not a loopback address
 * - MCP_HTTP_ALLOW_NO_TOKEN: `true` starts the server beyond loopback without
 *   a token, for a network no untrusted machine can reach
 */
import type { IncomingMessage } from 'node:http';
/** Address the HTTP transport listens on when MCP_HTTP_HOST is not set */
export declare const DEFAULT_HTTP_HOST = "127.0.0.1";
/**
 * Shortest MCP_HTTP_BEARER_TOKEN accepted, in characters. A length cannot
 * tell a random token from a chosen one, but it refuses the values typed to
 * try the setting out (x, test, changeme). 16 random hex characters are 64
 * bits, and `openssl rand -hex 32` prints 64 characters.
 */
export declare const MIN_BEARER_TOKEN_LENGTH = 16;
export interface HttpSecurityConfig {
    /** Address the server listens on */
    host: string;
    /** Host header names accepted: lowercase, IPv6 in brackets, no port */
    allowedHosts: ReadonlySet<string>;
    /** Origin header values accepted, as URL.origin serializes them */
    allowedOrigins: ReadonlySet<string>;
    /** Token every request must present, when set */
    bearerToken?: string;
    /** MCP_HTTP_ALLOW_NO_TOKEN=true: start beyond loopback without a token */
    allowNoToken: boolean;
}
/** Why a request was refused: the status and a message for the client */
export interface HttpRefusal {
    status: 401 | 403;
    message: string;
    headers?: Record<string, string>;
}
/**
 * The host name a Host header names, lowercase and without its port, or
 * undefined when the header is missing or is not a plain host[:port].
 */
export declare function hostNameOf(hostHeader: string | undefined): string | undefined;
/**
 * An http(s) origin as browsers send it (scheme://host[:port], default port
 * left out), or undefined for anything else, including the opaque "null".
 */
export declare function normalizeOrigin(value: string): string | undefined;
/**
 * The address MCP_HTTP_HOST names, as server.listen takes it: a host name, an
 * IPv4 address or a bare IPv6 address. [::1] loses its brackets. A port is
 * refused: server.listen would look the whole value up as a host name and
 * fail with ENOTFOUND, and the port is MCP_HTTP_PORT.
 *
 * @throws {Error} If the value has a port or is not a host name or address
 */
export declare function parseListenAddress(value: string): string;
/**
 * Reads the HTTP transport's access settings from the environment.
 *
 * @throws {Error} If MCP_HTTP_HOST is not an address to listen on, or
 * MCP_HTTP_ALLOWED_HOSTS or MCP_HTTP_ALLOWED_ORIGINS holds something that is
 * not a host or an origin
 */
export declare function parseHttpSecurityConfig(env?: typeof process.env): HttpSecurityConfig;
/**
 * Whether an address only accepts connections from this machine: a valid
 * IPv4 address in 127.0.0.0/8, ::1 in any valid spelling (with or without
 * brackets), or the name localhost (in any case). server.listen looks any
 * other value up as a host name, which can resolve to any address, so none
 * counts: not 127.999.999.999 or 127.1, which net.isIPv4 rejects, and not
 * localhost.evil.com.
 */
export declare function isLoopbackAddress(host: string): boolean;
/**
 * Why the HTTP transport must not start with these settings, as one line for
 * stderr, or undefined to start it.
 *
 * Every request can use the MSP token, and call the write tools when they
 * are on, and the Docker image listens on 0.0.0.0: without a token,
 * `docker run -p 3000:3000` served anyone who could reach the port. So an
 * address other than loopback needs MCP_HTTP_BEARER_TOKEN, unless
 * MCP_HTTP_ALLOW_NO_TOKEN=true says the network is trusted. A token shorter
 * than MIN_BEARER_TOKEN_LENGTH is refused wherever the server listens.
 */
export declare function httpStartRefusal(config: HttpSecurityConfig): string | undefined;
/**
 * Whether an Authorization header carries the bearer token. Both sides are
 * hashed first so the comparison takes the same time whatever the lengths.
 */
export declare function bearerTokenMatches(authorization: string | undefined, token: string): boolean;
/**
 * The Origin of a request when it is present and allowed, for the CORS
 * headers; undefined when there is none or it is not allowed.
 */
export declare function allowedOriginOf(req: IncomingMessage, config: HttpSecurityConfig): string | undefined;
/**
 * Checks the Host and Origin headers, then the bearer token when one is
 * configured. Returns why the request is refused, or undefined to serve it.
 *
 * @param checkToken - false for a CORS preflight, which browsers send
 *   without credentials
 */
export declare function checkHttpRequest(req: IncomingMessage, config: HttpSecurityConfig, checkToken?: boolean): HttpRefusal | undefined;
/** CORS headers for a response to an allowed browser origin */
export declare function corsResponseHeaders(origin: string): Record<string, string>;
/** CORS headers for the answer to an allowed browser origin's preflight */
export declare function corsPreflightHeaders(origin: string): Record<string, string>;
//# sourceMappingURL=http-security.d.ts.map