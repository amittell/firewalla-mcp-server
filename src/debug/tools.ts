import { FirewallaClient } from '../firewalla/client';
import { logger } from '../monitoring/logger';
import { metricsCollector } from '../monitoring/metrics';
import { HealthCheckManager } from '../health/endpoints';

export interface DebugInfo {
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    usage_percent: number;
  };
  cache: {
    size: number;
    keys: string[];
  };
  metrics: {
    total_metrics: number;
    recent_metrics: Array<{ name: string; value: number; timestamp: number }>;
  };
  health: any;
}

export class DebugTools {
  private startTime: number;

  constructor(
    // eslint-disable-next-line no-unused-vars
    private firewalla: FirewallaClient,
    // eslint-disable-next-line no-unused-vars  
    private healthCheck: HealthCheckManager
  ) {
    this.startTime = Date.now();
  }

  async getDebugInfo(): Promise<DebugInfo> {
    const memUsage = process.memoryUsage();
    const cacheStats = this.firewalla.getCacheStats();
    const allMetrics = metricsCollector.getAllMetrics();
    const health = await this.healthCheck.performHealthCheck();

    return {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        usage_percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cache: {
        size: cacheStats.size,
        keys: cacheStats.keys.slice(0, 10), // Show first 10 keys
      },
      metrics: {
        total_metrics: allMetrics.length,
        recent_metrics: allMetrics
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5)
          .map(m => ({ name: m.name, value: m.value, timestamp: m.timestamp })),
      },
      health,
    };
  }

  async testFirewallaConnection(): Promise<{
    success: boolean;
    response_time: number;
    error?: string;
    data?: any;
  }> {
    const startTime = Date.now();
    
    try {
      const summary = await this.firewalla.getFirewallSummary();
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        response_time: responseTime,
        data: {
          status: summary.status,
          uptime: summary.uptime,
          cpu_usage: summary.cpu_usage,
          memory_usage: summary.memory_usage,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async simulateLoad(requests = 10, delay = 100): Promise<{
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    average_response_time: number;
    min_response_time: number;
    max_response_time: number;
  }> {
    logger.info('Starting load simulation', { requests, delay });
    
    const results: Array<{ success: boolean; responseTime: number }> = [];
    
    const promises = Array.from({ length: requests }, async (_, index) => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, index * delay));
      }
      
      const startTime = Date.now();
      
      try {
        await this.firewalla.getFirewallSummary();
        const responseTime = Date.now() - startTime;
        results.push({ success: true, responseTime });
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.push({ success: false, responseTime });
        logger.error('Load simulation request failed', error as Error);
      }
    });
    
    await Promise.all(promises);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const responseTimes = results.map(r => r.responseTime);
    
    const summary = {
      total_requests: requests,
      successful_requests: successful.length,
      failed_requests: failed.length,
      average_response_time: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      min_response_time: Math.min(...responseTimes),
      max_response_time: Math.max(...responseTimes),
    };
    
    logger.info('Load simulation completed', summary);
    
    return summary;
  }

  clearCache(): { cleared_entries: number } {
    const stats = this.firewalla.getCacheStats();
    const clearedEntries = stats.size;
    
    this.firewalla.clearCache();
    
    logger.info('Cache cleared', { cleared_entries: clearedEntries });
    
    return { cleared_entries: clearedEntries };
  }

  clearMetrics(): { cleared_metrics: number } {
    const allMetrics = metricsCollector.getAllMetrics();
    const clearedMetrics = allMetrics.length;
    
    metricsCollector.clear();
    
    logger.info('Metrics cleared', { cleared_metrics: clearedMetrics });
    
    return { cleared_metrics: clearedMetrics };
  }

  async validateConfiguration(): Promise<{
    valid: boolean;
    issues: Array<{ level: 'error' | 'warning'; message: string }>;
  }> {
    const issues: Array<{ level: 'error' | 'warning'; message: string }> = [];
    
    // Check environment variables
    const requiredVars = ['FIREWALLA_MSP_TOKEN', 'FIREWALLA_BOX_ID'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        issues.push({
          level: 'error',
          message: `Missing required environment variable: ${varName}`,
        });
      }
    }
    
    // Check API connectivity
    try {
      await this.testFirewallaConnection();
    } catch (error) {
      issues.push({
        level: 'error',
        message: `Cannot connect to Firewalla API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (heapUsageMB > 512) {
      issues.push({
        level: 'warning',
        message: `High memory usage: ${Math.round(heapUsageMB)}MB`,
      });
    }
    
    // Check cache size
    const cacheStats = this.firewalla.getCacheStats();
    if (cacheStats.size > 1000) {
      issues.push({
        level: 'warning',
        message: `Large cache size: ${cacheStats.size} entries`,
      });
    }
    
    return {
      valid: issues.filter(i => i.level === 'error').length === 0,
      issues,
    };
  }

  generateSystemReport(): string {
    const memUsage = process.memoryUsage();
    const cacheStats = this.firewalla.getCacheStats();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    return `
Firewalla MCP Server System Report
Generated: ${new Date().toISOString()}

Environment Information:
- Node.js Version: ${process.version}
- Platform: ${process.platform}
- Architecture: ${process.arch}
- Environment: ${process.env.NODE_ENV || 'development'}
- Uptime: ${uptime} seconds

Memory Usage:
- Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB
- Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB
- External: ${Math.round(memUsage.external / 1024 / 1024)} MB
- RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB

Cache Information:
- Cache Size: ${cacheStats.size} entries
- Sample Keys: ${cacheStats.keys.slice(0, 5).join(', ')}

Configuration:
- MSP Token: ${process.env.FIREWALLA_MSP_TOKEN ? 'Set' : 'Missing'}
- Box ID: ${process.env.FIREWALLA_BOX_ID ? 'Set' : 'Missing'}
- Base URL: ${process.env.FIREWALLA_MSP_BASE_URL || 'Default'}
- Log Level: ${process.env.LOG_LEVEL || 'Default'}

Recent Activity:
- Use 'npm run mcp:debug' for detailed logging
- Check logs directory for historical data
    `.trim();
  }

  enableVerboseLogging(): void {
    logger.info('Enabling verbose logging mode');
    // This would typically update the logger configuration
    process.env.DEBUG = 'mcp:*';
    process.env.LOG_LEVEL = 'debug';
  }

  disableVerboseLogging(): void {
    logger.info('Disabling verbose logging mode');
    delete process.env.DEBUG;
    process.env.LOG_LEVEL = 'info';
  }
}

// Export a function to create debug tools
export function createDebugTools(firewalla: FirewallaClient, healthCheck: HealthCheckManager): DebugTools {
  return new DebugTools(firewalla, healthCheck);
}