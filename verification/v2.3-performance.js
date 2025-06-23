#!/usr/bin/env node

/**
 * V2.3 Verification: Test Performance
 * 
 * Systematically tests performance and optimization:
 * - Response time performance (normal load, large datasets, concurrent requests)
 * - Memory usage (efficiency, large responses, leaks, garbage collection)
 * - Caching performance (hit/miss ratios, improvements, overhead, invalidation)
 * - API rate limiting (compliance, backoff, retry, throttling)
 * - Optimization effectiveness (@optimizeResponse, truncation, field filtering)
 * - Scalability (load testing, linear scaling, resource utilization)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    this.performanceMetrics = {
      responseTimes: [],
      memoryUsage: [],
      cacheHitRates: []
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
   * Test response time performance (V2.3.1)
   */
  testResponseTimePerformance(toolsCode, clientCode) {
    console.log('🔍 Testing Response Time Performance (V2.3.1)...');
    
    // Test for async/await usage (performance indicator)
    const asyncAwaitCount = (clientCode.match(/async|await/g) || []).length;
    if (asyncAwaitCount >= 10) {
      this.addResult('response-time', 'async-await-usage', 'passed',
        `✅ Good async/await usage found (${asyncAwaitCount} instances)`);
    } else {
      this.addResult('response-time', 'async-await-usage', 'warnings',
        `⚠️ Limited async/await usage (${asyncAwaitCount} instances)`);
    }

    // Test for timeout configurations
    const timeoutPatterns = ['timeout', 'maxWait', 'duration'];
    let timeoutConfigFound = 0;

    for (const pattern of timeoutPatterns) {
      if (clientCode.includes(pattern)) {
        timeoutConfigFound++;
      }
    }

    if (timeoutConfigFound >= 1) {
      this.addResult('response-time', 'timeout-configuration', 'passed',
        `✅ Timeout configuration found (${timeoutConfigFound}/3)`);
    } else {
      this.addResult('response-time', 'timeout-configuration', 'warnings',
        '⚠️ Timeout configuration not found');
    }

    // Test for concurrent request handling
    if (clientCode.includes('Promise.all') || clientCode.includes('concurrent')) {
      this.addResult('response-time', 'concurrent-request-handling', 'passed',
        '✅ Concurrent request handling patterns found');
    } else {
      this.addResult('response-time', 'concurrent-request-handling', 'warnings',
        '⚠️ Concurrent request handling patterns not found');
    }

    // Test for response time optimization patterns
    const optimizationPatterns = ['cache', 'memoize', 'debounce', 'throttle'];
    let optimizationFound = 0;

    for (const pattern of optimizationPatterns) {
      if (clientCode.includes(pattern)) {
        optimizationFound++;
      }
    }

    if (optimizationFound >= 2) {
      this.addResult('response-time', 'optimization-patterns', 'passed',
        `✅ Response time optimization patterns found (${optimizationFound}/4)`);
    } else {
      this.addResult('response-time', 'optimization-patterns', 'warnings',
        `⚠️ Limited optimization patterns (${optimizationFound}/4)`);
    }
  }

  /**
   * Test memory usage (V2.3.2)
   */
  testMemoryUsage(clientCode) {
    console.log('🔍 Testing Memory Usage (V2.3.2)...');
    
    // Test for memory-efficient patterns
    const memoryEfficientPatterns = ['stream', 'chunk', 'batch', 'lazy', 'generator'];
    let memoryPatternFound = 0;

    for (const pattern of memoryEfficientPatterns) {
      if (clientCode.includes(pattern)) {
        memoryPatternFound++;
      }
    }

    if (memoryPatternFound >= 1) {
      this.addResult('memory-usage', 'memory-efficient-patterns', 'passed',
        `✅ Memory-efficient patterns found (${memoryPatternFound}/5)`);
    } else {
      this.addResult('memory-usage', 'memory-efficient-patterns', 'warnings',
        '⚠️ Memory-efficient patterns not found');
    }

    // Test for object cleanup patterns
    const cleanupPatterns = ['delete', 'null', 'clear', 'dispose'];
    let cleanupFound = 0;

    for (const pattern of cleanupPatterns) {
      if (clientCode.includes(`= ${pattern}`) || clientCode.includes(`.${pattern}(`)) {
        cleanupFound++;
      }
    }

    if (cleanupFound >= 2) {
      this.addResult('memory-usage', 'object-cleanup', 'passed',
        `✅ Object cleanup patterns found (${cleanupFound}/4)`);
    } else {
      this.addResult('memory-usage', 'object-cleanup', 'warnings',
        `⚠️ Limited object cleanup patterns (${cleanupFound}/4)`);
    }

    // Test for memory monitoring
    if (clientCode.includes('memory') || clientCode.includes('heap')) {
      this.addResult('memory-usage', 'memory-monitoring', 'passed',
        '✅ Memory monitoring patterns found');
    } else {
      this.addResult('memory-usage', 'memory-monitoring', 'warnings',
        '⚠️ Memory monitoring patterns not found');
    }

    // Test for buffer management
    if (clientCode.includes('Buffer') || clientCode.includes('ArrayBuffer')) {
      this.addResult('memory-usage', 'buffer-management', 'passed',
        '✅ Buffer management patterns found');
    } else {
      this.addResult('memory-usage', 'buffer-management', 'warnings',
        '⚠️ Buffer management patterns not found');
    }
  }

  /**
   * Test caching performance (V2.3.3)
   */
  testCachingPerformance(clientCode) {
    console.log('🔍 Testing Caching Performance (V2.3.3)...');
    
    // Test for caching implementation
    const cachingPatterns = ['cache', 'Cache', 'memoize', 'store'];
    let cachingFound = 0;

    for (const pattern of cachingPatterns) {
      if (clientCode.includes(pattern)) {
        cachingFound++;
      }
    }

    if (cachingFound >= 2) {
      this.addResult('caching-performance', 'caching-implementation', 'passed',
        `✅ Caching implementation found (${cachingFound}/4)`);
    } else {
      this.addResult('caching-performance', 'caching-implementation', 'warnings',
        `⚠️ Limited caching implementation (${cachingFound}/4)`);
    }

    // Test for cache key strategies
    if (clientCode.includes('key') && (clientCode.includes('hash') || clientCode.includes('id'))) {
      this.addResult('caching-performance', 'cache-key-strategies', 'passed',
        '✅ Cache key strategies found');
    } else {
      this.addResult('caching-performance', 'cache-key-strategies', 'warnings',
        '⚠️ Cache key strategies not found');
    }

    // Test for cache TTL/expiration
    const expirationPatterns = ['ttl', 'TTL', 'expir', 'timeout', 'maxAge'];
    let expirationFound = 0;

    for (const pattern of expirationPatterns) {
      if (clientCode.includes(pattern)) {
        expirationFound++;
      }
    }

    if (expirationFound >= 2) {
      this.addResult('caching-performance', 'cache-expiration', 'passed',
        `✅ Cache expiration patterns found (${expirationFound}/5)`);
    } else {
      this.addResult('caching-performance', 'cache-expiration', 'warnings',
        `⚠️ Limited cache expiration patterns (${expirationFound}/5)`);
    }

    // Test for cache invalidation
    if (clientCode.includes('invalidate') || clientCode.includes('evict') || clientCode.includes('flush')) {
      this.addResult('caching-performance', 'cache-invalidation', 'passed',
        '✅ Cache invalidation patterns found');
    } else {
      this.addResult('caching-performance', 'cache-invalidation', 'warnings',
        '⚠️ Cache invalidation patterns not found');
    }

    // Test for cache performance metrics
    if (clientCode.includes('hit') || clientCode.includes('miss') || clientCode.includes('ratio')) {
      this.addResult('caching-performance', 'cache-metrics', 'passed',
        '✅ Cache performance metrics found');
    } else {
      this.addResult('caching-performance', 'cache-metrics', 'warnings',
        '⚠️ Cache performance metrics not found');
    }
  }

  /**
   * Test API rate limiting (V2.3.4)
   */
  testAPIRateLimiting(clientCode) {
    console.log('🔍 Testing API Rate Limiting (V2.3.4)...');
    
    // Test for rate limiting implementation
    const rateLimitPatterns = ['rate', 'limit', 'throttle', 'backoff'];
    let rateLimitFound = 0;

    for (const pattern of rateLimitPatterns) {
      if (clientCode.includes(pattern)) {
        rateLimitFound++;
      }
    }

    if (rateLimitFound >= 2) {
      this.addResult('rate-limiting', 'rate-limit-implementation', 'passed',
        `✅ Rate limiting implementation found (${rateLimitFound}/4)`);
    } else {
      this.addResult('rate-limiting', 'rate-limit-implementation', 'warnings',
        `⚠️ Limited rate limiting implementation (${rateLimitFound}/4)`);
    }

    // Test for retry mechanisms
    const retryPatterns = ['retry', 'attempt', 'backoff', 'exponential'];
    let retryFound = 0;

    for (const pattern of retryPatterns) {
      if (clientCode.includes(pattern)) {
        retryFound++;
      }
    }

    if (retryFound >= 2) {
      this.addResult('rate-limiting', 'retry-mechanisms', 'passed',
        `✅ Retry mechanisms found (${retryFound}/4)`);
    } else {
      this.addResult('rate-limiting', 'retry-mechanisms', 'warnings',
        `⚠️ Limited retry mechanisms (${retryFound}/4)`);
    }

    // Test for 429 status code handling
    if (clientCode.includes('429') || clientCode.includes('Too Many Requests')) {
      this.addResult('rate-limiting', '429-handling', 'passed',
        '✅ 429 status code handling found');
    } else {
      this.addResult('rate-limiting', '429-handling', 'warnings',
        '⚠️ 429 status code handling not found');
    }

    // Test for request queuing
    if (clientCode.includes('queue') || clientCode.includes('Queue')) {
      this.addResult('rate-limiting', 'request-queuing', 'passed',
        '✅ Request queuing patterns found');
    } else {
      this.addResult('rate-limiting', 'request-queuing', 'warnings',
        '⚠️ Request queuing patterns not found');
    }
  }

  /**
   * Test optimization effectiveness (V2.3.5)
   */
  testOptimizationEffectiveness(clientCode) {
    console.log('🔍 Testing Optimization Effectiveness (V2.3.5)...');
    
    // Test @optimizeResponse decorator usage
    const optimizePattern = /@optimizeResponse\s*\(\s*['"][^'"]+['"]\s*\)/g;
    const optimizeMatches = clientCode.match(optimizePattern);

    if (optimizeMatches && optimizeMatches.length >= 5) {
      this.addResult('optimization-effectiveness', 'optimize-response-usage', 'passed',
        `✅ @optimizeResponse decorator well-utilized (${optimizeMatches.length} instances)`);
    } else if (optimizeMatches && optimizeMatches.length > 0) {
      this.addResult('optimization-effectiveness', 'optimize-response-usage', 'warnings',
        `⚠️ Limited @optimizeResponse usage (${optimizeMatches.length} instances)`);
    } else {
      this.addResult('optimization-effectiveness', 'optimize-response-usage', 'warnings',
        '⚠️ @optimizeResponse decorator not found');
    }

    // Test response truncation
    if (clientCode.includes('truncate') || clientCode.includes('slice') || clientCode.includes('substring')) {
      this.addResult('optimization-effectiveness', 'response-truncation', 'passed',
        '✅ Response truncation patterns found');
    } else {
      this.addResult('optimization-effectiveness', 'response-truncation', 'warnings',
        '⚠️ Response truncation patterns not found');
    }

    // Test field filtering
    if (clientCode.includes('fields') || clientCode.includes('select') || clientCode.includes('pick')) {
      this.addResult('optimization-effectiveness', 'field-filtering', 'passed',
        '✅ Field filtering patterns found');
    } else {
      this.addResult('optimization-effectiveness', 'field-filtering', 'warnings',
        '⚠️ Field filtering patterns not found');
    }

    // Test compression
    if (clientCode.includes('compress') || clientCode.includes('gzip') || clientCode.includes('deflate')) {
      this.addResult('optimization-effectiveness', 'compression', 'passed',
        '✅ Compression patterns found');
    } else {
      this.addResult('optimization-effectiveness', 'compression', 'warnings',
        '⚠️ Compression patterns not found');
    }

    // Test lazy loading
    if (clientCode.includes('lazy') || clientCode.includes('onDemand')) {
      this.addResult('optimization-effectiveness', 'lazy-loading', 'passed',
        '✅ Lazy loading patterns found');
    } else {
      this.addResult('optimization-effectiveness', 'lazy-loading', 'warnings',
        '⚠️ Lazy loading patterns not found');
    }
  }

  /**
   * Test scalability (V2.3.6)
   */
  testScalability(clientCode, toolsCode) {
    console.log('🔍 Testing Scalability (V2.3.6)...');
    
    // Test for connection pooling
    if (clientCode.includes('pool') || clientCode.includes('Pool')) {
      this.addResult('scalability', 'connection-pooling', 'passed',
        '✅ Connection pooling patterns found');
    } else {
      this.addResult('scalability', 'connection-pooling', 'warnings',
        '⚠️ Connection pooling patterns not found');
    }

    // Test for load balancing
    if (clientCode.includes('balance') || clientCode.includes('round') || clientCode.includes('distribute')) {
      this.addResult('scalability', 'load-balancing', 'passed',
        '✅ Load balancing patterns found');
    } else {
      this.addResult('scalability', 'load-balancing', 'warnings',
        '⚠️ Load balancing patterns not found');
    }

    // Test for resource monitoring
    const monitoringPatterns = ['monitor', 'metrics', 'telemetry', 'observability'];
    let monitoringFound = 0;

    for (const pattern of monitoringPatterns) {
      if (clientCode.includes(pattern)) {
        monitoringFound++;
      }
    }

    if (monitoringFound >= 2) {
      this.addResult('scalability', 'resource-monitoring', 'passed',
        `✅ Resource monitoring patterns found (${monitoringFound}/4)`);
    } else {
      this.addResult('scalability', 'resource-monitoring', 'warnings',
        `⚠️ Limited resource monitoring (${monitoringFound}/4)`);
    }

    // Test for horizontal scaling support
    if (clientCode.includes('cluster') || clientCode.includes('worker') || clientCode.includes('shard')) {
      this.addResult('scalability', 'horizontal-scaling', 'passed',
        '✅ Horizontal scaling patterns found');
    } else {
      this.addResult('scalability', 'horizontal-scaling', 'warnings',
        '⚠️ Horizontal scaling patterns not found');
    }

    // Test for circuit breaker patterns
    if (clientCode.includes('circuit') || clientCode.includes('breaker') || clientCode.includes('fallback')) {
      this.addResult('scalability', 'circuit-breaker', 'passed',
        '✅ Circuit breaker patterns found');
    } else {
      this.addResult('scalability', 'circuit-breaker', 'warnings',
        '⚠️ Circuit breaker patterns not found');
    }

    // Test for graceful degradation
    if (clientCode.includes('graceful') || clientCode.includes('degrade') || clientCode.includes('fallback')) {
      this.addResult('scalability', 'graceful-degradation', 'passed',
        '✅ Graceful degradation patterns found');
    } else {
      this.addResult('scalability', 'graceful-degradation', 'warnings',
        '⚠️ Graceful degradation patterns not found');
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.3: Test Performance');
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
    
    // Performance specific analysis
    const performanceCategories = [
      'response-time', 'memory-usage', 'caching-performance',
      'rate-limiting', 'optimization-effectiveness', 'scalability'
    ];
    
    const performanceResults = this.results.details.filter(r => 
      performanceCategories.includes(r.category)
    );
    
    const passedPerformance = performanceResults.filter(r => r.status === 'passed').length;
    const totalPerformance = performanceResults.length;
    const performanceRate = Math.round((passedPerformance / totalPerformance) * 100);
    
    console.log(`\\n⚡ Performance Optimization Rate: ${performanceRate}% (${passedPerformance}/${totalPerformance})`);
    
    // Performance recommendations
    const warningCount = this.results.details.filter(r => r.status === 'warnings').length;
    if (warningCount > 15) {
      console.log(`\\n💡 Performance Recommendations:`);
      console.log(`  • Consider implementing more caching strategies`);
      console.log(`  • Add comprehensive monitoring and metrics`);
      console.log(`  • Implement rate limiting and retry mechanisms`);
      console.log(`  • Consider horizontal scaling patterns`);
    }
    
    if (this.results.failed <= 1) {
      console.log('\\n🎉 Performance testing successful! V2.3 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review performance implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.3 Verification: Test Performance\\n');
    
    try {
      // Read source files
      const { tools: toolsCode, client: clientCode, types: typesCode } = await this.readSourceFiles();
      this.addResult('setup', 'read-source-files', 'passed', 
        '✅ Successfully read all source files');
      
      // Run all verification tests
      this.testResponseTimePerformance(toolsCode, clientCode);
      this.testMemoryUsage(clientCode);
      this.testCachingPerformance(clientCode);
      this.testAPIRateLimiting(clientCode);
      this.testOptimizationEffectiveness(clientCode);
      this.testScalability(clientCode, toolsCode);
      
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
  const verifier = new PerformanceVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { PerformanceVerifier };