# Field Syntax Specification for Firewalla MCP Search Tools

## Overview

This document provides the comprehensive field syntax specification for the 11 high-complexity search tools in the Firewalla MCP Server. These tools use complex query syntax with entity-specific field mappings, logical operators, and advanced matching capabilities.

## High-Complexity Search Tools

The following 11 tools require this specification:

1. **search_flows** - Network flow searching with advanced filters
2. **search_alarms** - Alarm searching with severity, time, IP filters  
3. **search_rules** - Rule searching with target, action, status filters
4. **search_devices** - Device searching with network, status, usage filters
5. **search_target_lists** - Target list searching with category, ownership filters
6. **search_cross_reference** - Multi-entity searches with correlation
7. **search_enhanced_cross_reference** - Advanced correlation with multi-field support
8. **search_enhanced_scored_cross_reference** - Scoring and fuzzy matching correlation
9. **get_correlation_suggestions** - Intelligent field combination suggestions
10. **search_flows_by_geography** - Geographic flow analysis
11. **search_alarms_by_geography** - Geographic alarm analysis

## Entity-Specific Field Mappings

### 1. Flows Entity

#### Working Field Names
```yaml
# IP Address Fields (CRITICAL: Use these mappings)
device_ip: # Use instead of source_ip
  - Works: "device_ip:192.168.1.1"
  - Field paths: ['device.ip', 'source.ip']
  
ip: # Alternative to device_ip
  - Works: "ip:192.168.*"
  - Field paths: ['device.ip', 'source.ip']

# Network Protocol Fields  
protocol: # Standard protocol field
  - Works: "protocol:tcp", "protocol:udp"
  - Field paths: ['protocol']

# Data Transfer Fields
bytes: # Total bytes transferred
  - Works: "bytes:>1000000", "bytes:[1000 TO 50000]"
  - Field paths: ['bytes', 'download', 'upload']

download: # Download bytes
  - Works: "download:>500MB"
  - Field paths: ['download']

upload: # Upload bytes  
  - Works: "upload:<100KB"
  - Field paths: ['upload']

# Direction and Blocking
direction: # Traffic direction
  - Works: "direction:outbound", "direction:inbound"
  - Field paths: ['direction']

blocked: # Block status
  - Works: "blocked:true", "blocked:false"
  - Field paths: ['block', 'blocked']

# Temporal Fields
timestamp: # Flow timestamp
  - Works: "timestamp:>=2024-01-01", "timestamp:[1609459200 TO 1640995200]"
  - Field paths: ['ts', 'timestamp']

# Geographic Fields
country: # Country code or name
  - Works: "country:US", "country:\"United States\""
  - Field paths: ['geo.country', 'location.country', 'country', 'region']

region: # Geographic region
  - Works: "region:US", "region:EU"
  - Field paths: ['geo.region', 'location.region', 'region']

# Application Fields
application: # Application name
  - Works: "application:Chrome", "application:*browser*"
  - Field paths: ['app', 'application', 'service']

category: # Content category
  - Works: "category:social", "category:video"
  - Field paths: ['category']
```

#### Common Mistakes for Flows
```yaml
# ❌ INCORRECT - These don't work
source_ip: "192.168.1.1"     # Use device_ip or ip instead
destination_ip: "8.8.8.8"    # Use domain patterns or IP ranges
src_ip: "192.168.1.1"        # Not a valid field name
dst_ip: "8.8.8.8"            # Not a valid field name

# ✅ CORRECT - Use these instead  
device_ip: "192.168.1.1"     # Maps to device.ip, source.ip
ip: "192.168.*"              # Wildcard IP matching
domain: "*.google.com"       # For destination filtering
```

### 2. Alarms Entity

#### Working Field Names
```yaml
# Severity and Type
severity: # Alarm severity level
  - Works: "severity:high", "severity:>=medium", "severity:[low TO critical]"
  - Field paths: ['severity']

type: # Alarm type number
  - Works: "type:1", "type:[1 TO 5]"
  - Field paths: ['type']

# IP Address Fields
device_ip: # Device IP (preferred over source_ip)
  - Works: "device_ip:192.168.1.100"
  - Field paths: ['device.ip']

# Status and Resolution
status: # Alarm status
  - Works: "status:1", "status:active", "status:archived"
  - Field paths: ['status']

resolved: # Resolution status
  - Works: "resolved:true", "resolved:false"
  - Field paths: ['status'] # Maps to status for resolution checking

# Temporal Fields
timestamp: # Alarm timestamp
  - Works: "timestamp:>=2024-01-01T00:00:00Z"
  - Field paths: ['ts', 'timestamp']

# Geographic Fields (Enhanced)
country: # Country for threat analysis
  - Works: "country:CN", "country:RU"
  - Field paths: ['geo.country', 'location.country', 'country', 'remote.country']

geographic_risk_score: # Risk score based on geography
  - Works: "geographic_risk_score:>=7"
  - Field paths: ['geo.riskScore', 'location.riskScore', 'remote.geoRisk']
```

