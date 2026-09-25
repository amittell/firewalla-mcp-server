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
//   node scripts/launch-smoke.mjs --docker <image> [--pull] [--expect-version <version>]
//
// Docker mode probes one image instead, the way the README's MCP client config
// runs it: `docker run -i --rm <image>` with the credentials passed by `-e` and
// no MCP_TRANSPORT, so the image's default transport has to be stdio. It also
// requires serverInfo.version to be the expected version: --expect-version when
// given and not empty, else the image tag when it is a version (`...:1.4.1`),
// else package.json's. --pull pulls the image first, outside the timeout;
// without it the image must already be local (`--pull never`), so a registry
// image cannot stand in for a local build that failed. The server does not exit
// when its stdin closes, so the container is named and removed with
// `docker rm --force` once the probe ends. Used by the Docker Build workflow.
//
// Exits 1 if any path does not answer within its timeout. Credentials are dummies;
// `initialize` is answered locally, so nothing is sent to Firewalla.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = [
  'usage: node scripts/launch-smoke.mjs <tarball>',
  '       node scripts/launch-smoke.mjs --docker <image> [--pull] [--expect-version <version>]',
].join('\n');

const argv = process.argv.slice(2);
const dockerOptions = argv.includes('--docker') ? parseDockerArgs(argv) : undefined;

let tarball;
if (!dockerOptions) {
  const tarballArg = argv[0];
  if (!tarballArg) {
    console.error(USAGE);
    process.exit(2);
  }
  tarball = path.resolve(tarballArg);
  if (!existsSync(tarball)) {
    console.error(`tarball not found: ${tarball}`);
    process.exit(2);
  }
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

function usageError(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

function parseDockerArgs(list) {
  const options = { image: '', pull: false, expectVersion: '' };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i];
    if (arg === '--pull') {
      options.pull = true;
    } else if (arg === '--docker' || arg === '--expect-version') {
      if (i + 1 >= list.length) usageError(`${arg} needs a value`);
      const value = list[++i];
      if (arg === '--docker') options.image = value.trim();
      else options.expectVersion = value.trim();
    } else {
      usageError(`unexpected argument: ${arg}`);
    }
  }
  // docker would read a reference that starts with `-` as an option.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(options.image)) {
    usageError(`not an image reference: "${options.image}"`);
  }
  return options;
}

// The version the image has to report, and where that expectation came from.
function expectedVersion(image, explicit) {
  if (explicit) return { version: explicit, source: '--expect-version' };
  const name = image.split('@')[0];
  const colon = name.lastIndexOf(':');
  const tag = colon > name.lastIndexOf('/') ? name.slice(colon + 1) : '';
  const release = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
  if (release) return { version: release[1], source: `the image tag ${tag}` };
  const { version } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return { version, source: 'package.json' };
}

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
// With `expectVersion`, an answer that reports another serverInfo.version fails.
function probe(label, command, args, { shell, timeoutMs, expectVersion }) {
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
          const { name, version } = msg.result.serverInfo;
          if (expectVersion !== undefined && version !== expectVersion) {
            finish(false, `${name} ${version}, expected version ${expectVersion}`);
          } else {
            finish(true, `${name} ${version}`);
          }
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

async function probeLaunchPaths() {
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
  return results;
}

function docker(args, options = {}) {
  return spawnSync('docker', args, { env, encoding: 'utf8', timeout: 120_000, ...options });
}

// A docker step the probe depends on: exit 1 unless it succeeded.
function dockerOrExit(args, what, options = {}) {
  const result = docker(args, options);
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : `status ${result.status}`;
    console.error(`${what} failed (${reason})${result.stderr ? `:\n${result.stderr}` : ''}`);
    process.exit(1);
  }
  return result;
}

// `docker rm --force` can lose a race with --rm removing the container itself,
// so success is the container being gone, not the rm's status.
async function removeContainer(name) {
  docker(['rm', '--force', name], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 20; attempt++) {
    const inspected = docker(['container', 'inspect', name]);
    if (inspected.status !== 0 && /no such (container|object)/i.test(inspected.stderr ?? '')) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log(`WARN  container ${name} is still present; remove it with: docker rm --force ${name}`);
}

async function probeDockerImage({ image, pull, expectVersion }) {
  const expected = expectedVersion(image, expectVersion);

  const versions = dockerOrExit(
    ['version', '--format', '{{.Client.Version}} client, {{.Server.Version}} server'],
    'docker version'
  );
  console.log(`node ${process.version} on ${process.platform}/${process.arch}, docker ${versions.stdout.trim()}`);

  if (pull) {
    dockerOrExit(['pull', image], `docker pull ${image}`, { stdio: 'inherit', timeout: 600_000 });
  }

  const inspected = dockerOrExit(
    [
      'image',
      'inspect',
      '--format',
      '{{.Id}} {{.Os}}/{{.Architecture}} created {{.Created}} digests {{json .RepoDigests}} ' +
        'label version {{index .Config.Labels "org.opencontainers.image.version"}}',
      image,
    ],
    `docker image inspect ${image} (without --pull the image must be local)`
  );
  console.log(`image ${image}`);
  console.log(`      ${inspected.stdout.trim()}`);
  console.log(`expecting serverInfo.version ${expected.version} (from ${expected.source})`);

  const name = `launch-smoke-${process.pid}-${Date.now().toString(36)}`;
  const args = ['run', '-i', '--rm', '--pull', 'never', '--name', name];
  args.push('-e', 'FIREWALLA_MSP_TOKEN', '-e', 'FIREWALLA_MSP_ID', image);
  const result = await probe('docker', 'docker', args, {
    shell: false,
    timeoutMs: 60_000,
    expectVersion: expected.version,
  });
  await removeContainer(name);
  return [result];
}

const results = dockerOptions ? await probeDockerImage(dockerOptions) : await probeLaunchPaths();

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
  if (!r.ok) {
    failed++;
    if (r.stderr) console.log(`      stderr (last 2000 chars):\n${r.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
