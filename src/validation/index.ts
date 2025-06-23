/**
 * Response validation and error handling for Firewalla MCP Server
 * Implements schema validation and data integrity checks
 */

import { 
  Alarm, 
  Flow, 
  Device, 
  NetworkRule, 
  TargetList, 
  Box,
  BandwidthUsage,
  SimpleStats,
  Statistics,
  Trend,
  SearchResult
} from '../types.js';

/**
 * Validation error class for detailed error reporting
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: any,
    public expected?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Response validation utilities
 */
export class ResponseValidator {
  
  /**
   * Validate standardized API response format
   */
  static validateStandardResponse<T>(
    response: any,
    itemValidator?: (item: any) => ValidationResult
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (typeof response !== 'object' || response === null) {
      errors.push(new ValidationError('Response must be an object', 'response', response, 'object'));
      return { valid: false, errors, warnings };
    }

    if (typeof response.count !== 'number') {
      errors.push(new ValidationError('Response count must be a number', 'count', response.count, 'number'));
    }

    if (!Array.isArray(response.results)) {
      errors.push(new ValidationError('Response results must be an array', 'results', response.results, 'array'));
    } else {
      // Validate array length matches count
      if (response.count !== response.results.length) {
        warnings.push(`Count (${response.count}) does not match results array length (${response.results.length})`);
      }

      // Validate individual items if validator provided
      if (itemValidator) {
        response.results.forEach((item: any, index: number) => {
          const result = itemValidator(item);
          if (!result.valid) {
            result.errors.forEach(error => {
              errors.push(new ValidationError(
                `Item ${index}: ${error.message}`,
                `results[${index}].${error.field}`,
                error.value,
                error.expected
              ));
            });
          }
          warnings.push(...result.warnings.map(w => `Item ${index}: ${w}`));
        });
      }
    }

    // Optional cursor validation
    if (response.next_cursor !== undefined && typeof response.next_cursor !== 'string') {
      errors.push(new ValidationError('next_cursor must be a string when present', 'next_cursor', response.next_cursor, 'string'));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate Alarm object
   */
  static validateAlarm(alarm: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof alarm.ts !== 'number') {
      errors.push(new ValidationError('ts must be a number', 'ts', alarm.ts, 'number'));
    } else if (alarm.ts < 0) {
      errors.push(new ValidationError('ts must be a positive number', 'ts', alarm.ts, 'positive number'));
    }

    if (typeof alarm.gid !== 'string') {
      errors.push(new ValidationError('gid must be a string', 'gid', alarm.gid, 'string'));
    }

    if (typeof alarm.aid !== 'number') {
      errors.push(new ValidationError('aid must be a number', 'aid', alarm.aid, 'number'));
    }

    if (typeof alarm.type !== 'number' || alarm.type < 1 || alarm.type > 16) {
      errors.push(new ValidationError('type must be a number between 1-16', 'type', alarm.type, '1-16'));
    }

    if (typeof alarm.status !== 'number' || (alarm.status !== 1 && alarm.status !== 2)) {
      errors.push(new ValidationError('status must be 1 or 2', 'status', alarm.status, '1 or 2'));
    }

    if (typeof alarm.message !== 'string') {
      errors.push(new ValidationError('message must be a string', 'message', alarm.message, 'string'));
    }

    if (!['inbound', 'outbound', 'local'].includes(alarm.direction)) {
      errors.push(new ValidationError('direction must be inbound, outbound, or local', 'direction', alarm.direction, 'inbound|outbound|local'));
    }

    if (!['tcp', 'udp'].includes(alarm.protocol)) {
      errors.push(new ValidationError('protocol must be tcp or udp', 'protocol', alarm.protocol, 'tcp|udp'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Flow object
   */
  static validateFlow(flow: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof flow.ts !== 'number') {
      errors.push(new ValidationError('ts must be a number', 'ts', flow.ts, 'number'));
    }

    if (typeof flow.gid !== 'string') {
      errors.push(new ValidationError('gid must be a string', 'gid', flow.gid, 'string'));
    }

    if (typeof flow.protocol !== 'string') {
      errors.push(new ValidationError('protocol must be a string', 'protocol', flow.protocol, 'string'));
    }

    if (!['inbound', 'outbound', 'local'].includes(flow.direction)) {
      errors.push(new ValidationError('direction must be inbound, outbound, or local', 'direction', flow.direction, 'inbound|outbound|local'));
    }

    if (typeof flow.block !== 'boolean') {
      errors.push(new ValidationError('block must be a boolean', 'block', flow.block, 'boolean'));
    }

    if (typeof flow.count !== 'number') {
      errors.push(new ValidationError('count must be a number', 'count', flow.count, 'number'));
    }

    // Validate device object
    if (!flow.device || typeof flow.device !== 'object') {
      errors.push(new ValidationError('device must be an object', 'device', flow.device, 'object'));
    } else {
      if (typeof flow.device.id !== 'string') {
        errors.push(new ValidationError('device.id must be a string', 'device.id', flow.device.id, 'string'));
      }
      if (typeof flow.device.ip !== 'string') {
        errors.push(new ValidationError('device.ip must be a string', 'device.ip', flow.device.ip, 'string'));
      }
      if (typeof flow.device.name !== 'string') {
        errors.push(new ValidationError('device.name must be a string', 'device.name', flow.device.name, 'string'));
      }
    }

    // Optional field validations
    if (flow.blockType !== undefined && !['ip', 'dns'].includes(flow.blockType)) {
      errors.push(new ValidationError('blockType must be ip or dns when present', 'blockType', flow.blockType, 'ip|dns'));
    }

    if (flow.download !== undefined && typeof flow.download !== 'number') {
      errors.push(new ValidationError('download must be a number when present', 'download', flow.download, 'number'));
    }

    if (flow.upload !== undefined && typeof flow.upload !== 'number') {
      errors.push(new ValidationError('upload must be a number when present', 'upload', flow.upload, 'number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Device object
   */
  static validateDevice(device: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof device.id !== 'string') {
      errors.push(new ValidationError('id must be a string', 'id', device.id, 'string'));
    }

    if (typeof device.gid !== 'string') {
      errors.push(new ValidationError('gid must be a string', 'gid', device.gid, 'string'));
    }

    if (typeof device.name !== 'string') {
      errors.push(new ValidationError('name must be a string', 'name', device.name, 'string'));
    }

    if (typeof device.ip !== 'string') {
      errors.push(new ValidationError('ip must be a string', 'ip', device.ip, 'string'));
    }

    if (typeof device.online !== 'boolean') {
      errors.push(new ValidationError('online must be a boolean', 'online', device.online, 'boolean'));
    }

    if (typeof device.ipReserved !== 'boolean') {
      errors.push(new ValidationError('ipReserved must be a boolean', 'ipReserved', device.ipReserved, 'boolean'));
    }

    // Validate network object
    if (!device.network || typeof device.network !== 'object') {
      errors.push(new ValidationError('network must be an object', 'network', device.network, 'object'));
    } else {
      if (typeof device.network.id !== 'string') {
        errors.push(new ValidationError('network.id must be a string', 'network.id', device.network.id, 'string'));
      }
      if (typeof device.network.name !== 'string') {
        errors.push(new ValidationError('network.name must be a string', 'network.name', device.network.name, 'string'));
      }
    }

    if (typeof device.totalDownload !== 'number') {
      errors.push(new ValidationError('totalDownload must be a number', 'totalDownload', device.totalDownload, 'number'));
    }

    if (typeof device.totalUpload !== 'number') {
      errors.push(new ValidationError('totalUpload must be a number', 'totalUpload', device.totalUpload, 'number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate NetworkRule object
   */
  static validateNetworkRule(rule: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof rule.id !== 'string') {
      errors.push(new ValidationError('id must be a string', 'id', rule.id, 'string'));
    }

    if (!['allow', 'block', 'timelimit'].includes(rule.action)) {
      errors.push(new ValidationError('action must be allow, block, or timelimit', 'action', rule.action, 'allow|block|timelimit'));
    }

    // Validate target object
    if (!rule.target || typeof rule.target !== 'object') {
      errors.push(new ValidationError('target must be an object', 'target', rule.target, 'object'));
    } else {
      if (typeof rule.target.type !== 'string') {
        errors.push(new ValidationError('target.type must be a string', 'target.type', rule.target.type, 'string'));
      }
      if (typeof rule.target.value !== 'string') {
        errors.push(new ValidationError('target.value must be a string', 'target.value', rule.target.value, 'string'));
      }
    }

    if (!['bidirection', 'inbound', 'outbound'].includes(rule.direction)) {
      errors.push(new ValidationError('direction must be bidirection, inbound, or outbound', 'direction', rule.direction, 'bidirection|inbound|outbound'));
    }

    if (typeof rule.ts !== 'number') {
      errors.push(new ValidationError('ts must be a number', 'ts', rule.ts, 'number'));
    }

    if (typeof rule.updateTs !== 'number') {
      errors.push(new ValidationError('updateTs must be a number', 'updateTs', rule.updateTs, 'number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate TargetList object
   */
  static validateTargetList(list: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof list.id !== 'string') {
      errors.push(new ValidationError('id must be a string', 'id', list.id, 'string'));
    }

    if (typeof list.name !== 'string') {
      errors.push(new ValidationError('name must be a string', 'name', list.name, 'string'));
    }

    if (typeof list.owner !== 'string') {
      errors.push(new ValidationError('owner must be a string', 'owner', list.owner, 'string'));
    }

    if (!Array.isArray(list.targets)) {
      errors.push(new ValidationError('targets must be an array', 'targets', list.targets, 'array'));
    }

    if (typeof list.lastUpdated !== 'number') {
      errors.push(new ValidationError('lastUpdated must be a number', 'lastUpdated', list.lastUpdated, 'number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate BandwidthUsage object
   */
  static validateBandwidth(bandwidth: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof bandwidth.device_id !== 'string') {
      errors.push(new ValidationError('device_id must be a string', 'device_id', bandwidth.device_id, 'string'));
    }

    if (typeof bandwidth.device_name !== 'string') {
      errors.push(new ValidationError('device_name must be a string', 'device_name', bandwidth.device_name, 'string'));
    }

    if (typeof bandwidth.ip_address !== 'string') {
      errors.push(new ValidationError('ip_address must be a string', 'ip_address', bandwidth.ip_address, 'string'));
    }

    if (typeof bandwidth.bytes_uploaded !== 'number') {
      errors.push(new ValidationError('bytes_uploaded must be a number', 'bytes_uploaded', bandwidth.bytes_uploaded, 'number'));
    } else if (bandwidth.bytes_uploaded < 0) {
      errors.push(new ValidationError('bytes_uploaded must be non-negative', 'bytes_uploaded', bandwidth.bytes_uploaded, 'non-negative number'));
    }

    if (typeof bandwidth.bytes_downloaded !== 'number') {
      errors.push(new ValidationError('bytes_downloaded must be a number', 'bytes_downloaded', bandwidth.bytes_downloaded, 'number'));
    } else if (bandwidth.bytes_downloaded < 0) {
      errors.push(new ValidationError('bytes_downloaded must be non-negative', 'bytes_downloaded', bandwidth.bytes_downloaded, 'non-negative number'));
    }

    if (typeof bandwidth.total_bytes !== 'number') {
      errors.push(new ValidationError('total_bytes must be a number', 'total_bytes', bandwidth.total_bytes, 'number'));
    } else if (bandwidth.total_bytes < 0) {
      errors.push(new ValidationError('total_bytes must be non-negative', 'total_bytes', bandwidth.total_bytes, 'non-negative number'));
    }

    if (typeof bandwidth.period !== 'string') {
      errors.push(new ValidationError('period must be a string', 'period', bandwidth.period, 'string'));
    } else if (!['1h', '24h', '7d', '30d'].includes(bandwidth.period)) {
      errors.push(new ValidationError('period must be one of: 1h, 24h, 7d, 30d', 'period', bandwidth.period, '1h|24h|7d|30d'));
    }

    // Validate that total_bytes matches sum of uploaded + downloaded (with tolerance for rounding)
    if (typeof bandwidth.bytes_uploaded === 'number' && 
        typeof bandwidth.bytes_downloaded === 'number' && 
        typeof bandwidth.total_bytes === 'number') {
      const expectedTotal = bandwidth.bytes_uploaded + bandwidth.bytes_downloaded;
      const tolerance = Math.max(1, expectedTotal * 0.01); // 1% tolerance or minimum 1 byte
      
      if (Math.abs(bandwidth.total_bytes - expectedTotal) > tolerance) {
        warnings.push(`total_bytes (${bandwidth.total_bytes}) does not match sum of uploaded (${bandwidth.bytes_uploaded}) + downloaded (${bandwidth.bytes_downloaded})`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Rule object (for pause/resume operations)
   */
  static validateRule(rule: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (typeof rule.id !== 'string') {
      errors.push(new ValidationError('id must be a string', 'id', rule.id, 'string'));
    }

    if (typeof rule.success !== 'boolean') {
      errors.push(new ValidationError('success must be a boolean', 'success', rule.success, 'boolean'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Target object (for target lists)
   */
  static validateTarget(target: any): ValidationResult {
    return this.validateTargetList(target);
  }

  /**
   * Validate Box object
   */
  static validateBox(box: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (typeof box.id !== 'string') {
      errors.push(new ValidationError('id must be a string', 'id', box.id, 'string'));
    }

    if (typeof box.name !== 'string') {
      errors.push(new ValidationError('name must be a string', 'name', box.name, 'string'));
    }

    if (typeof box.online !== 'boolean') {
      errors.push(new ValidationError('online must be a boolean', 'online', box.online, 'boolean'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Statistics object
   */
  static validateStatistics(stats: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Use 'meta' and 'value' fields as per Statistics interface definition
    if (!stats.meta || typeof stats.meta !== 'object') {
      errors.push(new ValidationError('meta must be an object', 'meta', stats.meta, 'object'));
    }

    if (typeof stats.value !== 'number') {
      errors.push(new ValidationError('value must be a number', 'value', stats.value, 'number'));
    } else if (stats.value < 0) {
      errors.push(new ValidationError('value must be non-negative', 'value', stats.value, 'non-negative number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate Trend object
   */
  static validateTrend(trend: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Use 'ts' field as per Trend interface definition
    if (typeof trend.ts !== 'number') {
      errors.push(new ValidationError('ts must be a number', 'ts', trend.ts, 'number'));
    } else if (trend.ts <= 0) {
      errors.push(new ValidationError('ts must be positive', 'ts', trend.ts, 'positive number'));
    }

    if (typeof trend.value !== 'number') {
      errors.push(new ValidationError('value must be a number', 'value', trend.value, 'number'));
    } else if (trend.value < 0) {
      errors.push(new ValidationError('value must be non-negative', 'value', trend.value, 'non-negative number'));
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Sanitize and normalize response data
   */
  static sanitizeResponse<T>(response: any): any {
    if (response === null || response === undefined) {
      return response;
    }

    if (Array.isArray(response)) {
      return response.map(item => this.sanitizeResponse(item));
    }

    if (typeof response === 'object') {
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(response)) {
        // Remove null/undefined values
        if (value !== null && value !== undefined) {
          sanitized[key] = this.sanitizeResponse(value);
        }
      }
      
      return sanitized;
    }

    return response;
  }

  /**
   * Validate and normalize pagination parameters
   */
  static validatePaginationParams(params: any): { limit: number; cursor?: string; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    let limit = 50; // default
    let cursor: string | undefined;

    if (params.limit !== undefined) {
      if (typeof params.limit !== 'number' || params.limit < 1 || params.limit > 1000) {
        errors.push(new ValidationError('limit must be a number between 1 and 1000', 'limit', params.limit, '1-1000'));
      } else {
        limit = Math.floor(params.limit);
      }
    }

    if (params.cursor !== undefined) {
      if (typeof params.cursor !== 'string') {
        errors.push(new ValidationError('cursor must be a string', 'cursor', params.cursor, 'string'));
      } else {
        cursor = params.cursor;
      }
    }

    return { limit, cursor, errors };
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(error: Error, context?: string): any {
    return {
      count: 0,
      results: [],
      error: {
        message: error.message,
        type: error.constructor.name,
        context: context || 'unknown',
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Decorator for automatic response validation
 */
export function validateResponse<T>(validator: (item: any) => ValidationResult) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        
        // Validate the response
        const validation = ResponseValidator.validateStandardResponse(result, validator);
        
        if (!validation.valid) {
          process.stderr.write(`Validation errors in ${propertyKey}: ${validation.errors.map(e => e.message).join(', ')}\n`);
        }
        
        if (validation.warnings.length > 0) {
          process.stderr.write(`Validation warnings in ${propertyKey}: ${validation.warnings.join(', ')}\n`);
        }
        
        return result;
      } catch (error) {
        process.stderr.write(`Error in ${propertyKey}: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        return ResponseValidator.createErrorResponse(
          error instanceof Error ? error : new Error('Unknown error'),
          propertyKey
        );
      }
    };

    return descriptor;
  };
}