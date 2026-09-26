# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Before Any API Development

**READ FIRST**: `/docs/firewalla-api-reference.md` - Complete Firewalla API specification

**Key Rules**:
- ONLY use endpoints documented in `/docs/firewalla-api-reference.md`
- NEVER assume endpoints exist without verification
- ALWAYS use box-specific routing: `/v2/boxes/{box_gid}/{resource}`
- NEVER use paths without the `/v2/` prefix (`/stats/simple`, `/trends/flows` do not exist); the documented forms are `/v2/stats/simple` and `/v2/trends/{flows,alarms,rules}`
- `/v2/alarms` and `/v2/flows` refuse `limit` over 500 (HTTP 400); page with `next_cursor`
- Trends come from `/v2/trends/{alarms,flows}` (daily points; `/v2/trends/rules` answers 400, so rule trends count rule creation times on the days of `/v2/trends/alarms`); bandwidth is aggregated on the client from flows

## Project Overview

A Model Context Protocol (MCP) server that provides Claude with access to Firewalla firewall data: **24 read-only tools** by default, plus **11 opt-in write tools**, with advanced search capabilities. By default no tool changes anything.

## Architecture Overview

### 24 Read-Only Tools, 11 Opt-In Write Tools
- **19 Direct API Tools**: Mapping to Firewalla MSP API endpoints (read-only)
- **5 Convenience Wrapper Tools**: Client-side enhanced functionality for common operations (read-only)
- **11 Write Tools**: Create, update, pause and delete operations, registered only with `FIREWALLA_ENABLE_WRITE_TOOLS=true`

### Tool Categories (24 read-only)
The groups are each handler's `category`, which `ToolRegistry.getToolsByCategory()` filters on.
- **Security (2 tools)**: get_active_alarms, get_specific_alarm
- **Network (3 tools)**: get_flow_data, get_bandwidth_usage, get_offline_devices
- **Device (1 tool)**: get_device_status
- **Rules (4 tools)**: get_network_rules, get_network_rules_summary, get_target_lists, get_specific_target_list
- **Search (5 tools)**: search_flows, search_alarms, search_rules, search_devices, search_target_lists
- **Analytics (9 tools)**: get_boxes, get_simple_statistics, get_statistics_by_region, get_statistics_by_box, get_recent_flow_activity, get_flow_insights, get_flow_trends, get_alarm_trends, get_rule_trends
- **Convenience wrappers** (client-side processing; counted in the groups above): get_bandwidth_usage, get_offline_devices, search_devices, search_target_lists, get_network_rules_summary
- **Write tools (11, opt-in with `FIREWALLA_ENABLE_WRITE_TOOLS=true`)**: create_rule, delete_rule, pause_rule, resume_rule, create_target_list, update_target_list and delete_target_list (rules), rename_device (device), archive_alarm, mute_alarm and delete_alarm (security). Not counted in the 24. They need an MSP token with write access: MSP 2.12 adds read-only tokens, and a 403 on a write says the token may be read-only.

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

### Transport Configuration
The server supports two transport modes:

**Stdio Transport (Default)**: Standard input/output for Claude Desktop and MCP clients
```bash
MCP_TRANSPORT=stdio npm run mcp:start
```

**HTTP Transport**: HTTP server for Docker containers and external access
```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 npm run mcp:start
# Server will be accessible at http://localhost:3000/mcp
```
The HTTP server listens on 127.0.0.1 and checks each request's Host, Origin
and bearer token before anything else (`src/http-security.ts`, wired in
`src/http-transport.ts`); see the variables below.

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
# Required
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net

# Optional - can be retrieved via get_boxes tool
# FIREWALLA_BOX_ID=your_box_gid_here

# Optional - default box ID for convenience
# FIREWALLA_DEFAULT_BOX_ID=your_default_box_gid_here
```

### Getting MSP Credentials
1. Log into your Firewalla MSP portal at `https://yourdomain.firewalla.net`
2. Navigate to Account Settings > API Settings
3. Generate a personal access token
4. Note your MSP domain (e.g., `yourdomain.firewalla.net`)

### About Box IDs
- **Box ID is now optional** - you can retrieve available boxes using the `get_boxes` tool
- If no box ID is configured, API calls return data for all boxes you have access to
- You can optionally set `FIREWALLA_BOX_ID` to filter all queries to a specific box by default
- `FIREWALLA_DEFAULT_BOX_ID` is the default box for single-box operations (`get_specific_alarm`, `archive_alarm`, `mute_alarm`, `create_rule`, `rename_device`) without filtering queries
- With neither set, single-box operations use the account's only box; on a multi-box account `get_specific_alarm`, `archive_alarm` and `mute_alarm` check each box (the two alarm write tools refuse when several boxes have the alarm ID), and `create_rule` and `rename_device` refuse until given `gid`
- Box GID format: UUID-like `00000000-0000-0000-0000-000000000000`

