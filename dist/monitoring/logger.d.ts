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
export declare class StructuredLogger {
    private service;
    private version;
    private logLevel;
    constructor(logLevel?: LogEntry['level']);
    private shouldLog;
    private createLogEntry;
    private sanitizeMetadata;
    private maskSensitiveValue;
    private output;
    error(message: string, error?: Error, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void;
    warn(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void;
    info(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void;
    debug(message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void;
    debugNamespace(namespace: string, message: string, metadata?: Record<string, unknown>, traceId?: string, requestId?: string): void;
    apiRequest(method: string, endpoint: string, duration: number, statusCode: number, requestId?: string): void;
    apiError(method: string, endpoint: string, error: Error, requestId?: string): void;
    securityEvent(event: string, metadata: Record<string, unknown>): void;
    cacheOperation(operation: string, key: string, hit: boolean, metadata?: Record<string, unknown>): void;
    performanceLog(operation: string, duration: number, metadata?: Record<string, unknown>): void;
    pipelineLog(stage: string, message: string, metadata?: Record<string, unknown>): void;
    queryLog(queryType: string, query: string, duration: number, resultCount: number, metadata?: Record<string, unknown>): void;
}
export declare const logger: StructuredLogger;
//# sourceMappingURL=logger.d.ts.map