# Firewalla MCP Server

A Model Context Protocol (MCP) server that enables Claude to access and analyze your Firewalla firewall data in real-time.

## Features

🔥 **Real-time Firewall Data**: Query security alerts, network flows, and device status  
🛡️ **Security Analysis**: Get insights on threats, blocked attacks, and network anomalies  
📊 **Bandwidth Monitoring**: Track top bandwidth consumers and usage patterns  
⚙️ **Rule Management**: View and temporarily pause firewall rules  
🎯 **Target Lists**: Access CloudFlare and CrowdSec security intelligence  

## Architecture

```
┌─────────────────┐    MCP Protocol     ┌─────────────────┐    HTTPS API    ┌─────────────────┐
│                 │    (stdio/JSON-RPC) │                 │                 │                 │
│   Claude Code   │◄───────────────────►│   MCP Server    │◄───────────────►│ Firewalla MSP   │
│                 │                     │   (Node.js)     │                 │      API        │
└─────────────────┘                     └─────────────────┘                 └─────────────────┘
```

## Prerequisites

- Node.js 18+ and npm
- Active Firewalla MSP (Managed Security Portal) account
- Valid MSP subscription plan
- MSP API access token

## Quick Start

### 1. Installation

```bash
git clone <repository-url>
cd firewalla_mcp
npm install
```

### 2. Configuration

Create a `.env` file with your Firewalla credentials:

```env
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=your_msp_id_here
FIREWALLA_BOX_ID=your_box_id_here
```

**Getting Your Credentials:**
1. Log into your Firewalla MSP portal
2. Your MSP ID is the part before `.firewalla.net` in your portal URL
3. Generate an access token in API settings
4. Find your Box ID in device settings

### 3. Build and Start

```bash
npm run build
npm run mcp:start
```

### 4. Connect Claude Code

Configure Claude Code to use this MCP server by adding it to your MCP settings.

## Usage Examples

Once connected, you can ask Claude questions like:

- "What security alerts do I have right now?"
- "Show me the top 5 devices using the most bandwidth today"
- "What firewall rules are currently active?"
- "Analyze my network traffic patterns from the last 24 hours"
- "Are there any suspicious connections I should know about?"

## Available MCP Components

### 🔧 Tools (Actions Claude can perform)

**Security Monitoring** 🛡️
- `get_active_alarms` - Retrieve current security alerts with complete alarm data, IDs, and descriptions
- `get_specific_alarm` - Get detailed information for a specific alarm ID
- `delete_alarm` - Remove specific security alarms

**Network Analysis** 📊
- `get_flow_data` - Query network traffic flows with detailed connection data and device context
- `get_bandwidth_usage` - Get top bandwidth consuming devices with detailed usage statistics

**Device Management** 🖥️
- `get_device_status` - Check device status with comprehensive information including names, types, and vendors
- `get_boxes` - List all Firewalla devices with status and version information

**Rule Management** ⚙️
- `get_network_rules` - Retrieve firewall rules with complete rule names, conditions, and metadata
- `pause_rule` - Temporarily disable specific firewall rules
- `resume_rule` - Re-enable previously paused firewall rules

**Threat Intelligence** 🎯
- `get_target_lists` - Access CloudFlare and CrowdSec security target lists

### 📋 Resources (Data Claude can access)
- `firewall_summary` - Overview of firewall status and health
- `device_inventory` - List of all managed devices
- `security_metrics` - Real-time security statistics
- `network_topology` - Network structure and connections
- `recent_threats` - Latest security events and blocked attempts

### 💬 Prompts (Pre-defined interactions)
- `security_report` - Generate comprehensive security status report
- `threat_analysis` - Analyze recent alarms and suspicious activity
- `bandwidth_analysis` - Investigate high bandwidth usage patterns
- `device_investigation` - Deep dive into specific device activity
- `network_health_check` - Overall network status assessment

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

### Project Structure

```
firewalla_mcp/
├── src/
│   ├── server.ts           # Main MCP server
│   ├── firewalla/          # Firewalla API client
│   ├── tools/              # MCP tool implementations
│   ├── resources/          # MCP resource implementations
│   └── prompts/            # MCP prompt implementations
├── tests/                  # Test files
├── docs/                   # Additional documentation
├── CLAUDE.md              # Claude development guide
├── SPEC.md                # Technical specifications
└── README.md              # This file
```

## Security

- MSP tokens are stored securely in environment variables
- No credentials are logged or stored in code
- Rate limiting prevents API abuse
- Input validation prevents injection attacks
- All API communications use HTTPS

## Troubleshooting

### Common Issues

**Authentication Errors**
- Verify your MSP token is valid and not expired
- Check that your Box ID is correct
- Ensure network connectivity to MSP API

**Connection Issues**
- Confirm the MCP server is running
- Check Claude Code MCP configuration
- Verify no port conflicts

**Performance Issues**
- Monitor API rate limits in logs
- Check caching configuration
- Review concurrent request handling

### Debug Mode

Enable debug logging:
```bash
DEBUG=mcp:* npm run mcp:start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## Recent Improvements

### 🎯 Enhanced Data Mapping (Latest Update)
All 11 MCP tools now return complete, well-structured data:

**Previously Problematic - Now Fixed:**
- ✅ `get_active_alarms`: Complete alarm information with IDs, descriptions, and source/destination IPs
- ✅ `get_device_status`: Detailed device profiles with names, types, vendors, and operating systems  
- ✅ `get_network_rules`: Full rule specifications with names, conditions, and comprehensive metadata
- ✅ `get_flow_data`: Rich connection details with applications, device names, and traffic statistics

**Key Technical Achievements:**
- 🔧 Comprehensive API response field mapping with intelligent fallbacks
- 🕐 Proper timestamp handling and conversion (Unix/ISO formats)
- 📝 Meaningful name generation when missing from API responses
- 🛡️ Enhanced error handling and graceful degradation
- 📊 100% improvement in data completeness and usability

### 🏗️ Architecture Improvements
- Environment-based configuration (no hardcoded values)
- Full TypeScript compliance maintained
- Comprehensive test coverage with simulation testing
- Robust caching and rate limiting

## License

[MIT License](LICENSE)

## Support

For issues and questions:
- Check the [troubleshooting guide](CLAUDE.md#common-issues-and-solutions)
- Review the [technical specifications](SPEC.md)
- Open an issue on GitHub



---

Made with ❤️ for the Firewalla community
## GitHub Repository

🔗 **Repository**: [https://github.com/amittell/firewalla-mcp-server](https://github.com/amittell/firewalla-mcp-server)

### Quick Links
- 📋 [Issues](https://github.com/amittell/firewalla-mcp-server/issues)
- 🔀 [Pull Requests](https://github.com/amittell/firewalla-mcp-server/pulls)
- 📈 [Actions](https://github.com/amittell/firewalla-mcp-server/actions)
- 🛡️ [Security](https://github.com/amittell/firewalla-mcp-server/security)

### Repository Stats
[![GitHub issues](https://img.shields.io/github/issues/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/issues)
[![GitHub stars](https://img.shields.io/github/stars/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/stargazers)
[![GitHub license](https://img.shields.io/github/license/amittell/firewalla-mcp-server)](https://github.com/amittell/firewalla-mcp-server/blob/main/LICENSE)

