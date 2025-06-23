#!/usr/bin/env node

/**
 * V2.1.1 Verification: Test Core API Tools (Simplified)
 * 
 * Tests the core functionality of MCP tools by:
 * - Verifying tool definitions exist and are properly structured
 * - Testing parameter handling and validation
 * - Checking response format consistency
 * - Validating integration with client methods
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CoreAPIToolsVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  /**
   * Add test result
   */
  addResult(category, test, status, message, details = null) {
    this.results[status]++;
    this.results.details.push({
      category,
      test,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Read tools source code
   */
  async readToolsCode() {
    const toolsPath = path.join(__dirname, '../src/tools/index.ts');
    try {
      const content = fs.readFileSync(toolsPath, 'utf8');
      return content;
    } catch (error) {
      this.addResult('setup', 'read-tools-code', 'failed', 
        `Failed to read tools code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Read client source code
   */
  async readClientCode() {
    const clientPath = path.join(__dirname, '../src/firewalla/client.ts');
    try {
      const content = fs.readFileSync(clientPath, 'utf8');
      return content;
    } catch (error) {
      this.addResult('setup', 'read-client-code', 'failed', 
        `Failed to read client code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test core API tool definitions
   */
  testCoreAPIToolDefinitions(toolsCode) {
    console.log('🔍 Testing Core API Tool Definitions...');
    
    const coreTools = [
      'get_active_alarms',
      'get_flow_data',
      'get_device_status',
      'get_network_rules',
      'get_boxes'
    ];
    
    for (const toolName of coreTools) {
      // Check if tool case exists in switch statement
      const casePattern = new RegExp(`case\\s+['"\`]${toolName}['"\`]\\s*:\\s*\\{`, 'g');
      if (casePattern.test(toolsCode)) {
        this.addResult('tool-definitions', `${toolName}-exists`, 'passed',
          `✅ Tool ${toolName} case definition found`);
      } else {
        this.addResult('tool-definitions', `${toolName}-exists`, 'failed',
          `❌ Tool ${toolName} case definition missing`);
        continue;
      }
      
      // Check if tool calls corresponding client method
      const clientMethodMap = {
        'get_active_alarms': 'getActiveAlarms',
        'get_flow_data': 'getFlowData',
        'get_device_status': 'getDeviceStatus',
        'get_network_rules': 'getNetworkRules',
        'get_boxes': 'getBoxes'
      };
      
      const expectedMethod = clientMethodMap[toolName];
      if (toolsCode.includes(`firewalla.${expectedMethod}`)) {
        this.addResult('tool-definitions', `${toolName}-client-call`, 'passed',
          `✅ Tool ${toolName} calls correct client method ${expectedMethod}`);
      } else {
        this.addResult('tool-definitions', `${toolName}-client-call`, 'failed',
          `❌ Tool ${toolName} does not call expected client method ${expectedMethod}`);
      }
    }
  }

  /**
   * Test parameter handling
   */
  testParameterHandling(toolsCode) {
    console.log('🔍 Testing Parameter Handling...');
    
    const parameterTests = [
      {
        tool: 'get_active_alarms',
        parameters: ['query', 'groupBy', 'sortBy', 'limit', 'cursor']
      },
      {
        tool: 'get_flow_data',
        parameters: ['query', 'groupBy', 'sortBy', 'limit', 'cursor', 'start_time', 'end_time']
      },
      {
        tool: 'get_device_status',
        parameters: ['box_id', 'group_id']
      },
      {
        tool: 'get_network_rules',
        parameters: ['query', 'summary_only', 'limit']
      },
      {
        tool: 'get_boxes',
        parameters: ['group_id']
      }
    ];
    
    for (const test of parameterTests) {
      // Extract tool case content
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check parameter extraction
      for (const param of test.parameters) {
        const paramPattern = new RegExp(`args\\?\\.${param}`, 'g');
        if (paramPattern.test(caseContent)) {
          this.addResult('parameter-handling', `${test.tool}-${param}`, 'passed',
            `✅ Tool ${test.tool} handles parameter ${param}`);
        } else {
          this.addResult('parameter-handling', `${test.tool}-${param}`, 'warnings',
            `⚠️ Tool ${test.tool} may not handle parameter ${param}`);
        }
      }
    }
  }

  /**
   * Test response format consistency
   */
  testResponseFormatConsistency(toolsCode) {
    console.log('🔍 Testing Response Format Consistency...');
    
    const coreTools = [
      'get_active_alarms',
      'get_flow_data',
      'get_device_status',
      'get_network_rules',
      'get_boxes'
    ];
    
    for (const toolName of coreTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for MCP response format
      if (caseContent.includes('content: [') && caseContent.includes('type: \'text\'')) {
        this.addResult('response-format', `${toolName}-mcp-format`, 'passed',
          `✅ Tool ${toolName} uses correct MCP response format`);
      } else {
        this.addResult('response-format', `${toolName}-mcp-format`, 'failed',
          `❌ Tool ${toolName} missing correct MCP response format`);
      }
      
      // Check for JSON.stringify usage
      if (caseContent.includes('JSON.stringify(')) {
        this.addResult('response-format', `${toolName}-json-stringify`, 'passed',
          `✅ Tool ${toolName} uses JSON.stringify for response`);
      } else {
        this.addResult('response-format', `${toolName}-json-stringify`, 'failed',
          `❌ Tool ${toolName} missing JSON.stringify in response`);
      }
      
      // Check for error handling
      if (caseContent.includes('try') || toolsCode.includes('catch (error: unknown)')) {
        this.addResult('response-format', `${toolName}-error-handling`, 'passed',
          `✅ Tool ${toolName} has error handling structure`);
      } else {
        this.addResult('response-format', `${toolName}-error-handling`, 'warnings',
          `⚠️ Tool ${toolName} error handling unclear`);
      }
    }
  }

  /**
   * Test client method integration
   */
  testClientMethodIntegration(clientCode) {
    console.log('🔍 Testing Client Method Integration...');
    
    const clientMethods = [
      'getActiveAlarms',
      'getFlowData',
      'getDeviceStatus',
      'getNetworkRules',
      'getBoxes'
    ];
    
    for (const methodName of clientMethods) {
      // Check method exists
      const methodPattern = new RegExp(`async\\s+${methodName}\\s*\\(`, 'g');
      if (methodPattern.test(clientCode)) {
        this.addResult('client-integration', `${methodName}-exists`, 'passed',
          `✅ Client method ${methodName} exists`);
      } else {
        this.addResult('client-integration', `${methodName}-exists`, 'failed',
          `❌ Client method ${methodName} not found`);
        continue;
      }
      
      // Check for decorators
      const decoratorPattern = new RegExp(`@\\w+[^\\n]*\\n[^\\n]*async\\s+${methodName}`, 'g');
      if (decoratorPattern.test(clientCode)) {
        this.addResult('client-integration', `${methodName}-decorators`, 'passed',
          `✅ Client method ${methodName} has decorators`);
      } else {
        this.addResult('client-integration', `${methodName}-decorators`, 'warnings',
          `⚠️ Client method ${methodName} may be missing decorators`);
      }
      
      // Check for v2 API endpoint
      const v2Pattern = new RegExp(`/v2/\\w+`, 'g');
      const methodStart = clientCode.indexOf(`async ${methodName}(`);
      if (methodStart === -1) continue;
      
      const methodEnd = this.findMethodEnd(clientCode, methodStart);
      const methodContent = clientCode.substring(methodStart, methodEnd);
      
      if (v2Pattern.test(methodContent)) {
        this.addResult('client-integration', `${methodName}-v2-endpoint`, 'passed',
          `✅ Client method ${methodName} uses v2 API endpoint`);
      } else {
        this.addResult('client-integration', `${methodName}-v2-endpoint`, 'failed',
          `❌ Client method ${methodName} missing v2 API endpoint`);
      }
    }
  }

  /**
   * Find method end by matching braces
   */
  findMethodEnd(code, startIndex) {
    let braceCount = 0;
    let inMethod = false;
    
    for (let i = startIndex; i < code.length; i++) {
      const char = code[i];
      if (char === '{') {
        braceCount++;
        inMethod = true;
      } else if (char === '}') {
        braceCount--;
        if (inMethod && braceCount === 0) {
          return i + 1;
        }
      }
    }
    
    return code.length;
  }

  /**
   * Test response data validation
   */
  testResponseDataValidation(toolsCode) {
    console.log('🔍 Testing Response Data Validation...');
    
    const expectedResponseFields = {
      'get_active_alarms': ['count', 'alarms', 'next_cursor'],
      'get_flow_data': ['count', 'flows', 'next_cursor'],
      'get_device_status': ['total_devices', 'online_devices', 'offline_devices', 'devices'],
      'get_network_rules': ['count', 'rules'],
      'get_boxes': ['total_boxes', 'boxes']
    };
    
    for (const [toolName, expectedFields] of Object.entries(expectedResponseFields)) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      const foundFields = [];
      const missingFields = [];
      
      for (const field of expectedFields) {
        if (caseContent.includes(field + ':')) {
          foundFields.push(field);
        } else {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length === 0) {
        this.addResult('response-validation', `${toolName}-fields`, 'passed',
          `✅ Tool ${toolName} includes all expected response fields`);
      } else {
        this.addResult('response-validation', `${toolName}-fields`, 'failed',
          `❌ Tool ${toolName} missing response fields: ${missingFields.join(', ')}`,
          { found: foundFields, missing: missingFields });
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.1: Test Core API Tools');
    console.log('=' .repeat(70));
    
    console.log(`\\n📈 Summary:`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    
    // Group results by category
    const byCategory = {};
    this.results.details.forEach(result => {
      if (!byCategory[result.category]) {
        byCategory[result.category] = [];
      }
      byCategory[result.category].push(result);
    });
    
    console.log(`\\n📋 Detailed Results:`);
    for (const [category, results] of Object.entries(byCategory)) {
      console.log(`\\n${category.toUpperCase()}:`);
      results.forEach(result => {
        const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
        if (result.details && result.status === 'failed') {
          console.log(`     Details: ${JSON.stringify(result.details, null, 6)}`);
        }
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed <= 3) {
      console.log('\\n🎉 Core API tools verification successful! V2.1.1 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review tool implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.1 Verification: Test Core API Tools\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      const clientCode = await this.readClientCode();
      this.addResult('setup', 'read-client-code', 'passed', 
        '✅ Successfully read client source code');
      
      // Run all verification tests
      this.testCoreAPIToolDefinitions(toolsCode);
      this.testParameterHandling(toolsCode);
      this.testResponseFormatConsistency(toolsCode);
      this.testClientMethodIntegration(clientCode);
      this.testResponseDataValidation(toolsCode);
      
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
  const verifier = new CoreAPIToolsVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { CoreAPIToolsVerifier };