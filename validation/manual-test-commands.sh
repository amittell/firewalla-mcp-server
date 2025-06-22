#!/bin/bash

# Phase 2 Manual Validation Commands
# Use these commands to manually test the 6 new tools

echo "🎯 Phase 2 Manual Testing Guide"
echo "================================"
echo ""

# Check if MCP server is running
check_server() {
    if ! pgrep -f "mcp:start" > /dev/null; then
        echo "❌ MCP server is not running. Please start it first:"
        echo "npm run mcp:start"
        echo ""
        return 1
    fi
    return 0
}

# Test tool registration
test_tool_registration() {
    echo "📋 1. Testing Tool Registration"
    echo "------------------------------"
    
    echo "Getting list of all available tools..."
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                const tools = response.result?.tools || [];
                const phase2Tools = ['get_simple_statistics', 'get_statistics_by_region', 'get_statistics_by_box', 'get_flow_trends', 'get_alarm_trends', 'get_rule_trends'];
                
                console.log('Total tools found:', tools.length);
                console.log('Phase 2 tools status:');
                phase2Tools.forEach(toolName => {
                    const tool = tools.find(t => t.name === toolName);
                    const status = tool ? '✅' : '❌';
                    console.log('  ' + status + ' ' + toolName + (tool ? '' : ' (NOT FOUND)'));
                });
            } catch (e) {
                console.error('Error parsing response:', e.message);
            }
        });
    "
    echo ""
}

# Test Statistics API
test_statistics_api() {
    echo "📊 2. Testing Statistics API"
    echo "----------------------------"
    
    echo "Testing get_simple_statistics..."
    echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_simple_statistics","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_simple_statistics succeeded');
                    console.log('   - Online boxes:', result.statistics?.online_boxes);
                    console.log('   - Total alarms:', result.statistics?.total_alarms);
                    console.log('   - Health score:', result.summary?.health_score);
                } else {
                    console.log('❌ get_simple_statistics failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing get_statistics_by_region..."
    echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_statistics_by_region","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_statistics_by_region succeeded');
                    console.log('   - Total regions:', result.total_regions);
                    console.log('   - Top 3 regions:', result.top_regions?.slice(0, 3).map(r => r.country_code + ':' + r.flow_count).join(', '));
                } else {
                    console.log('❌ get_statistics_by_region failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing get_statistics_by_box..."
    echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_statistics_by_box","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_statistics_by_box succeeded');
                    console.log('   - Total boxes:', result.total_boxes);
                    console.log('   - Online boxes:', result.summary?.online_boxes);
                    console.log('   - Top box activity:', result.box_statistics?.[0]?.activity_score);
                } else {
                    console.log('❌ get_statistics_by_box failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
}

# Test Trends API
test_trends_api() {
    echo "📈 3. Testing Trends API"
    echo "-----------------------"
    
    echo "Testing get_flow_trends (default parameters)..."
    echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_flow_trends","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_flow_trends succeeded');
                    console.log('   - Period:', result.period);
                    console.log('   - Data points:', result.data_points);
                    console.log('   - Total flows:', result.summary?.total_flows);
                } else {
                    console.log('❌ get_flow_trends failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing get_flow_trends (1h period, 300s interval)..."
    echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_flow_trends","arguments":{"period":"1h","interval":300}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_flow_trends (1h, 300s) succeeded');
                    console.log('   - Period:', result.period);
                    console.log('   - Interval:', result.interval_seconds);
                    console.log('   - Data points:', result.data_points);
                } else {
                    console.log('❌ get_flow_trends (1h, 300s) failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing get_alarm_trends (7d period)..."
    echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_alarm_trends","arguments":{"period":"7d"}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_alarm_trends (7d) succeeded');
                    console.log('   - Period:', result.period);
                    console.log('   - Data points:', result.data_points);
                    console.log('   - Total alarms:', result.summary?.total_alarms);
                    console.log('   - Alarm frequency:', result.summary?.alarm_frequency + '%');
                } else {
                    console.log('❌ get_alarm_trends (7d) failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing get_rule_trends (30d period)..."
    echo '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_rule_trends","arguments":{"period":"30d"}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_rule_trends (30d) succeeded');
                    console.log('   - Period:', result.period);
                    console.log('   - Data points:', result.data_points);
                    console.log('   - Avg active rules:', result.summary?.avg_active_rules);
                    console.log('   - Rule stability:', result.summary?.rule_stability + '%');
                } else {
                    console.log('❌ get_rule_trends (30d) failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
}

# Test error handling
test_error_handling() {
    echo "🚨 4. Testing Error Handling"
    echo "----------------------------"
    
    echo "Testing invalid period parameter..."
    echo '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_flow_trends","arguments":{"period":"invalid_period"}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.error || response.result?.isError) {
                    console.log('✅ Invalid period properly rejected');
                } else {
                    console.log('❌ Invalid period should have been rejected');
                }
            } catch (e) {
                console.log('✅ Invalid period properly caught as exception');
            }
        });
    "
    echo ""
    
    echo "Testing invalid interval parameter..."
    echo '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"get_flow_trends","arguments":{"interval":30}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.error || response.result?.isError) {
                    console.log('✅ Invalid interval properly rejected');
                } else {
                    console.log('❌ Invalid interval should have been rejected');
                }
            } catch (e) {
                console.log('✅ Invalid interval properly caught as exception');
            }
        });
    "
    echo ""
    
    echo "Testing non-existent tool..."
    echo '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"non_existent_tool","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.error || response.result?.isError) {
                    console.log('✅ Non-existent tool properly rejected');
                } else {
                    console.log('❌ Non-existent tool should have been rejected');
                }
            } catch (e) {
                console.log('✅ Non-existent tool properly caught as exception');
            }
        });
    "
    echo ""
}

