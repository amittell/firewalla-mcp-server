#!/usr/bin/env node
// Launch smoke test: start the server the ways users do and require an answer to
// an MCP `initialize` over stdio. Used by CI on Linux, macOS and Windows.
//
//   node scripts/launch-smoke.mjs <path-to-packed-tarball>
//
// Launch paths:
//   global-bin  `npm i -g <tarball>`, then the `firewalla-mcp-server` bin
//   npx         `npx --yes --package <tarball> firewalla-mcp-server`
//   node        `node dist/server.js` from this checkout
//
// Exits 1 if any path does not answer within its timeout. Credentials are dummies;
// `initialize` is answered locally, so nothing is sent to Firewalla.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tarballArg = process.argv[2];
if (!tarballArg) {
  console.error('usage: node scripts/launch-smoke.mjs <tarball>');
  process.exit(2);
}
const tarball = path.resolve(tarballArg);
if (!existsSync(tarball)) {
  console.error(`tarball not found: ${tarball}`);
  process.exit(2);
}

const env = {
  ...process.env,
  FIREWALLA_MSP_TOKEN: 'launch-smoke-dummy-token',
  FIREWALLA_MSP_ID: 'example.invalid',
  MCP_TRANSPORT: 'stdio',
};
delete env.FIREWALLA_BOX_ID;

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'launch-smoke', version: '0' },
  },
});

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

// `command` is a full command line when `shell` is true (the bin and npx go
// through the shell, as MCP clients launch them), otherwise an executable.
function probe(label, command, args, { shell, timeoutMs }) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, shell ? [] : args, {
      env,
      shell,
      detached: !isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (ok, detail) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      killTree(child);
      resolve({ label, ok, ms: Date.now() - started, detail, stderr: stderr.slice(-2000) });
    };
    const timer = setTimeout(
      () => finish(false, `no initialize response within ${timeoutMs / 1000}s`),
      timeoutMs
    );
    child.stdout.on('data', chunk => {
      stdout += chunk;
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 0 && msg.result?.serverInfo) {
          finish(true, `${msg.result.serverInfo.name} ${msg.result.serverInfo.version}`);
          return;
        }
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', err => finish(false, `spawn failed: ${err.message}`));
    child.on('exit', (code, signal) => {
      if (!done) finish(false, `exited before answering (code ${code}, signal ${signal})`);
    });
    child.stdin.on('error', () => {});
    child.stdin.write(`${INITIALIZE}\n`);
  });
}

function run(commandLine) {
  const result = spawnSync(commandLine, { env, shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${commandLine} failed with status ${result.status}`);
    process.exit(1);
  }
}

const quoted = `"${tarball}"`;

console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
console.log(`tarball ${tarball}`);

run(`npm install --global ${quoted}`);

const results = [];
results.push(await probe('global-bin', 'firewalla-mcp-server', [], { shell: true, timeoutMs: 30_000 }));
results.push(
  await probe('npx', `npx --yes --package ${quoted} firewalla-mcp-server`, [], {
    shell: true,
    timeoutMs: 180_000,
  })
);
results.push(
  await probe('node', process.execPath, [path.join(repoRoot, 'dist', 'server.js')], {
    shell: false,
    timeoutMs: 30_000,
  })
);

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
  if (!r.ok) {
    failed++;
    if (r.stderr) console.log(`      stderr (last 2000 chars):\n${r.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
