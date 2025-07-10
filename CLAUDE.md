# Claude Development Guide - Firewalla MCP Server

This file contains essential commands and procedures for Claude to effectively work on this project.

## 🚨 CRITICAL: Before Any API Development

**READ FIRST**: `/docs/firewalla-api-reference.md` - Complete Firewalla API specification

**Key Rules**:
- ✅ ONLY use endpoints documented in `/docs/firewalla-api-reference.md`
- ❌ NEVER assume endpoints exist without verification
- ✅ ALWAYS use box-specific routing: `/v2/boxes/{box_gid}/{resource}`
- ❌ NEVER use fictional endpoints like `/stats/simple` or `/trends/flows`
- ✅ ALWAYS implement client-side aggregation for bandwidth/trends

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
npm run build:clean  # Clean build directory and rebuild
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:ci      # Run tests with coverage for CI
npm run test:unit    # Run unit tests only
npm run test:integration # Run integration tests only
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues automatically
npm run lint:check   # Check linting with zero warnings
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
npm run typecheck    # Type checking without emitting files
npm run clean        # Clean all generated files
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

### Advanced Debugging (v2.0.0)
```bash
# Enable comprehensive debugging
DEBUG=firewalla:* npm run mcp:start

# Enable specific debugging namespaces
DEBUG=cache,performance,api npm run mcp:start
DEBUG=validation,error-handler npm run mcp:start
DEBUG=query,optimization npm run mcp:start
DEBUG=pipeline,data-processing npm run mcp:start

# Debug with performance monitoring
DEBUG=firewalla:* npm run dev

# Run tests with debugging
DEBUG=test,validation npm run test
```

### Validation and Error Testing
```bash
# Test mandatory limit parameter enforcement
npm run test:validation

# Test error handling consistency
npm run test:error-handling

# Test parameter validation
npm run test:parameter-validation

# Test cross-reference field mapping
npm run test:cross-reference
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
**CRITICAL**: The implementation uses ONLY real Firewalla MSP API v2 endpoints.

**📖 OFFICIAL API REFERENCE**: `/docs/firewalla-api-reference.md`
**ALWAYS consult this file for accurate endpoint information before making any API changes.**

**Real endpoints (verified from official docs):**
- Base URL: `https://{msp_domain}/v2/`
- Box-specific endpoints: `/v2/boxes/{box_gid}/{resource}`
- Examples:
  - Devices: `/v2/boxes/{box_gid}/devices`
  - Alarms: `/v2/boxes/{box_gid}/alarms`
  - Flows: `/v2/boxes/{box_gid}/flows`
  - Rules: `/v2/boxes/{box_gid}/rules`
  - Target Lists: `/v2/boxes/{box_gid}/target-lists`
  - Statistics: `/v2/boxes/{box_gid}/stats`
  - Trends: `/v2/boxes/{box_gid}/trends/{type}`

**NEVER use these fictional endpoints:**
- ❌ `/stats/topDevicesByBandwidth` - DOES NOT EXIST
- ❌ `/stats/simple` - DOES NOT EXIST
- ❌ `/trends/flows` - DOES NOT EXIST
- ❌ `/trends/alarms` - DOES NOT EXIST
- ❌ `/trends/rules` - DOES NOT EXIST

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

## Advanced Search API

### Search Implementation (v1.0.0+ Improvements)
The search tools have been significantly enhanced for reliability and performance:

#### Core Search Functions
- **search_flows**: Network flow searching with direct API calls and enhanced reliability
- **search_alarms**: Security alarm searching with simplified validation
- **search_rules**: Firewall rule searching with client-side processing
- **search_devices**: Device searching with cursor-based pagination
- **search_target_lists**: Target list searching with category filtering

#### Key Improvements
- **Simplified validation pipeline**: Removed complex AST parsing that caused query failures
- **Direct API integration**: Query strings passed directly to Firewalla API for better compatibility
- **Enhanced geographic search**: Multiple-value support with OR logic (countries, continents, regions)
- **Client-side limit enforcement**: Ensures exact result compliance with requested limits
- **Robust time range validation**: Proper ISO 8601 date handling with error messages
- **Performance optimization**: 50-75% faster query processing

