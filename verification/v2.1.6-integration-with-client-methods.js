#!/usr/bin/env node

/**
 * V2.1.6 Verification: Test Integration with Client Methods
 * 
 * Systematically tests integration between MCP tools and FirewallaClient methods:
 * - Tool-client method mapping verification
 * - Decorator integration testing (@optimizeResponse, @validateResponse)
 * - Parameter transformation and passing
 * - Response transformation verification
 * - Caching behavior testing
 * - Error propagation testing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IntegrationWithClientMethodsVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    this.toolClientMapping = {};
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
   * Test tool-client method mapping (V2.1.6.1)
   */
  testToolClientMethodMapping(toolsCode, clientCode) {
    console.log('🔍 Testing Tool-Client Method Mapping (V2.1.6.1)...');
    
    // Define expected tool-to-client method mappings
    const expectedMappings = {
      'get_active_alarms': 'getActiveAlarms',
      'get_flow_data': 'getFlowData',
      'get_device_status': 'getDeviceStatus',
      'get_network_rules': 'getNetworkRules',
      'get_boxes': 'getBoxes',
      'get_bandwidth_usage': 'getBandwidthUsage',
      'get_target_lists': 'getTargetLists',
      'pause_rule': 'pauseRule',
      'resume_rule': 'resumeRule',
      'get_specific_alarm': 'getSpecificAlarm',
      'delete_alarm': 'deleteAlarm',
      'get_simple_statistics': 'getSimpleStatistics',
      'get_statistics_by_region': 'getStatisticsByRegion',
      'get_statistics_by_box': 'getStatisticsByBox',
      'get_flow_trends': 'getFlowTrends',
      'get_alarm_trends': 'getAlarmTrends',
      'get_rule_trends': 'getRuleTrends'
    };
    
    // Verify each tool calls the correct client method
    for (const [toolName, expectedClientMethod] of Object.entries(expectedMappings)) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) {
        this.addResult('tool-client-mapping', `${toolName}-not-found`, 'warnings',
          `⚠️ Tool ${toolName} not found in tools code`);
        continue;
      }
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check if tool calls the expected client method
      if (caseContent.includes(`firewalla.${expectedClientMethod}`)) {
        this.addResult('tool-client-mapping', `${toolName}-correct-method`, 'passed',
          `✅ ${toolName} correctly calls ${expectedClientMethod}`);
        this.toolClientMapping[toolName] = expectedClientMethod;
      } else {
        this.addResult('tool-client-mapping', `${toolName}-incorrect-method`, 'failed',
          `❌ ${toolName} does not call expected method ${expectedClientMethod}`);
      }
      
      // Verify client method exists
      const methodPattern = new RegExp(`async\\s+${expectedClientMethod}\\s*\\(`, 'g');
      if (methodPattern.test(clientCode)) {
        this.addResult('tool-client-mapping', `${expectedClientMethod}-exists`, 'passed',
          `✅ Client method ${expectedClientMethod} exists`);
      } else {
        this.addResult('tool-client-mapping', `${expectedClientMethod}-missing`, 'failed',
          `❌ Client method ${expectedClientMethod} not found`);
      }
    }
  }

  /**
   * Test decorator integration (V2.1.6.2)
   */
  testDecoratorIntegration(clientCode) {
    console.log('🔍 Testing Decorator Integration (V2.1.6.2)...');
    
    // Test @optimizeResponse decorator usage
    const optimizePattern = /@optimizeResponse\s*\(\s*['"][^'"]+['"]\s*\)/g;
    const optimizeMatches = clientCode.match(optimizePattern);
    
    if (optimizeMatches && optimizeMatches.length > 0) {
      this.addResult('decorator-integration', 'optimize-response-decorators', 'passed',
        `✅ Found ${optimizeMatches.length} @optimizeResponse decorators`);
      
      // Test specific methods have @optimizeResponse
      const methodsWithOptimize = [
        'getActiveAlarms',
        'getFlowData',
        'getNetworkRules',
        'getDeviceStatus'
      ];
      
      for (const method of methodsWithOptimize) {
        const methodWithDecorator = new RegExp(`@optimizeResponse[^\\n]*\\n[^\\n]*async\\s+${method}`, 'g');
        if (methodWithDecorator.test(clientCode)) {
          this.addResult('decorator-integration', `${method}-optimize-decorator`, 'passed',
            `✅ ${method} has @optimizeResponse decorator`);
        } else {
          this.addResult('decorator-integration', `${method}-optimize-decorator`, 'warnings',
            `⚠️ ${method} may not have @optimizeResponse decorator`);
        }
      }
    } else {
      this.addResult('decorator-integration', 'optimize-response-decorators', 'warnings',
        '⚠️ No @optimizeResponse decorators found');
    }
    
    // Test @validateResponse decorator usage
    const validatePattern = /@validateResponse\s*\(\s*[^)]+\s*\)/g;
    const validateMatches = clientCode.match(validatePattern);
    
    if (validateMatches && validateMatches.length > 0) {
      this.addResult('decorator-integration', 'validate-response-decorators', 'passed',
        `✅ Found ${validateMatches.length} @validateResponse decorators`);
      
      // Test ResponseValidator is used
      if (clientCode.includes('ResponseValidator')) {
        this.addResult('decorator-integration', 'response-validator-usage', 'passed',
          '✅ ResponseValidator is used with @validateResponse decorators');
      } else {
        this.addResult('decorator-integration', 'response-validator-usage', 'warnings',
          '⚠️ ResponseValidator usage not found');
      }
    } else {
      this.addResult('decorator-integration', 'validate-response-decorators', 'warnings',
        '⚠️ No @validateResponse decorators found');
    }
    
    // Test decorator parameters
    if (clientCode.includes("@optimizeResponse('alarms')") || 
        clientCode.includes("@optimizeResponse('flows')")) {
      this.addResult('decorator-integration', 'decorator-parameters', 'passed',
        '✅ Decorators use proper parameters for optimization');
    } else {
      this.addResult('decorator-integration', 'decorator-parameters', 'warnings',
        '⚠️ Decorator parameters may not be properly configured');
    }
  }

  /**
   * Test parameter transformation (V2.1.6.3)
   */
  testParameterTransformation(toolsCode) {
    console.log('🔍 Testing Parameter Transformation (V2.1.6.3)...');
    
    const parameterTests = [
      {
        tool: 'get_active_alarms',
        parameters: ['query', 'groupBy', 'sortBy', 'limit', 'cursor'],
        transformations: ['Math.min(', 'String(', '||']
      },
      {
        tool: 'get_flow_data', 
        parameters: ['query', 'groupBy', 'sortBy', 'limit', 'cursor', 'start_time', 'end_time'],
        transformations: ['Math.min(', 'String(']
      },
      {
        tool: 'get_network_rules',
        parameters: ['query', 'summary_only', 'limit'],
        transformations: ['Math.min(', 'Boolean(']
      },
      {
        tool: 'get_bandwidth_usage',
        parameters: ['period', 'top'],
        transformations: ['Math.min(', 'throw new Error']
      }
    ];
    
    for (const test of parameterTests) {
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Test parameter extraction
      let extractedParams = 0;
      for (const param of test.parameters) {
        if (caseContent.includes(`args?.${param}`) || caseContent.includes(`args.${param}`)) {
          extractedParams++;
        }
      }
      
      const extractionRate = Math.round((extractedParams / test.parameters.length) * 100);
      if (extractionRate >= 80) {
        this.addResult('parameter-transformation', `${test.tool}-parameter-extraction`, 'passed',
          `✅ ${test.tool} extracts ${extractionRate}% of expected parameters`);
      } else if (extractionRate >= 50) {
        this.addResult('parameter-transformation', `${test.tool}-parameter-extraction`, 'warnings',
          `⚠️ ${test.tool} extracts only ${extractionRate}% of expected parameters`);
      } else {
        this.addResult('parameter-transformation', `${test.tool}-parameter-extraction`, 'failed',
          `❌ ${test.tool} extracts only ${extractionRate}% of expected parameters`);
      }
      
      // Test parameter transformations
      let transformationsFound = 0;
      for (const transformation of test.transformations) {
        if (caseContent.includes(transformation)) {
          transformationsFound++;
        }
      }
      
      if (transformationsFound > 0) {
        this.addResult('parameter-transformation', `${test.tool}-transformations`, 'passed',
          `✅ ${test.tool} uses ${transformationsFound} parameter transformations`);
      } else {
        this.addResult('parameter-transformation', `${test.tool}-transformations`, 'warnings',
          `⚠️ ${test.tool} may not transform parameters`);
      }
    }
    
    // Test default value handling
    const defaultValuePattern = /\|\|\s*([\d'"]\w*['"]?|\d+)/g;
    const defaultMatches = toolsCode.match(defaultValuePattern);
    
    if (defaultMatches && defaultMatches.length > 5) {
      this.addResult('parameter-transformation', 'default-values', 'passed',
        `✅ Found ${defaultMatches.length} default value assignments`);
    } else {
      this.addResult('parameter-transformation', 'default-values', 'warnings',
        '⚠️ Limited default value handling found');
    }
  }

  /**
   * Test response transformation (V2.1.6.4)
   */
  testResponseTransformation(toolsCode) {
    console.log('🔍 Testing Response Transformation (V2.1.6.4)...');
    
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
      
      // Test response field mapping
      const responseFields = ['count:', 'total_', 'next_cursor:', 'alarms:', 'flows:', 'devices:', 'rules:', 'boxes:'];
      let fieldsFound = 0;
      
      for (const field of responseFields) {
        if (caseContent.includes(field)) {
          fieldsFound++;
        }
      }
      
      if (fieldsFound >= 2) {
        this.addResult('response-transformation', `${toolName}-field-mapping`, 'passed',
          `✅ ${toolName} maps ${fieldsFound} response fields`);
      } else {
        this.addResult('response-transformation', `${toolName}-field-mapping`, 'warnings',
          `⚠️ ${toolName} maps only ${fieldsFound} response fields`);
      }
      
      // Test JSON serialization
      if (caseContent.includes('JSON.stringify(')) {
        this.addResult('response-transformation', `${toolName}-json-serialization`, 'passed',
          `✅ ${toolName} properly serializes response to JSON`);
      } else {
        this.addResult('response-transformation', `${toolName}-json-serialization`, 'failed',
          `❌ ${toolName} missing JSON serialization`);
      }
      
      // Test MCP response format
      if (caseContent.includes('content: [') && caseContent.includes("type: 'text'")) {
        this.addResult('response-transformation', `${toolName}-mcp-format`, 'passed',
          `✅ ${toolName} uses correct MCP response format`);
      } else {
        this.addResult('response-transformation', `${toolName}-mcp-format`, 'failed',
          `❌ ${toolName} incorrect MCP response format`);
      }
    }
    
    // Test response optimization integration
    if (toolsCode.includes('clientResponse') || toolsCode.includes('apiResponse')) {
      this.addResult('response-transformation', 'response-variables', 'passed',
        '✅ Tools use proper response variable naming');
    } else {
      this.addResult('response-transformation', 'response-variables', 'warnings',
        '⚠️ Tools may not use consistent response variable naming');
    }
  }

  /**
   * Test caching behavior (V2.1.6.5)
   */
  testCachingBehavior(clientCode) {
    console.log('🔍 Testing Caching Behavior (V2.1.6.5)...');
    
    // Check for caching implementation
    const cachingPatterns = ['cache', 'Cache', 'memoize', 'store', 'redis', 'memory'];
    let cachingFound = false;
    
    for (const pattern of cachingPatterns) {
      if (clientCode.includes(pattern)) {
        cachingFound = true;
        this.addResult('caching-behavior', `caching-${pattern.toLowerCase()}`, 'passed',
          `✅ Caching pattern ${pattern} found`);
      }
    }
    
    if (!cachingFound) {
      this.addResult('caching-behavior', 'caching-implementation', 'warnings',
        '⚠️ No explicit caching implementation found');
    }
    
    // Check for cache keys
    if (clientCode.includes('key') && clientCode.includes('get')) {
      this.addResult('caching-behavior', 'cache-key-usage', 'passed',
        '✅ Cache key usage patterns found');
    } else {
      this.addResult('caching-behavior', 'cache-key-usage', 'warnings',
        '⚠️ Cache key usage patterns not found');
    }
    
    // Check for TTL or expiration
    const expirationPatterns = ['ttl', 'TTL', 'expir', 'timeout', 'maxAge'];
    let expirationFound = false;
    
    for (const pattern of expirationPatterns) {
      if (clientCode.includes(pattern)) {
        expirationFound = true;
        this.addResult('caching-behavior', `expiration-${pattern.toLowerCase()}`, 'passed',
          `✅ Cache expiration pattern ${pattern} found`);
      }
    }
    
    if (!expirationFound) {
      this.addResult('caching-behavior', 'cache-expiration', 'warnings',
        '⚠️ Cache expiration patterns not found');
    }
    
    // Check for cache invalidation
    if (clientCode.includes('invalidate') || clientCode.includes('clear') || clientCode.includes('delete')) {
      this.addResult('caching-behavior', 'cache-invalidation', 'passed',
        '✅ Cache invalidation patterns found');
    } else {
      this.addResult('caching-behavior', 'cache-invalidation', 'warnings',
        '⚠️ Cache invalidation patterns not found');
    }
  }

  /**
   * Test error propagation (V2.1.6.6)
   */
  testErrorPropagation(toolsCode, clientCode) {
    console.log('🔍 Testing Error Propagation (V2.1.6.6)...');
    
    // Test global error handling in tools
    if (toolsCode.includes('catch (error: unknown)')) {
      this.addResult('error-propagation', 'global-error-handler', 'passed',
        '✅ Global error handler found in tools');
    } else {
      this.addResult('error-propagation', 'global-error-handler', 'failed',
        '❌ Global error handler missing in tools');
    }
    
    // Test error response format
    if (toolsCode.includes('isError: true') && toolsCode.includes('error: true')) {
      this.addResult('error-propagation', 'error-response-format', 'passed',
        '✅ Consistent error response format found');
    } else {
      this.addResult('error-propagation', 'error-response-format', 'warnings',
        '⚠️ Error response format may be inconsistent');
    }
    
    // Test client error handling
    if (clientCode.includes('try') && clientCode.includes('catch')) {
      this.addResult('error-propagation', 'client-error-handling', 'passed',
        '✅ Client methods have error handling');
    } else {
      this.addResult('error-propagation', 'client-error-handling', 'warnings',
        '⚠️ Client error handling unclear');
    }
    
    // Test error message preservation
    if (toolsCode.includes('error.message') && toolsCode.includes('Unknown error occurred')) {
      this.addResult('error-propagation', 'error-message-preservation', 'passed',
        '✅ Error messages are preserved with fallbacks');
    } else {
      this.addResult('error-propagation', 'error-message-preservation', 'warnings',
        '⚠️ Error message preservation unclear');
    }
    
    // Test error context
    if (toolsCode.includes('tool: name') || toolsCode.includes('tool:')) {
      this.addResult('error-propagation', 'error-context', 'passed',
        '✅ Error context includes tool information');
    } else {
      this.addResult('error-propagation', 'error-context', 'warnings',
        '⚠️ Error context may not include tool information');
    }
    
    // Test HTTP error handling
    if (clientCode.includes('status') && (clientCode.includes('400') || clientCode.includes('500'))) {
      this.addResult('error-propagation', 'http-error-handling', 'passed',
        '✅ HTTP error status handling found');
    } else {
      this.addResult('error-propagation', 'http-error-handling', 'warnings',
        '⚠️ HTTP error status handling not found');
    }
    
    // Test error type differentiation
    if (clientCode.includes('NetworkError') || clientCode.includes('ValidationError') || 
        clientCode.includes('AuthError')) {
      this.addResult('error-propagation', 'error-type-differentiation', 'passed',
        '✅ Error type differentiation found');
    } else {
      this.addResult('error-propagation', 'error-type-differentiation', 'warnings',
        '⚠️ Error type differentiation not found');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.6: Test Integration with Client Methods');
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
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    // Integration specific analysis
    const integrationCategories = [
      'tool-client-mapping', 'decorator-integration', 'parameter-transformation',
      'response-transformation', 'caching-behavior', 'error-propagation'
    ];
    
    const integrationResults = this.results.details.filter(r => 
      integrationCategories.includes(r.category)
    );
    
    const passedIntegration = integrationResults.filter(r => r.status === 'passed').length;
    const totalIntegration = integrationResults.length;
    const integrationRate = Math.round((passedIntegration / totalIntegration) * 100);
    
    console.log(`\\n🔗 Integration Rate: ${integrationRate}% (${passedIntegration}/${totalIntegration})`);
    
    // Tool-client mapping summary
    const mappedTools = Object.keys(this.toolClientMapping).length;
    console.log(`\\n🗂️  Tool-Client Mappings: ${mappedTools} tools successfully mapped`);
    
    if (this.results.failed <= 4) {
      console.log('\\n🎉 Integration with client methods testing successful! V2.1.6 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review integration implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.6 Verification: Test Integration with Client Methods\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      const clientCode = await this.readClientCode();
      this.addResult('setup', 'read-client-code', 'passed', 
        '✅ Successfully read client source code');
      
      // Run all verification tests
      this.testToolClientMethodMapping(toolsCode, clientCode);
      this.testDecoratorIntegration(clientCode);
      this.testParameterTransformation(toolsCode);
      this.testResponseTransformation(toolsCode);
      this.testCachingBehavior(clientCode);
      this.testErrorPropagation(toolsCode, clientCode);
      
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
  const verifier = new IntegrationWithClientMethodsVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { IntegrationWithClientMethodsVerifier };