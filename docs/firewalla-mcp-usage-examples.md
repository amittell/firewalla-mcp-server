# Firewalla MCP Tools Usage Examples Library

A comprehensive collection of practical examples for all 32 Firewalla MCP tools, organized by complexity level and use case. Models can reference and copy these examples directly.

## Table of Contents

1. [Low Complexity Tools (8 tools)](#low-complexity-tools) - Simple Operations
2. [Medium Complexity Tools (13 tools)](#medium-complexity-tools) - Analytics/Network/Rules
3. [High Complexity Tools (11 tools)](#high-complexity-tools) - Advanced Search
4. [Field Reference Guide](#field-reference-guide)
5. [Common Patterns & Best Practices](#common-patterns--best-practices)

---

## Low Complexity Tools

These tools require minimal parameters and are ideal for basic queries.

### get_boxes
Get information about all Firewalla boxes.

```json
{}
```

**Use Cases:**
- Check box status and configuration
- Verify connectivity to Firewalla network
- Get box identifiers for other operations

---

### get_simple_statistics
Get basic network statistics.

```json
{}
```

**Use Cases:**
- Quick network overview
- Dashboard summary information
- Health check data

---

### get_specific_alarm
Get detailed information about a specific alarm.

```json
{
  "alarm_id": "12345"
}
```

**Real-world scenarios:**
```json
// Investigate a specific security alert
{
  "alarm_id": "67890"
}

// Follow up on a malware detection
{
  "alarm_id": "54321"
}
```

---

### delete_alarm
Remove a specific alarm from the system.

```json
{
  "alarm_id": "12345"
}
```

**Real-world scenarios:**
```json
// Clear false positive alarm
{
  "alarm_id": "78901"
}

// Remove resolved security alert
{
  "alarm_id": "23456"
}
```

---

### pause_rule
Temporarily disable a firewall rule.

```json
{
  "rule_id": "rule_abc123"
}
```

**Real-world scenarios:**
```json
// Temporarily allow access for troubleshooting
{
  "rule_id": "social_media_block"
}

// Pause gaming restrictions for special occasion
{
  "rule_id": "gaming_time_limit"
}
```

---

### resume_rule
Re-enable a paused firewall rule.

```json
{
  "rule_id": "rule_abc123"
}
```

**Real-world scenarios:**
```json
// Re-enable social media blocking after troubleshooting
{
  "rule_id": "social_media_block"
}

// Restore gaming time limits
{
  "rule_id": "gaming_time_limit"
}
```

---

### get_network_rules_summary
Get a summary of all network rules.

```json
{
  "limit": 50
}
```

**Use Cases:**
- Overview of firewall configuration
- Quick rule count and status check
- Preparation for detailed rule management

---

### get_target_lists
Get information about security target lists.

```json
{
  "limit": 100
}
```

**Use Cases:**
- Review blocked domain lists
- Check custom security lists
- Audit target list configuration

---

## Medium Complexity Tools

These tools require specific parameters and time ranges for analytics, network monitoring, and rule management.

### Analytics Tools

#### get_statistics_by_region
Get network statistics grouped by geographic region.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Monthly regional traffic analysis
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "limit": 25
}

// Weekly geographic security overview
{
  "time_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-22T00:00:00Z"
  },
  "limit": 15
}
```

---

#### get_statistics_by_box
Get statistics for a specific Firewalla box.

```json
{
  "box_id": "00000000-0000-0000-0000-000000000000",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 100
}
```

---

#### get_flow_trends
Analyze network flow patterns over time.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "interval": "hour",
  "limit": 168
}
```

**Real-world scenarios:**
```json
// Daily traffic patterns for capacity planning
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "interval": "day",
  "limit": 31
}

// Hourly analysis for peak usage identification
{
  "time_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-16T23:59:59Z"
  },
  "interval": "hour",
  "limit": 48
}
```

---

#### get_alarm_trends
Track security alarm patterns over time.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "interval": "day",
  "limit": 31
}
```

**Real-world scenarios:**
```json
// Weekly security trend analysis
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "interval": "day",
  "limit": 7
}

// Monthly threat landscape overview
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "interval": "week",
  "limit": 5
}
```

---

#### get_rule_trends
Analyze firewall rule usage patterns.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "interval": "day",
  "limit": 31
}
```

