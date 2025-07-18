# Firewalla MCP × Cline

Integrate Firewalla network security monitoring into Cline for AI-powered security analysis and network management.

## Prerequisites

- Cline extension installed in VS Code
- Node.js 18+ and npm
- Active Firewalla MSP account with API access
- VS Code with Cline properly configured

## Quick Setup

### 1. Install Firewalla MCP Server

```bash
# Install globally for easy access
npm install -g firewalla-mcp-server

# Verify installation works
npx firewalla-mcp-server --version
```

### 2. Configure Cline MCP Integration

Update Cline's MCP configuration in VS Code settings:

**File**: VS Code Settings → Extensions → Cline → MCP Servers

```json
{
  "cline.mcpServers": {
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

### 3. Alternative Configuration Method

Create workspace-specific config in `.vscode/settings.json`:

```json
{
  "cline.mcpServers": {
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

### 4. Test Integration

1. Open Cline panel in VS Code (`Ctrl+Shift+P` → "Cline: Start")
2. Test connection:
   ```text
   "Can you check my Firewalla network status and show me any security alerts?"
   ```

## Cline-Specific Features

**AI-Powered Security Analysis**
- Intelligent threat pattern recognition
- Automated security report generation
- Context-aware network troubleshooting

**Code Integration**
```typescript
// Ask Cline while coding:
"Analyze my network security while I'm developing this API.
Are there any firewall rules that might block this endpoint?"
```

**Automated Security Workflows**
```text
"Set up a daily security check routine that:
1. Reviews high-severity alerts
2. Checks for offline devices
3. Analyzes bandwidth anomalies
4. Generates a summary report"
```

## Advanced Cline Commands

**Comprehensive Security Analysis**
```text
"Perform a complete network security audit covering:
- All security alerts from the last 24 hours
- Bandwidth usage patterns and anomalies
- Firewall rule effectiveness
- Geographic threat analysis
- Device connectivity status"
```

**Interactive Network Debugging**
```text
"Help me debug a network connectivity issue:
1. Check if device 192.168.1.100 is online
2. Review any blocked traffic to/from this device
3. Analyze recent network flows
4. Suggest troubleshooting steps"
```

**Security Compliance Reporting**
```text
"Generate a security compliance report for management including:
- Summary of all threats detected and blocked
- Network access control effectiveness
- Bandwidth usage by department/device type
- Recommendations for security improvements"
```

## Troubleshooting

**Cline Not Connecting to MCP**
- Verify Cline extension is up to date
- Check VS Code's output panel for MCP server logs
- Restart VS Code after configuration changes

**MCP Server Issues**
- Test server manually: `npx firewalla-mcp-server --test`
- Verify credentials with: `curl -H "Authorization: Bearer $FIREWALLA_MSP_TOKEN" https://$FIREWALLA_MSP_ID/v2/boxes`

**Performance Optimization**
- Use specific time ranges for faster analysis
- Request reasonable result limits
- Leverage caching features for repeated queries

## AI-Enhanced Security Benefits

- **Intelligent threat analysis** with AI-powered pattern recognition
- **28 specialized tools** for comprehensive network monitoring
- **Natural language security queries** with advanced search capabilities
- **Automated security workflows** for proactive monitoring
- **Context-aware recommendations** based on network patterns

## Integration Workflow

**Development Security**
```text
"While I'm coding this network service, monitor for:
- Any security alerts related to the ports I'm using
- Bandwidth patterns that might indicate issues
- Firewall rules that could affect deployment"
```

**Production Monitoring**
```text
"Set up continuous monitoring that alerts me to:
- High-severity security events
- Unusual bandwidth consumption
- Device connectivity problems
- Geographic-based threats"
```

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*