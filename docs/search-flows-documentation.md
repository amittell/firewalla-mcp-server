# search_flows Tool Documentation

## Overview

The `search_flows` tool provides advanced network flow searching with complex query syntax. This tool enables filtering and analysis of network traffic flows with precise field-based queries.

**CRITICAL**: This tool requires correct field syntax to function properly. Common field naming errors (like using `source_ip` instead of `device.ip`) will cause failures.

## Tool Signature

```typescript
search_flows(params: {
  query: string;           // REQUIRED: Search query using specific field syntax
  limit: number;           // REQUIRED: Maximum results (1-10000)
  time_range?: {           // OPTIONAL: Time filtering
    start: string;         // ISO 8601 format: "2024-01-01T00:00:00Z"
    end: string;           // ISO 8601 format: "2024-01-01T23:59:59Z"
  };
  sort_by?: string;        // OPTIONAL: Sort field and direction (default: "ts:desc")
})
```

## Supported Field Syntax

### Device Fields (Most Common)

#### device_ip
Search by device IP address.
```
device_ip:192.168.1.100          # Exact IP match
device_ip:192.168.1.*            # IP range with wildcards
```

#### device.name  
Search by device name (supports wildcards).
```
device.name:*William*            # Contains "William" (case-sensitive)
device.name:*laptop*             # Contains "laptop" 
device.name:"Johns iPhone"       # Exact name with spaces
```

#### device.id
Search by device identifier.
```
device.id:mac:AA:BB:CC:DD:EE:FF  # MAC address format
device.id:ovpn:profile_id        # OpenVPN client
device.id:wg_peer:profile_id     # WireGuard client
```

### Network Protocol Fields

#### protocol
Filter by network protocol.
```
protocol:tcp                     # TCP traffic only
protocol:udp                     # UDP traffic only
```

#### direction
Filter by traffic direction.
```
direction:inbound                # Incoming traffic
direction:outbound               # Outgoing traffic
direction:local                  # Local network traffic
```

### Traffic Classification Fields

#### block
Filter by blocking status.
```
block:true                       # Blocked traffic only
block:false                      # Allowed traffic only
```

#### category
Filter by content category.
```
category:video                   # Video streaming
category:games                   # Gaming traffic
category:social                  # Social media
category:porn                    # Adult content
category:vpn                     # VPN traffic
category:ad                      # Advertisement traffic
```

### Data Volume Fields

#### bytes
Filter by total bytes transferred.
```
bytes:>1000000                   # More than 1MB
bytes:>=50000000                 # 50MB or larger
bytes:[1000000 TO 10000000]      # Between 1MB and 10MB
```

#### download
Filter by bytes downloaded.
```
download:>5000000                # More than 5MB downloaded
download:>=100000000             # 100MB or more downloaded
```

#### upload
Filter by bytes uploaded.
```
upload:>1000000                  # More than 1MB uploaded
upload:>=10000000                # 10MB or more uploaded
```

### Geographic Fields

#### region
Filter by country code (ISO 3166 format).
```
region:US                        # United States traffic
region:CN                        # China traffic
region:EU                        # European traffic
```

### Host Information Fields

#### source_ip
Filter by source IP address.
```
source_ip:203.0.113.1           # Specific source IP
source_ip:203.0.113.*           # Source IP range
```

#### destination_ip
Filter by destination IP address.
```
destination_ip:93.184.216.34    # Specific destination
destination_ip:93.184.216.*     # Destination range
```

#### destination.name
Filter by destination hostname.
```
destination.name:facebook.com    # Specific domain
destination.name:*.facebook.com  # Domain and subdomains
```

### Time-based Fields

#### duration
Filter by flow duration in seconds.
```
duration:>300                    # Flows longer than 5 minutes
duration:[60 TO 600]             # Between 1-10 minutes
```

#### count
Filter by connection/session count.
```
count:>10                        # More than 10 connections
count:[5 TO 50]                  # Between 5-50 connections
```

## Logical Operators

### AND
Both conditions must be true.
```
protocol:tcp AND bytes:>1000000
device.name:*William* AND category:games
```

### OR
Either condition must be true.
```
category:video OR category:games
block:true OR region:CN
```

### NOT
Condition must not be true.
```
NOT block:true                   # Only unblocked traffic
protocol:tcp AND NOT category:ad # TCP traffic, excluding ads
```

### Grouping with Parentheses
Control operator precedence.
```
(category:video OR category:games) AND device.name:*William*
protocol:tcp AND (region:CN OR region:RU) AND bytes:>1000000
```

## Comparison Operators

### Equality
```
protocol:tcp                     # Equals "tcp"
block:true                       # Equals true
```

### Greater Than
```
bytes:>1000000                   # More than 1MB
duration:>300                    # Longer than 5 minutes
```

### Greater Than or Equal
```
bytes:>=1000000                  # 1MB or larger
count:>=5                        # 5 or more connections
```

### Less Than
```
bytes:<1000                      # Less than 1KB
duration:<60                     # Shorter than 1 minute
```

### Less Than or Equal
```
bytes:<=50000                    # 50KB or smaller
count:<=10                       # 10 or fewer connections
```

### Range
```
bytes:[1000 TO 50000]           # Between 1KB and 50KB
duration:[60 TO 300]            # Between 1-5 minutes
```

## Wildcard Patterns

### Asterisk (*)
Matches any characters.
```
device.name:*William*           # Contains "William"
destination.name:*.facebook.com # Facebook subdomains
device.ip:192.168.*             # IP range matching
```

