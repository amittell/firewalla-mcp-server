#!/bin/bash

# Comprehensive test script for all 11 Firewalla MCP tools
# Tests each tool and reports results

echo "======================================="
echo "Testing All Firewalla MCP Tools"
echo "======================================="

# Start the MCP server in the background
echo "Starting MCP server..."
node dist/server.js &
SERVER_PID=$!

# Give the server time to start
sleep 2

# Function to test a tool
test_tool() {
    local tool_name="$1"
    local args="$2"
    local description="$3"
    
    echo ""
    echo "---------------------------------------"
    echo "Testing: $tool_name"
    echo "Description: $description"
    echo "---------------------------------------"
    
    # Create the test request
    local request=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "$tool_name",
    "arguments": $args
  }
}
EOF
)
    
    echo "Request: $request"
    echo ""
    
    # Send the request and capture response
    echo "$request" | node dist/server.js 2>/dev/null | jq .
    
    echo ""
}

# Test 1: get_active_alarms (Previously problematic - should now have complete alarm data)
test_tool "get_active_alarms" '{"limit": 10}' "Retrieve active security alarms with complete alarm information"

# Test 2: get_device_status (Previously problematic - should now have detailed device info)
test_tool "get_device_status" '{"include_offline": true}' "Get device status with detailed device information"

# Test 3: get_network_rules (Previously problematic - should now have rule names and conditions)
test_tool "get_network_rules" '{"active_only": true}' "Retrieve network rules with complete rule details"

# Test 4: get_flow_data (Previously problematic - should now have detailed flow information)
test_tool "get_flow_data" '{"limit": 5, "page": 1}' "Get network flow data with complete flow details"

# Test 5: get_boxes (Previously working - verify still works)
test_tool "get_boxes" '{}' "List all available Firewalla boxes"

# Test 6: get_bandwidth_usage (Previously working - verify still works)
test_tool "get_bandwidth_usage" '{"period": "24h", "top": 5}' "Get top bandwidth consuming devices"

# Test 7: get_target_lists (Previously working - verify still works)  
test_tool "get_target_lists" '{"list_type": "all"}' "Retrieve security target lists"

# Test 8: pause_rule (Previously working - test with a dummy rule ID)
test_tool "pause_rule" '{"rule_id": "test-rule-123", "duration": 30}' "Pause a specific firewall rule"

# Test 9: resume_rule (Previously working - test with a dummy rule ID)
test_tool "resume_rule" '{"rule_id": "test-rule-123"}' "Resume a previously paused firewall rule"

# Test 10: get_specific_alarm (Previously working - test with a dummy alarm ID)
test_tool "get_specific_alarm" '{"alarm_id": "test-alarm-456"}' "Get details of a specific alarm"

# Test 11: delete_alarm (Previously working - test with a dummy alarm ID)
test_tool "delete_alarm" '{"alarm_id": "test-alarm-789"}' "Delete a specific alarm"

echo ""
echo "======================================="
echo "Testing Complete"
echo "======================================="

# Kill the server
kill $SERVER_PID

echo "Summary:"
echo "- Tested all 11 Firewalla MCP tools"
echo "- Focus areas: alarm IDs/descriptions, device details, rule names/conditions, flow information"
echo "- Previously problematic tools should now return complete data"
echo "- Previously working tools should continue to work correctly"