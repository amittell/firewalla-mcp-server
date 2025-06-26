import { FirewallaClient } from '../firewalla/client';
import { SecurityManager } from '../config/security';
import { config } from '../config/config';
import { getCurrentTimestamp } from '../utils/timestamp.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
      details?: Record<string, unknown>;
    };
  };
}

export class HealthCheckManager {
  private startTime: number;
  private security: SecurityManager;

  constructor(
    /* eslint-disable-next-line no-unused-vars */
    private firewalla: FirewallaClient,
    security?: SecurityManager
  ) {
    this.startTime = Date.now();
    this.security = security || new SecurityManager();
  }

  async performHealthCheck(): Promise<HealthStatus> {
    const checks = await this.runAllChecks();
    const overallStatus = this.determineOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: getCurrentTimestamp(),
      version: '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  private async runAllChecks(): Promise<HealthStatus['checks']> {
    const checks: HealthStatus['checks'] = {};

    // Run checks in parallel for better performance
    const checkPromises = [
      this.checkConfig().then(result => ({ key: 'configuration', result })),
      this.checkFirewallaAPI().then(result => ({ key: 'firewalla_api', result })),
      this.checkMemoryUsage().then(result => ({ key: 'memory', result })),
      this.checkCacheHealth().then(result => ({ key: 'cache', result })),
      this.checkSecurity().then(result => ({ key: 'security', result })),
    ];

    const results = await Promise.allSettled(checkPromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        checks[result.value.key] = result.value.result;
      } else {
        const checkNames = ['configuration', 'firewalla_api', 'memory', 'cache', 'security'];
        checks[checkNames[index] || 'unknown'] = {
          status: 'fail',
          message: 'Health check failed to execute',
        };
      }
    });

    return checks;
  }

  private async checkConfig(): Promise<HealthStatus['checks'][string]> {
    const startTime = Date.now();

    try {
      const validation = this.security.validateEnvironmentVars();
      const responseTime = Date.now() - startTime;

      if (!validation.valid) {
        return {
          status: 'fail',
          message: 'Configuration validation failed',
          responseTime,
          details: { errors: validation.errors },
        };
      }

      return {
        status: 'pass',
        message: 'Configuration is valid',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Configuration check failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkFirewallaAPI(): Promise<HealthStatus['checks'][string]> {
    const startTime = Date.now();

    try {
      // Try a lightweight API call to check connectivity
      await this.firewalla.getFirewallSummary();
      const responseTime = Date.now() - startTime;

      if (responseTime > 5000) {
        return {
          status: 'warn',
          message: 'API response time is slow',
          responseTime,
        };
      }

      return {
        status: 'pass',
        message: 'Firewalla API is responsive',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'API connection failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkMemoryUsage(): Promise<HealthStatus['checks'][string]> {
    const startTime = Date.now();

    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

      const responseTime = Date.now() - startTime;

      if (heapUsedMB > 512) {
        return {
          status: 'warn',
          message: 'High memory usage detected',
          responseTime,
          details: {
            heapUsedMB,
            heapTotalMB,
            heapUsagePercent,
          },
        };
      }

      return {
        status: 'pass',
        message: 'Memory usage is normal',
        responseTime,
        details: {
          heapUsedMB,
          heapTotalMB,
          heapUsagePercent,
        },
      };
    } catch {
      return {
        status: 'fail',
        message: 'Memory check failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkCacheHealth(): Promise<HealthStatus['checks'][string]> {
    const startTime = Date.now();

    try {
      const cacheStats = this.firewalla.getCacheStats();
      const responseTime = Date.now() - startTime;

      if (cacheStats.size > 1000) {
        return {
          status: 'warn',
          message: 'Cache size is large',
          responseTime,
          details: {
            cacheSize: cacheStats.size,
            cacheKeys: cacheStats.keys.length,
          },
        };
      }

      return {
        status: 'pass',
        message: 'Cache is healthy',
        responseTime,
        details: {
          cacheSize: cacheStats.size,
          cacheKeys: cacheStats.keys.length,
        },
      };
    } catch {
      return {
        status: 'fail',
        message: 'Cache check failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkSecurity(): Promise<HealthStatus['checks'][string]> {
    const startTime = Date.now();

    try {
      // Check rate limiting functionality
      const testClientId = 'health-check-test';
      const rateLimitWorking = this.security.checkRateLimit(testClientId);
      
      // Check input validation
      const validationWorking = this.security.validateInput('test input');
      
      const responseTime = Date.now() - startTime;

      if (!rateLimitWorking || !validationWorking) {
        return {
          status: 'fail',
          message: 'Security checks failed',
          responseTime,
          details: {
            rateLimitWorking,
            validationWorking,
          },
        };
      }

      return {
        status: 'pass',
        message: 'Security systems are operational',
        responseTime,
      };
    } catch {
      return {
        status: 'fail',
        message: 'Security check failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  private determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.includes('fail')) {
      return 'unhealthy';
    }
    
    if (statuses.includes('warn')) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  async getDetailedStatus(): Promise<{
    health: HealthStatus;
    metrics: {
      firewalla_cache_size: number;
      memory_heap_used_mb: number;
      uptime_seconds: number;
      last_api_response_time_ms?: number;
    };
  }> {
    const health = await this.performHealthCheck();
    const memUsage = process.memoryUsage();
    const cacheStats = this.firewalla.getCacheStats();

    return {
      health,
      metrics: {
        firewalla_cache_size: cacheStats.size,
        memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
        ...(health.checks.firewalla_api?.responseTime && {
          last_api_response_time_ms: health.checks.firewalla_api.responseTime,
        }),
      },
    };
  }

  getReadinessStatus(): { ready: boolean; reason?: string } {
    try {
      // Check if essential services are configured
      if (!config.mspToken || !config.boxId) {
        return { ready: false, reason: 'Missing required configuration' };
      }

      // Check if we can validate environment
      const validation = this.security.validateEnvironmentVars();
      if (!validation.valid) {
        return { ready: false, reason: 'Invalid environment configuration' };
      }

      return { ready: true };
    } catch (error) {
      return { 
        ready: false, 
        reason: error instanceof Error ? error.message : 'Readiness check failed' 
      };
    }
  }

  getLivenessStatus(): { alive: boolean; reason?: string } {
    try {
      // Basic liveness checks
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

      // Check if memory usage is reasonable (less than 1GB)
      if (heapUsedMB > 1024) {
        return { alive: false, reason: 'Memory usage too high' };
      }

      return { alive: true };
    } catch (error) {
      return { 
        alive: false, 
        reason: error instanceof Error ? error.message : 'Liveness check failed' 
      };
    }
  }
}