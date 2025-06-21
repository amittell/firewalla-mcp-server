import { productionConfig } from '../production/config';

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
    this.logLevel = logLevel || productionConfig.logLevel || 'info';
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
      timestamp: new Date().toISOString(),
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
    if (!this.shouldLog('error')) return;
    
    const entry = this.createLogEntry('error', message, metadata, error, traceId, requestId);
    this.output(entry);
  }

  warn(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('warn')) return;
    
    const entry = this.createLogEntry('warn', message, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  info(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('info')) return;
    
    const entry = this.createLogEntry('info', message, metadata, undefined, traceId, requestId);
    this.output(entry);
  }

  debug(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void {
    if (!this.shouldLog('debug')) return;
    
    const entry = this.createLogEntry('debug', message, metadata, undefined, traceId, requestId);
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
    this.debug('Cache operation', {
      cache: {
        operation,
        key,
        hit,
        ...metadata,
      },
    });
  }
}

// Global logger instance
export const logger = new StructuredLogger();