# search_alarms Tool Documentation

## Overview

The `search_alarms` tool provides advanced security alarm searching with complex query syntax. This tool enables filtering and analysis of security alerts, intrusion attempts, and other network security events.

**CRITICAL**: This tool requires correct field syntax to function properly. Using incorrect field names will cause search failures.

## Tool Signature

```typescript
search_alarms(params: {
  query?: string;          // OPTIONAL: Search query using specific field syntax
  limit: number;           // REQUIRED: Maximum results (1-10000)
  time_range?: {           // OPTIONAL: Time filtering
    start: string;         // ISO 8601 format: "2024-01-01T00:00:00Z"
    end: string;           // ISO 8601 format: "2024-01-01T23:59:59Z"
  };
  sort_by?: string;        // OPTIONAL: Sort field and direction (default: "ts:desc")
})
```

## Supported Field Syntax

### Alarm Classification Fields

#### type
Filter by alarm type (1-16).
```
type:1                          # Intrusion Detection
type:2                          # Malware Detection
type:3                          # DDoS Attack
type:4                          # Large Upload
type:5                          # Video Streaming
type:6                          # Gaming Activity
type:7                          # Social Media
type:8                          # Porn Content
type:9                          # VPN Usage
type:10                         # New Device
type:11                         # Vulnerability
type:12                         # Intel Feed
type:13                         # DNS Hijack
type:14                         # Data Breach
type:15                         # Abnormal Traffic
type:16                         # Policy Violation
```

#### status
Filter by alarm status.
```
status:1                        # Active alarms only
status:2                        # Resolved/archived alarms only
```

#### severity
Filter by alarm severity level.
```
severity:low                    # Low severity alarms
severity:medium                 # Medium severity alarms
severity:high                   # High severity alarms
severity:critical               # Critical severity alarms
```

### Device-Related Fields

#### device.ip
Search by affected device IP address.
```
device.ip:192.168.1.100        # Specific device IP
device.ip:192.168.1.*          # IP range with wildcards
device.ip:10.0.*               # Broader IP range
```

#### device.name
Search by affected device name.
```
device.name:*William*          # Contains "William" (case-sensitive)
device.name:*iPhone*           # Contains "iPhone"
device.name:"Johns Laptop"     # Exact name with spaces
```

#### device.id
Search by device identifier.
```
device.id:mac:AA:BB:CC:DD:EE:FF # MAC address format
device.id:ovpn:profile_id       # OpenVPN client
```

### Network Context Fields

#### protocol
Filter by network protocol involved.
```
protocol:tcp                    # TCP-related alarms
protocol:udp                    # UDP-related alarms
protocol:icmp                   # ICMP-related alarms
```

#### direction
Filter by traffic direction.
```
direction:inbound               # External to internal traffic
direction:outbound              # Internal to external traffic
direction:local                 # Local network traffic
```

### Geographic Fields

#### region
Filter by geographic region (ISO 3166 country codes).
```
region:CN                       # China-originated threats
region:RU                       # Russia-originated threats
region:US                       # United States traffic
region:EU                       # European traffic
```

### Remote Host Fields

#### remote.ip
Filter by remote/external IP address.
```
remote.ip:203.0.113.1          # Specific remote IP
remote.ip:203.0.113.*          # Remote IP range
```

#### remote.name
Filter by remote hostname.
```
remote.name:*.malicious.com     # Suspicious domains
remote.name:example.com         # Specific domain
```

### Message Content Fields

#### message
Search within alarm message text.
```
message:*intrusion*             # Contains "intrusion"
message:*malware*               # Contains "malware"
message:"security threat"       # Exact phrase
```

### Time-based Fields

#### ts
Filter by alarm timestamp (use time_range parameter instead).
```
ts:>1641024000                  # After specific timestamp
ts:[1641024000 TO 1641110400]   # Timestamp range
```

## Alarm Type Reference

### Security Alarms (Types 1-4, 11-16)
```
type:1                          # Network intrusion attempts
type:2                          # Malicious software identified  
type:3                          # Distributed denial of service
type:4                          # Suspicious large data uploads
type:11                         # Security vulnerability detected
type:12                         # Threat intelligence match
type:13                         # DNS redirection detected
type:14                         # Potential data breach activity
type:15                         # Unusual traffic patterns
type:16                         # Security policy breach
```

