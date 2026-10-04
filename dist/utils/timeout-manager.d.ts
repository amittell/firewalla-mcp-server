/**
 * Timeout Management Utilities for Firewalla MCP Server
 * Provides consistent timeout handling across all tools and operations
 */
/**
 * Timeout configuration options
 */
export interface TimeoutConfig {
    /** Timeout duration in milliseconds */
    timeoutMs?: number;
    /** Warning threshold in milliseconds */
    warningMs?: number;
    /** Error threshold in milliseconds */
    errorMs?: number;
    /** Whether to log performance metrics */
    enableMetrics?: boolean;
    /** Tool name for context */
    toolName?: string;
}
/**
 * The time a tool's operation has. withTimeout sets it for the operation and
 * everything it awaits, so the API client can read it without a parameter
 * on every method: it does not send again a failed request whose answer
 * could not come in time, and it passes `signal` to every request, so a
 * request in flight when the time runs out is cancelled and one not yet
 * sent is not sent.
 */
export interface ToolBudget {
    /** When the tool gives up, in Date.now() milliseconds */
    deadline: number;
    /** Aborted when the tool gives up */
    signal: AbortSignal;
    /** The operation's POST, PUT, PATCH and DELETE requests, as the client made them */
    writes: ToolWrite[];
}
/** A write request a tool's operation made, and how far it got */
export interface ToolWrite {
    /** `POST /v2/rules/<id>/pause` */
    request: string;
    /** The read tool that shows whether the write was applied */
    check?: string;
    /**
     * queued: made, waiting for the rate limiter; sent: sent to the API, not
     * answered yet; answered: the API answered it
     */
    state: 'queued' | 'sent' | 'answered';
    /** The HTTP status of its answer */
    status?: number;
}
/**
 * What a caller is told about a write that was sent and not answered: it
 * may have been applied, and `check`, a read tool (checkingReadTool in
 * client.ts), shows whether it was
 */
export declare function unknownWriteOutcome(check?: string): string;
/** The budget of the tool operation this runs in, if any (see ToolBudget) */
export declare function currentToolBudget(): ToolBudget | undefined;
/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
    startTime: number;
    endTime?: number;
    duration?: number;
    toolName: string;
    success: boolean;
    timedOut: boolean;
    warning: boolean;
    error: boolean;
}
/**
 * Timeout error class for actual timeout situations
 */
export declare class TimeoutError extends Error {
    readonly duration: number;
    readonly toolName: string;
    /** The limit the operation was stopped at, in milliseconds */
    readonly timeoutMs: number;
    /**
     * What became of the operation's writes, when it made any: not_sent,
     * unknown (sent and not answered) or applied (see describeWrites)
     */
    writeState?: 'not_sent' | 'unknown' | 'applied';
    /** The same for the tool's caller, in a sentence or three */
    writeOutcome?: string;
    constructor(toolName: string, duration: number, timeoutMs: number);
}
/**
 * Performance warning class for monitoring
 */
export declare class PerformanceWarning extends Error {
    readonly duration: number;
    readonly toolName: string;
    constructor(toolName: string, duration: number, threshold: number);
}
/**
 * Timeout manager class for handling operation timeouts
 */
export declare class TimeoutManager {
    private activeTimeouts;
    private metrics;
    private readonly maxMetrics;
    /**
     * Execute an async operation with timeout protection
     */
    withTimeout<T>(operation: () => Promise<T>, config?: Partial<TimeoutConfig>): Promise<T>;
    /**
     * Record performance metrics
     */
    private recordMetrics;
}
/**
 * Global timeout manager instance
 */
export declare const globalTimeoutManager: TimeoutManager;
/**
 * Runs a tool's operation with a time limit. A TimeoutError when the limit
 * passes; any other failure is thrown as it came, so its message, and the
 * HTTP status and error code of an ApiRequestError, reach the tool's error
 * response. It used to wrap a failure within 50 ms in a ValidationError
 * saying "This is an immediate parameter or configuration error, not a
 * timeout", and a later one in "This appears to be a processing error, not
 * a timeout", which a 503 answered after two attempts is neither.
 */
export declare function withToolTimeout<T>(operation: () => Promise<T>, toolName: string, customTimeoutMs?: number): Promise<T>;
/**
 * Create a standardized timeout error response for MCP tools with enhanced guidance
 */
export declare function createTimeoutErrorResponse(toolName: string, duration: number, timeoutMs: number, error?: unknown): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError: true;
};
//# sourceMappingURL=timeout-manager.d.ts.map