#### Common Mistakes for Alarms
```yaml
# ❌ INCORRECT
source_ip: "192.168.1.1"     # Use device_ip instead
severity_level: "high"       # Use severity instead
alarm_type: "1"              # Use type instead

# ✅ CORRECT
device_ip: "192.168.1.1"     # Maps to device.ip
severity: "high"             # Standard severity field
type: "1"                    # Alarm type number
```

### 3. Rules Entity

#### Working Field Names
```yaml
# Rule Action and Target
action: # Rule action type
  - Works: "action:block", "action:allow", "action:timelimit"
  - Field paths: ['action']

target_value: # Target value (domain, IP, etc.)
  - Works: "target_value:*.facebook.com", "target_value:192.168.1.0/24"
  - Field paths: ['target.value']

target_type: # Type of target
  - Works: "target_type:domain", "target_type:ip"
  - Field paths: ['target.type']

# Rule Status and Direction
status: # Rule status
  - Works: "status:active", "status:paused"
  - Field paths: ['status']

direction: # Traffic direction for rule
  - Works: "direction:bidirection", "direction:inbound"
  - Field paths: ['direction']

# Rule Metadata
hit_count: # Number of times rule was triggered
  - Works: "hit_count:>10", "hit_count:[5 TO 100]"
  - Field paths: ['hit.count']

created_at: # Rule creation time
  - Works: "created_at:>=2024-01-01"
  - Field paths: ['ts', 'updateTs']
```

### 4. Devices Entity

#### Working Field Names
```yaml
# Device Identity
device_ip: # Device IP address
  - Works: "device_ip:192.168.1.50"
  - Field paths: ['ip', 'ipAddress']

ip: # Alternative to device_ip
  - Works: "ip:192.168.*"
  - Field paths: ['ip', 'ipAddress']

mac: # MAC address
  - Works: "mac:AA:BB:CC:DD:EE:FF"
  - Field paths: ['mac', 'macAddress']

name: # Device name/hostname
  - Works: "name:*laptop*", "name:\"John's iPhone\""
  - Field paths: ['name', 'hostname']

# Device Status
online: # Online status
  - Works: "online:true", "online:false"
  - Field paths: ['online', 'isOnline']

last_seen: # Last seen timestamp
  - Works: "last_seen:>=2024-01-01"
  - Field paths: ['lastSeen', 'onlineTs']

# Device Classification
mac_vendor: # MAC address vendor
  - Works: "mac_vendor:Apple", "mac_vendor:*Samsung*"
  - Field paths: ['macVendor', 'manufacturer']

vendor: # Alternative to mac_vendor
  - Works: "vendor:Apple"
  - Field paths: ['macVendor', 'vendor']

# Network Information
network_name: # Network name
  - Works: "network_name:\"Home Office\""
  - Field paths: ['network.id']

group_name: # Device group
  - Works: "group_name:Kids"
  - Field paths: ['group.id']
```

### 5. Target Lists Entity

#### Working Field Names
```yaml
# List Identity
name: # Target list name
  - Works: "name:\"Social Media\"", "name:*gaming*"
  - Field paths: ['name']

# List Classification
category: # List category
  - Works: "category:social", "category:gaming"
  - Field paths: ['category']

owner: # List owner
  - Works: "owner:global", "owner:box_id"
  - Field paths: ['owner']

# List Metadata
target_count: # Number of targets in list
  - Works: "target_count:>10", "target_count:[5 TO 50]"
  - Field paths: ['targets.length']

last_updated: # Last update timestamp
  - Works: "last_updated:>=2024-01-01"
  - Field paths: ['lastUpdated']
```

## Query Syntax Operators

### 1. Logical Operators

#### AND Operator
```yaml
Syntax: field1:value1 AND field2:value2
Examples:
  - "protocol:tcp AND blocked:true"
  - "severity:high AND device_ip:192.168.*"
  - "(category:social OR category:gaming) AND action:block"
```

#### OR Operator
```yaml
Syntax: field1:value1 OR field2:value2
Examples:
  - "severity:high OR severity:critical"
  - "protocol:tcp OR protocol:udp"
  - "country:CN OR country:RU"
```

#### NOT Operator
```yaml
Syntax: NOT field:value
Examples:
  - "NOT blocked:true"
  - "NOT category:social"
  - "protocol:tcp AND NOT direction:local"
```

### 2. Comparison Operators

