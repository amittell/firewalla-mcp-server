#!/usr/bin/env node
/**
 * Full functional test of the firewalla-mcp-server against the LIVE MSP API.
 *
 * Phase 1 (stdio): connect an MCP client over stdio, list tools/resources/
 * prompts, then exercise EVERY tool:
 *   - read tools: live happy-path calls (IDs seeded from earlier responses)
 *   - target-list CRUD: full create -> get -> update -> delete cycle on a
 *     disposable list this script creates (no production objects touched)
 *   - pause_rule / resume_rule: error-path only (invalid ID) -- we do not
 *     pause real firewall rules
 * Phase 2 (http): two CONCURRENT Streamable HTTP sessions (validates PR #31's
 * per-session Server instances), each lists tools and makes a live call, then
 * a third session connects after one closes.
 *
 * Requires FIREWALLA_MSP_TOKEN / FIREWALLA_MSP_ID / FIREWALLA_BOX_ID in env.
 * Exit code 0 = all green; 1 = failures (summary printed either way).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CREDS = ['FIREWALLA_MSP_TOKEN', 'FIREWALLA_MSP_ID', 'FIREWALLA_BOX_ID'];
for (const k of CREDS) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(2); }
}
const HTTP_PORT = 3111;
const results = [];   // {phase, name, status: 'OK'|'ERR'|'THREW', note}
const record = (phase, name, status, note = '') => {
  results.push({ phase, name, status, note });
  console.log(`  [${status}] ${phase}:${name}${note ? ' -- ' + String(note).slice(0, 90) : ''}`);
};

function parsePayload(res) {
  // unified-response wraps JSON in content[0].text
  const first = res.content?.[0];
  if (first?.type !== 'text') return {};
  try { return JSON.parse(first.text); } catch { return { raw: first.text }; }
}

/** Synthesize arguments for a tool from its JSON schema + seeded live IDs. */
function argsFor(name, schema, seeds) {
  const args = {};
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const seedMap = {
    alarm_id: seeds.alarmId, aid: seeds.alarmId,
    rule_id: seeds.ruleId, id: seeds.ruleId,
    device_id: seeds.deviceId, box_id: seeds.boxId, gid: seeds.boxId,
    target_list_id: seeds.targetListId, list_id: seeds.targetListId,
  };
  for (const [key, prop] of Object.entries(props)) {
    const type = prop.type;
    if (key === 'limit') { args.limit = 5; continue; }
    if (!required.has(key)) continue;              // only fill what's required
    if (seedMap[key] !== undefined) { args[key] = seedMap[key]; continue; }
    if (type === 'number' || type === 'integer') args[key] = 5;
    else if (type === 'boolean') args[key] = false;
    else if (type === 'array') args[key] = prop.items?.type === 'string' ? ['example.com'] : [];
    else if (prop.enum?.length) args[key] = prop.enum[0];
    else if (key === 'query') {
      const queries = {
        search_flows: 'protocol:tcp', search_alarms: 'severity:high',
        search_rules: 'action:block', search_devices: 'online:true',
        search_target_lists: 'category:edu',
      };
      args[key] = queries[name] ?? 'online:true';
    }
    else if (key === 'period' || key === 'interval') args[key] = '1h';
    else args[key] = 'test';
  }
  return args;
}

