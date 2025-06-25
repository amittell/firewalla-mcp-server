import { productionConfig } from '../production/config';
import { getCurrentTimestamp } from '../utils/timestamp.js';

// DEBUG environment variable support
const DEBUG_ENABLED = process.env.DEBUG === 'firewalla:*' || process.env.DEBUG === '1' || process.env.DEBUG === 'true';
const DEBUG_FILTERS = (process.env.DEBUG || '').split(',').map(f => f.trim());

// Check if debug should be enabled for a specific namespace
function shouldDebug(namespace: string): boolean {
  if (!DEBUG_ENABLED && DEBUG_FILTERS.length === 0) {return false;}
  if (DEBUG_ENABLED) {return true;}
  return DEBUG_FILTERS.some(filter => {
    if (filter === '*') {return true;}
    if (filter.endsWith('*')) {return namespace.startsWith(filter.slice(0, -1));}
    return namespace === filter;
  });
}

export interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  service: string;
  version: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  traceId?: string;
  requestId?: string;
}

export class StructuredLogger {
  private service = 'firewalla-mcp-server';
  private version = '1.0.0';
  private logLevel: LogEntry['level'];

  constructor(logLevel?: LogEntry['level']) {
    // Override log level if DEBUG is enabled
    if (DEBUG_ENABLED) {
      this.logLevel = 'debug';
    } else {
      this.logLevel = logLevel || productionConfig.logLevel || 'info';
    }
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error,
    traceId?: string,
    requestId?: string
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: getCurrentTimestamp(),
      level,
      message,
      service: this.service,
      version: this.version,
    };

    if (metadata) {
      entry.metadata = this.sanitizeMetadata(metadata);
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      };
    }

    if (traceId) {
      entry.traceId = traceId;
    }

    if (requestId) {
      entry.requestId = requestId;
    }

    return entry;
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // Mask sensitive fields
      if (key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')) {
        sanitized[key] = this.maskSensitiveValue(String(value));
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private maskSensitiveValue(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
  }

  private output(entry: LogEntry): void {
    const logString = JSON.stringify(entry);
    
    if (entry.level === 'error') {
      process.stderr.write(logString + '\\n');
    } else {
      process.stdout.write(logString + '\\n');
    }
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('error')) {return;}
    
    const entry = this.createLogEntry('error', message, metadata, error, traceId, requestId);
    this.output(entry);
  }

  warn(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('warn')) {return;}
    
    const entry = this.createLogEntry('warn', message, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  info(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('info')) {return;}
    
    const entry = this.createLogEntry('info', message, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  debug(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('debug')) {return;}
    
    const entry = this.createLogEntry('debug', message, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  // Namespace-specific debug logging
  debugNamespace(namespace: string, message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!shouldDebug(namespace)) {return;}
    
    const namespacedMessage = `[${namespace}] ${message}`;
    const entry = this.createLogEntry('debug', namespacedMessage, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  // Convenience methods for common scenarios
  apiRequest(method: string, endpoint: string, duration: number, statusCode: number, requestId?: string): void {
    this.info('API request completed', {
      http: {
        method,
        endpoint,
        duration_ms: duration,
        status_code: statusCode,
      },
    }, undefined, requestId);
  }

  apiError(method: string, endpoint: string, error: Error, requestId?: string): void {
    this.error('API request failed', error, {
      http: {
        method,
        endpoint,
      },
    }, undefined, requestId);
  }

  securityEvent(event: string, metadata: Record<string, unknown>): void {
    this.warn('Security event detected', {
      security: {
        event,
        ...metadata,
      },
    });
  }

  cacheOperation(operation: string, key: string, hit: boolean, metadata?: Record<string, unknown>): void {
    this.debugNamespace('cache', `Cache ${operation}: ${hit ? 'HIT' : 'MISS'}`, {
      cache: {
        operation,
        key,
        hit,
        ...metadata,
      },
    });
  }

  // Performance monitoring logs
  performanceLog(operation: string, duration: number, metadata?: Record<string, unknown>): void {
    this.debugNamespace('performance', `${operation} completed in ${duration}ms`, {
      performance: {
        operation,
        duration_ms: duration,
        ...metadata,
      },
    });
  }

  // Data pipeline troubleshooting logs
  pipelineLog(stage: string, message: string, metadata?: Record<string, unknown>): void {
    this.debugNamespace('pipeline', `[${stage}] ${message}`, {
      pipeline: {
        stage,
        ...metadata,
      },
    });
  }

  // Query performance logs
  queryLog(queryType: string, query: string, duration: number, resultCount: number, metadata?: Record<string, unknown>): void {
    this.debugNamespace('query', `${queryType} query executed`, {
      query: {
        type: queryType,
        query: query.length > 100 ? query.substring(0, 100) + '...' : query,
        duration_ms: duration,
        result_count: resultCount,
        ...metadata,
      },
    });
  }
}

// Global logger instance
export const logger = new StructuredLogger();