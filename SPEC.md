# Technical Specification - Firewalla MCP Server

## Overview
A Model Context Protocol server providing Claude with real-time access to Firewalla firewall data through standardized tools, resources, and prompts.

## MCP Protocol Implementation

### Transport
- **Type**: stdio (Standard Input/Output)
- **Format**: JSON-RPC 2.0
- **Client**: Claude Code
- **Server**: Local Node.js process

### Initialization
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": true,
      "resources": true,
      "prompts": true
    },
    "clientInfo": {
      "name": "claude-code",
      "version": "1.0.0"
    }
  }
}
```

## Firewalla MSP API Integration

### Base Configuration
- **Base URL**: `https://{msp_domain}/v2/`
- **Authentication**: Token-based authentication
- **Rate Limit**: 100 requests per minute
- **Timeout**: 30 seconds per request

### API Endpoints

#### Flow Data
```http
GET /v2/boxes/{box_gid}/flows
Query Parameters:
- page: number (pagination)
- limit: number (max 100)
- start_time: ISO 8601 timestamp
- end_time: ISO 8601 timestamp
```

#### Active Alarms
```
GET /v2/boxes/{box_gid}/alarms
Query Parameters:
- status: active|resolved
- severity: low|medium|high|critical
- limit: number (max 50)
```

#### Device Status
```
GET /v2/boxes/{box_gid}/devices
Response includes online/offline status, IP addresses, MAC addresses
```

#### Bandwidth Usage
```http
GET /v2/boxes/{box_gid}/bandwidth
Query Parameters:
- period: 1h|24h|7d|30d
- limit: number (required, max 100)
```

## MCP Tools (Actions)

### get_active_alarms
**Purpose**: Retrieve current security alerts
**Parameters**:
- `severity` (optional): Filter by severity level
- `limit` (optional): Maximum number of results (default: 20)

**Response Schema**:
```typescript
interface Alarm {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  source_ip?: string;
  destination_ip?: string;
  status: 'active' | 'resolved';
}
```

### get_flow_data
**Purpose**: Query network traffic flows
**Parameters**:
- `start_time` (optional): Start time for query
- `end_time` (optional): End time for query
- `limit` (optional): Maximum results (default: 50)
- `page` (optional): Page number for pagination

**Response Schema**:
```typescript
interface FlowData {
  flows: Flow[];
  pagination: {
    page: number;
    total_pages: number;
    total_count: number;
  };
}

interface Flow {
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  bytes: number;
  packets: number;
  duration: number;
}
```

### get_device_status
**Purpose**: Check device online/offline status
**Parameters**:
- `device_id` (optional): Specific device ID
- `include_offline` (optional): Include offline devices (default: true)

### get_bandwidth_usage
**Purpose**: Get top bandwidth consuming devices
**Parameters**:
- `period`: Time period ('1h', '24h', '7d', '30d')
- `limit` (required): Maximum number of devices to return

### get_network_rules
**Purpose**: Retrieve firewall rules
**Parameters**:
- `rule_type` (optional): Filter by rule type
- `active_only` (optional): Only active rules (default: true)

### pause_rule
**Purpose**: Temporarily disable specific firewall rule
**Parameters**:
- `rule_id`: Rule identifier to pause
- `duration` (optional): Pause duration in minutes (default: 60)

### get_target_lists
**Purpose**: Access security target lists
**Parameters**:
- `list_type` (optional): 'cloudflare' | 'crowdsec' | 'all'

## MCP Resources (Data Access)

### firewall_summary
**URI**: `firewalla://summary`
**Description**: Real-time firewall health and status overview
**MIME Type**: `application/json`

### device_inventory
**URI**: `firewalla://devices`
**Description**: Complete list of managed devices with metadata
**MIME Type**: `application/json`

### security_metrics
**URI**: `firewalla://metrics/security`
**Description**: Aggregated security statistics and trends
**MIME Type**: `application/json`

### network_topology
**URI**: `firewalla://topology`
**Description**: Network structure and device relationships
**MIME Type**: `application/json`

### recent_threats
**URI**: `firewalla://threats/recent`
**Description**: Latest security events and blocked attempts
**MIME Type**: `application/json`

## MCP Prompts (Templates)

### security_report
**Name**: Generate Security Report
**Description**: Create comprehensive security overview
**Arguments**:
- `period`: Time period for report ('24h', '7d', '30d')
- `include_resolved`: Include resolved issues (default: false)

### threat_analysis
**Name**: Analyze Threats
**Description**: Deep dive into recent security threats and patterns
**Arguments**:
- `severity_threshold`: Minimum severity level ('medium', 'high', 'critical')

### bandwidth_analysis
**Name**: Bandwidth Usage Analysis
**Description**: Investigate high bandwidth usage patterns
**Arguments**:
- `period`: Analysis period ('1h', '24h', '7d')
- `threshold_mb`: Minimum bandwidth threshold in MB

