/**
 * response_format on the read tools, through the server's own ListTools and
 * CallTool handlers over an in-memory MCP connection. axios is mocked: every
 * request is answered here, and nothing leaves the process. The device and
 * flow records are shaped like those in tests/tools/large-responses.test.ts;
 * all values are invented.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaMCPServer } from '../../src/server.js';
import { logger } from '../../src/monitoring/logger.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { PauseRuleHandler } from '../../src/tools/handlers/rules.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';

const BOX = '11111111-2222-3333-4444-555555555555';
const START = 1790000000;

const mac = (i: number) =>
  `AA:BB:CC:00:${String(Math.floor(i / 256) % 256).padStart(2, '0')}:${(i % 256).toString(16).padStart(2, '0')}`;
const localIp = (i: number) =>
  `192.168.${Math.floor(i / 250)}.${(i % 250) + 1}`;

/** A device as GET /v2/devices returns it */
function device(i: number, name = `Test media streamer device number ${i}`) {
  return {
    id: mac(i),
    gid: BOX,
    name,
    ip: localIp(i),
    mac: mac(i),
    macVendor: 'A vendor with a long company name',
    online: i % 2 === 0,
    ipReserved: false,
    lastSeen: START + i,
    network: { id: `net-${i % 3}`, name: `Network ${i % 3}` },
    group: { id: `grp-${i % 2}`, name: `Group ${i % 2}` },
    totalDownload: 1_000_000 + i,
    totalUpload: 50_000 + i,
  };
}

/** A flow as GET /v2/flows returns it */
function flow(i: number) {
  return {
    ts: START + i * 7,
    gid: BOX,
    protocol: i % 3 ? 'tcp' : 'udp',
    direction: 'outbound',
    block: false,
    category: 'social',
    count: 2,
    domain: 'example.com',
    download: 5000 + i,
    upload: 100,
    total: 5100 + i,
    device: { id: mac(i), ip: localIp(i), name: `device-${i}` },
    source: { id: mac(i), ip: localIp(i), name: `device-${i}` },
    destination: { id: 'www.example.com', ip: '10.0.0.7' },
  };
}

/** What GET answers, by path; set per test */
let bodies: Record<string, unknown> = {};
/** Requests the mocked axios instance received */
const requests: Array<{ method: string; url: string }> = [];

jest.mock('axios', () => {
  const verb =
    (method: string) =>
    async (url: string, ...rest: unknown[]) => {
      requests.push({ method, url });
      const data =
        method === 'GET'
          ? (bodies[url] ?? { count: 0, results: [] })
          : { id: 'created-id', ...(rest[0] as object) };
      return { status: 200, data, config: { url } };
    };
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: verb('GET'),
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
  };
  return { create: jest.fn(() => instance), isAxiosError: () => false };
});

