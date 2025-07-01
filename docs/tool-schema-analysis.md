# Tool Schema Analysis Report

## Overview

Total Tools Analyzed: 35

## Priority Categories

### 🚨 CRITICAL (5 tools)
High complexity tools with high-risk field syntax examples. **Immediate attention required**.

#### search_flows
- **Risk**: HIGH | **Complexity**: HIGH
- **Description**: Advanced flow searching with complex query syntax

#### search_alarms
- **Risk**: HIGH | **Complexity**: HIGH
- **Description**: Advanced alarm searching with severity, time, and IP filters

#### search_rules
- **Risk**: HIGH | **Complexity**: HIGH
- **Description**: Advanced rule searching with target, action, and status filters

#### search_devices
- **Risk**: HIGH | **Complexity**: HIGH
- **Description**: Advanced device searching with network, status, and usage filters

#### search_target_lists
- **Risk**: HIGH | **Complexity**: HIGH
- **Description**: Advanced target list searching with category and ownership filters


### ⚠️ IMPORTANT (1 tools)

#### search_cross_reference
- **Risk**: MEDIUM | **Complexity**: HIGH
- **Description**: Multi-entity searches with correlation across different data types


### 📋 MODERATE (2 tools)

#### firewalla-mcp-server
- **Risk**: MEDIUM | **Complexity**: MEDIUM
- **Description**: Retrieve current security alerts and alarms

#### get_flow_data
- **Risk**: MEDIUM | **Complexity**: MEDIUM
- **Description**: Query network traffic flows with pagination


### ✅ SIMPLE (27 tools)

#### get_device_status
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Check online/offline status of devices

#### get_offline_devices
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get all offline devices with last seen timestamps

#### get_bandwidth_usage
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get top bandwidth consuming devices

#### get_network_rules
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Retrieve firewall rules and conditions

#### pause_rule
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Temporarily disable a specific firewall rule

#### get_target_lists
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Access security target lists (CloudFlare, CrowdSec)

#### resume_rule
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Resume a previously paused firewall rule

#### get_specific_alarm
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get detailed information for a specific alarm

#### delete_alarm
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Delete/dismiss a specific alarm

#### get_boxes
- **Risk**: LOW | **Complexity**: LOW
- **Description**: List all managed Firewalla boxes

#### get_simple_statistics
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get basic statistics about boxes, alarms, and rules

#### get_statistics_by_region
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get flow statistics grouped by country/region

#### get_statistics_by_box
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get statistics for each Firewalla box with activity scores

#### get_flow_trends
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get historical flow data trends over time

#### get_alarm_trends
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get historical alarm data trends over time

#### get_rule_trends
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get historical rule activity trends over time

#### get_network_rules_summary
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get overview statistics and counts of network rules by category

#### get_most_active_rules
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get rules with highest hit counts for traffic analysis

#### get_recent_rules
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Get recently created or modified firewall rules

#### security_report
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Generate comprehensive security status report

#### include_resolved
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Include resolved issues

#### threat_analysis
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Deep dive into recent security threats and patterns

#### bandwidth_analysis
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Investigate high bandwidth usage patterns

#### threshold_mb
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Minimum bandwidth threshold in MB

#### device_investigation
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Detailed analysis of specific device activity

#### lookback_hours
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Hours to look back

#### network_health_check
- **Risk**: LOW | **Complexity**: LOW
- **Description**: Overall network status and performance assessment


## Next Steps

1. **Phase 2 Batch 1**: Audit CRITICAL tools immediately
2. **Phase 2 Batch 2**: Validate IMPORTANT tools  
3. **Phase 2 Batch 3**: Review MODERATE tools
4. **Phase 3**: Apply corrections and validate

Generated: 2025-06-29T16:18:30.739Z