#### Greater Than (>)
```yaml
Syntax: field:>value
Examples:
  - "bytes:>1000000"      # More than 1MB
  - "hit_count:>10"       # More than 10 hits
  - "timestamp:>2024-01-01"
```

#### Greater Than or Equal (>=)
```yaml
Syntax: field:>=value
Examples:
  - "severity:>=medium"
  - "geographic_risk_score:>=7"
  - "last_seen:>=2024-01-01T00:00:00Z"
```

#### Less Than (<)
```yaml
Syntax: field:<value
Examples:
  - "bytes:<500KB"
  - "target_count:<5"
  - "type:<10"
```

#### Less Than or Equal (<=)
```yaml
Syntax: field:<=value
Examples:
  - "severity:<=low"
  - "hit_count:<=100"
  - "upload:<=1GB"
```

#### Not Equal (!=)
```yaml
Syntax: field:!=value
Examples:
  - "status:!=archived"
  - "protocol:!=udp"
  - "action:!=allow"
```

### 3. Wildcard Operators

#### Asterisk (*) - Multiple Characters
```yaml
Syntax: field:*pattern* | field:pattern* | field:*pattern
Examples:
  - "device_ip:192.168.*"        # IP range
  - "name:*laptop*"              # Contains "laptop"
  - "target_value:*.facebook.*"  # Facebook domains
  - "application:*Chrome*"       # Chrome variants
```

#### Question Mark (?) - Single Character
```yaml
Syntax: field:?pattern | field:pattern?
Examples:
  - "mac:AA:BB:CC:DD:EE:??"     # Last octet wildcard
  - "type:?1"                    # Single digit before 1
```

### 4. Range Operators

#### Inclusive Range [min TO max]
```yaml
Syntax: field:[min TO max]
Examples:
  - "bytes:[1000 TO 50000]"           # Byte range
  - "timestamp:[1609459200 TO 1640995200]"  # Unix timestamp range
  - "hit_count:[5 TO 100]"            # Hit count range
  - "type:[1 TO 5]"                   # Alarm type range
```

### 5. Quoted Strings

#### Exact Phrase Matching
```yaml
Syntax: field:"exact phrase"
Examples:
  - "name:\"John's iPhone\""          # Device with spaces/quotes
  - "target_value:\"social media\""   # Exact category match
  - "country:\"United States\""       # Full country name
```

## Time Range Formatting

### 1. ISO 8601 Format (Recommended)
```yaml
Format: YYYY-MM-DDTHH:MM:SSZ
Examples:
  - "timestamp:>=2024-01-01T00:00:00Z"
  - "last_seen:<2024-01-15T12:30:00Z"
  - "created_at:[2024-01-01T00:00:00Z TO 2024-01-31T23:59:59Z]"
```

### 2. Unix Timestamp Format
```yaml
Format: Seconds since epoch
Examples:
  - "timestamp:>=1704067200"          # 2024-01-01 00:00:00 UTC
  - "last_seen:[1704067200 TO 1706745599]"  # January 2024
```

### 3. Relative Time Expressions
```yaml
Format: Keywords for recent timeframes
Examples:
  - "timestamp:>=today"
  - "last_seen:>=yesterday"  
  - "created_at:>=last_week"
```

## Entity Cross-Reference Compatibility

### 1. Compatible Field Combinations

#### Network-Focused Correlations
```yaml
device_ip + protocol:
  - Entities: flows, alarms, devices
  - Example: "device_ip:192.168.1.100 AND protocol:tcp"

device_ip + timestamp:
  - Entities: flows, alarms, devices
  - Example: Temporal correlation by device

protocol + direction:
  - Entities: flows, rules
  - Example: "protocol:tcp AND direction:outbound"
```

#### Security-Focused Correlations
```yaml
severity + country:
  - Entities: alarms, flows (geographic threat correlation)
  - Example: "severity:high AND country:CN"

action + target_value:
  - Entities: rules, flows (rule effectiveness analysis)
  - Example: "action:block AND target_value:*.facebook.com"

geographic_risk_score + severity:
  - Entities: flows, alarms (risk assessment)
  - Example: "geographic_risk_score:>=7 AND severity:>=medium"
```

#### Application-Level Correlations
```yaml
application + category:
  - Entities: flows, alarms
  - Example: "application:Chrome AND category:social"

user_agent + ssl_subject:
  - Entities: flows, alarms (TLS analysis)
  - Example: "user_agent:*Chrome* AND ssl_subject:*.google.com"
```

### 2. Incompatible Field Combinations

#### Fields Not Supported Across Entities
```yaml
# These fields are entity-specific and cannot be correlated:
hit_count: # Only in rules
target_count: # Only in target_lists
mac_vendor: # Only in devices
last_updated: # Only in target_lists
```

