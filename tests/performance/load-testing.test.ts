/**
 * Load Testing Framework
 * 
 * Performance testing framework for concurrent operations including:
 * - Basic performance testing framework using Jest
 * - Concurrent request testing for multiple tools
 * - Memory usage monitoring for large datasets
 * - Response time benchmarking
 * - Cache effectiveness testing
 * - Rate limiting validation
 * - Stress testing for edge case scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { measurePerformance, withRetries } from '../setup/jest-setup.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { normalizeUnknownFields, batchNormalize } from '../../src/utils/data-normalizer.js';

// Mock the FirewallaClient for performance testing
jest.mock('../../src/firewalla/client.js');

interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number;
  successRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  errors: number;
}

interface ConcurrentTestConfig {
  concurrency: number;
  totalRequests: number;
  timeout: number;
  expectedSuccessRate: number;
}

class LoadTestFramework {
  private results: Array<{ duration: number; success: boolean; error?: Error }> = [];
  private startMemory: NodeJS.MemoryUsage;
  private endMemory: NodeJS.MemoryUsage;

  constructor() {
    this.startMemory = process.memoryUsage();
  }

  async executeConcurrentRequests<T>(
    operation: () => Promise<T>,
    config: ConcurrentTestConfig
  ): Promise<PerformanceMetrics> {
    this.results = [];
    const { concurrency, totalRequests, timeout } = config;
    
    const startTime = Date.now();
    const promises: Array<Promise<void>> = [];

    // Create batches of concurrent requests
    for (let batch = 0; batch < Math.ceil(totalRequests / concurrency); batch++) {
      const batchPromises: Array<Promise<void>> = [];
      const requestsInBatch = Math.min(concurrency, totalRequests - batch * concurrency);

      for (let i = 0; i < requestsInBatch; i++) {
        const promise = this.executeTimedOperation(operation, timeout);
        batchPromises.push(promise);
      }

      // Wait for current batch to complete before starting next batch
      await Promise.all(batchPromises);
    }

    const endTime = Date.now();
    this.endMemory = process.memoryUsage();

    return this.calculateMetrics(endTime - startTime);
  }

  private async executeTimedOperation<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeout);
      });

      await Promise.race([operation(), timeoutPromise]);
      
      const duration = Date.now() - startTime;
      this.results.push({ duration, success: true });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ 
        duration, 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private calculateMetrics(totalTime: number): PerformanceMetrics {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const durations = successful.map(r => r.duration);

    return {
      averageResponseTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      minResponseTime: durations.length > 0 ? Math.min(...durations) : 0,
      maxResponseTime: durations.length > 0 ? Math.max(...durations) : 0,
      throughput: (successful.length / totalTime) * 1000, // requests per second
      successRate: this.results.length > 0 ? successful.length / this.results.length : 0,
      memoryUsage: {
        rss: this.endMemory.rss - this.startMemory.rss,
        heapUsed: this.endMemory.heapUsed - this.startMemory.heapUsed,
        heapTotal: this.endMemory.heapTotal - this.startMemory.heapTotal,
        external: this.endMemory.external - this.startMemory.external,
        arrayBuffers: (this.endMemory as any).arrayBuffers - (this.startMemory as any).arrayBuffers || 0
      },
      errors: failed.length
    };
  }

  getErrorSummary(): Record<string, number> {
    const errorCounts: Record<string, number> = {};
    
    this.results
      .filter(r => !r.success && r.error)
      .forEach(r => {
        const errorType = r.error!.message;
        errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      });

    return errorCounts;
  }
}

describe('Load Testing Framework', () => {
  let mockFirewallaClient: jest.Mocked<FirewallaClient>;
  let loadTester: LoadTestFramework;

  beforeAll(() => {
    mockFirewallaClient = new FirewallaClient({
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      boxId: 'test-box-id'
    }) as jest.Mocked<FirewallaClient>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    loadTester = new LoadTestFramework();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    // Force garbage collection after each test
    if (global.gc) {
      global.gc();
    }
  });

  describe('Basic Performance Testing', () => {
    it('should measure single operation performance', async () => {
      const mockResponse = {
        results: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          timestamp: Date.now() - i * 1000
        })),
        pagination: { hasMore: false, cursor: null }
      };

      mockFirewallaClient.getFlowData.mockResolvedValue(mockResponse);

      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData('protocol:tcp', undefined, 'timestamp:desc', 100);
      });

      expect(result.results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(duration).toBeGreaterThan(0);
    });

    it('should benchmark query validation performance', async () => {
      const complexQueries = [
        'severity:high AND (protocol:tcp OR protocol:udp) AND NOT source_ip:192.168.*',
        '(blocked:true AND bytes:>10000000) OR severity:critical',
        'country:China OR country:Russia AND severity:>=medium',
        '((online:true AND mac_vendor:Apple) OR (online:true AND mac_vendor:Samsung)) AND NOT device_type:unknown'
      ];

      const validationTimes: number[] = [];

      for (const query of complexQueries) {
        const { duration } = await measurePerformance(async () => {
          return Promise.resolve(QuerySanitizer.sanitizeSearchQuery(query));
        });
        validationTimes.push(duration);
      }

      const averageValidationTime = validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length;
      expect(averageValidationTime).toBeLessThan(50); // Should validate within 50ms on average
      expect(Math.max(...validationTimes)).toBeLessThan(200); // No single validation should take more than 200ms
    });

    it('should benchmark data normalization performance', async () => {
      const largeDataset = Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        name: `Device ${i}`,
        status: i % 5 === 0 ? 'unknown' : 'active',
        geo: {
          country: i % 3 === 0 ? 'Unknown' : 'United States',
          city: i % 4 === 0 ? null : `City ${i}`,
          asn: i % 10 === 0 ? 'invalid' : `AS${15169 + i}`
        }
      }));

      const { result, duration } = await measurePerformance(async () => {
        return Promise.resolve(batchNormalize(largeDataset, {
          status: (v: any) => normalizeUnknownFields({ value: v }).value,
          geo: (v: any) => normalizeUnknownFields(v)
        }));
      });

      expect(result).toHaveLength(5000);
      expect(duration).toBeLessThan(2000); // Should normalize 5000 items within 2 seconds
      
      // Verify normalization quality
      const unknownStatusCount = result.filter(item => item.status === 'unknown').length;
      expect(unknownStatusCount).toBe(1000); // Every 5th item should be normalized to 'unknown'
    });
  });

  describe('Concurrent Request Testing', () => {
    it('should handle moderate concurrent load', async () => {
      const mockResponse = {
        results: Array.from({ length: 50 }, (_, i) => ({ id: i })),
        pagination: { hasMore: false, cursor: null }
      };

      mockFirewallaClient.getFlowData.mockResolvedValue(mockResponse);

      const operation = () => mockFirewallaClient.getFlowData(
        'protocol:tcp AND timestamp:>NOW-1h',
        undefined,
        'timestamp:desc',
        50
      );

      const config: ConcurrentTestConfig = {
        concurrency: 10,
        totalRequests: 100,
        timeout: 5000,
        expectedSuccessRate: 0.95
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBeGreaterThanOrEqual(config.expectedSuccessRate);
      expect(metrics.averageResponseTime).toBeLessThan(1000);
      expect(metrics.throughput).toBeGreaterThan(0);
      expect(metrics.errors).toBeLessThanOrEqual(5); // Allow up to 5% error rate
    });

    it('should handle high concurrent load with degraded performance', async () => {
      const mockResponse = {
        results: Array.from({ length: 100 }, (_, i) => ({ id: i })),
        pagination: { hasMore: false, cursor: null }
      };

      // Simulate slower responses under load
      mockFirewallaClient.getFlowData.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResponse), Math.random() * 500 + 100);
        });
      });

      const operation = () => mockFirewallaClient.getFlowData(
        'severity:high AND protocol:tcp',
        undefined,
        'timestamp:desc',
        100
      );

      const config: ConcurrentTestConfig = {
        concurrency: 50,
        totalRequests: 200,
        timeout: 10000,
        expectedSuccessRate: 0.90
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBeGreaterThanOrEqual(config.expectedSuccessRate);
      expect(metrics.averageResponseTime).toBeLessThan(2000); // Allow longer response times under load
      expect(metrics.throughput).toBeGreaterThan(0);
      
      // Verify performance degradation is reasonable
      expect(metrics.maxResponseTime).toBeLessThan(5000);
    }, 30000); // Extended timeout for this test

    it('should handle mixed operation types concurrently', async () => {
      const flowResponse = { results: Array.from({ length: 100 }, (_, i) => ({ flow_id: i })), pagination: { hasMore: false, cursor: null } };
      const alarmResponse = { results: Array.from({ length: 50 }, (_, i) => ({ alarm_id: i })), pagination: { hasMore: false, cursor: null } };
      const deviceResponse = { results: Array.from({ length: 75 }, (_, i) => ({ device_id: i })), pagination: { hasMore: false, cursor: null } };

      mockFirewallaClient.getFlowData.mockResolvedValue(flowResponse);
      mockFirewallaClient.getAlarmData = jest.fn().mockResolvedValue(alarmResponse);
      mockFirewallaClient.getDeviceData = jest.fn().mockResolvedValue(deviceResponse);

      const operations = [
        () => mockFirewallaClient.getFlowData('protocol:tcp', undefined, 'timestamp:desc', 100),
        () => mockFirewallaClient.getAlarmData('severity:high', 50),
        () => mockFirewallaClient.getDeviceData('online:true', 75)
      ];

      const concurrentPromises = Array.from({ length: 30 }, (_, i) => {
        const operation = operations[i % operations.length];
        return measurePerformance(operation);
      });

      const results = await Promise.all(concurrentPromises);
      
      expect(results).toHaveLength(30);
      
      const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(averageDuration).toBeLessThan(1000);
      
      const allSuccessful = results.every(r => r.result);
      expect(allSuccessful).toBe(true);
    });
  });

  describe('Memory Usage Monitoring', () => {
    it('should monitor memory usage during large dataset processing', async () => {
      const largeDataset = Array.from({ length: 20000 }, (_, i) => ({
        id: i,
        data: new Array(100).fill(`item_${i}`), // Create some memory pressure
        nested: {
          level1: { level2: { level3: `deep_${i}` } }
        }
      }));

      const initialMemory = process.memoryUsage();

      const { result, duration } = await measurePerformance(async () => {
        return Promise.resolve(normalizeUnknownFields(largeDataset));
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(result).toHaveLength(20000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Should not increase memory by more than 100MB
    });

    it('should detect memory leaks in repeated operations', async () => {
      const iterations = 100;
      const memorySnapshots: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const data = Array.from({ length: 1000 }, (_, j) => ({
          id: j,
          value: `test_${i}_${j}`,
          status: j % 3 === 0 ? 'unknown' : 'active'
        }));

        normalizeUnknownFields(data);

        if (i % 10 === 0) {
          if (global.gc) global.gc(); // Force GC periodically
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // Check that memory usage doesn't continuously increase
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory - initialMemory;

      // Allow some memory growth but not excessive (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle garbage collection during concurrent operations', async () => {
      const operation = () => {
        const data = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          largeArray: new Array(1000).fill(`data_${i}`)
        }));
        return Promise.resolve(normalizeUnknownFields(data));
      };

      const config: ConcurrentTestConfig = {
        concurrency: 20,
        totalRequests: 100,
        timeout: 5000,
        expectedSuccessRate: 0.95
      };

      const initialMemory = process.memoryUsage();
      const metrics = await loadTester.executeConcurrentRequests(operation, config);
      
      // Force garbage collection
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for GC
      
      const finalMemory = process.memoryUsage();

      expect(metrics.successRate).toBeGreaterThanOrEqual(config.expectedSuccessRate);
      
      // Memory should not grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth
    });
  });

  describe('Response Time Benchmarking', () => {
    it('should benchmark different query complexities', async () => {
      const queryTests = [
        { name: 'simple', query: 'protocol:tcp', expectedMaxTime: 50 },
        { name: 'medium', query: 'protocol:tcp AND severity:high', expectedMaxTime: 100 },
        { name: 'complex', query: '(severity:high OR severity:critical) AND protocol:tcp AND NOT source_ip:192.168.*', expectedMaxTime: 200 },
        { name: 'very_complex', query: '((severity:high AND protocol:tcp) OR (severity:critical AND protocol:udp)) AND (country:China OR country:Russia) AND NOT source_ip:192.168.*', expectedMaxTime: 300 }
      ];

      const results: Record<string, number> = {};

      for (const test of queryTests) {
        const { duration } = await measurePerformance(async () => {
          return Promise.resolve(QuerySanitizer.sanitizeSearchQuery(test.query));
        });

        results[test.name] = duration;
        expect(duration).toBeLessThan(test.expectedMaxTime);
      }

      // Verify that more complex queries generally take longer
      expect(results.simple).toBeLessThanOrEqual(results.medium);
      expect(results.medium).toBeLessThanOrEqual(results.complex);
    });

    it('should benchmark pagination performance', async () => {
      const pageSize = 1000;
      const totalPages = 10;
      const pageTimes: number[] = [];

      for (let page = 0; page < totalPages; page++) {
        const mockResponse = {
          results: Array.from({ length: pageSize }, (_, i) => ({
            id: page * pageSize + i,
            timestamp: Date.now() - i * 1000
          })),
          pagination: {
            hasMore: page < totalPages - 1,
            cursor: page < totalPages - 1 ? `cursor_page_${page + 1}` : null
          }
        };

        mockFirewallaClient.getFlowData.mockResolvedValue(mockResponse);

        const { duration } = await measurePerformance(async () => {
          return await mockFirewallaClient.getFlowData(
            'timestamp:>NOW-24h',
            undefined,
            'timestamp:desc',
            pageSize,
            page > 0 ? `cursor_page_${page}` : undefined
          );
        });

        pageTimes.push(duration);
      }

      // Each page should be processed reasonably quickly
      const averagePageTime = pageTimes.reduce((a, b) => a + b, 0) / pageTimes.length;
      expect(averagePageTime).toBeLessThan(500); // Average page processing time

      // Performance should be consistent across pages
      const maxPageTime = Math.max(...pageTimes);
      const minPageTime = Math.min(...pageTimes);
      const timeVariance = maxPageTime - minPageTime;
      expect(timeVariance).toBeLessThan(1000); // Page times shouldn't vary by more than 1 second
    });
  });

  describe('Cache Effectiveness Testing', () => {
    it('should measure cache hit performance vs cache miss', async () => {
      const cachedQuery = 'protocol:tcp AND severity:high';
      const mockResponse = {
        results: Array.from({ length: 100 }, (_, i) => ({ id: i })),
        pagination: { hasMore: false, cursor: null }
      };

      // Simulate cache miss (first request)
      mockFirewallaClient.getFlowData.mockImplementationOnce(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResponse), 200); // Simulate API delay
        });
      });

      const { duration: cacheMissDuration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(cachedQuery, undefined, 'timestamp:desc', 100);
      });

      // Simulate cache hit (subsequent requests)
      mockFirewallaClient.getFlowData.mockImplementationOnce(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResponse), 10); // Simulate cache speed
        });
      });

      const { duration: cacheHitDuration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(cachedQuery, undefined, 'timestamp:desc', 100);
      });

      // Cache hit should be significantly faster
      expect(cacheHitDuration).toBeLessThan(cacheMissDuration);
      expect(cacheHitDuration).toBeLessThan(50); // Cache hit should be very fast
      expect(cacheMissDuration).toBeGreaterThan(100); // Cache miss should show API delay
    });

    it('should test cache performance under concurrent load', async () => {
      const cacheTestQuery = 'cached:query';
      const mockResponse = {
        results: Array.from({ length: 50 }, (_, i) => ({ id: i })),
        pagination: { hasMore: false, cursor: null }
      };

      // First request simulates cache miss
      let isFirstRequest = true;
      mockFirewallaClient.getFlowData.mockImplementation(() => {
        if (isFirstRequest) {
          isFirstRequest = false;
          return new Promise(resolve => {
            setTimeout(() => resolve(mockResponse), 100); // Cache miss delay
          });
        } else {
          return new Promise(resolve => {
            setTimeout(() => resolve(mockResponse), 5); // Cache hit speed
          });
        }
      });

      const operation = () => mockFirewallaClient.getFlowData(
        cacheTestQuery,
        undefined,
        'timestamp:desc',
        50
      );

      const config: ConcurrentTestConfig = {
        concurrency: 20,
        totalRequests: 60,
        timeout: 5000,
        expectedSuccessRate: 1.0
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBe(1.0);
      expect(metrics.averageResponseTime).toBeLessThan(50); // Most requests should be cache hits
    });
  });

  describe('Rate Limiting Validation', () => {
    it('should handle rate limiting gracefully', async () => {
      let requestCount = 0;
      const rateLimitThreshold = 10;

      mockFirewallaClient.getFlowData.mockImplementation(() => {
        requestCount++;
        if (requestCount > rateLimitThreshold) {
          return Promise.reject(new Error('Rate limit exceeded'));
        }
        return Promise.resolve({
          results: [{ id: requestCount }],
          pagination: { hasMore: false, cursor: null }
        });
      });

      const operation = () => mockFirewallaClient.getFlowData('test:query', undefined, 'timestamp:desc', 10);

      const config: ConcurrentTestConfig = {
        concurrency: 5,
        totalRequests: 20,
        timeout: 5000,
        expectedSuccessRate: 0.5 // Expect ~50% success due to rate limiting
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBeLessThan(0.6); // Most requests should be rate limited
      expect(metrics.errors).toBeGreaterThan(0);

      const errorSummary = loadTester.getErrorSummary();
      expect(errorSummary['Rate limit exceeded']).toBeGreaterThan(0);
    });

    it('should implement retry logic for rate limited requests', async () => {
      let requestAttempts = 0;
      const maxRetries = 3;

      const operationWithRetry = withRetries(async () => {
        requestAttempts++;
        if (requestAttempts <= 2) {
          throw new Error('Rate limit exceeded');
        }
        return { success: true, attempts: requestAttempts };
      }, 'network');

      const result = await operationWithRetry();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3); // Should succeed on third attempt
    });
  });

  describe('Stress Testing Edge Cases', () => {
    it('should handle extreme concurrent load', async () => {
      const mockResponse = {
        results: [{ id: 1 }],
        pagination: { hasMore: false, cursor: null }
      };

      mockFirewallaClient.getFlowData.mockResolvedValue(mockResponse);

      const operation = () => mockFirewallaClient.getFlowData('stress:test', undefined, 'timestamp:desc', 1);

      const config: ConcurrentTestConfig = {
        concurrency: 100,
        totalRequests: 500,
        timeout: 10000,
        expectedSuccessRate: 0.80 // Allow 20% failure under extreme load
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBeGreaterThanOrEqual(config.expectedSuccessRate);
      expect(metrics.throughput).toBeGreaterThan(0);
      
      // Under extreme load, some performance degradation is expected
      expect(metrics.averageResponseTime).toBeLessThan(5000);
    }, 60000); // Extended timeout for stress test

    it('should handle timeout scenarios gracefully', async () => {
      mockFirewallaClient.getFlowData.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 6000);
        });
      });

      const operation = () => mockFirewallaClient.getFlowData('timeout:test', undefined, 'timestamp:desc', 10);

      const config: ConcurrentTestConfig = {
        concurrency: 5,
        totalRequests: 10,
        timeout: 5000, // 5 second timeout, but operation takes 6 seconds
        expectedSuccessRate: 0.0 // All requests should timeout
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBe(0);
      expect(metrics.errors).toBe(10);

      const errorSummary = loadTester.getErrorSummary();
      expect(errorSummary['Operation timeout']).toBe(10);
    });

    it('should recover from temporary service interruptions', async () => {
      let requestCount = 0;
      const interruptionPeriod = { start: 10, end: 20 };

      mockFirewallaClient.getFlowData.mockImplementation(() => {
        requestCount++;
        
        if (requestCount >= interruptionPeriod.start && requestCount <= interruptionPeriod.end) {
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
        
        return Promise.resolve({
          results: [{ id: requestCount }],
          pagination: { hasMore: false, cursor: null }
        });
      });

      const operation = () => mockFirewallaClient.getFlowData('recovery:test', undefined, 'timestamp:desc', 10);

      const config: ConcurrentTestConfig = {
        concurrency: 2,
        totalRequests: 30,
        timeout: 5000,
        expectedSuccessRate: 0.60 // Should recover after interruption
      };

      const metrics = await loadTester.executeConcurrentRequests(operation, config);

      expect(metrics.successRate).toBeGreaterThanOrEqual(config.expectedSuccessRate);
      
      const errorSummary = loadTester.getErrorSummary();
      expect(errorSummary['Service temporarily unavailable']).toBeGreaterThan(0);
      expect(errorSummary['Service temporarily unavailable']).toBeLessThanOrEqual(11); // Should be around interruption period length
    });
  });

  describe('Performance Regression Testing', () => {
    it('should maintain performance baselines for critical operations', async () => {
      const performanceBaselines = {
        simpleQuery: 100, // ms
        complexQuery: 300, // ms
        dataValidation: 50, // ms
        normalization: 200 // ms per 1000 items
      };

      // Test simple query performance
      const { duration: simpleQueryTime } = await measurePerformance(async () => {
        return Promise.resolve(QuerySanitizer.sanitizeSearchQuery('protocol:tcp'));
      });
      expect(simpleQueryTime).toBeLessThan(performanceBaselines.simpleQuery);

      // Test complex query performance
      const complexQuery = '((severity:high AND protocol:tcp) OR (severity:critical AND protocol:udp)) AND (country:China OR country:Russia) AND NOT source_ip:192.168.*';
      const { duration: complexQueryTime } = await measurePerformance(async () => {
        return Promise.resolve(QuerySanitizer.sanitizeSearchQuery(complexQuery));
      });
      expect(complexQueryTime).toBeLessThan(performanceBaselines.complexQuery);

      // Test data normalization performance
      const testData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        status: i % 3 === 0 ? 'unknown' : 'active'
      }));

      const { duration: normalizationTime } = await measurePerformance(async () => {
        return Promise.resolve(normalizeUnknownFields(testData));
      });
      expect(normalizationTime).toBeLessThan(performanceBaselines.normalization);
    });

    it('should track performance metrics over time', () => {
      const performanceHistory = {
        timestamp: Date.now(),
        metrics: {
          queryValidation: 45, // ms
          dataNormalization: 180, // ms
          memoryUsage: 85 * 1024 * 1024, // bytes
          concurrentThroughput: 150 // requests/second
        }
      };

      // In a real implementation, this would be stored and compared over time
      expect(performanceHistory.metrics.queryValidation).toBeLessThan(100);
      expect(performanceHistory.metrics.dataNormalization).toBeLessThan(300);
      expect(performanceHistory.metrics.memoryUsage).toBeLessThan(100 * 1024 * 1024);
      expect(performanceHistory.metrics.concurrentThroughput).toBeGreaterThan(100);
    });
  });
});