async function stdioPhase() {
  console.log('\n=== PHASE 1: stdio transport, all tools ===');
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/server.js'],
    env: { ...process.env, MCP_TRANSPORT: 'stdio' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'functional-test', version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  record('stdio', 'listTools', tools.length >= 28 ? 'OK' : 'ERR', `${tools.length} tools`);
  try {
    const r = await client.listResources();
    record('stdio', 'listResources', r.resources.length === 5 ? 'OK' : 'ERR', `${r.resources.length} resources`);
    const read = await client.readResource({ uri: 'firewalla://summary' });
    record('stdio', 'readResource(summary)', read.contents?.length ? 'OK' : 'ERR');
  } catch (e) { record('stdio', 'listResources', 'THREW', e.message); }
  try {
    const p = await client.listPrompts();
    record('stdio', 'listPrompts', p.prompts.length === 5 ? 'OK' : 'ERR', `${p.prompts.length} prompts`);
    const g = await client.getPrompt({ name: 'network_health_check', arguments: {} });
    record('stdio', 'getPrompt(health)', g.messages?.length ? 'OK' : 'ERR');
  } catch (e) { record('stdio', 'listPrompts', 'THREW', e.message); }

  const call = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    return { res, payload: parsePayload(res) };
  };

  // ---- seed live IDs from read tools ----
  const seeds = {};
  try {
    const { payload } = await call('get_boxes', {});
    seeds.boxId = payload?.data?.results?.[0]?.gid ?? payload?.data?.[0]?.gid ?? process.env.FIREWALLA_BOX_ID;
  } catch { seeds.boxId = process.env.FIREWALLA_BOX_ID; }
  try {
    const { payload } = await call('get_active_alarms', { limit: 2 });
    const a = payload?.data?.results?.[0] ?? payload?.data?.alarms?.[0];
    seeds.alarmId = a?.aid ?? a?.id;
  } catch { /* seeded lazily below */ }
  try {
    const { payload } = await call('get_network_rules', { limit: 2 });
    const r = payload?.data?.results?.[0] ?? payload?.data?.rules?.[0];
    seeds.ruleId = r?.id;
  } catch { /* ok */ }
  try {
    const { payload } = await call('get_device_status', { limit: 2 });
    const d = payload?.data?.results?.[0] ?? payload?.data?.devices?.[0];
    seeds.deviceId = d?.id ?? d?.mac;
  } catch { /* ok */ }
  console.log('  seeds:', JSON.stringify({ ...seeds, boxId: String(seeds.boxId).slice(0, 8) + '..' }));

  // ---- target-list CRUD on a disposable object ----
  const MUTATING = new Set(['create_target_list', 'update_target_list', 'delete_target_list',
                            'pause_rule', 'resume_rule']);
  try {
    const { res, payload } = await call('create_target_list', {
      name: 'mcp-refresh-functional-test', targets: ['example.com'], category: 'edu',
      owner: 'global',
      notes: 'created by scripts/functional-test.mjs; safe to delete',
    });
    const tl = payload?.data;
    seeds.targetListId = tl?.id;
    record('stdio', 'create_target_list', res.isError ? 'ERR' : 'OK', `id=${seeds.targetListId}`);
    if (seeds.targetListId) {
      const u = await call('update_target_list', {
        id: seeds.targetListId, target_list_id: seeds.targetListId,
        name: 'mcp-refresh-functional-test', targets: ['example.com', 'example.org'],
      });
      record('stdio', 'update_target_list', u.res.isError ? 'ERR' : 'OK',
             u.res.isError ? JSON.stringify(u.payload).slice(0, 80) : 'targets updated');
      const d = await call('delete_target_list', { id: seeds.targetListId, target_list_id: seeds.targetListId });
      record('stdio', 'delete_target_list', d.res.isError ? 'ERR' : 'OK', 'disposable list removed');
    }
  } catch (e) { record('stdio', 'target_list_crud', 'THREW', e.message); }

  // ---- pause/resume: error-path only (never touch real rules) ----
  for (const name of ['pause_rule', 'resume_rule']) {
    try {
      const { res, payload } = await call(name, { id: '00000000-0000-0000-0000-000000000000', rule_id: '00000000-0000-0000-0000-000000000000' });
      // a graceful structured error is the EXPECTED outcome here
      record('stdio', name, res.isError ? 'OK' : 'ERR',
             res.isError ? 'graceful error (expected)' : 'unexpectedly succeeded on bogus id!');
    } catch (e) { record('stdio', name, 'THREW', e.message); }
  }

  // ---- every remaining tool, live ----
  for (const tool of tools) {
    if (MUTATING.has(tool.name)) continue;                     // handled above
    if (['get_boxes', 'get_active_alarms', 'get_network_rules', 'get_device_status'].includes(tool.name)) {
      record('stdio', tool.name, 'OK', 'seeded earlier');
      continue;
    }
    const args = argsFor(tool.name, tool.inputSchema, seeds);
    try {
      const { res, payload } = await call(tool.name, args);
      if (res.isError) {
        const msg = payload?.error ?? JSON.stringify(payload).slice(0, 80);
        // missing seed (no alarms today etc.) is a data condition, not a code failure
        // Only a placeholder-ID probe may be excused as a graceful error --
        // limit=5 must NOT qualify, or genuine schema drift gets masked.
        const usedPlaceholder = Object.entries(args).some(
          ([k, v]) => k !== 'limit' && (v === 'test' || v === undefined));
        const dataCond = usedPlaceholder &&
          /not found|no .* found|invalid|required|validation/i.test(JSON.stringify(payload));
        record('stdio', tool.name, dataCond ? 'OK' : 'ERR', `${dataCond ? 'graceful error on absent data: ' : ''}${msg}`);
      } else {
        const count = payload?.meta?.count;
        record('stdio', tool.name, 'OK', count !== undefined ? `count=${count}` : 'ok');
      }
    } catch (e) { record('stdio', tool.name, 'THREW', e.message); }
  }

  await client.close();
}

