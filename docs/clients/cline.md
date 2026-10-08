# Firewalla MCP × Cline

Use your Firewalla data from Cline, in VS Code or another editor Cline supports, or from the Cline CLI.

## Prerequisites

- Cline, from your editor's extension marketplace, or the CLI (`npm install -g cline`)
- Node.js 18 or later, for `npx`
- A Firewalla MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and an access token

## Add the server

Cline keeps its MCP servers in its own settings file, `cline_mcp_settings.json`, not in VS Code's settings. To open it in the extension:

1. In the Cline panel, click the **MCP Servers** icon (the stacked servers in the top toolbar).
2. Open the **Configure** tab and click **Configure MCP Servers**, near the bottom.
3. Add the server under `mcpServers`, next to any servers already there:

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
      "autoApprove": []
    }
  }
}
```

- `npx -y` downloads the package from npm the first time it starts, so nothing needs installing first. To run a clone instead, build it (`npm install && npm run build`) and use `"command": "node"` with `"args": ["/full/path/to/firewalla-mcp-server/dist/server.js"]`.
- `FIREWALLA_BOX_ID` in `env` is optional: it limits every query to that box. Without it, queries cover every box on the account.
- Put the credentials in `env`, which Cline passes to the server however it starts it. Cline's docs do not say whether a variable exported in your shell reaches the server too.
- Cline's configuration docs put the file at `~/.cline/data/settings/cline_mcp_settings.json`, shared by the extension, the CLI and the SDK.

In the CLI, `cline mcp` opens a wizard that lists, adds, edits, enables and disables servers. To add this one, choose the server type **Local**, give the command `npx -y firewalla-mcp-server`, and give the environment variables as `FIREWALLA_MSP_TOKEN=your_msp_access_token_here,FIREWALLA_MSP_ID=yourdomain.firewalla.net`.

## Check that it works

The **MCP Servers** view lists `firewalla` once it connects, with its tools: 28 by default. In the CLI, `cline config mcp` lists the configured servers (`--json` for JSON).

Then ask Cline something the tools answer:

```text
Show me my Firewalla alarms from the last hour
```

## Write tools

The server is read-only by default. Add `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"` to `env` for the 11 write tools, which change rules, target lists, device names and alarms; see [Write tools](../../README.md#write-tools-opt-in). Keep their names out of `autoApprove`, and review each write call before you approve it.

## Over HTTP

stdio, above, is the default. If the server already runs with the HTTP transport (`MCP_TRANSPORT=http`), use the **Remote Servers** tab of the MCP Servers view: a server name, the URL `http://localhost:3000/mcp`, and the transport type **Streamable HTTP**. In the settings file the same server is:

```json
{
  "mcpServers": {
    "firewalla": {
      "type": "streamableHttp",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your_mcp_http_bearer_token"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Keep `"type": "streamableHttp"`: without `type`, Cline uses the legacy SSE transport. The header is needed when the server was started with `MCP_HTTP_BEARER_TOKEN`, which it requires on any address but loopback; the token must be 16 characters or more wherever it listens. See [HTTP transport security](../../README.md#http-transport-security).

## Troubleshooting

### The server does not connect

In the MCP Servers view a server can be restarted, disabled and enabled; restart `firewalla` if it stops answering. In the CLI, `cline dev log` shows the logs.

### npx is not found

If Cline cannot start `npx`, give `command` its full path: `command -v npx` (macOS, Linux) or `where npx` (Windows) prints it.

### Check the server on its own

`MCP_TEST_MODE=true NODE_ENV=development npx -y firewalla-mcp-server` starts it with dummy credentials (test mode refuses to start with `NODE_ENV=production`); stderr shows `Firewalla MCP Server running on stdio transport`. Stop it with Ctrl-C.

### Check the credentials

`curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" "https://$FIREWALLA_MSP_ID/v2/boxes"` lists your boxes when the token and the domain are right.

## Example prompts

```text
Check if device 192.168.1.100 is online, and show me any blocked traffic to or from it
Review the active alarms, list the offline devices, and summarize both
Which devices used the most bandwidth in the last 24 hours?
Are there any firewall rules that might block this endpoint?
```

## Sources

Checked on 2026-09-29 against Cline's [MCP docs](https://docs.cline.bot/mcp/mcp-overview), [configuration docs](https://docs.cline.bot/getting-started/config) and [install docs](https://docs.cline.bot/getting-started/installing-cline), and, for the CLI wizard's prompts, the source of Cline CLI 3.0.65 ([cline/cline](https://github.com/cline/cline), `apps/cli/src/wizards/mcp/index.ts`).

---

_Need another client? [Return to main setup guide](../../README.md#client-setup-guides)_
