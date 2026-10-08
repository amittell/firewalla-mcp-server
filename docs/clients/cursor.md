# Firewalla MCP × Cursor

Use your Firewalla data from Cursor's Agent. Cursor supports MCP servers itself, so no extension is needed.

## Prerequisites

- Cursor
- Node.js 18 or later, for `npx`
- A Firewalla MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and an access token

## Add the server

Cursor reads MCP servers from two files, and merges them:

- `~/.cursor/mcp.json` in your home directory, for every project
- `.cursor/mcp.json` in a project, for that project only; when a server name is in both files, the project's entry wins

Add the server to one of them:

```json
{
  "mcpServers": {
    "firewalla": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      }
    }
  }
}
```

Save the file and restart Cursor.

- `npx -y` downloads the package from npm the first time it starts, so nothing needs installing first. To run a clone instead, build it (`npm install && npm run build`) and use `"command": "node"` with `"args": ["/full/path/to/firewalla-mcp-server/dist/server.js"]`.
- `FIREWALLA_BOX_ID` in `env` is optional: it limits every query to that box. Without it, queries cover every box on the account.
- Cursor's docs suggest committing `.cursor/mcp.json` so a team shares its servers; keep the token out of that file. Cursor replaces `${env:NAME}` in `env` with the variable from its own environment, so `"FIREWALLA_MSP_TOKEN": "${env:FIREWALLA_MSP_TOKEN}"` works once the variable is set where Cursor sees it, such as your shell profile, and Cursor has restarted. Or `"envFile": "${workspaceFolder}/.env"` loads the variables from a file you do not commit.

## Check that it works

- Open **Customize** in the sidebar, then **MCPs**: `firewalla` is listed, with a toggle to turn it off and on.
- With the Cursor CLI, `agent mcp list` shows the server and its status, and `agent mcp list-tools firewalla` lists its tools: 28 by default.

Then ask Agent something the tools answer:

```text
Show me my Firewalla alarms from the last hour
```

By default, Agent asks for your approval before it calls an MCP tool.

## Write tools

The server is read-only by default. Add `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"` to `env` for the 11 write tools, which change rules, target lists, device names and alarms; see [Write tools](../../README.md#write-tools-opt-in). To be asked before every write, leave the write tools off the allowlist and choose the **Allowlist** mode in **Cursor Settings > Agents > Approvals & Execution**: **Auto-review**, the default from Cursor 3.6, runs allowlisted MCP tools without asking and sends the others to a safety classifier.

## Over HTTP

stdio, above, is the default. If the server already runs with the HTTP transport (`MCP_TRANSPORT=http`), give Cursor its URL instead of a command:

```json
{
  "mcpServers": {
    "firewalla": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MCP_HTTP_BEARER_TOKEN}"
      }
    }
  }
}
```

The header is needed when the server was started with `MCP_HTTP_BEARER_TOKEN`, which it requires on any address but loopback; the token must be 16 characters or more wherever it listens. See [HTTP transport security](../../README.md#http-transport-security).

## Using Claude Code in Cursor

Claude Code, in Cursor's terminal or through its extension, keeps its own MCP configuration (`claude mcp add`, a project's `.mcp.json`). Add the server to it with the [Claude Code guide](claude-code.md).

## Troubleshooting

### Logs

Open the Output panel (Cmd+Shift+U on macOS, Ctrl+Shift+U on Windows and Linux) and select **MCP Logs** from the dropdown. It shows the server starting, its tool calls and its errors.

### npx is not found

`command` must be on the system path Cursor sees, or a full path. `command -v npx` (macOS, Linux) or `where npx` (Windows) prints the full path to use.

### Check the server on its own

`MCP_TEST_MODE=true NODE_ENV=development npx -y firewalla-mcp-server` starts it with dummy credentials (test mode refuses to start with `NODE_ENV=production`); stderr shows `Firewalla MCP Server running on stdio transport`. Stop it with Ctrl-C.

### Check the credentials

`curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" "https://$FIREWALLA_MSP_ID/v2/boxes"` lists your boxes when the token and the domain are right.

### An older release keeps starting

`npx` can keep starting a copy it downloaded earlier. Cursor's steps for updating an npm-based server: remove it under **Customize**, run `npm cache clean --force`, and add it again.

## Example prompts

```text
What are my top 10 bandwidth users this week?
Are there any offline devices I should know about?
Show me blocked flows from the last hour
Are there any firewall rules that might block this API endpoint?
```

## Sources

Checked on 2026-09-29 against Cursor's [MCP docs](https://cursor.com/docs/mcp), [MCP help](https://cursor.com/help/customization/mcp) and [CLI reference](https://cursor.com/docs/cli/reference/parameters), and Claude Code's [MCP docs](https://code.claude.com/docs/en/mcp).

---

_Need another client? [Return to main setup guide](../../README.md#client-setup-guides)_
