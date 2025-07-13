#!/bin/bash

echo "=== COMPREHENSIVE FIREWALLA MCP TOOLS TEST ==="
echo "Testing all 35 tools across 7 categories"
echo ""

# Security Tools (3)
echo "1. SECURITY TOOLS (3 tools)"
echo "Testing: get_active_alarms, get_specific_alarm, delete_alarm"
npm test -- --testPathPattern="security" --testNamePattern="get_active_alarms|get_specific_alarm|delete_alarm" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Network Tools (3)
echo "2. NETWORK TOOLS (3 tools)"
echo "Testing: get_flow_data, get_bandwidth_usage, get_offline_devices"
npm test -- --testPathPattern="network" --testNamePattern="get_flow_data|get_bandwidth_usage|get_offline_devices" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Device Tools (1)
echo "3. DEVICE TOOLS (1 tool)"
echo "Testing: get_device_status"
npm test -- --testPathPattern="device" --testNamePattern="get_device_status" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Rule Tools (7)
echo "4. RULE TOOLS (7 tools)"
echo "Testing: get_network_rules, pause_rule, resume_rule, get_target_lists, get_network_rules_summary, get_most_active_rules, get_recent_rules"
npm test -- --testPathPattern="rules" --testNamePattern="get_network_rules|pause_rule|resume_rule|get_target_lists|get_network_rules_summary|get_most_active_rules|get_recent_rules" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Analytics Tools (7)
echo "5. ANALYTICS TOOLS (7 tools)"
echo "Testing: get_boxes, get_simple_statistics, get_statistics_by_region, get_statistics_by_box, get_flow_trends, get_alarm_trends, get_rule_trends"
npm test -- --testPathPattern="analytics|statistics" --testNamePattern="get_boxes|get_simple_statistics|get_statistics_by_region|get_statistics_by_box|get_flow_trends|get_alarm_trends|get_rule_trends" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Search Tools (11)
echo "6. SEARCH TOOLS (11 tools)"
echo "Testing: search_flows, search_alarms, search_rules, search_devices, search_target_lists, search_cross_reference, search_enhanced_cross_reference, get_correlation_suggestions, search_flows_by_geography, search_alarms_by_geography, get_geographic_statistics"
npm test -- --testPathPattern="search|geographic|correlation" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

# Bulk Operations (3)
echo "7. BULK OPERATIONS (3 tools)"
echo "Testing: bulk_delete_alarms, bulk_pause_rules, bulk_resume_rules"
npm test -- --testPathPattern="bulk" --testNamePattern="bulk_delete_alarms|bulk_pause_rules|bulk_resume_rules" 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)" | tail -5
echo ""

echo "=== TEST SUMMARY ==="
npm test 2>&1 | grep -E "Test Suites:|Tests:" | tail -2