### Search Query Syntax
The server supports search queries using Firewalla API syntax:

```text
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
- Global TTL (300 seconds default, configurable via CACHE_TTL environment variable)
- Geographic data caching with LRU eviction (1 hour TTL)
- Cache statistics and performance metrics for geographic data

#### Result Aggregation
- Group by any field: `group_by:"protocol"`
- Statistical analysis: sum, avg, min, max, percentiles
- Time-based bucketing: hour, day, week, month
- Trend analysis and correlation detection

### Enhanced Cross-Reference Search (v1.0.0)

The v1.0.0 implementation introduces advanced cross-reference capabilities with intelligent correlation scoring and fuzzy matching.

#### Enhanced Correlation Features

##### Multi-Field Correlation
- Correlate entities across multiple fields simultaneously
- Support for AND/OR correlation logic
- Temporal window filtering for time-based correlation
- Network and device scope expansion

##### Intelligent Scoring System
- Confidence scoring for correlation matches (0.0-1.0)
- Field importance weighting system
- Match type classification (exact, fuzzy, partial)
- Confidence levels (high ≥0.8, medium ≥0.5, low <0.5)

##### Fuzzy Matching Algorithms
- IP subnet matching (/8, /16, /24 networks)
- String similarity using Levenshtein distance
- Numeric tolerance matching with configurable thresholds
- Geographic proximity matching

#### Enhanced Search Tools

##### search_enhanced_cross_reference
```javascript
{
  primary_query: "protocol:tcp AND bytes:>1000",
  secondary_queries: ["severity:high", "type:network_intrusion"],
  correlation_params: {
    correlationFields: ["source_ip", "country"],
    correlationType: "AND",
    temporalWindow: {
      windowSize: 30,
      windowUnit: "minutes"
    },
    networkScope: {
      includeSubnets: true,
      includePorts: true
    }
  },
  limit: 500
}
```


##### get_correlation_suggestions
```javascript
{
  primary_query: "blocked:true",
  secondary_queries: ["severity:high", "online:false"]
}
// Returns intelligent field combination suggestions
```

#### Advanced Correlation Fields

##### Application-Level Fields
- `user_agent`: Browser/application user agent strings
- `application`: Application name (Chrome, Firefox, etc.)
- `application_category`: Application category (browser, social media)
- `domain_category`: Domain classification
- `ssl_subject`: SSL certificate subject
- `ssl_issuer`: SSL certificate issuer

##### Behavioral Pattern Fields
- `session_duration`: Connection duration
- `frequency_score`: Activity frequency rating
- `bytes_per_session`: Average data transfer per session
- `connection_pattern`: Connection behavior pattern
- `activity_level`: User/device activity level

##### Enhanced Geographic Fields
- `country`, `country_code`, `continent`, `city`
- `timezone`, `isp`, `organization`
- `hosting_provider`, `asn`
- `is_cloud_provider`, `is_proxy`, `is_vpn`
- `geographic_risk_score`

#### Correlation Scoring Weights

Default field importance weights for correlation scoring:
```javascript
{
  // Network identifiers (highest confidence)
  "source_ip": 1.0,
  "destination_ip": 1.0,
  "device_ip": 1.0,
  "device_id": 1.0,
  
  // Protocol and network details
  "protocol": 0.9,
  "port": 0.8,
  "asn": 0.8,
  
  // Geographic fields
  "country": 0.7,
  "region": 0.6,
  "city": 0.5,
  
  // Application fields
  "application": 0.7,
  "user_agent": 0.6,
  "ssl_subject": 0.8,
  
  // Behavioral patterns
  "session_duration": 0.5,
  "frequency_score": 0.6,
  
  // Temporal fields (lower confidence)
  "timestamp": 0.4,
  "hour_of_day": 0.3
}
```

#### Geographic Cross-Reference Tools

##### search_flows_by_geography (Enhanced Multi-Value Support)
```javascript
{
  query: "protocol:tcp AND bytes:>1000000",
  geographic_filters: {
    countries: ["China", "Russia", "Iran"],         // Multiple countries with OR logic
    continents: ["Asia", "Europe"],                 // Multiple continents with OR logic
    regions: ["Eastern Europe", "Middle East"],     // Multiple regions with OR logic
    cities: ["Beijing", "Moscow", "Tehran"],        // Multiple cities with OR logic
    asns: ["AS4134", "AS8075", "AS12880"],         // Multiple ASNs with OR logic
    hosting_providers: ["cloudflare", "amazon"],    // Multiple providers with OR logic
    min_risk_score: 0.7,
    exclude_cloud: true,
    exclude_vpn: false
  },
  limit: 200
}
```

##### search_alarms_by_geography (Enhanced Multi-Value Support)
```javascript
{
  query: "severity:>=medium",
  geographic_filters: {
    countries: ["China", "Russia", "North Korea"],  // Multiple countries with OR logic
    continents: ["Asia", "Europe"],                 // Multiple continents with OR logic
    regions: ["Eastern Europe", "East Asia"],       // Multiple regions with OR logic
    high_risk_countries: true,
    exclude_known_providers: true,
    threat_analysis: true
  },
  limit: 100
}
```

**Note**: As of v1.0.0+, all geographic filter arrays support multiple values using OR logic, removing previous single-value limitations.

##### get_geographic_statistics
```javascript
{
  entity_type: "flows",
  time_range: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-31T23:59:59Z"
  },
  group_by: "country"
}
// Returns geographic distribution analysis
```

### Testing Enhanced Search

```bash
# Test enhanced correlation algorithms
npm run test -- tests/validation/enhanced-correlation.test.ts

