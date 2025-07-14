# Firewalla MCP Server - Field Mappings Reference

This document provides comprehensive mapping information between user-facing field names and API field names, including type conversions, supported operators, and example queries for the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Severity Field Conversion](#severity-field-conversion)
- [Field Mappings by Entity Type](#field-mappings-by-entity-type)
- [Common Correlation Fields](#common-correlation-fields)
- [Supported Operators](#supported-operators)
- [Type Conversions](#type-conversions)
- [Example Queries](#example-queries)
- [Best Practices](#best-practices)

## Overview

The Firewalla MCP Server provides a unified query interface that maps user-friendly field names to the underlying API field names. This abstraction allows for consistent querying across different data types while handling the complexity of the underlying API structure.

### Key Concepts

- **User Fields**: The field names you use in queries (e.g., `severity`, `source_ip`)
- **API Fields**: The actual field names in the Firewalla API response (e.g., `type`, `device.ip`)
- **Field Mapping**: The translation layer between user fields and API fields
- **Type Conversion**: Automatic conversion of user values to API-compatible values

## Severity Field Conversion

The most important field conversion is the severity field, which maps user-friendly severity levels to numeric type values used by the Firewalla API.

### Severity to Type Mapping

| User Severity | API Type Value | Query Conversion |
|---------------|----------------|------------------|
| `low`         | `1`            | `severity:low` → `type:>=1` |
| `medium`      | `4`            | `severity:medium` → `type:>=4` |
| `high`        | `8`            | `severity:high` → `type:>=8` |
| `critical`    | `12`           | `severity:critical` → `type:>=12` |

### Alarm Type to Severity Classification

Based on the alarm type, severity is automatically derived using these mappings:

#### Critical Severity Alarms
- `MALWARE_FILE`, `MALWARE_URL`, `RANSOMWARE`, `BOTNET`
- `C2_COMMUNICATION`, `CRYPTOJACKING`, `DATA_EXFILTRATION`
- `BRUTE_FORCE_ATTACK`, `KNOWN_VULNERABILITY_EXPLOIT`
- `PHISHING`, `TROJAN`, `SPYWARE`

#### High Severity Alarms  
- `SUSPICIOUS_ACTIVITY`, `NETWORK_INTRUSION`, `PORT_SCAN`
- `DGA_DOMAIN`, `SUSPICIOUS_DNS`, `TOR_CONNECTION`
- `PROXY_DETECTED`, `VPN_DETECTED`, `UNUSUAL_TRAFFIC`
- `POLICY_VIOLATION`, `BLOCKED_CONTENT`

#### Medium Severity Alarms
- `DNS_ANOMALY`, `LARGE_UPLOAD`, `LARGE_DOWNLOAD`
- `UNUSUAL_BANDWIDTH`, `NEW_DEVICE`, `DEVICE_OFFLINE`
- `VULNERABILITY_SCAN`, `INTEL_MATCH`, `GEO_IP_ANOMALY`

## Field Mappings by Entity Type

### Flows

User-facing fields for network flow data:

| User Field | API Field Paths | Description | Example Values |
|------------|----------------|-------------|----------------|
| `source_ip` | `source.ip`, `device.ip`, `srcIP` | Source IP address | `192.168.1.100` |
| `destination_ip` | `destination.ip`, `dstIP` | Destination IP address | `8.8.8.8` |
| `device_ip` | `device.ip`, `source.ip` | Device IP address | `192.168.1.50` |
| `protocol` | `protocol` | Network protocol | `tcp`, `udp`, `icmp` |
| `bytes` | `bytes`, `download`, `upload` | Data transfer amount | `1048576` (1MB) |
| `timestamp` | `ts`, `timestamp` | Flow timestamp | Unix timestamp |
| `device_id` | `device.id`, `device.gid` | Device identifier | Device GUID |
| `direction` | `direction` | Traffic direction | `inbound`, `outbound` |
| `blocked` | `block`, `blocked` | Whether flow was blocked | `true`, `false` |
| `port` | `source.port`, `destination.port` | Network port | `80`, `443`, `22` |
| `application` | `app`, `application`, `service` | Application name | `youtube`, `netflix` |
| `country` | `destination.geo.country`, `source.geo.country` | Geographic country | `United States`, `China` |
| `asn` | `destination.geo.asn`, `source.geo.asn` | Autonomous System Number | `AS15169` |

### Alarms

User-facing fields for security alarm data:

| User Field | API Field Paths | Description | Example Values |
|------------|----------------|-------------|----------------|
| `source_ip` | `device.ip`, `remote.ip` | Source IP of alarm | `192.168.1.100` |
| `destination_ip` | `remote.ip`, `device.ip` | Remote IP in alarm | `suspicious.domain.com` |
| `device_ip` | `device.ip` | Local device IP | `192.168.1.50` |
| `type` | `type` | Alarm type | `MALWARE_URL`, `PORT_SCAN` |
| `severity` | `type`, `severity` | Alarm severity | `low`, `medium`, `high`, `critical` |
| `status` | `status` | Alarm status | `active`, `resolved`, `acknowledged` |
| `message` | `message` | Alarm description | Human-readable description |
| `protocol` | `protocol` | Network protocol | `tcp`, `udp` |
| `port` | `port`, `remote.port` | Network port | Port number |
| `country` | `remote.geo.country`, `geo.country` | Geographic origin | Country name |

### Rules

User-facing fields for firewall rule data:

| User Field | API Field Paths | Description | Example Values |
|------------|----------------|-------------|----------------|
| `target_value` | `target.value` | Rule target | `*.facebook.com`, `192.168.1.0/24` |
| `target_type` | `target.type` | Type of target | `domain`, `ip`, `category` |
| `action` | `action` | Rule action | `block`, `allow`, `timelimit` |
| `direction` | `direction` | Traffic direction | `inbound`, `outbound`, `bidirection` |
| `status` | `status` | Rule status | `active`, `inactive`, `paused` |
| `protocol` | `protocol` | Network protocol | `tcp`, `udp`, `any` |
| `hit_count` | `hit.count` | Number of rule hits | Numeric count |
| `category` | `category`, `type` | Rule category | `social`, `gaming`, `adult` |

### Devices

User-facing fields for device data:

| User Field | API Field Paths | Description | Example Values |
|------------|----------------|-------------|----------------|
| `device_ip` | `ip`, `ipAddress` | Device IP address | `192.168.1.100` |
| `device_id` | `id`, `gid` | Device identifier | Device GUID |
| `mac` | `mac`, `macAddress` | MAC address | `aa:bb:cc:dd:ee:ff` |
| `name` | `name`, `hostname` | Device name | `Johns-iPhone`, `laptop-001` |
| `vendor` | `macVendor`, `manufacturer` | Device vendor | `Apple`, `Samsung`, `Dell` |
| `online` | `online`, `isOnline` | Online status | `true`, `false` |
| `last_seen` | `lastSeen`, `onlineTs` | Last seen timestamp | Unix timestamp |
| `device_type` | `type`, `category` | Device category | `mobile`, `computer`, `iot` |

### Target Lists

User-facing fields for target list data:

| User Field | API Field Paths | Description | Example Values |
|------------|----------------|-------------|----------------|
| `name` | `name` | List name | `Social Media Sites` |
| `category` | `category` | List category | `social`, `adult`, `gaming` |
| `owner` | `owner` | List owner | `admin`, `user123` |
| `target_count` | `targets.length` | Number of targets | Numeric count |
| `last_updated` | `lastUpdated` | Last update time | Unix timestamp |

## Common Correlation Fields

These fields can be used for cross-reference searches between different entity types:

### Universal Fields
- `device_ip` - Available in flows, alarms, devices
- `device_id` - Available in flows, alarms, devices  
- `protocol` - Available in flows, alarms, rules
- `timestamp` - Available in flows, alarms, rules
- `gid` - Available in flows, alarms, rules, devices

### Network Fields
- `source_ip` - Available in flows, alarms
- `destination_ip` - Available in flows, alarms
- `port` - Available in flows, alarms, rules
- `subnet` - Available in flows, alarms, devices

### Geographic Fields
- `country` - Available in flows, alarms
- `continent` - Available in flows, alarms
- `asn` - Available in flows, alarms
- `organization` - Available in flows, alarms

## Supported Operators

### Exact Match
```
field:value
severity:high
protocol:tcp
```

### Comparison Operators
```
field:>value    # Greater than
field:<value    # Less than  
field:>=value   # Greater than or equal
field:<=value   # Less than or equal
field:!=value   # Not equal
```

### Wildcard Operators
```
field:*value*   # Contains
field:value*    # Starts with
field:*value    # Ends with
```

### Range Operators
```
field:[min TO max]    # Inclusive range
bytes:[1000000 TO 50000000]
```

### Logical Operators
```
field1:value1 AND field2:value2    # Both conditions
field1:value1 OR field2:value2     # Either condition
NOT field:value                    # Exclude condition
```

## Type Conversions

### Automatic Conversions

| User Input | API Conversion | Notes |
|------------|----------------|-------|
| `severity:high` | `type:>=8` | Numeric severity mapping |
| `online:true` | `isOnline:true` | Boolean field mapping |
| `timestamp:2024-01-01` | `ts:1704067200` | Date to Unix timestamp |
| `mac:aa:bb:cc:dd:ee:ff` | `macAddress:aabbccddeeff` | Normalized MAC format |

### Field Value Normalization

- **IP Addresses**: Trimmed and lowercased
- **MAC Addresses**: Separators removed, lowercased
- **Protocols**: Lowercased (`TCP` → `tcp`)
- **Geographic Fields**: Trimmed and lowercased
- **Boolean Fields**: String to boolean conversion

## Example Queries

### Basic Field Queries
```
# Using user-friendly field names
severity:high
device_ip:192.168.1.100
blocked:true
online:false

# These are automatically converted to API fields:
# type:>=8
# device.ip:192.168.1.100 OR ip:192.168.1.100
# block:true OR blocked:true
# online:false OR isOnline:false
```

### Cross-Reference Queries
```
# Find flows and alarms with same source IP
primary_query: "source_ip:192.168.1.*"
secondary_queries: ["severity:high"]
correlation_field: "source_ip"

# Device and flow correlation
primary_query: "device_type:mobile"
secondary_queries: ["bytes:>1000000"]
correlation_field: "device_ip"
```

### Geographic Queries
```
# Using mapped geographic fields
country:China
continent:Asia
asn:AS4134

# These map to various API paths:
# destination.geo.country, source.geo.country, geo.country
# destination.geo.continent, source.geo.continent
# destination.geo.asn, source.geo.asn, geo.asn
```

### Complex Field Mapping
```
# User query with multiple mapped fields
source_ip:192.168.* AND bytes:>1000000 AND country:China

# Maps to multiple API field paths:
# (source.ip:192.168.* OR device.ip:192.168.*) AND 
# (bytes:>1000000 OR download:>1000000 OR upload:>1000000) AND
# (destination.geo.country:china OR source.geo.country:china)
```

## Best Practices

### Use Logical Field Names
```
# Good: Use logical user field names
severity:high AND device_ip:192.168.1.*

# Avoid: Direct API field names (may not work)
type:>=8 AND device.ip:192.168.1.*
```

### Leverage Field Mapping
```
# Good: Let the system handle field mapping
bytes:>1000000

# Good: The system checks multiple API paths
# bytes, download, upload fields are all checked
```

### Cross-Reference Compatibility
```
# Good: Use fields available in both entity types
correlation_field: "device_ip"  # Available in flows, alarms, devices

# Avoid: Using fields not available in target entities
correlation_field: "hit_count"  # Only available in rules
```

### Geographic Field Usage
```
# Good: Use consistent geographic field names
country:United States
continent:North America

# The system handles various API field paths:
# destination.geo.country, source.geo.country, remote.geo.country
```

### Severity Field Usage
```
# Good: Use semantic severity levels
severity:high OR severity:critical

# Good: Use comparison operators with severity
severity:>=medium

# The system automatically converts to type field:
# type:>=8 OR type:>=12
# type:>=4
```

This field mapping system ensures consistent and intuitive querying while handling the complexity of the underlying Firewalla API structure. Always use the user-facing field names documented here for the best compatibility and functionality.