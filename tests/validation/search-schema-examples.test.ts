/**
 * Every field and example query that the search_flows, search_alarms,
 * search_rules and search_devices schemas in src/server.ts advertise must get
 * past validation and reach the API (issue #42). The queries are read from the
 * schema source, so a new field or example is covered as soon as it is added.
 *
 * Run live against the MSP API on 2026-09-25, /v2/flows answered `blocked:`
 * and `bytes:`, and /v2/alarms `source_ip:` and `message:`, with 400 "Invalid
 * parameters". Those names must never reach the API.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchFlowsHandler,
  SearchAlarmsHandler,
  SearchRulesHandler,
  SearchDevicesHandler,
} from '../../src/tools/handlers/search.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return { create: jest.fn(() => instance), interceptors: instance.interceptors };
});

const SEARCH_TOOLS = {
  search_flows: { handler: new SearchFlowsHandler(), endpoint: '/v2/flows' },
  search_alarms: { handler: new SearchAlarmsHandler(), endpoint: '/v2/alarms' },
  search_rules: { handler: new SearchRulesHandler(), endpoint: '/v2/rules' },
  search_devices: { handler: new SearchDevicesHandler(), endpoint: '/v2/devices' },
};
type SearchTool = keyof typeof SEARCH_TOOLS;

/**
 * The `query` description of a tool's input schema, read from the
 * ListTools handler in src/server.ts
 */