# Test enhanced cross-reference functionality
npm run test -- tests/tools/enhanced-cross-reference.test.ts

# Manual testing with Claude Code
npm run mcp:start

# Example queries for Claude Code:
# "Find flows from suspicious IPs correlated with high-severity alarms using fuzzy matching"
# "Search for Chrome browser traffic correlated with network intrusion alarms"
# "Get correlation suggestions for blocked traffic and offline devices"
# "Analyze geographic distribution of high-risk flows"
```

#### Example Advanced Queries

```bash
# Enhanced cross-reference with temporal windows
search_enhanced_cross_reference primary_query:"bytes:>10000000" secondary_queries:["severity:high"] correlation_params:"{correlationFields:['source_ip','country'],correlationType:'AND'}"

# Geographic flow analysis
search_flows_by_geography query:"blocked:true" geographic_filters:"{countries:['China','Russia'],risk_threshold:0.8}"

# Intelligent correlation suggestions
get_correlation_suggestions primary_query:"application:torrent" secondary_queries:["action:block","severity:medium"]

# Behavioral pattern correlation
search_enhanced_cross_reference primary_query:"session_duration:>300" secondary_queries:["frequency_score:>5"] correlation_params:"{correlationFields:['device_ip','activity_level'],correlationType:'OR'}"
```

### Search Tool Quick Reference

#### Basic Search Tools
```bash
# Search network flows
search_flows query:"protocol:tcp AND blocked:false" limit:100

# Search security alarms  
search_alarms query:"severity:high" limit:50

# Search firewall rules
search_rules query:"action:block AND target_value:*.facebook.com" limit:25

# Search devices
search_devices query:"online:true AND mac_vendor:Apple" limit:30
```

#### Geographic Search Tools
```bash
# Search flows by geography (multi-value support)
search_flows_by_geography query:"bytes:>1000000" geographic_filters:"{countries:['China','Russia'],continents:['Asia']}" limit:100

# Search alarms by geography
search_alarms_by_geography query:"severity:>=medium" geographic_filters:"{high_risk_countries:true}" limit:50
```

#### Cross-Reference Tools
```bash
# Basic cross-reference
search_cross_reference primary_query:"blocked:true" secondary_queries:"['severity:high']" correlation_field:"source_ip" limit:100

# Enhanced cross-reference with scoring
search_enhanced_cross_reference primary_query:"protocol:tcp" secondary_queries:"['type:1']" correlation_params:"{correlationFields:['source_ip'],correlationType:'AND'}" limit:50
```

### Testing Search Functions

```bash
# Test core search reliability
npm run test:quick

# Manual testing with improved tools
npm run mcp:start

