# Firewalla MCP Server

[![npm version](https://badge.fury.io/js/firewalla-mcp-server.svg)](https://www.npmjs.com/package/firewalla-mcp-server)
<a href="https://glama.ai/mcp/servers/@amittell/firewalla-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@amittell/firewalla-mcp-server/badge" alt="Glama MCP Server" />
</a>

A Model Context Protocol (MCP) server that provides real-time access to Firewalla firewall data through 28 specialized tools, compatible with any MCP client.

## Why Firewalla MCP Server?

### Simple Network Security Integration
- **28 Tools** for network monitoring and analysis
- **23 Direct API Endpoints** + **5 Convenience Wrappers**
- **Advanced Search** with query syntax and filters
- **Clean, Verified Architecture** with corrected API schemas

## Features

- **Real-time Firewall Data**: Query security alerts, network flows, and device status  
- **Security Analysis**: Get insights on threats, blocked attacks, and network anomalies  
- **Bandwidth Monitoring**: Track top bandwidth consumers and usage patterns  
- **Rule Management**: View and temporarily pause firewall rules  
- **Target Lists**: Manage custom security target lists and categories
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
  

## How It Works

```
Claude Desktop/Code ↔ MCP Server ↔ Firewalla API
```

The MCP server acts as a bridge between Claude and your Firewalla firewall, translating Claude's requests into Firewalla API calls and returning the results in a format Claude can understand.

## Prerequisites

- Node.js 18+ and npm
- Firewalla MSP account with API access
- Your Firewalla device online and connected

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
# Using Docker Hub image
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
  -e FIREWALLA_BOX_ID=your_box_gid \
  firewalla-mcp-server

# Recommended: Using env file (more secure)
docker run -it --rm --env-file .env amittell/firewalla-mcp-server
```

**HTTP Transport (for standalone Docker containers and external access):**
```bash
# Run with HTTP transport on port 3000
docker run -d --name firewalla-mcp \
  -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_HTTP_PORT=3000 \
  -e FIREWALLA_MSP_TOKEN=your_token \
  -e FIREWALLA_MSP_ID=yourdomain.firewalla.net \
  -e FIREWALLA_BOX_ID=your_box_gid \
  amittell/firewalla-mcp-server

# The server will be accessible at http://localhost:3000/mcp

# Using env file (recommended)
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
      - FIREWALLA_MSP_TOKEN=\${FIREWALLA_MSP_TOKEN}
      - FIREWALLA_MSP_ID=\${FIREWALLA_MSP_ID}
      - FIREWALLA_BOX_ID=\${FIREWALLA_BOX_ID}
    restart: unless-stopped
EOF

docker-compose up -d
```

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
```

**Getting Your Credentials:**
1. Log into your Firewalla MSP portal at `https://yourdomain.firewalla.net`
2. Your MSP ID is the full domain (e.g., `company123.firewalla.net`)
3. Generate an access token in API settings
4. (Optional) Find your Box GID in device settings to filter queries to a specific box, or retrieve available boxes using the `get_boxes` tool

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
MCP_HTTP_PATH=/mcp          # Default: /mcp
```

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
*Uses: `search_alarms` with query: "type:1 AND source_ip:10.0.0.* AND timestamp:>24h"*

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

## Available Tools (28 total)

### Core Tools
- **Security**: Get alarms, analyze threats
- **Network**: Monitor traffic flows, track bandwidth usage
- **Devices**: Check device status, find offline devices
- **Rules**: Manage firewall rules, pause/resume rules
- **Search**: Advanced search across all data types
- **Analytics**: Statistics, trends, and geographic analysis
- **Target Management**: Create, update, and delete security target lists

### Quick Reference
```
Security: get_active_alarms, get_specific_alarm
Network: get_flow_data, get_bandwidth_usage, get_offline_devices  
Devices: get_device_status, get_boxes, search_devices
Rules: get_network_rules, pause_rule, resume_rule, get_target_lists
Search: search_flows, search_alarms, search_rules, search_target_lists
Analytics: get_simple_statistics, get_flow_insights, get_flow_trends, get_alarm_trends
Management: create_target_list, update_target_list, delete_target_list
```

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

- MSP tokens are stored securely in environment variables
- No credentials are logged or stored in code
- Rate limiting prevents API abuse
- Input validation prevents injection attacks
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
- **Alarm Deletion**: The `delete_alarm` tool may not actually delete alarms even though the Firewalla API returns a success response. This appears to be a limitation of the MSP API where delete operations return `{"message": "success", "success": true}` but the alarm remains in the system. This may be due to permission restrictions or API design.

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
DEBUG=mcp:* npm run mcp:start
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

**Version 1.0.0:**
- 28 tools with API-verified schemas
- 24 direct API endpoints + 5 convenience wrappers
- NEW: get_flow_insights for category-based traffic analysis
- Advanced search with logical operators (AND, OR, NOT)
- All limits corrected to API maximum (500)
- Required parameters added for proper API calls
- Better caching for faster responses
- Handles high-volume networks (300k+ flows/day)  

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