/** A client connected to a new server instance, with a fresh API client */
async function connect(): Promise<Client> {
  const server = (new FirewallaMCPServer() as any).server as Server;
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'response-format-test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(name: string, args: Record<string, unknown>) {
  const client = await connect();
  try {
    return (await client.callTool({ name, arguments: args })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
  } finally {
    await client.close();
  }
}

/** The markdown with the per-call request id replaced */
const stable = (text: string) =>
  text.replace(/request_id req_\d+_[a-z0-9]+/, 'request_id <id>');

const savedWriteFlag = process.env.FIREWALLA_ENABLE_WRITE_TOOLS;

beforeAll(() => {
  // Each server instance logs its tool list at info level; keep warnings
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  process.env.FIREWALLA_ENABLE_WRITE_TOOLS = 'true';
});

afterAll(() => {
  jest.restoreAllMocks();
  if (savedWriteFlag === undefined) {
    delete process.env.FIREWALLA_ENABLE_WRITE_TOOLS;
  } else {
    process.env.FIREWALLA_ENABLE_WRITE_TOOLS = savedWriteFlag;
  }
});

beforeEach(() => {
  bodies = {};
  requests.length = 0;
  ResourceValidator.clearCache();
});

describe('tools/list', () => {
  let tools: Tool[];

  beforeAll(async () => {
    const client = await connect();
    try {
      tools = (await client.listTools()).tools;
    } finally {
      await client.close();
    }
  });

  it('gives every read-only tool response_format', () => {
    const reads = tools.filter(tool => tool.annotations?.readOnlyHint === true);
    expect(reads.length).toBeGreaterThan(20);
    for (const tool of reads) {
      expect([tool.name, tool.inputSchema.properties?.response_format]).toEqual(
        [
          tool.name,
          expect.objectContaining({
            // null is accepted as not given, and the schema says so
            type: ['string', 'null'],
            enum: ['json', 'markdown', null],
            default: 'json',
          }),
        ]
      );
      expect(tool.inputSchema.required ?? []).not.toContain('response_format');
    }
  });

  it('gives no tool that changes state response_format', () => {
    const writes = tools.filter(
      tool => tool.annotations?.readOnlyHint === false
    );
    expect(writes.length).toBeGreaterThanOrEqual(10);
    for (const tool of writes) {
      expect([
        tool.name,
        Object.keys(tool.inputSchema.properties ?? {}),
      ]).toEqual([tool.name, expect.not.arrayContaining(['response_format'])]);
    }
  });

  it("keeps each read tool's own properties", () => {
    const status = tools.find(tool => tool.name === 'get_device_status');
    expect(Object.keys(status?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['limit', 'response_format'])
    );
  });
});

describe('json, the default', () => {
  it.each([
    ['no response_format', {}],
    ["response_format 'json'", { response_format: 'json' }],
    ['response_format null', { response_format: null }],
  ])(
    'with %s, returns the text the tool produced, byte for byte',
    async (_label, extra) => {
      bodies['/v2/devices'] = Array.from({ length: 5 }, (_, i) => device(i));
      const execute = jest.spyOn(GetDeviceStatusHandler.prototype, 'execute');
      try {
        const result = await call('get_device_status', {
          limit: 10,
          ...extra,
        });
        expect(execute).toHaveBeenCalledTimes(1);
        // The tool never sees response_format
        expect(execute.mock.calls[0][0]).toEqual({ limit: 10 });
        const produced = await execute.mock.results[0].value;
        expect(result.content).toEqual(produced.content);
        expect(JSON.parse(result.content[0].text).data.devices).toHaveLength(5);
      } finally {
        execute.mockRestore();
      }
    }
  );
});

describe('markdown', () => {
  it('renders a device list as a table capped at the page size', async () => {
    bodies['/v2/devices'] = Array.from({ length: 400 }, (_, i) => device(i));
    const result = await call('get_device_status', {
      limit: 1000,
      response_format: 'markdown',
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(() => JSON.parse(text)).toThrow();
    const lines = text.split('\n');

    expect(lines[0]).toBe('## get_device_status (devices: 400)');
    expect(lines).toContain('- **total_devices:** 400');
    expect(lines).toContain('- **online_devices:** 200');
    expect(lines).toContain('- **devices:** 400 records, under devices below');
    expect(lines).toContain('### devices (400 records, first 100 shown)');
    // Fields with one value in every device are stated once
    expect(lines).toContain(
      `Same in every record: gid = ${BOX}; mac_vendor = A vendor with a long company name; ip_reserved = false.`
    );
    const header = lines.findIndex(line => line.startsWith('| name |'));
    expect(lines[header]).toBe(
      '| name | id | last_seen | ip | online | network.id | network.name | group.id |'
    );
    const rows = lines.slice(header + 2).filter(line => line.startsWith('|'));
    expect(rows).toHaveLength(100);
    // The handler sorts by name; the first row is the first name
    expect(rows[0]).toMatch(/^\| Test media streamer device number 0 \| /);
    expect(lines).toContain(
      'Fields not in the table: group.name, total_download, total_upload.'
    );
    expect(stable(lines[lines.length - 1])).toBe(
      '_This view leaves out the meta block (request_id <id>); records past the first 100 in devices; the fields named under their table. Call again with `response_format: json` for the full JSON response._'
    );
  });

  it('renders a result with no records', async () => {
    bodies['/v2/devices'] = [];
    const result = await call('get_device_status', {
      response_format: 'markdown',
    });
    expect(result.isError).toBeFalsy();
    const text = stable(result.content[0].text);
    expect(text).toBe(
      [
        '## get_device_status (devices: 0)',
        '',
        [
          '- **total_devices:** 0',
          '- **online_devices:** 0',
          '- **offline_devices:** 0',
          '- **page_size:** 0',
          '- **has_more:** false',
          '- **devices:** none',
          '- **next_cursor:** null',
        ].join('\n'),
        '',
        '_This view leaves out the meta block (request_id <id>). Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });

  it('renders nested objects as nested bullets', async () => {
    bodies['/v2/stats/simple'] = {
      onlineBoxes: 1,
      offlineBoxes: 1,
      alarms: 7,
      rules: 12,
    };
    const result = await call('get_simple_statistics', {
      response_format: 'markdown',
    });
    expect(result.isError).toBeFalsy();
    const text = stable(result.content[0].text);
    expect(text).toMatch(
      /^## get_simple_statistics\n\n- \*\*statistics:\*\*\n {2}- \*\*online_boxes:\*\* 1\n {2}- \*\*offline_boxes:\*\* 1\n {2}- \*\*total_boxes:\*\* 2\n {2}- \*\*total_alarms:\*\* 7\n {2}- \*\*total_rules:\*\* 12\n {2}- \*\*box_availability:\*\* 50\n- \*\*summary:\*\*\n {2}- \*\*status:\*\* \S+\n {2}- \*\*health_score:\*\* [\d.]+\n {2}- \*\*active_monitoring:\*\* true\n\n_This view leaves out the meta block \(request_id <id>\)\. /
    );
  });

  it('escapes pipes and newlines in table cells', async () => {
    bodies['/v2/devices'] = [
      device(0, 'Den | TV'),
      device(1, 'Line one\nline two'),
    ];
    const result = await call('get_device_status', {
      response_format: 'markdown',
    });
    const lines = result.content[0].text.split('\n');
    const table = lines.filter(line => line.startsWith('|'));
    expect(table).toHaveLength(4);
    expect(table[2]).toMatch(/^\| Den \\\| TV \| /);
    expect(table[3]).toMatch(/^\| Line one<br>line two \| /);
    // Every row has as many unescaped pipes as the header
    const pipes = (line: string) => line.match(/(?<!\\)\|/g)?.length;
    for (const line of table) {
      expect(pipes(line)).toBe(pipes(table[0]));
    }
  });

  it('renders a streamed flow page', async () => {
    const flows = Array.from({ length: 150 }, (_, i) => flow(i));
    bodies['/v2/flows'] = { count: flows.length, results: flows };
    const result = await call('get_flow_data', {
      limit: 150,
      response_format: 'markdown',
    });
    expect(result.isError).toBeFalsy();
    const lines = result.content[0].text.split('\n');
    expect(lines[0]).toBe('## get_flow_data (data: 150)');
    expect(lines).toContain('- **streaming:** true');
    expect(lines).toContain('### data (150 records, first 100 shown)');
    const header = lines.findIndex(line => line.startsWith('| '));
    const rows = lines.slice(header + 2).filter(line => line.startsWith('|'));
    expect(rows).toHaveLength(100);
    expect(lines[lines.length - 1]).toContain(
      'records past the first 100 in data'
    );
  });

  it('shows a device name as text, not markdown or HTML', async () => {
    bodies['/v2/devices'] = [
      device(0, '<img src=x onerror=alert(1)>'),
      device(1, '[update](https://evil.example)'),
    ];
    const result = await call('get_device_status', {
      response_format: 'markdown',
    });
    const lines = result.content[0].text.split('\n');
    const rows = lines.filter(line => /^\| [^n-]/.test(line));
    expect(rows.map(row => row.split(' | ')[0])).toEqual(
      expect.arrayContaining([
        '| \\<img src=x onerror=alert(1)>',
        '| \\[update\\](https\\://evil.example)',
      ])
    );
    expect(result.content[0].text).not.toMatch(/(?<!\\)<img|(?<!\\)\[update/);
  });

  it.each([['Markdown'], [' markdown ']])(
    'refuses %j, which the schema does not allow, before any request',
    async value => {
      bodies['/v2/devices'] = [device(0)];
      const result = await call('get_device_status', {
        response_format: value,
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text)).toEqual(
        expect.objectContaining({
          errorType: 'validation_error',
          message: `response_format must be 'json' or 'markdown', not ${JSON.stringify(value)}`,
        })
      );
      expect(requests).toEqual([]);
    }
  );
});

describe('errors stay JSON', () => {
  it('a tool error asked for as markdown is the JSON error', async () => {
    const result = await call('get_device_status', {
      limit: -5,
      response_format: 'markdown',
    });
    expect(result.isError).toBe(true);
    const error = JSON.parse(result.content[0].text);
    expect(error).toEqual(
      expect.objectContaining({
        error: true,
        tool: 'get_device_status',
        errorType: 'validation_error',
      })
    );
  });

  it('an unknown response_format is refused before any request', async () => {
    const result = await call('get_device_status', {
      response_format: 'xml',
    });
    expect(result.isError).toBe(true);
    const error = JSON.parse(result.content[0].text);
    expect(error).toEqual(
      expect.objectContaining({
        error: true,
        errorType: 'validation_error',
        message: `response_format must be 'json' or 'markdown', not "xml"`,
      })
    );
    expect(requests).toEqual([]);
  });
});

describe('tools that change state', () => {
  it('get their arguments as sent and answer in JSON', async () => {
    bodies['/v2/rules'] = {
      count: 1,
      results: [{ id: 'rule-0001', action: 'block', status: 'active' }],
    };
    const execute = jest.spyOn(PauseRuleHandler.prototype, 'execute');
    try {
      const result = await call('pause_rule', {
        rule_id: 'rule-0001',
        response_format: 'markdown',
      });
      expect(execute.mock.calls[0][0]).toEqual({
        rule_id: 'rule-0001',
        response_format: 'markdown',
      });
      const produced = await execute.mock.results[0].value;
      expect(result.content).toEqual(produced.content);
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    } finally {
      execute.mockRestore();
    }
  });
});

describe('every listed tool, with the write tools on', () => {
  it('reads response_format on each read tool and on no write tool', async () => {
    const client = await connect();
    let tools: Tool[];
    try {
      tools = (await client.listTools()).tools;
    } finally {
      await client.close();
    }
    const reads = tools.filter(tool => tool.annotations?.readOnlyHint === true);
    const writes = tools.filter(
      tool => tool.annotations?.readOnlyHint !== true
    );
    expect(reads.length).toBeGreaterThanOrEqual(24);
    expect(writes.length).toBeGreaterThanOrEqual(11);

    // A value the schema refuses: the dispatcher answers for a read tool
    // before the tool or the API sees the call, and leaves a write tool's
    // arguments to the tool
    const refusal = "response_format must be 'json' or 'markdown'";
    for (const tool of tools) {
      requests.length = 0;
      const result = await call(tool.name, { response_format: 'bogus' });
      const text = result.content[0].text;
      if (tool.annotations?.readOnlyHint === true) {
        expect([tool.name, result.isError, text.includes(refusal)]).toEqual([
          tool.name,
          true,
          true,
        ]);
        expect([tool.name, requests]).toEqual([tool.name, []]);
      } else {
        expect([tool.name, text.includes(refusal)]).toEqual([tool.name, false]);
      }
    }
  });
});
