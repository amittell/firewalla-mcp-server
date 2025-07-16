# Advanced Query Syntax Examples for Firewalla MCP Tools

This guide provides comprehensive query syntax examples and patterns for advanced search capabilities across all Firewalla MCP Server tools.

## Table of Contents

- [Overview](#overview)
- [Basic Query Syntax](#basic-query-syntax)
- [Logical Operators](#logical-operators)
- [Field-Specific Queries](#field-specific-queries)
- [Tool-Specific Query Examples](#tool-specific-query-examples)
- [Geographic Query Patterns](#geographic-query-patterns)
- [Performance-Optimized Queries](#performance-optimized-queries)
- [Complex Correlation Queries](#complex-correlation-queries)
- [Common Query Patterns](#common-query-patterns)
- [Troubleshooting Query Issues](#troubleshooting-query-issues)

## Overview

The Firewalla MCP Server supports sophisticated query syntax for searching and filtering data across flows, alarms, devices, rules, and other entities. Understanding these patterns enables powerful analysis capabilities while maintaining optimal performance.

### Query Syntax Philosophy

- **Intuitive**: Human-readable field:value patterns
- **Flexible**: Support for wildcards, ranges, and complex logic
- **Performant**: Optimized for server-side processing
- **Safe**: Protected against injection and malformed queries
- **Consistent**: Same syntax across all search tools

## Basic Query Syntax

### Simple Field Queries

```bash
# Exact match
protocol:tcp
severity:high
status:active
online:true

# Case-insensitive matching
country:china        # Matches "China", "CHINA", "china"
device_name:laptop   # Matches various laptop naming patterns
```text

### Wildcard Patterns

```bash
# Prefix matching
source_ip:192.168.*
device_name:iPhone*
target_value:*.facebook.com

# Suffix matching
mac_address:*:aa:bb:cc
application:*browser

# Contains matching
device_name:*laptop*
user_agent:*Chrome*
```text

### Range Queries

```bash
# Numeric ranges
bytes:[1000 TO 50000]
severity_score:[0.5 TO 1.0]
port:[80 TO 443]
hit_count:[10 TO 100]

# Date/time ranges
timestamp:[2024-01-01 TO 2024-01-31]
last_seen:[NOW-24h TO NOW]
created:[NOW-7d TO NOW-1d]

# Open-ended ranges
bytes:>1000000         # Greater than 1MB
timestamp:<NOW-1h      # Older than 1 hour
severity_score:>=0.8   # High severity
```text

### Comparison Operators

```bash
# Numeric comparisons
bytes:>10000000        # Larger than 10MB
duration:<300          # Less than 5 minutes
hit_count:>=10         # 10 or more hits
priority:<=2           # Priority 2 or lower

# Date comparisons
timestamp:>NOW-24h     # Within last 24 hours
last_seen:<NOW-1h      # Not seen in last hour
created:>=2024-01-01   # Created this year or later
```text

## Logical Operators

### AND Operations

```bash
# Basic AND
severity:high AND protocol:tcp
online:true AND mac_vendor:Apple
blocked:true AND country:China

# Multiple field AND
severity:high AND protocol:tcp AND source_ip:192.168.*
device_type:laptop AND online:true AND last_seen:>NOW-1h
```text

### OR Operations

```bash
# Basic OR
severity:high OR severity:critical
protocol:tcp OR protocol:udp
country:China OR country:Russia

# Multiple value OR
(severity:high OR severity:critical OR severity:medium) AND protocol:tcp
device_type:phone OR device_type:tablet OR device_type:laptop
```text

### NOT Operations

```bash
# Basic negation
NOT blocked:true
NOT source_ip:192.168.*
NOT severity:low

# Combined with other operators
severity:high AND NOT source_ip:192.168.*
protocol:tcp AND NOT blocked:true AND NOT destination_port:80
```text

### Complex Grouping

```bash
# Parentheses for grouping
(severity:high OR severity:critical) AND protocol:tcp
(source_ip:192.168.* OR source_ip:10.0.*) AND NOT blocked:true
(device_type:laptop OR device_type:desktop) AND (online:true AND last_seen:>NOW-1h)

# Nested grouping
((severity:high AND protocol:tcp) OR (severity:critical AND protocol:udp)) AND NOT source_ip:192.168.*
```text

## Field-Specific Queries

### Network Fields

```bash
# IP addresses and networks
source_ip:192.168.1.1
source_ip:192.168.*
source_ip:[192.168.1.1 TO 192.168.1.255]
destination_ip:10.0.0.0/8

# Protocols and ports
protocol:tcp
protocol:(tcp OR udp)
port:443
port:[80 TO 443]
destination_port:>1024

# Network metrics
bytes:>1000000
duration:[10 TO 300]
packet_count:>100
bandwidth_usage:>50000000
```text

### Security Fields

```bash
# Severity and threat scoring
severity:high
severity:(high OR critical)
severity:>=medium
threat_score:>0.8
risk_level:high

# Security indicators
blocked:true
malware_detected:true
intrusion_attempt:true
suspicious_activity:true
threat_type:malware

# Resolution status
resolved:false
acknowledged:true
priority:urgent
status:active
```text

### Device Fields

```bash
# Device identification
device_id:abc123
device_name:*iPhone*
mac_address:aa:bb:cc:dd:ee:ff
mac_vendor:Apple
device_type:laptop

# Device status
online:true
last_seen:>NOW-1h
connection_status:connected
wifi_connected:true
ethernet_connected:false

# Device characteristics
os_type:iOS
browser:Chrome
user_agent:*Safari*
hostname:*MacBook*
```text

### Geographic Fields

```bash
# Country and region
country:China
country:(China OR Russia OR Iran)
continent:Asia
region:Eastern\ Europe
city:Beijing

# Network infrastructure
asn:AS4134
asn:(AS4134 OR AS8075)
hosting_provider:cloudflare
is_cloud_provider:true
is_vpn:false

# Risk scoring
geographic_risk_score:>0.7
high_risk_country:true
known_threat_source:true
```text

### Temporal Fields

```bash
# Relative time queries
timestamp:>NOW-1h        # Last hour
timestamp:>NOW-24h       # Last 24 hours
timestamp:>NOW-7d        # Last week
last_seen:<NOW-1h        # Not seen recently

# Absolute time queries
timestamp:>2024-01-01
created:[2024-01-01 TO 2024-01-31]
last_modified:>=2024-01-15T10:00:00Z

# Time range combinations
(timestamp:>NOW-24h AND timestamp:<NOW-1h) AND severity:high
```text

## Tool-Specific Query Examples

### Flow Search Queries (`search_flows`)

```bash
# Network traffic analysis
search_flows query:"protocol:tcp AND destination_port:443 AND bytes:>1000000"

# Security-focused flow search
search_flows query:"blocked:true AND (country:China OR country:Russia) AND bytes:>10000000"

# Performance monitoring
search_flows query:"protocol:tcp AND duration:>30 AND source_ip:192.168.*"

# Application traffic analysis
search_flows query:"application:torrent OR application:p2p OR destination_port:[6881 TO 6999]"

# Geographic threat analysis
search_flows query:"(country:China OR country:Russia OR country:Iran) AND severity:>=medium"
```text

### Alarm Search Queries (`search_alarms`)

```bash
# High-priority security alerts
search_alarms query:"severity:critical AND NOT resolved:true"

# Intrusion detection
search_alarms query:"type:intrusion_detection AND source_ip:* AND timestamp:>NOW-24h"

# Malware detection
search_alarms query:"malware_detected:true AND (country:China OR country:Russia)"

# Network anomaly detection
search_alarms query:"type:network_anomaly AND bytes:>50000000 AND protocol:tcp"

# False positive filtering
search_alarms query:"severity:high AND NOT (source_ip:192.168.* OR source_ip:10.0.*)"
```text

### Device Search Queries (`search_devices`)

```bash
# Device inventory management
search_devices query:"device_type:laptop AND mac_vendor:Apple AND online:true"

# Offline device detection
search_devices query:"online:false AND last_seen:<NOW-24h"

# Mobile device management
search_devices query:"(device_type:phone OR device_type:tablet) AND os_type:iOS"

# Network security audit
search_devices query:"device_type:unknown OR mac_vendor:unknown OR hostname:*unknown*"

# Performance monitoring
search_devices query:"bandwidth_usage:>100000000 AND connection_type:wifi"
```text

### Rule Search Queries (`search_rules`)

```bash
# Active security rules
search_rules query:"action:block AND status:active AND hit_count:>0"

# Social media blocking rules
search_rules query:"target_value:*.facebook.com OR target_value:*.twitter.com OR target_value:*.instagram.com"

# Unused rule detection
search_rules query:"hit_count:0 AND created:<NOW-30d"

# Time-based rule analysis
search_rules query:"schedule:* AND action:timelimit"

# High-impact rules
search_rules query:"hit_count:>1000 AND action:block"
```text

### Target List Queries (`search_target_lists`)

```bash
# Malware domain lists
search_target_lists query:"category:malware AND owner:global"

# Advertisement blocking
search_target_lists query:"category:ad AND (owner:user OR owner:custom)"

# Social media categories
search_target_lists query:"category:social_media AND target_count:>1000"

# Custom rule lists
search_target_lists query:"owner:custom AND last_updated:>NOW-7d"
```text

## Geographic Query Patterns

### Multi-Country Analysis

```bash
# High-risk country analysis
search_flows_by_geography query:"blocked:true" geographic_filters:"{countries:[\"China\",\"Russia\",\"Iran\"],min_risk_score:0.8}"

# Continental traffic analysis
search_flows_by_geography query:"bytes:>10000000" geographic_filters:"{continents:[\"Asia\",\"Europe\"]}"

# Regional threat hunting
search_alarms_by_geography query:"severity:>=medium" geographic_filters:"{regions:[\"Eastern Europe\",\"Middle East\"]}"
```text

### Infrastructure-Based Queries

```bash
# Cloud provider analysis
search_flows_by_geography query:"protocol:tcp" geographic_filters:"{hosting_providers:[\"amazon\",\"cloudflare\"],exclude_cloud:false}"

# ASN-specific analysis
search_flows_by_geography query:"blocked:true" geographic_filters:"{asns:[\"AS4134\",\"AS8075\"]}"

# VPN/Proxy detection
search_flows_by_geography query:"bytes:>50000000" geographic_filters:"{exclude_vpn:true,exclude_cloud:true}"
```text

### Risk-Based Geographic Filtering

```bash
# High-risk geographic analysis
search_alarms_by_geography query:"severity:high" geographic_filters:"{high_risk_countries:true,threat_analysis:true}"

# Geographic risk scoring
search_flows_by_geography query:"duration:>300" geographic_filters:"{min_risk_score:0.9}"
```text

## Performance-Optimized Queries

### Time-Bounded Queries

```bash
# Recent activity focus (fast)
search_flows query:"timestamp:>NOW-1h AND severity:high" limit:500

# Specific time windows (optimal)
search_alarms query:"timestamp:[NOW-24h TO NOW-1h] AND severity:critical" limit:100

# Avoid broad time ranges (slow)
# search_flows query:"timestamp:>NOW-30d" limit:2000  # Can timeout
```text

### Field-Specific Optimizations

```bash
# Use specific protocols (fast)
search_flows query:"protocol:tcp AND destination_port:443" limit:1000

# Combine multiple specific filters (efficient)
search_devices query:"device_type:laptop AND mac_vendor:Apple AND online:true" limit:500

# Avoid broad wildcards (slow)
# search_flows query:"source_ip:*" limit:2000  # Can be very slow
```text

### Limit Optimization Patterns

```bash
# Progressive limit increase
# Start small
search_flows query:"severity:high" limit:100

# If successful, increase gradually
search_flows query:"severity:high" limit:500

# Use pagination for large datasets
search_flows query:"severity:high" limit:500 cursor:"eyJ0aW1l..."
```text

## Complex Correlation Queries

### Cross-Reference Examples

```bash
# Security incident correlation
search_cross_reference primary_query:"blocked:true AND country:China" secondary_queries:"[\"severity:high\",\"type:malware_detection\"]" correlation_field:"source_ip" limit:1000

# Network behavior correlation
search_enhanced_cross_reference primary_query:"bytes:>100000000" secondary_queries:"[\"device_type:laptop\",\"application:torrent\"]" correlation_params:"{correlationFields:[\"device_ip\",\"application\"],correlationType:\"AND\"}" limit:500
```text

### Multi-Entity Analysis

```bash
# Device and flow correlation
search_enhanced_cross_reference primary_query:"online:false" secondary_queries:"[\"blocked:true\",\"severity:high\"]" correlation_params:"{correlationFields:[\"device_ip\",\"source_ip\"],temporalWindow:{windowSize:30,windowUnit:\"minutes\"}}" limit:200

# Geographic and security correlation
search_enhanced_cross_reference primary_query:"country:China OR country:Russia" secondary_queries:"[\"malware_detected:true\",\"intrusion_attempt:true\"]" correlation_params:"{correlationFields:[\"source_ip\",\"country\"],networkScope:{includeSubnets:true}}" limit:300
```text

## Common Query Patterns

### Security Investigation Patterns

```bash
# Threat hunting workflow
# 1. Identify suspicious activity
search_alarms query:"severity:critical AND NOT resolved:true" limit:50

# 2. Correlate with network flows
search_flows query:"source_ip:$SUSPICIOUS_IP AND timestamp:>NOW-1h" limit:200

# 3. Check device status
search_devices query:"device_ip:$SUSPICIOUS_IP OR last_seen:<NOW-1h" limit:10

# 4. Review applicable rules
search_rules query:"target_value:*$SUSPICIOUS_DOMAIN* OR source_ip:$SUSPICIOUS_IP" limit:20
```text

### Network Performance Analysis

```bash
# Bandwidth analysis workflow
# 1. Top bandwidth consumers
get_bandwidth_usage period:"24h" limit:100

# 2. High-volume flows
search_flows query:"bytes:>100000000 AND timestamp:>NOW-24h" limit:500

# 3. Performance impact devices
search_devices query:"bandwidth_usage:>50000000 AND connection_type:wifi" limit:200
```text

### Compliance and Audit Patterns

```bash
# Rule effectiveness audit
# 1. Active rules with hits
search_rules query:"status:active AND hit_count:>0" limit:1000

# 2. Unused rules identification
search_rules query:"hit_count:0 AND created:<NOW-90d" limit:500

# 3. Recent rule changes
search_rules query:"last_modified:>NOW-7d" limit:200

# 4. Rule summary analysis
get_network_rules_summary limit:2000
```text

## Troubleshooting Query Issues

### Common Query Problems

#### 1. Unmatched Parentheses
```bash
# Incorrect (will fail)
search_flows query:"severity:high AND (protocol:tcp"

# Correct
search_flows query:"severity:high AND (protocol:tcp)"
```text

#### 2. Unmatched Quotes
```bash
# Incorrect (will fail)
search_alarms query:"severity:\"high AND protocol:tcp"

# Correct
search_alarms query:"severity:high AND protocol:tcp"
# Or with proper escaping
search_alarms query:"message:\"threat detected\" AND severity:high"
```text

#### 3. Invalid Field Names
```bash
# Incorrect (will fail)
search_flows query:"invalid_field:value"

# Correct - use documented field names
search_flows query:"source_ip:192.168.1.1"
```text

#### 4. Range Syntax Errors
```bash
# Incorrect (will fail)
search_flows query:"bytes:1000-50000"

# Correct range syntax
search_flows query:"bytes:[1000 TO 50000]"
```text

### Performance Troubleshooting

#### Query Timeout Prevention

```bash
# High-risk queries (may timeout)
search_flows query:"timestamp:>NOW-30d" limit:2000
search_devices query:"online:true" limit:5000

# Optimized alternatives
search_flows query:"timestamp:>NOW-24h AND severity:high" limit:1000
search_devices query:"online:true AND device_type:laptop" limit:1000
```text

#### Memory Usage Optimization

```bash
# Memory-intensive queries
get_bandwidth_usage period:"30d" limit:1000

# Optimized for memory usage
get_bandwidth_usage period:"24h" limit:500
```text

### Query Validation Checklist

1. **Syntax Validation**:
   - All parentheses are matched: `()`, `(())`, etc.
   - All quotes are matched: `"text"`, `'text'`
   - Field names are valid and documented
   - Operators are correctly formatted

2. **Logic Validation**:
   - AND/OR logic is clear and properly grouped
   - NOT operations are correctly placed
   - Range queries use proper syntax: `[min TO max]`

3. **Performance Validation**:
   - Time ranges are reasonable (prefer <24h for large queries)
   - Limits are appropriate for query complexity
   - Wildcard usage is minimal and specific

4. **Field Validation**:
   - Field names match documented API fields
   - Value formats match field types (IPs, dates, numbers)
   - Enum values are valid (severity levels, protocols, etc.)

This comprehensive guide provides the foundation for creating powerful, efficient queries across all Firewalla MCP Server tools while maintaining optimal performance and avoiding common pitfalls.