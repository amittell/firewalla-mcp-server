#!/bin/bash

# Test script for Firewalla MCP Server
# This script tests various tools to verify the server is working correctly

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Firewalla MCP Server Test Script${NC}"
echo "================================="

# Check if environment variables are set
if [ -z "$FIREWALLA_MSP_TOKEN" ] || [ -z "$FIREWALLA_MSP_ID" ] || [ -z "$FIREWALLA_BOX_ID" ]; then
    echo -e "${RED}Error: Missing environment variables!${NC}"
    echo "Please set the following:"
    echo "  export FIREWALLA_MSP_TOKEN='your_token_here'"
    echo "  export FIREWALLA_MSP_ID='yourdomain.firewalla.net'"
    echo "  export FIREWALLA_BOX_ID='your-box-id-here'"
    exit 1
fi

echo -e "${GREEN}✓ Environment variables are set${NC}"
echo ""

# Function to test a tool
test_tool() {
    local tool_name=$1
    local args=$2
    local description=$3
    
    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Tool: $tool_name"
    echo "Args: $args"
    
    npx @modelcontextprotocol/cli query \
        --server "node dist/server.js" \
        --tool-name "$tool_name" \
        --arguments "$args" 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Success${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    echo "---"
    echo ""
}

# Test 1: List available tools
echo -e "${YELLOW}1. Listing all available tools:${NC}"
npx @modelcontextprotocol/cli list-tools --server "node dist/server.js"
echo ""

# Test 2: Get active alarms
test_tool "get_active_alarms" '{"limit": 5}' "Get active security alarms"

# Test 3: Get device status
test_tool "get_device_status" '{"limit": 10}' "Get device online/offline status"

# Test 4: Get network flow data
test_tool "get_flow_data" '{"limit": 5}' "Get recent network flows"

# Test 5: Get firewall rules
test_tool "get_network_rules" '{"limit": 5}' "Get firewall rules"

# Test 6: Search flows (example with geographic filter)
test_tool "search_flows" '{"query": "protocol:tcp", "limit": 5}' "Search network flows"

# Test 7: Get statistics
test_tool "get_simple_statistics" '{}' "Get network statistics overview"

echo -e "${GREEN}Test completed!${NC}"