## Geographic Search Syntax

### 1. Country-Based Filtering
```yaml
# ISO Country Codes (Preferred)
country:US                    # United States
country:CN                    # China
country:RU                    # Russia

# Full Country Names (Quoted)
country:"United States"
country:"People's Republic of China"

# Multiple Countries (OR logic)
country:US OR country:CA OR country:MX
```

### 2. Continent-Based Filtering
```yaml
continent:Europe
continent:Asia  
continent:"North America"
```

### 3. Risk-Based Filtering
```yaml
geographic_risk_score:>=7     # High risk locations
is_cloud_provider:false       # Exclude cloud providers
is_vpn:true                   # VPN traffic only
```

## Performance Optimization Guidelines

### 1. Query Complexity Limits
```yaml
# Recommended Limits
max_correlation_fields: 5     # For enhanced correlation
max_wildcard_fields: 3        # To prevent slow queries
max_range_queries: 2          # Per search query
max_logical_depth: 4          # Nested AND/OR levels
```

### 2. Efficient Query Patterns
```yaml
# ✅ GOOD - Specific filters first
"device_ip:192.168.1.100 AND timestamp:>=today"

# ✅ GOOD - Use exact matches when possible  
"protocol:tcp AND action:block"

# ❌ AVOID - Too many wildcards
"name:*device* AND target_value:*social* AND application:*browser*"

# ❌ AVOID - Overly broad time ranges
"timestamp:[2020-01-01 TO 2024-12-31]"
```

### 3. Field Selection Guidelines
```yaml
# High Performance Fields (indexed)
- device_ip, ip
- timestamp, last_seen
- protocol, action
- status, severity

# Medium Performance Fields
- country, region
- category, type
- direction, blocked

# Lower Performance Fields (require post-processing)
- name, target_value (with wildcards)
- user_agent, ssl_subject
- application, geographic_risk_score
```

## Common Error Patterns and Solutions

### 1. Field Name Errors
```yaml
# ❌ ERROR: Invalid field 'source_ip' for flows
Query: "source_ip:192.168.1.1"
Solution: "device_ip:192.168.1.1" or "ip:192.168.1.1"

# ❌ ERROR: Invalid field 'destination_ip' for flows
Query: "destination_ip:8.8.8.8"
Solution: Use domain or geographic filtering instead

# ❌ ERROR: Invalid field 'severity_level' for alarms
Query: "severity_level:high"
Solution: "severity:high"
```

### 2. Syntax Errors
```yaml
# ❌ ERROR: Missing quotes for values with spaces
Query: name:John's iPhone
Solution: "name:\"John's iPhone\""

# ❌ ERROR: Invalid operator usage
Query: "bytes:=>1000000"
Solution: "bytes:>=1000000"

# ❌ ERROR: Malformed range syntax
Query: "timestamp:[2024-01-01:2024-01-31]"
Solution: "timestamp:[2024-01-01T00:00:00Z TO 2024-01-31T23:59:59Z]"
```

### 3. Logic Errors
```yaml
# ❌ ERROR: Conflicting conditions
Query: "blocked:true AND blocked:false"
Solution: "blocked:true OR blocked:false" or remove contradiction

# ❌ ERROR: Impossible range
Query: "bytes:[1000000 TO 500000]"
Solution: "bytes:[500000 TO 1000000]"
```

## Tool-Specific Syntax Examples

### 1. search_flows
```yaml
# Basic flow search
"protocol:tcp AND bytes:>1MB"

# Geographic flow analysis
"country:CN AND application:Chrome"

# Blocked traffic analysis
"blocked:true AND timestamp:>=today"
```

### 2. search_alarms
```yaml
# High severity recent alarms
"severity:>=high AND timestamp:>=2024-01-01"

# Geographic threat analysis
"country:RU AND geographic_risk_score:>=7"

# Device-specific alarms
"device_ip:192.168.1.100 AND type:[1 TO 5]"
```

### 3. search_enhanced_cross_reference
```yaml
# Multi-field correlation
primary_query: "protocol:tcp AND bytes:>10MB"
secondary_queries: ["severity:high", "action:block"]
correlation_params:
  correlationFields: ["device_ip", "timestamp"]
  correlationType: "AND"
```

### 4. search_flows_by_geography
```yaml
# Geographic filtering with risk analysis
query: "protocol:tcp"
geographic_filters:
  countries: ["CN", "RU", "KP"]
  min_risk_score: 7
  exclude_cloud: true
```

This comprehensive specification provides the technical foundation for constructing correct queries across all 11 high-complexity search tools, ensuring consistent field usage and optimal query performance.