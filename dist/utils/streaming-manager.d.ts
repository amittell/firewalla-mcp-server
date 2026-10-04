/**
 * Result Streaming Infrastructure for Firewalla MCP Server
 * Provides efficient streaming for large datasets to prevent memory exhaustion
 */
import type { PaginationParams } from './pagination.js';
/**
 * Configuration for streaming operations
 */
export interface StreamingConfig {
    /** Size of each chunk/batch to stream */
    chunkSize: number;
    /** Maximum number of chunks to stream (0 = unlimited) */
    maxChunks: number;
    /** Timeout for streaming session in milliseconds */
    sessionTimeoutMs: number;
    /** Whether to enable compression for large chunks */
    enableCompression: boolean;
    /** Maximum memory usage threshold (bytes) */
    maxMemoryThreshold: number;
    /** Whether to include metadata in each chunk */
    includeMetadata: boolean;
    /** Threshold for when to use streaming (number of items) */
    streamingThreshold: number;
}
/**
 * Streaming session information
 */
export interface StreamingSession {
    /** Unique session ID */
    sessionId: string;
    /** Tool name that initiated the streaming */
    toolName: string;
    /** Current continuation token */
    continuationToken?: string;
    /** Number of chunks already streamed */
    chunksStreamed: number;
    /** Total items streamed so far */
    itemsStreamed: number;
    /** Session start time */
    startTime: Date;
    /** Last activity time */
    lastActivity: Date;
    /** Whether the session is complete */
    isComplete: boolean;
    /** Original query parameters */
    originalParams: any;
    /** Session configuration */
    config: StreamingConfig;
}
/**
 * Individual chunk response
 */
export interface StreamingChunk {
    /** Unique chunk ID within the session */
    chunkId: number;
    /** Session ID this chunk belongs to */
    sessionId: string;
    /** Data items in this chunk */
    data: any[];
    /** Number of items in this chunk */
    count: number;
    /** Whether this is the final chunk */
    isFinalChunk: boolean;
    /** Continuation token for next chunk */
    nextContinuationToken?: string | null;
    /** Chunk metadata */
    metadata: {
        chunkIndex: number;
        totalItemsInSession: number;
        estimatedRemainingItems?: number;
        processingTimeMs: number;
        memoryUsage?: number;
    };
    /** Timestamp when chunk was created */
    timestamp: string;
}
/**
 * Streaming operation function type
 */
export type StreamingOperation<T = any> = (params: PaginationParams & {
    continuationToken?: string;
}) => Promise<{
    data: T[];
    hasMore: boolean;
    nextCursor?: string | null;
    total?: number;
}>;
/**
 * A session that cannot give another chunk: not found (never started, or
 * removed), complete (its final chunk was returned), expired (idle longer than
 * its sessionTimeoutMs) or at its maxChunks
 */
export declare class StreamingSessionError extends Error {
    readonly reason: 'not_found' | 'complete' | 'expired' | 'chunk_limit';
    constructor(message: string, reason: 'not_found' | 'complete' | 'expired' | 'chunk_limit');
}
/**
 * Manager class for handling result streaming
 */
export declare class StreamingManager {
    private config;
    private activeSessions;
    /** Per session, the chunk read in progress or queued last */
    private chunkQueues;
    private cleanupTimer?;
    constructor(config?: Partial<StreamingConfig>);
    /**
     * Create a new streaming session
     */
    createStreamingSession(toolName: string, originalParams: any, config?: Partial<StreamingConfig>): StreamingSession;
    /**
     * Get the next chunk of data for a streaming session. Reads of one session
     * run one at a time, in the order they were asked for: each reads the
     * cursor the one before it left, so two overlapping calls get consecutive
     * chunks, not the same chunk twice. A read queued behind the final chunk
     * fails as complete.
     */
    getNextChunk<T = any>(sessionId: string, operation: StreamingOperation<T>): Promise<StreamingChunk | null>;
    /** One chunk of a session, read with the session's current cursor */
    private readNextChunk;
    /**
     * Start a new streaming operation
     */
    startStreaming<T = any>(toolName: string, operation: StreamingOperation<T>, originalParams: any, config?: Partial<StreamingConfig>): Promise<{
        sessionId: string;
        firstChunk: StreamingChunk;
    }>;
    /**
     * Continue an existing streaming session
     */
    continueStreaming<T = any>(sessionId: string, operation: StreamingOperation<T>): Promise<StreamingChunk | null>;
    /**
     * Get information about an active streaming session
     */
    getSessionInfo(sessionId: string): StreamingSession | null;
    /**
     * List all active streaming sessions
     */
    getActiveSessions(): StreamingSession[];
    /**
     * Complete a streaming session
     */
    completeSession(sessionId: string): void;
    /**
     * Expire a streaming session due to timeout or error
     */
    expireSession(sessionId: string): void;
    /**
     * Cancel a streaming session
     */
    cancelSession(sessionId: string): boolean;
    /**
     * Clean up expired sessions, every minute while any session exists. The
     * timer does not keep the process alive, and stops when no session is
     * left, so an idle manager holds no timer.
     */
    private startSessionCleanup;
    /**
     * Stop the streaming manager and clean up resources
     */
    shutdown(): void;
    /**
     * Generate a unique session ID
     */
    private generateSessionId;
    /**
     * Estimate remaining items in the stream
     */
    private estimateRemainingItems;
    /**
     * Get current memory usage (simplified)
     */
    private getMemoryUsage;
    /**
     * Create a streaming configuration optimized for specific tool types
     */
    static getConfigForTool(toolName: string): Partial<StreamingConfig>;
    /**
     * The streaming manager for a tool, configured for it. The same manager is
     * returned on every call for the same tool and `owner` (for example the
     * API client), so a session started by one call can be continued by the
     * next; a new manager per call had no sessions, and every
     * streaming_session_id was "not found or expired".
     */
    static forTool(toolName: string, owner?: object): StreamingManager;
}
/**
 * Utility function to check if a tool should use streaming
 */
export declare function shouldUseStreaming(toolName: string, requestedLimit: number, estimatedTotal?: number, customThreshold?: number | StreamingConfig): boolean;
/**
 * Create a standardized streaming response
 */
export declare function createStreamingResponse(chunk: StreamingChunk, includeMetadata?: boolean, extra?: Record<string, unknown>): {
    content: {
        type: string;
        text: string;
    }[];
    isError: boolean;
};
//# sourceMappingURL=streaming-manager.d.ts.map