function queryDescription(tool: SearchTool): string {
  const file = path.join(process.cwd(), 'src', 'server.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const property = (
    object: ts.Expression,
    name: string
  ): ts.Expression | undefined => {
    if (!ts.isObjectLiteralExpression(object)) {
      return undefined;
    }
    const found = object.properties.find(
      p => ts.isPropertyAssignment(p) && p.name.getText(source) === name
    ) as ts.PropertyAssignment | undefined;
    return found?.initializer;
  };

  const descriptions: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const name = property(node, 'name');
      if (name && ts.isStringLiteral(name) && name.text === tool) {
        const schema = property(node, 'inputSchema');
        const properties = schema && property(schema, 'properties');
        const query = properties && property(properties, 'query');
        const description = query && property(query, 'description');
        if (description && ts.isStringLiteral(description)) {
          descriptions.push(description.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (descriptions.length !== 1) {
    throw new Error(`Expected one query description for ${tool}`);
  }
  return descriptions[0];
}

/**
 * One query per advertised field value (`protocol:tcp/udp` gives
 * `protocol:tcp` and `protocol:udp`), followed by every quoted example
 */
function advertisedQueries(tool: SearchTool): string[] {
  const match = /Supported fields: (.*?)\. Examples: (.*)$/.exec(
    queryDescription(tool)
  );
  if (!match) {
    throw new Error(`${tool} query description lists no fields and examples`);
  }
  const [, fields, examples] = match;

  const queries: string[] = [];
  for (const entry of fields.split(', ')) {
    // Drop a trailing note such as "(country code)"
    const term = entry.replace(/\s+\(.*\)$/, '');
    const colon = term.indexOf(':');
    const field = term.slice(0, colon);
    const value = term.slice(colon + 1);
    const values = value.startsWith('"')
      ? [value]
      : value.split('/').filter(v => v !== 'etc');
    for (const v of values) {
      queries.push(`${field}:${v}`);
    }
  }
  for (const example of examples.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    queries.push(example[1]);
  }
  return queries;
}

async function runSearch(tool: SearchTool, query: string) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId: 'test-box-id',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const request = jest.fn(async (_method: string, endpoint: string) =>
    endpoint === '/v2/devices' ? [] : { count: 0, results: [] }
  );
  (client as any).request = request;

  const response = await SEARCH_TOOLS[tool].handler.execute(
    { query, limit: 10 },
    client
  );
  const error = response.isError
    ? JSON.parse(response.content[0].text)
    : undefined;
  return { request, response, error };
}

// Field names the live MSP API rejected, by tool
const REJECTED_BY_API: Partial<Record<SearchTool, RegExp>> = {
  search_flows: /(?<![\w.])(blocked|block|bytes):/,
  search_alarms: /(?<![\w.])(source_ip|message):/,
};

const sentQuery = (request: jest.Mock): string | undefined =>
  (request.mock.calls[0] as unknown as [string, string, { query?: string }])[2]
    .query;

const cases = (Object.keys(SEARCH_TOOLS) as SearchTool[]).flatMap(tool =>
  advertisedQueries(tool).map(query => [tool, query] as const)
);

describe('search schema fields and examples (#42)', () => {
  it('reads the advertised queries from every search schema', () => {
    const counts = Object.fromEntries(
      (Object.keys(SEARCH_TOOLS) as SearchTool[]).map(tool => [
        tool,
        advertisedQueries(tool).length,
      ])
    );
    // Each schema lists several fields and three examples
    for (const count of Object.values(counts)) {
      expect(count).toBeGreaterThan(8);
    }
    expect(cases.map(([, query]) => query)).toEqual(
      expect.arrayContaining([
        'domain:*.example.com',
        'region:US',
        'scope.type:device',
        'notes:"description text"',
        'mac:AA:BB:CC:DD:EE:FF',
        'mac:AA:* OR name:*phone*',
      ])
    );
  });

  it.each(cases)('%s accepts %s', async (tool, query) => {
    const { request, error } = await runSearch(tool, query);

    expect(error).toBeUndefined();
    expect(request).toHaveBeenCalled();
    const [, endpoint, params] = request.mock.calls[0] as unknown as [
      string,
      string,
      { query?: string },
    ];
    expect(endpoint).toBe(SEARCH_TOOLS[tool].endpoint);

    // The MSP API searches flows, alarms and rules itself: every qualifier in
    // the query must reach it
    if (tool !== 'search_devices') {
      for (const [, field] of query.matchAll(/([\w.]+):/g)) {
        expect(params.query).toContain(`${field}:`);
      }
    }
    const rejected = REJECTED_BY_API[tool];
    if (rejected) {
      expect(params.query).not.toMatch(rejected);
    }
  });

  // Older forms keep working: they reach the API as the documented qualifier
  it.each([
    ['search_flows', 'blocked:true', 'status:blocked'],
    ['search_flows', 'blocked:false', '-status:blocked'],
    ['search_flows', 'bytes:>1MB', 'total:>1MB'],
    ['search_flows', 'blocked:true AND bytes:>1MB', 'status:blocked AND total:>1MB'],
    ['search_alarms', 'source_ip:192.168.*', 'device.ip:192.168.*'],
    [
      'search_alarms',
      'source_ip:192.168.* AND status:1',
      'device.ip:192.168.* AND status:1',
    ],
  ] as const)('%s sends %s to the API as %s', async (tool, query, expected) => {
    const { request, error } = await runSearch(tool, query);

    expect(error).toBeUndefined();
    expect(sentQuery(request)).toBe(`${expected} box.id:test-box-id`);
  });

  it('sends an unqualified alarm search term unchanged', async () => {
    const { request, error } = await runSearch('search_alarms', 'porn');

    expect(error).toBeUndefined();
    expect(sentQuery(request)).toBe('porn box.id:test-box-id');
  });

  it.each([
    ['search_flows', 'bogus_field:1'],
    ['search_alarms', 'resolved:true'],
    ['search_rules', 'bogus_field:1'],
    ['search_devices', 'vendor:Apple'],
  ] as const)('%s still rejects %s before any request', async (tool, query) => {
    const { request, error } = await runSearch(tool, query);

    expect(error).toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['message:"text search"', 'unqualified term'],
    ['resolved:true', 'status:1'],
  ])(
    'search_alarms rejects %s and names the replacement',
    async (query, replacement) => {
      const { request, error } = await runSearch('search_alarms', query);

      expect(request).not.toHaveBeenCalled();
      expect(error.validation_errors.join(' ')).toContain(replacement);
    }
  );
});
