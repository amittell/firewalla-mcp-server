# Firewalla MCP × VS Code

Use your Firewalla data from chat in VS Code. MCP support is built into VS Code, generally available since 1.102, so no MCP extension is needed.

## Prerequisites

- VS Code 1.102 or later, with chat set up through GitHub Copilot
- Node.js 18 or later, for `npx`
- A Firewalla MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and an access token

## Add the server

VS Code's own format keeps servers under a top-level `servers` key, not `mcpServers`, and it can ask for secrets through `inputs` instead of storing them in the file. It reads that format from:

- `.vscode/mcp.json` in a workspace, for that workspace
- the `mcp.json` in your user profile, for every workspace: run **MCP: Open User Configuration** from the Command Palette to open it

Add the server to one of them:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "firewalla-msp-token",
      "description": "Firewalla MSP access token",
      "password": true
    }
  ],
  "servers": {
    "firewalla": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "${input:firewalla-msp-token}",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      }
    }
  }
}
```

VS Code asks for the `${input:firewalla-msp-token}` value when the server first starts, and stores it for later starts.

- `npx -y` downloads the package from npm the first time it starts, so nothing needs installing first. To run a clone instead, build it (`npm install && npm run build`) and use `"command": "node"` with `"args": ["/full/path/to/firewalla-mcp-server/dist/server.js"]`.
- `FIREWALLA_BOX_ID` in `env` is optional: it limits every query to that box. Without it, queries cover every box on the account.
- Instead of `inputs`, `"envFile": "${workspaceFolder}/.env"` loads the variables from a file you do not commit.
- **MCP: Add Server** in the Command Palette adds a server through a guided flow, to the workspace or globally.
- VS Code also reads the portable format, with a top-level `mcpServers` key: `.mcp.json` at the root of a workspace, or `~/.copilot/mcp-config.json` for your user. Sessions that run on the Agent Host read those files themselves, and get the servers in `.vscode/mcp.json` forwarded to them, except a server that uses `${input:...}`.

MCP servers used to live in `settings.json`; since 1.102, VS Code moves any it finds there into `mcp.json`.

## Check that it works

- Run **MCP: List Servers**, select `firewalla`, and start it, or choose **Show Output** to see it start. Servers in `.vscode/mcp.json` follow the workspace's trust; a server from elsewhere, such as your user profile, can show a trust dialog the first time it starts.
- In the Chat view, the **Configure Tools** button in the chat input lists the server's tools: 28 by default.

Then ask in chat something the tools answer:

```text
Show me my Firewalla alarms from the last hour
```

You may be asked to confirm each tool call.

## Write tools

The server is read-only by default. Add `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"` to `env` for the 11 write tools, which change rules, target lists, device names and alarms; see [Write tools](../../README.md#write-tools-opt-in). Review each write call before you confirm it.

## Over HTTP

stdio, above, is the default. If the server already runs with the HTTP transport (`MCP_TRANSPORT=http`), give VS Code its URL instead of a command:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "firewalla-http-token",
      "description": "The server's MCP_HTTP_BEARER_TOKEN",
      "password": true
    }
  ],
  "servers": {
    "firewalla": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${input:firewalla-http-token}"
      }
    }
  }
}
```

The header is needed when the server was started with `MCP_HTTP_BEARER_TOKEN`, which it requires on any address but loopback; the token must be 16 characters or more wherever it listens. See [HTTP transport security](../../README.md#http-transport-security).

## Troubleshooting

### Server output

When a server fails, the Chat view shows an error; select it, then **Show Output**. **MCP: List Servers** -> `firewalla` -> **Show Output** opens the same log.

### The workspace's servers do not start

In restricted mode (an untrusted workspace), VS Code blocks the workspace's MCP configuration. Trust the workspace, or put the server in your user profile.

### The tool list is out of date

After an upgrade that changes the tools, run **MCP: Reset Cached Tools**.

### npx is not found

`command` must be on the system path VS Code sees, or a full path. `command -v npx` (macOS, Linux) or `where npx` (Windows) prints the full path to use.

### Check the server on its own

`MCP_TEST_MODE=true NODE_ENV=development npx -y firewalla-mcp-server` starts it with dummy credentials (test mode refuses to start with `NODE_ENV=production`); stderr shows `Firewalla MCP Server running on stdio transport`. Stop it with Ctrl-C.

### Check the credentials

`curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" "https://$FIREWALLA_MSP_ID/v2/boxes"` lists your boxes when the token and the domain are right.

## Example prompts

```text
What devices are offline right now?
Show me blocked traffic from the last hour
Who were the top bandwidth users today?
```

## Sources

Checked on 2026-09-29 against VS Code's [MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers) and [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) pages and the [1.102 release notes](https://code.visualstudio.com/updates/v1_102).

---

_Need another client? [Return to main setup guide](../../README.md#client-setup-guides)_
