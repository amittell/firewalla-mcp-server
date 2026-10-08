# Firewalla MCP × Roo Code

Use your Firewalla data from Roo Code, the coding agent extension for VS Code.

**Roo Code is shut down.** Its [README](https://github.com/RooCodeInc/Roo-Code) says "The Roo Code Extension was shut down on May 15th", the repository is archived, and its last GitHub release is 3.54.0, of 2026-05-15. This page is for an install you already have. The README points to [Cline](cline.md), which has its own guide here, and to ZooCode, a fork started by the Roo Code community, which this page does not cover.

## Prerequisites

- Roo Code in VS Code
- Node.js 18 or later, for `npx`
- A Firewalla MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and an access token

## Add the server

Roo Code reads MCP servers from two files:

- the global `mcp_settings.json`, for every workspace
- `.roo/mcp.json` in a project, for that project only; when a server name is in both files, the project's entry wins

To open either one:

1. Click the server icon in the top navigation of the Roo Code pane.
2. Scroll to the bottom of the MCP settings view.
3. Click **Edit Global MCP** for `mcp_settings.json`, or **Edit Project MCP** for `.roo/mcp.json` (Roo Code creates it if it is missing).

Add the server under `mcpServers`:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "npx",
      "args": ["-y", "firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

- `npx -y` downloads the package from npm the first time it starts, so nothing needs installing first. To run a clone instead, build it (`npm install && npm run build`) and use `"command": "node"` with `"args": ["/full/path/to/firewalla-mcp-server/dist/server.js"]`.
- On Windows, Roo Code's docs run `npx` through `cmd`: `"command": "cmd"` with `"args": ["/c", "npx", "-y", "firewalla-mcp-server"]`.
- `FIREWALLA_BOX_ID` in `env` is optional: it limits every query to that box. Without it, queries cover every box on the account.
- The credentials go in `env`. Roo Code 3.54.0 starts the server with a few variables of its own environment (`PATH`, `HOME` and the like) plus `env`, so a variable you export in your shell does not reach the server by itself.
- Roo Code's docs suggest committing `.roo/mcp.json` to share servers with a team; keep the token in the global file.

## Check that it works

The MCP settings view lists `firewalla` with its tools: 28 by default. **Enable MCP Servers**, in the same view, must be checked; it is on by default.

Then ask Roo Code something the tools answer:

```text
Show me my Firewalla alarms from the last hour
```

Roo Code asks before each tool call unless you check **Always allow** next to that tool, which also needs the global "Use MCP servers" auto-approval turned on.

## Write tools

The server is read-only by default. Add `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"` to `env` for the 11 write tools, which change rules, target lists, device names and alarms; see [Write tools](../../README.md#write-tools-opt-in). Leave **Always allow** unchecked for them, and keep their names out of `alwaysAllow`.

## Over HTTP

stdio, above, is the default. If the server already runs with the HTTP transport (`MCP_TRANSPORT=http`), give Roo Code its URL instead of a command:

```json
{
  "mcpServers": {
    "firewalla": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your_mcp_http_bearer_token"
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

`type` is required with `url`; without it Roo Code refuses the entry. The header is needed when the server was started with `MCP_HTTP_BEARER_TOKEN`, which it requires on any address but loopback; the token must be 16 characters or more wherever it listens. See [HTTP transport security](../../README.md#http-transport-security).

## Troubleshooting

### The server does not connect

In the MCP settings view, the refresh button next to a server restarts it, and its toggle disables and enables it. Each server's **Network Timeout** is how long Roo Code waits for a tool call: 60 seconds by default.

### npx is not found

`command` can be an absolute path. `command -v npx` (macOS, Linux) or `where npx` (Windows) prints it.

### Check the server on its own

`MCP_TEST_MODE=true NODE_ENV=development npx -y firewalla-mcp-server` starts it with dummy credentials (test mode refuses to start with `NODE_ENV=production`); stderr shows `Firewalla MCP Server running on stdio transport`. Stop it with Ctrl-C.

### Check the credentials

`curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" "https://$FIREWALLA_MSP_ID/v2/boxes"` lists your boxes when the token and the domain are right.

## Example prompts

```text
What security alerts have triggered in the last hour?
Show me the top bandwidth consumers on my network
Are there any offline devices I should know about?
Show me blocked flows from outside my network
```

## Sources

Checked on 2026-09-29 against Roo Code's [MCP docs](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo) and [README](https://github.com/RooCodeInc/Roo-Code), and, for the server's environment, the source of Roo Code 3.54.0 (`src/services/mcp/McpHub.ts`).

---

_Need another client? [Return to main setup guide](../../README.md#client-setup-guides)_
