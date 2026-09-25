/**
 * Every tool the server lists carries MCP tool annotations, and the
 * annotations agree with what the tool does. The tools are listed and called
 * through the server's own ListTools and CallTool handlers, over an in-memory
 * MCP connection. axios is mocked: every HTTP request is recorded and
 * answered here, and nothing leaves the process.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaMCPServer } from '../../src/server.js';
import { logger } from '../../src/monitoring/logger.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';

const BOX = '11111111-2222-3333-4444-555555555555';
const MAC = 'AA:BB:CC:DD:EE:FF';
const RULE = 'rule-0001';
const LIST = 'TL-00000000-0000-0000-0000-000000000000';

/** Requests the mocked axios instance received, in order */
const requests: Array<{ method: string; url: string }> = [];
/** Status of the one rule GET /v2/rules returns */
let ruleStatus = 'active';

/** An answer shaped like the MSP API's for each endpoint the tools read */
function answer(method: string, url: string, body?: unknown): unknown {
  if (method !== 'GET') {
    return { id: 'created-id', ...(body as object) };
  }
  const now = Math.floor(Date.now() / 1000);
  const device = { id: MAC, ip: '192.168.1.10', name: 'laptop' };
  if (url === '/v2/boxes') {
    return [{ gid: BOX, name: 'home', model: 'gold', online: true }];
  }
  if (url === '/v2/devices') {
    return [
      {
        ...device,
        mac: MAC,
        gid: BOX,
        online: false,
        lastSeen: now - 60,
        network: { id: 'lan', name: 'LAN' },
      },
    ];
  }
  if (url === '/v2/rules') {
    const target = { type: 'domain', value: 'example.com' };
    const rule = { id: RULE, action: 'block', status: ruleStatus, target };
    return {
      count: 1,
      results: [{ ...rule, gid: BOX, ts: now, updateTs: now }],
    };
  }
  if (url.startsWith('/v2/target-lists')) {
    const list = {
      id: LIST,
      name: 'Social',
      owner: 'global',
      targets: ['a.com'],
    };
    return url === '/v2/target-lists' ? [list] : list;
  }
  if (url.startsWith('/v2/alarms')) {
    const alarm = { aid: 1, gid: BOX, type: 1, status: 1, ts: now, device };
    return url === '/v2/alarms' ? { count: 1, results: [alarm] } : alarm;
  }
  if (url === '/v2/flows') {
    const flow = {
      ts: now,
      gid: BOX,
      protocol: 'tcp',
      download: 10,
      upload: 5,
    };
    return { count: 1, results: [{ ...flow, category: 'social', device }] };
  }
  if (url === '/v2/stats/simple') {
    return { onlineBoxes: 1, offlineBoxes: 0, alarms: 1, rules: 1 };
  }
  if (url === '/v2/stats/topRegionsByBlockedFlows') {
    return [{ meta: { code: 'US' }, value: 3 }];
  }
  if (url.startsWith('/v2/stats/')) {
    return [{ meta: { gid: BOX, name: 'home', model: 'gold' }, value: 3 }];
  }
  if (url.startsWith('/v2/trends/')) {
    return [{ ts: now - 60, value: 3 }];
  }
  return [];
}

jest.mock('axios', () => {
  const verb =
    (method: string, hasBody: boolean) =>
    async (url: string, ...rest: unknown[]) => {
      requests.push({ method, url });
      const data = answer(method, url, hasBody ? rest[0] : undefined);
      return { status: 200, data, config: { url } };
    };
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: verb('GET', false),
    post: verb('POST', true),
    put: verb('PUT', true),
    patch: verb('PATCH', true),
    delete: verb('DELETE', false),
  };
  return { create: jest.fn(() => instance), isAxiosError: () => false };
});

/**
 * Arguments that get each tool past validation to the API. A tool missing
 * here fails the test below: add it.
 */
const CALLS: Record<
  string,
  { args: Record<string, unknown>; ruleStatus?: string }
> = {
  get_active_alarms: { args: {} },
  get_specific_alarm: { args: { alarm_id: '1', gid: BOX } },
  archive_alarm: { args: { alarm_id: '1', gid: BOX } },
  mute_alarm: {
    args: {
      alarm_id: '1',
      gid: BOX,
      target_type: 'alarmType',
      scope_type: 'all',
    },
  },
  get_flow_data: { args: {} },
  get_device_status: { args: { limit: 10 } },
  get_network_rules: { args: { limit: 10 } },
  pause_rule: { args: { rule_id: RULE } },
  resume_rule: { args: { rule_id: RULE }, ruleStatus: 'paused' },
  get_target_lists: { args: { limit: 10 } },
  get_specific_target_list: { args: { id: LIST } },
  create_rule: { args: { action: 'block', target_type: 'internet', gid: BOX } },
  delete_rule: { args: { rule_id: RULE } },
  rename_device: { args: { device_id: MAC, name: 'nas', gid: BOX } },
  create_target_list: {
    args: { name: 'Blocked', owner: 'global', targets: ['example.com'] },
  },
  update_target_list: { args: { id: LIST, name: 'Renamed' } },
  delete_target_list: { args: { id: LIST } },
  search_flows: { args: { query: 'protocol:tcp' } },
  search_alarms: { args: { query: 'type:1' } },
  search_rules: { args: { query: 'action:block' } },
  get_boxes: { args: {} },
  get_simple_statistics: { args: {} },
  get_statistics_by_region: { args: {} },
  get_statistics_by_box: { args: {} },
  get_recent_flow_activity: { args: {} },
  get_flow_insights: { args: {} },
  get_alarm_trends: { args: {} },
  get_rule_trends: { args: {} },
  get_bandwidth_usage: { args: { period: '24h' } },
  get_offline_devices: { args: {} },
  search_devices: { args: { query: 'online:false' } },
  search_target_lists: { args: { query: 'category:social' } },
  get_network_rules_summary: { args: {} },
};

