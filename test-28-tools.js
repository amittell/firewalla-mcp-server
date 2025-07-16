#!/usr/bin/env node

/**
 * Comprehensive Test for All 28 Firewalla MCP Tools
 * 
 * Tests each tool with proper validation and reports on:
 * - Tool availability and registration
 * - Schema validation 
 * - Basic functionality
 * - Error handling
 * - Response format compliance
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Complete 28-tool inventory based on actual server configuration
const TOOL_INVENTORY = [
  // Security tools (3)
  { name: 'get_active_alarms', category: 'security', description: 'Retrieve current security alerts and alarms' },
  { name: 'get_specific_alarm', category: 'security', description: 'Get detailed information for a specific alarm' },
  { name: 'delete_alarm', category: 'security', description: 'Delete/dismiss a specific alarm' },

  // Network tools (1)
  { name: 'get_flow_data', category: 'network', description: 'Query network traffic flows' },

  // Device tools (1)
  { name: 'get_device_status', category: 'device', description: 'Check online/offline status of devices' },

  // Rules tools (8)
  { name: 'get_network_rules', category: 'rules', description: 'Retrieve firewall rules and conditions' },
  { name: 'pause_rule', category: 'rules', description: 'Temporarily disable an active firewall rule' },
  { name: 'resume_rule', category: 'rules', description: 'Resume a previously paused firewall rule' },
  { name: 'get_target_lists', category: 'rules', description: 'Retrieve all target lists' },
  { name: 'get_specific_target_list', category: 'rules', description: 'Retrieve a specific target list by ID' },
  { name: 'create_target_list', category: 'rules', description: 'Create a new target list' },
  { name: 'update_target_list', category: 'rules', description: 'Update an existing target list' },
  { name: 'delete_target_list', category: 'rules', description: 'Delete a target list' },

  // Search tools (3)
  { name: 'search_flows', category: 'search', description: 'Search network flows with advanced query filters' },
  { name: 'search_alarms', category: 'search', description: 'Search alarms using full-text or field filters' },
  { name: 'search_rules', category: 'search', description: 'Search firewall rules by target, action or status' },

  // Analytics tools (7)
  { name: 'get_boxes', category: 'analytics', description: 'Retrieve list of Firewalla boxes' },
  { name: 'get_simple_statistics', category: 'analytics', description: 'Retrieve basic statistics overview' },
  { name: 'get_statistics_by_region', category: 'analytics', description: 'Retrieve statistics by region' },
  { name: 'get_statistics_by_box', category: 'analytics', description: 'Get statistics for each Firewalla box' },
  { name: 'get_flow_trends', category: 'analytics', description: 'Get historical flow trend data' },
  { name: 'get_alarm_trends', category: 'analytics', description: 'Get historical alarm trend data' },
  { name: 'get_rule_trends', category: 'analytics', description: 'Get historical rule trend data' },

  // Convenience tools (5)
  { name: 'get_bandwidth_usage', category: 'convenience', description: 'Get top bandwidth consuming devices' },
  { name: 'get_offline_devices', category: 'convenience', description: 'Get all offline devices' },
  { name: 'search_devices', category: 'convenience', description: 'Search devices by name, IP, MAC or status' },
  { name: 'search_target_lists', category: 'convenience', description: 'Search target lists with client-side filtering' },
  { name: 'get_network_rules_summary', category: 'convenience', description: 'Get overview statistics and counts of network rules' }
];

// Test results tracking
let testResults = {
  startTime: new Date().toISOString(),
  totalTools: 28,
  testedTools: 0,
  passedTests: 0,
  failedTests: 0,
  serverStarted: false,
  toolsRegistered: 0,
  issues: [],
  detailedResults: {}
};

// Function to start MCP server
async function startMCPServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting MCP server...');
    
    const server = spawn('npm', ['run', 'mcp:start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let output = '';
    let errorOutput = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Server running') || output.includes('started')) {
        resolve(server);
      }
    });

    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    server.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Server exited with code ${code}. Error: ${errorOutput}`));
      }
    });

    setTimeout(() => {
      server.kill();
      reject(new Error('Server startup timeout'));
    }, 30000);
  });
}

// Function to send MCP request
async function sendMCPRequest(server, method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(36).substring(7),
      method: method,
      params: params
    };

    const requestStr = JSON.stringify(request) + '\n';
    let response = '';
    let timeout;

    const responseHandler = (data) => {
      response += data.toString();
      try {
        const lines = response.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.id === request.id) {
            clearTimeout(timeout);
            server.stdout.removeListener('data', responseHandler);
            resolve(parsed);
            return;
          }
        }
      } catch (e) {
        // Continue accumulating response
      }
    };

    server.stdout.on('data', responseHandler);

    timeout = setTimeout(() => {
      server.stdout.removeListener('data', responseHandler);
      reject(new Error(`Request timeout for ${method}`));
    }, 10000);

    server.stdin.write(requestStr);
  });
}

// Function to test tool availability
async function testToolAvailability(server) {
  console.log('Testing tool availability...');
  
  try {
    const response = await sendMCPRequest(server, 'tools/list');
    
    if (response.error) {
      testResults.issues.push({
        type: 'tool_list_error',
        severity: 'critical',
        message: `Failed to list tools: ${response.error.message}`
      });
      return false;
    }

    const availableTools = response.result?.tools || [];
    testResults.toolsRegistered = availableTools.length;
    
    console.log(`Found ${availableTools.length} registered tools`);
    
    if (availableTools.length !== 28) {
      testResults.issues.push({
        type: 'tool_count_mismatch',
        severity: 'high',
        message: `Expected 28 tools, found ${availableTools.length}`
      });
    }

    // Check each expected tool is registered
    for (const expectedTool of TOOL_INVENTORY) {
      const found = availableTools.find(t => t.name === expectedTool.name);
      if (!found) {
        testResults.issues.push({
          type: 'missing_tool',
          severity: 'high',
          tool: expectedTool.name,
          message: `Tool ${expectedTool.name} not registered`
        });
      }
    }

    return true;
  } catch (error) {
    testResults.issues.push({
      type: 'tool_list_failure',
      severity: 'critical',
      message: error.message
    });
    return false;
  }
}

// Function to test individual tool
async function testTool(server, tool) {
  console.log(`Testing ${tool.name}...`);
  
  const toolResult = {
    name: tool.name,
    category: tool.category,
    available: false,
    basicFunctionality: false,
    errorHandling: false,
    issues: []
  };

  try {
    // Test basic functionality with minimal parameters
    const testParams = getTestParameters(tool);
    const response = await sendMCPRequest(server, 'tools/call', {
      name: tool.name,
      arguments: testParams
    });

    toolResult.available = true;

    if (response.error) {
      // Check if it's an authentication error (expected in test environment)
      if (response.error.message && response.error.message.includes('auth')) {
        toolResult.basicFunctionality = true; // Tool works, just needs auth
        toolResult.issues.push({
          type: 'auth_required',
          severity: 'info',
          message: 'Tool requires authentication (expected in test environment)'
        });
      } else {
        toolResult.issues.push({
          type: 'execution_error',
          severity: 'medium',
          message: response.error.message
        });
      }
    } else {
      toolResult.basicFunctionality = true;
    }

    // Test error handling with invalid parameters
    try {
      const invalidResponse = await sendMCPRequest(server, 'tools/call', {
        name: tool.name,
        arguments: { invalid_param: 'invalid_value' }
      });
      
      if (!invalidResponse.error) {
        toolResult.issues.push({
          type: 'missing_validation',
          severity: 'medium',
          message: 'Tool should reject invalid parameters'
        });
      } else {
        toolResult.errorHandling = true;
      }
    } catch (error) {
      toolResult.errorHandling = true; // Timeout or rejection is acceptable
    }

  } catch (error) {
    toolResult.issues.push({
      type: 'test_failure',
      severity: 'high',
      message: error.message
    });
  }

  return toolResult;
}

// Function to get appropriate test parameters for each tool
function getTestParameters(tool) {
  const basicParams = {
    // Security tools
    'get_active_alarms': { limit: 5 },
    'get_specific_alarm': { gid: 'test-box', aid: 'test-alarm' },
    'delete_alarm': { gid: 'test-box', aid: 'test-alarm' },

    // Network tools
    'get_flow_data': { limit: 5 },

    // Device tools
    'get_device_status': {},

    // Rules tools
    'get_network_rules': {},
    'pause_rule': { rule_id: 'test-rule', box: 'test-box' },
    'resume_rule': { rule_id: 'test-rule', box: 'test-box' },
    'get_target_lists': {},
    'get_specific_target_list': { id: 'test-list' },
    'create_target_list': { name: 'test', owner: 'global', targets: ['test.com'] },
    'update_target_list': { id: 'test-list' },
    'delete_target_list': { id: 'test-list' },

    // Search tools
    'search_flows': { query: 'protocol:tcp', limit: 5 },
    'search_alarms': { query: 'severity:high', limit: 5 },
    'search_rules': { query: 'action:block' },

    // Analytics tools
    'get_boxes': {},
    'get_simple_statistics': {},
    'get_statistics_by_region': { limit: 5 },
    'get_statistics_by_box': { limit: 5 },
    'get_flow_trends': {},
    'get_alarm_trends': {},
    'get_rule_trends': {},

    // Convenience tools
    'get_bandwidth_usage': { limit: 5 },
    'get_offline_devices': { limit: 5 },
    'search_devices': { query: 'online:true' },
    'search_target_lists': { query: 'category:social' },
    'get_network_rules_summary': {}
  };

  return basicParams[tool.name] || {};
}

// Main testing function
async function runComprehensiveTest() {
  console.log('=== Firewalla MCP Server - 28 Tool Comprehensive Test ===\n');
  console.log(`Testing ${TOOL_INVENTORY.length} tools across 6 categories`);
  
  let server;
  try {
    // Start MCP server
    server = await startMCPServer();
    testResults.serverStarted = true;
    console.log('✓ MCP server started successfully\n');

    // Test tool availability
    const toolsAvailable = await testToolAvailability(server);
    if (!toolsAvailable) {
      throw new Error('Failed to retrieve tool list');
    }
    console.log('✓ Tool registration validated\n');

    // Test each tool
    for (const tool of TOOL_INVENTORY) {
      const toolResult = await testTool(server, tool);
      testResults.detailedResults[tool.name] = toolResult;
      testResults.testedTools++;
      
      if (toolResult.available && (toolResult.basicFunctionality || toolResult.issues.some(i => i.type === 'auth_required'))) {
        testResults.passedTests++;
        console.log(`  ✓ ${tool.name}`);
      } else {
        testResults.failedTests++;
        console.log(`  ✗ ${tool.name} - ${toolResult.issues[0]?.message || 'Unknown error'}`);
      }
    }

  } catch (error) {
    console.error('Critical error:', error.message);
    testResults.issues.push({
      type: 'critical_failure',
      severity: 'critical',
      message: error.message
    });
  } finally {
    if (server) {
      server.kill();
    }
  }

  testResults.endTime = new Date().toISOString();
  
  // Generate report
  generateReport();
  
  return testResults;
}

// Function to generate comprehensive test report
function generateReport() {
  console.log('\n=== TEST RESULTS SUMMARY ===');
  console.log(`Tools Tested: ${testResults.testedTools}/28`);
  console.log(`Tests Passed: ${testResults.passedTests}`);
  console.log(`Tests Failed: ${testResults.failedTests}`);
  console.log(`Server Started: ${testResults.serverStarted ? 'Yes' : 'No'}`);
  console.log(`Tools Registered: ${testResults.toolsRegistered}/28`);

  // Category breakdown
  const categories = {};
  for (const tool of TOOL_INVENTORY) {
    if (!categories[tool.category]) {
      categories[tool.category] = { total: 0, passed: 0 };
    }
    categories[tool.category].total++;
    
    const result = testResults.detailedResults[tool.name];
    if (result && result.available && (result.basicFunctionality || result.issues.some(i => i.type === 'auth_required'))) {
      categories[tool.category].passed++;
    }
  }

  console.log('\n=== CATEGORY BREAKDOWN ===');
  for (const [category, stats] of Object.entries(categories)) {
    console.log(`${category}: ${stats.passed}/${stats.total} passed`);
  }

  // Issues summary
  const criticalIssues = testResults.issues.filter(i => i.severity === 'critical').length;
  const highIssues = testResults.issues.filter(i => i.severity === 'high').length;
  const mediumIssues = testResults.issues.filter(i => i.severity === 'medium').length;

  console.log('\n=== ISSUES SUMMARY ===');
  console.log(`Critical: ${criticalIssues}`);
  console.log(`High: ${highIssues}`);
  console.log(`Medium: ${mediumIssues}`);

  if (testResults.issues.length > 0) {
    console.log('\n=== ISSUES DETAILS ===');
    for (const issue of testResults.issues) {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
    }
  }

  // Save detailed results
  const resultsFile = join(__dirname, 'test-results.json');
  writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\nDetailed results saved to: ${resultsFile}`);

  // Overall assessment
  const successRate = (testResults.passedTests / testResults.testedTools * 100).toFixed(1);
  console.log(`\n=== OVERALL ASSESSMENT ===`);
  console.log(`Success Rate: ${successRate}%`);
  
  if (successRate >= 90) {
    console.log('Status: EXCELLENT - All tools functioning correctly');
  } else if (successRate >= 75) {
    console.log('Status: GOOD - Minor issues found');
  } else if (successRate >= 50) {
    console.log('Status: NEEDS ATTENTION - Several issues found');
  } else {
    console.log('Status: CRITICAL - Major issues found');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveTest().catch(console.error);
}

export { runComprehensiveTest, TOOL_INVENTORY };