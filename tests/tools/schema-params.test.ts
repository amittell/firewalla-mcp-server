/**
 * Schema parameters that no handler read are either used now or gone from
 * src/server.ts:
 * - get_device_status sends group to GET /v2/devices (a documented filter)
 * - get_bandwidth_usage scopes its flows to box (the box.id qualifier)
 * - search_target_lists sends owner to GET /v2/target-lists (documented)
 * - search_devices loses status and search_target_lists loses category:
 *   neither is an API parameter, and query covers both (online:false,
 *   category:social)
 * The HTTP layer is stubbed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { GetBandwidthUsageHandler } from '../../src/tools/handlers/network.js';
import { SearchTargetListsHandler } from '../../src/tools/handlers/search.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
  };
});

const ENV_BOX = '11111111-2222-3333-4444-555555555555';
const OTHER_BOX = '66666666-7777-8888-9999-000000000000';

function makeClient(boxId?: string) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const request = jest.fn(async (_method: string, endpoint: string) =>
    endpoint === '/v2/flows' ? { count: 0, results: [] } : []
  );
  (client as any).request = request;
  return { client, request };
}

const sent = (request: jest.Mock, endpoint: string) =>
  request.mock.calls
    .filter(([, called]) => called === endpoint)
    .map(([, , params]) => params);

describe('get_device_status group', () => {
  it.each([
    [undefined, { group: 'grp-1' }],
    [ENV_BOX, { box: ENV_BOX, group: 'grp-1' }],
  ])('FIREWALLA_BOX_ID=%s sends %j', async (boxId, params) => {
    const { client, request } = makeClient(boxId);
    const res = await new GetDeviceStatusHandler().execute(
      { limit: 10, group: 'grp-1' },
      client
    );

    expect(res.isError).toBeFalsy();
    expect(sent(request, '/v2/devices')).toEqual([params]);
  });

  it('rejects a group that is not a string', async () => {
    const { client, request } = makeClient();
    const res = await new GetDeviceStatusHandler().execute(
      { limit: 10, group: 7 },
      client
    );

    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('get_bandwidth_usage box', () => {
  it.each([
    [ENV_BOX, OTHER_BOX, `box.id:${OTHER_BOX}`],
    [ENV_BOX, undefined, `box.id:${ENV_BOX}`],
    [undefined, OTHER_BOX, `box.id:${OTHER_BOX}`],
  ])(
    'FIREWALLA_BOX_ID=%s and box=%s query flows with %s',
    async (boxId, box, qualifier) => {
      const { client, request } = makeClient(boxId);
      const res = await new GetBandwidthUsageHandler().execute(
        { period: '24h', box },
        client
      );

      expect(res.isError).toBeFalsy();
      const [params] = sent(request, '/v2/flows') as Array<{ query: string }>;
      expect(params.query).toMatch(/^ts:\d+-\d+ box\.id:/);
      expect(params.query.endsWith(qualifier)).toBe(true);
      expect(params.query.match(/box\.id:/g)).toHaveLength(1);
    }
  );

  it('sends no box.id without box or FIREWALLA_BOX_ID', async () => {
    const { client, request } = makeClient();
    await new GetBandwidthUsageHandler().execute({ period: '24h' }, client);

    const [params] = sent(request, '/v2/flows') as Array<{ query: string }>;
    expect(params.query).not.toContain('box.id');
  });
});

describe('search_target_lists owner', () => {
  it('sends owner to GET /v2/target-lists', async () => {
    const { client, request } = makeClient();
    const res = await new SearchTargetListsHandler().execute(
      { query: 'category:social', owner: `global,${ENV_BOX}` },
      client
    );

    expect(res.isError).toBeFalsy();
    expect(sent(request, '/v2/target-lists')).toEqual([
      { owner: `global,${ENV_BOX}` },
    ]);
  });

  it('sends no owner without one', async () => {
    const { client, request } = makeClient();
    await new SearchTargetListsHandler().execute(
      { query: 'category:social' },
      client
    );

    expect(sent(request, '/v2/target-lists')).toEqual([{}]);
  });
});

/** The property names of a tool's inputSchema in src/server.ts */
function schemaProperties(tool: string): string[] {
  const file = path.join(process.cwd(), 'src', 'server.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const property = (object: ts.Node | undefined, name: string) =>
    object && ts.isObjectLiteralExpression(object)
      ? (
          object.properties.find(
            p => ts.isPropertyAssignment(p) && p.name.getText(source) === name
          ) as ts.PropertyAssignment | undefined
        )?.initializer
      : undefined;
  const found: string[][] = [];
  const visit = (node: ts.Node): void => {
    const name = property(node, 'name');
    if (name && ts.isStringLiteral(name) && name.text === tool) {
      const properties = property(property(node, 'inputSchema'), 'properties');
      if (properties && ts.isObjectLiteralExpression(properties)) {
        found.push(properties.properties.map(p => p.name!.getText(source)));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.length !== 1) {
    throw new Error(`Expected one inputSchema for ${tool}`);
  }
  return found[0];
}

describe('advertised schemas', () => {
  it.each([
    ['get_device_status', ['limit', 'box', 'group']],
    ['get_bandwidth_usage', ['period', 'limit', 'box']],
    ['search_devices', ['query', 'limit', 'box']],
    ['search_target_lists', ['query', 'owner', 'limit']],
  ])('%s lists %j', (tool, properties) => {
    expect(schemaProperties(tool)).toEqual(properties);
  });
});
