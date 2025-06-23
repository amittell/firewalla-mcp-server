#!/usr/bin/env node

/**
 * V1.1 Verification: Test Basic API Methods
 * 
 * Systematically verifies that all core API methods:
 * - Use correct v2 API endpoints
 * - Return standardized {count, results[], next_cursor} format
 * - Have proper method signatures
 * - Apply decorators correctly
 * - Handle errors appropriately
 * - Validate parameters properly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BasicAPIMethodsVerifier {
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
  addResult(type, category, test, status, message, details = null) {
    this.results[status]++;
    this.results.details.push({
      type,
      category,
      test,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Read and parse the FirewallaClient source code
   */
  async readClientCode() {
    const clientPath = path.join(__dirname, '../src/firewalla/client.ts');
    try {
      const content = fs.readFileSync(clientPath, 'utf8');
      return content;
    } catch (error) {
      this.addResult('setup', 'file-access', 'read-client-code', 'failed', 
        `Failed to read client code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract method definitions from the code
   */
  extractMethods(code) {
    const methods = {};
    
    // Improved pattern to match async method definitions with decorators
    const methodPattern = /((?:@\w+[^\n]*\n\s*)*)\s*async\s+(\w+)\s*\([^)]*\):\s*Promise<([^>]+)>/g;
    let match;
    
    while ((match = methodPattern.exec(code)) !== null) {
      const decoratorBlock = match[1] || '';
      const methodName = match[2];
      const returnType = match[3];
      
      // Extract the full method definition
      const methodStart = match.index;
      const methodContent = this.extractMethodBody(code, methodStart);
      
      // Parse decorators from the decorator block
      const decorators = this.parseDecorators(decoratorBlock);
      
      methods[methodName] = {
        name: methodName,
        returnType,
        content: methodContent,
        decorators
      };
    }
    
    return methods;
  }

  /**
   * Extract method body
   */
  extractMethodBody(code, startIndex) {
    let braceCount = 0;
    let inMethod = false;
    let methodEnd = startIndex;
    
    // Find the opening brace first
    let openBraceIndex = -1;
    for (let i = startIndex; i < code.length; i++) {
      if (code[i] === '{') {
        openBraceIndex = i;
        break;
      }
    }
    
    if (openBraceIndex === -1) {
      // Method doesn't have a body (interface or abstract)
      return code.substring(startIndex, Math.min(startIndex + 500, code.length));
    }
    
    // Now find the matching closing brace
    braceCount = 1;
    for (let i = openBraceIndex + 1; i < code.length; i++) {
      const char = code[i];
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          methodEnd = i;
          break;
        }
      }
    }
    
    return code.substring(startIndex, methodEnd + 1);
  }

  /**
   * Parse decorators from decorator block
   */
  parseDecorators(decoratorBlock) {
    const decorators = [];
    if (!decoratorBlock) return decorators;
    
    const decoratorPattern = /@(\w+)(?:\([^)]*\))?/g;
    let match;
    
    while ((match = decoratorPattern.exec(decoratorBlock)) !== null) {
      decorators.push(`@${match[1]}`);
    }
    
    return decorators;
  }

  /**
   * Extract decorators for a method (legacy method)
   */
  extractDecorators(code, methodStart) {
    const decorators = [];
    const lines = code.substring(0, methodStart).split('\n');
    
    // Look backwards for decorators
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('@')) {
        decorators.unshift(line);
      } else if (line && !line.startsWith('//')) {
        break; // Stop at non-decorator, non-comment line
      }
    }
    
    return decorators;
  }

  /**
   * Verify API endpoint compliance
   */
  verifyEndpoints(methods) {
    console.log('🔍 Verifying API endpoint compliance...');
    
    const expectedEndpoints = {
      'getActiveAlarms': '/v2/alarms',
      'getFlowData': '/v2/flows', 
      'getNetworkRules': '/v2/rules',
      'getDeviceStatus': '/v2/devices',
      'getBoxes': '/v2/boxes'
    };
    
    for (const [methodName, expectedEndpoint] of Object.entries(expectedEndpoints)) {
      const method = methods[methodName];
      
      if (!method) {
        this.addResult('api', 'endpoints', `${methodName}-exists`, 'failed',
          `Method ${methodName} not found in client code`);
        continue;
      }
      
      // More flexible endpoint matching for template literals and regular strings
      const patterns = [
        new RegExp(`['"\`]${expectedEndpoint.replace('/', '\\/')}['"\`]`),
        new RegExp(`\\$\\{[^}]*\\}${expectedEndpoint.replace('/', '\\/')}`), // Template literals
        new RegExp(`${expectedEndpoint.replace('/', '\\/')}`), // Just the path
      ];
      
      const hasEndpoint = patterns.some(pattern => pattern.test(method.content));
      
      if (hasEndpoint) {
        this.addResult('api', 'endpoints', `${methodName}-endpoint`, 'passed',
          `✅ ${methodName} uses correct endpoint ${expectedEndpoint}`);
      } else {
        // Debug: Show what we found
        const contentSnippet = method.content.substring(0, 1000);
        this.addResult('api', 'endpoints', `${methodName}-endpoint`, 'failed',
          `❌ ${methodName} does not use expected endpoint ${expectedEndpoint}`, 
          { searched_for: expectedEndpoint, content_snippet: contentSnippet });
      }
      
      // Check for GET method usage
      if (method.content.includes("'GET'") || method.content.includes('"GET"')) {
        this.addResult('api', 'endpoints', `${methodName}-http-method`, 'passed',
          `✅ ${methodName} uses GET method`);
      } else {
        this.addResult('api', 'endpoints', `${methodName}-http-method`, 'warnings',
          `⚠️ ${methodName} HTTP method unclear`);
      }
    }
  }

  /**
   * Verify response format standardization
   */
  verifyResponseFormat(methods) {
    console.log('🔍 Verifying response format standardization...');
    
    const coreApiMethods = ['getActiveAlarms', 'getFlowData', 'getNetworkRules', 'getDeviceStatus', 'getBoxes'];
    
    for (const methodName of coreApiMethods) {
      const method = methods[methodName];
      
      if (!method) continue;
      
      // Check return type annotation
      const hasStandardFormat = method.returnType.includes('count: number') && 
                               method.returnType.includes('results:') &&
                               method.returnType.includes('next_cursor');
      
      if (hasStandardFormat) {
        this.addResult('format', 'response', `${methodName}-return-type`, 'passed',
          `✅ ${methodName} has standardized return type`);
      } else {
        this.addResult('format', 'response', `${methodName}-return-type`, 'failed',
          `❌ ${methodName} does not have standardized return type`);
      }
      
      // Check implementation returns correct format
      const hasCountResults = method.content.includes('count:') && 
                             method.content.includes('results');
      
      if (hasCountResults) {
        this.addResult('format', 'response', `${methodName}-implementation`, 'passed',
          `✅ ${methodName} implementation returns count and results`);
      } else {
        this.addResult('format', 'response', `${methodName}-implementation`, 'failed',
          `❌ ${methodName} implementation missing count/results`);
      }
    }
  }

  /**
   * Verify method signatures
   */
  verifyMethodSignatures(methods) {
    console.log('🔍 Verifying method signatures...');
    
    const expectedSignatures = {
      'getActiveAlarms': ['query?', 'groupBy?', 'sortBy', 'limit', 'cursor?'],
      'getFlowData': ['query?', 'groupBy?', 'sortBy', 'limit', 'cursor?'],
      'getNetworkRules': ['query?'],
      'getDeviceStatus': ['boxId?', 'groupId?'],
      'getBoxes': ['groupId?']
    };
    
    for (const [methodName, expectedParams] of Object.entries(expectedSignatures)) {
      const method = methods[methodName];
      
      if (!method) continue;
      
      // Extract parameter list from method signature
      const paramMatch = method.content.match(new RegExp(`async\\s+${methodName}\\s*\\(([^)]*)\\)`));
      
      if (paramMatch) {
        const params = paramMatch[1];
        let allParamsFound = true;
        
        for (const expectedParam of expectedParams) {
          const paramName = expectedParam.replace('?', '');
          if (!params.includes(paramName)) {
            allParamsFound = false;
            break;
          }
        }
        
        if (allParamsFound) {
          this.addResult('signature', 'parameters', `${methodName}-params`, 'passed',
            `✅ ${methodName} has expected parameters`);
        } else {
          this.addResult('signature', 'parameters', `${methodName}-params`, 'failed',
            `❌ ${methodName} missing expected parameters`, { expected: expectedParams, actual: params });
        }
      } else {
        this.addResult('signature', 'parameters', `${methodName}-signature`, 'failed',
          `❌ Could not parse ${methodName} signature`);
      }
    }
  }

  /**
   * Verify decorator application
   */
  verifyDecorators(methods) {
    console.log('🔍 Verifying decorator application...');
    
    const expectedDecorators = {
      'getActiveAlarms': ['@optimizeResponse', '@validateResponse'],
      'getFlowData': ['@optimizeResponse', '@validateResponse'],
      'getNetworkRules': ['@optimizeResponse', '@validateResponse'],
      'getDeviceStatus': ['@optimizeResponse'],
      'searchFlows': ['@optimizeResponse'],
      'searchAlarms': ['@optimizeResponse'],
      'searchRules': ['@optimizeResponse'],
      'searchDevices': ['@optimizeResponse']
    };
    
    for (const [methodName, expectedDecs] of Object.entries(expectedDecorators)) {
      const method = methods[methodName];
      
      if (!method) {
        this.addResult('decorators', 'application', `${methodName}-not-found`, 'failed',
          `❌ Method ${methodName} not found for decorator check`);
        continue;
      }
      
      for (const expectedDecorator of expectedDecs) {
        // Check both in decorators array and in method content for more reliable detection
        const hasDecorator = method.decorators.some(dec => dec.includes(expectedDecorator)) ||
                            method.content.includes(expectedDecorator);
        
        if (hasDecorator) {
          this.addResult('decorators', 'application', `${methodName}-${expectedDecorator}`, 'passed',
            `✅ ${methodName} has ${expectedDecorator} decorator`);
        } else {
          this.addResult('decorators', 'application', `${methodName}-${expectedDecorator}`, 'failed',
            `❌ ${methodName} missing ${expectedDecorator} decorator`);
        }
      }
    }
  }

  /**
   * Verify error handling
   */
  verifyErrorHandling(methods) {
    console.log('🔍 Verifying error handling...');
    
    const coreApiMethods = ['getActiveAlarms', 'getFlowData', 'getNetworkRules', 'getDeviceStatus', 'getBoxes'];
    
    for (const methodName of coreApiMethods) {
      const method = methods[methodName];
      
      if (!method) continue;
      
      // Check for try-catch or error handling
      const hasErrorHandling = method.content.includes('try') || 
                              method.content.includes('catch') ||
                              method.content.includes('throw');
      
      if (hasErrorHandling) {
        this.addResult('error-handling', 'methods', `${methodName}-error-handling`, 'passed',
          `✅ ${methodName} has error handling`);
      } else {
        this.addResult('error-handling', 'methods', `${methodName}-error-handling`, 'warnings',
          `⚠️ ${methodName} error handling unclear`);
      }
    }
  }

  /**
   * Verify parameter validation
   */
  verifyParameterValidation(methods) {
    console.log('🔍 Verifying parameter validation...');
    
    const methodsWithLimits = ['getActiveAlarms', 'getFlowData'];
    
    for (const methodName of methodsWithLimits) {
      const method = methods[methodName];
      
      if (!method) {
        this.addResult('validation', 'parameters', `${methodName}-not-found`, 'failed',
          `❌ Method ${methodName} not found for parameter validation check`);
        continue;
      }
      
      // Check for limit validation (Math.min with limit parameter)
      const hasLimitValidation = method.content.includes('Math.min') && 
                                 method.content.includes('limit') &&
                                 method.content.includes('500'); // API max limit
      
      if (hasLimitValidation) {
        this.addResult('validation', 'parameters', `${methodName}-limit-bounds`, 'passed',
          `✅ ${methodName} validates limit parameter bounds`);
      } else {
        this.addResult('validation', 'parameters', `${methodName}-limit-bounds`, 'failed',
          `❌ ${methodName} missing limit parameter validation`);
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n📊 VERIFICATION REPORT - V1.1: Basic API Methods');
    console.log('=' .repeat(60));
    
    console.log(`\n📈 Summary:`);
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
    
    console.log(`\n📋 Detailed Results:`);
    for (const [category, results] of Object.entries(byCategory)) {
      console.log(`\n${category.toUpperCase()}:`);
      results.forEach(result => {
        const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
        if (result.details) {
          console.log(`     Details: ${JSON.stringify(result.details, null, 6)}`);
        }
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All critical tests passed! V1.1 verification complete.');
      return true;
    } else {
      console.log(`\n⚠️  ${this.results.failed} tests failed. Please review and fix issues.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V1.1 Verification: Basic API Methods\n');
    
    try {
      // Read client code
      const clientCode = await this.readClientCode();
      this.addResult('setup', 'file-access', 'read-client-code', 'passed', 
        '✅ Successfully read FirewallaClient source code');
      
      // Extract methods
      const methods = this.extractMethods(clientCode);
      console.log(`📝 Extracted ${Object.keys(methods).length} methods for analysis\n`);
      
      // Run all verification tests
      this.verifyEndpoints(methods);
      this.verifyResponseFormat(methods);
      this.verifyMethodSignatures(methods);
      this.verifyDecorators(methods);
      this.verifyErrorHandling(methods);
      this.verifyParameterValidation(methods);
      
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
  const verifier = new BasicAPIMethodsVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { BasicAPIMethodsVerifier };