# Example Claude Code queries:
# "Find high-severity alarms from China and Russia in the last hour"
# "Search for blocked flows larger than 10MB grouped by source IP"
# "Show me all rules that block social media sites"
# "Correlate suspicious flows with security alarms by source IP"
```

## API Reference Documentation

**📖 COMPREHENSIVE API REFERENCE**: `/docs/firewalla-api-reference.md`

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

### Performance Issues
- Monitor API rate limits (documented in API reference)
- Check caching configuration
- Review concurrent request handling

## Architecture Notes
- Uses stdio transport for local Claude Code connection
- Implements caching for frequently accessed data
- Rate limiting to respect Firewalla API limits
- Secure credential handling with environment variables

## v1.0.0 Implementation Features

### CRITICAL: Correct Implementation Patterns

**Bandwidth Usage Implementation:**
```javascript
// CORRECT: Use flows endpoint with aggregation
const endpoint = `/v2/boxes/${box_gid}/flows`;
const params = {
  query: `ts:${begin}-${end}`,
  groupBy: 'device',
  sortBy: 'download+upload:desc',
  limit: N
};
// Then aggregate bandwidth data client-side by device
```

**Flow Trends Implementation:**
```javascript
// CORRECT: Fetch flows and create time buckets
const endpoint = `/v2/boxes/${box_gid}/flows`;
const params = {
  query: `ts:${begin}-${end}`,
  limit: 10000,
  sortBy: 'ts:asc'
};
// Then group flows by time intervals client-side
```

**Statistics Implementation:**
```javascript
// CORRECT: Aggregate from multiple real endpoints
const [boxes, alarms, rules] = await Promise.all([
  this.getBoxes(),
  this.getActiveAlarms(),
  this.getNetworkRules()
]);
// Then combine data client-side
```

**Search Implementation (v1.0.0+ Simplified):**
```javascript
// CORRECT: Direct API calls with basic validation for improved reliability
const response = await firewalla.getFlowData(
  queryString,      // Direct query string to API
  groupBy,          // Optional grouping
  sortBy || 'ts:desc',
  limit,            // Enforced client-side if needed
  cursor            // Pagination support
);
// Client-side limit enforcement ensures exact compliance
if (results.length > limit) {
  results = results.slice(0, limit);
}
```

### Mandatory Limit Parameters
**REQUIRED**: All paginated MCP tools require explicit `limit` parameter. This prevents artificial defaults that mask missing parameters.

##### Required for Tools:
- get_active_alarms, get_flow_data, get_device_status
- get_bandwidth_usage (renamed from `top` to `limit`)  
- get_network_rules, get_most_active_rules, get_recent_rules
- All search tools (search_flows, search_alarms, etc.)

##### Testing Patterns:
```bash
# Invalid - missing required parameter
mcp_call get_device_status {}

# Valid - includes required limit parameter
mcp_call get_device_status { "limit": 100 }

# Test limit enforcement
npm run test -- --grep "limit parameter"
```

### Validation Framework (v1.0.0)

##### Error Format:
All tools return standardized errors:
```json
{
  "error": true,
  "message": "limit parameter is required", 
  "tool": "get_device_status",
  "validation_errors": ["limit is required"]
}
```

##### Testing Validation:
```bash
# Test parameter validation
DEBUG=validation npm run test:validation

# Test error handling consistency  
npm run test:error-handling

# Test null safety improvements
npm run test:null-safety
```

##### Validation Classes:
- `ParameterValidator`: Type and range validation
- `SafeAccess`: Null-safe property access
- `FieldMapper`: Cross-reference field compatibility
- `ErrorHandler`: Standardized error responses

### Performance Monitoring (v1.0.0)

##### Cache System:
- API Responses: 300s TTL (configurable via CACHE_TTL environment variable)
- Geographic Data: 1h TTL with LRU eviction (10,000 entry capacity)
- Cache key collision prevention with enhanced hashing
- Automatic cleanup of expired entries

##### Monitoring Commands:
```bash
# Enable cache debugging
DEBUG=cache npm run mcp:start

# Monitor performance metrics
DEBUG=performance,metrics npm run dev

