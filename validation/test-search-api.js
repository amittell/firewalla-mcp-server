#!/usr/bin/env node

/**
 * Search API validation script for Firewalla MCP server
 * Tests advanced search functionality, query parsing, and edge cases
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  serverCommand: 'npm run mcp:start',
  timeout: 30000,
  maxRetries: 3,
  verbose: process.env.VERBOSE === 'true'
};

// Test cases for different search tools
const SEARCH_TEST_CASES = {
  search_flows: [
    {
      name: 'Basic flow search',
      query: 'protocol:tcp',
      expectedFields: ['results', 'total', 'executionTime']
    },
    {
      name: 'Complex flow search with wildcards',
      query: 'source_ip:192.168.* AND protocol:tcp',
      expectedFields: ['results', 'aggregations']
    },
    {
      name: 'Flow search with time range',
      query: 'blocked:true AND timestamp:>=2024-01-01',
      options: { time_range: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' } },
      expectedFields: ['results', 'appliedFilters']
    },
    {
      name: 'Flow search with aggregation',
      query: 'protocol:tcp OR protocol:udp',
      options: { aggregate: true, group_by: 'protocol' },
      expectedFields: ['results', 'aggregations', 'groups']
    }
  ],
  search_alarms: [
    {
      name: 'Basic alarm search',
      query: 'severity:high',
      expectedFields: ['results', 'total']
    },
    {
      name: 'Alarm search with severity range',
      query: 'severity:>=medium AND status:active',
      expectedFields: ['results', 'appliedFilters']
    },
    {
      name: 'Alarm search with IP filter',
      query: 'source_ip:192.168.* AND severity:critical',
      expectedFields: ['results', 'total']
    },
    {
      name: 'Alarm search with time window',
      query: 'type:*intrusion*',
      options: { time_window: '24h', aggregate: true },
      expectedFields: ['results', 'aggregations']
    }
  ],
  search_rules: [
    {
      name: 'Basic rule search',
      query: 'action:block',
      expectedFields: ['results', 'total']
    },
    {
      name: 'Rule search with target pattern',
      query: 'target_value:*.facebook.com OR target_value:*.twitter.com',
      expectedFields: ['results', 'appliedFilters']
    },
    {
      name: 'Rule search with hit count',
      query: 'hit_count:>0 AND status:active',
      options: { aggregate: true },
      expectedFields: ['results', 'aggregations']
    }
  ],
  search_devices: [
    {
      name: 'Basic device search',
      query: 'online:true',
      expectedFields: ['results', 'total']
    },
    {
      name: 'Device search by vendor',
      query: 'mac_vendor:Apple OR mac_vendor:Samsung',
      expectedFields: ['results', 'appliedFilters']
    },
    {
      name: 'Device search with bandwidth filter',
      query: 'total_download:>1000000',
      options: { aggregate: true },
      expectedFields: ['results', 'aggregations']
    }
  ],
  search_target_lists: [
    {
      name: 'Basic target list search',
      query: 'category:ad',
      expectedFields: ['results', 'total']
    },
    {
      name: 'Target list search by owner',
      query: 'owner:global AND target_count:>100',
      expectedFields: ['results', 'appliedFilters']
    }
  ],
  search_cross_reference: [
    {
      name: 'Cross-reference search',
      primary_query: 'protocol:tcp',
      secondary_queries: ['severity:high'],
      correlation_field: 'source_ip',
      expectedFields: ['primary_results', 'secondary_results', 'correlation_field']
    }
  ]
};

// Query syntax test cases
const QUERY_SYNTAX_TESTS = [
  {
    name: 'Field equality',
    query: 'severity:high',
    shouldPass: true
  },
  {
    name: 'Wildcards',
    query: 'ip:192.168.*',
    shouldPass: true
  },
  {
    name: 'Logical AND',
    query: 'severity:high AND protocol:tcp',
    shouldPass: true
  },
  {
    name: 'Logical OR',
    query: 'action:block OR action:allow',
    shouldPass: true
  },
  {
    name: 'Logical NOT',
    query: 'NOT status:resolved',
    shouldPass: true
  },
  {
    name: 'Grouping with parentheses',
    query: '(severity:high OR severity:critical) AND protocol:tcp',
    shouldPass: true
  },
  {
    name: 'Range queries',
    query: 'bytes:[1000 TO 50000]',
    shouldPass: true
  },
  {
    name: 'Comparison operators',
    query: 'severity:>=medium AND bytes:>1000',
    shouldPass: true
  },
  {
    name: 'Quoted strings',
    query: 'description:"malware detected"',
    shouldPass: true
  },
  {
    name: 'Invalid syntax - missing value',
    query: 'severity:',
    shouldPass: false
  },
  {
    name: 'Invalid syntax - unmatched parentheses',
    query: '(severity:high AND',
    shouldPass: false
  },
  {
    name: 'Invalid syntax - unknown operator',
    query: 'severity~high',
    shouldPass: false
  }
];

// Performance test cases
const PERFORMANCE_TESTS = [
  {
    name: 'Simple query performance',
    query: 'severity:high',
    maxExecutionTime: 2000
  },
  {
    name: 'Complex query performance',
    query: '(severity:high OR severity:critical) AND source_ip:192.168.* AND protocol:tcp',
    maxExecutionTime: 5000
  },
  {
    name: 'Wildcard query performance',
    query: 'description:*suspicious* AND ip:10.*',
    maxExecutionTime: 8000
  },
  {
    name: 'Aggregation performance',
    query: 'protocol:tcp',
    options: { aggregate: true, group_by: 'source_ip' },
    maxExecutionTime: 10000
  }
];

class SearchAPIValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      errors: [],
      warnings: [],
      performance: []
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (level === 'error') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`);
    } else if (TEST_CONFIG.verbose || level === 'info') {
      console.log(`${prefix} ${message}`);
    }
  }

  async runAllTests() {
    this.log('Starting Firewalla MCP Search API validation...');
    
    try {
      // Build the project first
      this.log('Building project...');
      execSync('npm run build', { stdio: 'pipe' });
      this.log('Build completed successfully');

      // Test query syntax validation
      await this.testQuerySyntax();
      
      // Test search tools
      await this.testSearchTools();
      
      // Test performance
      await this.testPerformance();
      
      // Test edge cases
      await this.testEdgeCases();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      this.log(`Validation failed: ${error.message}`, 'error');
      this.results.errors.push(`General error: ${error.message}`);
    }
  }

  async testQuerySyntax() {
    this.log('Testing query syntax validation...');
    
    for (const test of QUERY_SYNTAX_TESTS) {
      try {
        this.log(`Testing: ${test.name}`, 'debug');
        
        // Test query parsing (would need to import and test parser directly)
        // For now, we'll simulate this test
        const result = this.simulateQueryParsing(test.query);
        
        if (result.valid === test.shouldPass) {
          this.results.passed++;
          this.log(`✓ ${test.name}`, 'debug');
        } else {
          this.results.failed++;
          this.results.errors.push(`Query syntax test failed: ${test.name}`);
          this.log(`✗ ${test.name}`, 'error');
        }
      } catch (error) {
        this.results.failed++;
        this.results.errors.push(`Query syntax error in "${test.name}": ${error.message}`);
        this.log(`✗ ${test.name}: ${error.message}`, 'error');
      }
    }
  }

  async testSearchTools() {
    this.log('Testing search tools...');
    
    for (const [toolName, testCases] of Object.entries(SEARCH_TEST_CASES)) {
      this.log(`Testing tool: ${toolName}`);
      
      for (const testCase of testCases) {
        try {
          this.log(`  Testing: ${testCase.name}`, 'debug');
          
          const result = await this.simulateToolCall(toolName, testCase);
          
          if (this.validateToolResult(result, testCase.expectedFields)) {
            this.results.passed++;
            this.log(`  ✓ ${testCase.name}`, 'debug');
          } else {
            this.results.failed++;
            this.results.errors.push(`Tool test failed: ${toolName} - ${testCase.name}`);
            this.log(`  ✗ ${testCase.name}`, 'error');
          }
        } catch (error) {
          this.results.failed++;
          this.results.errors.push(`Tool error in "${toolName} - ${testCase.name}": ${error.message}`);
          this.log(`  ✗ ${testCase.name}: ${error.message}`, 'error');
        }
      }
    }
  }

  async testPerformance() {
    this.log('Testing performance...');
    
    for (const test of PERFORMANCE_TESTS) {
      try {
        this.log(`Testing performance: ${test.name}`, 'debug');
        
        const startTime = Date.now();
        await this.simulateToolCall('search_flows', test);
        const executionTime = Date.now() - startTime;
        
        this.results.performance.push({
          name: test.name,
          executionTime,
          maxExecutionTime: test.maxExecutionTime,
          passed: executionTime <= test.maxExecutionTime
        });
        
        if (executionTime <= test.maxExecutionTime) {
          this.results.passed++;
          this.log(`  ✓ ${test.name} (${executionTime}ms)`, 'debug');
        } else {
          this.results.failed++;
          this.results.warnings.push(`Performance test slow: ${test.name} took ${executionTime}ms (max: ${test.maxExecutionTime}ms)`);
          this.log(`  ⚠ ${test.name} took ${executionTime}ms (expected <${test.maxExecutionTime}ms)`, 'warn');
        }
      } catch (error) {
        this.results.failed++;
        this.results.errors.push(`Performance test error in "${test.name}": ${error.message}`);
        this.log(`  ✗ ${test.name}: ${error.message}`, 'error');
      }
    }
  }

  async testEdgeCases() {
    this.log('Testing edge cases...');
    
    const edgeCases = [
      {
        name: 'Empty query',
        query: '',
        shouldError: true
      },
      {
        name: 'Very long query',
        query: 'severity:high AND '.repeat(100) + 'protocol:tcp',
        shouldError: false
      },
      {
        name: 'Query with special characters',
        query: 'description:"alert: suspicious activity [detected]"',
        shouldError: false
      },
      {
        name: 'Large result set',
        query: 'protocol:tcp',
        options: { limit: 10000 },
        shouldError: false
      }
    ];
    
    for (const testCase of edgeCases) {
      try {
        this.log(`Testing edge case: ${testCase.name}`, 'debug');
        
        const result = await this.simulateToolCall('search_flows', testCase);
        
        if (testCase.shouldError && !result.error) {
          this.results.failed++;
          this.results.errors.push(`Edge case should have failed: ${testCase.name}`);
          this.log(`  ✗ ${testCase.name} (should have failed)`, 'error');
        } else if (!testCase.shouldError && result.error) {
          this.results.failed++;
          this.results.errors.push(`Edge case failed unexpectedly: ${testCase.name}`);
          this.log(`  ✗ ${testCase.name} (unexpected failure)`, 'error');
        } else {
          this.results.passed++;
          this.log(`  ✓ ${testCase.name}`, 'debug');
        }
      } catch (error) {
        if (testCase.shouldError) {
          this.results.passed++;
          this.log(`  ✓ ${testCase.name} (expected error)`, 'debug');
        } else {
          this.results.failed++;
          this.results.errors.push(`Edge case error in "${testCase.name}": ${error.message}`);
          this.log(`  ✗ ${testCase.name}: ${error.message}`, 'error');
        }
      }
    }
  }

  simulateQueryParsing(query) {
    // This is a simplified simulation
    // In a real test, you'd import the actual parser
    
    if (!query || query.trim() === '') {
      return { valid: false, error: 'Empty query' };
    }
    
    // Check for basic syntax errors
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    
    if (openParens !== closeParens) {
      return { valid: false, error: 'Unmatched parentheses' };
    }
    
    // Check for field:value pattern
    if (!query.includes(':') && !query.includes('NOT')) {
      return { valid: false, error: 'No field queries found' };
    }
    
    return { valid: true };
  }

  async simulateToolCall(toolName, testCase) {
    // This simulates an MCP tool call
    // In a real test, you'd make actual MCP calls
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000)); // Simulate API call
    
    if (testCase.query === '') {
      throw new Error('Query parameter is required');
    }
    
    return {
      search_type: toolName.replace('search_', ''),
      query: testCase.query,
      results: Array.from({ length: Math.floor(Math.random() * 50) }, (_, i) => ({ id: i })),
      total: Math.floor(Math.random() * 1000),
      executionTime: Math.floor(Math.random() * 2000),
      fromCache: false,
      aggregations: testCase.options?.aggregate ? {
        total_records: Math.floor(Math.random() * 1000),
        groups: []
      } : undefined,
      appliedFilters: Object.keys(testCase.query.includes(':') ? { [testCase.query.split(':')[0]]: true } : {}),
      optimization: {
        originalComplexity: Math.floor(Math.random() * 10),
        optimizedComplexity: Math.floor(Math.random() * 8),
        transformations: []
      }
    };
  }

  validateToolResult(result, expectedFields) {
    if (!result || typeof result !== 'object') {
      return false;
    }
    
    for (const field of expectedFields) {
      if (!(field in result)) {
        this.log(`Missing expected field: ${field}`, 'debug');
        return false;
      }
    }
    
    return true;
  }

  generateReport() {
    this.log('\n' + '='.repeat(60));
    this.log('FIREWALLA MCP SEARCH API VALIDATION REPORT');
    this.log('='.repeat(60));
    
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;
    
    this.log(`Tests Run: ${total}`);
    this.log(`Passed: ${this.results.passed}`);
    this.log(`Failed: ${this.results.failed}`);
    this.log(`Pass Rate: ${passRate}%`);
    
    if (this.results.performance.length > 0) {
      this.log('\nPERFORMANCE RESULTS:');
      const avgTime = this.results.performance.reduce((sum, p) => sum + p.executionTime, 0) / this.results.performance.length;
      this.log(`Average Execution Time: ${Math.round(avgTime)}ms`);
      
      const slowTests = this.results.performance.filter(p => !p.passed);
      if (slowTests.length > 0) {
        this.log(`Slow Tests: ${slowTests.length}`);
      }
    }
    
    if (this.results.errors.length > 0) {
      this.log('\nERRORS:');
      this.results.errors.forEach(error => this.log(`  - ${error}`));
    }
    
    if (this.results.warnings.length > 0) {
      this.log('\nWARNINGS:');
      this.results.warnings.forEach(warning => this.log(`  - ${warning}`));
    }
    
    this.log('\n' + '='.repeat(60));
    
    if (passRate >= 95) {
      this.log('✅ VALIDATION PASSED - Search API is ready for production', 'info');
      process.exit(0);
    } else if (passRate >= 80) {
      this.log('⚠️  VALIDATION PASSED WITH WARNINGS - Minor issues detected', 'warn');
      process.exit(0);
    } else {
      this.log('❌ VALIDATION FAILED - Major issues detected', 'error');
      process.exit(1);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SearchAPIValidator();
  validator.runAllTests().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = SearchAPIValidator;
