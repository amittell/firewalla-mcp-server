# Node 20.19 and Zod 4 migration

The server now requires **Node.js 20.19.0 or later**. Node 18 and Node
20.0–20.18 are no longer supported. The package's `engines.node` requirement,
client guides and diagnostic script use the same minimum.

Before updating the server, check `node --version` in the environment that
starts it. Desktop MCP clients may use a different executable or PATH from
your terminal. Update that runtime first, then restart the client so its
`node`, `npm` and `npx` commands use the new runtime. Existing API credentials,
MCP transport settings and tool arguments do not need migration.

For a source checkout, rebuild with `npm ci` and `npm run build` after
updating Node. A global installation or an `npx` launch must also use the
supported runtime. npm may only warn about an unsupported engine; a server
starting under Node 18 does not make that runtime supported.

The direct Zod dependency moves from 3.x to **4.6.6**, and the MCP SDK's Hono
Node adapter moves to **2.1.3**. The SDK already uses Zod 4 protocol schemas
and accepts either Zod package major. The server continues to use those SDK
schemas through `UntrustedTextServer`; it does not expose a new MCP API.
Code that independently imports Zod 3 APIs must migrate its own imports and
schemas instead of relying on the server's dependency version.

The Zod update fixes early rejection of oversized arrays, maps and sets with
size constraints. Regression tests check that their entries are not parsed
after the size limit has been exceeded, and exercise a Zod 4 request schema
through an in-memory MCP client/server connection. The existing full suite
covers tool calls, resources, prompts, HTTP and stdio behavior.

CI builds and tests on the exact minimum, **20.19.0**, as well as current
Node 20, 22 and 24. Package launch smoke checks use 20.19.0 and 24. The
existing geoip-lite warning on Node 20–22 concerns its Node 24 database
update script; the server's lookup path remains covered by those checks.
