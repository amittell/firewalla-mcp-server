/**
 * With MCP_TEST_MODE=true the server still writes nothing but JSON-RPC to
 * stdout, which carries the stdio transport: its test-mode notice goes to
 * stderr. The server module is loaded fresh with test mode on, as `node
 * dist/server.js` loads it, while stdout, stderr and the console methods that
 * print to stdout are captured; then it answers initialize and tools/list
 * over a stdio transport writing to the captured stdout.
 */

import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const REQUESTS = [
  {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-mode-stdout', version: '0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
];

/** Replaces a stream's write with one that records what it was given */
function capture(stream: NodeJS.WriteStream): string[] {
  const written: string[] = [];
  jest.spyOn(stream, 'write').mockImplementation(((
    chunk: unknown,
    ...rest: unknown[]
  ) => {
    written.push(String(chunk));
    const callback = rest.find(arg => typeof arg === 'function') as
      (() => void) | undefined;
    callback?.();
    return true;
  }) as typeof stream.write);
  return written;
}

async function until(condition: () => boolean, ms = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) {
      throw new Error(`condition not met within ${ms} ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('MCP_TEST_MODE=true', () => {
  const saved = process.env.MCP_TEST_MODE;

  afterEach(() => {
    jest.restoreAllMocks();
    if (saved === undefined) {
      delete process.env.MCP_TEST_MODE;
    } else {
      process.env.MCP_TEST_MODE = saved;
    }
  });

  it('writes nothing but JSON-RPC to stdout, and its notice to stderr', async () => {
    process.env.MCP_TEST_MODE = 'true';
    const stdout = capture(process.stdout);
    const stderr = capture(process.stderr);
    // In a real process these print to stdout
    const consoleSpies = (['log', 'info', 'debug'] as const).map(method =>
      jest.spyOn(console, method).mockImplementation(() => undefined)
    );

    let FirewallaMCPServer: any;
    jest.isolateModules(() => {
      ({ FirewallaMCPServer } = require('../../src/server'));
    });
    const mcp = new FirewallaMCPServer();
    const stdin = new PassThrough();
    await mcp.server.connect(new StdioServerTransport(stdin, process.stdout));

    for (const request of REQUESTS) {
      stdin.write(`${JSON.stringify(request)}\n`);
    }
    const lines = () =>
      stdout
        .join('')
        .split('\n')
        .filter(line => line.trim());
    await until(() => lines().length >= 2);
    await mcp.server.close();
    const out = lines();
    const err = stderr.join('');
    // Read before restoring: restoring a spy clears its calls
    const consoleCalls = consoleSpies.map(spy => spy.mock.calls.slice());
    jest.restoreAllMocks();

    expect(out).toHaveLength(2);
    const messages = out.map(line => JSON.parse(line));
    for (const message of messages) {
      expect(message.jsonrpc).toBe('2.0');
    }
    expect(messages.map(message => message.id)).toEqual([0, 1]);
    expect(messages[0].result.serverInfo.name).toBe('firewalla-mcp-server');
    expect(messages[1].result.tools.length).toBeGreaterThan(0);

    expect(consoleCalls).toEqual([[], [], []]);
    expect(err).toContain('Running in test mode - using dummy credentials');
  });
});
