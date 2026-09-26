import { EventEmitter } from 'node:events';
import { exitWhenStdioCloses } from '../../src/stdio-lifecycle';
import { logger } from '../../src/monitoring/logger';

// Resolves once `exit` has been called, or after `ms` with undefined.
function exitCode(exit: jest.Mock, ms = 1000): Promise<number | undefined> {
  return new Promise(resolve => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (exit.mock.calls.length > 0 || Date.now() - started > ms) {
        clearInterval(poll);
        resolve(exit.mock.calls[0]?.[0]);
      }
    }, 5);
  });
}

function fakeStream() {
  return {
    write: jest.fn((_chunk: string, callback?: () => void) => {
      callback?.();
      return true;
    }),
  };
}

describe('exitWhenStdioCloses', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing while stdin is open', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    exitWhenStdioCloses({ stdin, cleanup, exit });

    expect(await exitCode(exit, 50)).toBeUndefined();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('runs cleanup, flushes output, then exits 0 when stdin ends', async () => {
    const stdin = new EventEmitter();
    const order: string[] = [];
    const cleanup = jest.fn(async () => {
      order.push('cleanup');
    });
    const exit = jest.fn(() => {
      order.push('exit');
    });
    const stdout = fakeStream();
    const stderr = fakeStream();

    exitWhenStdioCloses({ stdin, cleanup, exit, flush: [stdout, stderr] });
    stdin.emit('end');

    expect(await exitCode(exit)).toBe(0);
    expect(order).toEqual(['cleanup', 'exit']);
    expect(stdout.write).toHaveBeenCalledWith('', expect.any(Function));
    expect(stderr.write).toHaveBeenCalledWith('', expect.any(Function));
  });

  it('exits 0 when stdin closes without an end event', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    exitWhenStdioCloses({ stdin, cleanup, exit });
    stdin.emit('close');

    expect(await exitCode(exit)).toBe(0);
  });

  it('shuts down once when end, close and the trigger all fire', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    const shutdown = exitWhenStdioCloses({ stdin, cleanup, exit });
    stdin.emit('end');
    stdin.emit('close');
    shutdown('transport closed');

    expect(await exitCode(exit)).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('shuts down when the returned trigger is called', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    const shutdown = exitWhenStdioCloses({ stdin, cleanup, exit });
    shutdown('transport closed');

    expect(await exitCode(exit)).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when cleanup throws', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockRejectedValue(new Error('close failed'));
    const exit = jest.fn();

    exitWhenStdioCloses({ stdin, cleanup, exit });
    stdin.emit('end');

    expect(await exitCode(exit)).toBe(1);
  });

  it('exits 1 when cleanup does not finish in time', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn(async () => new Promise<void>(() => undefined));
    const exit = jest.fn();

    exitWhenStdioCloses({ stdin, cleanup, exit, timeoutMs: 20 });
    stdin.emit('end');

    expect(await exitCode(exit)).toBe(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('does not wait on a stream whose write throws', async () => {
    const stdin = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const broken = {
      write: jest.fn(() => {
        throw new Error('write after end');
      }),
    };

    exitWhenStdioCloses({ stdin, cleanup, exit, flush: [broken] });
    stdin.emit('end');

    expect(await exitCode(exit)).toBe(0);
  });
});

describe('exitWhenStdioCloses output errors', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shuts down cleanly when an output emits EPIPE, instead of crashing', async () => {
    const stdin = new EventEmitter();
    const stdout = new EventEmitter();
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    exitWhenStdioCloses({ stdin, cleanup, exit, outputs: [stdout] });

    // With no 'error' listener, emit() would throw the error
    expect(() =>
      stdout.emit(
        'error',
        Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
      )
    ).not.toThrow();
    expect(await exitCode(exit)).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps handling errors from the same output during the shutdown', async () => {
    const stdin = new EventEmitter();
    const stderr = new EventEmitter();
    const exit = jest.fn();
    exitWhenStdioCloses({
      stdin,
      cleanup: jest.fn().mockResolvedValue(undefined),
      exit,
      outputs: [stderr],
    });
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => stderr.emit('error', epipe)).not.toThrow();
    expect(() => stderr.emit('error', epipe)).not.toThrow();
    expect(await exitCode(exit)).toBe(0);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('shuts down on any other output error too', async () => {
    const stdin = new EventEmitter();
    const stdout = new EventEmitter();
    const exit = jest.fn();
    exitWhenStdioCloses({
      stdin,
      cleanup: jest.fn().mockResolvedValue(undefined),
      exit,
      outputs: [stdout],
    });
    expect(() =>
      stdout.emit('error', Object.assign(new Error('boom'), { code: 'EIO' }))
    ).not.toThrow();
    expect(await exitCode(exit)).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      'Stdio output failed (EIO), shutting down'
    );
  });
});
