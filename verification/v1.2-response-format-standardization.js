#!/usr/bin/env node

/**
 * V1.2 Verification: Test Response Format Standardization
 * 
 * Systematically verifies that all methods return consistent format:
 * - {count: number, results: Array, next_cursor?: string}
 * - Proper TypeScript type annotations
 * - Consistent property naming
 * - Error response standardization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ResponseFormatVerifier {
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
   * Read client code
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
   * Read types definition
   */
  async readTypesCode() {
    const typesPath = path.join(__dirname, '../src/types.ts');
    try {
      const content = fs.readFileSync(typesPath, 'utf8');
      return content;
    } catch (error) {
      this.addResult('setup', 'read-types-code', 'failed', 
        `Failed to read types code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract method return types from TypeScript
   */
  extractMethodReturnTypes(code) {
    const methods = {};
    
    // Pattern to match async method definitions with return types
    const methodPattern = /async\s+(\w+)\s*\([^)]*\):\s*Promise<([^>]+)>/g;
    let match;
    
    while ((match = methodPattern.exec(code)) !== null) {
      const methodName = match[1];
      const returnType = match[2];
      
      methods[methodName] = {
        name: methodName,
        returnType: returnType.trim()
      };
    }
    
    return methods;
  }

  /**
   * Extract method implementations to check actual return statements
   */
  extractMethodImplementations(code) {
    const implementations = {};
    
    // Find each method and extract its return statements
    const methodNames = [
      'getActiveAlarms', 'getFlowData', 'getNetworkRules', 
      'getDeviceStatus', 'getBoxes', 'getBandwidthUsage',
      'getTargetLists', 'searchFlows', 'searchAlarms', 
      'searchRules', 'searchDevices'
    ];
    
    for (const methodName of methodNames) {
      const methodRegex = new RegExp(`async\\s+${methodName}\\s*\\([^{]*\\{`, 'g');
      const match = methodRegex.exec(code);
      
      if (match) {
        const methodStart = match.index;
        
        // Extract method body by finding matching braces
        let braceCount = 0;
        let inMethod = false;
        let methodEnd = methodStart;
        
        for (let i = methodStart; i < code.length; i++) {
          const char = code[i];
          if (char === '{') {
            braceCount++;
            inMethod = true;
          } else if (char === '}') {
            braceCount--;
            if (inMethod && braceCount === 0) {
              methodEnd = i;
              break;
            }
          }
        }
        
        const methodBody = code.substring(methodStart, methodEnd + 1);
        
        // Extract return statements
        const returnPattern = /return\s+\{([^}]+)\}/g;
        const returns = [];
        let returnMatch;
        
        while ((returnMatch = returnPattern.exec(methodBody)) !== null) {
          returns.push(returnMatch[1]);
        }
        
        implementations[methodName] = {
          body: methodBody,
          returns: returns
        };
      }
    }
    
    return implementations;
  }

  /**
   * Verify return type annotations
   */
  verifyReturnTypeAnnotations(methods) {
    console.log('🔍 Verifying return type annotations...');
    
    const expectedPattern = /\{[^}]*count:\s*number[^}]*results:\s*[^}]*\[\][^}]*next_cursor\?\s*:\s*string[^}]*\}/;
    
    const coreApiMethods = [
      'getActiveAlarms', 'getFlowData', 'getNetworkRules', 
      'getDeviceStatus', 'getBoxes'
    ];
    
    for (const methodName of coreApiMethods) {
      const method = methods[methodName];
      
      if (!method) {
        this.addResult('annotations', `${methodName}-missing`, 'failed',
          `❌ Method ${methodName} not found`);
        continue;
      }
      
      // Check if return type follows standard format
      if (expectedPattern.test(method.returnType)) {
        this.addResult('annotations', `${methodName}-format`, 'passed',
          `✅ ${methodName} has standardized return type annotation`);
      } else {
        this.addResult('annotations', `${methodName}-format`, 'failed',
          `❌ ${methodName} return type doesn't match standard format`, 
          { actual: method.returnType });
      }
      
      // Check for specific fields
      const hasCount = method.returnType.includes('count: number');
      const hasResults = method.returnType.includes('results:') && method.returnType.includes('[]');
      const hasCursor = method.returnType.includes('next_cursor');
      
      if (hasCount) {
        this.addResult('annotations', `${methodName}-count-field`, 'passed',
          `✅ ${methodName} has count: number field`);
      } else {
        this.addResult('annotations', `${methodName}-count-field`, 'failed',
          `❌ ${methodName} missing count: number field`);
      }
      
      if (hasResults) {
        this.addResult('annotations', `${methodName}-results-field`, 'passed',
          `✅ ${methodName} has results array field`);
      } else {
        this.addResult('annotations', `${methodName}-results-field`, 'failed',
          `❌ ${methodName} missing results array field`);
      }
      
      if (hasCursor) {
        this.addResult('annotations', `${methodName}-cursor-field`, 'passed',
          `✅ ${methodName} has next_cursor field`);
      } else {
        this.addResult('annotations', `${methodName}-cursor-field`, 'failed',
          `❌ ${methodName} missing next_cursor field`);
      }
    }
  }

  /**
   * Verify implementation return statements
   */
  verifyImplementationReturns(implementations) {
    console.log('🔍 Verifying implementation return statements...');
    
    const coreApiMethods = [
      'getActiveAlarms', 'getFlowData', 'getNetworkRules', 
      'getDeviceStatus', 'getBoxes'
    ];
    
    for (const methodName of coreApiMethods) {
      const impl = implementations[methodName];
      
      if (!impl) {
        this.addResult('implementation', `${methodName}-missing`, 'failed',
          `❌ Implementation for ${methodName} not found`);
        continue;
      }
      
      if (impl.returns.length === 0) {
        this.addResult('implementation', `${methodName}-no-returns`, 'failed',
          `❌ ${methodName} has no return statements found`);
        continue;
      }
      
      // Check each return statement
      for (let i = 0; i < impl.returns.length; i++) {
        const returnStmt = impl.returns[i];
        
        const hasCount = returnStmt.includes('count:');
        const hasResults = returnStmt.includes('results:');
        const hasCursor = returnStmt.includes('next_cursor');
        
        if (hasCount && hasResults) {
          this.addResult('implementation', `${methodName}-return-${i}`, 'passed',
            `✅ ${methodName} return statement ${i} has standard format`);
        } else {
          this.addResult('implementation', `${methodName}-return-${i}`, 'failed',
            `❌ ${methodName} return statement ${i} missing required fields`,
            { returnStatement: returnStmt });
        }
      }
    }
  }

  /**
   * Verify consistent property naming
   */
  verifyPropertyNaming(code) {
    console.log('🔍 Verifying consistent property naming...');
    
    // Check for consistent naming patterns
    const countPattern = /count:\s*(\w+)/g;
    const resultsPattern = /results:\s*(\w+)/g;
    const cursorPattern = /next_cursor:\s*(\w+)/g;
    
    let countMatch;
    const countUsages = [];
    while ((countMatch = countPattern.exec(code)) !== null) {
      countUsages.push(countMatch[1]);
    }
    
    let resultsMatch;
    const resultsUsages = [];
    while ((resultsMatch = resultsPattern.exec(code)) !== null) {
      resultsUsages.push(resultsMatch[1]);
    }
    
    let cursorMatch;
    const cursorUsages = [];
    while ((cursorMatch = cursorPattern.exec(code)) !== null) {
      cursorUsages.push(cursorMatch[1]);
    }
    
    // Check consistency
    if (countUsages.length > 0) {
      this.addResult('naming', 'count-usage', 'passed',
        `✅ Found ${countUsages.length} consistent count property usages`);
    } else {
      this.addResult('naming', 'count-usage', 'failed',
        `❌ No count property usages found`);
    }
    
    if (resultsUsages.length > 0) {
      this.addResult('naming', 'results-usage', 'passed',
        `✅ Found ${resultsUsages.length} consistent results property usages`);
    } else {
      this.addResult('naming', 'results-usage', 'failed',
        `❌ No results property usages found`);
    }
    
    if (cursorUsages.length > 0) {
      this.addResult('naming', 'cursor-usage', 'passed',
        `✅ Found ${cursorUsages.length} consistent next_cursor property usages`);
    } else {
      this.addResult('naming', 'cursor-usage', 'warnings',
        `⚠️ No next_cursor property usages found`);
    }
  }

  /**
   * Verify error response standardization
   */
  verifyErrorResponseStandardization(code) {
    console.log('🔍 Verifying error response standardization...');
    
    // Check if validation module is used for error responses
    const hasValidationImport = code.includes('ResponseValidator');
    const hasErrorResponse = code.includes('createErrorResponse');
    
    if (hasValidationImport) {
      this.addResult('error-handling', 'validation-import', 'passed',
        `✅ ResponseValidator imported for error handling`);
    } else {
      this.addResult('error-handling', 'validation-import', 'failed',
        `❌ ResponseValidator not imported`);
    }
    
    if (hasErrorResponse) {
      this.addResult('error-handling', 'error-response', 'passed',
        `✅ createErrorResponse method used for standardized errors`);
    } else {
      this.addResult('error-handling', 'error-response', 'warnings',
        `⚠️ createErrorResponse method usage not found`);
    }
    
    // Check for consistent error handling patterns
    const tryPattern = /try\s*\{/g;
    const catchPattern = /catch\s*\(/g;
    const tryCount = (code.match(tryPattern) || []).length;
    const catchCount = (code.match(catchPattern) || []).length;
    
    if (tryCount > 0 && catchCount > 0) {
      this.addResult('error-handling', 'try-catch', 'passed',
        `✅ Found ${tryCount} try blocks and ${catchCount} catch blocks`);
    } else {
      this.addResult('error-handling', 'try-catch', 'warnings',
        `⚠️ Limited error handling found: ${tryCount} try, ${catchCount} catch`);
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V1.2: Response Format Standardization');
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
        if (result.details) {
          console.log(`     Details: ${JSON.stringify(result.details, null, 6)}`);
        }
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed === 0) {
      console.log('\\n🎉 All response format tests passed! V1.2 verification complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review standardization issues.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V1.2 Verification: Response Format Standardization\\n');
    
    try {
      // Read source files
      const clientCode = await this.readClientCode();
      this.addResult('setup', 'read-client-code', 'passed', 
        '✅ Successfully read FirewallaClient source code');
      
      const typesCode = await this.readTypesCode();
      this.addResult('setup', 'read-types-code', 'passed', 
        '✅ Successfully read types definition');
      
      // Extract method information
      const methods = this.extractMethodReturnTypes(clientCode);
      const implementations = this.extractMethodImplementations(clientCode);
      console.log(`📝 Extracted ${Object.keys(methods).length} methods for analysis\\n`);
      
      // Run all verification tests
      this.verifyReturnTypeAnnotations(methods);
      this.verifyImplementationReturns(implementations);
      this.verifyPropertyNaming(clientCode);
      this.verifyErrorResponseStandardization(clientCode);
      
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
  const verifier = new ResponseFormatVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { ResponseFormatVerifier };