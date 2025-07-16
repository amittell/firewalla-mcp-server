# Firewalla MCP × Cursor

Integrate Firewalla network security monitoring into Cursor IDE for real-time security analysis while coding.

## Prerequisites

- Cursor IDE installed
- Node.js 18+ and npm
- Active Firewalla MSP account with API access
- Claude Code extension for Cursor

## Quick Setup

### 1. Install Claude Code Extension

**Method A: VSIX Installation (Recommended)**
```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Locate the VSIX file
find ~/.claude -name "claude-code.vsix" 2>/dev/null

# In Cursor: Extensions → Install from VSIX → Select the .vsix file
```text

**Method B: Manual Installation**
1. Open Cursor Extensions panel (`Ctrl+Shift+X`)
2. Search for "Claude Code"
3. Install if available in marketplace

### 2. Install Firewalla MCP Server

```bash
npm install -g firewalla-mcp-server
```text

### 3. Configure MCP Connection

Create MCP configuration in Cursor:

**File**: `~/.cursor/mcp_config.json` or workspace `.cursor/mcp.json`

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

### 4. Verify Installation

1. Open Cursor terminal (`Ctrl+Shift+``)
2. Run: `/status` to check Claude Code connection
3. Expected output:
   ```
   ✔ Connected to Cursor extension
   ✔ Installed Cursor extension version 1.0.44
   ```

### 5. Test Firewalla Integration

In Cursor, activate Claude Code and test:
```text
"Check my Firewalla security status and show me any alerts"
```text

## Cursor-Specific Features

**AI-Powered Security Analysis**
- Real-time network monitoring while coding
- Security-aware code suggestions and reviews
- Integrated firewall rule management

**Developer Workflow Integration**
- Network debugging during development
- Bandwidth monitoring for performance optimization
- Security compliance checking

**Terminal Integration**
```bash
# Use Claude Code commands in terminal
/model      # Select Sonnet model
/ide        # Configure Cursor integration
/status     # Check connection status
```text

## Troubleshooting

**Extension Not Working**
1. Uninstall any existing Claude extensions
2. Restart Cursor completely
3. Reinstall using VSIX method
4. Verify with `/status` command

**MCP Connection Issues**
- Check MCP server installation: `npx firewalla-mcp-server --version`
- Verify credentials in MCP config file
- Test manual connection: `npx firewalla-mcp-server --test`

**Performance Issues**
- Use specific time ranges in queries
- Limit result sets with explicit parameters
- Leverage intelligent caching features

## Advanced Integration

**Code Context Awareness**
```javascript
// While editing network-related code, ask:
"Are there any firewall rules that might affect this API endpoint?"
"What's the current bandwidth usage for our production servers?"
```text

**Security-First Development**
```bash
# Integrated security checks
"Before deploying, check if any security alerts affect our target environment"
"Analyze network flows for any suspicious patterns related to this service"
```text

## Key Benefits

- **34+ specialized security tools** integrated into your IDE
- **Real-time threat monitoring** while developing
- **Geographic security analysis** for global deployments
- **Advanced search capabilities** with natural language queries

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*