# Firewalla MCP × Claude Desktop

Connect your Firewalla firewall data directly to Claude Desktop for real-time security analysis and network monitoring.

## Prerequisites

- Claude Desktop app installed
- Node.js 18+ for running the MCP server
- Active Firewalla MSP account with API access

## Quick Setup

### 1. Install the MCP Server

```bash
# Install globally (recommended)
npm install -g firewalla-mcp-server

# Or install locally
npm install firewalla-mcp-server
```

### 2. Configure Claude Desktop

Open Claude Desktop settings and click **Developer → Edit Config** to modify `claude_desktop_config.json`:

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

### 3. Get Your Credentials

1. **MSP Token**: Log into your Firewalla MSP portal → API Settings → Generate Token
2. **MSP ID**: Your full domain (e.g., `company.firewalla.net`)
3. **Box ID**: Device settings → Copy the Box GID (long UUID format)

### 4. Test the Connection

Restart Claude Desktop and try:

```text
"Show me my Firewalla security alerts from the last hour"
```

## Configuration Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## Troubleshooting

**Authentication Errors**
- Verify MSP token hasn't expired
- Check Box ID format (should be UUID, not device name)
- Ensure network connectivity to your MSP domain

**No Data Returned**
- Confirm your Firewalla is online and reporting
- Try broader time ranges in queries
- Check MSP portal for API rate limits

## Example Queries

```text
"What are my top 10 bandwidth users this week?"
"Show me all high-severity security alerts"
"Are there any offline devices I should know about?"
"What firewall rules are currently blocking traffic?"
```

## Features

- **33 working tools** for comprehensive network analysis
- **Advanced search syntax** with logical operators and filters
- **Geographic threat analysis** with country-level insights
- **Real-time monitoring** with intelligent caching

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*