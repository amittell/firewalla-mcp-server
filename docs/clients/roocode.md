# Firewalla MCP × Roocode

Connect Firewalla network security data to Roocode for integrated security monitoring in your development environment.

## Prerequisites

- Roocode IDE installed and configured
- Node.js 18+ and npm
- Active Firewalla MSP account with API credentials
- MCP extension support in Roocode

## Quick Setup

### 1. Install Firewalla MCP Server

```bash
# Install globally for system access
npm install -g firewalla-mcp-server

# Verify installation
npx firewalla-mcp-server --version
```

### 2. Configure MCP in Roocode

Add MCP server configuration to Roocode settings:

**File**: Roocode Settings → Extensions → MCP Configuration

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

### 3. Environment Variables (Alternative)

Set credentials in your environment:

```bash
export FIREWALLA_MSP_TOKEN="your_msp_access_token_here"
export FIREWALLA_MSP_ID="yourdomain.firewalla.net"
export FIREWALLA_BOX_ID="your_box_gid_here"
```

### 4. Enable MCP Extension

1. Open Roocode Extensions panel
2. Enable MCP support if not already active
3. Restart Roocode to activate configuration

### 5. Test Integration

In Roocode, test the connection:
```text
"Show me my Firewalla network security overview"
```

## Roocode Workflow Integration

**Code-Aware Security Monitoring**
- Monitor network security while coding
- Analyze bandwidth usage during development
- Review firewall rules affecting your applications

**Development Environment Security**
```bash
# Monitor development network activity
"What network connections are active from my development environment?"

# Check for security issues
"Are there any blocked connections that might affect my local development?"
```

**Real-time Network Analysis**
- Device connectivity monitoring
- Traffic pattern analysis
- Security alert integration

## Useful Commands

**Security Monitoring**
```text
"What security alerts have triggered in the last hour?"
"Show me top bandwidth consumers on my network"
"Are there any offline devices I should know about?"
```

**Network Troubleshooting**
```text
"Check firewall rules affecting port 3000"
"Analyze network flows for my development server IP"
"Show me any blocked traffic from external sources"
```

## Troubleshooting

**MCP Server Not Found**
- Verify global installation: `npm list -g firewalla-mcp-server`
- Check PATH includes npm global bin directory
- Try absolute path: `/usr/local/bin/npx firewalla-mcp-server`

**Connection Issues**
- Verify Firewalla credentials are correct
- Test connection manually: `curl -H "Authorization: Bearer $FIREWALLA_MSP_TOKEN" https://$FIREWALLA_MSP_ID/v2/boxes`
- Check network connectivity to MSP domain

**Performance Optimization**
- Use specific time ranges for faster queries
- Leverage caching by avoiding frequent `force_refresh` calls
- Set reasonable `limit` parameters for large datasets

## Advanced Features

- **34+ specialized tools** for comprehensive network security analysis
- **Geographic threat analysis** with country-level filtering
- **Advanced search syntax** supporting complex queries with logical operators
- **Real-time monitoring** with intelligent caching for optimal performance

## Integration Benefits

- **Seamless development workflow** with integrated security monitoring
- **Proactive threat detection** while coding and testing
- **Network performance insights** for application optimization
- **Compliance monitoring** for enterprise development environments

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*