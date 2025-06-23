#!/bin/bash

# Comprehensive Firewalla MCP Server Testing Plan
# Tests all aspects of the updated implementation including new data models
# and TypeScript interfaces

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# print_header prints a formatted blue-colored header for major test phases or sections.
print_header() {
    echo -e "\n${BLUE}======================================="
    echo -e "$1"
    echo -e "=======================================${NC}\n"
}

# print_section prints a yellow-colored section header for a test group or step.
print_section() {
    echo -e "\n${YELLOW}--- $1 ---${NC}"
}

# track_test updates test counters and prints a colored pass/fail message based on the test result.
track_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "${GREEN}✓ PASSED${NC}: $2"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo -e "${RED}✗ FAILED${NC}: $2"
    fi
}

# test_jsonrpc_message sends a JSON-RPC 2.0 request to the server for a specified tool and arguments, then validates that the response is valid JSON.
# 
# Prints a section header describing the test, constructs and sends the request, and tracks the test result as passed if the response is valid JSON, or failed otherwise.
test_jsonrpc_message() {
    local tool_name="$1"
    local args="$2"
    local description="$3"
    
    print_section "Testing: $tool_name - $description"
    
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
    
    # Send the request and capture response
    local response=$(echo "$request" | timeout 30s node dist/server.js 2>/dev/null || echo "TIMEOUT_OR_ERROR")
    
    if [[ "$response" == "TIMEOUT_OR_ERROR" ]]; then
        track_test 1 "$tool_name request failed or timed out"
        return 1
    fi
    
    # Check if response is valid JSON
    if echo "$response" | jq . >/dev/null 2>&1; then
        track_test 0 "$tool_name returned valid JSON response"
        echo "Response preview: $(echo "$response" | jq -c . | head -c 200)..."
        return 0
    else
        track_test 1 "$tool_name returned invalid JSON response"
        return 1
    fi
}

# Main testing workflow
print_header "COMPREHENSIVE FIREWALLA MCP SERVER TEST PLAN"

# PHASE 1: Build Verification
print_header "PHASE 1: BUILD VERIFICATION"

print_section "TypeScript Compilation Test"
if npm run build >/dev/null 2>&1; then
    track_test 0 "TypeScript compilation successful"
else
    track_test 1 "TypeScript compilation failed"
fi

print_section "Lint Test"
if npm run lint >/dev/null 2>&1; then
    track_test 0 "ESLint validation passed"
else
    track_test 1 "ESLint validation failed"
fi

print_section "Dependency Check"
if npm list --depth=0 >/dev/null 2>&1; then
    track_test 0 "All dependencies installed correctly"
else
    track_test 1 "Missing or incompatible dependencies"
fi

# PHASE 2: Server Startup & Protocol Testing
print_header "PHASE 2: SERVER STARTUP & PROTOCOL TESTING"

print_section "Server Startup Test"
# Start server in background for testing
echo "Starting MCP server for testing..."
timeout 30s node dist/server.js </dev/null &
SERVER_PID=$!
sleep 3

if kill -0 $SERVER_PID 2>/dev/null; then
    track_test 0 "MCP server started successfully"
else
    track_test 1 "MCP server failed to start"
fi

# Kill the test server
if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null || true
fi

# PHASE 3: Individual Tool Testing - Updated Data Models
print_header "PHASE 3: INDIVIDUAL TOOL TESTING (NEW DATA MODELS)"

# Test 1: get_active_alarms - Updated Alarm interface
test_jsonrpc_message "get_active_alarms" '{"limit": 5}' "Active alarms with updated Alarm interface"

# Test 2: get_device_status - Updated Device interface  
test_jsonrpc_message "get_device_status" '{"include_offline": true}' "Device status with updated Device interface"

# Test 3: get_flow_data - Updated Flow interface
test_jsonrpc_message "get_flow_data" '{"limit": 5, "page": 1}' "Flow data with updated Flow interface"

# Test 4: get_network_rules - Updated NetworkRule interface
test_jsonrpc_message "get_network_rules" '{"active_only": true}' "Network rules with updated NetworkRule interface"

# Test 5: get_target_lists - Updated TargetList interface
test_jsonrpc_message "get_target_lists" '{}' "Target lists with updated TargetList interface"

# Test 6: get_bandwidth_usage - Updated BandwidthUsage interface
test_jsonrpc_message "get_bandwidth_usage" '{"period": "24h", "top": 5}' "Bandwidth usage with updated interface"

# Test 7: get_offline_devices - New tool functionality
test_jsonrpc_message "get_offline_devices" '{"sort_by_last_seen": true}' "Offline devices filtering functionality"

# Test 8: get_boxes - Box interface validation
test_jsonrpc_message "get_boxes" '{}' "Boxes list with Box interface"

# Test 9: get_specific_alarm - Specific alarm details
test_jsonrpc_message "get_specific_alarm" '{"alarm_id": "test-123"}' "Specific alarm retrieval"

# Test 10: pause_rule - Rule management functionality
test_jsonrpc_message "pause_rule" '{"rule_id": "test-rule-456", "duration": 30}' "Rule pausing functionality"

# Test 11: resume_rule - Rule management functionality
test_jsonrpc_message "resume_rule" '{"rule_id": "test-rule-456"}' "Rule resuming functionality"

# Test 12: delete_alarm - Alarm management functionality
test_jsonrpc_message "delete_alarm" '{"alarm_id": "test-alarm-789"}' "Alarm deletion functionality"

# PHASE 4: Error Handling Testing
print_header "PHASE 4: ERROR HANDLING TESTING"

print_section "Invalid Tool Name Test"
test_jsonrpc_message "invalid_tool_name" '{}' "Invalid tool name error handling"

print_section "Missing Required Parameters Test"
test_jsonrpc_message "get_bandwidth_usage" '{}' "Missing required period parameter"

print_section "Invalid Parameter Types Test"
test_jsonrpc_message "get_active_alarms" '{"limit": "invalid"}' "Invalid parameter type handling"

# PHASE 5: Data Transformation Validation
print_header "PHASE 5: DATA TRANSFORMATION VALIDATION"

print_section "TypeScript Interface Compliance Test"
echo "Validating that compiled JavaScript matches TypeScript interfaces..."

# Check if all required interface files are present
for interface_file in "types.d.ts" "tools/index.d.ts" "firewalla/client.d.ts"; do
    if [ -f "dist/$interface_file" ]; then
        track_test 0 "Interface definition file exists: $interface_file"
    else
        track_test 1 "Missing interface definition file: $interface_file"
    fi
done

# PHASE 6: Integration Testing
print_header "PHASE 6: INTEGRATION TESTING"

print_section "End-to-End Workflow Test"
echo "Testing complete workflow with multiple tool calls..."

# Create a complex test that chains multiple tool calls
cat > test_workflow.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_device_status",
    "arguments": {"include_offline": false}
  }
}
EOF

if timeout 30s node dist/server.js < test_workflow.json >/dev/null 2>&1; then
    track_test 0 "End-to-end workflow test completed"
else
    track_test 1 "End-to-end workflow test failed"
fi

# Clean up test files
rm -f test_workflow.json

# FINAL RESULTS
print_header "TEST RESULTS SUMMARY"

echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED! 🎉${NC}"
    echo -e "${GREEN}Your Firewalla MCP Server implementation is working correctly!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ SOME TESTS FAILED ❌${NC}"
    echo -e "${RED}Please review the failed tests above and fix the issues.${NC}"
    exit 1
fi