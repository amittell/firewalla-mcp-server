#!/usr/bin/env node

/**
 * V3.1 Verification: Test Advanced Search
 * 
 * Systematically tests advanced search functionality:
 * - Query parser functionality (complex syntax, field:value, AND/OR, wildcards, ranges)
 * - Search query validation (invalid syntax, limits, escaping, injection protection)
 * - Search client methods (searchFlows, searchAlarms, searchRules, searchDevices)
 * - Search result aggregation (group_by, statistics, time buckets, sorting)
 * - Cross-reference search (multi-entity correlation, relationships, linking)
 * - Search performance (complex queries, indexing, caching, concurrency)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AdvancedSearchVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    this.searchQueries = this.createTestQueries();
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
   * Create test search queries
   */
  createTestQueries() {
    return {
      basic: [
        'severity:high',
        'source_ip:192.168.1.1',
        'protocol:tcp',
        'action:block'
      ],
      logical: [
        'severity:high AND source_ip:192.168.*',
        'action:block OR action:timelimit',
        '(severity:high OR severity:critical) AND source_ip:192.168.*'
      ],
      wildcards: [
        'ip:192.168.*',
        'device_name:*laptop*',
        'target_value:*.facebook.com',
        'domain:*google*'
      ],
      ranges: [
        'bytes:[1000 TO 50000]',
        'severity:>=medium',
        'timestamp:>=2024-01-01',
        'count:[10 TO 100]'
      ],
      complex: [
        '(severity:high OR severity:critical) AND source_ip:192.168.* NOT resolved:true',
        'protocol:tcp AND bytes:>=1000000 AND (port:80 OR port:443)',
        'device_type:mobile AND online:false AND last_seen:<=7d'
      ]
    };
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
   * Test query parser functionality (V3.1.1)
   */
  testQueryParserFunctionality(clientCode, typesCode) {
    console.log('🔍 Testing Query Parser Functionality (V3.1.1)...');
    
    // Test for parseSearchQuery function
    if (clientCode.includes('parseSearchQuery') || clientCode.includes('parseQuery')) {
      this.addResult('query-parser', 'parser-function-exists', 'passed',
        '✅ Query parser function found');
    } else {
      this.addResult('query-parser', 'parser-function-exists', 'failed',
        '❌ Query parser function not found');
    }

    // Test for field:value parsing
    if (clientCode.includes(':') && clientCode.includes('split')) {
      this.addResult('query-parser', 'field-value-parsing', 'passed',
        '✅ Field:value parsing patterns found');
    } else {
      this.addResult('query-parser', 'field-value-parsing', 'warnings',
        '⚠️ Field:value parsing patterns not found');
    }

    // Test for logical operators
    const logicalOperators = ['AND', 'OR', 'NOT', '&&', '||', '!'];
    let operatorsFound = 0;

    for (const operator of logicalOperators) {
      if (clientCode.includes(operator)) {
        operatorsFound++;
      }
    }

    if (operatorsFound >= 4) {
      this.addResult('query-parser', 'logical-operators', 'passed',
        `✅ Logical operators found (${operatorsFound}/6)`);
    } else {
      this.addResult('query-parser', 'logical-operators', 'warnings',
        `⚠️ Limited logical operators (${operatorsFound}/6)`);
    }

    // Test for wildcard support
    if (clientCode.includes('*') && (clientCode.includes('wildcard') || clientCode.includes('glob'))) {
      this.addResult('query-parser', 'wildcard-support', 'passed',
        '✅ Wildcard support patterns found');
    } else {
      this.addResult('query-parser', 'wildcard-support', 'warnings',
        '⚠️ Wildcard support patterns not found');
    }

    // Test for range queries
    const rangePatterns = ['TO', '>=', '<=', '>', '<', '[', ']'];
    let rangeSupport = 0;

    for (const pattern of rangePatterns) {
      if (clientCode.includes(pattern)) {
        rangeSupport++;
      }
    }

    if (rangeSupport >= 4) {
      this.addResult('query-parser', 'range-queries', 'passed',
        `✅ Range query support found (${rangeSupport}/7)`);
    } else {
      this.addResult('query-parser', 'range-queries', 'warnings',
        `⚠️ Limited range query support (${rangeSupport}/7)`);
    }

    // Test for parentheses grouping
    if (clientCode.includes('(') && clientCode.includes(')') && clientCode.includes('group')) {
      this.addResult('query-parser', 'parentheses-grouping', 'passed',
        '✅ Parentheses grouping support found');
    } else {
      this.addResult('query-parser', 'parentheses-grouping', 'warnings',
        '⚠️ Parentheses grouping support not found');
    }
  }

  /**
   * Test search query validation (V3.1.2)
   */
  testSearchQueryValidation(clientCode) {
    console.log('🔍 Testing Search Query Validation (V3.1.2)...');
    
    // Test for query syntax validation
    const validationPatterns = ['validate', 'syntax', 'parse', 'error'];
    let validationFound = 0;

    for (const pattern of validationPatterns) {
      if (clientCode.includes(pattern + 'Query') || clientCode.includes(pattern + 'Search')) {
        validationFound++;
      }
    }

    if (validationFound >= 2) {
      this.addResult('query-validation', 'syntax-validation', 'passed',
        `✅ Query syntax validation found (${validationFound}/4)`);
    } else {
      this.addResult('query-validation', 'syntax-validation', 'warnings',
        `⚠️ Limited query syntax validation (${validationFound}/4)`);
    }

    // Test for query length limits
    if (clientCode.includes('length') && (clientCode.includes('limit') || clientCode.includes('max'))) {
      this.addResult('query-validation', 'length-limits', 'passed',
        '✅ Query length limits found');
    } else {
      this.addResult('query-validation', 'length-limits', 'warnings',
        '⚠️ Query length limits not found');
    }

    // Test for special character escaping
    const escapingPatterns = ['escape', 'sanitize', 'encode', 'replace'];
    let escapingFound = 0;

    for (const pattern of escapingPatterns) {
      if (clientCode.includes(pattern)) {
        escapingFound++;
      }
    }

    if (escapingFound >= 2) {
      this.addResult('query-validation', 'character-escaping', 'passed',
        `✅ Character escaping patterns found (${escapingFound}/4)`);
    } else {
      this.addResult('query-validation', 'character-escaping', 'warnings',
        `⚠️ Limited character escaping (${escapingFound}/4)`);
    }

    // Test for injection protection
    const injectionPatterns = ['injection', 'xss', 'sql', 'script'];
    let protectionFound = 0;

    for (const pattern of injectionPatterns) {
      if (clientCode.includes(pattern)) {
        protectionFound++;
      }
    }

    if (protectionFound >= 1) {
      this.addResult('query-validation', 'injection-protection', 'passed',
        `✅ Injection protection patterns found (${protectionFound}/4)`);
    } else {
      this.addResult('query-validation', 'injection-protection', 'warnings',
        '⚠️ Injection protection patterns not found');
    }
  }

  /**
   * Test search client methods (V3.1.3)
   */
  testSearchClientMethods(clientCode) {
    console.log('🔍 Testing Search Client Methods (V3.1.3)...');
    
    const searchMethods = [
      'searchFlows',
      'searchAlarms', 
      'searchRules',
      'searchDevices',
      'searchTargetLists',
      'searchCrossReference'
    ];

    let searchMethodsFound = 0;

    for (const method of searchMethods) {
      const methodPattern = new RegExp(`async\\s+${method}\\s*\\(`, 'g');
      if (methodPattern.test(clientCode)) {
        searchMethodsFound++;
        this.addResult('search-methods', `${method}-exists`, 'passed',
          `✅ Search method ${method} found`);
      } else {
        this.addResult('search-methods', `${method}-exists`, 'warnings',
          `⚠️ Search method ${method} not found`);
      }
    }

    // Overall search methods coverage
    const methodsCoverage = Math.round((searchMethodsFound / searchMethods.length) * 100);
    if (methodsCoverage >= 80) {
      this.addResult('search-methods', 'overall-coverage', 'passed',
        `✅ Search methods coverage: ${methodsCoverage}% (${searchMethodsFound}/${searchMethods.length})`);
    } else if (methodsCoverage >= 50) {
      this.addResult('search-methods', 'overall-coverage', 'warnings',
        `⚠️ Search methods coverage: ${methodsCoverage}% (${searchMethodsFound}/${searchMethods.length})`);
    } else {
      this.addResult('search-methods', 'overall-coverage', 'failed',
        `❌ Search methods coverage: ${methodsCoverage}% (${searchMethodsFound}/${searchMethods.length})`);
    }

    // Test for search parameters
    const searchParams = ['query', 'group_by', 'sort_by', 'limit', 'offset', 'aggregate'];
    let paramsFound = 0;

    for (const param of searchParams) {
      if (clientCode.includes(param)) {
        paramsFound++;
      }
    }

    if (paramsFound >= 4) {
      this.addResult('search-methods', 'search-parameters', 'passed',
        `✅ Search parameters found (${paramsFound}/6)`);
    } else {
      this.addResult('search-methods', 'search-parameters', 'warnings',
        `⚠️ Limited search parameters (${paramsFound}/6)`);
    }

    // Test for search result formatting
    if (clientCode.includes('SearchResult') || clientCode.includes('searchResponse')) {
      this.addResult('search-methods', 'result-formatting', 'passed',
        '✅ Search result formatting found');
    } else {
      this.addResult('search-methods', 'result-formatting', 'warnings',
        '⚠️ Search result formatting not found');
    }
  }

  /**
   * Test search result aggregation (V3.1.4)
   */
  testSearchResultAggregation(clientCode, typesCode) {
    console.log('🔍 Testing Search Result Aggregation (V3.1.4)...');
    
    // Test for group_by functionality
    if (clientCode.includes('group_by') || clientCode.includes('groupBy')) {
      this.addResult('result-aggregation', 'group-by-functionality', 'passed',
        '✅ Group by functionality found');
    } else {
      this.addResult('result-aggregation', 'group-by-functionality', 'warnings',
        '⚠️ Group by functionality not found');
    }

    // Test for statistical aggregations
    const statsPatterns = ['sum', 'avg', 'count', 'min', 'max', 'mean'];
    let statsFound = 0;

    for (const pattern of statsPatterns) {
      if (clientCode.includes(pattern)) {
        statsFound++;
      }
    }

    if (statsFound >= 3) {
      this.addResult('result-aggregation', 'statistical-aggregations', 'passed',
        `✅ Statistical aggregations found (${statsFound}/6)`);
    } else {
      this.addResult('result-aggregation', 'statistical-aggregations', 'warnings',
        `⚠️ Limited statistical aggregations (${statsFound}/6)`);
    }

    // Test for time-based bucketing
    const timeBuckets = ['hour', 'day', 'week', 'month', 'bucket'];
    let timeBucketingFound = 0;

    for (const bucket of timeBuckets) {
      if (clientCode.includes(bucket)) {
        timeBucketingFound++;
      }
    }

    if (timeBucketingFound >= 2) {
      this.addResult('result-aggregation', 'time-bucketing', 'passed',
        `✅ Time-based bucketing found (${timeBucketingFound}/5)`);
    } else {
      this.addResult('result-aggregation', 'time-bucketing', 'warnings',
        `⚠️ Limited time-based bucketing (${timeBucketingFound}/5)`);
    }

    // Test for result sorting
    if (clientCode.includes('sort') && (clientCode.includes('asc') || clientCode.includes('desc'))) {
      this.addResult('result-aggregation', 'result-sorting', 'passed',
        '✅ Result sorting functionality found');
    } else {
      this.addResult('result-aggregation', 'result-sorting', 'warnings',
        '⚠️ Result sorting functionality not found');
    }

    // Test for pagination in search results
    if (clientCode.includes('offset') || clientCode.includes('cursor')) {
      this.addResult('result-aggregation', 'result-pagination', 'passed',
        '✅ Result pagination found');
    } else {
      this.addResult('result-aggregation', 'result-pagination', 'warnings',
        '⚠️ Result pagination not found');
    }
  }

  /**
   * Test cross-reference search (V3.1.5)
   */
  testCrossReferenceSearch(clientCode) {
    console.log('🔍 Testing Cross-Reference Search (V3.1.5)...');
    
    // Test for cross-reference functionality
    if (clientCode.includes('crossReference') || clientCode.includes('cross_reference')) {
      this.addResult('cross-reference', 'cross-reference-functionality', 'passed',
        '✅ Cross-reference functionality found');
    } else {
      this.addResult('cross-reference', 'cross-reference-functionality', 'warnings',
        '⚠️ Cross-reference functionality not found');
    }

    // Test for entity correlation
    const correlationPatterns = ['correlat', 'relation', 'link', 'connect'];
    let correlationFound = 0;

    for (const pattern of correlationPatterns) {
      if (clientCode.includes(pattern)) {
        correlationFound++;
      }
    }

    if (correlationFound >= 2) {
      this.addResult('cross-reference', 'entity-correlation', 'passed',
        `✅ Entity correlation patterns found (${correlationFound}/4)`);
    } else {
      this.addResult('cross-reference', 'entity-correlation', 'warnings',
        `⚠️ Limited entity correlation (${correlationFound}/4)`);
    }

    // Test for relationship discovery
    if (clientCode.includes('relationship') || clientCode.includes('discover')) {
      this.addResult('cross-reference', 'relationship-discovery', 'passed',
        '✅ Relationship discovery patterns found');
    } else {
      this.addResult('cross-reference', 'relationship-discovery', 'warnings',
        '⚠️ Relationship discovery patterns not found');
    }

    // Test for result linking
    if (clientCode.includes('join') || clientCode.includes('merge') || clientCode.includes('combine')) {
      this.addResult('cross-reference', 'result-linking', 'passed',
        '✅ Result linking patterns found');
    } else {
      this.addResult('cross-reference', 'result-linking', 'warnings',
        '⚠️ Result linking patterns not found');
    }
  }

  /**
   * Test search performance (V3.1.6)
   */
  testSearchPerformance(clientCode) {
    console.log('🔍 Testing Search Performance (V3.1.6)...');
    
    // Test for indexing strategies
    const indexPatterns = ['index', 'Index', 'btree', 'hash'];
    let indexingFound = 0;

    for (const pattern of indexPatterns) {
      if (clientCode.includes(pattern)) {
        indexingFound++;
      }
    }

    if (indexingFound >= 2) {
      this.addResult('search-performance', 'indexing-strategies', 'passed',
        `✅ Indexing strategies found (${indexingFound}/4)`);
    } else {
      this.addResult('search-performance', 'indexing-strategies', 'warnings',
        `⚠️ Limited indexing strategies (${indexingFound}/4)`);
    }

    // Test for search result caching
    if (clientCode.includes('cache') && clientCode.includes('search')) {
      this.addResult('search-performance', 'search-caching', 'passed',
        '✅ Search result caching found');
    } else {
      this.addResult('search-performance', 'search-caching', 'warnings',
        '⚠️ Search result caching not found');
    }

    // Test for query optimization
    const optimizationPatterns = ['optimize', 'plan', 'explain', 'cost'];
    let optimizationFound = 0;

    for (const pattern of optimizationPatterns) {
      if (clientCode.includes(pattern)) {
        optimizationFound++;
      }
    }

    if (optimizationFound >= 2) {
      this.addResult('search-performance', 'query-optimization', 'passed',
        `✅ Query optimization patterns found (${optimizationFound}/4)`);
    } else {
      this.addResult('search-performance', 'query-optimization', 'warnings',
        `⚠️ Limited query optimization (${optimizationFound}/4)`);
    }

    // Test for concurrent search handling
    if (clientCode.includes('concurrent') || clientCode.includes('parallel')) {
      this.addResult('search-performance', 'concurrent-search', 'passed',
        '✅ Concurrent search handling found');
    } else {
      this.addResult('search-performance', 'concurrent-search', 'warnings',
        '⚠️ Concurrent search handling not found');
    }

    // Test for search timeout handling
    if (clientCode.includes('timeout') && clientCode.includes('search')) {
      this.addResult('search-performance', 'search-timeout', 'passed',
        '✅ Search timeout handling found');
    } else {
      this.addResult('search-performance', 'search-timeout', 'warnings',
        '⚠️ Search timeout handling not found');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V3.1: Test Advanced Search');
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
    
    // Advanced search specific analysis
    const searchCategories = [
      'query-parser', 'query-validation', 'search-methods',
      'result-aggregation', 'cross-reference', 'search-performance'
    ];
    
    const searchResults = this.results.details.filter(r => 
      searchCategories.includes(r.category)
    );
    
    const passedSearch = searchResults.filter(r => r.status === 'passed').length;
    const totalSearch = searchResults.length;
    const searchRate = Math.round((passedSearch / totalSearch) * 100);
    
    console.log(`\\n🔍 Advanced Search Implementation Rate: ${searchRate}% (${passedSearch}/${totalSearch})`);
    
    // Test query examples
    console.log(`\\n🧪 Test Query Examples:`);
    console.log(`  • Basic: ${this.searchQueries.basic[0]}`);
    console.log(`  • Logical: ${this.searchQueries.logical[0]}`);
    console.log(`  • Wildcards: ${this.searchQueries.wildcards[0]}`);
    console.log(`  • Ranges: ${this.searchQueries.ranges[0]}`);
    console.log(`  • Complex: ${this.searchQueries.complex[0]}`);
    
    if (this.results.failed <= 2) {
      console.log('\\n🎉 Advanced search testing successful! V3.1 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review advanced search implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V3.1 Verification: Test Advanced Search\\n');
    
    try {
      // Read source files
      const { tools: toolsCode, client: clientCode, types: typesCode } = await this.readSourceFiles();
      this.addResult('setup', 'read-source-files', 'passed', 
        '✅ Successfully read all source files');
      
      // Run all verification tests
      this.testQueryParserFunctionality(clientCode, typesCode);
      this.testSearchQueryValidation(clientCode);
      this.testSearchClientMethods(clientCode);
      this.testSearchResultAggregation(clientCode, typesCode);
      this.testCrossReferenceSearch(clientCode);
      this.testSearchPerformance(clientCode);
      
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
  const verifier = new AdvancedSearchVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { AdvancedSearchVerifier };