## Configuration Variables

Optional environment variables the code reads, besides the credentials and box
IDs above:

```env
FIREWALLA_ENABLE_WRITE_TOOLS=false        # "true" registers the write tools (default: off)
MCP_TRANSPORT=stdio                       # stdio or http (default: stdio)
MCP_HTTP_PORT=3000                        # HTTP transport port (default: 3000)
MCP_HTTP_PATH=/mcp                        # HTTP transport path; other paths get 404 (default: /mcp)
MCP_HTTP_HOST=127.0.0.1                   # HTTP listen address, no port (default: 127.0.0.1; the Docker image sets 0.0.0.0)
MCP_HTTP_BEARER_TOKEN=                    # When set, HTTP requests need Authorization: Bearer <token> (else 401)
MCP_HTTP_ALLOWED_HOSTS=                   # Host header names accepted besides localhost, 127.0.0.1, [::1] and MCP_HTTP_HOST (else 403)
MCP_HTTP_ALLOWED_ORIGINS=                 # Browser origins accepted; a request with any other Origin gets 403 (default: none)
MCP_SESSION_IDLE_TIMEOUT_MS=1800000       # HTTP sessions idle this long are closed (default: 30 min)
API_TIMEOUT=30000                         # API request timeout in ms (default: 30000, 1000-300000)
CACHE_TTL=300                             # Response cache TTL in seconds (default: 300, 0-3600)
DEFAULT_PAGE_SIZE=100                     # Default page size (default: 100)
MAX_PAGE_SIZE=10000                       # Page size ceiling (default: 10000)
LOG_LEVEL=info                            # error, warn, info or debug (default: info)
DEBUG=firewalla:*                         # Debug logging; see Debugging below (default: off)
```

### Tool Configuration
- The 24 read-only tools are always registered. There is no switch to disable one.
- `FIREWALLA_ENABLE_WRITE_TOOLS=true` (any case) also registers and lists the
  11 write tools named in `WRITE_TOOL_NAMES` in `src/config/write-tools.ts`.
  The registry and ListTools both filter on that list. Without the setting, a
  call to a write tool answers "Unknown tool" and sends nothing.
- There is no read-only mode, safe mode or cache switch: `MCP_WAVE0_ENABLED`,
  `MCP_READ_ONLY_MODE`, `MCP_DISABLED_TOOLS`, `MCP_CACHE_ENABLED` and
  `MCP_DEBUG_MODE` are not read by the code. `API_RATE_LIMIT` (1-1000, default
  100) is applied: it is how many API requests the client starts in any rolling
  5 minutes (see Rate Limiting below). Check that `src/` reads a variable
  before documenting it.

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
The MSP API's query grammar has no `AND`, `OR`, `NOT` or parentheses: it searches those as words, and a field that appears twice is OR (measured 2026-09-26; see "Measured Query Behavior" in `docs/firewalla-api-reference.md`). The tools accept them anyway, and the client translates every query sent to `/v2/alarms`, `/v2/flows` and `/v2/rules` (`toMspQuery` in `src/utils/msp-query.ts`):

