/**
 * With MCP_TRANSPORT=http, the server refuses to start on an address other
 * than loopback unless MCP_HTTP_BEARER_TOKEN is set, or
 * MCP_HTTP_ALLOW_NO_TOKEN=true says the network is trusted: the Docker image
 * listens on 0.0.0.0, so `docker run -p 3000:3000` without a token served
 * anyone who could reach the port. It also refuses a token shorter than 16
 * characters. A refusal is one line on stderr and exit code 1, before
 * anything listens, with nothing on stdout. Loopback addresses and the stdio
 * transport start as before.
 *
 * Each case runs FirewallaMCPServer's startHttpTransport with process.exit
 * and fs.writeSync stubbed, as tests/config/test-mode-production.test.ts
 * does, so nothing is built or spawned. A server that starts listens on an
 * ephemeral port and is closed afterwards; nothing is sent to Firewalla.
 */

import fs from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { Server as NetServer, type AddressInfo } from 'node:net';
import { FirewallaMCPServer } from '../../src/server';
import { config } from '../../src/config/config';
import { logger } from '../../src/monitoring/logger';
import {
  httpStartRefusal,
  parseHttpSecurityConfig,
} from '../../src/http-security';

const VARS = [
  'MCP_HTTP_HOST',
  'MCP_HTTP_BEARER_TOKEN',
  'MCP_HTTP_ALLOW_NO_TOKEN',
] as const;

type Vars = Partial<Record<(typeof VARS)[number], string>>;

/** A token as the README suggests making one: openssl rand -hex 32 */
const TOKEN = '0123456789abcdef'.repeat(4);

/** Thrown by the process.exit stub, so startup stops where the server would */
class Exited extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

interface Start {
  exitCode?: number;
  /** Lines written with fs.writeSync(2, ...) */
  stderrLines: string[];
  /** Text written to process.stderr, the logger's JSON lines excluded */
  stderrText: string;
  stdoutWrites: number;
  /** The address passed to listen, and the address bound, when it listened */
  listenHost?: string;
  address?: AddressInfo;
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  httpServer.closeAllConnections();
  return new Promise(resolve => httpServer.close(() => resolve()));
}

/** Runs startHttpTransport with `vars` set and reports what it did */
async function startHttp(vars: Vars): Promise<Start> {
  for (const name of VARS) {
    const value = vars[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  config.transport.port = 0; // any free port

  // The logger writes its JSON lines to process.stderr; keep them out of
  // stderrText
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  const stderrLines: string[] = [];
  jest.spyOn(fs, 'writeSync').mockImplementation(((
    fd: number,
    data: unknown
  ) => {
    if (fd === 2) {
      stderrLines.push(String(data));
    }
    return String(data).length;
  }) as typeof fs.writeSync);
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exited(code);
  }) as typeof process.exit);
  const stdout = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const stderr = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true);
  const listen = jest.spyOn(NetServer.prototype, 'listen');

  const result: Start = { stderrLines, stderrText: '', stdoutWrites: 0 };
  try {
    await (new FirewallaMCPServer() as any).startHttpTransport();
  } catch (error) {
    if (!(error instanceof Exited)) {
      throw error;
    }
    result.exitCode = error.code;
  }

  if (listen.mock.calls.length > 0) {
    const httpServer = listen.mock.contexts[0] as HttpServer;
    result.listenHost = listen.mock.calls[0][1] as unknown as string;
    result.address = httpServer.address() as AddressInfo;
    await closeHttpServer(httpServer);
  }
  result.stdoutWrites = stdout.mock.calls.length;
  result.stderrText = stderr.mock.calls.map(call => String(call[0])).join('');
  jest.restoreAllMocks();
  return result;
}

function expectRefused(result: Start): string {
  expect(result.exitCode).toBe(1);
  expect(result.listenHost).toBeUndefined();
  expect(result.stdoutWrites).toBe(0);
  expect(result.stderrLines).toHaveLength(1);
  const line = result.stderrLines[0];
  expect(line.endsWith('\n')).toBe(true);
  expect(line.trim().split('\n')).toHaveLength(1);
  expect(line).toMatch(/^firewalla-mcp-server: refusing to start: /);
  expect(result.stderrText).toBe('');
  return line;
}

function expectStarted(result: Start, host: string): void {
  expect(result.exitCode).toBeUndefined();
  expect(result.stderrLines).toEqual([]);
  expect(result.listenHost).toBe(host);
  expect(result.address?.address).toBe(host);
  expect(result.stdoutWrites).toBe(0);
}