# Track query optimization  
DEBUG=query,optimization npm run mcp:start
```


## Bulk Operations

The Firewalla MCP server includes 10 bulk operation tools for efficiently managing multiple alarms and rules simultaneously. These tools are optimized for high-volume operations and include comprehensive error handling.

### Bulk Alarm Operations (4 tools)

#### bulk_delete_alarms
Delete multiple security alarms in a single operation.
```bash
# Delete specific alarms by ID
bulk_delete_alarms ids:["alarm1","alarm2","alarm3"] limit:50

# Delete all alarms matching criteria  
bulk_delete_alarms query:"severity:low AND resolved:true" limit:100
```

#### bulk_dismiss_alarms
Dismiss multiple alarms without deleting them.
```bash
# Dismiss specific alarms
bulk_dismiss_alarms ids:["alarm1","alarm2"] reason:"False positive"

# Dismiss by query
bulk_dismiss_alarms query:"type:dns_anomaly AND severity:low" limit:50
```

#### bulk_acknowledge_alarms  
Mark multiple alarms as acknowledged.
```bash
# Acknowledge specific alarms
bulk_acknowledge_alarms ids:["alarm1","alarm2"] note:"Investigating"

# Acknowledge by criteria
bulk_acknowledge_alarms query:"severity:high AND unacknowledged:true" limit:25
```

#### bulk_update_alarms
Update properties of multiple alarms.
```bash
# Update alarm severity
bulk_update_alarms ids:["alarm1","alarm2"] updates:"{severity:'medium',tags:['reviewed']}"

# Bulk update by query
bulk_update_alarms query:"type:malware" updates:"{priority:'high'}" limit:100
```

### Bulk Rule Operations (6 tools)

#### bulk_pause_rules
Temporarily disable multiple firewall rules.
```bash  
# Pause specific rules for 1 hour
bulk_pause_rules ids:["rule1","rule2"] duration:60 reason:"Maintenance window"

# Pause rules by category
bulk_pause_rules query:"category:social_media" duration:120 limit:10
```

#### bulk_resume_rules
Re-enable previously paused rules.
```bash
# Resume specific rules
bulk_resume_rules ids:["rule1","rule2"]

# Resume all paused rules
bulk_resume_rules query:"status:paused" limit:50
```

#### bulk_enable_rules / bulk_disable_rules
Permanently enable or disable multiple rules.
```bash
# Enable gaming rules during specific hours
bulk_enable_rules query:"category:gaming" limit:20

# Disable legacy rules
bulk_disable_rules query:"created:<2023-01-01" limit:100
```

#### bulk_update_rules
Modify properties of multiple rules.
```bash
# Update rule descriptions
bulk_update_rules ids:["rule1","rule2"] updates:"{description:'Updated policy'}"

# Bulk update rule schedules
bulk_update_rules query:"category:work_hours" updates:"{schedule:'9-17'}" limit:25
```

#### bulk_delete_rules
Permanently remove multiple rules.
```bash
# Delete specific rules
bulk_delete_rules ids:["rule1","rule2"] confirm:true

# Delete unused rules
bulk_delete_rules query:"hit_count:0 AND created:<2023-06-01" limit:50 confirm:true
```

### Bulk Operations Features

#### Performance Optimizations
- **Batch Processing**: Operations processed in optimized batches for performance
- **Progress Tracking**: Real-time progress updates for large operations
- **Error Recovery**: Partial failure handling with detailed error reporting
- **Rate Limiting**: Automatic throttling to prevent API overload

#### Safety Features
- **Confirmation Required**: Destructive operations require explicit confirmation
- **Dry Run Mode**: Preview operations before execution
- **Rollback Support**: Undo capability for certain operations
- **Audit Logging**: Complete operation history and change tracking

#### Error Handling
- **Partial Success**: Operations continue even if some items fail
- **Detailed Reporting**: Per-item success/failure status
- **Recovery Suggestions**: Actionable error messages with retry guidance
- **Transaction Safety**: Atomic operations where possible

### Example Bulk Workflows

#### Security Incident Response
```bash
# 1. Acknowledge all high-severity alarms
bulk_acknowledge_alarms query:"severity:high AND acknowledged:false" note:"Security team investigating"

# 2. Temporarily block suspicious domains
bulk_pause_rules query:"target_value:*.suspicious-domain.com" duration:240 reason:"Security investigation"

