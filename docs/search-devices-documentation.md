# search_devices Tool Documentation

## Overview

The `search_devices` tool provides advanced device searching with complex query syntax. This tool enables filtering and analysis of network devices, their status, bandwidth usage, and network configuration.

**CRITICAL**: This tool requires correct field syntax to function properly. Using incorrect field names will cause search failures.

## Tool Signature

```typescript
search_devices(params: {
  query?: string;          // OPTIONAL: Search query using specific field syntax
  limit: number;           // REQUIRED: Maximum results (1-10000)
  time_range?: {           // OPTIONAL: Time filtering for bandwidth data
    start: string;         // ISO 8601 format: "2024-01-01T00:00:00Z"
    end: string;           // ISO 8601 format: "2024-01-01T23:59:59Z"
  };
  sort_by?: string;        // OPTIONAL: Sort field and direction (default: "lastSeen:desc")
})
```

## Supported Field Syntax

### Device Identity Fields

#### name
Search by device name (supports wildcards).
```
name:*William*                  # Contains "William" (case-sensitive)
name:*iPhone*                   # Contains "iPhone"
name:*laptop*                   # Contains "laptop"
name:"Johns MacBook"            # Exact name with spaces
name:Williams*                  # Starts with "Williams"
```

#### ip
Search by device IP address.
```
ip:192.168.1.100               # Specific IP address
ip:192.168.1.*                 # IP range with wildcards
ip:10.0.0.*                    # Different subnet range
ip:192.168.*                   # Broader IP range
```

#### mac
Search by MAC address.
```
mac:AA:BB:CC:DD:EE:FF          # Full MAC address
mac:AA:BB:CC:*                 # MAC prefix matching
```

#### id
Search by device identifier.
```
id:mac:AA:BB:CC:DD:EE:FF       # MAC-based device ID
id:ovpn:profile_name           # OpenVPN client
id:wg_peer:profile_name        # WireGuard client
```

### Device Characteristics

#### mac_vendor
Search by manufacturer/vendor name.
```
mac_vendor:Apple                # Apple devices
mac_vendor:Samsung              # Samsung devices
mac_vendor:Dell                 # Dell devices
mac_vendor:"Cisco Systems"      # Vendor with spaces
mac_vendor:*Intel*              # Contains "Intel"
```

### Connectivity Status

#### online
Filter by device connectivity status.
```
online:true                    # Currently connected devices
online:false                   # Offline/disconnected devices
```

#### ipReserved
Filter by IP reservation status.
```
ipReserved:true                # Devices with reserved IPs
ipReserved:false               # Devices with dynamic IPs
```

### Network Context

#### network_name
Search by network name.
```
network_name:*main*            # Network containing "main"
network_name:"Guest Network"   # Specific network name
network_name:*wifi*            # Networks containing "wifi"
```

#### network.id
Search by network identifier.
```
network.id:network_123         # Specific network ID
```

### Device Groups

#### group_name
Search by device group name.
```
group_name:Kids                # Devices in "Kids" group
group_name:"Home Office"       # Group with spaces
group_name:*Family*            # Groups containing "Family"
```

#### group.id
Search by group identifier.
```
group.id:group_456            # Specific group ID
```

### Bandwidth Usage Fields

#### total_download
Filter by total downloaded bytes (24-hour period).
```
total_download:>1000000000      # More than 1GB downloaded
total_download:>=5000000000     # 5GB or more downloaded
total_download:[1000000 TO 1000000000] # Between 1MB-1GB
```

#### total_upload
Filter by total uploaded bytes (24-hour period).
```
total_upload:>500000000         # More than 500MB uploaded
total_upload:>=1000000000       # 1GB or more uploaded
total_upload:[100000 TO 500000000] # Between 100KB-500MB
```

### Time-based Fields

#### lastSeen
Filter by last seen timestamp.
```
lastSeen:>1641024000          # Last seen after timestamp
lastSeen:[1641024000 TO 1641110400] # Last seen in range
```

### Box Association

#### gid
Filter by Firewalla box identifier.
```
gid:00000000-0000-0000-0000-000000000000 # Specific box
```

## Logical Operators

### AND
Both conditions must be true.
```
online:true AND macVendor:Apple
name:*William* AND totalDownload:>1000000000
```

### OR
Either condition must be true.
```
macVendor:Apple OR macVendor:Samsung
online:false OR lastSeen:<1641024000
```

### NOT
Condition must not be true.
```
NOT online:false               # Only online devices
macVendor:Apple AND NOT ipReserved:true
```

### Grouping with Parentheses
Control operator precedence.
```
(macVendor:Apple OR macVendor:Samsung) AND online:true
name:*William* AND (totalDownload:>1000000000 OR totalUpload:>500000000)
```

## Comparison Operators

### Equality
```
online:true                    # Equals true
macVendor:Apple                # Equals "Apple"
```

