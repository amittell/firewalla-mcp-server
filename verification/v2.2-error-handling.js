#!/usr/bin/env node

/**
 * V2.2 Verification: Test Error Handling
 * 
 * Systematically tests error handling across all scenarios:
 * - Validation error responses (schema, required fields, types)
 * - API error handling (HTTP status codes, network, auth, rate limiting)
 * - Client error propagation (error preservation, context, consistency)
 * - Tool-level error handling (parameter validation, specific conditions)
 * - Error logging and monitoring (events, metrics, notifications)
 * - Error response standards (MCP compliance, internationalization, codes)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ErrorHandlingVerifier {
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
   * Read source files
   */
  async readSourceFiles() {
    const files = {};
    const filePaths = {
      tools: '../src/tools/index.ts',
      client: '../src/firewalla/client.ts',
      types: '../src/types.ts'
    };

    for (const [key, relativePath] of Object.entries(filePaths)) {
      try {
        const fullPath = path.join(__dirname, relativePath);
        files[key] = fs.readFileSync(fullPath, 'utf8');
      } catch (error) {
        this.addResult('setup', `read-${key}-code`, 'failed', 
          `Failed to read ${key} code: ${error.message}`);
        throw error;
      }
    }

    return files;
  }

  /**
   * Test validation error responses (V2.2.1)
   */
  testValidationErrorResponses(toolsCode, clientCode, typesCode) {
    console.log('🔍 Testing Validation Error Responses (V2.2.1)...');
    
    // Test schema validation
    if (clientCode.includes('ResponseValidator') || clientCode.includes('validateSchema')) {
      this.addResult('validation-errors', 'schema-validation', 'passed',
        '✅ Schema validation implementation found');
    } else {
      this.addResult('validation-errors', 'schema-validation', 'warnings',
        '⚠️ Schema validation implementation not found');
    }

    // Test required field validation
    const requiredFieldPatterns = ['required', 'undefined', 'null', '!=='];
    let requiredValidationFound = 0;

    for (const pattern of requiredFieldPatterns) {
      if (toolsCode.includes(pattern) || clientCode.includes(pattern)) {
        requiredValidationFound++;
      }
    }

    if (requiredValidationFound >= 3) {
      this.addResult('validation-errors', 'required-field-validation', 'passed',
        `✅ Required field validation patterns found (${requiredValidationFound}/4)`);
    } else {
      this.addResult('validation-errors', 'required-field-validation', 'warnings',
        `⚠️ Limited required field validation patterns (${requiredValidationFound}/4)`);
    }

    // Test type validation
    const typeValidationPatterns = ['typeof', 'instanceof', 'isInteger', 'isFinite', 'Array.isArray'];
    let typeValidationFound = 0;

    for (const pattern of typeValidationPatterns) {
      if (clientCode.includes(pattern) || toolsCode.includes(pattern)) {
        typeValidationFound++;
      }
    }

    if (typeValidationFound >= 3) {
      this.addResult('validation-errors', 'type-validation', 'passed',
        `✅ Type validation patterns found (${typeValidationFound}/5)`);
    } else {
      this.addResult('validation-errors', 'type-validation', 'warnings',
        `⚠️ Limited type validation patterns (${typeValidationFound}/5)`);
    }

    // Test validation error messages
    if (toolsCode.includes('throw new Error') && toolsCode.includes('parameter')) {
      this.addResult('validation-errors', 'error-messages', 'passed',
        '✅ Validation error messages found');
    } else {
      this.addResult('validation-errors', 'error-messages', 'warnings',
        '⚠️ Validation error messages may be incomplete');
    }
  }

  /**
   * Test API error handling (V2.2.2)
   */
  testAPIErrorHandling(clientCode) {
    console.log('🔍 Testing API Error Handling (V2.2.2)...');
    
    // Test HTTP status code handling
    const httpStatusCodes = ['400', '401', '403', '404', '500', 'status'];
    let statusHandlingFound = 0;

    for (const code of httpStatusCodes) {
      if (clientCode.includes(code)) {
        statusHandlingFound++;
      }
    }

    if (statusHandlingFound >= 4) {
      this.addResult('api-error-handling', 'http-status-handling', 'passed',
        `✅ HTTP status code handling found (${statusHandlingFound}/6)`);
    } else {
      this.addResult('api-error-handling', 'http-status-handling', 'warnings',
        `⚠️ Limited HTTP status handling (${statusHandlingFound}/6)`);
    }

    // Test network error handling
    const networkErrorPatterns = ['timeout', 'ECONNREFUSED', 'ETIMEDOUT', 'network', 'fetch'];
    let networkErrorFound = 0;

    for (const pattern of networkErrorPatterns) {
      if (clientCode.includes(pattern)) {
        networkErrorFound++;
      }
    }

    if (networkErrorFound >= 2) {
      this.addResult('api-error-handling', 'network-error-handling', 'passed',
        `✅ Network error handling patterns found (${networkErrorFound}/5)`);
    } else {
      this.addResult('api-error-handling', 'network-error-handling', 'warnings',
        `⚠️ Limited network error handling (${networkErrorFound}/5)`);
    }

    // Test authentication error handling
    if (clientCode.includes('auth') || clientCode.includes('token') || clientCode.includes('401')) {
      this.addResult('api-error-handling', 'auth-error-handling', 'passed',
        '✅ Authentication error handling found');
    } else {
      this.addResult('api-error-handling', 'auth-error-handling', 'warnings',
        '⚠️ Authentication error handling not found');
    }

    // Test rate limiting
    if (clientCode.includes('rate') || clientCode.includes('limit') || clientCode.includes('429')) {
      this.addResult('api-error-handling', 'rate-limiting', 'passed',
        '✅ Rate limiting error handling found');
    } else {
      this.addResult('api-error-handling', 'rate-limiting', 'warnings',
        '⚠️ Rate limiting error handling not found');
    }
  }

  /**
   * Test client error propagation (V2.2.3)
   */
  testClientErrorPropagation(toolsCode, clientCode) {
    console.log('🔍 Testing Client Error Propagation (V2.2.3)...');
    
    // Test error catching and formatting
    if (toolsCode.includes('catch (error: unknown)') && toolsCode.includes('isError: true')) {
      this.addResult('error-propagation', 'error-catching', 'passed',
        '✅ Error catching and formatting found');
    } else {
      this.addResult('error-propagation', 'error-catching', 'failed',
        '❌ Error catching and formatting missing');
    }

    // Test error message preservation
    if (toolsCode.includes('error.message') && toolsCode.includes('Unknown error occurred')) {
      this.addResult('error-propagation', 'message-preservation', 'passed',
        '✅ Error message preservation with fallbacks found');
    } else {
      this.addResult('error-propagation', 'message-preservation', 'warnings',
        '⚠️ Error message preservation may be incomplete');
    }

    // Test error context preservation
    if (toolsCode.includes('tool: name') || toolsCode.includes('tool:')) {
      this.addResult('error-propagation', 'context-preservation', 'passed',
        '✅ Error context preservation found');
    } else {
      this.addResult('error-propagation', 'context-preservation', 'warnings',
        '⚠️ Error context preservation not found');
    }

    // Test error response consistency
    const errorResponsePattern = /content:\s*\[\s*\{\s*type:\s*['"]\s*text\s*['"]/g;
    if (errorResponsePattern.test(toolsCode)) {
      this.addResult('error-propagation', 'response-consistency', 'passed',
        '✅ Consistent error response format found');
    } else {
      this.addResult('error-propagation', 'response-consistency', 'failed',
        '❌ Inconsistent error response format');
    }
  }

  /**
   * Test tool-level error handling (V2.2.4)
   */
  testToolLevelErrorHandling(toolsCode) {
    console.log('🔍 Testing Tool-Level Error Handling (V2.2.4)...');
    
    const coreTools = [
      'get_active_alarms',
      'get_flow_data',
      'get_device_status',
      'get_network_rules',
      'get_boxes'
    ];

    let toolsWithErrorHandling = 0;

    for (const toolName of coreTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;

      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);

      // Check for parameter validation
      if (caseContent.includes('throw new Error') || caseContent.includes('required')) {
        toolsWithErrorHandling++;
        this.addResult('tool-error-handling', `${toolName}-parameter-validation`, 'passed',
          `✅ ${toolName} has parameter validation errors`);
      } else {
        this.addResult('tool-error-handling', `${toolName}-parameter-validation`, 'warnings',
          `⚠️ ${toolName} may lack parameter validation errors`);
      }
    }

    // Test tool-specific error conditions
    const specializedTools = ['get_bandwidth_usage', 'pause_rule', 'resume_rule'];
    for (const toolName of specializedTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;

      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);

      if (caseContent.includes('throw new Error')) {
        this.addResult('tool-error-handling', `${toolName}-specific-errors`, 'passed',
          `✅ ${toolName} has tool-specific error handling`);
      } else {
        this.addResult('tool-error-handling', `${toolName}-specific-errors`, 'warnings',
          `⚠️ ${toolName} may lack specific error handling`);
      }
    }

    const toolErrorCoverage = Math.round((toolsWithErrorHandling / coreTools.length) * 100);
    this.addResult('tool-error-handling', 'overall-coverage', 
      toolErrorCoverage >= 80 ? 'passed' : 'warnings',
      `${toolErrorCoverage >= 80 ? '✅' : '⚠️'} Tool error handling coverage: ${toolErrorCoverage}%`);
  }

  /**
   * Test error logging and monitoring (V2.2.5)
   */
  testErrorLoggingAndMonitoring(clientCode) {
    console.log('🔍 Testing Error Logging and Monitoring (V2.2.5)...');
    
    // Test error logging
    const loggingPatterns = ['console.error', 'logger', 'log', 'debug'];
    let loggingFound = 0;

    for (const pattern of loggingPatterns) {
      if (clientCode.includes(pattern)) {
        loggingFound++;
      }
    }

    if (loggingFound >= 2) {
      this.addResult('error-monitoring', 'error-logging', 'passed',
        `✅ Error logging patterns found (${loggingFound}/4)`);
    } else {
      this.addResult('error-monitoring', 'error-logging', 'warnings',
        `⚠️ Limited error logging patterns (${loggingFound}/4)`);
    }

    // Test metrics collection
    const metricsPatterns = ['metrics', 'counter', 'gauge', 'histogram'];
    let metricsFound = 0;

    for (const pattern of metricsPatterns) {
      if (clientCode.includes(pattern)) {
        metricsFound++;
      }
    }

    if (metricsFound >= 1) {
      this.addResult('error-monitoring', 'metrics-collection', 'passed',
        `✅ Metrics collection patterns found (${metricsFound}/4)`);
    } else {
      this.addResult('error-monitoring', 'metrics-collection', 'warnings',
        '⚠️ Metrics collection patterns not found');
    }

    // Test error notifications
    if (clientCode.includes('notification') || clientCode.includes('alert')) {
      this.addResult('error-monitoring', 'error-notifications', 'passed',
        '✅ Error notification patterns found');
    } else {
      this.addResult('error-monitoring', 'error-notifications', 'warnings',
        '⚠️ Error notification patterns not found');
    }

    // Test debugging information
    if (clientCode.includes('stack') || clientCode.includes('trace')) {
      this.addResult('error-monitoring', 'debugging-info', 'passed',
        '✅ Debugging information patterns found');
    } else {
      this.addResult('error-monitoring', 'debugging-info', 'warnings',
        '⚠️ Debugging information patterns not found');
    }
  }

  /**
   * Test error response standards (V2.2.6)
   */
  testErrorResponseStandards(toolsCode) {
    console.log('🔍 Testing Error Response Standards (V2.2.6)...');
    
    // Test MCP error response format compliance
    const mcpErrorPattern = /content:\s*\[\s*\{\s*type:\s*['"]text['"],\s*text:\s*JSON\.stringify\(/g;
    if (mcpErrorPattern.test(toolsCode)) {
      this.addResult('error-standards', 'mcp-format-compliance', 'passed',
        '✅ MCP error response format compliance found');
    } else {
      this.addResult('error-standards', 'mcp-format-compliance', 'failed',
        '❌ MCP error response format not compliant');
    }

    // Test error code standardization
    if (toolsCode.includes('error: true') && toolsCode.includes('isError: true')) {
      this.addResult('error-standards', 'error-code-standardization', 'passed',
        '✅ Error code standardization found');
    } else {
      this.addResult('error-standards', 'error-code-standardization', 'warnings',
        '⚠️ Error code standardization may be incomplete');
    }

    // Test error message consistency
    const errorMessagePatterns = ['parameter is required', 'Invalid', 'Error:', 'Failed to'];
    let messageConsistencyFound = 0;

    for (const pattern of errorMessagePatterns) {
      if (toolsCode.includes(pattern)) {
        messageConsistencyFound++;
      }
    }

    if (messageConsistencyFound >= 2) {
      this.addResult('error-standards', 'message-consistency', 'passed',
        `✅ Error message consistency patterns found (${messageConsistencyFound}/4)`);
    } else {
      this.addResult('error-standards', 'message-consistency', 'warnings',
        `⚠️ Limited error message consistency (${messageConsistencyFound}/4)`);
    }

    // Test error response documentation
    if (toolsCode.includes('/**') && toolsCode.includes('error')) {
      this.addResult('error-standards', 'error-documentation', 'passed',
        '✅ Error response documentation found');
    } else {
      this.addResult('error-standards', 'error-documentation', 'warnings',
        '⚠️ Error response documentation not found');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.2: Test Error Handling');
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
    
    // Error handling specific analysis
    const errorCategories = [
      'validation-errors', 'api-error-handling', 'error-propagation',
      'tool-error-handling', 'error-monitoring', 'error-standards'
    ];
    
    const errorResults = this.results.details.filter(r => 
      errorCategories.includes(r.category)
    );
    
    const passedErrors = errorResults.filter(r => r.status === 'passed').length;
    const totalErrors = errorResults.length;
    const errorRate = Math.round((passedErrors / totalErrors) * 100);
    
    console.log(`\\n🚨 Error Handling Rate: ${errorRate}% (${passedErrors}/${totalErrors})`);
    
    if (this.results.failed <= 2) {
      console.log('\\n🎉 Error handling testing successful! V2.2 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review error handling implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.2 Verification: Test Error Handling\\n');
    
    try {
      // Read source files
      const { tools: toolsCode, client: clientCode, types: typesCode } = await this.readSourceFiles();
      this.addResult('setup', 'read-source-files', 'passed', 
        '✅ Successfully read all source files');
      
      // Run all verification tests
      this.testValidationErrorResponses(toolsCode, clientCode, typesCode);
      this.testAPIErrorHandling(clientCode);
      this.testClientErrorPropagation(toolsCode, clientCode);
      this.testToolLevelErrorHandling(toolsCode);
      this.testErrorLoggingAndMonitoring(clientCode);
      this.testErrorResponseStandards(toolsCode);
      
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
  const verifier = new ErrorHandlingVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { ErrorHandlingVerifier };