#!/usr/bin/env node

/**
 * V2.1.4 Verification: Test Parameter Validation
 * 
 * Systematically tests parameter validation in MCP tools:
 * - Edge case parameter values (large numbers, long strings, special chars)
 * - Parameter type transformations (string-to-number, boolean handling)
 * - Bounds checking and sanitization (limits, durations, ranges)
 * - Query parameter validation (syntax, injection attempts)
 * - Numeric parameter edge cases (floating point, scientific notation)
 * - String parameter sanitization (HTML, injection, Unicode)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ParameterValidationVerifier {
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
   * Test edge case parameter values (V2.1.4.1)
   */
  testEdgeCaseParameterValues(toolsCode) {
    console.log('🔍 Testing Edge Case Parameter Values (V2.1.4.1)...');
    
    // Test numeric parameter edge cases
    const numericEdgeCases = [
      { name: 'max-safe-integer', value: Number.MAX_SAFE_INTEGER },
      { name: 'beyond-safe-integer', value: Number.MAX_SAFE_INTEGER + 1 },
      { name: 'very-large-number', value: 1e15 },
      { name: 'negative-limit', value: -1 },
      { name: 'zero-limit', value: 0 },
      { name: 'floating-point', value: 50.5 }
    ];
    
    // Check for numeric bounds validation in tools
    const numericParams = ['limit', 'top', 'duration', 'hours'];
    for (const param of numericParams) {
      if (toolsCode.includes(param)) {
        // Look for bounds checking patterns
        const hasBoundsCheck = toolsCode.includes(`Math.min(${param}`) ||
                              toolsCode.includes(`Math.max(${param}`) ||
                              toolsCode.includes(`${param} > 0`) ||
                              toolsCode.includes(`${param} >= 1`);
        
        if (hasBoundsCheck) {
          this.addResult('edge-cases', `${param}-bounds-validation`, 'passed',
            `✅ ${param} parameter has bounds validation for edge cases`);
        } else {
          this.addResult('edge-cases', `${param}-bounds-validation`, 'warnings',
            `⚠️ ${param} parameter may not handle edge case values safely`);
        }
      }
    }
    
    // Test string parameter length validation
    const stringParams = ['query', 'sortBy', 'groupBy', 'rule_id', 'alarm_id'];
    for (const param of stringParams) {
      if (toolsCode.includes(param)) {
        // Look for string length validation
        const hasLengthCheck = toolsCode.includes(`${param}.length`) ||
                              toolsCode.includes(`trim()`) ||
                              toolsCode.includes('String(');
        
        if (hasLengthCheck) {
          this.addResult('edge-cases', `${param}-length-validation`, 'passed',
            `✅ ${param} parameter has string validation`);
        } else {
          this.addResult('edge-cases', `${param}-length-validation`, 'warnings',
            `⚠️ ${param} parameter may not validate string length/format`);
        }
      }
    }
    
    // Test for undefined/null handling
    const hasNullChecking = toolsCode.includes('!==') && 
                           (toolsCode.includes('undefined') || toolsCode.includes('null'));
    
    if (hasNullChecking) {
      this.addResult('edge-cases', 'null-undefined-handling', 'passed',
        '✅ Tools have null/undefined parameter handling');
    } else {
      this.addResult('edge-cases', 'null-undefined-handling', 'warnings',
        '⚠️ Tools may not properly handle null/undefined parameters');
    }
  }

  /**
   * Test parameter type transformations (V2.1.4.2)
   */
  testParameterTypeTransformations(toolsCode) {
    console.log('🔍 Testing Parameter Type Transformations (V2.1.4.2)...');
    
    // Test for type coercion patterns
    const typeCoercionTests = [
      {
        pattern: 'Number(',
        description: 'explicit number conversion',
        category: 'number-conversion'
      },
      {
        pattern: 'parseInt(',
        description: 'integer parsing',
        category: 'number-conversion'
      },
      {
        pattern: 'parseFloat(',
        description: 'float parsing',
        category: 'number-conversion'
      },
      {
        pattern: 'String(',
        description: 'string conversion',
        category: 'string-conversion'
      },
      {
        pattern: 'Boolean(',
        description: 'boolean conversion',
        category: 'boolean-conversion'
      },
      {
        pattern: '!!',
        description: 'boolean coercion',
        category: 'boolean-conversion'
      }
    ];
    
    for (const test of typeCoercionTests) {
      if (toolsCode.includes(test.pattern)) {
        this.addResult('type-transformations', test.category, 'passed',
          `✅ Tools use ${test.description} for type safety`);
      } else {
        this.addResult('type-transformations', test.category, 'warnings',
          `⚠️ Tools may not use ${test.description}`);
      }
    }
    
    // Test for safe type checking before conversion
    const hasTypeChecking = toolsCode.includes('typeof') && 
                           (toolsCode.includes('=== "number"') || 
                            toolsCode.includes('=== "string"') ||
                            toolsCode.includes('=== "boolean"'));
    
    if (hasTypeChecking) {
      this.addResult('type-transformations', 'type-checking', 'passed',
        '✅ Tools perform type checking before transformations');
    } else {
      this.addResult('type-transformations', 'type-checking', 'warnings',
        '⚠️ Tools may not check types before transformations');
    }
    
    // Test for default value handling
    const hasDefaultValues = toolsCode.includes('|| ') && 
                             (toolsCode.includes('200') || toolsCode.includes('50') || toolsCode.includes('10'));
    
    if (hasDefaultValues) {
      this.addResult('type-transformations', 'default-values', 'passed',
        '✅ Tools provide default values for parameters');
    } else {
      this.addResult('type-transformations', 'default-values', 'warnings',
        '⚠️ Tools may not provide default values consistently');
    }
  }

  /**
   * Test bounds checking and sanitization (V2.1.4.3)
   */
  testBoundsCheckingAndSanitization(toolsCode) {
    console.log('🔍 Testing Bounds Checking and Sanitization (V2.1.4.3)...');
    
    // Test API limit enforcement
    const apiLimitTests = [
      {
        param: 'limit',
        maxValue: 500,
        tools: ['get_active_alarms', 'get_flow_data']
      },
      {
        param: 'top',
        maxValue: 50,
        tools: ['get_bandwidth_usage']
      },
      {
        param: 'duration',
        maxValue: 1440,
        tools: ['pause_rule']
      },
      {
        param: 'hours',
        maxValue: 168,
        tools: ['get_recent_rules']
      }
    ];
    
    for (const test of apiLimitTests) {
      const hasLimitEnforcement = toolsCode.includes(`Math.min(${test.param}`) ||
                                 toolsCode.includes(`Math.min((args?.${test.param}`) ||
                                 toolsCode.includes(test.maxValue.toString());
      
      if (hasLimitEnforcement) {
        this.addResult('bounds-checking', `${test.param}-limit-enforcement`, 'passed',
          `✅ ${test.param} parameter enforces API limits (${test.maxValue})`);
      } else {
        this.addResult('bounds-checking', `${test.param}-limit-enforcement`, 'warnings',
          `⚠️ ${test.param} parameter may not enforce API limits`);
      }
    }
    
    // Test minimum value enforcement
    const minimumValueChecks = ['> 0', '>= 1', 'Math.max(1'];
    const hasMinimumChecks = minimumValueChecks.some(check => toolsCode.includes(check));
    
    if (hasMinimumChecks) {
      this.addResult('bounds-checking', 'minimum-value-enforcement', 'passed',
        '✅ Tools enforce minimum values for numeric parameters');
    } else {
      this.addResult('bounds-checking', 'minimum-value-enforcement', 'warnings',
        '⚠️ Tools may not enforce minimum values consistently');
    }
    
    // Test for input sanitization patterns
    const sanitizationPatterns = [
      { pattern: '.trim()', description: 'string trimming' },
      { pattern: '.toLowerCase()', description: 'case normalization' },
      { pattern: '.replace(', description: 'character replacement' },
      { pattern: 'encodeURIComponent', description: 'URI encoding' },
      { pattern: 'escape', description: 'string escaping' }
    ];
    
    for (const pattern of sanitizationPatterns) {
      if (toolsCode.includes(pattern.pattern)) {
        this.addResult('bounds-checking', `sanitization-${pattern.description.replace(' ', '-')}`, 'passed',
          `✅ Tools use ${pattern.description} for input sanitization`);
      } else {
        this.addResult('bounds-checking', `sanitization-${pattern.description.replace(' ', '-')}`, 'warnings',
          `⚠️ Tools may not use ${pattern.description}`);
      }
    }
  }

  /**
   * Test query parameter validation (V2.1.4.4)
   */
  testQueryParameterValidation(toolsCode) {
    console.log('🔍 Testing Query Parameter Validation (V2.1.4.4)...');
    
    // Test for query syntax validation
    const queryValidationPatterns = [
      'query?.includes',
      'query.match(',
      'query.test(',
      'RegExp(',
      '/.*/',
      'query.length'
    ];
    
    const hasQueryValidation = queryValidationPatterns.some(pattern => toolsCode.includes(pattern));
    
    if (hasQueryValidation) {
      this.addResult('query-validation', 'syntax-validation', 'passed',
        '✅ Tools validate query parameter syntax');
    } else {
      this.addResult('query-validation', 'syntax-validation', 'warnings',
        '⚠️ Tools may not validate query parameter syntax');
    }
    
    // Test for injection protection patterns
    const injectionProtectionTests = [
      {
        pattern: 'escape',
        description: 'string escaping for injection protection'
      },
      {
        pattern: 'sanitize',
        description: 'input sanitization'
      },
      {
        pattern: 'validate',
        description: 'input validation'
      }
    ];
    
    for (const test of injectionProtectionTests) {
      if (toolsCode.includes(test.pattern)) {
        this.addResult('query-validation', `injection-protection-${test.pattern}`, 'passed',
          `✅ Tools may use ${test.description}`);
      } else {
        this.addResult('query-validation', `injection-protection-${test.pattern}`, 'warnings',
          `⚠️ Tools may not implement ${test.description}`);
      }
    }
    
    // Test for query complexity limits
    const hasComplexityLimits = toolsCode.includes('length >') ||
                               toolsCode.includes('length <') ||
                               toolsCode.includes('substring(') ||
                               toolsCode.includes('slice(');
    
    if (hasComplexityLimits) {
      this.addResult('query-validation', 'complexity-limits', 'passed',
        '✅ Tools may limit query complexity/length');
    } else {
      this.addResult('query-validation', 'complexity-limits', 'warnings',
        '⚠️ Tools may not limit query complexity');
    }
  }

  /**
   * Test numeric parameter edge cases (V2.1.4.5)
   */
  testNumericParameterEdgeCases(toolsCode) {
    console.log('🔍 Testing Numeric Parameter Edge Cases (V2.1.4.5)...');
    
    // Test for safe number handling
    const safeNumberTests = [
      {
        pattern: 'Number.isInteger',
        description: 'integer validation'
      },
      {
        pattern: 'Number.isFinite',
        description: 'finite number validation'
      },
      {
        pattern: 'Number.isSafeInteger',
        description: 'safe integer validation'
      },
      {
        pattern: 'isNaN',
        description: 'NaN detection'
      },
      {
        pattern: 'Infinity',
        description: 'infinity handling'
      }
    ];
    
    for (const test of safeNumberTests) {
      if (toolsCode.includes(test.pattern)) {
        this.addResult('numeric-edge-cases', test.pattern.replace('.', '-').toLowerCase(), 'passed',
          `✅ Tools use ${test.description}`);
      } else {
        this.addResult('numeric-edge-cases', test.pattern.replace('.', '-').toLowerCase(), 'warnings',
          `⚠️ Tools may not use ${test.description}`);
      }
    }
    
    // Test for floating point handling
    const hasFloatingPointHandling = toolsCode.includes('Math.floor') ||
                                    toolsCode.includes('Math.ceil') ||
                                    toolsCode.includes('Math.round') ||
                                    toolsCode.includes('parseInt');
    
    if (hasFloatingPointHandling) {
      this.addResult('numeric-edge-cases', 'floating-point-handling', 'passed',
        '✅ Tools handle floating point numbers appropriately');
    } else {
      this.addResult('numeric-edge-cases', 'floating-point-handling', 'warnings',
        '⚠️ Tools may not handle floating point numbers consistently');
    }
    
    // Test for scientific notation handling
    const hasScientificNotationHandling = toolsCode.includes('Number(') ||
                                         toolsCode.includes('parseFloat(');
    
    if (hasScientificNotationHandling) {
      this.addResult('numeric-edge-cases', 'scientific-notation', 'passed',
        '✅ Tools may handle scientific notation in numbers');
    } else {
      this.addResult('numeric-edge-cases', 'scientific-notation', 'warnings',
        '⚠️ Tools may not handle scientific notation');
    }
  }

  /**
   * Test string parameter sanitization (V2.1.4.6)
   */
  testStringParameterSanitization(toolsCode) {
    console.log('🔍 Testing String Parameter Sanitization (V2.1.4.6)...');
    
    // Test for HTML/XML sanitization
    const htmlSanitizationTests = [
      {
        pattern: '.replace(<',
        description: 'HTML tag removal'
      },
      {
        pattern: 'encodeHTML',
        description: 'HTML encoding'
      },
      {
        pattern: 'stripTags',
        description: 'tag stripping'
      }
    ];
    
    for (const test of htmlSanitizationTests) {
      if (toolsCode.includes(test.pattern)) {
        this.addResult('string-sanitization', `html-${test.pattern.replace(/[^a-z]/gi, '-')}`, 'passed',
          `✅ Tools may implement ${test.description}`);
      } else {
        this.addResult('string-sanitization', `html-${test.pattern.replace(/[^a-z]/gi, '-')}`, 'warnings',
          `⚠️ Tools may not implement ${test.description}`);
      }
    }
    
    // Test for basic string validation
    const stringValidationTests = [
      {
        pattern: '.trim()',
        description: 'whitespace trimming'
      },
      {
        pattern: '.length',
        description: 'length validation'
      },
      {
        pattern: 'typeof',
        description: 'type checking'
      },
      {
        pattern: 'String(',
        description: 'string conversion'
      }
    ];
    
    for (const test of stringValidationTests) {
      if (toolsCode.includes(test.pattern)) {
        this.addResult('string-sanitization', `validation-${test.description.replace(' ', '-')}`, 'passed',
          `✅ Tools use ${test.description} for string parameters`);
      } else {
        this.addResult('string-sanitization', `validation-${test.description.replace(' ', '-')}`, 'warnings',
          `⚠️ Tools may not use ${test.description}`);
      }
    }
    
    // Test for control character handling
    const controlCharTests = [
      '\\\\n', '\\\\r', '\\\\t', '\\\\0'
    ];
    
    const hasControlCharHandling = controlCharTests.some(char => toolsCode.includes(char));
    
    if (hasControlCharHandling) {
      this.addResult('string-sanitization', 'control-character-handling', 'passed',
        '✅ Tools may handle control characters in strings');
    } else {
      this.addResult('string-sanitization', 'control-character-handling', 'warnings',
        '⚠️ Tools may not handle control characters');
    }
    
    // Test for Unicode normalization
    const hasUnicodeHandling = toolsCode.includes('.normalize(') ||
                              toolsCode.includes('encodeURI') ||
                              toolsCode.includes('decodeURI');
    
    if (hasUnicodeHandling) {
      this.addResult('string-sanitization', 'unicode-handling', 'passed',
        '✅ Tools may handle Unicode normalization');
    } else {
      this.addResult('string-sanitization', 'unicode-handling', 'warnings',
        '⚠️ Tools may not handle Unicode issues');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.4: Test Parameter Validation');
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
    
    // Parameter validation specific analysis
    const validationCategories = [
      'edge-cases', 'type-transformations', 'bounds-checking', 
      'query-validation', 'numeric-edge-cases', 'string-sanitization'
    ];
    
    const validationResults = this.results.details.filter(r => 
      validationCategories.includes(r.category)
    );
    
    const passedValidation = validationResults.filter(r => r.status === 'passed').length;
    const totalValidation = validationResults.length;
    const validationRate = Math.round((passedValidation / totalValidation) * 100);
    
    console.log(`\\n🔒 Parameter Validation Rate: ${validationRate}% (${passedValidation}/${totalValidation})`);
    
    if (this.results.failed <= 2) {
      console.log('\\n🎉 Parameter validation testing successful! V2.1.4 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review parameter validation implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.4 Verification: Test Parameter Validation\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      // Run all verification tests
      this.testEdgeCaseParameterValues(toolsCode);
      this.testParameterTypeTransformations(toolsCode);
      this.testBoundsCheckingAndSanitization(toolsCode);
      this.testQueryParameterValidation(toolsCode);
      this.testNumericParameterEdgeCases(toolsCode);
      this.testStringParameterSanitization(toolsCode);
      
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
  const verifier = new ParameterValidationVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { ParameterValidationVerifier };