### device_investigation
**Name**: Device Investigation
**Description**: Detailed analysis of specific device activity
**Arguments**:
- `device_id`: Target device identifier
- `lookback_hours`: Hours to look back (default: 24)

### network_health_check
**Name**: Network Health Assessment
**Description**: Overall network status and performance check
**Arguments**: None

## Error Handling

### API Error Codes
- `401`: Authentication failed - check MSP token
- `403`: Insufficient permissions
- `404`: Resource not found (invalid box_id)
- `429`: Rate limit exceeded
- `500`: Internal server error

### MCP Error Responses
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "details": "Firewalla API authentication failed"
    }
  }
}
```

## Security Considerations

### Credential Management
- MSP tokens stored in environment variables only
- No credentials in code or logs
- Token rotation support

### Rate Limiting
- Respect Firewalla API limits
- Implement exponential backoff
- Cache frequently accessed data

### Input Validation
- Sanitize all user inputs
- Validate parameter types and ranges
- Prevent injection attacks

## v1.0.0 Implementation Features

### Mandatory Limit Parameters

**REQUIRED**: All paginated tools now require explicit `limit` parameter in their schema.

**Updated Tool Schemas:**
```typescript
// Before (v1.x)
interface GetDeviceStatusParams {
  device_id?: string;
  include_offline?: boolean;
  limit?: number; // Optional with default
}

// After (v1.0.0+)  
interface GetDeviceStatusParams {
  device_id?: string;
  include_offline?: boolean;
  limit: number; // REQUIRED - no default
}
```

**Affected Tools:**
- `get_active_alarms`: requires `limit`
- `get_flow_data`: requires `limit`
- `get_device_status`: requires `limit` 
- `get_bandwidth_usage`: parameter renamed from `top` to `limit`, required
- `get_network_rules`: requires `limit`
- `get_most_active_rules`: requires `limit`
- `get_recent_rules`: requires `limit`
- All search tools: require both `query` and `limit`

**Error Response for Missing Limit:**
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "get_device_status",
  "validation_errors": ["limit is required"]
}
```

## New Architecture (v1.0.0)

### Validation Framework

**Standardized Error Format:**
All tools now return consistent error structure:
```typescript
interface StandardError {
  error: true;
  message: string;
  tool: string;
  details?: any;
  validation_errors?: string[];
}
```

**Validation Classes:**
```typescript
class ParameterValidator {
  validateRequiredString(value: any, name: string): ValidationResult;
  validateNumber(value: any, name: string, options?: NumberOptions): ValidationResult;
  validateEnum(value: any, name: string, allowedValues: string[]): ValidationResult;
}

class SafeAccess {
  getNestedValue<T>(obj: any, path: string, defaultValue: T): T;
  ensureArray<T>(value: any): T[];
  ensureObject(value: any): Record<string, any>;
}

class FieldMapper {
  getCompatibleFields(entityType: string): string[];
  mapFieldBetweenTypes(field: string, fromType: string, toType: string): string;
  validateCrossReference(primaryType: string, secondaryType: string, correlationField: string): boolean;
}
```

### Performance Monitoring System

**Multi-Tier Caching:**
```typescript
interface CacheConfig {
  realTimeData: { ttl: 30_000 };     // Alarms, flows: 30s
  mediumFrequencyData: { ttl: 120_000 }; // Devices: 2m
  stableData: { ttl: 600_000 };      // Rules: 10m  
  staticData: { ttl: 3_600_000 };    // Statistics: 1h
}
```

**Metrics Collection:**
```typescript
interface PerformanceMetrics {
  response_time_ms: number;
  cache_hit_rate: number;
  error_rate: number;
  memory_usage_mb: number;
  api_calls_per_minute: number;
}
```

**DEBUG Environment Variables:**
- `DEBUG=firewalla:*` - Enable all debugging
- `DEBUG=cache,performance` - Specific namespaces
- `DEBUG=validation,error-handler` - Validation debugging
- `DEBUG=query,optimization` - Query performance

### Enhanced Security

**Input Sanitization:**
```typescript
class QuerySanitizer {
  sanitizeSearchQuery(query: string): string;
  preventInjection(input: string): string;
  validateQueryLength(query: string, maxLength: number): boolean;
}
```

**Enhanced Authentication:**
- Comprehensive HTTP status code handling
- Better error messages with context
- Rate limiting with exponential backoff
- Enhanced token validation

## Performance Requirements (v1.0.0)
- Response time: < 2 seconds for cached operations, < 5 seconds for uncached
- Concurrent requests: Support up to 20 simultaneous requests  
- Memory usage: < 150MB under normal load with caching
- Cache hit ratio: > 85% for repeated queries
- P95 response time: < 3 seconds
- P99 response time: < 8 seconds
- Error rate: < 1% under normal conditions