describe('MCP_TRANSPORT=http startup and MCP_HTTP_BEARER_TOKEN', () => {
  const saved = {
    env: Object.fromEntries(VARS.map(name => [name, process.env[name]])),
    type: config.transport.type,
    port: config.transport.port,
    registered: (FirewallaMCPServer as any).signalHandlersRegistered,
  };

  beforeEach(() => {
    // Keep the test process free of the server's SIGINT/SIGTERM handlers
    (FirewallaMCPServer as any).signalHandlersRegistered = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of VARS) {
      if (saved.env[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved.env[name];
      }
    }
    config.transport.type = saved.type;
    config.transport.port = saved.port;
    (FirewallaMCPServer as any).signalHandlersRegistered = saved.registered;
  });

  it('refuses MCP_HTTP_HOST=0.0.0.0, as the Docker image sets: one line naming the variables, exit 1, nothing on stdout', async () => {
    const line = expectRefused(await startHttp({ MCP_HTTP_HOST: '0.0.0.0' }));

    expect(line).toContain('MCP_HTTP_HOST=0.0.0.0');
    expect(line).toContain('MCP_HTTP_BEARER_TOKEN');
    expect(line).toContain('openssl rand -hex 32');
    expect(line).toContain('MCP_HTTP_ALLOW_NO_TOKEN=true');
  });

  it.each([
    ['::', '::'],
    ['[::]', '::'],
    ['a LAN IPv4 address', '192.168.1.10'],
    ['a LAN IPv6 address', 'fd00::10'],
    ['a host name', 'mcp.example.lan'],
  ])('refuses %s', async (_label, host) => {
    const line = expectRefused(await startHttp({ MCP_HTTP_HOST: host }));
    expect(line).toContain(`MCP_HTTP_HOST=${host.replace(/[[\]]/g, '')}`);
  });

  it('treats an empty or blank MCP_HTTP_BEARER_TOKEN as not set', async () => {
    for (const token of ['', '   ']) {
      expectRefused(
        await startHttp({ MCP_HTTP_HOST: '0.0.0.0', MCP_HTTP_BEARER_TOKEN: token })
      );
    }
  });

  it('refuses MCP_HTTP_ALLOW_NO_TOKEN set to anything but true', async () => {
    for (const value of ['', 'false', '1', 'yes']) {
      expectRefused(
        await startHttp({
          MCP_HTTP_HOST: '0.0.0.0',
          MCP_HTTP_ALLOW_NO_TOKEN: value,
        })
      );
    }
  });

  it.each([
    ['127.0.0.1', '127.0.0.1', '127.0.0.1'],
    ['::1', '::1', '::1'],
    ['[::1]', '[::1]', '::1'],
  ])('starts on %s', async (_label, host, bound) => {
    expectStarted(await startHttp({ MCP_HTTP_HOST: host }), bound);
  });

  it('starts on 127.0.0.1 when MCP_HTTP_HOST is not set', async () => {
    const result = await startHttp({});
    expectStarted(result, '127.0.0.1');
    expect(result.stderrText).toBe('');
  });

  it('starts on localhost', async () => {
    const result = await startHttp({ MCP_HTTP_HOST: 'localhost' });
    expect(result.exitCode).toBeUndefined();
    expect(result.stderrLines).toEqual([]);
    expect(result.listenHost).toBe('localhost');
  });

  it('starts on 0.0.0.0 with a token, without the warning', async () => {
    const result = await startHttp({
      MCP_HTTP_HOST: '0.0.0.0',
      MCP_HTTP_BEARER_TOKEN: TOKEN,
    });
    expectStarted(result, '0.0.0.0');
    expect(result.stderrText).toBe('');
  });

  it.each(['true', ' TRUE '])(
    'starts on 0.0.0.0 with MCP_HTTP_ALLOW_NO_TOKEN=%j, and warns on stderr',
    async value => {
      const result = await startHttp({
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_ALLOW_NO_TOKEN: value,
      });
      expectStarted(result, '0.0.0.0');

      // Written to stderr directly, so LOG_LEVEL cannot hide it
      const warning = result.stderrText;
      expect(warning.trim().split('\n')).toHaveLength(1);
      expect(warning).toMatch(/^firewalla-mcp-server: WARNING: /);
      expect(warning).toContain('MCP_HTTP_ALLOW_NO_TOKEN=true');
      expect(warning).toContain(`0.0.0.0 port ${result.address?.port}`);
      expect(warning).toContain('MCP_HTTP_BEARER_TOKEN');
    }
  );

  it('refuses a token shorter than 16 characters, wherever it listens', async () => {
    for (const host of ['0.0.0.0', '127.0.0.1']) {
      for (const token of ['x', 's3cret', '0123456789abcde']) {
        const line = expectRefused(
          await startHttp({
            MCP_HTTP_HOST: host,
            MCP_HTTP_BEARER_TOKEN: token,
          })
        );
        const unit = token.length === 1 ? 'character' : 'characters';
        expect(line).toContain(
          `MCP_HTTP_BEARER_TOKEN is ${token.length} ${unit} long`
        );
        expect(line).toContain('at least 16');
        expect(line).toContain('openssl rand -hex 32');
      }
    }
  });

  it('accepts a token of 16 characters', async () => {
    expectStarted(
      await startHttp({
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_BEARER_TOKEN: '0123456789abcdef',
      }),
      '0.0.0.0'
    );
  });

  it('leaves the stdio transport alone, with MCP_HTTP_HOST=0.0.0.0 as in the Docker image', async () => {
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    delete process.env.MCP_HTTP_BEARER_TOKEN;
    delete process.env.MCP_HTTP_ALLOW_NO_TOKEN;
    config.transport.type = 'stdio';
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const stdio = jest
      .spyOn(FirewallaMCPServer.prototype as any, 'startStdioTransport')
      .mockResolvedValue(undefined);
    const exit = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Exited(code);
    }) as typeof process.exit);
    const writeSync = jest.spyOn(fs, 'writeSync');
    const listen = jest.spyOn(NetServer.prototype, 'listen');

    await new FirewallaMCPServer().start();

    expect(stdio).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(writeSync).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});

describe('httpStartRefusal', () => {
  // macOS has only 127.0.0.1 on its loopback interface, so the rest of
  // 127.0.0.0/8 is checked here without listening
  it('needs no token on any 127.0.0.0/8 address', () => {
    for (const host of ['127.0.0.2', '127.1.2.3', '127.255.255.254']) {
      expect(
        httpStartRefusal(parseHttpSecurityConfig({ MCP_HTTP_HOST: host }))
      ).toBeUndefined();
    }
    expect(
      httpStartRefusal(parseHttpSecurityConfig({ MCP_HTTP_HOST: '128.0.0.1' }))
    ).toContain('MCP_HTTP_HOST=128.0.0.1');
  });
});
