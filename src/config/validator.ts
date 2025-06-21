import { FirewallaConfig } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  static validateConfig(config: FirewallaConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate MSP Token
    if (!config.mspToken) {
      errors.push('MSP token is required');
    } else {
      if (config.mspToken.length < 20) {
        warnings.push('MSP token appears to be shorter than expected');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(config.mspToken)) {
        errors.push('MSP token contains invalid characters');
      }
    }

    // Validate MSP Base URL
    if (!config.mspBaseUrl) {
      errors.push('MSP base URL is required');
    } else {
      try {
        const url = new URL(config.mspBaseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('MSP base URL must use HTTP or HTTPS protocol');
        }
        if (url.protocol === 'http:' && !url.hostname.includes('localhost')) {
          warnings.push('Using HTTP instead of HTTPS for production API');
        }
      } catch {
        errors.push('MSP base URL is not a valid URL');
      }
    }

    // Validate Box ID
    if (!config.boxId) {
      errors.push('Box ID is required');
    } else {
      if (config.boxId.length < 5) {
        warnings.push('Box ID appears to be shorter than expected');
      }
    }

    // Validate numeric configuration
    if (config.apiTimeout <= 0) {
      errors.push('API timeout must be greater than 0');
    } else if (config.apiTimeout < 5000) {
      warnings.push('API timeout is very low, may cause timeouts');
    } else if (config.apiTimeout > 60000) {
      warnings.push('API timeout is very high, may cause delays');
    }

    if (config.rateLimit <= 0) {
      errors.push('Rate limit must be greater than 0');
    } else if (config.rateLimit > 1000) {
      warnings.push('Rate limit is very high, may exceed API limits');
    }

    if (config.cacheTtl < 0) {
      errors.push('Cache TTL cannot be negative');
    } else if (config.cacheTtl > 3600) {
      warnings.push('Cache TTL is over 1 hour, data may become stale');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateToolArguments(toolName: string, args: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (toolName) {
      case 'get_active_alarms':
        if (args.severity && !['low', 'medium', 'high', 'critical'].includes(args.severity as string)) {
          errors.push('Invalid severity level');
        }
        if (args.limit && (typeof args.limit !== 'number' || args.limit < 1 || args.limit > 100)) {
          errors.push('Limit must be a number between 1 and 100');
        }
        break;

      case 'get_flow_data':
        if (args.start_time && !this.isValidISODate(args.start_time as string)) {
          errors.push('start_time must be a valid ISO 8601 date');
        }
        if (args.end_time && !this.isValidISODate(args.end_time as string)) {
          errors.push('end_time must be a valid ISO 8601 date');
        }
        if (args.limit && (typeof args.limit !== 'number' || args.limit < 1 || args.limit > 100)) {
          errors.push('Limit must be a number between 1 and 100');
        }
        if (args.page && (typeof args.page !== 'number' || args.page < 1)) {
          errors.push('Page must be a number greater than 0');
        }
        break;

      case 'get_bandwidth_usage':
        if (!args.period) {
          errors.push('Period is required');
        } else if (!['1h', '24h', '7d', '30d'].includes(args.period as string)) {
          errors.push('Period must be one of: 1h, 24h, 7d, 30d');
        }
        if (args.top && (typeof args.top !== 'number' || args.top < 1 || args.top > 50)) {
          errors.push('Top must be a number between 1 and 50');
        }
        break;

      case 'pause_rule':
        if (!args.rule_id) {
          errors.push('Rule ID is required');
        }
        if (args.duration && (typeof args.duration !== 'number' || args.duration < 1 || args.duration > 1440)) {
          errors.push('Duration must be a number between 1 and 1440 minutes');
        }
        break;

      case 'get_target_lists':
        if (args.list_type && !['cloudflare', 'crowdsec', 'all'].includes(args.list_type as string)) {
          errors.push('List type must be one of: cloudflare, crowdsec, all');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static isValidISODate(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return date.toISOString() === dateString;
    } catch {
      return false;
    }
  }

  static validateResourceURI(uri: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const validURIs = [
      'firewalla://summary',
      'firewalla://devices',
      'firewalla://metrics/security',
      'firewalla://topology',
      'firewalla://threats/recent',
    ];

    if (!validURIs.includes(uri)) {
      errors.push(`Invalid resource URI: ${uri}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validatePromptArguments(promptName: string, args: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (promptName) {
      case 'security_report':
        if (args.period && !['24h', '7d', '30d'].includes(args.period as string)) {
          errors.push('Period must be one of: 24h, 7d, 30d');
        }
        break;

      case 'threat_analysis':
        if (args.severity_threshold && !['medium', 'high', 'critical'].includes(args.severity_threshold as string)) {
          errors.push('Severity threshold must be one of: medium, high, critical');
        }
        break;

      case 'bandwidth_analysis':
        if (!args.period) {
          errors.push('Period is required');
        } else if (!['1h', '24h', '7d', '30d'].includes(args.period as string)) {
          errors.push('Period must be one of: 1h, 24h, 7d, 30d');
        }
        if (args.threshold_mb && (typeof args.threshold_mb !== 'number' || args.threshold_mb < 1)) {
          errors.push('Threshold MB must be a positive number');
        }
        break;

      case 'device_investigation':
        if (!args.device_id) {
          errors.push('Device ID is required');
        }
        if (args.lookback_hours && (typeof args.lookback_hours !== 'number' || args.lookback_hours < 1 || args.lookback_hours > 168)) {
          errors.push('Lookback hours must be between 1 and 168 (7 days)');
        }
        break;

      case 'network_health_check':
        // No arguments required
        break;

      default:
        errors.push(`Unknown prompt: ${promptName}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}