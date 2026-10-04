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
import { createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP, isIPv4, isIPv6 } from 'node:net';
/** Address the HTTP transport listens on when MCP_HTTP_HOST is not set */
export const DEFAULT_HTTP_HOST = '127.0.0.1';
/**
 * Shortest MCP_HTTP_BEARER_TOKEN accepted, in characters. A length cannot
 * tell a random token from a chosen one, but it refuses the values typed to
 * try the setting out (x, test, changeme). 16 random hex characters are 64
 * bits, and `openssl rand -hex 32` prints 64 characters.
 */
export const MIN_BEARER_TOKEN_LENGTH = 16;
/** Host header names accepted whatever the configuration */
const LOOPBACK_HOST_NAMES = ['localhost', '127.0.0.1', '[::1]'];
/** Listen addresses that mean every interface, which no Host header names */
const WILDCARD_ADDRESSES = new Set(['0.0.0.0', '::']);
/** host or [ipv6], then an optional :port, and nothing else */
const HOST_HEADER = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d{1,5})?$/i;
/** A host name or an IPv4 address, as the Host header check accepts one */
const HOST_NAME = /^[a-z0-9._-]+$/i;
/** Request headers a browser client may send, for CORS preflight answers */
const CORS_ALLOW_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID';
/** Response headers a browser client needs to read */
const CORS_EXPOSE_HEADERS = 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate';
function listFromEnv(value) {
    return (value ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}
/**
 * The host name a Host header names, lowercase and without its port, or
 * undefined when the header is missing or is not a plain host[:port].
 */
export function hostNameOf(hostHeader) {
    const match = HOST_HEADER.exec(hostHeader?.trim() ?? '');
    return match ? match[1].toLowerCase() : undefined;
}
/**
 * An http(s) origin as browsers send it (scheme://host[:port], default port
 * left out), or undefined for anything else, including the opaque "null".
 */
export function normalizeOrigin(value) {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return undefined;
        }
        return url.origin;
    }
    catch {
        return undefined;
    }
}
/** A configured host name as the Host header check compares it */
function hostEntry(value, variable) {
    // A bare IPv6 address (::1) appears in the Host header in brackets
    const colons = value.split(':').length - 1;
    const candidate = colons > 1 && !value.startsWith('[') ? `[${value}]` : value;
    const name = hostNameOf(candidate);
    if (!name) {
        throw new Error(`${variable}: "${value}" is not a host name or IP address, e.g. localhost or 192.168.1.10`);
    }
    return name;
}
/** A host name, an IPv4 address or a bracketed IPv6 address, unbracketed */
function addressOf(value) {
    const bracketed = /^\[(.*)\]$/.exec(value);
    if (bracketed) {
        return isIP(bracketed[1]) === 6 ? bracketed[1] : undefined;
    }
    return HOST_NAME.test(value) ? value : undefined;
}
/**
 * The address MCP_HTTP_HOST names, as server.listen takes it: a host name, an
 * IPv4 address or a bare IPv6 address. [::1] loses its brackets. A port is
 * refused: server.listen would look the whole value up as a host name and
 * fail with ENOTFOUND, and the port is MCP_HTTP_PORT.
 *
 * @throws {Error} If the value has a port or is not a host name or address
 */
export function parseListenAddress(value) {
    if (isIP(value) === 6) {
        return value;
    }
    const address = addressOf(value);
    if (address !== undefined) {
        return address;
    }
    const withPort = /^(.+):(\d+)$/.exec(value);
    const beforePort = withPort ? addressOf(withPort[1]) : undefined;
    if (withPort && beforePort !== undefined) {
        throw new Error(`MCP_HTTP_HOST: "${value}" includes a port. Give the address in MCP_HTTP_HOST and the port in MCP_HTTP_PORT: MCP_HTTP_HOST=${beforePort} MCP_HTTP_PORT=${withPort[2]}`);
    }
    throw new Error(`MCP_HTTP_HOST: "${value}" is not a host name or IP address to listen on, e.g. 127.0.0.1, 0.0.0.0 or ::1`);
}
/**
 * Reads the HTTP transport's access settings from the environment.
 *
 * @throws {Error} If MCP_HTTP_HOST is not an address to listen on, or
 * MCP_HTTP_ALLOWED_HOSTS or MCP_HTTP_ALLOWED_ORIGINS holds something that is
 * not a host or an origin
 */