### Greater Than
```
totalDownload:>1000000000      # More than 1GB
lastSeen:>1641024000           # After timestamp
```

### Greater Than or Equal
```
totalDownload:>=5000000000     # 5GB or larger
```

### Less Than
```
totalDownload:<1000000         # Less than 1MB
lastSeen:<1641024000           # Before timestamp
```

### Less Than or Equal
```
totalUpload:<=100000000        # 100MB or smaller
```

### Range
```
totalDownload:[1000000 TO 1000000000] # Between 1MB-1GB
lastSeen:[1641024000 TO 1641110400]   # Time range
```

## Common Usage Examples

### Find Specific User's Devices
```json
{
  "query": "name:*William* OR name:*william*",
  "limit": 20,
  "sort_by": "lastSeen:desc"
}
```

### High Bandwidth Users
```json
{
  "query": "totalDownload:>5000000000 OR totalUpload:>1000000000",
  "limit": 25,
  "sort_by": "totalDownload:desc"
}
```

### Offline Apple Devices
```json
{
  "query": "online:false AND macVendor:Apple",
  "limit": 50,
  "sort_by": "lastSeen:desc"
}
```

### Guest Network Devices
```json
{
  "query": "network.name:*Guest* OR network.name:*guest*",
  "limit": 100,
  "sort_by": "name:asc"
}
```

### Devices with Reserved IPs
```json
{
  "query": "ipReserved:true",
  "limit": 50,
  "sort_by": "ip:asc"
}
```

### Recently Active Devices
```json
{
  "query": "online:true AND lastSeen:>1641024000",
  "limit": 100,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  }
}
```

### Mobile Devices Investigation
```json
{
  "query": "(name:*iPhone* OR name:*iPad* OR name:*Android*) AND online:true",
  "limit": 75,
  "sort_by": "totalDownload:desc"
}
```

### Home Office Devices
```json
{
  "query": "group.name:*Office* AND online:true",
  "limit": 30,
  "sort_by": "totalDownload:desc"
}
```

### Gaming Devices Analysis
```json
{
  "query": "(name:*Xbox* OR name:*PlayStation* OR name:*Nintendo*) AND totalDownload:>1000000000",
  "limit": 20
}
```

### IoT Device Discovery
```json
{
  "query": "(macVendor:*Nest* OR macVendor:*Ring* OR macVendor:*Philips* OR name:*Echo*) AND online:true",
  "limit": 50
}
```

## Error Prevention

### ❌ INCORRECT Field Syntax
These field names will cause failures:
```
device_name:William            # Wrong: Use name
macVendor:Apple                # Wrong: Use mac_vendor (underscore)
ip_address:192.168.1.100       # Wrong: Use ip
is_online:true                 # Wrong: Use online
bandwidth:>1000000             # Wrong: Use total_download or total_upload
last_seen:1641024000           # Wrong: Use lastSeen
totalDownload:>1000000000      # Wrong: Use total_download (underscore)
```

### ✅ CORRECT Field Syntax
Use these verified field names:
```
name:*William*                 # Correct: Device name with wildcards
mac_vendor:Apple               # Correct: MAC vendor (underscore)
ip:192.168.1.100               # Correct: IP address
online:true                    # Correct: Online status
network_name:*main*            # Correct: Network name (underscore)
total_download:>1000000000     # Correct: Downloaded bytes (underscore)
lastSeen:>1641024000           # Correct: Last seen timestamp (camelCase)
```

### Parameter Requirements
```json
{
  "query": "OPTIONAL - Can be omitted to get all devices",
  "limit": "REQUIRED - Must be 1-10000", 
  "time_range": "OPTIONAL - Both start and end required if used",
  "sort_by": "OPTIONAL - Must be valid field:direction format"
}
```

### Boolean Values
```
online:true                    # Device is connected
online:false                   # Device is disconnected
ipReserved:true                # IP is reserved
ipReserved:false               # IP is dynamic
```

## Sort Options

### Available Sort Fields
```
lastSeen:desc                  # Last seen descending (default)
lastSeen:asc                   # Last seen ascending
name:asc                       # Device name alphabetical
name:desc                      # Device name reverse alphabetical
ip:asc                         # IP address ascending
ip:desc                        # IP address descending
totalDownload:desc             # Downloaded bytes descending
totalDownload:asc              # Downloaded bytes ascending
totalUpload:desc               # Uploaded bytes descending
totalUpload:asc                # Uploaded bytes ascending
```

### Sort Examples
```json
{
  "sort_by": "totalDownload:desc"  # Highest bandwidth users first
}
```

```json
{
  "sort_by": "name:asc"           # Alphabetical by device name
}
```

## Device Categories and Use Cases

### Personal Devices
```json
{
  "query": "(name:*iPhone* OR name:*Samsung* OR name:*Pixel*) AND online:true",
  "limit": 50
}
```

### Network Infrastructure
```json
{
  "query": "(macVendor:*Cisco* OR macVendor:*Netgear* OR macVendor:*Linksys*) AND online:true",
  "limit": 25
}
```

