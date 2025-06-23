# Claude Development Guide - Firewalla MCP Server

This file contains essential commands and procedures for Claude to effectively work on this project.

## Project Overview
A Model Context Protocol (MCP) server that provides Claude with access to Firewalla firewall data including security alerts, network flows, device status, and firewall rules. Features advanced search capabilities with complex query syntax, intelligent caching, and result aggregation.

## Development Commands

### Setup and Installation
```bash
npm install
npm run build
```

### Development
```bash
npm run dev          # Build and start development server
npm run build        # Build TypeScript to JavaScript
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues automatically
```

### MCP Server Testing
```bash
# Start the MCP server for Claude Code
npm run mcp:start

# Test MCP server connection
npm run mcp:test

# Debug MCP server
npm run mcp:debug
```

## API Credentials Setup

### Firewalla MSP API Configuration
1. Create `.env` file in project root
2. Add the following environment variables:
```env
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net
FIREWALLA_BOX_ID=your_box_gid_here
```

### Getting MSP Credentials
1. Log into your Firewalla MSP portal at `https://yourdomain.firewalla.net`
2. Navigate to Account Settings > API Settings
3. Generate a personal access token
4. Note your MSP domain (e.g., `yourdomain.firewalla.net`)
5. Find your Box GID (Global ID) in the box details - this is the long identifier that looks like `1eb71e38-3a95-4371-8903-ace24c83ab49`

### API Endpoint Structure
The fixed implementation now uses the correct Firewalla MSP API v2 endpoints:
- Base URL: `https://{msp_domain}/v2/`
- Box-specific endpoints: `/v2/boxes/{box_gid}/{resource}`
- Examples:
  - Devices: `/v2/boxes/{box_gid}/devices`
  - Alarms: `/v2/boxes/{box_gid}/alarms`
  - Flows: `/v2/boxes/{box_gid}/flows`

## Testing Procedures

### Unit Tests
- Test individual MCP tools and resources
- Mock Firewalla API responses
- Validate input/output schemas

### Integration Tests
- Test actual Firewalla API connections
- Verify MCP protocol compliance
- End-to-end workflow testing

### Manual Testing with Claude
1. Start MCP server: `npm run mcp:start`
2. Connect Claude Code to server
3. Test queries:
   - "What security alerts do I have?"
   - "Show me top bandwidth users"
   - "What firewall rules are active?"

## Advanced Search API (Phase 3)

### Search Query Syntax
The server supports advanced search queries with complex syntax:

```
# Basic field queries
severity:high
source_ip:192.168.1.1
protocol:tcp

# Logical operators
severity:high AND source_ip:192.168.*
action:block OR action:timelimit

# Wildcards and patterns
ip:192.168.*
device_name:*laptop*
target_value:*.facebook.com

# Ranges and comparisons
bytes:[1000 TO 50000]
severity:>=medium
timestamp:>=2024-01-01

# Complex queries
(severity:high OR severity:critical) AND source_ip:192.168.* NOT resolved:true
```

### Available Search Tools

#### Core Search Tools
- **search_flows**: Advanced flow searching with complex filters
- **search_alarms**: Alarm searching with severity, time, IP filters  
- **search_rules**: Rule searching with target, action, status filters
- **search_devices**: Device searching with network, status, usage filters
- **search_target_lists**: Target list searching with category, ownership filters
- **search_cross_reference**: Multi-entity searches with correlation

#### Example Search Queries

```bash
# Find high-severity alarms from specific IP range
search_alarms query:"severity:>=high AND source_ip:192.168.*"

# Find blocked flows over 1MB
search_flows query:"blocked:true AND bytes:>=1000000"

# Find all rules targeting social media
search_rules query:"target_value:*facebook* OR target_value:*twitter*"

# Find offline devices by vendor
search_devices query:"online:false AND mac_vendor:Apple"

# Cross-reference suspicious flows with related alarms
search_cross_reference primary_query:"source_ip:suspicious_ip" secondary_queries:"severity:high" correlation_field:"source_ip"
```

### Search Features

#### Query Optimization
- Automatic query optimization for performance
- Predicate pushdown and boolean logic optimization
- Field-specific optimizations (wildcards to exact matches)
- Cost-based query reordering

#### Intelligent Caching
- Query-aware caching with automatic invalidation
- Context-specific TTL (alarms: 30s, flows: 2m, rules: 10m)
- LRU eviction with complexity scoring
- Cache statistics and performance metrics

#### Result Aggregation
- Group by any field: `group_by:"protocol"`
- Statistical analysis: sum, avg, min, max, percentiles
- Time-based bucketing: hour, day, week, month
- Trend analysis and correlation detection

### Testing Advanced Search

```bash
# Test search API validation
npm run test:search

# Manual search testing
npm run mcp:start
# Use Claude Code to test:
# "search for high severity alarms from the last hour"
# "find blocked flows larger than 10MB grouped by source IP"
# "show me all rules that block social media sites"
```

## Common Issues and Solutions

### Authentication Errors
- Verify MSP token is valid and not expired
- Check Box ID is correct
- Ensure network connectivity to MSP API

### MCP Connection Issues
- Confirm server is running on correct stdio transport
- Check Claude Code MCP configuration
- Verify no port conflicts

### Performance Issues
- Monitor API rate limits
- Check caching configuration
- Review concurrent request handling

## Architecture Notes
- Uses stdio transport for local Claude Code connection
- Implements caching for frequently accessed data
- Rate limiting to respect Firewalla API limits
- Secure credential handling with environment variables

## Debugging
- Use `DEBUG=mcp:*` environment variable for detailed logs
- Check server logs in `logs/` directory
- Monitor API request/response cycles