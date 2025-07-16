# Firewalla MCP Server - Query Syntax Guide

This guide provides comprehensive documentation for the query syntax used across all Firewalla MCP Server search tools. The search functionality supports powerful filtering, logical operations, and complex queries to help you find exactly the data you need.

## Table of Contents

- [Overview](#overview)
- [Basic Field Queries](#basic-field-queries)
- [Logical Operators](#logical-operators)
- [Wildcards and Patterns](#wildcards-and-patterns)
- [Ranges and Comparisons](#ranges-and-comparisons)
- [Complex Nested Queries](#complex-nested-queries)
- [Field-Specific Syntax](#field-specific-syntax)
- [Cache Control and Real-Time Data](#cache-control-and-real-time-data)
- [Common Query Patterns](#common-query-patterns)
- [Query Validation](#query-validation)
- [Best Practices](#best-practices)
- [Supported vs Unsupported Syntax](#supported-vs-unsupported-syntax)
- [Troubleshooting](#troubleshooting)

## Overview

The Firewalla MCP Server uses a flexible query syntax that allows you to search across flows, alarms, rules, devices, and target lists. All search tools accept queries in the same format, making it easy to build consistent search patterns across different data types.

### Supported Search Tools

- `search_flows` - Network flow data
- `search_alarms` - Security alerts and alarms
- `search_rules` - Firewall rules and policies
- `search_devices` - Network devices
- `search_target_lists` - Target lists and categories
- `search_cross_reference` - Multi-entity correlation
- `search_enhanced_cross_reference` - Advanced correlation with scoring
- `search_flows_by_geography` - Geographic flow analysis
- `search_alarms_by_geography` - Geographic threat analysis

## Basic Field Queries

The simplest query format is `field:value`, which searches for exact matches on the specified field.

### Simple Field Matching

```text
# Find flows with TCP protocol
protocol:tcp

# Find alarms with high severity
severity:high

# Find devices by IP address
ip:192.168.1.100

# Find rules blocking traffic
action:block

# Find target lists by category
category:social
```text

### Case Sensitivity

Field names are case-sensitive, but values are generally case-insensitive:

```text
# Correct field names
severity:HIGH
protocol:TCP
action:BLOCK

# Incorrect field names (will not match)
SEVERITY:high
Protocol:tcp
ACTION:block
```text

## Logical Operators

Combine multiple conditions using logical operators to create more specific queries.

### AND Operator

Use `AND` to require all conditions to be true:

```text
# High severity alarms from specific IP range
severity:high AND source_ip:192.168.1.*

# TCP flows larger than 1MB
protocol:tcp AND bytes:>1000000

# Active rules that block traffic
status:active AND action:block

# Online devices from Apple
online:true AND mac_vendor:Apple
```text

### OR Operator

Use `OR` to match any of the specified conditions:

```text
# High or critical severity alarms
severity:high OR severity:critical

# TCP or UDP protocols
protocol:tcp OR protocol:udp

# Block or timelimit actions
action:block OR action:timelimit

# Devices that are either offline or have low activity
online:false OR activity_level:low
```text

### NOT Operator

Use `NOT` to exclude specific conditions:

```text
# All protocols except TCP
NOT protocol:tcp

# Non-blocked flows
NOT blocked:true

# All devices except those from Apple
NOT mac_vendor:Apple

# All alarms except low severity
NOT severity:low
```text

### Combining Operators

Use parentheses to group conditions and create complex logic:

```text
# High severity alarms that are either TCP or UDP, but not from internal network
severity:high AND (protocol:tcp OR protocol:udp) AND NOT source_ip:192.168.*

# Blocked flows over 10MB or any critical alarms
(blocked:true AND bytes:>10000000) OR severity:critical

# Rules targeting social media or gaming, but not entertainment
(target_value:*facebook* OR target_value:*gaming*) AND NOT category:entertainment
```text

## Wildcards and Patterns

Use wildcards to match patterns and partial values.

### Asterisk Wildcard (*)

The `*` wildcard matches zero or more characters:

```text
# Any Facebook-related domains
target_value:*facebook*

# IP addresses starting with 192.168
source_ip:192.168.*

# Any Apple devices
mac_vendor:*Apple*

# Rules targeting any social media
target_value:*social*

# Devices with names containing "laptop"
name:*laptop*
```text

### Pattern Matching Examples

```text
# Internal network ranges
source_ip:192.168.* OR source_ip:10.*

# Social media domains
target_value:*facebook* OR target_value:*twitter* OR target_value:*instagram*

# Gaming traffic
target_value:*gaming* OR target_value:*steam* OR target_value:*xbox*

# Mobile devices
mac_vendor:*Apple* OR mac_vendor:*Samsung* OR device_type:mobile
```text

## Ranges and Comparisons

Use comparison operators to filter by numeric values and ranges.

### Comparison Operators

- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal to
- `<=` - Less than or equal to
- `=` - Equal to (same as `:`)
- `!=` - Not equal to

### Numeric Comparisons

```text
# Large flows (over 100MB)
bytes:>100000000

# High bandwidth usage
bandwidth:>=50000000

# Recent timestamps (Unix timestamp)
timestamp:>1640995200

# Rule hit counts
hit_count:>=100

# Low severity scores
severity_score:<=3
```text

### Range Syntax

Use `[min TO max]` for inclusive ranges:

```text
# Medium-sized flows (1MB to 50MB)
bytes:[1000000 TO 50000000]

# Specific time range
timestamp:[1640995200 TO 1641081600]

# Port ranges
port:[80 TO 443]

# Severity score ranges
severity_score:[5 TO 8]
```text

### Date and Time Ranges

```text
# Timestamp ranges (Unix epoch)
timestamp:[1640995200 TO 1641081600]

# Recent activity (last hour, assuming current time)
timestamp:>NOW-1h

# Activity within date range
ts:[2024-01-01 TO 2024-01-31]
```text

## Complex Nested Queries

Build sophisticated queries using nested conditions and complex logic.

### Multi-Level Grouping

```text
# Complex security analysis
(severity:high OR severity:critical) AND
(protocol:tcp OR protocol:udp) AND
source_ip:192.168.* AND
NOT destination_ip:10.*

# Advanced threat detection
(type:intrusion OR type:malware) AND
(bytes:>10000000 OR hit_count:>50) AND
NOT status:resolved

# Comprehensive rule analysis
(action:block OR action:timelimit) AND
(direction:inbound OR direction:bidirection) AND
target_value:*social* AND
hit_count:>10
```text

### Geographic Queries

```text
# Suspicious activity from high-risk countries
country:China OR country:Russia AND severity:>=medium

# Traffic from cloud providers
is_cloud:true AND bytes:>1000000

# VPN traffic analysis
is_vpn:true AND (protocol:tcp OR protocol:udp)
```text

### Device and Network Analysis

```text
# Offline devices with recent activity
online:false AND last_seen:>NOW-24h

# High bandwidth consumers
(download:>100000000 OR upload:>100000000) AND device_type:computer

# Gaming traffic analysis
application:gaming AND bytes:>50000000 AND protocol:udp
```text

## Field-Specific Syntax

Different data types support different fields. Here are the most commonly used fields for each search tool.

### Flow Search Fields

```text
# Network identifiers
source_ip:192.168.1.100
destination_ip:8.8.8.8
protocol:tcp
port:443

# Traffic metrics
bytes:>1000000
download:>500000
upload:>500000
duration:>30

# Flow attributes
blocked:true
direction:outbound
application:youtube
device_id:device123

# Geographic data
country:United States
continent:North America
asn:AS15169
is_cloud:true
```text

### Alarm Search Fields

```text
# Alarm classification
type:intrusion
severity:high
status:active
direction:inbound

# Source information
source_ip:192.168.1.*
remote_ip:suspicious_ip
device_ip:192.168.1.100

# Threat details
protocol:tcp
port:22
message:*brute*force*

# Geographic threat data
remote_country:China
remote_continent:Asia
geo_risk_score:>0.8
```text

### Rule Search Fields

```text
# Rule identification
id:rule123
name:*social*media*
description:*block*

# Rule configuration
action:block
direction:bidirection
status:active

# Target specification
target_type:domain
target_value:*.facebook.com
category:social

# Rule metrics
hit_count:>100
last_hit:>NOW-24h
enabled:true
```text

### Device Search Fields

```text
# Device identification
id:device123
name:Johns-iPhone
ip:192.168.1.100
mac:aa:bb:cc:dd:ee:ff

# Device attributes
online:true
device_type:mobile
mac_vendor:Apple
os:iOS

# Activity metrics
last_seen:>NOW-1h
bandwidth_usage:>100000000
connection_count:>50
```text

### Target List Search Fields

```text
# List identification
id:list123
name:*social*
category:social
owner:admin

# List contents
entry_count:>1000
target_type:domain
last_updated:>NOW-7d

# List attributes
enabled:true
source:global
list_type:whitelist
```text

## Cache Control and Real-Time Data

The Firewalla MCP Server uses intelligent caching to provide fast responses while ensuring data freshness. Understanding the cache behavior helps you get the most current data when needed.

### Cache Timing by Data Type

Different types of data have different cache durations based on how frequently they change:

```text
# Real-time security data (15 seconds)
get_active_alarms
search_alarms

# Real-time network data (15 seconds)
get_flow_data
search_flows

# Semi-dynamic data (5 minutes default)
get_device_status
get_network_rules
search_devices
search_rules

# Statistical data (longer cache)
get_simple_statistics
get_flow_trends
```text

### Force Refresh Parameter

For time-sensitive operations, you can bypass the cache using the `force_refresh` parameter:

```text
# Get the absolute latest security alarms (bypasses cache)
get_active_alarms force_refresh:true limit:50

# Real-time network flow analysis
search_flows query:"severity:high" force_refresh:true limit:100

# Check device status without cache delay
get_device_status force_refresh:true limit:25
```text

### Cache Information in Responses

Tools that support caching return cache metadata in their responses:

```json
{
  "cache_info": {
    "ttl_seconds": 15,
    "from_cache": false,
    "last_updated": "2024-01-15T10:30:45Z"
  }
}
```text

**Cache Fields Explained:**
- `ttl_seconds`: How long this data will be cached (0 means not cached)
- `from_cache`: Whether this response came from cache or fresh API call
- `last_updated`: When this data was last retrieved from the API

### When to Use Force Refresh

Use `force_refresh=true` in these scenarios:

**Security Incident Response:**
```text
# Get the latest threats immediately
get_active_alarms force_refresh:true severity:critical limit:20

# Real-time investigation of suspicious activity
search_flows query:"source_ip:suspicious_ip" force_refresh:true limit:100
```text

**Real-Time Monitoring:**
```text
# Live bandwidth monitoring
get_bandwidth_usage force_refresh:true limit:10

# Current device status during troubleshooting
search_devices query:"online:false" force_refresh:true limit:50
```text

**Performance Considerations:**
- Force refresh bypasses cache, so responses may be slower
- Use sparingly to avoid overwhelming the Firewalla API
- Regular queries use cached data for better performance
- Cache timestamps help you decide when fresh data is needed

## Common Query Patterns

Here are frequently used query patterns for different scenarios.

### Security Analysis

```text
# High-priority security threats
severity:critical OR (severity:high AND NOT status:resolved)

# Suspicious inbound traffic
direction:inbound AND (country:China OR country:Russia) AND bytes:>1000000

# Brute force attempts
type:intrusion AND message:*brute*force* AND source_ip:NOT 192.168.*

# Malware communications
type:malware OR (application:*trojan* OR application:*backdoor*)
```text

### Network Performance

```text
# High bandwidth consumers
bytes:>100000000 OR bandwidth_usage:>50000000

# Slow connections
duration:>300 AND bytes:<1000000

# Gaming traffic
application:gaming OR (protocol:udp AND port:[27000 TO 28000])

# Video streaming
application:youtube OR application:netflix OR target_value:*streaming*
```text

### Device Management

```text
# Offline devices
online:false AND last_seen:>NOW-24h

# Mobile devices
device_type:mobile OR mac_vendor:Apple OR mac_vendor:Samsung

# Suspicious devices
(bandwidth_usage:>500000000 OR connection_count:>100) AND device_type:unknown

# Recently connected devices
last_seen:>NOW-1h AND NOT name:*known*
```text

### Rule Management

```text
# Active blocking rules
action:block AND status:active AND enabled:true

# High-activity rules
hit_count:>1000 AND last_hit:>NOW-24h

# Social media rules
target_value:*facebook* OR target_value:*twitter* OR category:social

# Recently modified rules
modified:>NOW-7d AND status:active
```text

## Query Validation

The server performs extensive validation on all queries to ensure safety and correctness.

### Validation Rules

1. **Syntax Validation**: Checks for balanced parentheses, quotes, and brackets
2. **Security Validation**: Prevents injection attacks and malicious patterns
3. **Field Validation**: Ensures field names are valid for the search type
4. **Value Validation**: Validates data types and ranges for field values
5. **Length Limits**: Queries are limited to 2000 characters

### Common Validation Errors

```text
# Unmatched parentheses
severity:high AND (protocol:tcp OR protocol:udp
# Error: Unmatched parentheses in query

# Invalid field name
invalid_field:value
# Error: Field 'invalid_field' is not allowed

# Invalid comparison
severity:>high
# Error: Cannot use comparison operator with non-numeric value

# Dangerous content
source_ip:'; DROP TABLE flows; --
# Error: Query contains potentially dangerous content
```text

## Best Practices

### Query Optimization

1. **Use Specific Fields**: Start with the most selective fields first
2. **Limit Wildcards**: Avoid leading wildcards (`*example`) when possible
3. **Use Ranges**: Use ranges instead of multiple OR conditions for numeric values
4. **Combine Filters**: Use AND to narrow results before expanding with OR

### Performance Tips

```text
# Good: Specific field first
severity:high AND source_ip:192.168.*

# Less optimal: Wildcard first
source_ip:* AND severity:high

# Good: Use ranges
bytes:[1000000 TO 50000000]

# Less optimal: Multiple conditions
bytes:>1000000 AND bytes:<50000000
```text

### Readable Queries

```text
# Good: Clear and structured
(severity:high OR severity:critical) AND
protocol:tcp AND
NOT source_ip:192.168.*

# Less readable: All on one line
severity:high OR severity:critical AND protocol:tcp AND NOT source_ip:192.168.*
```text

## Supported vs Unsupported Syntax

Understanding what query syntax is supported versus unsupported helps avoid common mistakes and ensures reliable query results.

### ✅ Fully Supported Syntax

#### Field Queries with Automatic Mapping
```text
# These user-friendly fields are automatically mapped to API fields
severity:high           # Maps to type:>=8
source_ip:192.168.1.*   # Maps to source.ip, device.ip, or srcIP
device_ip:10.0.0.100    # Maps to device.ip, ip, or ipAddress
bytes:>1000000          # Maps to bytes, download, or upload fields
online:true             # Maps to online or isOnline fields
```text

#### Logical Operators
```text
# Standard boolean logic - fully supported
severity:high AND protocol:tcp
action:block OR action:timelimit
NOT severity:low
(severity:high OR severity:critical) AND protocol:tcp
```text

#### Comparison Operators
```text
# All comparison operators work with numeric fields
bytes:>1000000          # Greater than
hit_count:<=100         # Less than or equal
timestamp:>=1640995200  # Greater than or equal
severity:>=medium       # Works with severity levels
port:!=80               # Not equal
```text

#### Wildcard Patterns
```text
# Asterisk wildcards are fully supported
target_value:*facebook*     # Contains pattern
source_ip:192.168.*        # Prefix pattern
name:*iPhone               # Suffix pattern
```text

#### Range Syntax
```text
# Inclusive ranges with TO keyword
bytes:[1000000 TO 50000000]
timestamp:[1640995200 TO 1641081600]
port:[80 TO 443]
```text

#### Geographic Fields
```text
# All geographic fields are supported with automatic mapping
country:China              # Maps to multiple geo field paths
continent:Asia             # Maps to various continent fields
asn:AS15169               # Maps to ASN fields in different locations
```text

### ⚠️ Partially Supported Syntax

#### Direct API Field Names
```text
# These may work but are not guaranteed to be consistent
device.ip:192.168.1.100    # May work but prefer device_ip:192.168.1.100
source.geo.country:China   # May work but prefer country:China
hit.count:>100             # May work but prefer hit_count:>100
```text

**Recommendation**: Always use the standardized field names documented in [Field Mappings](field-mappings.md) for guaranteed compatibility.

#### Complex Nested Paths
```text
# These work but may be fragile across API versions
device.network.segment:DMZ
geo.location.city:Beijing
ssl.certificate.issuer:LetsEncrypt
```text

**Recommendation**: Use simpler mapped field names where available (e.g., `city:Beijing` instead of `geo.location.city:Beijing`).

### ❌ Unsupported Syntax

#### SQL-Style Syntax
```text
# These SQL patterns are NOT supported
SELECT * FROM flows WHERE protocol = 'tcp'
field IN (value1, value2, value3)
field LIKE '%pattern%'
COUNT(*), SUM(bytes), AVG(duration)
```text

**Alternative**: Use the native query syntax with OR operators:
```text
protocol:tcp
field:value1 OR field:value2 OR field:value3
target_value:*pattern*
```text

#### Regular Expressions
```text
# Regex patterns are NOT supported in queries
source_ip:/^192\.168\.\d+\.\d+$/
name:/^[A-Za-z]+Phone$/
protocol:/tcp|udp/
```text

**Alternative**: Use wildcard patterns:
```text
source_ip:192.168.*
name:*Phone
protocol:tcp OR protocol:udp
```text

#### Date/Time Expressions
```text
# These time expressions are NOT supported
timestamp:TODAY
timestamp:LAST_WEEK
timestamp:NOW-1h
created_at:YESTERDAY
```text

**Alternative**: Use Unix timestamps or ISO dates:
```text
timestamp:>1640995200
timestamp:[2024-01-01 TO 2024-01-31]
```text

#### Advanced Mathematical Operations
```text
# Mathematical expressions are NOT supported
bytes:(upload + download)
ratio:(blocked / total)
percentage:(hits * 100 / total)
```text

**Alternative**: Use the available computed fields or perform calculations client-side after retrieving results.

#### Case-Sensitive Field Names
```text
# Field names are case-sensitive - these will NOT work
SOURCE_IP:192.168.1.100    # Should be source_ip
Protocol:tcp               # Should be protocol
SEVERITY:high              # Should be severity
```text

**Alternative**: Always use lowercase field names as documented.

#### Quoted Field Names
```text
# Field names should not be quoted
"source_ip":192.168.1.100  # Will not work
'protocol':tcp             # Will not work
```text

**Alternative**: Only quote values, not field names:
```text
source_ip:"192.168.1.100"  # Correct if value needs quotes
name:"John's iPhone"       # Correct for values with spaces
```text

### 🔄 Field Name Conversions

The system automatically handles these conversions:

| User Field | API Field Mapping | Status |
|------------|-------------------|---------|
| `severity:high` | `type:>=8` | ✅ Fully Supported |
| `device_ip:X` | `device.ip:X` OR `ip:X` | ✅ Automatic Mapping |
| `bytes:X` | `bytes:X` OR `download:X` OR `upload:X` | ✅ Multi-path Mapping |
| `online:true` | `online:true` OR `isOnline:true` | ✅ Boolean Conversion |
| `country:X` | `destination.geo.country:X` OR `source.geo.country:X` | ✅ Geographic Mapping |

### 📋 Query Validation Rules

The server validates all queries against these rules:

#### Syntax Requirements
- Balanced parentheses: `(condition1 AND condition2)`
- Proper quote matching: `name:"John's iPhone"`
- Valid operator placement: `field:value` not `:field:value`
- Maximum query length: 2000 characters

#### Security Validation
- No SQL injection patterns
- No script injection attempts
- No dangerous file path patterns
- No system command patterns

#### Field Validation
- Field names must exist for the target entity type
- Field names are case-sensitive
- Field values must match expected data types
- Comparison operators only work with numeric fields

### 💡 Best Practices for Supported Syntax

#### Use Mapped Field Names
```text
# Good: Use documented field mappings
severity:high AND device_ip:192.168.1.*

# Avoid: Direct API paths (may break)
type:>=8 AND device.ip:192.168.1.*
```text

#### Leverage Automatic Conversions
```text
# Good: Let the system handle conversions
severity:>=medium
online:false
bytes:>1MB

# The system converts these appropriately
```text

#### Structure Complex Queries
```text
# Good: Well-structured with parentheses
(severity:high OR severity:critical) AND
(protocol:tcp OR protocol:udp) AND
NOT source_ip:192.168.*

# Avoid: Ambiguous precedence
severity:high OR severity:critical AND protocol:tcp
```text

#### Use Consistent Geographic Fields
```text
# Good: Use standard geographic field names
country:China AND continent:Asia

# These are mapped to appropriate API field paths automatically
```text

For a complete reference of field mappings and supported field names, see [Field Mappings Documentation](field-mappings.md).

## Troubleshooting

### Common Issues

#### Query Returns No Results

1. **Check Field Names**: Ensure field names are spelled correctly and case-sensitive
2. **Verify Data Exists**: Confirm the data you're searching for exists in the system
3. **Simplify Query**: Start with a simple query and add conditions incrementally
4. **Check Wildcards**: Ensure wildcard patterns are correct

```text
# Start simple
severity:high

# Add conditions gradually
severity:high AND protocol:tcp
severity:high AND protocol:tcp AND source_ip:192.168.*
```text

#### Syntax Errors

1. **Balance Parentheses**: Ensure all opening parentheses have matching closing ones
2. **Quote Strings**: Use quotes around values containing spaces or special characters
3. **Escape Special Characters**: Use backslashes to escape special characters when needed

```text
# Good: Quoted string with spaces
name:"John's iPhone"

# Good: Escaped special characters
target_value:example\.com

# Bad: Unquoted string with spaces
name:John's iPhone
```text

#### Performance Issues

1. **Add Specific Filters**: Include specific fields to reduce the search space
2. **Use Appropriate Limits**: Set reasonable limits to avoid large result sets
3. **Avoid Complex Wildcards**: Minimize the use of leading wildcards

```text
# Good: Specific and limited
severity:high AND source_ip:192.168.1.* LIMIT 100

# Problematic: Too broad
source_ip:* LIMIT 10000
```text

### Debug Techniques

1. **Test Components**: Break complex queries into smaller parts
2. **Use Count Queries**: Use aggregation to check result counts before fetching data
3. **Check Field Values**: Verify the exact format of field values in your data
4. **Start Broad**: Begin with broad queries and narrow them down

### Getting Help

If you encounter issues with query syntax:

1. Check the validation errors returned by the server
2. Review the [Field Mappings Documentation](field-mappings.md) for correct field names and conversions
3. Consult the [Supported vs Unsupported Syntax](#supported-vs-unsupported-syntax) section above
4. Use simple queries to verify your data and field names
5. Review the field-specific documentation for each search tool
6. Consult the API reference documentation for exact field specifications

## Examples by Use Case

### Security Monitoring

```text
# Monitor for critical threats
severity:critical AND NOT status:resolved

# Detect brute force attacks
type:intrusion AND source_ip:NOT 192.168.* AND hit_count:>10

# Find malware communications
(type:malware OR application:*trojan*) AND bytes:>1000000

# Geographic threat analysis
(country:China OR country:Russia) AND severity:>=medium
```text

### Network Optimization

```text
# Identify bandwidth hogs
bytes:>100000000 AND device_type:computer

# Find slow connections
duration:>300 AND bytes:<1000000

# Monitor streaming traffic
application:youtube OR application:netflix OR target_value:*video*

# Analyze gaming traffic
protocol:udp AND port:[27000 TO 28000] AND bytes:>10000000
```text

### Compliance and Auditing

```text
# Review blocking rules
action:block AND status:active AND hit_count:>0

# Monitor social media access
category:social OR target_value:*facebook* OR target_value:*twitter*

# Track file sharing
application:*torrent* OR protocol:bittorrent OR port:6881

# Review administrative access
port:22 OR port:3389 OR application:ssh OR application:rdp
```text

This comprehensive guide should help you build effective queries for all your Firewalla MCP Server search needs. Remember to start simple and build complexity gradually, always validating your results as you refine your queries.