# Firewalla MCP × VS Code

Connect Firewalla network security data to VS Code for integrated security monitoring while coding and network administration.

## Prerequisites

- VS Code with MCP extension support
- Node.js 18+ and npm installed
- Active Firewalla MSP account
- MCP extension for VS Code installed

## Quick Setup

### 1. Install MCP Extension

In VS Code:
1. Open Extensions (`Ctrl+Shift+X`)
2. Search for "Model Context Protocol" or "MCP"
3. Install the official MCP extension

### 2. Install Firewalla MCP Server

```bash
# Install globally for easy access
npm install -g firewalla-mcp-server
```

### 3. Configure MCP Server

Create or edit VS Code MCP settings:

**File**: `.vscode/mcp.json` (in workspace) or global VS Code settings

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

### 4. Environment Setup (Alternative)

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "firewalla": {
      "command": "npx",
      "args": ["firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "${env:FIREWALLA_MSP_TOKEN}",
        "FIREWALLA_MSP_ID": "${env:FIREWALLA_MSP_ID}",
        "FIREWALLA_BOX_ID": "${env:FIREWALLA_BOX_ID}"
      }
    }
  }
}
```

Then set environment variables in your shell.

### 5. Test Integration

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "MCP: Connect to Server"
3. Select "firewalla"
4. Test with: "Show me my network security status"

## VS Code Workflow Integration

**Security Code Review**
- Analyze network logs while reviewing security-related code
- Query firewall rules when working on network configurations
- Monitor bandwidth during performance optimization

**DevOps Integration**
```json
// In tasks.json - automated security checks
{
  "label": "Security Check",
  "type": "shell",
  "command": "npx",
  "args": ["firewalla-mcp-server", "--query", "high-severity-alarms"]
}
```

**Debugging Network Issues**
- Real-time network flow analysis
- Device connectivity troubleshooting
- Firewall rule verification

## Useful VS Code Commands

**MCP Panel Access**
- `Ctrl+Shift+P` → "MCP: Show Panel"
- `Ctrl+Shift+P` → "MCP: Query Server"

**Security Monitoring**
- Query: "What devices are offline right now?"
- Query: "Show me blocked traffic from the last hour"
- Query: "Top bandwidth users during work hours"

## Troubleshooting

**Extension Not Loading**
- Verify MCP extension is installed and enabled
- Check VS Code logs: Help → Toggle Developer Tools → Console

**Server Connection Issues**
- Verify global npm installation: `npm list -g firewalla-mcp-server`
- Test server manually: `npx firewalla-mcp-server --test`

**Workspace Configuration**
- Ensure `.vscode/mcp.json` has correct permissions
- Try global settings if workspace config fails

## Advanced Features

- **Real-time security insights** integrated with your development workflow
- **28 specialized tools** for comprehensive network analysis
- **Advanced search syntax** with complex filtering capabilities
- **Geographic threat analysis** for international development teams

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*