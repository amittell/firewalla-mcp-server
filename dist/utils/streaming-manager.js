/**
 * Result Streaming Infrastructure for Firewalla MCP Server
 * Provides efficient streaming for large datasets to prevent memory exhaustion
 */
import { randomUUID } from 'crypto';
/**
 * Default streaming configuration
 */
const DEFAULT_STREAMING_CONFIG = {
    chunkSize: 100,
    maxChunks: 0, // Unlimited
    sessionTimeoutMs: 300000, // 5 minutes
    enableCompression: false, // Disabled for simplicity
    maxMemoryThreshold: 50 * 1024 * 1024, // 50MB
    includeMetadata: true,
    streamingThreshold: parseInt(process.env.FIREWALLA_STREAMING_THRESHOLD || '500', 10),
};
/**
 * A session that cannot give another chunk: not found (never started, or
 * removed), complete (its final chunk was returned), expired (idle longer than
 * its sessionTimeoutMs) or at its maxChunks
 */
export class StreamingSessionError extends Error {
    constructor(message, reason) {
        super(message);
        this.reason = reason;
        this.name = 'StreamingSessionError';
    }
}
/** forTool's managers, by tool name, for callers that give no owner */
const sharedManagers = new Map();
/** forTool's managers per owner; they go when the owner does */
const managersByOwner = new WeakMap();
/**
 * Manager class for handling result streaming
 */
