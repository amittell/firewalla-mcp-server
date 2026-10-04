// Import nothing that logs, directly or not: utils/env warns about a malformed
// number through this logger, so a module here that parsed its numbers at load
// time would run that warning before `logger` exists, and startup would fail
// with a ReferenceError instead of falling back to the default.
import * as dotenv from 'dotenv';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import { PACKAGE_VERSION } from '../utils/package-version.js';
// Before DEBUG and LOG_LEVEL are read, so a .env file can set them
dotenv.config();
// DEBUG environment variable support
const DEBUG_ENABLED = process.env.DEBUG === 'firewalla:*' ||
    process.env.DEBUG === '1' ||
    process.env.DEBUG === 'true';
const DEBUG_FILTERS = (process.env.DEBUG || '').split(',').map(f => f.trim());
/**
 * Determines if debug logging is enabled for a given namespace based on environment variable filters.
 *
 * Returns true if global debug is enabled or if the namespace matches any filter (with wildcard support) specified in the `DEBUG` environment variable.
 *
 * @param namespace - The debug namespace to check
 * @returns True if debug logging is enabled for the specified namespace
 */
function shouldDebug(namespace) {
    if (!DEBUG_ENABLED && DEBUG_FILTERS.length === 0) {
        return false;
    }
    if (DEBUG_ENABLED) {
        return true;
    }
    return DEBUG_FILTERS.some(filter => {
        if (filter === '*') {
            return true;
        }
        if (filter.endsWith('*')) {
            return namespace.startsWith(filter.slice(0, -1));
        }
        return namespace === filter;
    });
}
export class StructuredLogger {
    constructor(logLevel) {
        this.service = 'firewalla-mcp-server';
        this.version = PACKAGE_VERSION;
        // Override log level if DEBUG is enabled
        if (DEBUG_ENABLED) {
            this.logLevel = 'debug';
        }
        else {
            this.logLevel =
                logLevel || process.env.LOG_LEVEL || 'info';
        }
    }
    shouldLog(level) {
        const levels = ['error', 'warn', 'info', 'debug'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex <= currentLevelIndex;
    }
    createLogEntry(level, message, metadata, error, traceId, requestId) {
        const entry = {
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
    sanitizeMetadata(metadata) {
        const sanitized = {};
        for (const [key, value] of Object.entries(metadata)) {
            // Mask sensitive fields
            if (key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('password') ||
                key.toLowerCase().includes('secret') ||
                key.toLowerCase().includes('key')) {
                sanitized[key] = this.maskSensitiveValue(String(value));
            }
            else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    maskSensitiveValue(value) {
        if (value.length <= 8) {
            return '*'.repeat(value.length);
        }
        return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
    }
    output(entry) {
        const logString = JSON.stringify(entry);
        // Always write to stderr in MCP server to avoid polluting stdout JSON-RPC channel
        process.stderr.write(`${logString}\n`);
    }
    error(message, error, metadata, traceId, requestId) {
        if (!this.shouldLog('error')) {
            return;
        }
        const entry = this.createLogEntry('error', message, metadata, error, traceId, requestId);
        this.output(entry);
    }
    warn(message, metadata, traceId, requestId) {
        if (!this.shouldLog('warn')) {
            return;
        }
        const entry = this.createLogEntry('warn', message, metadata, undefined, traceId, requestId);
        this.output(entry);
    }
    info(message, metadata, traceId, requestId) {
        if (!this.shouldLog('info')) {
            return;
        }
        const entry = this.createLogEntry('info', message, metadata, undefined, traceId, requestId);
        this.output(entry);
    }
    debug(message, metadata, traceId, requestId) {
        if (!this.shouldLog('debug')) {
            return;
        }
        const entry = this.createLogEntry('debug', message, metadata, undefined, traceId, requestId);
        this.output(entry);
    }
    // Namespace-specific debug logging
    debugNamespace(namespace, message, metadata, traceId, requestId) {
        if (!shouldDebug(namespace)) {
            return;
        }
        const namespacedMessage = `[${namespace}] ${message}`;
        const entry = this.createLogEntry('debug', namespacedMessage, metadata, undefined, traceId, requestId);
        this.output(entry);
    }
    // Convenience methods for common scenarios
    apiRequest(method, endpoint, duration, statusCode, requestId) {
        this.info('API request completed', {
            http: {
                method,
                endpoint,
                duration_ms: duration,
                status_code: statusCode,
            },
        }, undefined, requestId);
    }
    apiError(method, endpoint, error, requestId) {
        this.error('API request failed', error, {
            http: {
                method,
                endpoint,
            },
        }, undefined, requestId);
    }
    securityEvent(event, metadata) {
        this.warn('Security event detected', {
            security: {
                event,
                ...metadata,
            },
        });
    }
    cacheOperation(operation, key, hit, metadata) {
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
    performanceLog(operation, duration, metadata) {
        this.debugNamespace('performance', `${operation} completed in ${duration}ms`, {
            performance: {
                operation,
                duration_ms: duration,
                ...metadata,
            },
        });
    }
    // Data pipeline troubleshooting logs
    pipelineLog(stage, message, metadata) {
        this.debugNamespace('pipeline', `[${stage}] ${message}`, {
            pipeline: {
                stage,
                ...metadata,
            },
        });
    }
    // Query performance logs
    queryLog(queryType, query, duration, resultCount, metadata) {
        this.debugNamespace('query', `${queryType} query executed`, {
            query: {
                type: queryType,
                query: query.length > 100 ? `${query.substring(0, 100)}...` : query,
                duration_ms: duration,
                result_count: resultCount,
                ...metadata,
            },
        });
    }
}
// Global logger instance
export const logger = new StructuredLogger();
//# sourceMappingURL=logger.js.map