#!/usr/bin/env node

import { FirewallaClient } from './dist/firewalla/client.js';
import { ToolRegistry } from './dist/tools/registry.js';

const FIREWALLA_MSP_TOKEN = process.env.FIREWALLA_MSP_TOKEN;
const FIREWALLA_MSP_ID = process.env.FIREWALLA_MSP_ID;
const FIREWALLA_BOX_ID = process.env.FIREWALLA_BOX_ID;

async function testTools() {
    console.log('=== Manual Testing of Firewalla MCP Tools ===\n');
    
    // Initialize Firewalla client
    const client = new FirewallaClient(
        FIREWALLA_MSP_TOKEN,
        FIREWALLA_MSP_ID,
        FIREWALLA_BOX_ID
    );
    
    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    
    console.log('Available tools in registry:');
    const tools = toolRegistry.getToolNames();
    console.log(`Total tools: ${tools.length}`);
    console.log('Tools:', tools.join(', '));
    console.log('\n=== Starting Tool Tests ===\n');
    
    const testResults = {
        passed: 0,
        failed: 0,
        errors: []
    };
    
    // Test 1: Core Data Retrieval Tools
    console.log('1. Testing Core Data Retrieval Tools...');
    
    // Test get_active_alarms with limit parameter
    try {
        console.log('  Testing get_active_alarms...');
        const alarmHandler = toolRegistry.getHandler('get_active_alarms');
        const alarmResult = await alarmHandler.execute({ limit: 10 }, client);
        if (alarmResult.isError) {
            console.log('    ❌ get_active_alarms failed:', alarmResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`get_active_alarms: ${alarmResult.content[0].text}`);
        } else {
            console.log('    ✅ get_active_alarms passed');
            console.log(`      Returned ${alarmResult.data?.length || 0} alarms`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ get_active_alarms error:', error.message);
        testResults.failed++;
        testResults.errors.push(`get_active_alarms: ${error.message}`);
    }
    
    // Test get_flow_data
    try {
        console.log('  Testing get_flow_data...');
        const flowHandler = toolRegistry.getHandler('get_flow_data');
        const flowResult = await flowHandler.execute({ limit: 5 }, client);
        if (flowResult.isError) {
            console.log('    ❌ get_flow_data failed:', flowResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`get_flow_data: ${flowResult.content[0].text}`);
        } else {
            console.log('    ✅ get_flow_data passed');
            console.log(`      Returned ${flowResult.data?.length || 0} flows`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ get_flow_data error:', error.message);
        testResults.failed++;
        testResults.errors.push(`get_flow_data: ${error.message}`);
    }
    
    // Test get_device_status
    try {
        console.log('  Testing get_device_status...');
        const deviceHandler = toolRegistry.getHandler('get_device_status');
        const deviceResult = await deviceHandler.execute({ limit: 10 }, client);
        if (deviceResult.isError) {
            console.log('    ❌ get_device_status failed:', deviceResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`get_device_status: ${deviceResult.content[0].text}`);
        } else {
            console.log('    ✅ get_device_status passed');
            console.log(`      Returned ${deviceResult.data?.length || 0} devices`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ get_device_status error:', error.message);
        testResults.failed++;
        testResults.errors.push(`get_device_status: ${error.message}`);
    }
    
    // Test get_network_rules
    try {
        console.log('  Testing get_network_rules...');
        const rulesHandler = toolRegistry.getHandler('get_network_rules');
        const rulesResult = await rulesHandler.execute({ limit: 10 }, client);
        if (rulesResult.isError) {
            console.log('    ❌ get_network_rules failed:', rulesResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`get_network_rules: ${rulesResult.content[0].text}`);
        } else {
            console.log('    ✅ get_network_rules passed');
            console.log(`      Returned ${rulesResult.data?.length || 0} rules`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ get_network_rules error:', error.message);
        testResults.failed++;
        testResults.errors.push(`get_network_rules: ${error.message}`);
    }
    
    // Test 2: Search Tools
    console.log('\n2. Testing Search Tools...');
    
    // Test search_flows
    try {
        console.log('  Testing search_flows...');
        const searchFlowsHandler = toolRegistry.getHandler('search_flows');
        const searchFlowsResult = await searchFlowsHandler.execute({ 
            query: "protocol:tcp", 
            limit: 5 
        }, client);
        if (searchFlowsResult.isError) {
            console.log('    ❌ search_flows failed:', searchFlowsResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`search_flows: ${searchFlowsResult.content[0].text}`);
        } else {
            console.log('    ✅ search_flows passed');
            console.log(`      Returned ${searchFlowsResult.data?.length || 0} flows`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ search_flows error:', error.message);
        testResults.failed++;
        testResults.errors.push(`search_flows: ${error.message}`);
    }
    
    // Test search_alarms
    try {
        console.log('  Testing search_alarms...');
        const searchAlarmsHandler = toolRegistry.getHandler('search_alarms');
        const searchAlarmsResult = await searchAlarmsHandler.execute({ 
            query: "severity:>=medium", 
            limit: 5 
        }, client);
        if (searchAlarmsResult.isError) {
            console.log('    ❌ search_alarms failed:', searchAlarmsResult.content[0].text);
            testResults.failed++;
            testResults.errors.push(`search_alarms: ${searchAlarmsResult.content[0].text}`);
        } else {
            console.log('    ✅ search_alarms passed');
            console.log(`      Returned ${searchAlarmsResult.data?.length || 0} alarms`);
            testResults.passed++;
        }
    } catch (error) {
        console.log('    ❌ search_alarms error:', error.message);
        testResults.failed++;
        testResults.errors.push(`search_alarms: ${error.message}`);
    }
    
    // Test 3: Parameter Validation
    console.log('\n3. Testing Parameter Validation...');
    
    // Test missing limit parameter
    try {
        console.log('  Testing missing limit parameter...');
        const alarmHandler = toolRegistry.getHandler('get_active_alarms');
        const alarmResult = await alarmHandler.execute({}, client);
        if (alarmResult.isError && alarmResult.content[0].text.includes('limit')) {
            console.log('    ✅ Parameter validation working correctly');
            testResults.passed++;
        } else {
            console.log('    ❌ Parameter validation failed - should require limit');
            testResults.failed++;
            testResults.errors.push('Parameter validation: limit not required');
        }
    } catch (error) {
        console.log('    ❌ Parameter validation error:', error.message);
        testResults.failed++;
        testResults.errors.push(`Parameter validation: ${error.message}`);
    }
    
    // Test 4: Enhanced Search (if available)
    console.log('\n4. Testing Enhanced Search Tools...');
    
    // Test search_enhanced_cross_reference if available
    if (tools.includes('search_enhanced_cross_reference')) {
        try {
            console.log('  Testing search_enhanced_cross_reference...');
            const enhancedHandler = toolRegistry.getHandler('search_enhanced_cross_reference');
            const enhancedResult = await enhancedHandler.execute({ 
                primary_query: "protocol:tcp",
                secondary_queries: ["severity:high"],
                correlation_params: JSON.stringify({
                    correlationFields: ["source_ip"],
                    correlationType: "AND"
                }),
                limit: 5 
            }, client);
            if (enhancedResult.isError) {
                console.log('    ❌ search_enhanced_cross_reference failed:', enhancedResult.content[0].text);
                testResults.failed++;
                testResults.errors.push(`search_enhanced_cross_reference: ${enhancedResult.content[0].text}`);
            } else {
                console.log('    ✅ search_enhanced_cross_reference passed');
                testResults.passed++;
            }
        } catch (error) {
            console.log('    ❌ search_enhanced_cross_reference error:', error.message);
            testResults.failed++;
            testResults.errors.push(`search_enhanced_cross_reference: ${error.message}`);
        }
    } else {
        console.log('  search_enhanced_cross_reference not available');
    }
    
    // Test 5: Write Operations
    console.log('\n5. Testing Write Operations...');
    
    // Test pause_rule (if available)
    if (tools.includes('pause_rule')) {
        try {
            console.log('  Testing pause_rule parameter validation...');
            const pauseHandler = toolRegistry.getHandler('pause_rule');
            const pauseResult = await pauseHandler.execute({ 
                rule_id: "test_rule", 
                duration: 60 
            }, client);
            // We expect this to fail with authentication or not found, but not validation error
            if (pauseResult.isError) {
                if (pauseResult.content[0].text.includes('parameter') || pauseResult.content[0].text.includes('validation')) {
                    console.log('    ❌ pause_rule parameter validation failed:', pauseResult.content[0].text);
                    testResults.failed++;
                    testResults.errors.push(`pause_rule validation: ${pauseResult.content[0].text}`);
                } else {
                    console.log('    ✅ pause_rule parameters accepted (expected API/auth error)');
                    testResults.passed++;
                }
            } else {
                console.log('    ✅ pause_rule passed unexpectedly');
                testResults.passed++;
            }
        } catch (error) {
            console.log('    ❌ pause_rule error:', error.message);
            testResults.failed++;
            testResults.errors.push(`pause_rule: ${error.message}`);
        }
    } else {
        console.log('  pause_rule not available');
    }
    
    console.log('\n=== Test Summary ===');
    console.log(`Total tests: ${testResults.passed + testResults.failed}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    
    if (testResults.errors.length > 0) {
        console.log('\nErrors:');
        testResults.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('\n=== Tool Registry Analysis ===');
    console.log('Available tool categories:');
    const categories = {
        core: tools.filter(t => ['get_active_alarms', 'get_flow_data', 'get_device_status', 'get_network_rules'].includes(t)),
        search: tools.filter(t => t.startsWith('search_')),
        bulk: tools.filter(t => t.startsWith('bulk_')),
        analytics: tools.filter(t => ['get_statistics', 'get_trends', 'get_correlation'].some(prefix => t.includes(prefix))),
        management: tools.filter(t => ['pause_rule', 'resume_rule', 'delete_'].some(prefix => t.includes(prefix))),
        other: []
    };
    
    // Calculate other category
    const categorizedTools = [...categories.core, ...categories.search, ...categories.bulk, ...categories.analytics, ...categories.management];
    categories.other = tools.filter(t => !categorizedTools.includes(t));
    
    Object.entries(categories).forEach(([category, categoryTools]) => {
        if (categoryTools.length > 0) {
            console.log(`  ${category}: ${categoryTools.length} tools`);
            console.log(`    ${categoryTools.join(', ')}`);
        }
    });
    
    return testResults;
}

// Run the tests
testTools()
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });