# Field Syntax Requirements Documentation

## Overview

This document provides comprehensive field syntax requirements for all Firewalla MCP Server tool categories, based on API testing, documentation analysis, and validation patterns.

## Executive Summary

### Key Findings

1. **Search Tools have the highest complexity** - 11 tools with complex query syntax requirements
2. **Field naming inconsistencies** - `source_ip` works in correlation but fails in direct queries
3. **Parameter validation strictness** - All search tools require explicit `limit` parameter
4. **Query parser validation** - Complex AST-based query validation with entity-specific field lists
5. **Geographic field extensions** - Enhanced field mappings for location-based searches

### Critical Issues Identified

- **Field Name Mapping**: Direct field names like `source_ip` fail in search queries but work in correlations
- **Required vs Optional Parameters**: Inconsistent enforcement between tool categories
- **Query Syntax Validation**: Complex parsing requirements with entity-specific validation
- **API Endpoint Patterns**: Must use real endpoints with client-side aggregation patterns

---

## Tool Categories and Field Syntax

### 1. Search Tools (HIGH COMPLEXITY - 11 tools)

**Tools**: `search_flows`, `search_alarms`, `search_rules`, `search_devices`, `search_target_lists`, `search_cross_reference`, `search_enhanced_cross_reference`, `search_enhanced_scored_cross_reference`, `get_correlation_suggestions`, `search_flows_by_geography`, `search_alarms_by_geography`, `get_geographic_statistics`

#### Query Syntax Requirements

**Basic Field Query Pattern**:
```
field:value
protocol:tcp
direction:outbound
blocked:true
```

**Logical Operators** (tested and working):
```
AND - protocol:tcp AND direction:outbound
OR  - severity:high OR severity:critical  
NOT - protocol:tcp NOT blocked:true
```

**Grouping**:
```
(protocol:tcp OR protocol:udp) AND blocked:true
```

**Comparison Operators**:
```
>= - bytes:>=1000000
<= - duration:<=300
>  - timestamp:>1640995200
<  - count:<10
!= - status:!=resolved
```

**Range Queries**:
```
[min TO max] - bytes:[1000 TO 50000]
duration:[300 TO 600]
```

**Wildcard Patterns**:
```
* - domain:*.facebook.com
? - name:device?
ip:192.168.*
```

**Quoted Values**:
```
"exact phrase" - message:"security threat detected"
device_name:"John's iPhone"
```

#### Entity-Specific Field Lists

**Flows Fields (working)**:
```
- protocol, direction, blocked, bytes, timestamp
- device_ip (works), region, category
- country, continent, city, asn
- user_agent, application, ssl_subject
- session_duration, frequency_score
```

**Flows Fields (FAILS - use alternatives)**:
```
❌ source_ip (use device_ip or device: instead)
❌ destination_ip (use target domain or IP patterns)
```

**Alarms Fields (working)**:
```
- severity, type, timestamp, status, description
- country, continent, asn, geographic_risk_score
- application, user_agent, session_duration
```

**Rules Fields (working)**:
```
- action, target_type, target_value, direction, status
- hit_count, created_at, updated_at
```

**Devices Fields (working)**:
```
- name, ip, mac_vendor, online, network_name
- group_name, total_download, total_upload
```

**Target Lists Fields (working)**:
```
- name, owner, category, target_count, last_updated
```

#### Mandatory Parameters

**ALL Search Tools Require**:
- `query` (string, required, non-empty)
- `limit` (number, required, min: 1, max varies by tool)

**Tool-Specific Limits**:
- `search_flows`: max 1000
- `search_alarms`: max 5000  
- `search_rules`: max 3000
- `search_devices`: max 2000
- `search_target_lists`: max 1000

**Optional Parameters**:
- `sort_by` (string, optional)
- `sort_order` ('asc' | 'desc', optional)
- `group_by` (string, optional)
- `aggregate` (boolean, optional)
- `time_range` (object with start/end ISO dates, optional)
- `cursor` (string, optional for pagination)

#### Time Range Syntax

```javascript
time_range: {
  start: "2024-01-01T00:00:00Z",  // ISO 8601 format required
  end: "2024-01-31T23:59:59Z"     // Must be after start
}
```

#### Cross-Reference Specific Parameters

**Required for `search_cross_reference`**:
```javascript
{
  primary_query: "protocol:tcp",
  secondary_queries: ["severity:high", "type:network_intrusion"], 
  correlation_field: "device_ip",  // Must be compatible across entity types
  limit: 1000
}
```

**Enhanced Cross-Reference Parameters**:
```javascript
{
  primary_query: "bytes:>1000000",
  secondary_queries: ["severity:high"],
  correlation_params: {
    correlationFields: ["device_ip", "timestamp"],
    correlationType: "AND" | "OR",
    temporalWindow: {
      windowSize: 30,
      windowUnit: "minutes"
    },
    enableScoring: true,
    enableFuzzyMatching: true,
    minimumScore: 0.7
  },
  limit: 1000
}
```

#### Geographic Search Parameters

```javascript
{
  query: "protocol:tcp",
  geographic_filters: {
    countries: ["United States", "Germany"],
    continents: ["Europe", "Asia"],
    exclude_cloud: true,
    exclude_vpn: true,
    min_risk_score: 7
  },
  limit: 200
}
```

### 2. Analytics Tools (MEDIUM COMPLEXITY - 6 tools)

**Tools**: `get_flow_trends`, `get_alarm_trends`, `get_rule_trends`, `get_statistics_by_region`, `get_statistics_by_box`, `get_simple_statistics`

#### Parameter Patterns

**Time Period Parameter** (enum validation):
```
period: "1h" | "24h" | "7d" | "30d"
```

**Interval Parameter** (numeric validation):
```
interval: number (min: 60 seconds, max: 86400 seconds)
```

**Limit Parameter** (optional for most analytics):
```
limit: number (min: 1, max: 500, default varies)
```

#### Error Patterns Observed

- **Enum Validation**: `period must be one of: 1h, 24h, 7d, 30d, got 'invalid'`
- **Range Validation**: `interval is too small in seconds for data aggregation (got 30, minimum: 60)`
- **Required Parameter**: Analytics tools generally have optional parameters with sensible defaults

### 3. Network Tools (MEDIUM COMPLEXITY - 4 tools)

**Tools**: `get_flow_data`, `get_bandwidth_usage`, `get_offline_devices`, `get_device_status`

#### Parameter Requirements

**Required Parameters**:
- `limit` (all tools require explicit limit parameter)
- `period` (for bandwidth tools): "1h" | "24h" | "7d" | "30d"

**Optional Parameters**:
- `time_range` (for flows): ISO 8601 date objects
- `query` (for flows): basic search query syntax
- `sort_by` (string)

#### Validation Patterns

```javascript
// get_bandwidth_usage
{
  period: "24h",        // Required enum
  limit: 10            // Required positive integer
}

// get_flow_data  
{
  query: "protocol:tcp", // Optional query string
  limit: 100,           // Required
  time_range: {         // Optional
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-02T00:00:00Z"
  }
}
```

### 4. Security Tools (LOW COMPLEXITY - 3 tools)

**Tools**: `get_active_alarms`, `get_specific_alarm`, `delete_alarm`

#### Parameter Patterns

**Mandatory for List Operations**:
- `limit` (number, required for `get_active_alarms`)

**ID-based Operations**:
- `alarm_id` (string, required for specific alarm operations)
- `box_id` (string, required)

**Optional Filtering**:
- `query` (string, optional for search filtering)
- `status` (enum: "active" | "archived")
- `severity` (enum: "low" | "medium" | "high" | "critical")

### 5. Rules Tools (LOW COMPLEXITY - 7 tools)

**Tools**: `get_network_rules`, `pause_rule`, `resume_rule`, `get_target_lists`, `get_network_rules_summary`, `get_most_active_rules`, `get_recent_rules`

#### Parameter Requirements

**List Operations**:
- `limit` (required for listing rules)
- `query` (optional filtering)

**Rule Operations**:
- `rule_id` (string, required for pause/resume)

**Target List Operations**:
- `target_list_id` (string, for specific operations)
- `limit` (number, for list operations)

### 6. Box Management Tools (LOW COMPLEXITY - 1 tool)

**Tools**: `get_boxes`

#### Simple Parameter Pattern

```javascript
{
  // No required parameters
  group_id?: string    // Optional group filtering
}
```

---

## API Implementation Requirements

### Critical Implementation Patterns

**MUST Use Real Endpoints**:
```javascript
// ✅ CORRECT - Use actual API endpoints
const endpoint = `/v2/boxes/${box_gid}/flows`;
const endpoint = `/v2/boxes/${box_gid}/alarms`;
const endpoint = `/v2/boxes/${box_gid}/rules`;

// ❌ NEVER use fictional endpoints
// /stats/simple, /trends/flows, /stats/topDevicesByBandwidth
```

**Client-Side Aggregation Required**:
```javascript
// Bandwidth Usage Implementation
const flows = await apiClient.get(`/v2/boxes/${box_gid}/flows`, {
  params: { query: `ts:${begin}-${end}`, limit: 1000 }
});
// Then aggregate bandwidth by device client-side

// Trends Implementation  
const flows = await apiClient.get(`/v2/boxes/${box_gid}/flows`, {
  params: { query: `ts:${begin}-${end}`, sortBy: 'ts:asc', limit: 10000 }
});
// Then create time buckets client-side
```

### Query Parameter Formatting

**API Query Format** (different from search tool syntax):
```javascript
// For API calls use:
{
  query: "ts:1640995200-1641081600 AND protocol:tcp",  // API format
  limit: 100,
  sortBy: "ts:desc"
}

// Search tools accept:
{
  query: "protocol:tcp AND timestamp:>=1640995200",    // Search format
  limit: 100,
  sort_by: "timestamp:desc"
}
```

### Authentication Requirements

```javascript
headers: {
  'Authorization': `Token ${FIREWALLA_MSP_TOKEN}`,
  'Content-Type': 'application/json'
}
```

---

## Validation Error Patterns

### Common Error Types

**Parameter Validation Errors**:
```
"Parameter validation failed: limit is required"
"Parameter validation failed: query cannot be empty"
"time_range.start must be before time_range.end"
"limit must be between 1 and 1000, got -1"
```

**Query Syntax Errors**:
```
"Query validation failed: Invalid query syntax"
"Invalid field 'source_ip' for flows. Valid fields: protocol, direction, blocked..."
"Expected ':' after field 'protocol'"
"Unclosed quoted string starting at position 5"
```

**Field Compatibility Errors**:
```
"Correlation field 'invalid_field' is not compatible with detected entity types"
"Field is supported by: flows, alarms"
```

### Security Validation

**Query Injection Prevention**:
```
// These patterns are blocked:
"'; DROP TABLE flows; --"
"<script>alert('xss')</script>"
"../../etc/passwd"
```

**Length Limitations**:
```
// Queries longer than 10,000 characters are rejected
"Query validation failed: Query too long (max 10000 characters)"
```

---

## Field Mapping Reference

### Cross-Entity Correlation Fields

**Working Correlation Fields**:
```
device_ip     - flows, alarms, devices
device_id     - flows, alarms, devices  
protocol      - flows, alarms, rules
timestamp     - flows, alarms, rules
gid           - flows, alarms, rules, devices
direction     - flows, rules
status        - alarms, rules
```

**Geographic Correlation Fields**:
```
country       - flows, alarms
continent     - flows, alarms
asn           - flows, alarms
timezone      - flows, alarms
```

**Enhanced Application Fields**:
```
user_agent           - flows, alarms
application          - flows, alarms
ssl_subject          - flows, alarms
session_duration     - flows, alarms
```

### Field Mapping Between Entity Types

```javascript
// flows entity
'device_ip': ['device.ip', 'source.ip']
'protocol': ['protocol']
'bytes': ['bytes', 'download', 'upload']

// alarms entity  
'device_ip': ['device.ip', 'remote.ip']
'severity': ['severity']
'timestamp': ['ts', 'timestamp']

// rules entity
'target_value': ['target.value']
'action': ['action']
'status': ['status']
```

---

## Best Practices

### Query Construction

