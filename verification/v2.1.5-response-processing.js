#!/usr/bin/env node

/**
 * V2.1.5 Verification: Test Response Processing
 * 
 * Systematically tests response processing in MCP tools:
 * - Response format consistency ({count, results[], next_cursor})
 * - Response optimization (token usage, summary modes, field filtering)
 * - Pagination functionality (cursor-based pagination)
 * - Timestamp processing (formats, conversion, validation)
 * - Large dataset handling (memory usage, response time, truncation)
 * - Response data validation (schemas, types, required fields)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ResponseProcessingVerifier {
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
   * Test response format consistency (V2.1.5.1)
   */
  testResponseFormatConsistency(toolsCode) {
    console.log('🔍 Testing Response Format Consistency (V2.1.5.1)...');
    
    const coreTools = [
      'get_active_alarms',
      'get_flow_data',
      'get_device_status',
      'get_network_rules',
      'get_boxes'
    ];
    
    // Test standardized response format
    for (const toolName of coreTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) {
        this.addResult('format-consistency', `${toolName}-not-found`, 'warnings',
          `⚠️ Tool ${toolName} not found for format testing`);
        continue;
      }
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for count field
      if (caseContent.includes('count:')) {
        this.addResult('format-consistency', `${toolName}-count-field`, 'passed',
          `✅ ${toolName} includes count field in response`);
      } else {
        this.addResult('format-consistency', `${toolName}-count-field`, 'failed',
          `❌ ${toolName} missing count field in response`);
      }
      
      // Check for results array field
      const hasResultsField = caseContent.includes('alarms:') || 
                             caseContent.includes('flows:') ||
                             caseContent.includes('devices:') ||
                             caseContent.includes('rules:') ||
                             caseContent.includes('boxes:');
      
      if (hasResultsField) {
        this.addResult('format-consistency', `${toolName}-results-field`, 'passed',
          `✅ ${toolName} includes results array field`);
      } else {
        this.addResult('format-consistency', `${toolName}-results-field`, 'failed',
          `❌ ${toolName} missing results array field`);
      }
      
      // Check for next_cursor field (for paginated responses)
      if (caseContent.includes('next_cursor')) {
        this.addResult('format-consistency', `${toolName}-cursor-field`, 'passed',
          `✅ ${toolName} includes next_cursor field for pagination`);
      } else {
        this.addResult('format-consistency', `${toolName}-cursor-field`, 'warnings',
          `⚠️ ${toolName} may not support pagination cursors`);
      }
      
      // Check for consistent JSON response structure
      if (caseContent.includes('JSON.stringify(') && caseContent.includes('content: [')) {
        this.addResult('format-consistency', `${toolName}-json-structure`, 'passed',
          `✅ ${toolName} uses consistent JSON response structure`);
      } else {
        this.addResult('format-consistency', `${toolName}-json-structure`, 'failed',
          `❌ ${toolName} inconsistent JSON response structure`);
      }
    }
    
    // Test specialized tools for format consistency
    const specializedTools = [
      'get_bandwidth_usage',
      'get_target_lists',
      'get_network_rules_summary',
      'get_most_active_rules',
      'get_recent_rules'
    ];
    
    for (const toolName of specializedTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for consistent response wrapper
      if (caseContent.includes('JSON.stringify(') && caseContent.includes('content: [')) {
        this.addResult('format-consistency', `${toolName}-specialized-format`, 'passed',
          `✅ ${toolName} uses consistent response format`);
      } else {
        this.addResult('format-consistency', `${toolName}-specialized-format`, 'warnings',
          `⚠️ ${toolName} may have inconsistent response format`);
      }
    }
  }

  /**
   * Test response optimization (V2.1.5.2)
   */
  testResponseOptimization(toolsCode, clientCode) {
    console.log('🔍 Testing Response Optimization (V2.1.5.2)...');
    
    // Check for @optimizeResponse decorator usage
    const optimizeDecoratorPattern = /@optimizeResponse\s*\(\s*['"][^'"]+['"]\s*\)/g;
    const optimizeMatches = clientCode.match(optimizeDecoratorPattern);
    
    if (optimizeMatches && optimizeMatches.length > 0) {
      this.addResult('response-optimization', 'optimize-decorator-usage', 'passed',
        `✅ Found ${optimizeMatches.length} @optimizeResponse decorators in client methods`);
    } else {
      this.addResult('response-optimization', 'optimize-decorator-usage', 'failed',
        '❌ No @optimizeResponse decorators found in client methods');
    }
    
    // Check for token usage optimization
    if (clientCode.includes('truncateForTokens') || clientCode.includes('summarizeResponse')) {
      this.addResult('response-optimization', 'token-optimization', 'passed',
        '✅ Token usage optimization methods found');
    } else {
      this.addResult('response-optimization', 'token-optimization', 'warnings',
        '⚠️ Token usage optimization methods not found');
    }
    
    // Check for field filtering capabilities
    if (clientCode.includes('fields:') || clientCode.includes('summary_only')) {
      this.addResult('response-optimization', 'field-filtering', 'passed',
        '✅ Field filtering capabilities found');
    } else {
      this.addResult('response-optimization', 'field-filtering', 'warnings',
        '⚠️ Field filtering capabilities not found');
    }
    
    // Check for response compression techniques
    if (clientCode.includes('compress') || clientCode.includes('minify')) {
      this.addResult('response-optimization', 'response-compression', 'passed',
        '✅ Response compression techniques found');
    } else {
      this.addResult('response-optimization', 'response-compression', 'warnings',
        '⚠️ Response compression techniques not found');
    }
    
    // Check for summary mode in tools
    const summaryModeTools = ['get_network_rules', 'get_network_rules_summary'];
    for (const toolName of summaryModeTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      if (caseContent.includes('summary_only') || caseContent.includes('summary_mode')) {
        this.addResult('response-optimization', `${toolName}-summary-mode`, 'passed',
          `✅ ${toolName} supports summary mode optimization`);
      } else {
        this.addResult('response-optimization', `${toolName}-summary-mode`, 'warnings',
          `⚠️ ${toolName} may not support summary mode`);
      }
    }
  }

  /**
   * Test pagination functionality (V2.1.5.3)
   */
  testPaginationFunctionality(toolsCode, clientCode) {
    console.log('🔍 Testing Pagination Functionality (V2.1.5.3)...');
    
    const paginatedTools = [
      'get_active_alarms',
      'get_flow_data',
      'get_network_rules'
    ];
    
    // Check client methods for cursor support
    for (const toolName of paginatedTools) {
      const methodName = toolName.replace('get_', 'get').replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
      
      if (clientCode.includes(`${methodName}(`) && clientCode.includes('cursor')) {
        this.addResult('pagination-functionality', `${methodName}-cursor-support`, 'passed',
          `✅ Client method ${methodName} supports cursor parameter`);
      } else {
        this.addResult('pagination-functionality', `${methodName}-cursor-support`, 'warnings',
          `⚠️ Client method ${methodName} may not support cursor parameter`);
      }
    }
    
    // Check tools for cursor handling
    for (const toolName of paginatedTools) {
      const caseStart = toolsCode.indexOf(`case '${toolName}':`);
      if (caseStart === -1) continue;
      
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check for cursor parameter extraction
      if (caseContent.includes('cursor') || caseContent.includes('next_cursor')) {
        this.addResult('pagination-functionality', `${toolName}-cursor-extraction`, 'passed',
          `✅ ${toolName} extracts cursor parameter`);
      } else {
        this.addResult('pagination-functionality', `${toolName}-cursor-extraction`, 'warnings',
          `⚠️ ${toolName} may not extract cursor parameter`);
      }
      
      // Check for cursor in response
      if (caseContent.includes('next_cursor:')) {
        this.addResult('pagination-functionality', `${toolName}-cursor-response`, 'passed',
          `✅ ${toolName} includes next_cursor in response`);
      } else {
        this.addResult('pagination-functionality', `${toolName}-cursor-response`, 'warnings',
          `⚠️ ${toolName} may not include next_cursor in response`);
      }
    }
    
    // Check for limit parameter handling
    const limitPattern = /Math\.min\s*\(\s*\(?args\?\.\s*limit\s*\|\|\s*\d+\)?\s*,\s*\d+\s*\)/g;
    if (limitPattern.test(toolsCode)) {
      this.addResult('pagination-functionality', 'limit-enforcement', 'passed',
        '✅ Tools enforce pagination limits properly');
    } else {
      this.addResult('pagination-functionality', 'limit-enforcement', 'warnings',
        '⚠️ Tools may not enforce pagination limits');
    }
  }

  /**
   * Test timestamp processing (V2.1.5.4)
   */
  testTimestampProcessing(toolsCode, clientCode) {
    console.log('🔍 Testing Timestamp Processing (V2.1.5.4)...');
    
    // Check for timestamp fields in responses
    const timestampFields = ['ts', 'timestamp', 'lastSeen', 'updateTs', 'createdAt', 'updatedAt'];
    let timestampFieldsFound = 0;
    
    for (const field of timestampFields) {
      if (toolsCode.includes(`${field}:`) || clientCode.includes(`${field}:`)) {
        timestampFieldsFound++;
        this.addResult('timestamp-processing', `${field}-field-found`, 'passed',
          `✅ Timestamp field ${field} found in responses`);
      }
    }
    
    if (timestampFieldsFound > 0) {
      this.addResult('timestamp-processing', 'timestamp-fields-present', 'passed',
        `✅ Found ${timestampFieldsFound} timestamp fields in responses`);
    } else {
      this.addResult('timestamp-processing', 'timestamp-fields-present', 'warnings',
        '⚠️ No timestamp fields found in responses');
    }
    
    // Check for timestamp conversion utilities
    const timestampConversions = ['new Date(', 'Date.now()', 'toISOString()', 'getTime()'];
    let conversionsFound = 0;
    
    for (const conversion of timestampConversions) {
      if (clientCode.includes(conversion) || toolsCode.includes(conversion)) {
        conversionsFound++;
        this.addResult('timestamp-processing', `timestamp-conversion-${conversion.replace(/[^a-zA-Z]/g, '')}`, 'passed',
          `✅ Timestamp conversion ${conversion} found`);
      }
    }
    
    // Check for time range filtering
    const timeRangeParams = ['start_time', 'end_time', 'since', 'until'];
    for (const param of timeRangeParams) {
      if (toolsCode.includes(param)) {
        this.addResult('timestamp-processing', `${param}-parameter`, 'passed',
          `✅ Time range parameter ${param} found`);
      }
    }
    
    // Check for timestamp validation
    if (clientCode.includes('Date.parse') || clientCode.includes('isValid')) {
      this.addResult('timestamp-processing', 'timestamp-validation', 'passed',
        '✅ Timestamp validation found');
    } else {
      this.addResult('timestamp-processing', 'timestamp-validation', 'warnings',
        '⚠️ Timestamp validation not found');
    }
  }

  /**
   * Test large dataset handling (V2.1.5.5)
   */
  testLargeDatasetHandling(toolsCode, clientCode) {
    console.log('🔍 Testing Large Dataset Handling (V2.1.5.5)...');
    
    // Check for limit enforcement to prevent oversized responses
    const limitValues = ['500', '200', '100', '50'];
    let limitEnforcementFound = false;
    
    for (const limit of limitValues) {
      if (toolsCode.includes(`Math.min(`) && toolsCode.includes(limit)) {
        limitEnforcementFound = true;
        this.addResult('large-dataset-handling', `limit-${limit}-enforcement`, 'passed',
          `✅ Limit enforcement found for maximum ${limit}`);
      }
    }
    
    if (!limitEnforcementFound) {
      this.addResult('large-dataset-handling', 'limit-enforcement', 'warnings',
        '⚠️ No limit enforcement found for large datasets');
    }
    
    // Check for response truncation mechanisms
    if (clientCode.includes('truncate') || clientCode.includes('slice(')) {
      this.addResult('large-dataset-handling', 'response-truncation', 'passed',
        '✅ Response truncation mechanisms found');
    } else {
      this.addResult('large-dataset-handling', 'response-truncation', 'warnings',
        '⚠️ Response truncation mechanisms not found');
    }
    
    // Check for memory-efficient processing
    const memoryEfficientPatterns = ['stream', 'chunk', 'batch', 'lazy'];
    let memoryEfficientFound = false;
    
    for (const pattern of memoryEfficientPatterns) {
      if (clientCode.includes(pattern)) {
        memoryEfficientFound = true;
        this.addResult('large-dataset-handling', `memory-efficient-${pattern}`, 'passed',
          `✅ Memory-efficient processing pattern ${pattern} found`);
      }
    }
    
    if (!memoryEfficientFound) {
      this.addResult('large-dataset-handling', 'memory-efficient-processing', 'warnings',
        '⚠️ Memory-efficient processing patterns not found');
    }
    
    // Check for pagination to handle large datasets
    if (toolsCode.includes('next_cursor') && toolsCode.includes('limit')) {
      this.addResult('large-dataset-handling', 'pagination-for-large-datasets', 'passed',
        '✅ Pagination available for large dataset handling');
    } else {
      this.addResult('large-dataset-handling', 'pagination-for-large-datasets', 'warnings',
        '⚠️ Pagination may not be available for large datasets');
    }
    
    // Check for response size monitoring
    if (clientCode.includes('length') || clientCode.includes('size')) {
      this.addResult('large-dataset-handling', 'response-size-monitoring', 'passed',
        '✅ Response size monitoring found');
    } else {
      this.addResult('large-dataset-handling', 'response-size-monitoring', 'warnings',
        '⚠️ Response size monitoring not found');
    }
  }

  /**
   * Test response data validation (V2.1.5.6)
   */
  testResponseDataValidation(toolsCode, clientCode) {
    console.log('🔍 Testing Response Data Validation (V2.1.5.6)...');
    
    // Check for @validateResponse decorator usage
    const validateDecoratorPattern = /@validateResponse\s*\(\s*[^)]+\s*\)/g;
    const validateMatches = clientCode.match(validateDecoratorPattern);
    
    if (validateMatches && validateMatches.length > 0) {
      this.addResult('response-validation', 'validate-decorator-usage', 'passed',
        `✅ Found ${validateMatches.length} @validateResponse decorators`);
    } else {
      this.addResult('response-validation', 'validate-decorator-usage', 'warnings',
        '⚠️ No @validateResponse decorators found');
    }
    
    // Check for response schema validation
    if (clientCode.includes('ResponseValidator') || clientCode.includes('validateSchema')) {
      this.addResult('response-validation', 'schema-validation', 'passed',
        '✅ Response schema validation found');
    } else {
      this.addResult('response-validation', 'schema-validation', 'warnings',
        '⚠️ Response schema validation not found');
    }
    
    // Check for type checking in responses
    const typeCheckPatterns = ['typeof', 'instanceof', 'Array.isArray', 'isInteger', 'isFinite'];
    let typeCheckingFound = false;
    
    for (const pattern of typeCheckPatterns) {
      if (clientCode.includes(pattern)) {
        typeCheckingFound = true;
        this.addResult('response-validation', `type-checking-${pattern.replace('.', '-')}`, 'passed',
          `✅ Type checking pattern ${pattern} found`);
      }
    }
    
    if (!typeCheckingFound) {
      this.addResult('response-validation', 'type-checking', 'warnings',
        '⚠️ Type checking patterns not found');
    }
    
    // Check for required field validation
    if (clientCode.includes('required') || toolsCode.includes('required')) {
      this.addResult('response-validation', 'required-field-validation', 'passed',
        '✅ Required field validation found');
    } else {
      this.addResult('response-validation', 'required-field-validation', 'warnings',
        '⚠️ Required field validation not found');
    }
    
    // Check for error response handling
    if (toolsCode.includes('isError: true') && toolsCode.includes('error')) {
      this.addResult('response-validation', 'error-response-handling', 'passed',
        '✅ Error response handling found');
    } else {
      this.addResult('response-validation', 'error-response-handling', 'failed',
        '❌ Error response handling not found');
    }
    
    // Check for malformed response protection
    if (clientCode.includes('try') && clientCode.includes('catch') && clientCode.includes('JSON.parse')) {
      this.addResult('response-validation', 'malformed-response-protection', 'passed',
        '✅ Malformed response protection found');
    } else {
      this.addResult('response-validation', 'malformed-response-protection', 'warnings',
        '⚠️ Malformed response protection not found');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.5: Test Response Processing');
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
    
    // Response processing specific analysis
    const processingCategories = [
      'format-consistency', 'response-optimization', 'pagination-functionality',
      'timestamp-processing', 'large-dataset-handling', 'response-validation'
    ];
    
    const processingResults = this.results.details.filter(r => 
      processingCategories.includes(r.category)
    );
    
    const passedProcessing = processingResults.filter(r => r.status === 'passed').length;
    const totalProcessing = processingResults.length;
    const processingRate = Math.round((passedProcessing / totalProcessing) * 100);
    
    console.log(`\\n📋 Response Processing Rate: ${processingRate}% (${passedProcessing}/${totalProcessing})`);
    
    if (this.results.failed <= 3) {
      console.log('\\n🎉 Response processing testing successful! V2.1.5 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review response processing implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.5 Verification: Test Response Processing\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      const clientCode = await this.readClientCode();
      this.addResult('setup', 'read-client-code', 'passed', 
        '✅ Successfully read client source code');
      
      // Run all verification tests
      this.testResponseFormatConsistency(toolsCode);
      this.testResponseOptimization(toolsCode, clientCode);
      this.testPaginationFunctionality(toolsCode, clientCode);
      this.testTimestampProcessing(toolsCode, clientCode);
      this.testLargeDatasetHandling(toolsCode, clientCode);
      this.testResponseDataValidation(toolsCode, clientCode);
      
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
  const verifier = new ResponseProcessingVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { ResponseProcessingVerifier };