### Quoted Strings
Exact phrase matching.
```
device.name:"Johns iPhone"      # Exact name with spaces
destination.name:"api.example.com" # Exact domain
```

## Common Usage Examples

### Find Device Activity
```json
{
  "query": "device.name:*William* OR device.name:*william*",
  "limit": 200,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  }
}
```

### High Bandwidth Usage
```json
{
  "query": "bytes:>50000000 AND protocol:tcp",
  "limit": 100,
  "sort_by": "bytes:desc"
}
```

### Blocked Traffic Analysis
```json
{
  "query": "blocked:true AND (region:CN OR region:RU)",
  "limit": 150,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  }
}
```

### Gaming Activity Detection
```json
{
  "query": "category:games AND device.ip:192.168.1.*",
  "limit": 50,
  "sort_by": "bytes:desc"
}
```

### Video Streaming Analysis
```json
{
  "query": "category:video AND bytes:>100000000",
  "limit": 75,
  "time_range": {
    "start": "2024-01-01T18:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  }
}
```

### Security Investigation
```json
{
  "query": "(category:vpn OR region:CN) AND bytes:>10000000",
  "limit": 100,
  "sort_by": "ts:desc"
}
```

## Error Prevention

### ❌ INCORRECT Field Syntax
These field names will cause failures:
```
device.ip:192.168.1.100         # Wrong: Use device_ip (underscore)
device_name:William             # Wrong: Use device.name (dot notation for this field)
mac_vendor:Apple                # Wrong: Not available in flows
bytes_downloaded:1000000        # Wrong: Use download or bytes
```

### ✅ CORRECT Field Syntax
Use these verified field names:
```
device_ip:192.168.1.100         # Correct: Device IP address (underscore)
source_ip:203.0.113.1           # Correct: Source IP address
destination_ip:93.184.216.34    # Correct: Destination IP address
device.name:*William*           # Correct: Device name with wildcards
protocol:tcp                    # Correct: Network protocol
```

### Parameter Requirements
```json
{
  "query": "REQUIRED - Cannot be empty string",
  "limit": "REQUIRED - Must be 1-10000",
  "time_range": "OPTIONAL - Both start and end required if used",
  "sort_by": "OPTIONAL - Must be valid field:direction format"
}
```

### Time Range Format
```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",  // ISO 8601 with Z suffix
    "end": "2024-01-01T23:59:59Z"     // End must be after start
  }
}
```

## Sort Options

### Available Sort Fields
```
ts:desc                         # Timestamp descending (default)
ts:asc                          # Timestamp ascending
bytes:desc                      # Total bytes descending
bytes:asc                       # Total bytes ascending
download:desc                   # Downloaded bytes descending
upload:desc                     # Uploaded bytes descending
duration:desc                   # Duration descending
count:desc                      # Connection count descending
```

### Sort Syntax
```json
{
  "sort_by": "bytes:desc"        // Field name + colon + direction
}
```

## Performance Considerations

### Efficient Queries
- Use specific device filters when possible
- Limit time ranges for large datasets
- Use appropriate limit values (typically 100-1000)

### Query Optimization Tips
```
device.ip:192.168.1.100 AND category:games    # Good: Specific device first
category:games AND device.ip:192.168.1.100    # Also good: Either order works
device.name:* AND category:*                  # Poor: Too broad, slow
```

### Recommended Limits
```
Quick analysis: limit: 100
Detailed investigation: limit: 500
Comprehensive audit: limit: 1000
Bulk processing: limit: 5000 (max)
```

## API Integration

### Error Handling
The tool returns standardized errors for common mistakes:
```json
{
  "error": true,
  "message": "Query validation failed: Unknown field 'source_ip'. Did you mean 'source.ip' or 'device.ip'?",
  "tool": "search_flows",
  "validation_errors": ["Invalid field name in query"]
}
```

### Success Response Format
```json
{
  "count": 150,
  "results": [
    {
      "ts": 1641024000,
      "gid": "box-id-here",
      "protocol": "tcp",
      "direction": "outbound",
      "block": false,
      "bytes": 5242880,
      "device": {
        "id": "mac:AA:BB:CC:DD:EE:FF",
        "ip": "192.168.1.100",
        "name": "Williams iPhone"
      },
      "destination": {
        "name": "facebook.com",
        "ip": "157.240.1.35"
      },
      "category": "social"
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

## Field Reference Quick Guide

| Category | Field Name | Example Usage | Data Type |
|----------|------------|---------------|-----------|
| Device | `device_ip` | `device_ip:192.168.1.*` | String |
| Device | `device.name` | `device.name:*William*` | String |
| Device | `device.id` | `device.id:mac:AA:BB:CC:DD:EE:FF` | String |
| Protocol | `protocol` | `protocol:tcp` | String |
| Protocol | `direction` | `direction:outbound` | String |
| Traffic | `blocked` | `blocked:true` | Boolean |
| Traffic | `category` | `category:video` | String |
| Volume | `bytes` | `bytes:>1000000` | Number |
| Volume | `download` | `download:>=50000000` | Number |
| Volume | `upload` | `upload:>1000000` | Number |
| Location | `region` | `region:US` | String |
| Host | `source_ip` | `source_ip:203.0.113.*` | String |
| Host | `destination_ip` | `destination_ip:93.184.216.34` | String |
| Host | `destination.name` | `destination.name:*.facebook.com` | String |
| Time | `duration` | `duration:>300` | Number |
| Time | `count` | `count:[5 TO 50]` | Number |

This comprehensive guide ensures correct usage of the search_flows tool and prevents the field syntax errors that commonly occur with AI models.