### Activity Monitoring (Types 5-10)
```
type:5                          # High video streaming activity
type:6                          # Gaming protocol usage
type:7                          # Social media platform access
type:8                          # Adult content access
type:9                          # Virtual private network usage
type:10                         # Unrecognized device connected
```

## Logical Operators

### AND
Both conditions must be true.
```
type:1 AND status:1             # Active intrusion alarms
severity:high AND region:CN     # High severity from China
```

### OR
Either condition must be true.
```
type:1 OR type:2                # Intrusion or malware
severity:high OR severity:critical # High or critical severity
```

### NOT
Condition must not be true.
```
NOT status:2                    # Exclude resolved alarms
type:1 AND NOT region:US        # Non-US intrusion attempts
```

### Grouping with Parentheses
Control operator precedence.
```
(type:1 OR type:2) AND severity:high
(region:CN OR region:RU) AND status:1
```

## Comparison Operators

### Equality
```
type:1                          # Equals type 1
status:1                        # Equals active status
```

### Greater Than
```
type:>5                         # Alarm types above 5
ts:>1641024000                  # After timestamp
```

### Greater Than or Equal
```
type:>=10                       # Types 10 and above
severity:>=medium               # Medium severity or higher
```

### Less Than
```
type:<5                         # Alarm types below 5
ts:<1641024000                  # Before timestamp
```

### Less Than or Equal
```
type:<=10                       # Types 10 and below
```

### Range
```
type:[1 TO 4]                   # Security alarm types 1-4
ts:[1641024000 TO 1641110400]   # Timestamp range
```

## Common Usage Examples

### Active Security Threats
```json
{
  "query": "status:1 AND (type:1 OR type:2 OR type:11)",
  "limit": 100,
  "sort_by": "ts:desc"
}
```

### High Severity Unresolved Alarms
```json
{
  "query": "severity:high AND status:1",
  "limit": 50,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  }
}
```

### Device-Specific Investigation
```json
{
  "query": "device.name:*William* AND severity:>=medium",
  "limit": 75,
  "sort_by": "severity:desc"
}
```

