# Firewalla MCP Server

A Model Context Protocol (MCP) server for Firewalla. It gives an MCP client, such as Claude Desktop, Claude Code or Open WebUI, 24 read-only tools over the Firewalla MSP API: alarms, flows, devices, rules, target lists, statistics and trends. There are 11 more tools that change your box, and they are off unless you turn them on.

This is a community project, not affiliated with Firewalla. It needs an MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and a personal access token from its API settings.

The full documentation is on GitHub: https://github.com/amittell/firewalla-mcp-server

## Tags

- `2.0.2`, `2.0`, `2` and `latest`: the current release. Pin a version for anything you depend on.
- Platforms: `linux/amd64`, `linux/arm64` and `linux/arm/v7`.
- Up to 1.5.0 the HTTP transport has no token or `Host` checks, and five write tools are always registered. Don't expose an HTTP port on those tags. The changes are listed under "Upgrading to 2.0.0": https://github.com/amittell/firewalla-mcp-server#upgrading-to-200

## Use it over stdio (Claude Desktop and other MCP clients)

The client starts the container and talks to it on stdin and stdout, so use `-i` and no port:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-e", "FIREWALLA_MSP_TOKEN=your_token",
        "-e", "FIREWALLA_MSP_ID=yourdomain.firewalla.net",
        "amittell/firewalla-mcp-server:2"
      ]
    }
  }
}
```

## Use it over HTTP

```bash
# Make a token and keep the value: every client sends it
export MCP_HTTP_BEARER_TOKEN="$(openssl rand -hex 32)"

docker run -d --name firewalla-mcp \
  -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_HTTP_BEARER_TOKEN \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  amittell/firewalla-mcp-server:2
```

Clients connect to `http://localhost:3000/mcp` and send `Authorization: Bearer <token>`.

- The image listens on every interface of the container (`MCP_HTTP_HOST=0.0.0.0`), and on that address the server won't start without `MCP_HTTP_BEARER_TOKEN` of at least 16 characters. The container exits with code 1, and `docker logs` says why. `MCP_HTTP_ALLOW_NO_TOKEN=true` turns the check off, for a network nothing untrusted can reach.
- The server answers only requests whose `Host` is `localhost`, `127.0.0.1` or `[::1]`. A client that connects by another name, such as a compose service name or the host's LAN address, needs that name in `MCP_HTTP_ALLOWED_HOSTS`.
- A request with an `Origin` header, which browsers send, needs that origin in `MCP_HTTP_ALLOWED_ORIGINS`.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `FIREWALLA_MSP_TOKEN` | required | Your MSP personal access token |
| `FIREWALLA_MSP_ID` | required | Your MSP domain, such as `yourdomain.firewalla.net` |
| `FIREWALLA_BOX_ID` | every box | Scope all queries to one box (its gid) |
| `FIREWALLA_DEFAULT_BOX_ID` | none | The box for single-box operations, without scoping queries |
| `FIREWALLA_ENABLE_WRITE_TOOLS` | off | `true` registers the 11 write tools, for rules, target lists, device names and alarms. They need a token with write access |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_PORT`, `MCP_HTTP_PATH` | `3000`, `/mcp` | Where the HTTP transport listens |
| `MCP_HTTP_BEARER_TOKEN` | none | The token HTTP clients must send; required off loopback |
| `API_RATE_LIMIT` | `100` | Requests this process starts in any 5 minutes; the MSP API allowed 100 |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` or `debug`; logs go to stderr |

The other settings, such as the cache, timeouts and HTTP origins, are described in `.env.example`: https://github.com/amittell/firewalla-mcp-server/blob/main/.env.example

## More

- Client guides (Claude Desktop, Claude Code, Cursor, Open WebUI and others): https://github.com/amittell/firewalla-mcp-server/tree/main/docs/clients
- Query syntax: https://github.com/amittell/firewalla-mcp-server/blob/main/docs/query-syntax-guide.md
- Troubleshooting: https://github.com/amittell/firewalla-mcp-server/blob/main/docs/troubleshooting-guide.md
- Changelog: https://github.com/amittell/firewalla-mcp-server/blob/main/CHANGELOG.md
- Security reports: https://github.com/amittell/firewalla-mcp-server/security
- License: MIT