# 3. Bulk dismiss false positives
bulk_dismiss_alarms query:"type:dns_anomaly AND source_ip:192.168.*" reason:"Internal traffic"
```

#### Maintenance Operations
```bash
# 1. Disable old rules before cleanup
bulk_disable_rules query:"created:<2023-01-01 AND hit_count:0" limit:200

# 2. Clean up resolved alarms
bulk_delete_alarms query:"resolved:true AND created:<2024-01-01" limit:500 confirm:true

# 3. Update rule descriptions for compliance
bulk_update_rules query:"category:compliance" updates:"{tags:['reviewed','2024-audit']}"
```

## Debugging
- Use `DEBUG=firewalla:*` for comprehensive debugging (v2.0.0+)
- Use `DEBUG=mcp:*` for legacy MCP debugging
- Check server logs in `logs/` directory
- Monitor API request/response cycles with timing
- Performance metrics available in debug mode
- **API Issues**: Always reference `/docs/firewalla-api-reference.md` for correct endpoints

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

**Remember**: The `/docs/firewalla-api-reference.md` file contains the complete, verified API specification. It is the single source of truth for all Firewalla API integration.

## Enhanced Documentation (v2.0.0)

The following comprehensive guides are available for developers and users:

### Core Documentation
- **API Reference**: `/docs/firewalla-api-reference.md` - Complete API specification with endpoints, data models, and examples
- **Query Syntax Guide**: `/docs/query-syntax-guide.md` - Comprehensive query syntax documentation with examples and best practices
- **Error Handling Guide**: `/docs/error-handling-guide.md` - Error patterns, troubleshooting, and recovery strategies
- **Data Audit Report**: `/docs/data-audit-report.md` - Field consistency analysis and normalization recommendations

### Advanced Features
- **Pagination Guide**: `/docs/pagination-guide.md` - Cursor-based pagination patterns and performance optimization
- **Rate Limiting Guide**: `/docs/rate-limiting-guide.md` - API rate limits, throttling strategies, and performance tuning

### Integration in Tools
All MCP tools now include:
- **Practical Query Examples**: Real-world usage patterns with performance tips
- **Enhanced Error Context**: Detailed error messages with recovery suggestions and documentation links
- **Data Normalization**: Consistent field handling with standardized unknown value processing
- **Field Consistency**: Standardized snake_case naming and null handling patterns
- **Response Validation**: Automatic structure validation with detailed error reporting

### Usage in Development
Reference these guides when:
- Writing new tools or handlers
- Debugging API integration issues
- Implementing search functionality
- Handling errors and edge cases
- Optimizing query performance
- Ensuring data consistency

## Fixed Issues (v1.0.0+)

### ✅ **Resolved Critical Issues**
- **Rule Management Authentication**: `pause_rule` and `resume_rule` now use correct API endpoints with box parameter
- **Parameter Filtering**: `get_active_alarms` supports severity filtering (low, medium, high, critical)
- **Bandwidth Data Pipeline**: `get_bandwidth_usage` enhanced with better field detection and debugging
- **Enhanced Cross-Reference**: `search_enhanced_cross_reference` data structure mapping fixed
- **Validation Framework**: All tools comply with v1.0.0 mandatory limit parameter requirements

### ✅ **Parameter Updates**
- **`get_bandwidth_usage`**: Parameter renamed from `top` to `limit` for consistency
- **`get_active_alarms`**: Added optional `severity` parameter for filtering
- **`get_network_rules_summary`**: Now requires mandatory `limit` parameter
- **Rule Management**: `pause_rule` supports `duration` parameter (1-1440 minutes)

### ✅ **Authentication & API**
- **Write Operations**: Fixed authentication for rule management operations
- **Endpoint URLs**: Corrected to use documented API format with box parameters
- **Error Handling**: Enhanced HTML response detection and debugging
- **Field Detection**: Improved bandwidth calculation with multiple field fallbacks

### 🎯 **Production Ready Status**
- **READ OPERATIONS**: Excellent reliability and performance ✅
- **SEARCH & ANALYTICS**: Comprehensive functionality with enhanced features ✅
- **WRITE OPERATIONS**: Authentication issues resolved ✅
- **PARAMETER VALIDATION**: Complete v1.0.0 framework compliance ✅