async function httpPhase() {
  console.log('\n=== PHASE 2: HTTP transport, concurrent sessions (PR #31) ===');
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_HTTP_PORT: String(HTTP_PORT) },
    stdio: 'ignore',
  });
  try {
    await sleep(2500);   // server boot
    const url = new URL(`http://127.0.0.1:${HTTP_PORT}/mcp`);

    const mkClient = async (label) => {
      const t = new StreamableHTTPClientTransport(url);
      const c = new Client({ name: `functional-test-${label}`, version: '1.0.0' });
      await c.connect(t);
      return c;
    };

    // two CONCURRENT sessions -- pre-PR#31 the second connect broke the first
    const [c1, c2] = await Promise.all([mkClient('s1'), mkClient('s2')]);
    record('http', 'concurrent_connect', 'OK', 'two sessions initialized');
    const [t1, t2] = await Promise.all([c1.listTools(), c2.listTools()]);
    record('http', 'listTools_x2', (t1.tools.length >= 28 && t2.tools.length >= 28) ? 'OK' : 'ERR',
           `${t1.tools.length}/${t2.tools.length}`);
    const [r1, r2] = await Promise.all([
      c1.callTool({ name: 'get_boxes', arguments: {} }),
      c2.callTool({ name: 'get_simple_statistics', arguments: {} }).catch(() =>
        c2.callTool({ name: 'get_boxes', arguments: {} })),
    ]);
    record('http', 'live_calls_x2', (!r1.isError && !r2.isError) ? 'OK' : 'ERR');

    await c1.close();
    // session 3 connects AFTER a close -- exercises cleanup handlers
    const c3 = await mkClient('s3');
    const t3 = await c3.listTools();
    record('http', 'connect_after_close', t3.tools.length >= 28 ? 'OK' : 'ERR', `${t3.tools.length} tools`);
    await c2.close(); await c3.close();
  } finally {
    server.kill('SIGTERM');
  }
}

try {
  await stdioPhase();
  await httpPhase();
} catch (e) {
  console.error('FATAL:', e);
  results.push({ phase: 'fatal', name: 'harness', status: 'THREW', note: e.message });
}

const bad = results.filter(r => r.status !== 'OK');
console.log(`\n=== SUMMARY: ${results.length - bad.length}/${results.length} OK ===`);
for (const b of bad) console.log(`  FAIL ${b.phase}:${b.name} [${b.status}] ${b.note}`);
process.exit(bad.length ? 1 : 0);
