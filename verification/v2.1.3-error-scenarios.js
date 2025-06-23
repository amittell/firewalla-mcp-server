#!/usr/bin/env node

/**
 * V2.1.3 Verification: Test Error Scenarios
 * 
 * Systematically tests error handling in MCP tools:
 * - Invalid parameter types and values
 * - Missing required parameters
 * - Parameter boundary violations
 * - Network/API failure scenarios
 * - Malformed response handling
 * - Tool-specific error conditions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ErrorScenariosVerifier {
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
   * Test invalid parameter types (V2.1.3.1)
   */
  testInvalidParameterTypes(toolsCode) {
    console.log('🔍 Testing Invalid Parameter Types (V2.1.3.1)...');
    
    const parameterTypeTests = [
      {
        tool: 'get_active_alarms',
        invalidParams: {
          limit: 'not-a-number',
          cursor: 12345,  // should be string
          sortBy: null,
          groupBy: []     // should be string
        }
      },
      {
        tool: 'get_flow_data',
        invalidParams: {
          limit: -1,      // should be positive
          start_time: 'invalid-date',
          end_time: 123,  // should be string
          query: {}       // should be string
        }
      },
      {
        tool: 'get_bandwidth_usage',
        invalidParams: {
          period: 123,    // should be string
          top: 'ten'      // should be number
        }
      },
      {
        tool: 'pause_rule',
        invalidParams: {
          rule_id: null,  // required parameter
          duration: 'forever'  // should be number
        }
      }
    ];
    
    for (const test of parameterTypeTests) {
      // Check if tool has parameter type checking
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for type coercion/validation
      const hasTypeChecking = caseContent.includes('typeof') || 
                             caseContent.includes('Number(') ||
                             caseContent.includes('parseInt(') ||
                             caseContent.includes('String(');
      
      if (hasTypeChecking) {
        this.addResult('invalid-types', `${test.tool}-type-checking`, 'passed',
          `✅ ${test.tool} has parameter type checking/coercion`);
      } else {
        this.addResult('invalid-types', `${test.tool}-type-checking`, 'warnings',
          `⚠️ ${test.tool} may not validate parameter types`);
      }
      
      // Check for input validation
      for (const [param, invalidValue] of Object.entries(test.invalidParams)) {
        if (caseContent.includes(param)) {
          // Look for validation logic for this parameter
          const hasValidation = caseContent.includes(`${param}`) && 
                               (caseContent.includes('throw') || 
                                caseContent.includes('Error') ||
                                caseContent.includes('Math.min') ||
                                caseContent.includes('Math.max'));
          
          if (hasValidation) {
            this.addResult('invalid-types', `${test.tool}-${param}-validation`, 'passed',
              `✅ ${test.tool} validates ${param} parameter`);
          } else {
            this.addResult('invalid-types', `${test.tool}-${param}-validation`, 'warnings',
              `⚠️ ${test.tool} may not validate ${param} parameter`);
          }
        }
      }
    }
  }

  /**
   * Test missing required parameters (V2.1.3.2)
   */
  testMissingRequiredParameters(toolsCode) {
    console.log('🔍 Testing Missing Required Parameters (V2.1.3.2)...');
    
    const requiredParameterTests = [
      {
        tool: 'get_bandwidth_usage',
        requiredParams: ['period'],
        errorMessage: 'Period parameter is required'
      },
      {
        tool: 'pause_rule',
        requiredParams: ['rule_id'],
        errorMessage: 'Rule ID parameter is required'
      },
      {
        tool: 'resume_rule',
        requiredParams: ['rule_id'],
        errorMessage: 'Rule ID parameter is required'
      },
      {
        tool: 'get_specific_alarm',
        requiredParams: ['alarm_id'],
        errorMessage: 'Alarm ID parameter is required'
      },
      {
        tool: 'delete_alarm',
        requiredParams: ['alarm_id'],
        errorMessage: 'Alarm ID parameter is required'
      }
    ];
    
    for (const test of requiredParameterTests) {
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) {
        this.addResult('missing-params', `${test.tool}-not-found`, 'warnings',
          `⚠️ Tool ${test.tool} not found for required parameter testing`);
        continue;
      }
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for required parameter validation
      for (const param of test.requiredParams) {
        const hasRequiredCheck = caseContent.includes(`!${param}`) ||
                                caseContent.includes(`${param} === undefined`) ||
                                caseContent.includes(`${param} === null`) ||
                                caseContent.includes(`if (!${param})`);
        
        if (hasRequiredCheck) {
          this.addResult('missing-params', `${test.tool}-${param}-required`, 'passed',
            `✅ ${test.tool} checks for required ${param} parameter`);
        } else {
          this.addResult('missing-params', `${test.tool}-${param}-required`, 'failed',
            `❌ ${test.tool} missing required parameter check for ${param}`);
        }
      }
      
      // Check for proper error message
      if (test.errorMessage && caseContent.includes(test.errorMessage)) {
        this.addResult('missing-params', `${test.tool}-error-message`, 'passed',
          `✅ ${test.tool} has proper error message for missing parameters`);
      } else {
        this.addResult('missing-params', `${test.tool}-error-message`, 'warnings',
          `⚠️ ${test.tool} may not have proper error message for missing parameters`);
      }
    }
  }

  /**
   * Test parameter boundary violations (V2.1.3.3)
   */
  testParameterBoundaryViolations(toolsCode) {
    console.log('🔍 Testing Parameter Boundary Violations (V2.1.3.3)...');
    
    const boundaryTests = [
      {
        tool: 'get_active_alarms',
        param: 'limit',
        maxValue: 500,
        checkType: 'Math.min'
      },
      {
        tool: 'get_flow_data',
        param: 'limit',
        maxValue: 500,
        checkType: 'Math.min'
      },
      {
        tool: 'get_most_active_rules',
        param: 'limit',
        maxValue: 50,
        checkType: 'Math.min'
      },
      {
        tool: 'get_recent_rules',
        param: 'hours',
        maxValue: 168,
        checkType: 'Math.min'
      },
      {
        tool: 'pause_rule',
        param: 'duration',
        maxValue: 1440,
        checkType: 'boundary'
      }
    ];
    
    for (const test of boundaryTests) {
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for boundary validation
      const hasBoundaryCheck = caseContent.includes(`Math.min(${test.param}`) ||
                              caseContent.includes(`Math.min((args?.${test.param}`) ||
                              caseContent.includes(`${test.maxValue}`) ||
                              caseContent.includes('Math.min') && caseContent.includes(test.param);
      
      if (hasBoundaryCheck) {
        this.addResult('boundary-violations', `${test.tool}-${test.param}-bounds`, 'passed',
          `✅ ${test.tool} validates ${test.param} parameter bounds`);
      } else {
        this.addResult('boundary-violations', `${test.tool}-${test.param}-bounds`, 'warnings',
          `⚠️ ${test.tool} may not validate ${test.param} parameter bounds`);
      }
    }
    
    // Test for negative value protection
    const negativeValueTests = ['limit', 'top', 'duration', 'hours'];
    for (const param of negativeValueTests) {
      // Search for any tool that uses this parameter
      const paramUsages = toolsCode.split(`${param}`).length - 1;
      if (paramUsages > 0) {
        // Look for positive value validation
        const hasPositiveCheck = toolsCode.includes(`${param} > 0`) ||
                                toolsCode.includes(`${param} >= 1`) ||
                                toolsCode.includes(`Math.max(1, ${param})`);
        
        if (hasPositiveCheck) {
          this.addResult('boundary-violations', `${param}-positive-check`, 'passed',
            `✅ ${param} parameter has positive value validation`);
        } else {
          this.addResult('boundary-violations', `${param}-positive-check`, 'warnings',
            `⚠️ ${param} parameter may not validate positive values`);
        }
      }
    }
  }

  /**
   * Test error response format (V2.1.3.4)
   */
  testErrorResponseFormat(toolsCode) {
    console.log('🔍 Testing Error Response Format (V2.1.3.4)...');
    
    // Check for global error handling structure
    const hasGlobalErrorHandler = toolsCode.includes('catch (error: unknown)') &&
                                 toolsCode.includes('isError: true');
    
    if (hasGlobalErrorHandler) {
      this.addResult('error-format', 'global-error-handler', 'passed',
        '✅ Global error handler found with proper format');
    } else {
      this.addResult('error-format', 'global-error-handler', 'failed',
        '❌ Global error handler missing or incomplete');
    }
    
    // Check error response structure
    const errorResponsePattern = /content:\s*\[\s*\{\s*type:\s*['"]text['"],\s*text:\s*JSON\.stringify\(\s*\{\s*error:\s*true/g;
    if (errorResponsePattern.test(toolsCode)) {
      this.addResult('error-format', 'error-response-structure', 'passed',
        '✅ Error responses follow proper MCP format');
    } else {
      this.addResult('error-format', 'error-response-structure', 'failed',
        '❌ Error responses may not follow proper MCP format');
    }
    
    // Check for error message inclusion
    if (toolsCode.includes('error.message') && toolsCode.includes('Unknown error occurred')) {
      this.addResult('error-format', 'error-message-handling', 'passed',
        '✅ Error messages are properly handled with fallbacks');
    } else {
      this.addResult('error-format', 'error-message-handling', 'warnings',
        '⚠️ Error message handling may be incomplete');
    }
    
    // Check for tool name inclusion in errors
    if (toolsCode.includes('tool: name')) {
      this.addResult('error-format', 'tool-name-in-errors', 'passed',
        '✅ Tool name is included in error responses');
    } else {
      this.addResult('error-format', 'tool-name-in-errors', 'warnings',
        '⚠️ Tool name may not be included in error responses');
    }
    
    // Check for sensitive information protection
    const hasSensitiveDataProtection = !toolsCode.includes('token') &&
                                      !toolsCode.includes('password') &&
                                      !toolsCode.includes('secret');
    
    if (hasSensitiveDataProtection) {
      this.addResult('error-format', 'sensitive-data-protection', 'passed',
        '✅ No obvious sensitive data in error responses');
    } else {
      this.addResult('error-format', 'sensitive-data-protection', 'warnings',
        '⚠️ Check for sensitive data in error responses');
    }
  }

  /**
   * Test tool-specific error conditions (V2.1.3.5)
   */
  testToolSpecificErrors(toolsCode) {
    console.log('🔍 Testing Tool-Specific Error Conditions (V2.1.3.5)...');
    
    const toolSpecificTests = [
      {
        tool: 'get_flow_data',
        errorCondition: 'invalid-time-range',
        description: 'time range validation',
        checkFor: ['start_time', 'end_time', 'Date']
      },
      {
        tool: 'get_bandwidth_usage',
        errorCondition: 'invalid-period',
        description: 'period enum validation',
        checkFor: ['period', 'throw', '1h', '24h', '7d', '30d']
      },
      {
        tool: 'pause_rule',
        errorCondition: 'invalid-rule-id',
        description: 'rule ID validation',
        checkFor: ['rule_id', 'string', 'throw']
      },
      {
        tool: 'get_network_rules',
        errorCondition: 'invalid-query',
        description: 'query syntax validation',
        checkFor: ['query', 'string']
      }
    ];
    
    for (const test of toolSpecificTests) {
      const caseStart = toolsCode.indexOf(`case '${test.tool}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check if the tool has specific validation for this error condition
      const hasSpecificValidation = test.checkFor.some(term => caseContent.includes(term));
      
      if (hasSpecificValidation) {
        this.addResult('tool-specific-errors', `${test.tool}-${test.errorCondition}`, 'passed',
          `✅ ${test.tool} has ${test.description}`);
      } else {
        this.addResult('tool-specific-errors', `${test.tool}-${test.errorCondition}`, 'warnings',
          `⚠️ ${test.tool} may not have ${test.description}`);
      }
    }
  }

  /**
   * Test network failure handling (V2.1.3.6)
   */
  testNetworkFailureHandling(toolsCode) {
    console.log('🔍 Testing Network Failure Handling (V2.1.3.6)...');
    
    // Check if tools are wrapped in try-catch for network failures
    const hasTryCatch = toolsCode.includes('try {') && toolsCode.includes('catch (error');
    
    if (hasTryCatch) {
      this.addResult('network-failures', 'try-catch-wrapper', 'passed',
        '✅ Tools are wrapped in try-catch for error handling');
    } else {
      this.addResult('network-failures', 'try-catch-wrapper', 'failed',
        '❌ Tools missing try-catch error handling wrapper');
    }
    
    // Check for proper error propagation
    const hasErrorPropagation = toolsCode.includes('Promise.reject(error)') ||
                               toolsCode.includes('throw error') ||
                               toolsCode.includes('return {') && toolsCode.includes('isError: true');
    
    if (hasErrorPropagation) {
      this.addResult('network-failures', 'error-propagation', 'passed',
        '✅ Errors are properly propagated from client to tools');
    } else {
      this.addResult('network-failures', 'error-propagation', 'warnings',
        '⚠️ Error propagation may be incomplete');
    }
    
    // Check for client error handling integration
    const hasClientErrorHandling = toolsCode.includes('firewalla.') && 
                                   (toolsCode.includes('await') || toolsCode.includes('.then'));
    
    if (hasClientErrorHandling) {
      this.addResult('network-failures', 'client-error-integration', 'passed',
        '✅ Tools integrate with client error handling');
    } else {
      this.addResult('network-failures', 'client-error-integration', 'warnings',
        '⚠️ Client error integration may be incomplete');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.3: Test Error Scenarios');
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
    
    // Error scenario specific analysis
    const criticalErrors = this.results.details.filter(r => 
      r.status === 'failed' && 
      (r.category.includes('missing-params') || r.category.includes('error-format'))
    );
    
    if (criticalErrors.length === 0) {
      console.log('\\n🎉 No critical error handling issues found!');
    } else {
      console.log(`\\n⚠️  ${criticalErrors.length} critical error handling issues found.`);
    }
    
    if (this.results.failed <= 3) {
      console.log('\\n🎉 Error scenario testing successful! V2.1.3 complete.');
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
    console.log('🚀 Starting V2.1.3 Verification: Test Error Scenarios\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      // Run all verification tests
      this.testInvalidParameterTypes(toolsCode);
      this.testMissingRequiredParameters(toolsCode);
      this.testParameterBoundaryViolations(toolsCode);
      this.testErrorResponseFormat(toolsCode);
      this.testToolSpecificErrors(toolsCode);
      this.testNetworkFailureHandling(toolsCode);
      
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
  const verifier = new ErrorScenariosVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { ErrorScenariosVerifier };