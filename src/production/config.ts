import * as dotenv from 'dotenv';
import type { FirewallaConfig } from '../types';
import {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvInt,
} from '../utils/env.js';

// Configure dotenv to load environment variables
dotenv.config();

export interface ProductionConfig extends FirewallaConfig {
  environment: 'production' | 'staging' | 'development';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  enableMetrics: boolean;
  enableHealthChecks: boolean;
  corsOrigins: string[];
  trustedProxies: string[];
  maxConcurrentRequests: number;
  gracefulShutdownTimeout: number;
}

export function getProductionConfig(): ProductionConfig {
  // Check if running in test mode
  const testMode = getOptionalEnvVar('MCP_TEST_MODE', 'false').toLowerCase() === 'true';
  
  const mspId = testMode ? 'test.firewalla.net' : getRequiredEnvVar('FIREWALLA_MSP_ID');
  
  const baseConfig = {
    mspToken: testMode ? 'test-token' : getRequiredEnvVar('FIREWALLA_MSP_TOKEN'),
    mspId,
    mspBaseUrl: `https://${mspId}`,
    boxId: testMode ? 'test-box-id' : getRequiredEnvVar('FIREWALLA_BOX_ID'),
    apiTimeout: getOptionalEnvInt('API_TIMEOUT', 30000, 1000, 300000), // 1s to 5min
    rateLimit: getOptionalEnvInt('API_RATE_LIMIT', 100, 1, 1000), // 1 to 1000 requests per minute
    cacheTtl: getOptionalEnvInt('CACHE_TTL', 300, 0, 3600), // 0s to 1 hour
    defaultPageSize: getOptionalEnvInt('DEFAULT_PAGE_SIZE', 100, 1, 10000), // 1 to 10000 items per page
    maxPageSize: getOptionalEnvInt('MAX_PAGE_SIZE', 10000, 100, 100000), // 100 to 100000 items per page
  };

  return {
    ...baseConfig,
    environment: getOptionalEnvVar(
      'NODE_ENV',
      'development'
    ) as ProductionConfig['environment'],
    logLevel: getOptionalEnvVar(
      'LOG_LEVEL',
      'info'
    ) as ProductionConfig['logLevel'],
    enableMetrics: getOptionalEnvVar('ENABLE_METRICS', 'true') === 'true',
    enableHealthChecks:
      getOptionalEnvVar('ENABLE_HEALTH_CHECKS', 'true') === 'true',
    corsOrigins: getOptionalEnvVar(
      'CORS_ORIGINS',
      'https://claude.ai,https://anthropic.com'
    ).split(','),
    trustedProxies: getOptionalEnvVar('TRUSTED_PROXIES', '')
      .split(',')
      .filter(Boolean),
    maxConcurrentRequests: getOptionalEnvInt(
      'MAX_CONCURRENT_REQUESTS',
      50,
      1,
      1000
    ), // 1 to 1000 concurrent requests
    gracefulShutdownTimeout: getOptionalEnvInt(
      'GRACEFUL_SHUTDOWN_TIMEOUT',
      30000,
      1000,
      60000
    ), // 1s to 60s
  };
}

export class ProductionConfigValidator {
  static validate(config: ProductionConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate environment
    if (
      !['production', 'staging', 'development'].includes(config.environment)
    ) {
      errors.push(
        'Invalid environment. Must be production, staging, or development'
      );
    }

    // Validate log level
    if (!['error', 'warn', 'info', 'debug'].includes(config.logLevel)) {
      errors.push('Invalid log level. Must be error, warn, info, or debug');
    }

    // Production-specific validations
    if (config.environment === 'production') {
      if (config.logLevel === 'debug') {
        warnings.push(
          'Debug logging enabled in production may impact performance'
        );
      }

      // MSP ID validation for production - no HTTP check needed as URL is constructed

      if (config.apiTimeout < 10000) {
        warnings.push('API timeout may be too low for production workloads');
      }

      if (config.cacheTtl > 3600) {
        warnings.push(
          'Cache TTL over 1 hour may cause stale data in production'
        );
      }

      if (config.corsOrigins.includes('*')) {
        errors.push('Wildcard CORS origins not allowed in production');
      }

      if (config.maxConcurrentRequests > 200) {
        warnings.push(
          'High concurrent request limit may impact system stability'
        );
      }
    }

    // Validate CORS origins
    config.corsOrigins.forEach((origin, index) => {
      if (origin !== '*' && !isValidUrl(origin)) {
        errors.push(`Invalid CORS origin at index ${index}: ${origin}`);
      }
    });

    // Validate trusted proxies
    config.trustedProxies.forEach((proxy, index) => {
      if (!isValidIpOrCidr(proxy)) {
        errors.push(`Invalid trusted proxy at index ${index}: ${proxy}`);
      }
    });

    // Validate numeric ranges
    if (
      config.maxConcurrentRequests < 1 ||
      config.maxConcurrentRequests > 1000
    ) {
      errors.push('Max concurrent requests must be between 1 and 1000');
    }

    if (
      config.gracefulShutdownTimeout < 1000 ||
      config.gracefulShutdownTimeout > 60000
    ) {
      errors.push(
        'Graceful shutdown timeout must be between 1000ms and 60000ms'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidIpOrCidr(value: string): boolean {
  // Basic IP/CIDR validation
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;

  return ipRegex.test(value) || ipv6Regex.test(value);
}

export const productionConfig = getProductionConfig();