- `AND`, or a space, means both terms must match; it is sent as a space.
- `OR` works between values of one field and is sent as a comma list (`region:US OR region:CN` becomes `region:US,CN`). An `OR` between different fields (`region:US OR category:social`) has no API form and is refused with a validation error that names one search per field to run instead.
- `NOT`, or a leading `-`, excludes a field value (`-protocol:tcp`). `NOT` over an `AND`, and the exclusion of free text, a wildcard or a range, are refused.
- A refused `OR` or `NOT` comes with one runnable query per disjunct, whose results together are the query's: `region:US OR (category:social AND status:blocked)` suggests `region:US` and `category:social status:blocked`.
- Ranges are `field:low-high` and include both ends; `[low TO high]` is refused with the `field:low-high` form as the suggestion. Relative times (`ts:>1h`, `ts:>=7d`) are sent as Unix seconds.
- Parentheses may group a same-field `OR` (`status:blocked AND (region:US OR region:CN)` becomes `status:blocked region:US,CN`) or follow `NOT` (`NOT (region:US OR region:CN)` becomes `-region:US -region:CN`); a group that needs an `OR` across fields is refused.
- Operators are uppercase; lowercase `and`, `or` and `not` are free-text words, as the API reads them.
- search_devices and search_target_lists filter on the client and evaluate `AND`, `OR`, `NOT` and parentheses themselves, across fields too. search_target_lists reads a comma list as any of its values (`category:social,games`), and search_devices' `ip:` takes an IPv4 CIDR block (`ip:192.168.1.0/24`) as well as `*` wildcards.
- Free text (a word or quoted phrase with no field) works in every search tool. search_flows and search_alarms send it to the API. `/v2/rules` matches no free text (measured 2026-09-26), so search_rules and get_network_rules do not send it and match it case-insensitively in each rule's name, notes, action, target and scope; search_devices matches it in the name, IP, MAC or id, vendor, and network or group name, and search_target_lists in the name, notes and entries.
- On flows and alarms, geographic names that are not API qualifiers (`country:`, `continent:`, `city:`, `asn:`, `is_vpn:` and the like) are refused before a request, with `region:<ISO code>` suggested for country codes.
- search_flows' `geographic_filters` takes `countries` (ISO 3166 codes, sent as `region:US,CN`), the one geographic flow qualifier the API documents. Continents, cities, ASNs, hosting providers, the VPN and cloud exclusions and the risk score have no API equivalent and are refused with a validation error naming them: the API answers a qualifier it does not know with no results.

```text
# Basic field queries
type:8                        # Video Activity (alarms)
device.ip:192.168.1.1         # alarms and flows
protocol:tcp                  # flows

# Combining terms (sent as shown after ->)
type:1 AND device.ip:192.168.*     # -> type:1 device.ip:192.168.*
action:block OR action:timelimit   # -> action:block,timelimit
region:US -protocol:tcp            # the API's own form, sent unchanged
region:US AND NOT protocol:tcp     # -> region:US -protocol:tcp

# Wildcards and patterns
device.ip:192.168.*
name:*laptop*                 # search_devices
domain:*.facebook.com         # flows

# Geographic filtering (flows and alarms)
region:US                     # United States
region:US OR region:CN        # -> region:US,CN
region:US AND protocol:tcp    # US TCP traffic

# Traffic, status and time
status:blocked                # blocked flows (blocked:true is translated to this)
total:>1MB                    # also download:/upload: (bytes: is translated to total:)
ts:>1h                        # the last hour (search_flows)

# Complex queries
(type:8 OR type:9 OR type:10) AND device.ip:192.168.* AND status:1
                              # -> type:8,9,10 device.ip:192.168.* status:1
```

### Example Search Queries

```bash
# Find security activity alarms from specific IP range
search_alarms query:"type:1 AND device.ip:192.168.*" limit:50

# Find blocked flows over 1MB with geographic filtering
search_flows query:"status:blocked AND total:>1MB AND region:CN" limit:100

# Find blocked flows from either of two countries (sent as region:US,CN)
search_flows query:"status:blocked AND (region:US OR region:CN)" limit:100

# Find block and allow rules
search_rules query:"action:block OR action:allow" limit:25
# sent as action:block,allow; measured 2026-09-26: 98 rules, the 91 block
# rules and the 7 allow rules

# Find block rules that are not paused (sent as action:block -status:paused)
search_rules query:"action:block AND NOT status:paused" limit:25

# Find offline devices by vendor
search_devices query:"online:false AND mac_vendor:Apple" limit:30

# Geographic security analysis examples
search_flows query:"region:US AND protocol:tcp AND category:social" limit:50
search_alarms query:"region:CN AND type:1 AND status:1" limit:25

# Refused: an OR between different fields; run one search per field instead
# search_flows query:"region:US OR category:social"
search_flows query:"region:US" limit:50
search_flows query:"category:social" limit:50
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

### Tool Design
- **Direct Implementation**: All 35 tools (24 read-only, 11 write) defined directly in TOOL_SCHEMAS
- **API Mapping**: Mapping to all Firewalla MSP API endpoints
- **Type Safety**: Full TypeScript implementation with strict validation
- **Registry Pattern**: Clean tool registration with handler-based architecture

### Key Files
- `src/server.ts`: Main MCP server with the TOOL_SCHEMAS list (35 tools; the 11 write tools listed only when enabled)
- `src/tools/registry.ts`: Tool registry with 35 handler definitions (24 registered by default)
- `src/config/write-tools.ts`: `WRITE_TOOL_NAMES`, the tools gated by `FIREWALLA_ENABLE_WRITE_TOOLS`
- `src/validation/path-segment.ts`: the check every ID goes through before it is put into a request path
- `src/firewalla/client.ts`: Firewalla API client with caching
- `src/validation/`: Parameter validation and error handling

### Data Flow
1. Claude sends MCP request
2. Write tools exist only with `FIREWALLA_ENABLE_WRITE_TOOLS=true`
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

### Write Tools Missing
- Check `FIREWALLA_ENABLE_WRITE_TOOLS=true` is set in the environment the MCP
  client starts the server with
- Any other value, or none, leaves the write tools unregistered

## Debugging

### Debug Commands
```bash
# Enable comprehensive debugging
DEBUG=firewalla:* npm run mcp:start

