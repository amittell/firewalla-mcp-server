# Firewalla MCP Server

A Model Context Protocol (MCP) server that enables Claude to access and analyze your Firewalla firewall data in real-time.

## Features

- **Real-time Firewall Data**: Query security alerts, network flows, and device status  
- **Security Analysis**: Get insights on threats, blocked attacks, and network anomalies  
- **Bandwidth Monitoring**: Track top bandwidth consumers and usage patterns  
- **Rule Management**: View and temporarily pause firewall rules  
- **Target Lists**: Access CloudFlare and CrowdSec security intelligence
- **Advanced Search**: Complex query syntax with filters, logical operators, and correlations  

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

**Option A: Install from npm (Recommended)**
```bash
# Install globally
npm install -g firewalla-mcp-server

# Or install locally in your project
npm install firewalla-mcp-server
```

**Option B: Install from source**
```bash
git clone https://github.com/amittell/firewalla-mcp-server.git
cd firewalla-mcp-server
npm install
npm run build
```

### 2. Configuration

Create a `.env` file with your Firewalla credentials:

```env
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net
FIREWALLA_BOX_ID=your_box_gid_here
```

**Getting Your Credentials:**
1. Log into your Firewalla MSP portal at `https://yourdomain.firewalla.net`
2. Your MSP ID is the full domain (e.g., `company123.firewalla.net`)
3. Generate an access token in API settings
4. Find your Box GID (Group ID) in device settings - this is your unique device identifier

### 3. Build and Start

```bash
npm run build
npm run mcp:start
```

### 4. Connect Claude Desktop

Add this configuration to your Claude Desktop `claude_desktop_config.json`:

**If installed via npm:**
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

**If installed from source:**
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

**If using Docker:**
```json
{
  "mcpServers": {
    "firewalla": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "FIREWALLA_MSP_TOKEN=your_msp_access_token_here",
        "-e", "FIREWALLA_MSP_ID=yourdomain.firewalla.net", 
        "-e", "FIREWALLA_BOX_ID=your_box_gid_here",
        "firewalla-mcp-server"
      ]
    }
  }
}
```

> **Note**: The args array above is passed verbatim to Docker. When copying to shell scripts, quoting may differ.

**Config file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## Docker Usage

### Building the Docker Image

To use the Docker configuration option above, first build the image:

```bash
# Build the Docker image
docker build -t firewalla-mcp-server .

# Optional: Tag with semantic version
docker build -t firewalla-mcp-server:1.0.0 .

# Push to registry (if deploying to remote)
docker tag firewalla-mcp-server your-registry/firewalla-mcp-server:latest
docker push your-registry/firewalla-mcp-server:latest
```

### Advanced Docker Deployment

For production server deployments, you can use the included deployment script:

```bash
# Deploy with automated testing and security scanning
./scripts/deploy.sh
```

The deployment script provides:
- Automated testing and linting
- Security scanning with Trivy
- Docker Compose configuration
- Health checks and monitoring

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
Open Claude Code and try these starter queries:

**Basic Health Check:**
```
"Can you check my Firewalla status and show me a summary?"
```
*This uses: `firewall_summary` resource + `get_simple_statistics` tool*

**Security Overview:**
```
"What security alerts do I have? Show me the 5 most recent ones."
```
*This uses: `get_active_alarms` tool with limit parameter*

### Practical Workflows

**Daily Security Review:**
```
"Give me today's security report. Include:
1. Any new security alerts
2. Top 3 devices using bandwidth
3. Any devices that went offline
4. Status of critical firewall rules"
```

**Investigating Suspicious Activity:**
```
"I noticed unusual traffic. Can you:
1. Show me all high-severity alarms from the last 4 hours
2. Find any blocked connections to external IPs
3. Check which devices had the most network activity"
```

**Network Troubleshooting:**
```
"A device seems to have connectivity issues. Can you:
1. Check if device 192.168.1.100 is online
2. Show its recent network flows
3. See if any rules are blocking its traffic"
```

**Bandwidth Investigation:**
```
"Our internet is slow. Help me find the cause:
1. Show top 10 bandwidth users in the last hour
2. Look for any devices with unusual upload/download patterns
3. Check for any streaming or video traffic"
```

### Advanced Search Examples

**Find Specific Threats:**
```
search for: high severity alarms from IP range 10.0.0.* in the last 24 hours
```
*Uses: `search_alarms` with query: "severity:high AND source_ip:10.0.0.* AND timestamp:>24h"*