# Test performance
test_performance() {
    echo "⚡ 5. Testing Performance"
    echo "------------------------"
    
    echo "Performance testing requires the automated test suite."
    echo "Run: node validation/test-phase2-tools.js"
    echo ""
}

# Test backwards compatibility
test_backwards_compatibility() {
    echo "🔄 6. Testing Backwards Compatibility"
    echo "------------------------------------"
    
    echo "Testing existing Phase 1 tool: get_active_alarms..."
    echo '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"get_active_alarms","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_active_alarms still works');
                    console.log('   - Total alarms:', result.total);
                } else {
                    console.log('❌ get_active_alarms failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
    
    echo "Testing existing Phase 1 tool: get_device_status..."
    echo '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"get_device_status","arguments":{}}}' | \
    node -e "
        const stdin = process.stdin;
        let data = '';
        stdin.on('data', chunk => data += chunk);
        stdin.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.result?.content?.[0]?.text) {
                    const result = JSON.parse(response.result.content[0].text);
                    console.log('✅ get_device_status still works');
                    console.log('   - Total devices:', result.total_devices);
                    console.log('   - Online devices:', result.online_devices);
                } else {
                    console.log('❌ get_device_status failed:', response.error?.message);
                }
            } catch (e) {
                console.error('❌ Error:', e.message);
            }
        });
    "
    echo ""
}

# Main execution
main() {
    echo "🎯 Phase 2 Manual Testing Guide"
    echo "================================"
    echo ""
    echo "This script will test all 6 new Phase 2 tools:"
    echo "  Statistics API: get_simple_statistics, get_statistics_by_region, get_statistics_by_box"
    echo "  Trends API: get_flow_trends, get_alarm_trends, get_rule_trends"
    echo ""
    
    # Check if server is running
    if ! check_server; then
        exit 1
    fi
    
    echo "✅ MCP server is running"
    echo ""
    
    # Run all tests
    test_tool_registration
    test_statistics_api
    test_trends_api
    test_error_handling
    test_performance
    test_backwards_compatibility
    
    echo "🎉 Manual testing completed!"
    echo ""
    echo "For comprehensive automated testing, run:"
    echo "  node validation/test-phase2-tools.js"
    echo ""
    echo "For performance benchmarking, use:"
    echo "  time node validation/test-phase2-tools.js"
    echo ""
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi