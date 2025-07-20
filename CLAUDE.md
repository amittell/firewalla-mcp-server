# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Before Any API Development

**READ FIRST**: `/docs/firewalla-api-reference.md` - Complete Firewalla API specification

**Key Rules**:
- ONLY use endpoints documented in `/docs/firewalla-api-reference.md`
- NEVER assume endpoints exist without verification
- ALWAYS use box-specific routing: `/v2/boxes/{box_gid}/{resource}`
- NEVER use fictional endpoints like `/stats/simple` or `/trends/flows`
- ALWAYS implement client-side aggregation for bandwidth/trends

## Project Overview

A Model Context Protocol (MCP) server that provides Claude with access to Firewalla firewall data. Features a **28-tool architecture** with advanced search capabilities.

## Architecture Overview

### 28-Tool Architecture
- **23 Direct API Tools**: Mapping to Firewalla MSP API endpoints
- **5 Convenience Wrapper Tools**: Client-side enhanced functionality for common operations
- **CRUD Operations**: Create, Read, Update, Delete operations for all resources

### Tool Categories (28 total)
- **Security (2 tools)**: get_active_alarms, get_specific_alarm
- **Network (1 tool)**: get_flow_data
- **Device (1 tool)**: get_device_status
- **Rules (8 tools)**: get_network_rules, pause_rule, resume_rule, get_target_lists, get_specific_target_list, create_target_list, update_target_list, delete_target_list
- **Search (3 tools)**: search_flows, search_alarms, search_rules
- **Analytics (8 tools)**: get_boxes, get_simple_statistics, get_statistics_by_region, get_statistics_by_box, get_flow_insights, get_flow_trends, get_alarm_trends, get_rule_trends
- **Convenience Wrappers (5 tools)**: get_bandwidth_usage, get_offline_devices, search_devices, search_target_lists, get_network_rules_summary

## Development Commands

### Setup and Installation
```bash
npm install
npm run build
```

### Development
```bash
npm run dev              # Build and start development server
npm run build            # Build TypeScript to JavaScript  
npm run build:clean      # Clean build directory and rebuild
npm run start            # Start built server
npm run mcp:start        # Build and start MCP server
npm run mcp:test         # Test MCP server connection
npm run mcp:debug        # Debug MCP server with logging
```

### Testing
```bash
npm run test             # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:ci          # Run tests with coverage for CI
npm run test:quick       # Run fast unit tests only
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:regression  # Run regression tests
```

### Code Quality
```bash
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues automatically
npm run lint:check       # Check linting with zero warnings
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
npm run typecheck        # Type checking without emitting files
npm run clean            # Clean all generated files
```

### CI/CD Commands
```bash
npm run ci:quick         # Fast CI pipeline
npm run ci:full          # Complete CI pipeline
npm run setup:hooks      # Install git hooks
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

## Feature Flag System

The server uses a feature flag system for deployment control and safety:

### Environment Variables
```env
# Core safety flags
MCP_WAVE0_ENABLED=true                    # Master enable/disable (default: true)
MCP_READ_ONLY_MODE=false                  # Read-only mode (default: false)

# Individual tool control
MCP_DISABLED_TOOLS=""                     # Comma-separated list of tools to disable

# Performance flags
MCP_CACHE_ENABLED=true                    # Enable caching (default: true)
MCP_DEBUG_MODE=false                      # Debug logging (default: false)
```

### Tool Configuration
- **WAVE0_ENABLED=false**: All 28 tools disabled (safe mode)
- **WAVE0_ENABLED=true**: All 28 tools available
- **MCP_DISABLED_TOOLS**: Selectively disable specific tools by name

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
2. Connect Claude Desktop to server
3. Test queries:
   - "What security alerts do I have?"
   - "Show me top bandwidth users"
   - "What firewall rules are active?"
   - "Has anyone accessed porn sites today?"
   - "Show me social media usage analysis"

## Search API

### Core Search Tools (5 tools)
- **search_flows**: Network flow searching with complex filters
- **search_alarms**: Security alarm searching with type/time/IP filters
- **search_rules**: Firewall rule searching with target/action/status filters
- **search_devices**: Device searching with network/status/usage filters
- **search_target_lists**: Target list searching with category/ownership filters

### Search Query Syntax
The server supports search queries using Firewalla API syntax:

```text
# Basic field queries
type:8                        # Video Activity
source_ip:192.168.1.1
protocol:tcp

# Logical operators
type:1 AND source_ip:192.168.*     # Security alerts from local network
action:block OR action:timelimit

# Wildcards and patterns
ip:192.168.*
device_name:*laptop*
target_value:*.facebook.com

# Geographic filtering (flows and alarms)
region:US                     # United States
region:CN                     # China
region:US AND protocol:tcp    # US TCP traffic

# Ranges and comparisons
bytes:[1000 TO 50000]
type:>=8                      # Video activity and above
timestamp:>=2024-01-01

# Complex queries
(type:8 OR type:9 OR type:10) AND source_ip:192.168.* NOT resolved:true
```

### Example Search Queries

```bash
# Find security activity alarms from specific IP range
search_alarms query:"type:1 AND source_ip:192.168.*" limit:50

# Find blocked flows over 1MB with geographic filtering
search_flows query:"blocked:true AND bytes:>=1000000 AND region:CN" limit:100

# Find all rules targeting social media
search_rules query:"target_value:*facebook* OR target_value:*twitter*" limit:25

# Find offline devices by vendor
search_devices query:"online:false AND mac_vendor:Apple" limit:30

# Geographic security analysis examples
search_flows query:"region:US AND protocol:tcp AND category:social" limit:50
search_alarms query:"region:CN AND type:1 AND status:1" limit:25
```

## Flow Insights Tool

The `get_flow_insights` tool addresses the challenge of analyzing high-volume networks (100k+ flows/day) by using category-based aggregation instead of time-based pagination.

### Why get_flow_insights?
- **Scalability**: Handles 338k+ flows/day efficiently with 2-3 API calls instead of 1,690+ pagination requests
- **Real Questions**: Answers "did anyone watch porn?" or "what social media was used?" directly
- **Performance**: Uses groupBy aggregation at the API level instead of client-side processing
- **Actionable Data**: Returns category breakdowns, top domains, and device-specific usage

### Implementation Details
- Uses Firewalla's category classification: porn, social, video, games, shopping, etc.
- Aggregates data using API-level groupBy instead of fetching all flows
- Returns both allowed and blocked traffic analysis
- Provides device-level breakdowns for parental control use cases

### Recent Flow Activity Tool
- `get_recent_flow_activity` provides current network state snapshots (last 10-20 minutes)  
- Returns up to 2000 flows across 4 API pages for immediate analysis
- Use for current security assessment and real-time activity monitoring

## API Reference Documentation

**COMPREHENSIVE API REFERENCE**: `/docs/firewalla-api-reference.md`

This file contains the complete, official Firewalla MSP API v2 documentation including:
- All verified endpoint URLs and parameters
- Complete data model definitions (TypeScript interfaces)
- Search query syntax and examples
- Response format specifications
- Rate limiting and authentication details
- Practical code examples (Node.js/Axios and cURL)
- Error handling patterns

**ALWAYS reference this file before:**
- Adding new API endpoints
- Modifying existing API calls
- Implementing new tools or features
- Debugging API integration issues

## Architecture Notes

### Clean 28-Tool Design
- **Direct Implementation**: All 28 tools defined directly in TOOL_SCHEMAS
- **API Mapping**: Mapping to all Firewalla MSP API endpoints
- **Type Safety**: Full TypeScript implementation with strict validation
- **Registry Pattern**: Clean tool registration with handler-based architecture

### Key Files
- `src/server.ts`: Main MCP server with 28-tool TOOL_SCHEMAS architecture
- `src/tools/registry.ts`: Tool registry with 28 handler definitions
- `src/firewalla/client.ts`: Firewalla API client with caching
- `src/validation/`: Parameter validation and error handling

### Data Flow
1. Claude sends MCP request
2. Server validates tool availability via feature flags
3. Server finds tool in TOOL_SCHEMAS
4. Direct API execution with Firewalla client
5. Response returned with enhanced error handling

## Common Issues and Solutions

### Authentication Errors
- Verify MSP token is valid and not expired
- Check Box ID is correct
- Ensure network connectivity to MSP API
- Reference authentication section in `/docs/firewalla-api-reference.md`

### API Endpoint Issues
- **FIRST**: Check `/docs/firewalla-api-reference.md` for correct endpoint URLs
- Verify endpoint exists in official documentation
- Check parameter names and types
- Validate request format against documented examples

### MCP Connection Issues
- Confirm server is running on correct stdio transport
- Check Claude Code MCP configuration
- Verify no port conflicts

### Feature Flag Issues
- Check environment variables are set correctly
- Verify tool is enabled via feature flags
- Review disabled tools list
- Check server logs for flag validation warnings

## Debugging

### Debug Commands
```bash
# Enable comprehensive debugging
DEBUG=firewalla:* npm run mcp:start

# Enable specific debugging namespaces
DEBUG=cache,performance,api npm run mcp:start
DEBUG=validation,error-handler npm run mcp:start

# Debug with performance monitoring
DEBUG=firewalla:* npm run dev
```

### Debug Categories
- **cache**: Cache operations and performance
- **performance**: Performance metrics and timing
- **api**: API request/response cycles
- **validation**: Input validation and errors
- **error-handler**: Error processing and recovery
- **firewalla**: All Firewalla-related debugging

## Critical Development Guidelines

### Before Making Any API Changes:
1. **READ** `/docs/firewalla-api-reference.md` first
2. **VERIFY** the endpoint exists in official documentation
3. **CHECK** parameter names and types against documented examples
4. **TEST** with the provided code examples
5. **NEVER** assume an endpoint exists without verification

### When Adding New Tools:
1. Reference the data models section for correct TypeScript interfaces
2. Use the documented parameter formats and response structures
3. Follow the authentication and error handling patterns
4. Implement proper rate limiting as documented
5. Add to TOOL_SCHEMAS in `src/server.ts`
6. Add to appropriate category in `src/core/feature-flags.ts`

### Tool Architecture Requirements
- All tools must be defined in TOOL_SCHEMAS with proper schema
- Add to appropriate tool category in feature flags
- Include proper input validation and error handling
- Follow the 28-tool architecture constraints
- Implement direct API execution in the server

## Performance Considerations

### Caching System
- API Responses: 300s TTL (configurable via CACHE_TTL environment variable)
- Geographic Data: 1h TTL with LRU eviction
- Cache key collision prevention with enhanced hashing
- Automatic cleanup of expired entries

### Rate Limiting
- Built-in protection against Firewalla API limits
- Intelligent request throttling
- Retry logic with exponential backoff

### Monitoring
```bash
# Enable performance monitoring
DEBUG=performance,metrics npm run dev

# Track cache performance  
DEBUG=cache npm run mcp:start
```

## Version Information

- **Current Version**: 1.0.0
- **Architecture**: 28-tool design (23 direct API + 5 convenience)
- **API Support**: Firewalla MSP API v2 with CRUD operations
- **Node.js**: Requires 18+
- **TypeScript**: ES2020 target with strict mode

**Remember**: The `/docs/firewalla-api-reference.md` file contains the complete, verified API specification. It is the single source of truth for all Firewalla API integration.