**Use Cases:**
- Rule effectiveness analysis
- Usage pattern identification
- Optimization opportunities

---

### Network Tools

#### get_flow_data
Get detailed network flow information.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 1000
}
```

**Real-world scenarios:**
```json
// Investigate high bandwidth usage
{
  "time_range": {
    "start": "2024-01-01T09:00:00Z",
    "end": "2024-01-01T17:00:00Z"
  },
  "limit": 500
}

// Analyze weekend traffic patterns
{
  "time_range": {
    "start": "2024-01-06T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 1500
}
```

---

#### get_bandwidth_usage
Get bandwidth usage statistics by device.

```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Find top bandwidth consumers this week
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 20
}

// Daily usage analysis for specific device troubleshooting
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 10
}
```

---

#### get_offline_devices
Find devices that are currently offline.

```json
{
  "limit": 100
}
```

**Use Cases:**
- Network troubleshooting
- Device inventory management
- Connectivity issue identification

---

### Rule Management Tools

#### get_network_rules
Get comprehensive firewall rule information.

```json
{
  "limit": 200
}
```

**Real-world scenarios:**
```json
// Review all active rules for audit
{
  "limit": 500
}

// Get recent rule changes for troubleshooting
{
  "limit": 50
}
```

---

#### get_most_active_rules
Find rules with the highest usage.

```json
{
  "limit": 25
}
```

**Use Cases:**
- Rule optimization analysis
- Performance impact assessment
- Usage pattern identification

---

#### get_recent_rules
Get recently created or modified rules.

```json
{
  "limit": 50
}
```

**Use Cases:**
- Track recent configuration changes
- Audit new rule additions
- Troubleshoot recent policy updates

---

### Device Management

#### get_device_status
Get comprehensive device information and status.

```json
{
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Full network device inventory
{
  "limit": 200
}

// Quick device status check
{
  "limit": 50
}
```

---

### Security Tools

#### get_active_alarms
Get current security alarms and alerts.

```json
{
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Daily security review
{
  "limit": 50
}

// Comprehensive threat analysis
{
  "limit": 200
}
```

---

## High Complexity Tools

Advanced search tools with complex query syntax and correlation capabilities.

### Basic Search Tools

#### search_flows
Advanced network flow searching with complex query syntax.

```json
{
  "query": "protocol:tcp AND bytes:>1000000",
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Find large TCP transfers
{
  "query": "protocol:tcp AND bytes:>10000000",
  "limit": 50
}

// Look for blocked traffic from specific device
{
  "query": "device.ip:192.168.1.100 AND block:true",
  "limit": 100
}

// Find streaming activity
{
  "query": "category:video AND bytes:>50000000",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 25
}

// Investigate William's device activity
{
  "query": "device.name:*William* OR device.name:*william*",
  "limit": 200
}

// Find gaming traffic during work hours
{
  "query": "category:games",
  "time_range": {
    "start": "2024-01-01T09:00:00Z",
    "end": "2024-01-01T17:00:00Z"
  },
  "limit": 100
}
```

---

#### search_alarms
Search security alarms with advanced filtering.

```json
{
  "query": "severity:high AND status:1",
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Find critical unresolved alarms
{
  "query": "severity:critical AND status:1",
  "limit": 25
}

// Look for malware detections
{
  "query": "type:2 AND device.ip:192.168.1.*",
  "limit": 100
}

// Investigate intrusion attempts from specific country
{
  "query": "type:1 AND region:CN",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 50
}

// Find VPN usage alarms
{
  "query": "type:9",
  "limit": 30
}

// Search for new device alerts
{
  "query": "type:10 AND message:*new device*",
  "limit": 20
}
```

---

#### search_rules
Search firewall rules with complex criteria.

```json
{
  "query": "action:block AND target.value:*facebook*",
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Find all social media blocking rules
{
  "query": "action:block AND (target.value:*facebook* OR target.value:*twitter* OR target.value:*instagram*)",
  "limit": 50
}

// Look for time-limited rules
{
  "query": "action:timelimit",
  "limit": 25
}

// Find rules affecting specific device
{
  "query": "scope.value:mac:AA:BB:CC:DD:EE:FF",
  "limit": 30
}

// Search for gaming restrictions
{
  "query": "target.value:*gaming* OR target.value:*steam* OR target.value:*xbox*",
  "limit": 40
}

// Find recently paused rules
{
  "query": "status:paused",
  "limit": 20
}
```

---

#### search_devices
Search devices with advanced filtering.

```json
{
  "query": "online:false AND macVendor:Apple",
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Find William's devices
{
  "query": "name:*William* OR name:*william*",
  "limit": 10
}

// Look for high bandwidth devices
{
  "query": "totalDownload:>5000000000",
  "limit": 20
}

// Find Apple devices that are offline
{
  "query": "online:false AND macVendor:Apple",
  "limit": 25
}

// Search for devices with reserved IPs
{
  "query": "ipReserved:true",
  "limit": 30
}

// Find recently active devices
{
  "query": "online:true AND network.name:*main*",
  "limit": 100
}
```

---

#### search_target_lists
Search security target lists.

```json
{
  "query": "name:*malware* AND owner:global",
  "limit": 25
}
```

**Real-world scenarios:**
```json
// Find custom blocking lists
{
  "query": "owner:local",
  "limit": 50
}

// Search for adult content lists
{
  "query": "name:*adult* OR name:*porn*",
  "limit": 20
}

// Find global threat intelligence lists
{
  "query": "owner:global AND name:*intel*",
  "limit": 30
}
```

---

### Cross-Reference and Correlation Tools

#### search_cross_reference
Correlate data across different entity types.

```json
{
  "primary_query": "protocol:tcp AND bytes:>10000000",
  "secondary_queries": ["severity:high", "action:block"],
  "correlation_field": "device.ip",
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Correlate high bandwidth usage with security alarms
{
  "primary_query": "bytes:>50000000",
  "secondary_queries": ["severity:medium", "type:1"],
  "correlation_field": "device.ip",
  "limit": 50
}

// Find devices with blocked traffic and active rules
{
  "primary_query": "block:true",
  "secondary_queries": ["action:block", "status:active"],
  "correlation_field": "device.ip",
  "limit": 75
}

// Correlate gaming activity with time restrictions
{
  "primary_query": "category:games",
  "secondary_queries": ["action:timelimit"],
  "correlation_field": "device.id",
  "limit": 30
}
```

---

#### search_enhanced_cross_reference
Advanced correlation with scoring and multiple fields.

```json
{
  "primary_query": "category:video AND bytes:>100000000",
  "secondary_queries": ["action:block", "severity:medium"],
  "correlation_params": {
    "correlationFields": ["device.ip", "region"],
    "correlationType": "AND",
    "temporalWindow": {
      "windowSize": 60,
      "windowUnit": "minutes"
    }
  },
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Multi-field security correlation
{
  "primary_query": "protocol:tcp AND region:CN",
  "secondary_queries": ["type:1", "severity:high"],
  "correlation_params": {
    "correlationFields": ["source.ip", "device.ip"],
    "correlationType": "OR",
    "temporalWindow": {
      "windowSize": 30,
      "windowUnit": "minutes"
    }
  },
  "limit": 100
}

// Behavioral pattern analysis
{
  "primary_query": "category:social",
  "secondary_queries": ["action:timelimit", "status:paused"],
  "correlation_params": {
    "correlationFields": ["device.name", "network.id"],
    "correlationType": "AND",
    "networkScope": {
      "includeSubnets": true
    }
  },
  "limit": 25
}
```

---

#### get_correlation_suggestions
Get intelligent suggestions for field correlations.

```json
{
  "primary_query": "blocked:true AND bytes:>1000000",
  "secondary_queries": ["severity:high", "online:false"]
}
```

**Use Cases:**
- Discover hidden relationships in network data
- Optimize correlation query construction
- Identify important correlation fields

---

### Geographic Search Tools

#### search_flows_by_geography
Search flows with geographic filtering.

```json
{
  "query": "protocol:tcp AND bytes:>1000000",
  "geographic_filters": {
    "countries": ["China", "Russia"],
    "exclude_cloud": true,
    "min_risk_score": 0.7
  },
  "limit": 100
}
```

**Real-world scenarios:**
```json
// Find high-risk traffic from specific regions
{
  "query": "protocol:tcp",
  "geographic_filters": {
    "countries": ["China", "Russia", "North Korea"],
    "min_risk_score": 0.8,
    "exclude_cloud": false
  },
  "limit": 200
}

// Analyze European traffic patterns
{
  "query": "bytes:>10000000",
  "geographic_filters": {
    "continents": ["Europe"],
    "exclude_vpn": true
  },
  "limit": 150
}

// Investigate cloud provider traffic
{
  "query": "category:cloud",
  "geographic_filters": {
    "hosting_providers": ["Amazon", "Google", "Microsoft"],
    "exclude_cloud": false
  },
  "limit": 75
}
```

---

#### search_alarms_by_geography
Search alarms with geographic context.

```json
{
  "query": "severity:high",
  "geographic_filters": {
    "countries": ["China", "Russia"],
    "min_risk_score": 0.8
  },
  "limit": 50
}
```

**Real-world scenarios:**
```json
// Find security threats from high-risk countries
{
  "query": "type:1 OR type:2",
  "geographic_filters": {
    "countries": ["China", "Russia", "Iran", "North Korea"],
    "min_risk_score": 0.9
  },
  "limit": 100
}

// Analyze regional threat patterns
{
  "query": "severity:medium",
  "geographic_filters": {
    "continents": ["Asia"],
    "exclude_vpn": false
  },
  "limit": 75
}
```

---

#### get_geographic_statistics
Get statistical analysis of geographic patterns.

```json
{
  "entity_type": "flows",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "group_by": "country"
}
```

**Real-world scenarios:**
```json
// Monthly geographic threat analysis
{
  "entity_type": "alarms",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "group_by": "country"
}

// Regional bandwidth usage statistics
{
  "entity_type": "flows",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "group_by": "continent"
}
```

---

## Field Reference Guide

### Common Search Fields by Entity Type

#### Flow Fields
- `protocol`: tcp, udp
- `direction`: inbound, outbound, local
- `block`: true, false
- `bytes`: numeric value or range
- `download`: bytes downloaded
- `upload`: bytes uploaded
- `duration`: flow duration in seconds
- `device.ip`: device IP address
- `device.name`: device name (supports wildcards)
- `device.id`: device identifier
- `source.ip`: source IP address
- `destination.ip`: destination IP address
- `region`: geographic region code
- `category`: traffic category (video, games, social, etc.)

#### Alarm Fields
- `type`: 1-16 (see alarm types in types.ts)
- `status`: 1 (active), 2 (resolved)
- `severity`: low, medium, high, critical
- `device.ip`: affected device IP
- `device.name`: affected device name
- `region`: geographic region
- `protocol`: network protocol

#### Device Fields
- `name`: device name (supports wildcards)
- `ip`: device IP address
- `mac`: MAC address
- `macVendor`: manufacturer name
- `online`: true, false
- `ipReserved`: true, false
- `network.name`: network name
- `totalDownload`: total bytes downloaded
- `totalUpload`: total bytes uploaded

#### Rule Fields
- `action`: allow, block, timelimit
- `target.value`: target domain/IP (supports wildcards)
- `status`: active, paused
- `scope.value`: rule scope
- `direction`: bidirection, inbound, outbound

#### Target List Fields
- `name`: list name (supports wildcards)
- `owner`: global, local, or box GID
- `category`: list category

### Search Operators

#### Logical Operators
- `AND`: Both conditions must be true
- `OR`: Either condition must be true
- `NOT`: Condition must not be true

#### Comparison Operators
- `:`: equals
- `:>`: greater than
- `:>=`: greater than or equal
- `:<`: less than
- `:<=`: less than or equal

#### Pattern Matching
- `*`: wildcard (e.g., `device.name:*William*`)
- `192.168.1.*`: IP range matching
- `[1000 TO 50000]`: numeric range

#### Time Range Syntax
- Use ISO 8601 format: `2024-01-01T00:00:00Z`
- Always specify both start and end times
- Use `time_range` parameter for time-based filtering

---

## Common Patterns & Best Practices

### 1. Finding Specific Devices
```json
// By name (case-insensitive wildcards)
{
  "query": "name:*William* OR name:*william*",
  "limit": 10
}

// By MAC vendor
{
  "query": "macVendor:Apple AND online:true",
  "limit": 20
}

// By IP range
{
  "query": "ip:192.168.1.*",
  "limit": 50
}
```

### 2. Security Investigation Patterns
```json
// High-severity unresolved alarms
{
  "query": "severity:high AND status:1",
  "limit": 25
}

// Intrusion attempts with device context
{
  "query": "type:1 AND device.name:*",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 100
}

// Correlate suspicious flows with alarms
{
  "primary_query": "region:CN AND bytes:>10000000",
  "secondary_queries": ["severity:medium", "type:1"],
  "correlation_field": "device.ip",
  "limit": 50
}
```

### 3. Bandwidth Analysis Patterns
```json
// Top bandwidth consumers
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 20
}

// Large transfers by protocol
{
  "query": "protocol:tcp AND bytes:>100000000",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 50
}

// Video streaming analysis
{
  "query": "category:video AND bytes:>50000000",
  "limit": 30
}
```

### 4. Rule Management Patterns
```json
// Active blocking rules
{
  "query": "action:block AND status:active",
  "limit": 100
}

// Time-limited rules affecting specific devices
{
  "query": "action:timelimit AND scope.value:*mac:*",
  "limit": 25
}

// Social media restrictions
{
  "query": "target.value:*facebook* OR target.value:*instagram* OR target.value:*twitter*",
  "limit": 20
}
```

### 5. Time-based Analysis Patterns
```json
// Business hours analysis
{
  "time_range": {
    "start": "2024-01-01T09:00:00Z",
    "end": "2024-01-01T17:00:00Z"
  }
}

// Weekend patterns
{
  "time_range": {
    "start": "2024-01-06T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  }
}

// Last 24 hours
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  }
}
```

### 6. Geographic Analysis Patterns
```json
// High-risk country traffic
{
  "geographic_filters": {
    "countries": ["China", "Russia", "Iran"],
    "min_risk_score": 0.8
  }
}

// Regional traffic patterns
{
  "geographic_filters": {
    "continents": ["Asia", "Europe"],
    "exclude_cloud": true
  }
}

// Cloud provider analysis
{
  "geographic_filters": {
    "hosting_providers": ["Amazon", "Google"],
    "exclude_cloud": false
  }
}
```

### Error Prevention Tips

1. **Always include required parameters:**
   - `limit` is required for most tools
   - `query` is required for all search tools
   - Use realistic limit values (10-1000 range)

2. **Use correct field names:**
   - `device.name` not `device_name`
   - `device.ip` not `source_ip` for device searches
   - `macVendor` not `mac_vendor`

3. **Time range formatting:**
   - Always use ISO 8601 format with 'Z' suffix
   - Include both start and end times
   - Ensure start time is before end time

4. **Query syntax:**
   - Use wildcards appropriately: `*William*` not `William*`
   - Combine with logical operators: `AND`, `OR`, `NOT`
   - Use proper comparison operators: `:>`, `:>=`, `:<`, `:<=`

5. **Limit values:**
   - Use reasonable limits (typically 10-1000)
   - Larger limits may cause performance issues
   - Start with smaller limits for testing

This comprehensive library provides practical, copy-ready examples for all 32 Firewalla MCP tools, organized by complexity and common use cases. Models can reference specific sections and copy examples directly for immediate use.