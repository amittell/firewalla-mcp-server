/**
 * @fileoverview Stdio transport lifecycle: exit when the client goes away.
 *
 * The MCP stdio lifecycle has the client shut the server down by closing the
 * server's stdin, and send SIGTERM only after a grace period. The SDK's
 * StdioServerTransport does not listen for the end of stdin, and the server
 * keeps interval timers alive (rate-limit and streaming-session cleanup), so
 * without this the process outlives its client until the client gives up.
 */
import type { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
export interface StdioExitOptions {
    /** The stream the client writes to; `process.stdin` in production. */
    stdin: Pick<EventEmitter, 'once'>;
    /** Runs before exit, e.g. closing the MCP server and its transport. */
    cleanup: () => Promise<void>;
    /** Exits the process; `process.exit` in production. */
    exit: (code: number) => void;
    /** Streams whose queued writes are flushed before exit. */
    flush?: Array<Pick<Writable, 'write'>>;
    /**
     * The server's output streams (stdout and stderr in production). Writing to
     * one after the client has exited fails with EPIPE, emitted as an `error`
     * event; with no listener Node treats that as uncaught and crashes with a
     * stack trace. Any error on one of these starts the same shutdown.
     */
    outputs?: Array<Pick<EventEmitter, 'on'>>;
    /** Upper bound on cleanup plus flush before exiting anyway. */
    timeoutMs?: number;
}
/**
 * Exits the process once stdin ends or closes, after running `cleanup` and
 * flushing `flush`. Exits 0 on a clean shutdown and 1 if cleanup throws or
 * the shutdown takes longer than `timeoutMs`.
 *
 * @returns A trigger that starts the same shutdown for another reason (for
 * example the transport closing); only the first trigger has any effect.
 */
export declare function exitWhenStdioCloses(options: StdioExitOptions): (reason: string) => void;
//# sourceMappingURL=stdio-lifecycle.d.ts.map