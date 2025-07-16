# Firewalla MCP × Claude Code

Integrate Firewalla network security data into your Claude Code CLI workflow for command-line security monitoring and analysis.

## Prerequisites

- Claude Code CLI installed and authenticated
- Node.js 18+ and npm
- Active Firewalla MSP account with API credentials

## Quick Setup

### 1. Install the MCP Server

```bash
# Install globally for system-wide access
npm install -g firewalla-mcp-server

# Verify installation
npx firewalla-mcp-server --version
```text

### 2. Configure MCP Connection

Create or update your Claude Code MCP configuration file:

**Linux/macOS**: `~/.config/claude-code/mcp_config.json`
**Windows**: `%APPDATA%\claude-code\mcp_config.json`

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
```text

### 3. Environment Variables (Alternative)

For convenience, set environment variables in your shell profile:

```bash
export FIREWALLA_MSP_TOKEN="your_msp_access_token_here"
export FIREWALLA_MSP_ID="yourdomain.firewalla.net"
export FIREWALLA_BOX_ID="your_box_gid_here"
```text

### 4. Test Integration

Start a Claude Code session and test:

```bash
claude-code
# In Claude Code prompt:
"Check my Firewalla status and show me any security alerts"
```text

## CLI Workflow Examples

**Security Monitoring**
```bash
claude-code "Analyze my network traffic from the last 2 hours and flag any suspicious activity"
```text

**Bandwidth Investigation**
```bash
claude-code "Who are my top bandwidth consumers today? Show me devices and data usage"
```text

**Rule Management**
```bash
claude-code "List all active firewall rules and show me which ones have blocked traffic recently"
```text

## Advanced CLI Usage

**Scripted Analysis**
```bash
# Save network report to file
claude-code "Generate a comprehensive network security report" > security_report.md

# Pipe to other tools
claude-code "Get high-severity alarms as JSON" | jq '.alarms[] | select(.severity=="high")'
```text

**Automated Monitoring**
```bash
# Add to cron for daily reports
0 9 * * * claude-code "Daily Firewalla security summary" | mail -s "Security Report" admin@company.com
```text

## Troubleshooting

**MCP Server Not Found**
- Verify global installation: `npm list -g firewalla-mcp-server`
- Try full path: `/usr/local/bin/npx firewalla-mcp-server`

**Authentication Issues**
- Test credentials with: `curl -H "Authorization: Bearer $FIREWALLA_MSP_TOKEN" https://$FIREWALLA_MSP_ID/v2/boxes`
- Verify Box ID format (UUID, not device name)

**Performance Tips**
- Use specific time ranges for faster queries
- Leverage caching by avoiding `force_refresh` unless needed
- Limit result sets with explicit `limit` parameters

## Integration Benefits

- **Real-time CLI monitoring** of network security
- **Scriptable security analysis** for automation
- **34+ specialized tools** accessible via natural language
- **Advanced search capabilities** with complex query syntax

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*