### Geographic Threat Analysis
```json
{
  "query": "(region:CN OR region:RU OR region:IR) AND type:1",
  "limit": 200,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

### Malware Detection Review
```json
{
  "query": "type:2 AND status:1 AND device.ip:192.168.*",
  "limit": 100,
  "sort_by": "ts:desc"
}
```

### VPN Usage Monitoring
```json
{
  "query": "type:9 AND device.name:*",
  "limit": 50,
  "time_range": {
    "start": "2024-01-01T09:00:00Z",
    "end": "2024-01-01T17:00:00Z"
  }
}
```

### New Device Alerts
```json
{
  "query": "type:10 AND message:*new device*",
  "limit": 25,
  "sort_by": "ts:desc"
}
```

### Critical Policy Violations
```json
{
  "query": "type:16 AND severity:critical AND status:1",
  "limit": 30
}
```

## Error Prevention

### ❌ INCORRECT Field Syntax
These field names will cause failures:
```
source_ip:192.168.1.100         # Wrong: Use device.ip or remote.ip
destination_ip:93.184.216.34    # Wrong: Use remote.ip
alarm_type:1                    # Wrong: Use type
alarm_status:active             # Wrong: Use status with numbers
device_name:William             # Wrong: Use device.name
severity_level:high             # Wrong: Use severity
```

### ✅ CORRECT Field Syntax
Use these verified field names:
```
device.ip:192.168.1.100         # Correct: Affected device IP
remote.ip:93.184.216.34         # Correct: Remote/external IP
type:1                          # Correct: Alarm type number
status:1                        # Correct: Status number (1=active, 2=resolved)
device.name:*William*           # Correct: Device name with wildcards
severity:high                   # Correct: Severity text level
```

### Parameter Requirements
```json
{
  "query": "OPTIONAL - Can be omitted to get all alarms",
  "limit": "REQUIRED - Must be 1-10000",
  "time_range": "OPTIONAL - Both start and end required if used",
  "sort_by": "OPTIONAL - Must be valid field:direction format"
}
```

### Status Values
```
status:1                        # Active/unresolved alarms
status:2                        # Resolved/archived alarms
```

### Severity Levels
```
severity:low                    # Low priority alerts
severity:medium                 # Medium priority alerts  
severity:high                   # High priority alerts
severity:critical               # Critical security events
```

## Sort Options

### Available Sort Fields
```
ts:desc                         # Timestamp descending (default)
ts:asc                          # Timestamp ascending
severity:desc                   # Severity descending (critical first)
severity:asc                    # Severity ascending (low first)
type:desc                       # Alarm type descending
type:asc                        # Alarm type ascending
```

### Sort by Severity Priority
```json
{
  "sort_by": "severity:desc"     # Critical, high, medium, low
}
```

## Time Range Best Practices

### Recent Alarms (Last 24 Hours)
```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  }
}
```

### Weekly Security Review
```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  }
}
```

### Business Hours Analysis
```json
{
  "time_range": {
    "start": "2024-01-01T09:00:00Z",
    "end": "2024-01-01T17:00:00Z"
  }
}
```

## Performance Considerations

### Efficient Queries
- Filter by status first for active alarms
- Use device.ip filters when investigating specific devices
- Limit time ranges for better performance
- Use appropriate limits (typically 50-200 for alarms)

### Query Optimization Tips
```
status:1 AND type:1             # Good: Status filter first
type:1 AND device.ip:192.168.1.100 # Good: Specific device
device.name:* AND type:*        # Poor: Too broad, will be slow
```

### Recommended Limits
```
Security review: limit: 50
Investigation: limit: 100
Comprehensive audit: limit: 500
Historical analysis: limit: 1000
```

## API Integration

### Error Handling
```json
{
  "error": true,
  "message": "Query validation failed: Unknown field 'alarm_type'. Did you mean 'type'?",
  "tool": "search_alarms",
  "validation_errors": ["Invalid field name in query"]
}
```

### Success Response Format
```json
{
  "count": 42,
  "results": [
    {
      "ts": 1641024000,
      "gid": "box-id-here",
      "aid": 12345,
      "type": 1,
      "status": 1,
      "severity": "high",
      "message": "Network intrusion attempt detected",
      "direction": "inbound",
      "protocol": "tcp",
      "device": {
        "id": "mac:AA:BB:CC:DD:EE:FF",
        "ip": "192.168.1.100",
        "name": "Williams iPhone"
      },
      "remote": {
        "ip": "203.0.113.1",
        "name": "suspicious.example.com"
      }
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

## Field Reference Quick Guide

| Category | Field Name | Example Usage | Data Type |
|----------|------------|---------------|-----------|
| Classification | `type` | `type:1` | Number (1-16) |
| Classification | `status` | `status:1` | Number (1-2) |
| Classification | `severity` | `severity:high` | String |
| Device | `device.ip` | `device.ip:192.168.1.*` | String |
| Device | `device.name` | `device.name:*William*` | String |
| Device | `device.id` | `device.id:mac:AA:BB:CC:DD:EE:FF` | String |
| Network | `protocol` | `protocol:tcp` | String |
| Network | `direction` | `direction:inbound` | String |
| Location | `region` | `region:CN` | String |
| Remote | `remote.ip` | `remote.ip:203.0.113.*` | String |
| Remote | `remote.name` | `remote.name:*.malicious.com` | String |
| Content | `message` | `message:*intrusion*` | String |
| Time | `ts` | `ts:>1641024000` | Number |

## Security Investigation Workflows

### 1. Active Threat Assessment
```json
{
  "query": "status:1 AND severity:>=high",
  "limit": 100,
  "sort_by": "severity:desc"
}
```

### 2. Device Compromise Investigation
```json
{
  "query": "device.ip:192.168.1.100 AND (type:1 OR type:2)",
  "limit": 50,
  "sort_by": "ts:desc"
}
```

### 3. Geographic Threat Analysis
```json
{
  "query": "(region:CN OR region:RU) AND type:1 AND status:1",
  "limit": 200,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

### 4. Policy Violation Review
```json
{
  "query": "type:16 AND device.name:*",
  "limit": 75,
  "sort_by": "ts:desc"
}
```

This comprehensive guide ensures correct usage of the search_alarms tool and prevents field syntax errors commonly encountered with security alert searches.