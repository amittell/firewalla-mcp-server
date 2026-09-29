# Firewalla MCP Server

[![npm version](https://badge.fury.io/js/firewalla-mcp-server.svg)](https://www.npmjs.com/package/firewalla-mcp-server)
<a href="https://glama.ai/mcp/servers/@amittell/firewalla-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@amittell/firewalla-mcp-server/badge" alt="Glama MCP Server" />
</a>

A Model Context Protocol (MCP) server that provides real-time access to Firewalla firewall data through 24 read-only tools, plus 11 opt-in write tools, compatible with any MCP client.

This is a community project, not affiliated with Firewalla. It reads your data through the Firewalla MSP API, so it needs an MSP account with API access.

## Why Firewalla MCP Server?

### Simple Network Security Integration
- **24 read-only tools** for network monitoring and analysis: **19 Direct API Endpoints** + **5 Convenience Wrappers**
- **11 write tools**, off unless `FIREWALLA_ENABLE_WRITE_TOOLS=true`, so by default nothing can change your box
- **Advanced Search** with query syntax and filters
- **Clean, Verified Architecture** with corrected API schemas

## Features

- **Real-time Firewall Data**: Query security alerts, network flows, and device status  
- **Security Analysis**: Get insights on threats, blocked attacks, and network anomalies  
- **Bandwidth Monitoring**: Track top bandwidth consumers and usage patterns  
- **Rule Management**: View firewall rules; with the write tools, create, pause, resume and delete them  
- **Target Lists**: View target lists; with the write tools, create, update and delete them
- **Search Tools**: Query syntax with filters and logical operators

## Client Setup Guides

| Client | Quick Start | Full Guide |
|--------|-------------|------------|
| **Claude Desktop** | `npm i -g firewalla-mcp-server` → Configure MCP | [Setup Guide](docs/clients/claude-desktop.md) |
| **Claude Code** | `npm i -g firewalla-mcp-server` → CLI integration | [Setup Guide](docs/clients/claude-code.md) |
| **VS Code** | Install MCP extension → Configure server | [Setup Guide](docs/clients/vscode.md) |
| **Cursor** | Install Claude Code → VSIX method | [Setup Guide](docs/clients/cursor.md) |
| **Roocode** | Install MCP support → Configure server | [Setup Guide](docs/clients/roocode.md) |
| **Cline** | Configure in VS Code → Enable MCP | [Setup Guide](docs/clients/cline.md) |
| **Open WebUI** | mcpo, or a native MCP connection over HTTP | [Setup Guide](docs/clients/open-webui.md) |
  

## How It Works

```
Claude Desktop/Code ↔ MCP Server ↔ Firewalla API
```

The MCP server acts as a bridge between Claude and your Firewalla firewall, translating Claude's requests into Firewalla API calls and returning the results in a format Claude can understand.

## Prerequisites

- Node.js 18+ and npm. On Node 18-22, npm prints an `EBADENGINE` warning for geoip-lite 2.x, which declares Node 24 for its database update script; the lookups the server uses run on Node 18 and later, and CI tests 18, 20, 22 and 24.
- Firewalla MSP account with API access
- Your Firewalla device online and connected

## Upgrading to 2.0.0

2.0.0 changes these defaults from 1.5.0. A setup that relied on an old default needs the setting in the last column.

| Up to 1.5.0 | From 2.0.0 | What to set |
|---|---|---|
| `pause_rule`, `resume_rule`, `create_target_list`, `update_target_list` and `delete_target_list` were always registered | All 11 write tools are off; the server lists 24 read-only tools, and a call to a write tool answers "Unknown tool" and sends nothing | `FIREWALLA_ENABLE_WRITE_TOOLS=true` |
| The HTTP transport listened on every interface | It listens on 127.0.0.1. The Docker image sets `MCP_HTTP_HOST=0.0.0.0`, so a published port reaches it once `MCP_HTTP_BEARER_TOKEN` is set | `MCP_HTTP_HOST=0.0.0.0` outside Docker, with `MCP_HTTP_BEARER_TOKEN` |
| Any `Host` header was served | 403 unless it is `localhost`, `127.0.0.1`, `[::1]` or the `MCP_HTTP_HOST` address; a wildcard `MCP_HTTP_HOST` (`0.0.0.0`, `::`, as in the Docker image) adds nothing, so every other name clients use must be listed | the name clients connect by (a compose service name, a LAN address) in `MCP_HTTP_ALLOWED_HOSTS` |
| Any `Origin` was served | 403 for a request with an `Origin` header, which browsers send; MCP clients that send none are not affected | the page's origin in `MCP_HTTP_ALLOWED_ORIGINS`: scheme, host and port (`http://localhost:6274`). The setting and the header are compared as URL origins, so letter case and a default port make no difference and a path in the setting is dropped. There is no wildcard: an entry with `*` in its host stops the server at startup. The opaque origin `null` is always refused |
| No token check (`MCP_HTTP_BEARER_TOKEN` did not exist) | On an address other than loopback, the Docker image's `0.0.0.0` included, the server exits with code 1 at startup unless `MCP_HTTP_BEARER_TOKEN` is set, and it refuses a token shorter than 16 characters wherever it listens. With the token, a request without `Authorization: Bearer <token>` gets 401 | `MCP_HTTP_BEARER_TOKEN` (`openssl rand -hex 32` makes one) and the same token in every client, or `MCP_HTTP_ALLOW_NO_TOKEN=true` on a network no untrusted machine can reach, such as a compose network with no published port |
| Any path starting with `MCP_HTTP_PATH` was served | Only the configured `MCP_HTTP_PATH` (default `/mcp`) and that path with one trailing slash, with or without a query string; with the default, `/mcpx` and `/mcp/x` get 404 | a client URL that ends in exactly the configured `MCP_HTTP_PATH` |
| `MCP_TEST_MODE=true` started under any `NODE_ENV` | Refused with `NODE_ENV=production`, which the Docker image sets | `-e NODE_ENV=development` with `-e MCP_TEST_MODE=true` |
| `API_RATE_LIMIT` was range-checked and not applied | Each server process starts at most `API_RATE_LIMIT` requests in any rolling 5 minutes (default 100), counting 429 retries and the retry of a failed read; cache hits do not count. A request that cannot start within 20 s fails and says when capacity returns. A request still waiting when its tool gives up at 30 s is not sent; `archive_alarm`, `mute_alarm` and `delete_alarm` have no such tool deadline. The MSP API allowed 100 requests per fixed 5-minute window on the one token measured; whether that is per token or per account was not measured | when several server processes or other clients use one token, an `API_RATE_LIMIT` for each so that together they stay at 100 or less: each process counts only its own requests, so lowering one does not cover the others |

Other changes a script may notice:

- With `FIREWALLA_BOX_ID` set, `get_alarm_trends` covers that box instead of every box, and makes 31 requests for the default `30d` instead of 1. An explicit `group` still reads the group's series in one request.
- Tool responses are compact JSON, without the indentation.
- `AND`, `OR` and `NOT` are translated to the API's grammar, which has none of them: `status:blocked AND region:US` matched 0 flows up to 1.5.0 and now matches what `status:blocked region:US` does. A query with no API form is refused as a validation error that suggests runnable queries: an `OR` between different fields, `NOT` over an `AND`, a comma list with a space around a comma, and geographic names the API does not have, such as `country:` (use `region:`). Up to 1.5.0 these returned wrong results or none.
- IDs are no longer trimmed: an ID with leading or trailing whitespace, `/`, `?`, `#` or `%` is refused before any request.
- A streamed `get_flow_data` chunk gives each flow's time as `ts`, an ISO string, like a plain page, instead of `timestamp`.
- Over HTTP, a request with the session ID of a session the server no longer holds gets 404 instead of 400.

[CHANGELOG.md](CHANGELOG.md) has the full list.

## Quick Start

### 1. Installation

### Option A: Install from npm (Recommended)
```bash
# Install globally
npm install -g firewalla-mcp-server

# Or install locally in your project
npm install firewalla-mcp-server
```

### Option B: Use Docker

> **Warning: Not for production use – secrets visible in process list**

The examples below pass credentials directly in the command line, which exposes them to process listing and shell history. For production use, consider these secure alternatives:
- Use `--env-file` with a `.env` file: `docker run --env-file .env ...`
- Set environment variables in your shell before running Docker
- Use Docker secrets for orchestration environments

**Stdio Transport (Default - for Claude Desktop integration):**
```bash
# Using Docker Hub image (minimal config)
docker run -it --rm \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  amittell/firewalla-mcp-server

# Or with optional box filter
docker run -it --rm \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  -e FIREWALLA_BOX_ID=your_box_gid \
  amittell/firewalla-mcp-server

# Or build locally
docker build -t firewalla-mcp-server .
docker run -it --rm \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  firewalla-mcp-server

# Recommended: Using env file (more secure)
docker run -it --rm --env-file .env amittell/firewalla-mcp-server
```

**HTTP Transport (for standalone Docker containers and external access):**
```bash
# Make a token and keep the value echo prints: every client sends it
export MCP_HTTP_BEARER_TOKEN="$(openssl rand -hex 32)"
echo "$MCP_HTTP_BEARER_TOKEN"

# Run with HTTP transport on port 3000. -e MCP_HTTP_BEARER_TOKEN with no
# value passes the exported one without putting it on the command line
docker run -d --name firewalla-mcp \
  -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_HTTP_PORT=3000 \
  -e MCP_HTTP_BEARER_TOKEN \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  amittell/firewalla-mcp-server

# Add FIREWALLA_BOX_ID if you want to filter to a specific box
# -e FIREWALLA_BOX_ID=your_box_gid \

# The server will be accessible at http://localhost:3000/mcp, and clients
# send the header: Authorization: Bearer <the token echo printed>

# Using env file (recommended): besides the credentials, .env sets
# MCP_TRANSPORT=http and MCP_HTTP_BEARER_TOKEN; to add a new token to it:
# echo "MCP_HTTP_BEARER_TOKEN=$(openssl rand -hex 32)" >> .env
docker run -d --name firewalla-mcp \
  -p 3000:3000 \
  --env-file .env \
  amittell/firewalla-mcp-server

# For docker-compose
cat > docker-compose.yml << EOF
version: '3.8'
services:
  firewalla-mcp:
    image: amittell/firewalla-mcp-server
    ports:
      - "3000:3000"
    environment:
      - MCP_TRANSPORT=http
      - MCP_HTTP_PORT=3000
      # The image already listens on every interface of the container
      - MCP_HTTP_HOST=0.0.0.0
      # From the shell or a .env next to this file; openssl rand -hex 32
      - MCP_HTTP_BEARER_TOKEN=\${MCP_HTTP_BEARER_TOKEN}
      # Other containers reach it as http://firewalla-mcp:3000/mcp
      - MCP_HTTP_ALLOWED_HOSTS=firewalla-mcp
      - FIREWALLA_MSP_TOKEN=\${FIREWALLA_MSP_TOKEN}
      - FIREWALLA_MSP_ID=\${FIREWALLA_MSP_ID}
      # Optional: filter to specific box
      # - FIREWALLA_BOX_ID=\${FIREWALLA_BOX_ID}
    restart: unless-stopped
EOF

docker-compose up -d
```

The image sets `MCP_HTTP_HOST=0.0.0.0` so that a published port reaches the server, and on that address the server does not start without `MCP_HTTP_BEARER_TOKEN` (at least 16 characters; `openssl rand -hex 32` makes one): the container exits with code 1, and `docker logs` shows a `refusing to start` line that says why. `-p 3000:3000` publishes the port on every interface of the Docker host, where anyone on your network can reach it. Publishing it on this machine only (`-p 127.0.0.1:3000:3000`) still needs the token: another container on the same Docker network can connect to the container's own address, and one that did, with `Host: localhost` and no token, got 200 when the check was turned off. `MCP_HTTP_ALLOW_NO_TOKEN=true` turns the check off, for a network no untrusted machine or container can reach, such as a compose network with no published port; the server then prints a warning when it starts. The server answers only requests whose `Host` header is `localhost`, `127.0.0.1` or `[::1]`, so a client that connects by another name, such as the host's LAN address or a compose service name, needs that name in `MCP_HTTP_ALLOWED_HOSTS`. See [HTTP transport security](#http-transport-security).

### Option C: Install from source
```bash
git clone https://github.com/amittell/firewalla-mcp-server.git
cd firewalla-mcp-server
npm install
npm run build
```

### 2. Configuration

Create a `.env` file with your Firewalla credentials:

```env
# Required
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net

# Optional - filters all queries to a specific box
# FIREWALLA_BOX_ID=your_box_gid_here

# Optional - default box for single-box operations, without filtering queries
# FIREWALLA_DEFAULT_BOX_ID=your_box_gid_here

# Optional - register the 11 write tools (default: off, read-only)
# FIREWALLA_ENABLE_WRITE_TOOLS=true
```

**Getting Your Credentials:**
1. Log into your Firewalla MSP portal at `https://yourdomain.firewalla.net`
2. Your MSP ID is the full domain (e.g., `company123.firewalla.net`)
3. Generate an access token in API settings
4. (Optional) Find your Box GID in device settings to filter queries to a specific box, or retrieve available boxes using the `get_boxes` tool

**Box ID is optional.** Without `FIREWALLA_BOX_ID`, queries cover every box on the account. The few operations that act on one box (`get_specific_alarm`, `archive_alarm`, `mute_alarm`, `delete_alarm`, `create_rule`, `rename_device`) take a `gid` argument, and without one they use `FIREWALLA_BOX_ID`, then `FIREWALLA_DEFAULT_BOX_ID`, then the account's only box. On an account with several boxes and none of those set, `get_specific_alarm`, `archive_alarm`, `mute_alarm` and `delete_alarm` check each box, and `create_rule` and `rename_device` refuse and list the boxes.

**Test mode.** `MCP_TEST_MODE=true` starts the server without credentials, to check that it starts: it uses a dummy token, API (`https://test.firewalla.net`) and box instead of your settings, always runs on stdio, and cannot read your Firewalla data. With `NODE_ENV=production` the server refuses test mode and exits with code 1. The Docker image sets `NODE_ENV=production`, so pass `-e NODE_ENV=development` along with `-e MCP_TEST_MODE=true`.

#### Transport Configuration

The MCP server supports two transport modes:

**Stdio Transport (Default)**: Standard input/output communication for Claude Desktop and similar MCP clients
```env
MCP_TRANSPORT=stdio
```

**HTTP Transport**: HTTP server mode for Docker containers, MCP orchestrators, and external access
```env
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000          # Default: 3000
MCP_HTTP_PATH=/mcp          # Default: /mcp. Other paths get 404
MCP_HTTP_HOST=127.0.0.1     # Address to listen on, no port (::1 or [::1] for IPv6). Default: 127.0.0.1 (0.0.0.0 in the Docker image)
MCP_HTTP_BEARER_TOKEN=      # Clients must send Authorization: Bearer <token>. Required, 16+ characters, unless MCP_HTTP_HOST is loopback
MCP_HTTP_ALLOW_NO_TOKEN=    # "true" starts beyond loopback without a token, for a network no untrusted machine can reach
MCP_HTTP_ALLOWED_HOSTS=     # More Host header names to accept, comma-separated
MCP_HTTP_ALLOWED_ORIGINS=   # Browser origins to accept, comma-separated, e.g. http://localhost:6274
```

<a id="http-transport-security"></a>
**HTTP transport security**: every request can spend your MSP token, so the HTTP server follows the security rules of the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports):

- It listens on `127.0.0.1`, this machine only. Set `MCP_HTTP_HOST=0.0.0.0` (or one address) to accept other machines, and set `MCP_HTTP_BEARER_TOKEN` with it: on any address but loopback (`127.0.0.0/8`, `::1`, `localhost`) the server refuses to start without a token, and exits with code 1 after one line on stderr that says why. `MCP_HTTP_ALLOW_NO_TOKEN=true` starts it without one, for a network no untrusted machine can reach, such as a compose network with no published port; the server then writes a warning to stderr at startup, whatever `LOG_LEVEL` says.
- With `MCP_HTTP_BEARER_TOKEN` set, a request without `Authorization: Bearer <token>` gets 401. A token shorter than 16 characters stops startup wherever the server listens; `openssl rand -hex 32` makes one 64 characters long.
- A request whose `Host` header is not `localhost`, `127.0.0.1`, `[::1]`, the `MCP_HTTP_HOST` address (unless that is the wildcard `0.0.0.0` or `::`, which adds nothing) or a name in `MCP_HTTP_ALLOWED_HOSTS` gets 403. This stops DNS rebinding, where a web page points its own domain name at your machine.
- A request with an `Origin` header, which browsers send, gets 403 unless the origin is in `MCP_HTTP_ALLOWED_ORIGINS`, compared as URL origins (letter case and a default port make no difference). Non-browser MCP clients send no `Origin` and are not affected. An allowed origin gets CORS headers on every answer, refusals such as a 401 for a missing token included, so a web page on it can call the server and read why a request was refused.
- The MCP endpoint is the configured `MCP_HTTP_PATH` exactly (default `/mcp`), that path with one trailing slash, and either with a query string. Any other path gets 404, CORS preflight requests included: with the default, `/mcpx` and `/mcp/x` do.
- A request body may be at most 1 MB, and a client has 10 seconds to send the headers and 30 seconds for the whole request. An answer given without reading the body (401, 403, 404, 405, a malformed session ID, a CORS preflight) closes the connection, so a client cannot hold one open by sending the body slowly.
- A session ends when the client sends DELETE, after `MCP_SESSION_IDLE_TIMEOUT_MS` without a request (default 30 minutes), or when the server restarts. A request with the ID of a session the server does not hold gets 404, and the transport specification has the client start a new session with a new `initialize`. A request with no session ID, other than `initialize`, gets 400.

**When to use HTTP transport:**
- Running in Docker containers independently
- Accessing from MCP orchestrators (e.g., open-webui)
- Multiple clients need to connect to the same server instance
- Network-based access to the MCP server

**When to use stdio transport:**
- Claude Desktop integration (default)
- Claude Code CLI integration
- Single-process MCP client setups
- Standard MCP client configurations

### 3. Build and Start

```bash
npm run build
npm run mcp:start
```

### 4. Connect Claude Desktop

Add this configuration to your Claude Desktop `claude_desktop_config.json`:

#### If installed via npm
```json
{
  "mcpServers": {
    "firewalla": {
      "command": "npx",
      "args": ["firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your_box_gid_here"
      }
    }
  }
}
```

#### If using Docker
```json
{
  "mcpServers": {
    "firewalla": {
      "command": "docker",
      "args": ["run", "-i", "--rm", 
        "-e", "FIREWALLA_MSP_TOKEN=your_token",
        "-e", "FIREWALLA_MSP_ID=yourdomain.firewalla.net",
        "-e", "FIREWALLA_BOX_ID=your_box_gid",
        "amittell/firewalla-mcp-server"
      ]
    }
  }
}
```

#### If installed from source
```json
{
  "mcpServers": {
    "firewalla": {
      "command": "node",
      "args": ["/full/path/to/firewalla-mcp-server/dist/server.js"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your_box_gid_here"
      }
    }
  }
}
```


**Config file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 5. Next Steps

- See **[USAGE.md](USAGE.md)** for practical examples and common queries
- Check **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** if you encounter issues
- Review client-specific setup guides in [docs/clients/](docs/clients/)

## Usage Examples

### Step-by-Step First Use

**1. Verify Connection**
After completing the setup, verify the MCP server is working:

```bash
# Start the server
npm run mcp:start

# You should see output like:
# MCP Server starting...
# Firewalla client initialized
# Server ready on stdio transport
```

**2. Test with Claude**
Open Claude Desktop and try these starter queries:

**Basic Health Check:**
```text
"Can you check my Firewalla status and show me a summary?"
```
*This uses: `firewall_summary` resource + `get_simple_statistics` tool*

**Security Overview:**
```text
"What security alerts do I have? Show me the 5 most recent ones."
```
*This uses: `get_active_alarms` tool with limit parameter*

### Practical Workflows

**Daily Security Review:**
```text
"Give me today's security report. Include:
1. Any new security alerts
2. Top 3 devices using bandwidth
3. Any devices that went offline
4. Status of critical firewall rules"
```

**Investigating Suspicious Activity:**
```text
"I noticed unusual traffic. Can you:
1. Show me all security and abnormal upload alarms from the last 4 hours
2. Find any blocked connections to external IPs
3. Check which devices had the most network activity"
```

**Network Troubleshooting:**
```text
"A device seems to have connectivity issues. Can you:
1. Check if device 192.168.1.100 is online
2. Show its recent network flows
3. See if any rules are blocking its traffic"
```

**Bandwidth Investigation:**
```text
"Our internet is slow. Help me find the cause:
1. Show top 10 bandwidth users in the last hour
2. Look for any devices with unusual upload/download patterns
3. Check for any streaming or video traffic"
```

### Advanced Search Examples

**Find Specific Threats:**
```text
search for: security activity alarms from IP range 10.0.0.* in the last 24 hours
```
*Uses: `search_alarms` with query: "type:1 AND device.ip:10.0.0.* AND ts:>=<unix time 24 hours ago>"*

**Analyze Rule Effectiveness:**
```text
"Show me firewall rules that blocked the most connections this week"
```
*Uses: `get_network_rules` + `search_flows` for blocked traffic analysis*

**Device Behavior Analysis:**
```text
"Find all devices that were online yesterday but are offline now"
```
*Uses: `search_devices` with temporal queries + `get_offline_devices`*


### Troubleshooting Common Issues

**Connection Problems:**
If you get authentication errors:
1. Verify your `.env` file has correct credentials
2. Check your MSP token hasn't expired
3. Confirm your Box ID is the full GID format

**Empty Results:**
If queries return no data:
1. Check your Firewalla is online and reporting
2. Verify the time range isn't too narrow
3. Try broader search terms first

**Performance Issues:**
If responses are slow:
1. Reduce the limit parameter in queries
2. Use more specific time ranges
3. Check your network connection to the MSP API

## Available Tools (24 read-only, 11 opt-in write tools)

### Core Tools
- **Security**: Get alarms, analyze threats
- **Network**: Monitor traffic flows, track bandwidth usage
- **Devices**: Check device status, find offline devices
- **Rules**: View firewall rules and their summary
- **Search**: Advanced search across all data types
- **Analytics**: Statistics, trends, and geographic analysis
- **Target Lists**: View security target lists

### Quick Reference
```
Security: get_active_alarms, get_specific_alarm
Network: get_flow_data, get_recent_flow_activity, get_bandwidth_usage
Devices: get_device_status, get_offline_devices, get_boxes
Rules: get_network_rules, get_network_rules_summary
Target lists: get_target_lists, get_specific_target_list
Search: search_flows, search_alarms, search_rules, search_devices, search_target_lists
Analytics: get_simple_statistics, get_statistics_by_region, get_statistics_by_box, get_flow_insights, get_flow_trends, get_alarm_trends, get_rule_trends
Write (opt-in): create_rule, delete_rule, pause_rule, resume_rule, create_target_list, update_target_list, delete_target_list, rename_device, archive_alarm, mute_alarm, delete_alarm
```

### Response format

Every read-only tool (`readOnlyHint: true`) takes an optional `response_format`. `json`, the default, returns the compact JSON response. `markdown` returns the same response as markdown for reading: a heading with the tool name and the number of records in each list, the fields as bullet lists, and each list of records as a table of at most 8 columns and `DEFAULT_PAGE_SIZE` rows (default 100). Fields with one value in every record are stated once above the table, fields that are not columns are named below it, and a list of one record is shown as a list of its fields. The last line says what the view leaves out (the response's `meta` block, rows past the cap, cells cut at 120 characters); `response_format: json` returns all of it. Values and field names are escaped, since device names, domains and alarm messages come from the network: a character that could start markdown or HTML (`[`, `<`, `*`, `` ` ``, `&` before an entity, `://`, `@`, ...) gets a backslash, so a renderer shows `[a](https://...)` or `<img ...>` as text. Addresses, MACs, gids and timestamps read as they are. Omitting `response_format` or sending `null` means `json`. An error is compact JSON in either format: only a successful read is rendered as markdown. The tools that change state do not take `response_format`.

`get_device_status` with `{"limit": 2, "response_format": "markdown"}`, shortened:

```markdown
## get_device_status (devices: 2)

- **total_devices:** 2
- **online_devices:** 1
- **devices:** 2 records, under devices below

### devices (2 records)

Same in every record: gid = 00000000-0000-0000-0000-000000000000; ip_reserved = false.

| name | id | last_seen | ip | online |
| --- | --- | --- | --- | --- |
| nas | AA:BB:CC:DD:EE:01 | 2026-09-26T10:00:00.000Z | 192.168.1.10 | true |
| printer | AA:BB:CC:DD:EE:02 | 2026-09-25T18:30:00.000Z | 192.168.1.11 | false |

_This view leaves out the meta block (request_id req_1790000000000_abc123). Call again with `response_format: json` for the full JSON response._
```

### Write tools (opt-in)

Every tool that changes something is off by default, so the server is read-only unless you turn them on. Set `FIREWALLA_ENABLE_WRITE_TOOLS=true` to register the 11 write tools: `create_rule`, `delete_rule`, `pause_rule` and `resume_rule` (rules), `create_target_list`, `update_target_list` and `delete_target_list` (target lists), `rename_device` (devices), and `archive_alarm`, `mute_alarm` and `delete_alarm` (alarms). Without it, calling one answers "Unknown tool" and sends nothing. MCP clients that honor tool annotations can ask before calling them; see [Tool annotations](#tool-annotations).

Up to 1.5.0, `pause_rule`, `resume_rule` and the three target-list tools were always registered. If you use them, set `FIREWALLA_ENABLE_WRITE_TOOLS=true`; see [Upgrading to 2.0.0](#upgrading-to-200).

The write tools need an MSP API token with write access. Firewalla said on 2026-09-08 that MSP 2.12 adds read-only API tokens, which cannot make changes. When a write gets HTTP 403, the error says the token may be read-only and that the write tools need a token with write access. A 403 can also mean the request named a box the token cannot access, and the error says that too; `get_boxes` lists the boxes the token can access.

IDs that go into a request path (`id`, `rule_id`, `alarm_id`, `gid`, `device_id`) are checked before anything is sent. One holding `/`, a backslash, `?`, `#`, `%`, whitespace or a control character, or that is `.` or `..`, is refused as a validation error naming the argument; leading or trailing whitespace is refused too, not trimmed. Rule IDs such as `<box gid>:<n>`, MAC device IDs and `ovpn:` device IDs are accepted.

`create_rule` and `rename_device` act on one box: `gid`, else `FIREWALLA_BOX_ID` or `FIREWALLA_DEFAULT_BOX_ID`, else the account's only box. On a multi-box account with none of those, they refuse without writing anything, because the MSP API applies a rule with no `gid` to every box in the account, including boxes added later. `delete_rule` needs MSP 2.11.0 or later.

`archive_alarm` and `mute_alarm` need MSP 2.11.0 or later. `archive_alarm` takes an alarm out of the active alarms and does nothing else: future matching traffic can still raise new alarms. `mute_alarm` archives the alarm and has the box create a lasting silence exception. Its `target_type` says what is silenced: `alarmType` every future alarm of that alarm's type, whatever the destination; `domain` a domain and its subdomains; `ip` one address. Its `scope_type` says for which devices: `all` of them, or the one device, group, user or network named by `scope_value`. The mute is checked against the documented request model before anything is sent, and this server has no tool to remove the exception afterwards. `delete_alarm` deletes the alarm for good (measured on 2026-09-26: the alarm was gone afterwards); use `archive_alarm` to keep it among the archived alarms. Alarm IDs are per box, and the same ID can name different alarms on different boxes: all three tools use the alarm's `gid`, else `FIREWALLA_BOX_ID`, else check each box, and they refuse when several boxes have that alarm ID and none of them is `FIREWALLA_DEFAULT_BOX_ID`. All three read the alarm before writing, so a wrong ID fails without changing anything.

### Tool annotations

Every tool carries MCP tool annotations: a `title`, `readOnlyHint`, and `openWorldHint: true`, since each one calls the Firewalla MSP API. All `get_*` and `search_*` tools are read-only. The tools that change state have `readOnlyHint: false`, and all of them need `FIREWALLA_ENABLE_WRITE_TOOLS=true`:

| Tool | `destructiveHint` | `idempotentHint` |
|---|---|---|
| `pause_rule`, `resume_rule` | false | true |
| `create_target_list` | false | false |
| `update_target_list`, `delete_target_list` | true | true |
| `create_rule` | true | false |
| `delete_rule` | true | true |
| `rename_device` | false | true |
| `archive_alarm` | false | true |
| `mute_alarm` | true | false |
| `delete_alarm` | true | true |

`pause_rule` and `resume_rule` check the rule's status first and change nothing when it is already paused or active. Clients that honor annotations can ask before calling any tool that is not read-only.

## Development

### Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
```

### MCP Execution Methods

**Why `npx` for MCP servers?**
- **Version Management**: Always uses the correct/latest version
- **Dependency Resolution**: Handles package dependencies automatically  
- **No global installation required**: Works without global installation
- **MCP Standard**: Follows Model Context Protocol conventions
- **Reliable**: Works consistently across different environments

**Alternative execution methods:**
```bash
# Development (from source)
npm run mcp:start

# Production (npm installed)
npx firewalla-mcp-server

# Direct execution (from source after build)
node dist/server.js
```

### Launch checks in CI

`scripts/launch-smoke.mjs` starts the server the way a user would and requires an answer to an MCP `initialize` over stdio. It uses dummy credentials, and `initialize` is answered locally, so nothing is sent to Firewalla.

- The CI workflow's `launch` job packs the package and starts it through the global bin, `npx` and `node dist/server.js`: on Linux for a pull request, and on Linux, macOS and Windows for a push to main or a run by hand (Actions, CI, Run workflow). A change to `docs/`, top-level Markdown files or `LICENSE` alone runs no CI; no job reads them (`format:check` covers `src/` only).
- The Docker Build workflow runs on pull requests that touch the Dockerfile, the package files or the Docker workflows. It builds the image for amd64, arm64 and arm/v7, then runs the amd64 image with `docker run -i --rm` and requires `serverInfo.version` to equal `package.json`'s version. Run the workflow by hand with the `image` input (for example `amittell/firewalla-mcp-server:1.4.1`) to pull and check a published image instead.

To run the Docker check locally:

```bash
docker build -t firewalla-mcp-server:local .
node scripts/launch-smoke.mjs --docker firewalla-mcp-server:local

# A published image; the expected version comes from the tag
node scripts/launch-smoke.mjs --docker amittell/firewalla-mcp-server:1.4.1 --pull
```

### Project Structure

```text
firewalla-mcp-server/
├── src/
│   ├── server.ts           # Main MCP server
│   ├── firewalla/          # Firewalla API client
│   ├── tools/              # MCP tool implementations
│   ├── resources/          # MCP resource implementations
│   └── prompts/            # MCP prompt implementations
├── tests/                  # Test files
├── docs/
│   └── firewalla-api-reference.md  # API documentation
├── CLAUDE.md              # Comprehensive development guide
├── SPEC.md                # Technical specifications
└── README.md              # This file
```

## Documentation

- **README.md** (this file) - Setup and basic usage
- **[USAGE.md](USAGE.md)** - Simple usage guide with examples
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **docs/clients/** - Client-specific setup guides  
- **CLAUDE.md** - Development guide and commands

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability. For the HTTP transport, see [HTTP transport security](#http-transport-security).

- MSP tokens are stored securely in environment variables
- No credentials are logged or stored in code
- Each server process paces its own requests to `API_RATE_LIMIT` per rolling 5 minutes (default 100, the limit measured on one MSP token; whether it is per token or per account was not measured). A request that cannot start within 20 s fails at once, saying when capacity returns. Every MCP client that starts the server over stdio starts its own process with its own count, so several of them on one token need `API_RATE_LIMIT` values that add up to 100 or less. See [the rate-limiting guide](docs/rate-limiting-guide.md)
- Input validation prevents injection attacks
- Device names, domains and alarm messages are set by the devices and sites on your network, so the server treats them as untrusted: characters that do not display are shown as markers such as `<U+E0041>`, the prompts quote API data only inside a marked data block, and the `initialize` instructions tell the client to treat results as data. See [Untrusted data](SECURITY.md#untrusted-data)
- All API communications use HTTPS

## Known Behaviors and Limitations

### Category Classification
- **Flow Categories**: Many network flows may show as empty category ("") in the Firewalla API response. This is expected behavior - Firewalla categorizes traffic when it recognizes the domain/service (e.g., "av" for audio/video, "social" for social media).
- **Target List Categories**: Some target lists may show category as "unknown". This is normal for user-created or certain system lists.
- **Timeline**: Category classification happens at the Firewalla device level and may take time to build up meaningful categorization data.

### Data Characteristics
- **Response Sizes**: The `get_recent_flow_activity` tool returns up to 150 recent flows to stay within token limits. For larger datasets or historical analysis, use `search_flows` with time filters for more targeted queries.
- **Geographic Data**: IP geolocation is enriched by the MCP server and includes country, city, and risk scores when available.

### API Limitations
- **MSP only**: The server sends every request to the MSP API at `https://<FIREWALLA_MSP_ID>` and never connects to the box on your LAN. It has no local mode, so it needs an MSP account with API access even for one box at home, and it sees only what the MSP API returns.
- **Alarm Deletion**: In July 2025 the MSP API answered `DELETE /v2/alarms/{gid}/{aid}` with `{"message": "success", "success": true}` and kept the alarm, so `delete_alarm` was withdrawn. Measured again on 2026-09-26, the same request deleted the alarm (a GET of it then answered 404, and the archived alarm count fell by one), and `delete_alarm` is back as an opt-in write tool.

## Troubleshooting

### Quick Fixes

**Server won't start:**
```bash
# Clean and rebuild
npm run clean
npm run build

# If build fails, try:
npm install
npm run build
```

**Authentication errors:**
- Check your MSP token is valid
- Verify Box ID format (long UUID)
- Confirm MSP domain is correct

**No data returned:**
- Try broader queries: "last week" vs "last hour"
- Check if Firewalla is online
- Test with: "show me basic statistics"

**Slow responses:**
- Add limits: "top 10 devices"
- Use shorter time ranges
- Restart the server

### Debug Mode

Enable detailed logging:
```bash
DEBUG=firewalla:* npm run mcp:start
```

For more detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## What's New

Release notes for every version, newest first, are in
[CHANGELOG.md](CHANGELOG.md). Changes that are merged but not yet released are
listed there under Unreleased.

## License

[MIT License](LICENSE)

## Support

For issues and questions:
- Check the [troubleshooting guide](CLAUDE.md#common-issues-and-solutions)
- Review the [technical specifications](SPEC.md)
- Open an issue on GitHub



---

## GitHub Repository

**Repository**: [https://github.com/amittell/firewalla-mcp-server](https://github.com/amittell/firewalla-mcp-server)

### Quick Links
- [Issues](https://github.com/amittell/firewalla-mcp-server/issues)
- [Pull Requests](https://github.com/amittell/firewalla-mcp-server/pulls)
- [Actions](https://github.com/amittell/firewalla-mcp-server/actions)
- [Security](https://github.com/amittell/firewalla-mcp-server/security)

### Repository Stats
[![GitHub issues](https://img.shields.io/github/issues/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/issues)
[![GitHub stars](https://img.shields.io/github/stars/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/stargazers)
[![GitHub license](https://img.shields.io/github/license/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/blob/main/LICENSE)