**Analyze Rule Effectiveness:**
```
"Show me firewall rules that blocked the most connections this week"
```
*Uses: `get_most_active_rules` + `search_flows` for blocked traffic*

**Device Behavior Analysis:**
```
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

## Available MCP Components

### Tools (Actions Claude can perform)

#### Security Monitoring
- `get_active_alarms` - Retrieve current security alerts with complete alarm data, IDs, and descriptions
- `get_specific_alarm` - Get detailed information for a specific alarm ID
- `delete_alarm` - Remove specific security alarms

#### Network Analysis
- `get_flow_data` - Query network traffic flows with detailed connection data and device context
- `get_bandwidth_usage` - Get top bandwidth consuming devices with detailed usage statistics
- `get_offline_devices` - List offline devices with last seen timestamps

#### Device Management
- `get_device_status` - Check device status with comprehensive information including names, types, and vendors
- `get_boxes` - List all Firewalla devices with status and version information

#### Rule Management
- `get_network_rules` - Retrieve firewall rules with complete rule names, conditions, and metadata
- `get_network_rules_summary` - Overview statistics and counts by category
- `get_most_active_rules` - Rules with highest hit counts for traffic analysis
- `get_recent_rules` - Recently created or modified firewall rules
- `pause_rule` - Temporarily disable specific firewall rules
- `resume_rule` - Re-enable previously paused firewall rules

#### Threat Intelligence
- `get_target_lists` - Access CloudFlare and CrowdSec security target lists

#### Statistics and Trends
- `get_simple_statistics` - Basic statistics about boxes, alarms, and rules with health scores
- `get_statistics_by_region` - Flow statistics grouped by country/region
- `get_statistics_by_box` - Per-device statistics with activity scores
- `get_flow_trends` - Historical flow data trends over time
- `get_alarm_trends` - Historical alarm frequency and patterns
- `get_rule_trends` - Rule activity trends and stability metrics

#### Advanced Search
- `search_flows` - Advanced flow searching with complex query syntax
- `search_alarms` - Alarm searching with severity, time, and IP filters
- `search_rules` - Rule searching with target, action, and status filters
- `search_devices` - Device searching with network, status, and usage filters
- `search_target_lists` - Target list searching with category and ownership filters
- `search_cross_reference` - Multi-entity searches with correlation across data types

### Resources (Data Claude can access)
- `firewall_summary` - Overview of firewall status and health
- `device_inventory` - List of all managed devices
- `security_metrics` - Real-time security statistics
- `network_topology` - Network structure and connections
- `recent_threats` - Latest security events and blocked attempts

### Prompts (Pre-defined interactions)
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

### MCP Execution Methods

**Why `npx` for MCP servers?**
- **Version Management**: Always uses the correct/latest version
- **Dependency Resolution**: Handles package dependencies automatically  
- **No global installation required**: Works without global installation
- **MCP Standard**: Follows Model Context Protocol conventions
- **Cross-Platform**: Works consistently across different environments

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

```
firewalla-mcp-server/
├── src/
│   ├── server.ts           # Main MCP server
│   ├── firewalla/          # Firewalla API client
│   ├── tools/              # MCP tool implementations
│   ├── resources/          # MCP resource implementations
│   └── prompts/            # MCP prompt implementations
├── tests/                  # Test files
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

### Enhanced Data Mapping (v1.0.0)
All MCP tools now return complete, well-structured data:

**Core Tool Improvements:**
- `get_active_alarms`: Complete alarm information with IDs, descriptions, and source/destination IPs
- `get_device_status`: Detailed device profiles with names, types, vendors, and operating systems  
- `get_network_rules`: Full rule specifications with names, conditions, and comprehensive metadata
- `get_flow_data`: Rich connection details with applications, device names, and traffic statistics

### Advanced Analytics (v1.0.0)
**New Statistics and Trends Tools:**
- Health scoring system for network assessment
- Regional flow analysis with country-level breakdowns
- Per-device activity scores and monitoring
- Historical trend analysis for flows, alarms, and rules
- Comprehensive offline device tracking

### Advanced Search Engine (v1.0.0)
**Powerful Query Capabilities:**
- Complex search syntax with logical operators (AND, OR, NOT)
- Field-specific filters with wildcards and ranges
- Cross-reference searches for data correlation
- Time-based filtering with flexible date ranges
- Post-processing filters for comprehensive results
- Aggregation and statistical analysis

