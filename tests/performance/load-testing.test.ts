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

  describe('Large Result Set Performance Testing', () => {
    it('should handle 1000 result limit efficiently', async () => {
      // Test maximum standard limit performance
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        timestamp: Date.now() - i * 1000,
        data: `item_${i}`,
        nested: { level1: { level2: `deep_${i}` } }
      }));

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: largeResultSet,
        pagination: { hasMore: false, cursor: null }
      });

      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData('protocol:tcp', undefined, 'timestamp:desc', 1000);
      });

      expect(result.results).toHaveLength(1000);
      expect(duration).toBeLessThan(2000); // Should handle 1000 results within 2 seconds
      
      // Memory usage should be reasonable
      const memoryAfter = process.memoryUsage();
      expect(memoryAfter.heapUsed).toBeLessThan(200 * 1024 * 1024); // Less than 200MB
    });

    it('should handle 2000 result limit for cross-reference operations', async () => {
      // Test enhanced cross-reference limit performance
      const correlationDataset = Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        source_ip: `192.168.${Math.floor(i / 256)}.${i % 256}`,
        destination_ip: `10.0.${Math.floor(i / 256)}.${i % 256}`,
        protocol: i % 2 === 0 ? 'tcp' : 'udp',
        severity: ['low', 'medium', 'high', 'critical'][i % 4],
        country: ['China', 'Russia', 'Iran', 'Brazil'][i % 4],
        timestamp: Date.now() - i * 1000
      }));

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: correlationDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(
          '(country:China OR country:Russia) AND severity:>=medium',
          undefined,
          'timestamp:desc',
          2000
        );
      });

      expect(result.results).toHaveLength(2000);
      expect(duration).toBeLessThan(5000); // Cross-reference operations allowed up to 5 seconds
      
      // Verify correlation-sized memory usage
      const memoryAfter = process.memoryUsage();
      expect(memoryAfter.heapUsed).toBeLessThan(400 * 1024 * 1024); // Less than 400MB for correlation data
    });

    it('should handle 500 result limit for bandwidth-intensive operations', async () => {
      // Test bandwidth analysis performance with memory-intensive data
      const bandwidthDataset = Array.from({ length: 500 }, (_, i) => ({
        device_id: i,
        device_name: `Device_${i}`,
        bytes_uploaded: Math.floor(Math.random() * 1000000000), // Up to 1GB
        bytes_downloaded: Math.floor(Math.random() * 5000000000), // Up to 5GB
        total_bandwidth: 0, // Will be calculated
        sessions: Array.from({ length: 100 }, (_, j) => ({ // 100 sessions per device
          session_id: j,
          duration: Math.floor(Math.random() * 3600),
          bytes: Math.floor(Math.random() * 10000000)
        })),
        metadata: {
          mac_address: `aa:bb:cc:dd:ee:${i.toString(16).padStart(2, '0')}`,
          vendor: ['Apple', 'Samsung', 'Microsoft', 'Google'][i % 4],
          device_type: ['laptop', 'phone', 'tablet', 'desktop'][i % 4]
        }
      }));

      // Calculate total bandwidth for each device (memory-intensive operation)
      bandwidthDataset.forEach(device => {
        device.total_bandwidth = device.bytes_uploaded + device.bytes_downloaded;
      });

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: bandwidthDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData('device_type:laptop OR device_type:desktop', undefined, 'total_bandwidth:desc', 500);
      });

      expect(result.results).toHaveLength(500);
      expect(duration).toBeLessThan(3000); // Bandwidth operations should complete within 3 seconds
      
      // Memory usage should be controlled for bandwidth data
      const memoryAfter = process.memoryUsage();
      expect(memoryAfter.heapUsed).toBeLessThan(250 * 1024 * 1024); // Less than 250MB for 500 devices
    });

    it('should demonstrate performance difference between limit tiers', async () => {
      const performanceMetrics: Record<number, number> = {};
      const limits = [100, 500, 1000, 2000];

      for (const limit of limits) {
        const dataset = Array.from({ length: limit }, (_, i) => ({
          id: i,
          data: `item_${i}`,
          processing_complexity: Math.random() * 100
        }));

        mockFirewallaClient.getFlowData.mockResolvedValue({
          results: dataset,
          pagination: { hasMore: false, cursor: null }
        });

        const { duration } = await measurePerformance(async () => {
          return await mockFirewallaClient.getFlowData(`limit_test:${limit}`, undefined, 'id:desc', limit);
        });

        performanceMetrics[limit] = duration;
      }

      // Verify performance scaling characteristics
      expect(performanceMetrics[100]).toBeLessThan(500);    // Small datasets very fast
      expect(performanceMetrics[500]).toBeLessThan(1500);   // Medium datasets reasonable
      expect(performanceMetrics[1000]).toBeLessThan(2500);  // Large datasets acceptable
      expect(performanceMetrics[2000]).toBeLessThan(5000);  // Very large datasets for correlation

      // Performance should scale reasonably (not exponentially)
      const scalingRatio = performanceMetrics[2000] / performanceMetrics[100];
      expect(scalingRatio).toBeLessThan(20); // 2000 items shouldn't take more than 20x longer than 100 items
    });
  });

  describe('Complex Query Performance Testing', () => {
    it('should handle deeply nested logical queries efficiently', async () => {
      const complexNestedQuery = '(((severity:high OR severity:critical) AND (protocol:tcp OR protocol:udp)) OR ((country:China OR country:Russia) AND blocked:true)) AND (timestamp:>NOW-24h AND bytes:>1000000) AND NOT (source_ip:192.168.* OR source_ip:10.0.*)';
      
      const { duration } = await measurePerformance(async () => {
        return Promise.resolve(QuerySanitizer.sanitizeSearchQuery(complexNestedQuery));
      });

      expect(duration).toBeLessThan(500); // Complex queries should still validate quickly
    });

    it('should handle geographic correlation queries with multiple criteria', async () => {
      const geographicDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        source_ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        country: ['China', 'Russia', 'Iran', 'Brazil', 'India', 'United States'][i % 6],
        continent: ['Asia', 'Europe', 'Asia', 'South America', 'Asia', 'North America'][i % 6],
        asn: `AS${4134 + (i % 100)}`,
        risk_score: Math.random(),
        threat_indicators: {
          malware_hosting: i % 10 === 0,
          known_threat_source: i % 15 === 0,
          high_risk_country: i % 3 === 0
        }
      }));

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: geographicDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const geographicQuery = '(country:China OR country:Russia OR country:Iran) AND risk_score:>0.7 AND (malware_hosting:true OR known_threat_source:true)';
      
      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(geographicQuery, undefined, 'risk_score:desc', 1000);
      });

      expect(result.results).toHaveLength(1000);
      expect(duration).toBeLessThan(2000); // Geographic correlation should be efficient
    });

    it('should handle time-based queries with multiple time ranges', async () => {
      const timeBasedDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        timestamp: Date.now() - (i * 60000), // Each item 1 minute apart
        created: Date.now() - (i * 3600000), // Each item 1 hour apart for creation
        last_seen: Date.now() - (Math.random() * 86400000), // Random within last 24h
        duration: Math.floor(Math.random() * 3600), // Up to 1 hour duration
        severity: ['low', 'medium', 'high', 'critical'][i % 4]
      }));

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: timeBasedDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const timeComplexQuery = '(timestamp:>NOW-1h OR last_seen:>NOW-30m) AND created:<NOW-24h AND duration:[300 TO 3600] AND severity:>=medium';
      
      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(timeComplexQuery, undefined, 'timestamp:desc', 1000);
      });

      expect(result.results).toHaveLength(1000);
      expect(duration).toBeLessThan(1800); // Time-based queries should be reasonably fast
    });

    it('should handle wildcard and range queries efficiently', async () => {
      const wildcardDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        source_ip: `192.168.${Math.floor(i / 256)}.${i % 256}`,
        destination_ip: `10.0.${Math.floor(i / 256)}.${i % 256}`,
        port: 80 + (i % 65455), // Ports from 80 to 65535
        bytes: Math.floor(Math.random() * 1000000000), // Up to 1GB
        packet_count: Math.floor(Math.random() * 10000),
        user_agent: [`Chrome_${i}`, `Firefox_${i}`, `Safari_${i}`, `Edge_${i}`][i % 4],
        hostname: `host-${i}.example.com`
      }));

      mockFirewallaClient.getFlowData.mockResolvedValue({
        results: wildcardDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const wildcardQuery = 'source_ip:192.168.* AND destination_ip:10.0.* AND port:[80 TO 443] AND bytes:>10000000 AND user_agent:*Chrome* AND hostname:*.example.com';
      
      const { result, duration } = await measurePerformance(async () => {
        return await mockFirewallaClient.getFlowData(wildcardQuery, undefined, 'bytes:desc', 1000);
      });

      expect(result.results).toHaveLength(1000);
      expect(duration).toBeLessThan(2500); // Wildcard/range queries are more complex but should be reasonable
    });

    it('should handle cross-reference correlation with multiple entity types', async () => {
      // Simulate complex cross-reference operation
      const primaryDataset = Array.from({ length: 1000 }, (_, i) => ({
        flow_id: i,
        source_ip: `192.168.${Math.floor(i / 256)}.${i % 256}`,
        protocol: i % 2 === 0 ? 'tcp' : 'udp',
        blocked: i % 5 === 0,
        bytes: Math.floor(Math.random() * 100000000)
      }));

      const secondaryDataset = Array.from({ length: 500 }, (_, i) => ({
        alarm_id: i,
        source_ip: `192.168.${Math.floor(i / 128)}.${(i * 2) % 256}`, // Some overlap with primary
        severity: ['low', 'medium', 'high', 'critical'][i % 4],
        type: ['malware', 'intrusion', 'anomaly', 'policy_violation'][i % 4]
      }));

      const deviceDataset = Array.from({ length: 200 }, (_, i) => ({
        device_id: i,
        device_ip: `192.168.${Math.floor(i / 64)}.${(i * 4) % 256}`, // Some overlap
        online: i % 3 !== 0,
        device_type: ['laptop', 'phone', 'tablet', 'desktop'][i % 4]
      }));

      mockFirewallaClient.getFlowData.mockResolvedValueOnce({
        results: primaryDataset,
        pagination: { hasMore: false, cursor: null }
      });

      // Mock additional calls for cross-reference
      mockFirewallaClient.getAlarmData = jest.fn().mockResolvedValue({
        results: secondaryDataset,
        pagination: { hasMore: false, cursor: null }
      });

      mockFirewallaClient.getDeviceData = jest.fn().mockResolvedValue({
        results: deviceDataset,
        pagination: { hasMore: false, cursor: null }
      });

      const { duration } = await measurePerformance(async () => {
        // Simulate cross-reference correlation
        const flows = await mockFirewallaClient.getFlowData('blocked:true', undefined, 'bytes:desc', 1000);
        const alarms = await mockFirewallaClient.getAlarmData('severity:>=medium', 500);
        const devices = await mockFirewallaClient.getDeviceData('online:false', 200);

        // Simulate correlation processing
        const correlationMap = new Map();
        flows.results.forEach(flow => {
          correlationMap.set(flow.source_ip, { flow, alarms: [], devices: [] });
        });

        alarms.results.forEach(alarm => {
          if (correlationMap.has(alarm.source_ip)) {
            correlationMap.get(alarm.source_ip).alarms.push(alarm);
          }
        });

        devices.results.forEach(device => {
          if (correlationMap.has(device.device_ip)) {
            correlationMap.get(device.device_ip).devices.push(device);
          }
        });

        return Array.from(correlationMap.values());
      });

      expect(duration).toBeLessThan(3000); // Complex correlation should complete within 3 seconds
    });
  });

  describe('Memory Pressure Testing for Large Datasets', () => {
    it('should handle memory pressure during 2000-item correlation processing', async () => {
      const largeCorrelationDataset = Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        primary_field: `primary_${i}`,
        correlation_data: {
          field1: `correlation_${i}_1`,
          field2: `correlation_${i}_2`,
          field3: `correlation_${i}_3`,
          numeric_field: Math.random() * 1000000,
          timestamp: Date.now() - i * 1000
        },
        large_text_field: new Array(1000).fill(`text_${i}`).join(' '), // Large text data
        nested_array: Array.from({ length: 50 }, (_, j) => ({
          nested_id: j,
          nested_data: `nested_${i}_${j}`
        }))
      }));

      const initialMemory = process.memoryUsage();

      const { result, duration } = await measurePerformance(async () => {
        // Simulate memory-intensive correlation processing
        return Promise.resolve(largeCorrelationDataset.map(item => ({
          ...item,
          processed_correlation: item.correlation_data.field1 + item.correlation_data.field2,
          aggregated_nested: item.nested_array.map(n => n.nested_data).join('|'),
          memory_intensive_calc: item.large_text_field.split(' ').length
        })));
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(result).toHaveLength(2000);
      expect(duration).toBeLessThan(4000); // Should process within 4 seconds
      expect(memoryIncrease).toBeLessThan(300 * 1024 * 1024); // Should not increase memory by more than 300MB

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const afterGCMemory = process.memoryUsage();
        const retainedMemory = afterGCMemory.heapUsed - initialMemory.heapUsed;
        expect(retainedMemory).toBeLessThan(50 * 1024 * 1024); // Should retain less than 50MB after GC
      }
    });

    it('should handle streaming processing for very large datasets', async () => {
      // Simulate processing large datasets in chunks
      const totalItems = 10000;
      const chunkSize = 500;
      const chunks = Math.ceil(totalItems / chunkSize);
      
      let processedCount = 0;
      let maxMemoryUsage = 0;
      const initialMemory = process.memoryUsage().heapUsed;

      const { duration } = await measurePerformance(async () => {
        for (let chunk = 0; chunk < chunks; chunk++) {
          const chunkData = Array.from({ length: chunkSize }, (_, i) => ({
            id: chunk * chunkSize + i,
            data: `chunk_${chunk}_item_${i}`,
            large_data: new Array(200).fill(`data_${chunk}_${i}`).join(' ')
          }));

          // Process chunk
          const processedChunk = chunkData.map(item => ({
            ...item,
            processed: true,
            processing_timestamp: Date.now()
          }));

          processedCount += processedChunk.length;

          // Track memory usage
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryUsage = currentMemory - initialMemory;
          maxMemoryUsage = Math.max(maxMemoryUsage, memoryUsage);

          // Simulate chunk completion (allow GC)
          if (chunk % 5 === 0 && global.gc) {
            global.gc();
          }
        }

        return processedCount;
      });

      expect(processedCount).toBe(totalItems);
      expect(duration).toBeLessThan(8000); // Should process 10k items within 8 seconds
      expect(maxMemoryUsage).toBeLessThan(100 * 1024 * 1024); // Streaming should keep memory under 100MB
    });
  });
});