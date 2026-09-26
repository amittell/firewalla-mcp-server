/**
 * MCP_TEST_MODE=true replaces the Firewalla credentials with dummy ones, so
 * the server refuses it when NODE_ENV is production: it writes one line to
 * stderr naming both variables and exits 1, and writes nothing to stdout,
 * which carries the stdio transport's JSON-RPC. Test mode with any other
 * NODE_ENV, and NODE_ENV=production without test mode, load as before.
 *
 * src/config/config.ts runs getConfig() when it is first imported, so each
 * case loads it in isolation with the variables under test. The refusal's
 * line goes out with fs.writeSync(2, ...) and process.exit(1); both are
 * stubbed, so nothing is built or spawned and a clean checkout can run it.
 */

import fs from 'node:fs';

const VARS = [
  'MCP_TEST_MODE',
  'NODE_ENV',
  'FIREWALLA_MSP_TOKEN',
  'FIREWALLA_MSP_ID',
] as const;

/** Thrown by the process.exit stub, so loading stops where the server would */
class Exited extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

interface Load {
  config?: { mspToken: string; mspId: string };
  exitCode?: number;
  stderrWrites: string[];
  stdoutWrites: number;
}

/** Loads src/config/config.ts with `vars` set and reports what it did */
function load(vars: Partial<Record<(typeof VARS)[number], string>>): Load {
  for (const name of VARS) {
    const value = vars[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  const stderrWrites: string[] = [];
  jest.spyOn(fs, 'writeSync').mockImplementation(((
    fd: number,
    data: unknown
  ) => {
    if (fd === 2) {
      stderrWrites.push(String(data));
    }
    return String(data).length;
  }) as typeof fs.writeSync);
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exited(code);
  }) as typeof process.exit);
  const stdout = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);

  const result: Load = { stderrWrites, stdoutWrites: 0 };
  try {
    jest.isolateModules(() => {
      result.config = require('../../src/config/config').config;
    });
  } catch (error) {
    if (!(error instanceof Exited)) {
      throw error;
    }
    result.exitCode = error.code;
  }
  result.stdoutWrites = stdout.mock.calls.length;
  jest.restoreAllMocks();
  return result;
}

describe('MCP_TEST_MODE with NODE_ENV=production', () => {
  const saved = Object.fromEntries(VARS.map(name => [name, process.env[name]]));

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of VARS) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  });

  it.each(['production', ' Production ', 'PRODUCTION'])(
    'refuses to start with NODE_ENV=%j: one line on stderr, exit 1, nothing on stdout',
    nodeEnv => {
      const result = load({ MCP_TEST_MODE: 'true', NODE_ENV: nodeEnv });

      expect(result.exitCode).toBe(1);
      expect(result.config).toBeUndefined();
      expect(result.stderrWrites).toHaveLength(1);
      const line = result.stderrWrites[0];
      expect(line.endsWith('\n')).toBe(true);
      expect(line.trim().split('\n')).toHaveLength(1);
      expect(line).toContain('MCP_TEST_MODE=true');
      expect(line).toContain('NODE_ENV=production');
      expect(line).toContain('development');
      expect(result.stdoutWrites).toBe(0);
    }
  );

  it.each([
    ['development', 'development'],
    ['unset', undefined],
  ])(
    'loads the dummy settings in test mode with NODE_ENV %s',
    (_label, nodeEnv) => {
      const result = load({ MCP_TEST_MODE: 'true', NODE_ENV: nodeEnv });

      expect(result.exitCode).toBeUndefined();
      expect(result.stderrWrites).toEqual([]);
      expect(result.config?.mspToken).toBe('test-token');
      expect(result.config?.mspId).toBe('test.firewalla.net');
    }
  );

  it('loads the real settings with NODE_ENV=production and no test mode', () => {
    const result = load({
      // 'false', not unset: an unset variable could be filled from a .env file
      MCP_TEST_MODE: 'false',
      NODE_ENV: 'production',
      FIREWALLA_MSP_TOKEN: 'dummy-token',
      FIREWALLA_MSP_ID: 'example.firewalla.net',
    });

    expect(result.exitCode).toBeUndefined();
    expect(result.stderrWrites).toEqual([]);
    expect(result.config?.mspToken).toBe('dummy-token');
    expect(result.config?.mspId).toBe('example.firewalla.net');
  });
});