**Search Examples:**
```text
severity:high AND source_ip:192.168.*
timestamp:>2024-01-01 AND bytes:>=1000000
target_value:*.facebook.com OR mac_vendor:Apple*
```

### Architecture Improvements
- Environment-based configuration (no hardcoded values)
- Full TypeScript compliance maintained
- Comprehensive test coverage with simulation testing
- Robust caching and rate limiting
- Modular filter system with extensible architecture

## v1.0.0 Implementation Features

### Mandatory Limit Parameters

**REQUIRED**: All paginated tools now require explicit `limit` parameter. This prevents artificial defaults that masked missing parameters.

**Affected Tools:**
- `get_active_alarms`
- `get_flow_data`  
- `get_device_status`
- `get_bandwidth_usage` (parameter renamed from `top` to `limit`)
- `get_network_rules`
- `get_most_active_rules`
- `get_recent_rules`
- All search tools (`search_flows`, `search_alarms`, etc.)

**Migration:**
```typescript
// Before (would default to 50-200 results)
await get_device_status({});

// After (explicit limit required)  
await get_device_status({ limit: 100 });
```

**Error Response:**
Tools will now return clear error: `"limit parameter is required"` when limit is missing.

## New Features (v1.0.0)

### Enterprise-Grade Validation Framework

**Standardized Error Handling:**
- Consistent error format: `{error: true, message: string, tool: string}`
- Enhanced parameter validation with type checking
- Comprehensive null safety throughout codebase
- Input sanitization preventing injection attacks

### Performance Monitoring & Optimization

**DEBUG Environment Variable:**
```bash
# Enable comprehensive debugging
DEBUG=firewalla:* npm run mcp:start

# Enable specific debugging
DEBUG=cache,performance,api npm run mcp:start
```

**Multi-Tier Caching System:**
- Real-time data (alarms/flows): 30s TTL
- Medium-frequency data (devices): 2m TTL  
- Stable data (rules): 10m TTL
- Static data (statistics): 1h TTL

**Performance Metrics:**
- Response time tracking with P95/P99 percentiles
- Error rate monitoring by operation type
- Memory usage optimization with LRU eviction
- Query performance analysis and optimization

### Enhanced Security & Reliability

**Critical Bug Fixes:**
- Fixed null pointer exceptions in rule management
- Corrected success status reporting for pause/resume operations  
- Enhanced alarm detection with better field mapping
- Improved bandwidth usage error handling

**Security Enhancements:**
- Query sanitization preventing injection attacks
- Enhanced input validation for all parameters
- Defensive programming patterns throughout
- Cross-reference field mapping improvements

### Developer Experience Improvements

**Comprehensive Logging:**
- Pipeline stage debugging for data flow analysis
- Performance bottleneck identification
- API request/response logging with timing
- Error tracking with detailed context

**Validation Utilities:**
- `ParameterValidator` for consistent validation patterns
- `SafeAccess` utilities preventing null pointer exceptions
- `FieldMapper` for cross-reference compatibility
- `ErrorHandler` for standardized error responses

## Publishing to npm

This package is configured for npm publishing. To publish your own version:

### 1. Prepare for Publishing

```bash
# Make sure you're logged into npm
npm login

# Test the package build
npm run build
npm test

# Check what will be included in the package
npm pack --dry-run
```

### 2. Publish to npm

```bash
# For first release
npm publish

# For updates, bump version first
npm run version:patch  # 1.0.0 -> 1.0.1
npm run version:minor  # 1.0.0 -> 1.1.0  
npm run version:major  # 1.0.0 -> 2.0.0

# Then publish
npm publish
```

### 3. Post-Publishing

Once published, users can install with:

```bash
# Install locally (recommended for MCP servers)
npm install firewalla-mcp-server

# Or install globally
npm install -g firewalla-mcp-server
```

### Package Features

- **MCP Convention Compliant** - Uses `npx` for execution as per MCP standards  
- **Optimized Bundle** - Only includes dist/, README, LICENSE via .npmignore  
- **Automated Build** - Pre-publish hooks ensure clean builds  
- **Security Scanning** - Trivy scan integrated into CI pipeline  
- **Semantic Versioning** - Built-in version management scripts  
- **TypeScript Support** - Full type safety with compiled output  
- **Environment Variables** - Secure credential management  

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

