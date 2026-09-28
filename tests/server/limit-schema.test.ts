/**
 * Each tool's listed `limit` maximum is the one its handler enforces. The
 * schemas listed 500 for tools whose handlers take 1000 (search_flows,
 * get_flow_data and others, which read 500 per request and follow the
 * cursor, or filter a full list on the client), search_rules listed no
 * maximum, and get_network_rules_summary did not list `limit` at all though
 * its handler reads it. The tools are listed and called through the
 * server's own ListTools and CallTool handlers over an in-memory MCP
 * connection; axios is mocked, and nothing leaves the process.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaMCPServer } from '../../src/server.js';
import { logger } from '../../src/monitoring/logger.js';

const BOX = '11111111-2222-3333-4444-555555555555';

/** An answer shaped like the MSP API's for each endpoint the tools read */
function answer(url: string): unknown {
  const now = Math.floor(Date.now() / 1000);
  const device = { id: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.10', name: 'nas' };
  if (url === '/v2/boxes') {
    return [{ gid: BOX, name: 'home', model: 'gold', online: true }];
  }
  if (url === '/v2/devices') {
    return [{ ...device, gid: BOX, online: false, lastSeen: now - 60 }];
  }
  if (url === '/v2/rules') {
    const rule = { id: 'rule-1', action: 'block', status: 'active' };
    const target = { type: 'domain', value: 'example.com' };
    return { count: 1, results: [{ ...rule, target, gid: BOX, ts: now }] };
  }
  if (url === '/v2/target-lists') {
    return [{ id: 'TL-1', name: 'List', owner: 'global', targets: ['a.com'] }];
  }
  if (url === '/v2/alarms') {
    const alarm = { aid: 1, gid: BOX, type: 1, status: 1, ts: now, device };
    return { count: 1, results: [alarm] };
  }
  if (url === '/v2/flows') {
    const flow = { ts: now, gid: BOX, protocol: 'tcp', download: 1 };
    return { count: 1, results: [{ ...flow, device }] };
  }
  if (url.startsWith('/v2/stats/')) {
    return [{ meta: { gid: BOX, name: 'home', code: 'US' }, value: 3 }];
  }
  return [];
}

jest.mock('axios', () => {
  const get = async (url: string) => ({
    status: 200,
    data: answer(url),
    config: { url },
  });
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get,
  };
  return { create: jest.fn(() => instance), isAxiosError: () => false };
});

/** Arguments, other than `limit`, that a tool needs to pass validation */
const ARGS: Record<string, Record<string, unknown>> = {
  get_specific_alarm: { alarm_id: '1', gid: BOX },
  get_specific_target_list: { id: 'TL-1' },
  get_bandwidth_usage: { period: '24h' },
  search_flows: { query: 'protocol:tcp' },
  search_alarms: { query: 'type:1' },
  search_rules: { query: 'action:block' },
  search_devices: { query: 'online:false' },
  search_target_lists: { query: 'category:social' },
};

let client: Client;
let tools: Tool[];
const savedWriteFlag = process.env.FIREWALLA_ENABLE_WRITE_TOOLS;

beforeAll(async () => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // Only the read tools take a limit
  delete process.env.FIREWALLA_ENABLE_WRITE_TOOLS;
  const server = (new FirewallaMCPServer() as any).server as Server;
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'limit-schema-test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  tools = (await client.listTools()).tools;
});

afterAll(async () => {
  await client.close();
  jest.restoreAllMocks();
  if (savedWriteFlag === undefined) {
    delete process.env.FIREWALLA_ENABLE_WRITE_TOOLS;
  } else {
    process.env.FIREWALLA_ENABLE_WRITE_TOOLS = savedWriteFlag;
  }
});

/** The text of a tool's answer to `limit`, and whether it was an error */
async function callWithLimit(
  name: string,
  limit: number
): Promise<{ isError: boolean; text: string }> {
  const result = await client.callTool({
    name,
    arguments: { ...ARGS[name], limit },
  });
  return {
    isError: result.isError === true,
    text: JSON.stringify(result.content),
  };
}

/**
 * A refusal of `limit` itself by the handler's validation, whichever of its
 * wordings: "limit is too large ... (got 501, maximum: 500)", "limit exceeds
 * system limits ... (got 2001, maximum: 2000 for performance reasons)",
 * "limit must be a positive number ... (got 0, minimum: 1)"
 */
const LIMIT_REFUSED = /limit [^"]*\(got -?\d+, (minimum|maximum): \d+/;

const limitSchema = (tool: Tool) =>
  (tool.inputSchema.properties as Record<string, any> | undefined)?.limit;

describe('limit', () => {
  it('is listed by the tools expected, with a maximum on each', () => {
    const listed = Object.fromEntries(
      tools
        .filter(tool => limitSchema(tool))
        .map(tool => [tool.name, limitSchema(tool).maximum ?? 'none'])
    );
    expect(listed).toEqual({
      get_active_alarms: 500,
      get_flow_data: 1000,
      get_device_status: 1000,
      get_network_rules: 1000,
      get_target_lists: 1000,
      search_flows: 1000,
      search_alarms: 1000,
      search_rules: 1000,
      get_statistics_by_region: 'none',
      get_statistics_by_box: 'none',
      get_bandwidth_usage: 500,
      get_offline_devices: 1000,
      search_devices: 1000,
      search_target_lists: 1000,
      get_network_rules_summary: 2000,
    });
  });

  it("each tool's listed maximum is accepted, and one more is refused", async () => {
    const checked: string[] = [];
    for (const tool of tools) {
      const max = limitSchema(tool)?.maximum;
      if (max === undefined) {
        continue;
      }
      const atMax = await callWithLimit(tool.name, max);
      expect([tool.name, max, LIMIT_REFUSED.test(atMax.text)]).toEqual([
        tool.name,
        max,
        false,
      ]);
      const over = await callWithLimit(tool.name, max + 1);
      expect([tool.name, over.isError, over.text]).toEqual([
        tool.name,
        true,
        expect.stringContaining(`(got ${max + 1}, maximum: ${max}`),
      ]);
      checked.push(tool.name);
    }
    expect(checked).toHaveLength(13);
  });

  it('a tool with no listed maximum takes a large limit', async () => {
    for (const tool of tools.filter(
      t => limitSchema(t) && limitSchema(t).maximum === undefined
    )) {
      const { text } = await callWithLimit(tool.name, 100_000);
      expect([tool.name, LIMIT_REFUSED.test(text)]).toEqual([tool.name, false]);
    }
  });

  it('a tool that does not list limit does not read it', async () => {
    for (const tool of tools.filter(t => !limitSchema(t))) {
      const { text } = await callWithLimit(tool.name, 0);
      expect([tool.name, LIMIT_REFUSED.test(text)]).toEqual([tool.name, false]);
    }
  });
});
