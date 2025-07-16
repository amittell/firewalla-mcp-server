#!/usr/bin/env node

/**
 * Comprehensive MCP Tool Testing Script
 * 
 * Tests all available Firewalla MCP tools with systematic edge cases and validates:
 * - Valid input scenarios
 * - Invalid input scenarios
 * - Boundary conditions
 * - Error handling
 * - Performance characteristics
 * - Security validation
 * 
 * This script provides detailed analysis for the comprehensive functionality report.
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results tracking
let testResults = {
  startTime: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  },
  totalTools: 0,
  testedTools: 0,
  passedTests: 0,
  failedTests: 0,
  criticalIssues: [],
  highIssues: [],
  mediumIssues: [],
  lowIssues: [],
  toolInventory: [],
  performanceMetrics: {},
  securityFindings: [],
  detailedResults: {}
};

// Complete tool inventory based on code analysis
const TOOL_INVENTORY = [
  // Security tools (3)
  { name: 'get_active_alarms', category: 'security', enabled: true, requiresAuth: true },
  { name: 'get_specific_alarm', category: 'security', enabled: true, requiresAuth: true },
  { name: 'delete_alarm', category: 'security', enabled: true, requiresAuth: true },

  // Network tools (2)
  { name: 'get_flow_data', category: 'network', enabled: true, requiresAuth: true },
  { name: 'get_bandwidth_usage', category: 'network', enabled: true, requiresAuth: true },

  // Device tools (1)
  { name: 'get_device_status', category: 'device', enabled: true, requiresAuth: true },

  // Rule tools (7)
  { name: 'get_network_rules', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'pause_rule', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'resume_rule', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'get_target_lists', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'get_network_rules_summary', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'get_most_active_rules', category: 'rule', enabled: true, requiresAuth: true },
  { name: 'get_recent_rules', category: 'rule', enabled: true, requiresAuth: true },

  // Analytics tools (7)
  { name: 'get_boxes', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_simple_statistics', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_statistics_by_region', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_statistics_by_box', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_flow_trends', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_alarm_trends', category: 'analytics', enabled: true, requiresAuth: true },
  { name: 'get_rule_trends', category: 'analytics', enabled: true, requiresAuth: true },

  // Search tools (10)
  { name: 'search_flows', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_alarms', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_rules', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_devices', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_target_lists', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_cross_reference', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_enhanced_cross_reference', category: 'search', enabled: true, requiresAuth: true },
  { name: 'get_correlation_suggestions', category: 'search', enabled: true, requiresAuth: true },
  { name: 'search_alarms_by_geography', category: 'search', enabled: true, requiresAuth: true },
  { name: 'get_geographic_statistics', category: 'search', enabled: true, requiresAuth: true },

  // Bulk operation tools (3)
  { name: 'bulk_delete_alarms', category: 'bulk', enabled: true, requiresAuth: true },
  { name: 'bulk_pause_rules', category: 'bulk', enabled: true, requiresAuth: true },
  { name: 'bulk_resume_rules', category: 'bulk', enabled: true, requiresAuth: true }
];

// Test scenarios for different tool categories
const TEST_SCENARIOS = {
  security: [
    // Valid scenarios
    { args: { limit: 10 }, description: 'Basic limit test' },
    { args: { limit: 100, severity: 'high' }, description: 'High severity alarms' },
    { args: { query: 'severity:critical' }, description: 'Query-based filtering' },
    
    // Invalid scenarios
    { args: { limit: -1 }, description: 'Negative limit', expectError: true },
    { args: { limit: 10001 }, description: 'Excessive limit', expectError: true },
    { args: { severity: 'invalid' }, description: 'Invalid severity', expectError: true },
    { args: { query: '><script>' }, description: 'Script injection attempt', expectError: true },
    
    // Boundary conditions
    { args: { limit: 0 }, description: 'Zero limit boundary' },
    { args: { limit: 1 }, description: 'Minimum limit boundary' },
    { args: { limit: 1000 }, description: 'Maximum limit boundary' },
  ],

  network: [
    // Valid scenarios
    { args: { limit: 10 }, description: 'Basic network data retrieval' },
    { args: { limit: 50, period: '24h' }, description: 'Bandwidth with time period' },
    
    // Invalid scenarios
    { args: { limit: 'invalid' }, description: 'Invalid limit type', expectError: true },
    { args: { period: 'invalid' }, description: 'Invalid period', expectError: true },
    
    // Boundary conditions
    { args: { limit: 1, period: '1h' }, description: 'Minimum values' },
    { args: { limit: 1000, period: '30d' }, description: 'Maximum values' },
  ],

  device: [
    // Valid scenarios
    { args: { limit: 10 }, description: 'Basic device status' },
    { args: { include_offline: true }, description: 'Include offline devices' },
    
    // Invalid scenarios
    { args: { limit: null }, description: 'Null limit', expectError: true },
    { args: { include_offline: 'invalid' }, description: 'Invalid boolean', expectError: true },
  ],

  rule: [
    // Valid scenarios
    { args: { limit: 10 }, description: 'Basic rules retrieval' },
    { args: { active_only: true }, description: 'Active rules only' },
    
    // Invalid scenarios
    { args: { rule_id: '' }, description: 'Empty rule ID', expectError: true },
    { args: { rule_id: 'non-existent-rule-12345' }, description: 'Non-existent rule', expectError: true },
  ],

  search: [
    // Valid scenarios
    { args: { query: 'severity:high', limit: 10 }, description: 'Basic search query' },
    { args: { query: 'ip:192.168.1.*', limit: 25 }, description: 'IP wildcard search' },
    
    // Invalid scenarios
    { args: { query: '', limit: 10 }, description: 'Empty query', expectError: true },
    { args: { query: 'invalid:syntax[', limit: 10 }, description: 'Malformed query', expectError: true },
    { args: { query: 'x'.repeat(10000), limit: 10 }, description: 'Excessive query length', expectError: true },
  ],

  analytics: [
    // Valid scenarios
    { args: {}, description: 'Basic analytics call' },
    { args: { period: '24h' }, description: 'With time period' },
    
    // Invalid scenarios
    { args: { period: 'invalid' }, description: 'Invalid period', expectError: true },
  ],

  bulk: [
    // Valid scenarios (with caution for destructive operations)
    { args: { alarm_ids: ['test-alarm-1'], dry_run: true }, description: 'Dry run bulk operation' },
    
    // Invalid scenarios
    { args: { alarm_ids: [] }, description: 'Empty ID list', expectError: true },
    { args: { alarm_ids: [''] }, description: 'Empty ID in list', expectError: true },
    { args: { alarm_ids: null }, description: 'Null ID list', expectError: true },
  ]
};

// Function to start MCP server and test tools
async function startMCPServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let output = '';
    let errorOutput = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
      // Look for server ready indication
      if (output.includes('MCP server running') || output.includes('Server started')) {
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

    // Timeout after 30 seconds
    setTimeout(() => {
      server.kill();
      reject(new Error('Server startup timeout'));
    }, 30000);
  });
}

// Function to send MCP request
async function sendMCPRequest(server, toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(36).substring(7),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
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

    // Set timeout for request
    timeout = setTimeout(() => {
      server.stdout.removeListener('data', responseHandler);
      reject(new Error(`Request timeout for ${toolName}`));
    }, 15000);

    server.stdin.write(requestStr);
  });
}

// Function to test a single tool with all scenarios
async function testTool(server, tool) {
  console.log(`Testing tool: ${tool.name} (${tool.category})`);
  
  const toolResults = {
    toolName: tool.name,
    category: tool.category,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    issues: [],
    performanceData: {},
    scenarios: []
  };

  const scenarios = TEST_SCENARIOS[tool.category] || [];
  
  for (const scenario of scenarios) {
    toolResults.totalTests++;
    const scenarioResult = {
      description: scenario.description,
      args: scenario.args,
      expectError: scenario.expectError || false,
      success: false,
      error: null,
      responseTime: 0,
      issueLevel: null
    };

    try {
      const startTime = Date.now();
      const response = await sendMCPRequest(server, tool.name, scenario.args);
      const endTime = Date.now();
      scenarioResult.responseTime = endTime - startTime;

      if (response.error && !scenario.expectError) {
        // Unexpected error
        scenarioResult.error = response.error;
        scenarioResult.issueLevel = 'high';
        toolResults.issues.push({
          level: 'high',
          type: 'unexpected_error',
          scenario: scenario.description,
          error: response.error,
          sourceFile: 'To be determined from code analysis'
        });
        toolResults.failedTests++;
      } else if (!response.error && scenario.expectError) {
        // Expected error but got success
        scenarioResult.error = 'Expected error but got success';
        scenarioResult.issueLevel = 'medium';
        toolResults.issues.push({
          level: 'medium',
          type: 'missing_validation',
          scenario: scenario.description,
          error: 'Tool should have rejected invalid input',
          sourceFile: 'To be determined from code analysis'
        });
        toolResults.failedTests++;
      } else {
        // Expected behavior
        scenarioResult.success = true;
        toolResults.passedTests++;

        // Check for performance issues
        if (scenarioResult.responseTime > 5000) {
          toolResults.issues.push({
            level: 'medium',
            type: 'performance',
            scenario: scenario.description,
            error: `Slow response time: ${scenarioResult.responseTime}ms`,
            sourceFile: 'To be determined from code analysis'
          });
        }

        // Check response structure
        if (response.result && response.result.content) {
          try {
            const content = JSON.parse(response.result.content[0].text);
            if (!content.success && !content.error) {
              toolResults.issues.push({
                level: 'low',
                type: 'response_structure',
                scenario: scenario.description,
                error: 'Response missing success/error indicators',
                sourceFile: 'To be determined from code analysis'
              });
            }
          } catch (e) {
            toolResults.issues.push({
              level: 'medium',
              type: 'response_format',
              scenario: scenario.description,
              error: 'Invalid JSON in response',
              sourceFile: 'To be determined from code analysis'
            });
          }
        }
      }

    } catch (error) {
      scenarioResult.error = error.message;
      scenarioResult.issueLevel = 'high';
      toolResults.issues.push({
        level: 'high',
        type: 'execution_error',
        scenario: scenario.description,
        error: error.message,
        sourceFile: 'To be determined from code analysis'
      });
      toolResults.failedTests++;
    }

    toolResults.scenarios.push(scenarioResult);
  }

  return toolResults;
}

// Main testing function
async function runComprehensiveTest() {
  console.log('Starting Comprehensive MCP Tool Testing...');
  console.log(`Testing ${TOOL_INVENTORY.length} tools`);
  
  testResults.totalTools = TOOL_INVENTORY.length;
  testResults.toolInventory = TOOL_INVENTORY;

  let server;
  try {
    // Start MCP server
    console.log('Starting MCP server...');
    server = await startMCPServer();
    console.log('MCP server started successfully');

    // Test each tool
    for (const tool of TOOL_INVENTORY) {
      try {
        const toolResult = await testTool(server, tool);
        testResults.detailedResults[tool.name] = toolResult;
        testResults.testedTools++;
        testResults.passedTests += toolResult.passedTests;
        testResults.failedTests += toolResult.failedTests;

        // Categorize issues
        for (const issue of toolResult.issues) {
          switch (issue.level) {
            case 'critical':
              testResults.criticalIssues.push(issue);
              break;
            case 'high':
              testResults.highIssues.push(issue);
              break;
            case 'medium':
              testResults.mediumIssues.push(issue);
              break;
            case 'low':
              testResults.lowIssues.push(issue);
              break;
          }
        }

        console.log(`Completed testing ${tool.name}: ${toolResult.passedTests}/${toolResult.totalTests} passed`);
      } catch (error) {
        console.error(`Failed to test ${tool.name}:`, error.message);
        testResults.criticalIssues.push({
          level: 'critical',
          type: 'tool_execution_failure',
          tool: tool.name,
          error: error.message,
          sourceFile: 'MCP server communication'
        });
      }
    }

    // Test server resource usage and performance
    console.log('Testing server performance characteristics...');
    testResults.performanceMetrics = await gatherPerformanceMetrics(server);

  } catch (error) {
    console.error('Failed to start MCP server:', error.message);
    testResults.criticalIssues.push({
      level: 'critical',
      type: 'server_startup_failure',
      error: error.message,
      sourceFile: 'dist/server.js'
    });
  } finally {
    if (server) {
      server.kill();
    }
  }

  testResults.endTime = new Date().toISOString();
  
  // Write results to file
  const resultsFile = join(__dirname, 'comprehensive-test-results.json');
  writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  
  console.log('\\nTesting completed!');
  console.log(`Results saved to: ${resultsFile}`);
  console.log(`\\nSummary:`);
  console.log(`- Total tools: ${testResults.totalTools}`);
  console.log(`- Tools tested: ${testResults.testedTools}`);
  console.log(`- Tests passed: ${testResults.passedTests}`);
  console.log(`- Tests failed: ${testResults.failedTests}`);
  console.log(`- Critical issues: ${testResults.criticalIssues.length}`);
  console.log(`- High issues: ${testResults.highIssues.length}`);
  console.log(`- Medium issues: ${testResults.mediumIssues.length}`);
  console.log(`- Low issues: ${testResults.lowIssues.length}`);

  return testResults;
}

// Function to gather performance metrics
async function gatherPerformanceMetrics(server) {
  const metrics = {
    startupTime: Date.now(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
  };

  // Test concurrent request handling
  try {
    const concurrentRequests = [];
    for (let i = 0; i < 5; i++) {
      concurrentRequests.push(sendMCPRequest(server, 'get_boxes', {}));
    }
    
    const startTime = Date.now();
    await Promise.all(concurrentRequests);
    metrics.concurrentRequestTime = Date.now() - startTime;
  } catch (error) {
    metrics.concurrentRequestError = error.message;
  }

  return metrics;
}

// Run the comprehensive test
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveTest().catch(console.error);
}

export { runComprehensiveTest, TOOL_INVENTORY, TEST_SCENARIOS };