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
import { logger } from './monitoring/logger.js';

/** How long cleanup and output flushing may take before exiting anyway. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2000;

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

async function flushStream(stream: Pick<Writable, 'write'>): Promise<void> {
  return new Promise<void>(resolve => {
    try {
      // An empty write's callback runs once every earlier write is handed off.
      stream.write('', () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Exits the process once stdin ends or closes, after running `cleanup` and
 * flushing `flush`. Exits 0 on a clean shutdown and 1 if cleanup throws or
 * the shutdown takes longer than `timeoutMs`.
 *
 * @returns A trigger that starts the same shutdown for another reason (for
 * example the transport closing); only the first trigger has any effect.
 */
export function exitWhenStdioCloses(
  options: StdioExitOptions
): (reason: string) => void {
  const {
    stdin,
    cleanup,
    exit,
    flush = [],
    outputs = [],
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  } = options;
  let shuttingDown = false;

  const shutdown = (reason: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Stdio ${reason}, shutting down`);

    let exited = false;
    const exitOnce = (code: number): void => {
      if (!exited) {
        exited = true;
        exit(code);
      }
    };
    const timer = setTimeout(() => {
      logger.error(`Stdio shutdown did not finish in ${timeoutMs}ms, exiting`);
      exitOnce(1);
    }, timeoutMs);

    void (async () => {
      let code = 0;
      try {
        await cleanup();
      } catch (error) {
        code = 1;
        logger.error(
          'Error during stdio shutdown:',
          error instanceof Error ? error : new Error(String(error))
        );
      }
      await Promise.all(flush.map(flushStream));
      clearTimeout(timer);
      exitOnce(code);
    })();
  };

  stdin.once('end', () => shutdown('stdin ended'));
  stdin.once('close', () => shutdown('stdin closed'));
  for (const output of outputs) {
    // `on`, not `once`: logging during the shutdown can hit the same closed
    // pipe again, and that error must not crash the process either
    output.on('error', (error: NodeJS.ErrnoException) => {
      shutdown(
        error?.code === 'EPIPE' || error?.code === 'ERR_STREAM_DESTROYED'
          ? 'output closed'
          : `output failed (${error?.code ?? error?.message ?? 'unknown error'})`
      );
    });
  }
  return shutdown;
}
