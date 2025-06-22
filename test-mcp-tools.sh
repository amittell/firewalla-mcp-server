#!/bin/bash

# Test script for all Firewalla MCP tools
# This script tests each tool systematically and reports results

MCP_SERVER="./mcp-server.sh"
LOGFILE="mcp-test-results.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test an MCP tool
test_tool() {
    local tool_name=$1
    local args=$2
    local test_name=$3
    
    echo -e "${BLUE}Testing: $test_name${NC}"
    echo "Command: echo '{\"method\":\"tools/call\",\"params\":{\"name\":\"$tool_name\",\"arguments\":$args}}' | $MCP_SERVER"
    
    # Run the test
    result=$(echo "{\"method\":\"tools/call\",\"params\":{\"name\":\"$tool_name\",\"arguments\":$args}}" | timeout 30s $MCP_SERVER 2>&1)
    
    if [[ $? -eq 0 ]] && [[ $result != *"error"* ]] && [[ $result != *"Error"* ]]; then
        echo -e "${GREEN}✓ PASS: $test_name${NC}"
        echo "Result preview: $(echo "$result" | head -3 | tr '\n' ' ')"
        echo ""
        return 0
    else
        echo -e "${RED}✗ FAIL: $test_name${NC}"
        echo "Error: $result"
        echo ""
        return 1
    fi
}

# Initialize log
echo "Firewalla MCP Tools Test Results - $(date)" > $LOGFILE
echo "================================================" >> $LOGFILE

echo -e "${YELLOW}Starting systematic test of all 11 Firewalla MCP tools...${NC}"
echo ""

# Test 1: get_boxes (foundational - get available boxes first)
test_tool "get_boxes" "{}" "get_boxes - List all available Firewalla boxes"

# Test 2: get_active_alarms  
test_tool "get_active_alarms" "{\"limit\": 10}" "get_active_alarms - Get security alerts (limit 10)"

# Test 3: get_active_alarms with severity filter
test_tool "get_active_alarms" "{\"severity\": \"high\", \"limit\": 5}" "get_active_alarms - Get high severity alerts"

# Test 4: get_device_status
test_tool "get_device_status" "{\"include_offline\": true}" "get_device_status - Get all device status"

# Test 5: get_bandwidth_usage for different periods
test_tool "get_bandwidth_usage" "{\"period\": \"24h\", \"top\": 5}" "get_bandwidth_usage - Top 5 bandwidth users (24h)"
test_tool "get_bandwidth_usage" "{\"period\": \"7d\", \"top\": 3}" "get_bandwidth_usage - Top 3 bandwidth users (7d)" 

# Test 6: get_network_rules
test_tool "get_network_rules" "{\"active_only\": true}" "get_network_rules - Get active firewall rules"

# Test 7: get_target_lists
test_tool "get_target_lists" "{\"list_type\": \"all\"}" "get_target_lists - Get all security target lists"

# Test 8: get_flow_data
test_tool "get_flow_data" "{\"limit\": 10}" "get_flow_data - Get recent network flows (limit 10)"

echo -e "${YELLOW}Phase 1 complete. Now testing management functions that require existing data...${NC}"
echo ""

# We'll need to get actual IDs from the previous results for these tests
# For now, let's test with placeholder values and document what needs real IDs

echo -e "${BLUE}Note: The following tests require real IDs from the system:${NC}"
echo "- get_specific_alarm (needs alarm ID from get_active_alarms)"
echo "- pause_rule (needs rule ID from get_network_rules)" 
echo "- resume_rule (needs rule ID from previous pause_rule)"
echo "- delete_alarm (needs alarm ID - use caution!)"
echo ""

# Test 9: get_specific_alarm (will fail without real alarm ID)
echo -e "${YELLOW}Attempting get_specific_alarm with placeholder ID (expected to fail):${NC}"
test_tool "get_specific_alarm" "{\"alarm_id\": \"test_alarm_id\"}" "get_specific_alarm - Get specific alarm details"

# Test 10: pause_rule (will fail without real rule ID)
echo -e "${YELLOW}Attempting pause_rule with placeholder ID (expected to fail):${NC}"
test_tool "pause_rule" "{\"rule_id\": \"test_rule_id\", \"duration\": 5}" "pause_rule - Pause firewall rule for 5 minutes"

# Test 11: resume_rule (will fail without real rule ID)
echo -e "${YELLOW}Attempting resume_rule with placeholder ID (expected to fail):${NC}"
test_tool "resume_rule" "{\"rule_id\": \"test_rule_id\"}" "resume_rule - Resume paused firewall rule"

echo -e "${YELLOW}Basic tool structure tests complete!${NC}"
echo -e "${BLUE}To complete testing, you'll need to:${NC}"
echo "1. Run get_active_alarms to get real alarm IDs"
echo "2. Run get_network_rules to get real rule IDs"  
echo "3. Use those real IDs to test the management functions"
echo ""
echo "Test results summary saved to: $LOGFILE"