export function parseHttpSecurityConfig(env = process.env) {
    const host = parseListenAddress(env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST);
    const allowedHosts = new Set(LOOPBACK_HOST_NAMES);
    if (!WILDCARD_ADDRESSES.has(host)) {
        allowedHosts.add(hostEntry(host, 'MCP_HTTP_HOST'));
    }
    for (const entry of listFromEnv(env.MCP_HTTP_ALLOWED_HOSTS)) {
        allowedHosts.add(hostEntry(entry, 'MCP_HTTP_ALLOWED_HOSTS'));
    }
    const allowedOrigins = new Set();
    for (const entry of listFromEnv(env.MCP_HTTP_ALLOWED_ORIGINS)) {
        const origin = normalizeOrigin(entry);
        if (!origin) {
            throw new Error(`MCP_HTTP_ALLOWED_ORIGINS: "${entry}" is not an http(s) origin, e.g. http://localhost:6274; list each origin, there is no wildcard`);
        }
        // http://*.example.com parses as an origin whose host is "*.example.com",
        // which no browser sends, so it would be accepted and match nothing. The
        // host is checked after parsing: a * in a path is dropped with the path,
        // and http://%2A.example.com has the same host as http://*.example.com
        if (new URL(origin).hostname.includes('*')) {
            throw new Error(`MCP_HTTP_ALLOWED_ORIGINS: "${entry}" has a wildcard. There is no wildcard: list each origin, comma-separated, e.g. http://app.example.com,http://admin.example.com`);
        }
        allowedOrigins.add(origin);
    }
    const bearerToken = env.MCP_HTTP_BEARER_TOKEN?.trim() || undefined;
    const allowNoToken = (env.MCP_HTTP_ALLOW_NO_TOKEN ?? '').trim().toLowerCase() === 'true';
    return { host, allowedHosts, allowedOrigins, bearerToken, allowNoToken };
}
/** 127.0.0.0/8, compared as addresses, not as text */
const LOOPBACK_IPV4 = new BlockList();
LOOPBACK_IPV4.addSubnet('127.0.0.0', 8, 'ipv4');
/** ::1, which BlockList matches in any spelling, such as 0:0:0:0:0:0:0:1 */
const LOOPBACK_IPV6 = new BlockList();
LOOPBACK_IPV6.addAddress('::1', 'ipv6');
/**
 * Whether an address only accepts connections from this machine: a valid
 * IPv4 address in 127.0.0.0/8, ::1 in any valid spelling (with or without
 * brackets), or the name localhost (in any case). server.listen looks any
 * other value up as a host name, which can resolve to any address, so none
 * counts: not 127.999.999.999 or 127.1, which net.isIPv4 rejects, and not
 * localhost.evil.com.
 */
export function isLoopbackAddress(host) {
    const address = /^\[(.*)\]$/.exec(host)?.[1] ?? host;
    if (isIPv4(address)) {
        return LOOPBACK_IPV4.check(address, 'ipv4');
    }
    if (isIPv6(address)) {
        return LOOPBACK_IPV6.check(address, 'ipv6');
    }
    return host.toLowerCase() === 'localhost';
}
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
export function httpStartRefusal(config) {
    const { host, bearerToken, allowNoToken } = config;
    if (bearerToken !== undefined &&
        bearerToken.length < MIN_BEARER_TOKEN_LENGTH) {
        const unit = bearerToken.length === 1 ? 'character' : 'characters';
        return `MCP_HTTP_BEARER_TOKEN is ${bearerToken.length} ${unit} long and needs at least ${MIN_BEARER_TOKEN_LENGTH}. Use a random value (openssl rand -hex 32 makes one).`;
    }
    if (bearerToken === undefined && !allowNoToken && !isLoopbackAddress(host)) {
        return `MCP_HTTP_HOST=${host} accepts connections from other machines, and MCP_HTTP_BEARER_TOKEN is empty or not set, so any client that reaches the port could use the Firewalla MSP token. Set MCP_HTTP_BEARER_TOKEN to a random value of at least ${MIN_BEARER_TOKEN_LENGTH} characters (openssl rand -hex 32 makes one) and have clients send Authorization: Bearer <token>. Outside a container, MCP_HTTP_HOST=127.0.0.1 keeps the server on this machine. On a network no untrusted machine can reach, such as a compose network with no published port, MCP_HTTP_ALLOW_NO_TOKEN=true starts it without a token.`;
    }
    return undefined;
}
/**
 * Whether an Authorization header carries the bearer token. Both sides are
 * hashed first so the comparison takes the same time whatever the lengths.
 */
export function bearerTokenMatches(authorization, token) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
    const presented = match ? match[1].trim() : '';
    const expected = createHash('sha256').update(token).digest();
    const actual = createHash('sha256').update(presented).digest();
    return timingSafeEqual(expected, actual) && match !== null;
}
/**
 * The Origin of a request when it is present and allowed, for the CORS
 * headers; undefined when there is none or it is not allowed.
 */
export function allowedOriginOf(req, config) {
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
export function checkHttpRequest(req, config, checkToken = true) {
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
    if (checkToken &&
        config.bearerToken !== undefined &&
        !bearerTokenMatches(req.headers.authorization, config.bearerToken)) {
        return {
            status: 401,
            message: 'Unauthorized: send Authorization: Bearer <MCP_HTTP_BEARER_TOKEN>',
            headers: { 'WWW-Authenticate': 'Bearer' },
        };
    }
    return undefined;
}
/** CORS headers for a response to an allowed browser origin */
export function corsResponseHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Expose-Headers': CORS_EXPOSE_HEADERS,
        Vary: 'Origin',
    };
}
/** CORS headers for the answer to an allowed browser origin's preflight */
export function corsPreflightHeaders(origin) {
    return {
        ...corsResponseHeaders(origin),
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
        'Access-Control-Max-Age': '600',
    };
}
//# sourceMappingURL=http-security.js.map