/** A client connected to a new server instance, with a fresh API client */
async function connect(): Promise<Client> {
  const server = (new FirewallaMCPServer() as any).server as Server;
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'annotations-test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function listTools(): Promise<Tool[]> {
  const client = await connect();
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

const savedWriteFlag = process.env.FIREWALLA_ENABLE_WRITE_TOOLS;
let tools: Tool[];

beforeAll(async () => {
  // Each server instance logs its tool list at info level; keep warnings
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  process.env.FIREWALLA_ENABLE_WRITE_TOOLS = 'true';
  tools = await listTools();
});

afterAll(() => {
  jest.restoreAllMocks();
  if (savedWriteFlag === undefined) {
    delete process.env.FIREWALLA_ENABLE_WRITE_TOOLS;
  } else {
    process.env.FIREWALLA_ENABLE_WRITE_TOOLS = savedWriteFlag;
  }
});

describe('tools/list', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])(
    'FIREWALLA_ENABLE_WRITE_TOOLS=%s lists exactly the registered tools',
    async (flag, enableWriteTools) => {
      process.env.FIREWALLA_ENABLE_WRITE_TOOLS = flag;
      try {
        const listed = (await listTools()).map(tool => tool.name).sort();
        const registered = new ToolRegistry({ enableWriteTools })
          .getToolNames()
          .sort();
        expect(listed).toEqual(registered);
        expect(listed.length).toBeGreaterThanOrEqual(28);
      } finally {
        process.env.FIREWALLA_ENABLE_WRITE_TOOLS = 'true';
      }
    }
  );

  it('gives every tool a title, readOnlyHint and openWorldHint', () => {
    for (const tool of tools) {
      const annotations = tool.annotations ?? {};
      expect([tool.name, typeof annotations.title]).toEqual([
        tool.name,
        'string',
      ]);
      expect(annotations.title?.trim()).not.toBe('');
      expect([tool.name, typeof annotations.readOnlyHint]).toEqual([
        tool.name,
        'boolean',
      ]);
      // Every tool calls the external Firewalla MSP API
      expect([tool.name, annotations.openWorldHint]).toEqual([tool.name, true]);
      if (annotations.readOnlyHint === false) {
        expect([
          tool.name,
          typeof annotations.destructiveHint,
          typeof annotations.idempotentHint,
        ]).toEqual([tool.name, 'boolean', 'boolean']);
      }
    }
  });

  it('marks every get_ and search_ tool read-only', () => {
    const reads = tools.filter(tool => /^(get|search)_/.test(tool.name));
    expect(reads.length).toBeGreaterThan(20);
    for (const tool of reads) {
      expect([tool.name, tool.annotations?.readOnlyHint]).toEqual([
        tool.name,
        true,
      ]);
    }
  });

  it("matches each handler's description to the listed one", () => {
    const registry = new ToolRegistry({ enableWriteTools: true });
    for (const tool of tools) {
      expect([tool.name, registry.getHandler(tool.name)?.description]).toEqual([
        tool.name,
        tool.description,
      ]);
    }
  });

  it('has a call below for every listed tool', () => {
    const missing = tools.map(tool => tool.name).filter(name => !CALLS[name]);
    expect(missing).toEqual([]);
  });
});

describe('annotations agree with the requests each tool sends', () => {
  const names = Object.keys(CALLS);

  beforeEach(() => {
    requests.length = 0;
    ruleStatus = 'active';
    ResourceValidator.clearCache();
  });

  it.each(names)('%s', async name => {
    const tool = tools.find(listed => listed.name === name);
    expect(tool).toBeDefined();
    ruleStatus = CALLS[name].ruleStatus ?? 'active';

    const client = await connect();
    let result;
    try {
      result = await client.callTool({ name, arguments: CALLS[name].args });
    } finally {
      await client.close();
    }

    // The call reached the API: a validation error sends nothing, and a tool
    // that sent nothing proves nothing about its annotations
    expect(result.isError).toBeFalsy();
    expect(requests.length).toBeGreaterThan(0);

    const methods = new Set(requests.map(request => request.method));
    const writes = [...methods].filter(method => method !== 'GET');
    expect({ name, readOnlyHint: tool?.annotations?.readOnlyHint }).toEqual({
      name,
      readOnlyHint: writes.length === 0,
    });
    if (methods.has('DELETE')) {
      expect(tool?.annotations?.destructiveHint).toBe(true);
    }
  });
});