export class StreamingManager {
    constructor(config = {}) {
        this.activeSessions = new Map();
        /** Per session, the chunk read in progress or queued last */
        this.chunkQueues = new Map();
        this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    }
    /**
     * Create a new streaming session
     */
    createStreamingSession(toolName, originalParams, config) {
        const sessionId = this.generateSessionId();
        const now = new Date();
        const session = {
            sessionId,
            toolName,
            chunksStreamed: 0,
            itemsStreamed: 0,
            startTime: now,
            lastActivity: now,
            isComplete: false,
            originalParams,
            config: { ...this.config, ...config },
        };
        this.activeSessions.set(sessionId, session);
        // Expired sessions are swept while any session exists
        this.startSessionCleanup();
        return session;
    }
    /**
     * Get the next chunk of data for a streaming session. Reads of one session
     * run one at a time, in the order they were asked for: each reads the
     * cursor the one before it left, so two overlapping calls get consecutive
     * chunks, not the same chunk twice. A read queued behind the final chunk
     * fails as complete.
     */
    async getNextChunk(sessionId, operation) {
        const previous = this.chunkQueues.get(sessionId) ?? Promise.resolve();
        const read = previous.then(async () => this.readNextChunk(sessionId, operation));
        // The next read waits for this one, whether it succeeds or fails
        const settled = read.then(() => undefined, () => undefined);
        this.chunkQueues.set(sessionId, settled);
        try {
            return await read;
        }
        finally {
            if (this.chunkQueues.get(sessionId) === settled) {
                this.chunkQueues.delete(sessionId);
            }
        }
    }
    /** One chunk of a session, read with the session's current cursor */
    async readNextChunk(sessionId, operation) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new StreamingSessionError(`Streaming session ${sessionId} not found or expired`, 'not_found');
        }
        if (session.isComplete) {
            throw new StreamingSessionError(`Streaming session ${sessionId} is already complete`, 'complete');
        }
        // Check session timeout
        const now = new Date();
        const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
        if (timeSinceLastActivity > session.config.sessionTimeoutMs) {
            this.expireSession(sessionId);
            throw new StreamingSessionError(`Streaming session ${sessionId} has expired due to inactivity`, 'expired');
        }
        // Check chunk limit
        if (session.config.maxChunks > 0 &&
            session.chunksStreamed >= session.config.maxChunks) {
            this.completeSession(sessionId);
            throw new StreamingSessionError(`Streaming session ${sessionId} has reached maximum chunk limit`, 'chunk_limit');
        }
        const chunkStartTime = Date.now();
        try {
            // The chunk size and the session's cursor win over the saved request
            // parameters: spread after them, a saved limit replaced the chunk size
            // and a saved cursor would restart every chunk from the same page
            const chunkParams = {
                ...session.originalParams,
                limit: session.config.chunkSize,
                cursor: session.continuationToken,
            };
            // Execute the operation to get data
            const result = await operation(chunkParams);
            // The chunk is final when there is no cursor to read on from. An empty
            // chunk with a cursor is not: the API offered another page, and a
            // final chunk that still carried nextContinuationToken contradicted
            // itself (a plain page with the same answer has has_more: true).
            const nextCursor = result.hasMore && result.nextCursor ? result.nextCursor : undefined;
            const isFinalChunk = nextCursor === undefined;
            // Update session state
            session.chunksStreamed++;
            session.itemsStreamed += result.data.length;
            session.lastActivity = now;
            session.continuationToken = nextCursor;
            if (isFinalChunk) {
                this.completeSession(sessionId);
            }
            const processingTime = Date.now() - chunkStartTime;
            // Create chunk response
            const chunk = {
                chunkId: session.chunksStreamed,
                sessionId,
                data: result.data,
                count: result.data.length,
                isFinalChunk,
                nextContinuationToken: nextCursor,
                metadata: {
                    chunkIndex: session.chunksStreamed - 1,
                    totalItemsInSession: session.itemsStreamed,
                    estimatedRemainingItems: this.estimateRemainingItems(result, session),
                    processingTimeMs: processingTime,
                    memoryUsage: this.getMemoryUsage(),
                },
                timestamp: now.toISOString(),
            };
            return chunk;
        }
        catch (error) {
            // Mark session as failed and clean up
            this.expireSession(sessionId);
            throw error;
        }
    }
    /**
     * Start a new streaming operation
     */
    async startStreaming(toolName, operation, originalParams, config) {
        const session = this.createStreamingSession(toolName, originalParams, config);
        const firstChunk = await this.getNextChunk(session.sessionId, operation);
        if (!firstChunk) {
            throw new Error('Failed to get first chunk from streaming operation');
        }
        return {
            sessionId: session.sessionId,
            firstChunk,
        };
    }
    /**
     * Continue an existing streaming session
     */
    async continueStreaming(sessionId, operation) {
        return this.getNextChunk(sessionId, operation);
    }
    /**
     * Get information about an active streaming session
     */
    getSessionInfo(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }
    /**
     * List all active streaming sessions
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Complete a streaming session
     */
    completeSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.isComplete = true;
            session.lastActivity = new Date();
            // Clean up completed session after a short delay
            const timer = setTimeout(() => {
                this.activeSessions.delete(sessionId);
            }, 60000); // Keep for 1 minute for reference
            timer.unref?.();
        }
    }
    /**
     * Expire a streaming session due to timeout or error
     */
    expireSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }
    /**
     * Cancel a streaming session
     */
    cancelSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            this.expireSession(sessionId);
            return true;
        }
        return false;
    }
    /**
     * Clean up expired sessions, every minute while any session exists. The
     * timer does not keep the process alive, and stops when no session is
     * left, so an idle manager holds no timer.
     */
    startSessionCleanup() {
        if (this.cleanupTimer) {
            return;
        }
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            const expiredSessions = [];
            for (const [sessionId, session] of this.activeSessions.entries()) {
                const timeSinceLastActivity = now - session.lastActivity.getTime();
                if (timeSinceLastActivity > session.config.sessionTimeoutMs) {
                    expiredSessions.push(sessionId);
                }
            }
            expiredSessions.forEach(sessionId => {
                this.expireSession(sessionId);
            });
            if (this.activeSessions.size === 0 && this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = undefined;
            }
        }, 60000); // Check every minute
        this.cleanupTimer.unref?.();
    }
    /**
     * Stop the streaming manager and clean up resources
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.activeSessions.clear();
    }
    /**
     * Generate a unique session ID
     */
    generateSessionId() {
        // Use crypto.randomUUID for secure random ID generation
        try {
            return `stream_${randomUUID()}`;
        }
        catch (_error) {
            // Fallback to timestamp-based ID if crypto.randomUUID is not available
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substring(2);
            return `stream_${timestamp}_${random}`;
        }
    }
    /**
     * Estimate remaining items in the stream
     */
    estimateRemainingItems(result, session) {
        if (result.total !== undefined) {
            return Math.max(0, result.total - session.itemsStreamed);
        }
        // If no total is available, we can't estimate
        return undefined;
    }
    /**
     * Get current memory usage (simplified)
     */
    getMemoryUsage() {
        try {
            if (typeof process !== 'undefined' && process.memoryUsage) {
                return process.memoryUsage().heapUsed;
            }
        }
        catch (_error) {
            // Memory usage not available
        }
        return undefined;
    }
    /**
     * Create a streaming configuration optimized for specific tool types
     */
    static getConfigForTool(toolName) {
        const configs = {
            // Flow data tools - large datasets, smaller chunks
            get_flow_data: {
                chunkSize: 50,
                maxChunks: 0,
                sessionTimeoutMs: 600000, // 10 minutes
                maxMemoryThreshold: 100 * 1024 * 1024, // 100MB
                streamingThreshold: 100, // Start streaming earlier for flow data
            },
            search_flows: {
                chunkSize: 75,
                maxChunks: 0,
                sessionTimeoutMs: 300000, // 5 minutes
                maxMemoryThreshold: 75 * 1024 * 1024, // 75MB
                streamingThreshold: 150, // Start streaming for moderate result sets
            },
            // Device tools - medium datasets
            get_device_status: {
                chunkSize: 100,
                maxChunks: 0,
                sessionTimeoutMs: 180000, // 3 minutes
                maxMemoryThreshold: 50 * 1024 * 1024, // 50MB
                streamingThreshold: 300, // Device lists can be large
            },
            search_devices: {
                chunkSize: 100,
                maxChunks: 0,
                sessionTimeoutMs: 180000,
                maxMemoryThreshold: 50 * 1024 * 1024,
                streamingThreshold: 300,
            },
            // Alarm tools - smaller datasets, larger chunks
            get_active_alarms: {
                chunkSize: 150,
                maxChunks: 20, // Limit alarms to reasonable number
                sessionTimeoutMs: 120000, // 2 minutes
                maxMemoryThreshold: 25 * 1024 * 1024, // 25MB
                streamingThreshold: 500, // Alarms typically have fewer results
            },
            search_alarms: {
                chunkSize: 150,
                maxChunks: 20,
                sessionTimeoutMs: 120000,
                maxMemoryThreshold: 25 * 1024 * 1024,
                streamingThreshold: 500,
            },
            // Rule tools - medium datasets
            get_network_rules: {
                chunkSize: 100,
                maxChunks: 50,
                sessionTimeoutMs: 180000,
                maxMemoryThreshold: 30 * 1024 * 1024, // 30MB
                streamingThreshold: 400, // Rules are typically moderate in number
            },
        };
        return configs[toolName] || {};
    }
    /**
     * The streaming manager for a tool, configured for it. The same manager is
     * returned on every call for the same tool and `owner` (for example the
     * API client), so a session started by one call can be continued by the
     * next; a new manager per call had no sessions, and every
     * streaming_session_id was "not found or expired".
     */
    static forTool(toolName, owner) {
        let managers = sharedManagers;
        if (owner) {
            managers = managersByOwner.get(owner) ?? new Map();
            managersByOwner.set(owner, managers);
        }
        let manager = managers.get(toolName);
        if (!manager) {
            manager = new StreamingManager(StreamingManager.getConfigForTool(toolName));
            managers.set(toolName, manager);
        }
        return manager;
    }
}
// Default streaming threshold - can be overridden via environment variable or config
const DEFAULT_STREAMING_THRESHOLD = DEFAULT_STREAMING_CONFIG.streamingThreshold;
/**
 * Utility function to check if a tool should use streaming
 */
export function shouldUseStreaming(toolName, requestedLimit, estimatedTotal, customThreshold) {
    // Use streaming for large requests or when total is estimated to be large
    let streamingThreshold;
    if (typeof customThreshold === 'number') {
        streamingThreshold = customThreshold;
    }
    else if (customThreshold && 'streamingThreshold' in customThreshold) {
        const { streamingThreshold: threshold } = customThreshold;
        streamingThreshold = threshold;
    }
    else {
        // Get tool-specific config or use default
        const toolConfig = StreamingManager.getConfigForTool(toolName);
        streamingThreshold =
            toolConfig.streamingThreshold ?? DEFAULT_STREAMING_THRESHOLD;
    }
    if (requestedLimit > streamingThreshold) {
        return true;
    }
    if (estimatedTotal !== undefined && estimatedTotal > streamingThreshold) {
        return true;
    }
    // Specific tools that benefit from streaming regardless of threshold
    const alwaysStreamingTools = ['get_flow_data', 'search_flows'];
    if (alwaysStreamingTools.includes(toolName) && requestedLimit > 50) {
        return true;
    }
    return false;
}
/**
 * Create a standardized streaming response
 */
export function createStreamingResponse(chunk, includeMetadata = true, extra = {}) {
    const response = {
        streaming: true,
        sessionId: chunk.sessionId,
        chunkId: chunk.chunkId,
        data: chunk.data,
        count: chunk.count,
        isFinalChunk: chunk.isFinalChunk,
        nextContinuationToken: chunk.nextContinuationToken,
        timestamp: chunk.timestamp,
        ...extra,
    };
    if (includeMetadata) {
        response.metadata = chunk.metadata;
    }
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(response),
            },
        ],
        isError: false,
    };
}
//# sourceMappingURL=streaming-manager.js.map