### Smart Home Devices
```json
{
  "query": "(macVendor:*Nest* OR name:*Alexa* OR name:*Echo* OR macVendor:*Philips*)",
  "limit": 40
}
```

### Work Devices
```json
{
  "query": "(name:*laptop* OR name:*desktop* OR macVendor:Dell) AND group.name:*Work*",
  "limit": 30
}
```

## Performance Considerations

### Efficient Queries
- Use online status filters when looking for active devices
- Filter by macVendor for manufacturer-specific searches
- Use specific IP ranges when possible
- Limit bandwidth queries to reasonable thresholds

### Query Optimization Tips
```
online:true AND macVendor:Apple      # Good: Status filter first
name:*William* AND online:true       # Good: Specific name search
name:* AND totalDownload:*           # Poor: Too broad, will be slow
macVendor:*                          # Poor: Wildcard on vendor
```

### Recommended Limits
```
Device inventory: limit: 100
User investigation: limit: 50
Bandwidth analysis: limit: 25
Troubleshooting: limit: 20
```

## Bandwidth Analysis Patterns

### Top Bandwidth Consumers
```json
{
  "query": "online:true",
  "limit": 20,
  "sort_by": "totalDownload:desc"
}
```

### Excessive Upload Detection
```json
{
  "query": "totalUpload:>1000000000 AND online:true",
  "limit": 10,
  "sort_by": "totalUpload:desc"
}
```

### Inactive High-Usage Devices
```json
{
  "query": "online:false AND (totalDownload:>5000000000 OR totalUpload:>1000000000)",
  "limit": 15
}
```

## Network Troubleshooting

### Offline Device Investigation
```json
{
  "query": "online:false",
  "limit": 50,
  "sort_by": "lastSeen:desc"
}
```

### IP Conflicts Detection
```json
{
  "query": "ip:192.168.1.100",
  "limit": 10
}
```

### Network Segmentation Analysis
```json
{
  "query": "network.name:*Guest*",
  "limit": 100,
  "sort_by": "name:asc"
}
```

## API Integration

### Error Handling
```json
{
  "error": true,
  "message": "Query validation failed: Unknown field 'device_name'. Did you mean 'name'?",
  "tool": "search_devices",
  "validation_errors": ["Invalid field name in query"]
}
```

### Success Response Format
```json
{
  "count": 25,
  "results": [
    {
      "id": "mac:AA:BB:CC:DD:EE:FF",
      "gid": "box-id-here", 
      "name": "Williams iPhone",
      "ip": "192.168.1.100",
      "mac": "AA:BB:CC:DD:EE:FF",
      "macVendor": "Apple Inc.",
      "online": true,
      "lastSeen": 1641024000,
      "ipReserved": false,
      "network": {
        "id": "network_123",
        "name": "Home Network"
      },
      "group": {
        "id": "group_456", 
        "name": "Family"
      },
      "totalDownload": 2147483648,
      "totalUpload": 524288000
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

## Field Reference Quick Guide

| Category | Field Name | Example Usage | Data Type |
|----------|------------|---------------|-----------|
| Identity | `name` | `name:*William*` | String |
| Identity | `ip` | `ip:192.168.1.*` | String |
| Identity | `mac` | `mac:AA:BB:CC:DD:EE:FF` | String |
| Identity | `id` | `id:mac:AA:BB:CC:DD:EE:FF` | String |
| Hardware | `mac_vendor` | `mac_vendor:Apple` | String |
| Status | `online` | `online:true` | Boolean |
| Status | `ipReserved` | `ipReserved:true` | Boolean |
| Network | `network_name` | `network_name:*main*` | String |
| Network | `network.id` | `network.id:network_123` | String |
| Groups | `group_name` | `group_name:Kids` | String |
| Groups | `group.id` | `group.id:group_456` | String |
| Usage | `total_download` | `total_download:>1000000000` | Number |
| Usage | `total_upload` | `total_upload:>500000000` | Number |
| Time | `lastSeen` | `lastSeen:>1641024000` | Number |
| Box | `gid` | `gid:box-uuid-here` | String |

## Device Investigation Workflows

### 1. User Device Analysis
```json
{
  "query": "name:*William*",
  "limit": 10,
  "sort_by": "lastSeen:desc"
}
```

### 2. Bandwidth Investigation
```json
{
  "query": "totalDownload:>5000000000",
  "limit": 20,
  "sort_by": "totalDownload:desc"
}
```

### 3. Network Health Check
```json
{
  "query": "online:false",
  "limit": 50,
  "sort_by": "lastSeen:desc"
}
```

### 4. Device Type Analysis
```json
{
  "query": "macVendor:Apple AND online:true",
  "limit": 30,
  "sort_by": "totalDownload:desc"
}
```

This comprehensive guide ensures correct usage of the search_devices tool and prevents field syntax errors commonly encountered with device searches.