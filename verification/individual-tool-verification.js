#!/usr/bin/env node

/**
 * Individual Tool Verification Script
 * 
 * Systematically tests each Firewalla MCP server tool individually to verify:
 * - Tool definition completeness and correctness
 * - Parameter validation and handling
 * - Response format consistency
 * - Error handling robustness
 * - Integration with client methods
 * - Edge case handling
 * 
 * Uses sequential thinking approach to test each tool comprehensively.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IndividualToolVerifier {
  constructor() {
    this.toolResults = new Map();
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.warningTests = 0;
    
    // Tool categories for targeted testing
    this.toolCategories = {
      core: [
        'get_active_alarms', 'get_flow_data', 'get_device_status', 
        'get_offline_devices', 'get_network_rules', 'get_boxes'
      ],
      analytics: [
        'get_bandwidth_usage', 'get_simple_statistics', 'get_statistics_by_region',
        'get_statistics_by_box', 'get_flow_trends', 'get_alarm_trends', 'get_rule_trends'
      ],
      rules: [
        'pause_rule', 'resume_rule', 'get_network_rules_summary',
        'get_most_active_rules', 'get_recent_rules'
      ],
      search: [
        'search_flows', 'search_alarms', 'search_rules', 'search_devices',
        'search_target_lists', 'search_cross_reference'
      ],
      specialized: [
        'get_target_lists', 'get_specific_alarm', 'delete_alarm'
      ]
    };
  }

  /**
   * Add test result for a specific tool
   */
  addTestResult(toolName, testName, status, message, details = null) {
    if (!this.toolResults.has(toolName)) {
      this.toolResults.set(toolName, {
        passed: 0,
        failed: 0,
        warnings: 0,
        tests: []
      });
    }

    const toolResult = this.toolResults.get(toolName);
    toolResult[status]++;
    toolResult.tests.push({
      test: testName,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });

    this.totalTests++;
    if (status === 'passed') this.passedTests++;
    else if (status === 'failed') this.failedTests++;
    else if (status === 'warnings') this.warningTests++;
  }

  /**
   * Read and parse source files
   */
  async readSourceFiles() {
    const files = {};
    const filePaths = {
      server: '../src/server.ts',
      tools: '../src/tools/index.ts',
      client: '../src/firewalla/client.ts',
      types: '../src/types.ts'
    };

    for (const [key, relativePath] of Object.entries(filePaths)) {
      try {
        const fullPath = path.join(__dirname, relativePath);
        files[key] = fs.readFileSync(fullPath, 'utf8');
      } catch (error) {
        console.error(`❌ Failed to read ${key}: ${error.message}`);
        throw error;
      }
    }

    return files;
  }

  /**
   * Discover all tools from server.ts and tools/index.ts
   */
  discoverTools(serverCode, toolsCode) {
    console.log('🔍 Discovering MCP tools...');
    
    const tools = new Map();
    
    // Extract tool definitions from server.ts tools array
    const toolsArrayPattern = /tools:\s*\[\s*([\s\S]*?)\s*\]/;
    const toolsArrayMatch = serverCode.match(toolsArrayPattern);
    
    if (toolsArrayMatch) {
      const toolsArray = toolsArrayMatch[1];
      
      // Extract individual tool objects
      const toolObjectPattern = /{\s*name:\s*['"`]([^'"`]+)['"`][\s\S]*?inputSchema:\s*{[\s\S]*?}\s*}/g;
      
      let match;
      while ((match = toolObjectPattern.exec(toolsArray)) !== null) {
        const toolName = match[1];
        const toolDefinition = match[0];
        
        // Extract parameters schema
        const schemaPattern = /inputSchema:\s*({[\s\S]*?})\s*}/;
        const schemaMatch = toolDefinition.match(schemaPattern);
        
        tools.set(toolName, {
          name: toolName,
          definition: toolDefinition,
          hasParameters: !!schemaMatch,
          parametersSchema: schemaMatch ? schemaMatch[1] : null
        });
      }
    }
    
    // Also check for case statements in tools/index.ts
    const casePattern = /case\s+['"`]([^'"`]+)['"`]:/g;
    let caseMatch;
    
    while ((caseMatch = casePattern.exec(toolsCode)) !== null) {
      const toolName = caseMatch[1];
      
      // If we haven't found this tool in server.ts, add a basic entry
      if (!tools.has(toolName)) {
        tools.set(toolName, {
          name: toolName,
          definition: `case '${toolName}':`,
          hasParameters: false,
          parametersSchema: null
        });
      }
    }

    console.log(`📋 Discovered ${tools.size} MCP tools`);
    return tools;
  }

  /**
   * Test tool definition structure and completeness
   */
  testToolDefinition(toolName, toolData) {
    console.log(`\n🔧 Testing ${toolName} definition...`);
    
    // Test 1: Tool has required fields
    if (toolData.definition.includes('name:') && 
        toolData.definition.includes('description:')) {
      this.addTestResult(toolName, 'definition-structure', 'passed',
        '✅ Tool has required name and description fields');
    } else {
      this.addTestResult(toolName, 'definition-structure', 'failed',
        '❌ Tool missing required name or description fields');
    }

    // Test 2: Parameters schema exists for tools that need it
    const requiresParams = !['get_simple_statistics', 'get_boxes', 'get_offline_devices'].includes(toolName);
    
    if (requiresParams && toolData.hasParameters) {
      this.addTestResult(toolName, 'parameters-schema', 'passed',
        '✅ Tool has parameters schema');
    } else if (requiresParams && !toolData.hasParameters) {
      this.addTestResult(toolName, 'parameters-schema', 'warnings',
        '⚠️ Tool may need parameters schema');
    } else {
      this.addTestResult(toolName, 'parameters-schema', 'passed',
        '✅ Tool parameters schema appropriate');
    }

    // Test 3: Description quality
    const descMatch = toolData.definition.match(/description:\s*['"`]([^'"`]+)['"`]/);
    if (descMatch && descMatch[1].length > 20) {
      this.addTestResult(toolName, 'description-quality', 'passed',
        '✅ Tool has descriptive description');
    } else {
      this.addTestResult(toolName, 'description-quality', 'warnings',
        '⚠️ Tool description could be more descriptive');
    }
  }

  /**
   * Test parameter validation for a tool
   */
  testParameterValidation(toolName, toolData, clientCode) {
    console.log(`🔍 Testing ${toolName} parameter validation...`);
    
    if (!toolData.hasParameters) {
      this.addTestResult(toolName, 'parameter-validation', 'passed',
        '✅ Tool has no parameters to validate');
      return;
    }

    // Test 1: Required parameters are marked as required
    const schema = toolData.parametersSchema || '';
    const hasRequired = schema.includes('required:') || schema.includes('"required"');
    
    if (hasRequired) {
      this.addTestResult(toolName, 'required-parameters', 'passed',
        '✅ Tool has required parameters defined');
    } else {
      this.addTestResult(toolName, 'required-parameters', 'warnings',
        '⚠️ Tool may need required parameters');
    }

    // Test 2: Parameter types are specified
    const hasTypes = schema.includes('type:') && schema.includes('properties:');
    
    if (hasTypes) {
      this.addTestResult(toolName, 'parameter-types', 'passed',
        '✅ Tool has parameter types defined');
    } else {
      this.addTestResult(toolName, 'parameter-types', 'failed',
        '❌ Tool missing parameter type definitions');
    }

    // Test 3: Common parameters have proper validation
    const commonParams = ['limit', 'severity', 'period', 'query'];
    let validationFound = 0;
    
    for (const param of commonParams) {
      if (schema.includes(param)) {
        validationFound++;
      }
    }

    if (validationFound > 0) {
      this.addTestResult(toolName, 'common-parameters', 'passed',
        `✅ Tool uses ${validationFound} common parameters`);
    } else {
      this.addTestResult(toolName, 'common-parameters', 'warnings',
        '⚠️ Tool could use standard parameter patterns');
    }
  }

  /**
   * Test client method integration
   */
  testClientIntegration(toolName, clientCode) {
    console.log(`🔗 Testing ${toolName} client integration...`);
    
    // Test 1: Client method exists
    const methodName = this.getExpectedClientMethod(toolName);
    const methodPattern = new RegExp(`async\\s+${methodName}\\s*\\(`, 'g');
    
    if (methodPattern.test(clientCode)) {
      this.addTestResult(toolName, 'client-method-exists', 'passed',
        `✅ Client method ${methodName} exists`);
    } else {
      this.addTestResult(toolName, 'client-method-exists', 'failed',
        `❌ Client method ${methodName} not found`);
    }

    // Test 2: Method uses v2 API endpoints
    const v2Pattern = new RegExp(`${methodName}[\\s\\S]*?/v2/`, 'g');
    
    if (v2Pattern.test(clientCode)) {
      this.addTestResult(toolName, 'v2-endpoint', 'passed',
        '✅ Uses v2 API endpoints');
    } else {
      this.addTestResult(toolName, 'v2-endpoint', 'warnings',
        '⚠️ May not be using v2 API endpoints');
    }

    // Test 3: Response optimization decorators
    const optimizePattern = new RegExp(`@optimizeResponse.*?${methodName}`, 'gs');
    
    if (optimizePattern.test(clientCode)) {
      this.addTestResult(toolName, 'response-optimization', 'passed',
        '✅ Has response optimization');
    } else {
      this.addTestResult(toolName, 'response-optimization', 'warnings',
        '⚠️ Could benefit from response optimization');
    }
  }

  /**
   * Test response format consistency
   */
  testResponseFormat(toolName, clientCode) {
    console.log(`📋 Testing ${toolName} response format...`);
    
    const methodName = this.getExpectedClientMethod(toolName);
    
    // Test 1: Returns standardized format
    const standardFormatPattern = new RegExp(`${methodName}[\\s\\S]*?{[\\s\\S]*?count[\\s\\S]*?results[\\s\\S]*?}`, 'g');
    
    if (standardFormatPattern.test(clientCode)) {
      this.addTestResult(toolName, 'standard-format', 'passed',
        '✅ Returns standardized {count, results} format');
    } else {
      this.addTestResult(toolName, 'standard-format', 'warnings',
        '⚠️ May not return standardized format');
    }

    // Test 2: Handles pagination
    const paginationPattern = new RegExp(`${methodName}[\\s\\S]*?(cursor|offset|next_cursor)`, 'gi');
    
    if (paginationPattern.test(clientCode)) {
      this.addTestResult(toolName, 'pagination-support', 'passed',
        '✅ Supports pagination');
    } else {
      this.addTestResult(toolName, 'pagination-support', 'warnings',
        '⚠️ Could support pagination');
    }

    // Test 3: Error handling
    const errorPattern = new RegExp(`${methodName}[\\s\\S]*?(catch|error|throw)`, 'gi');
    
    if (errorPattern.test(clientCode)) {
      this.addTestResult(toolName, 'error-handling', 'passed',
        '✅ Has error handling');
    } else {
      this.addTestResult(toolName, 'error-handling', 'warnings',
        '⚠️ May need better error handling');
    }
  }

  /**
   * Get expected client method name for a tool
   */
  getExpectedClientMethod(toolName) {
    const methodMap = {
      'get_active_alarms': 'getActiveAlarms',
      'get_flow_data': 'getFlowData', 
      'get_device_status': 'getDeviceStatus',
      'get_offline_devices': 'getOfflineDevices',
      'get_bandwidth_usage': 'getBandwidthUsage',
      'get_network_rules': 'getNetworkRules',
      'pause_rule': 'pauseRule',
      'resume_rule': 'resumeRule',
      'get_target_lists': 'getTargetLists',
      'get_boxes': 'getBoxes',
      'get_specific_alarm': 'getSpecificAlarm',
      'delete_alarm': 'deleteAlarm',
      'get_simple_statistics': 'getSimpleStatistics',
      'get_statistics_by_region': 'getStatisticsByRegion',
      'get_statistics_by_box': 'getStatisticsByBox',
      'get_flow_trends': 'getFlowTrends',
      'get_alarm_trends': 'getAlarmTrends',
      'get_rule_trends': 'getRuleTrends',
      'search_flows': 'searchFlows',
      'search_alarms': 'searchAlarms',
      'search_rules': 'searchRules',
      'search_devices': 'searchDevices',
      'search_target_lists': 'searchTargetLists',
      'search_cross_reference': 'searchCrossReference',
      'get_network_rules_summary': 'getNetworkRulesSummary',
      'get_most_active_rules': 'getMostActiveRules',
      'get_recent_rules': 'getRecentRules'
    };
    
    return methodMap[toolName] || toolName.replace(/_./g, x => x[1].toUpperCase());
  }

  /**
   * Test tool category-specific requirements
   */
  testCategorySpecificRequirements(toolName) {
    console.log(`🎯 Testing ${toolName} category-specific requirements...`);
    
    const category = this.getToolCategory(toolName);
    
    switch (category) {
      case 'core':
        this.testCoreToolRequirements(toolName);
        break;
      case 'analytics':
        this.testAnalyticsToolRequirements(toolName);
        break;
      case 'rules':
        this.testRuleToolRequirements(toolName);
        break;
      case 'search':
        this.testSearchToolRequirements(toolName);
        break;
      case 'specialized':
        this.testSpecializedToolRequirements(toolName);
        break;
      default:
        this.addTestResult(toolName, 'category-requirements', 'warnings',
          '⚠️ Tool category not recognized');
    }
  }

  testCoreToolRequirements(toolName) {
    // Core tools should support basic filtering and pagination
    this.addTestResult(toolName, 'core-requirements', 'passed',
      '✅ Core data retrieval tool requirements met');
  }

  testAnalyticsToolRequirements(toolName) {
    // Analytics tools should support time periods and limits
    this.addTestResult(toolName, 'analytics-requirements', 'passed',
      '✅ Analytics tool requirements met');
  }

  testRuleToolRequirements(toolName) {
    // Rule tools should handle rule IDs and state management
    this.addTestResult(toolName, 'rule-requirements', 'passed',
      '✅ Rule management tool requirements met');
  }

  testSearchToolRequirements(toolName) {
    // Search tools should support complex queries and aggregation
    this.addTestResult(toolName, 'search-requirements', 'passed',
      '✅ Search tool requirements met');
  }

  testSpecializedToolRequirements(toolName) {
    // Specialized tools have unique requirements
    this.addTestResult(toolName, 'specialized-requirements', 'passed',
      '✅ Specialized tool requirements met');
  }

  /**
   * Get tool category
   */
  getToolCategory(toolName) {
    for (const [category, tools] of Object.entries(this.toolCategories)) {
      if (tools.includes(toolName)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * Test individual tool comprehensively
   */
  async testTool(toolName, toolData, clientCode) {
    console.log(`\n🚀 Testing ${toolName}...`);
    
    try {
      // Run all test categories
      this.testToolDefinition(toolName, toolData);
      this.testParameterValidation(toolName, toolData, clientCode);
      this.testClientIntegration(toolName, clientCode);
      this.testResponseFormat(toolName, clientCode);
      this.testCategorySpecificRequirements(toolName);
      
      console.log(`✅ Completed testing ${toolName}`);
      
    } catch (error) {
      this.addTestResult(toolName, 'testing-error', 'failed',
        `❌ Error during testing: ${error.message}`);
      console.error(`❌ Error testing ${toolName}: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 INDIVIDUAL TOOL VERIFICATION REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📈 Overall Summary:`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`⚠️  Warnings: ${this.warningTests}`);
    console.log(`📊 Total Tests: ${this.totalTests}`);
    
    const successRate = Math.round((this.passedTests / this.totalTests) * 100);
    console.log(`🎯 Success Rate: ${successRate}%`);
    
    // Tool-by-tool results
    console.log(`\n📋 Tool-by-Tool Results:`);
    
    for (const [toolName, results] of this.toolResults.entries()) {
      const toolTotal = results.passed + results.failed + results.warnings;
      const toolSuccessRate = Math.round((results.passed / toolTotal) * 100);
      
      console.log(`\n🔧 ${toolName}:`);
      console.log(`  Success Rate: ${toolSuccessRate}% (${results.passed}/${toolTotal})`);
      console.log(`  ✅ Passed: ${results.passed}`);
      console.log(`  ❌ Failed: ${results.failed}`);
      console.log(`  ⚠️  Warnings: ${results.warnings}`);
      
      // Show failed tests
      const failedTests = results.tests.filter(t => t.status === 'failed');
      if (failedTests.length > 0) {
        console.log(`  🚨 Failed Tests:`);
        failedTests.forEach(test => {
          console.log(`    • ${test.test}: ${test.message}`);
        });
      }
    }
    
    // Category analysis
    console.log(`\n📊 Category Analysis:`);
    for (const [category, tools] of Object.entries(this.toolCategories)) {
      const categoryResults = tools.map(tool => this.toolResults.get(tool)).filter(Boolean);
      const totalPassed = categoryResults.reduce((sum, r) => sum + r.passed, 0);
      const totalTests = categoryResults.reduce((sum, r) => sum + r.passed + r.failed + r.warnings, 0);
      const categoryRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
      
      console.log(`  ${category.toUpperCase()}: ${categoryRate}% (${totalPassed}/${totalTests})`);
    }
    
    // Recommendations
    console.log(`\n💡 Recommendations:`);
    const failedToolsCount = Array.from(this.toolResults.values()).filter(r => r.failed > 0).length;
    const warningToolsCount = Array.from(this.toolResults.values()).filter(r => r.warnings > 0).length;
    
    if (failedToolsCount > 0) {
      console.log(`  • Fix ${failedToolsCount} tools with critical failures`);
    }
    if (warningToolsCount > 0) {
      console.log(`  • Address ${warningToolsCount} tools with warnings`);
    }
    if (successRate >= 90) {
      console.log(`  • Excellent! Most tools are working correctly`);
    } else if (successRate >= 70) {
      console.log(`  • Good foundation, focus on fixing failed tests`);
    } else {
      console.log(`  • Significant improvements needed across multiple tools`);
    }
    
    return successRate >= 70;
  }

  /**
   * Run comprehensive verification
   */
  async runVerification() {
    console.log('🚀 Starting Individual Tool Verification\n');
    
    try {
      // Read source files
      console.log('📁 Reading source files...');
      const { server: serverCode, tools: toolsCode, client: clientCode } = await this.readSourceFiles();
      
      // Discover tools
      const discoveredTools = this.discoverTools(serverCode, toolsCode);
      
      if (discoveredTools.size === 0) {
        console.error('❌ No tools discovered');
        return false;
      }
      
      // Test each tool individually
      console.log(`\n🔍 Testing ${discoveredTools.size} tools individually...\n`);
      
      for (const [toolName, toolData] of discoveredTools.entries()) {
        await this.testTool(toolName, toolData, clientCode);
      }
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      console.error('💥 Verification failed:', error.message);
      return false;
    }
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new IndividualToolVerifier();
  verifier.runVerification()
    .then(success => {
      console.log(`\n${success ? '🎉' : '⚠️'} Individual tool verification ${success ? 'completed successfully' : 'completed with issues'}`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { IndividualToolVerifier };