# Enable specific debugging namespaces
DEBUG=cache,performance,api npm run mcp:start
DEBUG=validation,query npm run mcp:start

# Debug with performance monitoring
DEBUG=firewalla:* npm run dev
```

### Debug Categories
`DEBUG=firewalla:*`, `DEBUG=1` or `DEBUG=true` enables all debug output. A
comma-separated list enables these namespaces (a trailing `*` matches a prefix):
- **api**: API request/response details
- **cache**: Cache operations
- **performance**: Timing
- **pipeline**: Geographic enrichment
- **query**: Query translation
- **validation**: Input validation

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
6. Register its handler in `src/tools/registry.ts`; a tool that changes state
   also goes in `WRITE_TOOL_NAMES` in `src/config/write-tools.ts`

### Tool Architecture Requirements
- All tools must be defined in TOOL_SCHEMAS with proper schema
- Every tool that changes state goes in `WRITE_TOOL_NAMES`, so it stays off by
  default; `tests/server/tool-annotations.test.ts` fails when a tool with
  `readOnlyHint: false` is missing from the list
- An ID that goes into a request path goes through `pathSegment()` in
  `src/validation/path-segment.ts` (and the handler checks it with
  `ParameterValidator.validatePathSegment`), never straight into a template string.
  Check the value as given: never trim or `sanitizeInput()` an ID first, which
  turns a refused ID into a different one
- Include proper input validation and error handling
- Keep the default server read-only: 24 tools, none with `readOnlyHint: false`
- Implement direct API execution in the server

## Performance Considerations

### Caching System
- API Responses: 300s TTL (configurable via CACHE_TTL environment variable)
- Geographic Data: 1h TTL with LRU eviction
- Cache key collision prevention with enhanced hashing
- Automatic cleanup of expired entries

### Rate Limiting
- The MSP API accepts 100 requests per token in each fixed 5-minute window
  (measured 2026-09-26) and answers 429 over that. `retry-after` (seconds) and
  `x-ratelimit-reset` (epoch seconds) both give the window's end, up to about
  300 s away. Successful responses carry no rate-limit headers, so the client
  counts its own requests.
- Limiter (`src/firewalla/rate-limit.ts`): at most `API_RATE_LIMIT` requests
  start in any rolling 300 s, over every request of the one client instance.
  Cache hits are not counted.
- A request waits at most 20 s for the rate limit (`RATE_LIMIT_MAX_WAIT_MS`;
  tool timeouts default to 30 s), in the queue and on 429 pauses together,
  from when it was first made. Within that it queues first come first served;
  otherwise it fails at once with a `RateLimitError` saying when capacity
  returns, in seconds and as a UTC time.
- On a 429 the client pauses all its requests until `x-ratelimit-reset` when
  it is epoch seconds within 10 minutes, else for `retry-after` (seconds or an
  HTTP date), else for 300 s; at least 1 s, at most 10 minutes.
- Only GETs are retried: at most 2 retries, and only when the pause ends
  within the request's 20 s, with one stderr line. A POST, PATCH, PUT or
  DELETE that gets a 429 is not sent again.
- The error text starts `Rate limit exceeded` (`Rate limit exceeded (HTTP
  429)` when the API refused the request). `ErrorClassifier` in
  `src/validation/error-classification.ts` classifies that as a rate-limit
  error, though nothing in `src/` calls it.
- Details: "Rate Limiting" in `docs/firewalla-api-reference.md`

### Monitoring
```bash
# Enable performance monitoring
DEBUG=performance npm run dev

# Track cache performance  
DEBUG=cache npm run mcp:start
```

## Version Information

- **Version**: see `package.json`; `CHANGELOG.md` has the history
- **Architecture**: 24 read-only tools (19 direct API + 5 convenience), plus 11 opt-in write tools
- **API Support**: Firewalla MSP API v2 with CRUD operations
- **Node.js**: Requires 18+
- **TypeScript**: ES2020 target with strict mode

**Remember**: The `/docs/firewalla-api-reference.md` file contains the complete, verified API specification. It is the single source of truth for all Firewalla API integration.