/**
 * MCP_TEST_MODE=true replaces the Firewalla credentials with dummy ones, so
 * the server refuses it when NODE_ENV is production: it exits 1 with one line
 * on stderr naming both variables, and writes nothing to stdout, which
 * carries the stdio transport's JSON-RPC. Test mode with any other NODE_ENV,
 * and NODE_ENV=production without test mode, start as before.
 *
 * The built server (dist/server.js) is spawned the way an MCP client starts
 * it, so no coverage transform writes to its stderr; dist/ must be built from
 * the current src/. It runs in an empty directory, so no .env file is read.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SERVER = path.join(ROOT, 'dist/server.js');
const INITIALIZE = {
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test-mode-production', version: '0' },
  },
};
const DUMMY_CREDENTIALS = {
  FIREWALLA_MSP_TOKEN: 'dummy-token',
  FIREWALLA_MSP_ID: 'example.invalid',
};

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

let cwd: string;

/**
 * Starts the server with only `vars` (and PATH) in its environment. With
 * `initialize`, sends an initialize request and closes stdin once stdout has
 * a line, which stops the server; without, closes stdin at once.
 */
function run(vars: Record<string, string>, initialize: boolean): Promise<Run> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = { ...vars };
    if (process.env.PATH !== undefined) {
      env.PATH = process.env.PATH;
    }
    const child = spawn(process.execPath, [SERVER], { cwd, env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not exit within 8 s; stderr: ${stderr}`));
    }, 8000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (initialize && stdout.includes('\n')) {
        child.stdin.end();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    // EPIPE when the server has already exited; its exit code and output
    // still say what happened
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        reject(error);
      }
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (initialize) {
      child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
    } else {
      child.stdin.end();
    }
  });
}

function lines(text: string): string[] {
  return text.split('\n').filter(line => line.trim());
}

/** The stderr lines that are JSON log entries; anything else is skipped */
function logEntries(stderr: string): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  for (const line of lines(stderr)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // not a log entry
    }
  }
  return entries;
}

/** stdout holds nothing but JSON-RPC, and answers the initialize request */
function expectInitializeAnswered(result: Run): void {
  const messages = lines(result.stdout).map(line => JSON.parse(line));
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    expect(message.jsonrpc).toBe('2.0');
  }
  expect(messages[0].id).toBe(0);
  expect(messages[0].result.serverInfo.name).toBe('firewalla-mcp-server');
}

beforeAll(() => {
  if (!existsSync(SERVER)) {
    throw new Error(`${SERVER} is missing: run npm run build first`);
  }
  const source = path.join(ROOT, 'src/config/config.ts');
  const built = path.join(ROOT, 'dist/config/config.js');
  if (statSync(source).mtimeMs > statSync(built).mtimeMs) {
    throw new Error(
      'dist/ is older than src/config/config.ts: run npm run build first'
    );
  }
  cwd = mkdtempSync(path.join(tmpdir(), 'test-mode-production-'));
});

afterAll(() => {
  if (cwd) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe('MCP_TEST_MODE=true with NODE_ENV=production', () => {
  it.each(['production', ' Production ', 'PRODUCTION'])(
    'exits 1 with one line on stderr and nothing on stdout (NODE_ENV=%j)',
    async nodeEnv => {
      const result = await run(
        { MCP_TEST_MODE: 'true', NODE_ENV: nodeEnv },
        false
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      const errLines = lines(result.stderr);
      expect(errLines).toHaveLength(1);
      expect(errLines[0]).toContain('refusing to start');
      expect(errLines[0]).toContain('MCP_TEST_MODE=true');
      expect(errLines[0]).toContain('NODE_ENV=production');
      expect(errLines[0]).toContain('Unset MCP_TEST_MODE');
      expect(errLines[0]).toContain('set NODE_ENV to another value');
    }
  );
});

describe('test mode with another NODE_ENV, and production without it', () => {
  it.each([
    ['development', { MCP_TEST_MODE: 'true', NODE_ENV: 'development' }],
    ['unset', { MCP_TEST_MODE: 'true' }],
  ])(
    'starts in test mode with NODE_ENV %s and answers initialize',
    async (_label, vars) => {
      const result = await run(vars, true);

      expect(result.code).toBe(0);
      expectInitializeAnswered(result);
      expect(result.stderr).not.toContain('refusing to start');
      expect(logEntries(result.stderr).map(entry => entry.message)).toContain(
        'Running in test mode - using dummy credentials'
      );
    }
  );

  it('starts with NODE_ENV=production without test mode', async () => {
    const result = await run(
      { NODE_ENV: 'production', ...DUMMY_CREDENTIALS },
      true
    );

    expect(result.code).toBe(0);
    expectInitializeAnswered(result);
    expect(result.stderr).not.toContain('refusing to start');
    expect(result.stderr).not.toContain('Running in test mode');
  });
});