**DO**:
```javascript
// Use correct field names
{ query: "protocol:tcp", limit: 100 }

// Use proper operators
{ query: "bytes:>=1000000", limit: 50 }

// Use quotes for complex values
{ query: 'device_name:"John\'s iPhone"', limit: 10 }

// Use ISO dates for time ranges
{ 
  query: "protocol:tcp",
  time_range: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-02T00:00:00Z"
  },
  limit: 100
}
```

**DON'T**:
```javascript
// Missing required parameters
{ query: "protocol:tcp" }  // Missing limit

// Invalid field names
{ query: "source_ip:192.168.1.1", limit: 10 }  // Use device_ip

// Invalid operators
{ query: "protocol=tcp", limit: 10 }  // Use colon (:)

// Unquoted special characters
{ query: "message:security threat", limit: 10 }  // Use quotes
```

### Error Handling

```javascript
try {
  const result = await searchTools.search_flows({
    query: "protocol:tcp",
    limit: 100
  });
} catch (error) {
  if (error.message.includes('Parameter validation failed')) {
    // Handle validation errors
  } else if (error.message.includes('Query validation failed')) {
    // Handle query syntax errors
  } else if (error.message.includes('Invalid field')) {
    // Handle field compatibility errors
  }
}
```

### Performance Optimization

**Limit Sizing**:
- Use appropriate limits for tool types (flows: ≤1000, alarms: ≤5000)
- Start with smaller limits for testing

**Query Specificity**:
- Use specific field queries over wildcards when possible
- Combine filters with AND for better performance
- Use time ranges to limit dataset size

**Correlation Complexity**:
- Limit correlation fields to 3-5 for performance
- Use exact matching over fuzzy matching for large datasets
- Set appropriate minimum scores for fuzzy matching (≥0.5)

---

## Migration Guide

### Updating Existing Queries

**From problematic patterns to working patterns**:

```javascript
// OLD (fails)
{ query: "source_ip:192.168.1.1" }

// NEW (works)  
{ query: "device_ip:192.168.1.1" }

// OLD (fails)
{ query: "ip:192.168.1.1" }  

// NEW (works)
{ query: "device_ip:192.168.1.1" }
```

### Parameter Migration

```javascript
// OLD (missing required)
searchFlows({ query: "protocol:tcp" })

// NEW (with required limit)
searchFlows({ query: "protocol:tcp", limit: 100 })

// OLD (incorrect time format)
{ 
  query: "protocol:tcp",
  time_range: { start: "2024-01-01", end: "2024-01-02" }
}

// NEW (ISO format required)
{
  query: "protocol:tcp", 
  time_range: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-02T00:00:00Z" 
  },
  limit: 100
}
```

---

## Appendix

### Complete Field Reference by Entity

**Flows Entity - Complete Field List**:
```
Working: protocol, direction, blocked, bytes, timestamp, device_ip, region, 
         category, country, continent, city, asn, user_agent, application, 
         ssl_subject, session_duration, frequency_score, geographic_risk_score

Failing: source_ip, destination_ip (use device_ip and domain patterns instead)
```

**Alarms Entity - Complete Field List**:
```
Working: severity, type, timestamp, status, description, country, continent, 
         asn, geographic_risk_score, application, user_agent, session_duration
```

**Rules Entity - Complete Field List**:
```  
Working: action, target_type, target_value, direction, status, hit_count, 
         created_at, updated_at
```

**Devices Entity - Complete Field List**:
```
Working: name, ip, mac_vendor, online, network_name, group_name, 
         total_download, total_upload
```

**Target Lists Entity - Complete Field List**:
```
Working: name, owner, category, target_count, last_updated
```

### Correlation Compatibility Matrix

| Field | Flows | Alarms | Rules | Devices | Target Lists |
|-------|-------|--------|-------|---------|--------------|
| device_ip | ✅ | ✅ | ❌ | ✅ | ❌ |
| protocol | ✅ | ✅ | ✅ | ❌ | ❌ |
| timestamp | ✅ | ✅ | ✅ | ❌ | ❌ |
| status | ❌ | ✅ | ✅ | ❌ | ❌ |
| country | ✅ | ✅ | ❌ | ❌ | ❌ |
| application | ✅ | ✅ | ❌ | ❌ | ❌ |

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-06-29  
**Status**: Complete Analysis Based on API Testing and Documentation Review