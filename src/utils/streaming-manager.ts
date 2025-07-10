/**
 * Result Streaming Infrastructure for Firewalla MCP Server
 * Provides efficient streaming for large datasets to prevent memory exhaustion
 */

import type { PaginationParams } from './pagination.js';
import { webcrypto } from 'crypto';

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
}

/**
 * Default streaming configuration
 */
const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  chunkSize: 100,
  maxChunks: 0, // Unlimited
  sessionTimeoutMs: 300000, // 5 minutes
  enableCompression: false, // Disabled for simplicity
  maxMemoryThreshold: 50 * 1024 * 1024, // 50MB
  includeMetadata: true,
};

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
export type StreamingOperation<T = any> = (
  params: PaginationParams & { continuationToken?: string }
) => Promise<{
  data: T[];
  hasMore: boolean;
  nextCursor?: string | null;
  total?: number;
}>;

/**
 * Manager class for handling result streaming
 */
export class StreamingManager {
  private config: StreamingConfig;
  private activeSessions: Map<string, StreamingSession> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<StreamingConfig> = {}) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };

    // Start cleanup timer for expired sessions
    this.startSessionCleanup();
  }

  /**
   * Create a new streaming session
   */
  createStreamingSession(
    toolName: string,
    originalParams: any,
    config?: Partial<StreamingConfig>
  ): StreamingSession {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: StreamingSession = {
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
    return session;
  }

  /**
   * Get the next chunk of data for a streaming session
   */
  async getNextChunk<T = any>(
    sessionId: string,
    operation: StreamingOperation<T>
  ): Promise<StreamingChunk | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Streaming session ${sessionId} not found or expired`);
    }

    if (session.isComplete) {
      throw new Error(`Streaming session ${sessionId} is already complete`);
    }

    // Check session timeout
    const now = new Date();
    const timeSinceLastActivity =
      now.getTime() - session.lastActivity.getTime();
    if (timeSinceLastActivity > session.config.sessionTimeoutMs) {
      this.expireSession(sessionId);
      throw new Error(
        `Streaming session ${sessionId} has expired due to inactivity`
      );
    }

    // Check chunk limit
    if (
      session.config.maxChunks > 0 &&
      session.chunksStreamed >= session.config.maxChunks
    ) {
      this.completeSession(sessionId);
      throw new Error(
        `Streaming session ${sessionId} has reached maximum chunk limit`
      );
    }

    const chunkStartTime = Date.now();

    try {
      // Prepare parameters for this chunk
      const chunkParams: PaginationParams = {
        limit: session.config.chunkSize,
        cursor: session.continuationToken,
        ...session.originalParams,
      };

      // Execute the operation to get data
      const result = await operation(chunkParams);

      // Update session state
      session.chunksStreamed++;
      session.itemsStreamed += result.data.length;
      session.lastActivity = now;
      session.continuationToken = result.nextCursor || undefined;

      // Check if this is the final chunk
      const isFinalChunk = !result.hasMore || result.data.length === 0;
      if (isFinalChunk) {
        this.completeSession(sessionId);
      }

      const processingTime = Date.now() - chunkStartTime;

      // Create chunk response
      const chunk: StreamingChunk = {
        chunkId: session.chunksStreamed,
        sessionId,
        data: result.data,
        count: result.data.length,
        isFinalChunk,
        nextContinuationToken: result.nextCursor,
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
    } catch (error) {
      // Mark session as failed and clean up
      this.expireSession(sessionId);
      throw error;
    }
  }

  /**
   * Start a new streaming operation
   */
  async startStreaming<T = any>(
    toolName: string,
    operation: StreamingOperation<T>,
    originalParams: any,
    config?: Partial<StreamingConfig>
  ): Promise<{
    sessionId: string;
    firstChunk: StreamingChunk;
  }> {
    const session = this.createStreamingSession(
      toolName,
      originalParams,
      config
    );
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
  async continueStreaming<T = any>(
    sessionId: string,
    operation: StreamingOperation<T>
  ): Promise<StreamingChunk | null> {
    return this.getNextChunk(sessionId, operation);
  }

  /**
   * Get information about an active streaming session
   */
  getSessionInfo(sessionId: string): StreamingSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * List all active streaming sessions
   */
  getActiveSessions(): StreamingSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Complete a streaming session
   */
  completeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isComplete = true;
      session.lastActivity = new Date();

      // Clean up completed session after a short delay
      setTimeout(() => {
        this.activeSessions.delete(sessionId);
      }, 60000); // Keep for 1 minute for reference
    }
  }

  /**
   * Expire a streaming session due to timeout or error
   */
  expireSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  /**
   * Cancel a streaming session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.expireSession(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Clean up expired sessions
   */
  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of this.activeSessions.entries()) {
        const timeSinceLastActivity = now - session.lastActivity.getTime();
        if (timeSinceLastActivity > session.config.sessionTimeoutMs) {
          expiredSessions.push(sessionId);
        }
      }

      expiredSessions.forEach(sessionId => {
        this.expireSession(sessionId);
      });
    }, 60000); // Check every minute
  }

  /**
   * Stop the streaming manager and clean up resources
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.activeSessions.clear();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    // Use crypto.randomUUID if available, fallback to current implementation
    if (webcrypto && webcrypto.randomUUID) {
      return `stream_${webcrypto.randomUUID()}`;
    }
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `stream_${timestamp}_${random}`;
  }

  /**
   * Estimate remaining items in the stream
   */
  private estimateRemainingItems(
    result: { data: any[]; hasMore: boolean; total?: number },
    session: StreamingSession
  ): number | undefined {
    if (result.total !== undefined) {
      return Math.max(0, result.total - session.itemsStreamed);
    }

    // If no total is available, we can't estimate
    return undefined;
  }

  /**
   * Get current memory usage (simplified)
   */
  private getMemoryUsage(): number | undefined {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        return process.memoryUsage().heapUsed;
      }
    } catch (_error) {
      // Memory usage not available
    }
    return undefined;
  }

  /**
   * Create a streaming configuration optimized for specific tool types
   */
  static getConfigForTool(toolName: string): Partial<StreamingConfig> {
    const configs: Record<string, Partial<StreamingConfig>> = {
      // Flow data tools - large datasets, smaller chunks
      get_flow_data: {
        chunkSize: 50,
        maxChunks: 0,
        sessionTimeoutMs: 600000, // 10 minutes
        maxMemoryThreshold: 100 * 1024 * 1024, // 100MB
      },
      search_flows: {
        chunkSize: 75,
        maxChunks: 0,
        sessionTimeoutMs: 300000, // 5 minutes
        maxMemoryThreshold: 75 * 1024 * 1024, // 75MB
      },

      // Device tools - medium datasets
      get_device_status: {
        chunkSize: 100,
        maxChunks: 0,
        sessionTimeoutMs: 180000, // 3 minutes
        maxMemoryThreshold: 50 * 1024 * 1024, // 50MB
      },
      search_devices: {
        chunkSize: 100,
        maxChunks: 0,
        sessionTimeoutMs: 180000,
        maxMemoryThreshold: 50 * 1024 * 1024,
      },

      // Alarm tools - smaller datasets, larger chunks
      get_active_alarms: {
        chunkSize: 150,
        maxChunks: 20, // Limit alarms to reasonable number
        sessionTimeoutMs: 120000, // 2 minutes
        maxMemoryThreshold: 25 * 1024 * 1024, // 25MB
      },
      search_alarms: {
        chunkSize: 150,
        maxChunks: 20,
        sessionTimeoutMs: 120000,
        maxMemoryThreshold: 25 * 1024 * 1024,
      },

      // Rule tools - medium datasets
      get_network_rules: {
        chunkSize: 100,
        maxChunks: 50,
        sessionTimeoutMs: 180000,
        maxMemoryThreshold: 30 * 1024 * 1024, // 30MB
      },
    };

    return configs[toolName] || {};
  }

  /**
   * Create a streaming manager optimized for specific tool
   */
  static forTool(toolName: string): StreamingManager {
    const toolConfig = StreamingManager.getConfigForTool(toolName);
    return new StreamingManager(toolConfig);
  }
}

/**
 * Global streaming manager with default configuration
 */
export const globalStreamingManager = new StreamingManager();

// Default streaming threshold - can be overridden via environment variable
const DEFAULT_STREAMING_THRESHOLD = 
  parseInt(process.env.FIREWALLA_STREAMING_THRESHOLD || '500', 10);

/**
 * Utility function to check if a tool should use streaming
 */
export function shouldUseStreaming(
  toolName: string,
  requestedLimit: number,
  estimatedTotal?: number,
  customThreshold?: number
): boolean {
  // Use streaming for large requests or when total is estimated to be large
  const streamingThreshold = customThreshold ?? DEFAULT_STREAMING_THRESHOLD;

  if (requestedLimit > streamingThreshold) {
    return true;
  }

  if (estimatedTotal !== undefined && estimatedTotal > streamingThreshold) {
    return true;
  }

  // Specific tools that benefit from streaming
  const streamingTools = [
    'get_flow_data',
    'search_flows',
    'get_device_status',
    'search_devices',
    'search_alarms',
  ];

  return streamingTools.includes(toolName);
}

/**
 * Create a standardized streaming response
 */
export function createStreamingResponse(
  chunk: StreamingChunk,
  includeMetadata = true
) {
  const response: any = {
    streaming: true,
    sessionId: chunk.sessionId,
    chunkId: chunk.chunkId,
    data: chunk.data,
    count: chunk.count,
    isFinalChunk: chunk.isFinalChunk,
    nextContinuationToken: chunk.nextContinuationToken,
    timestamp: chunk.timestamp,
  };

  if (includeMetadata) {
    response.metadata = chunk.metadata;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
    isError: false,
  };
}
