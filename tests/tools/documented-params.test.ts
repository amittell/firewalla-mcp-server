/**
 * The client sends each /v2 GET endpoint the query parameters its official
 * docs define, under the documented names. It used to keep only query,
 * limit, sortBy, groupBy, cursor and box on every endpoint, so `group`
 * (boxes) and `owner` (target lists) never left the client, and devices were
 * "scoped" with a `query` that GET /v2/devices ignores. The HTTP layer
 * (axios) is stubbed and the tests read the params it was called with.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetTargetListsHandler } from '../../src/tools/handlers/rules.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { GetOfflineDevicesHandler } from '../../src/tools/handlers/network.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';

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

const BOX_A = '11111111-2222-3333-4444-555555555555';
const BOX_B = '66666666-7777-8888-9999-000000000000';

const DEVICES = [
  { id: 'AA:BB:CC:00:00:01', gid: BOX_A, name: 'laptop', online: true },
  { id: 'AA:BB:CC:00:00:02', gid: BOX_A, name: 'phone', online: false },
  { id: 'AA:BB:CC:00:00:03', gid: BOX_B, name: 'tablet', online: false },
].map(device => ({ ...device, ip: '192.168.1.10', macVendor: 'Vendor' }));

/**
 * A stub of the live API: /v2/devices honors `box` and ignores everything
 * else, as measured on 2026-09-25
 */
function respond(endpoint: string, params: Record<string, any> = {}): unknown {
  switch (endpoint) {
    case '/v2/devices':
      return params.box
        ? DEVICES.filter(device => device.gid === params.box)
        : DEVICES;
    case '/v2/boxes':
      return [{ gid: BOX_A, name: 'Box A', online: true }];
    case '/v2/target-lists':
      return [
        { id: 'TL-1', name: 'List', owner: 'global', targets: ['a.com'] },
      ];
    default:
      return { count: 0, results: [] };
  }
}

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
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (endpoint: string, config: any) => ({
    status: 200,
    data: respond(endpoint, config?.params),
    config: { url: endpoint },
  }));
  return { client, get };
}

/** The params of every GET the client sent to `endpoint` */
const sentTo = (get: jest.Mock, endpoint: string) =>
  get.mock.calls
    .filter(([calledEndpoint]) => calledEndpoint === endpoint)
    .map(([, config]) => config.params);

describe('devices', () => {
  it('getDeviceStatus scopes to FIREWALLA_BOX_ID with box, not query', async () => {
    const { client, get } = makeClient(BOX_A);
    const result = await client.getDeviceStatus();
    expect(sentTo(get, '/v2/devices')).toEqual([{ box: BOX_A }]);
    expect(result.results.map(device => device.gid)).toEqual([BOX_A, BOX_A]);
  });

  it('getDeviceStatus without a box asks for every device', async () => {
    const { client, get } = makeClient();
    const result = await client.getDeviceStatus();
    expect(sentTo(get, '/v2/devices')).toEqual([{}]);
    expect(result.results).toHaveLength(3);
  });

  it('getOfflineDevices uses the same box scope', async () => {
    const { client, get } = makeClient(BOX_A);
    const result = await client.getOfflineDevices();
    expect(sentTo(get, '/v2/devices')).toEqual([{ box: BOX_A }]);
    expect(result.results.map(device => device.name)).toEqual(['phone']);
  });

  it('searchDevices sends only box and matches the query on the client', async () => {
    const { client, get } = makeClient(BOX_A);
    const result = await client.searchDevices({
      query: 'online:false',
      limit: 10,
      sort_by: 'name:asc',
      group_by: 'network',
      cursor: 'abc',
      aggregate: true,
    });
    expect(sentTo(get, '/v2/devices')).toEqual([{ box: BOX_A }]);
    expect(result.results.map(device => device.name)).toEqual(['phone']);
  });

  it('searchDevices with include_resolved: false keeps online devices on the client', async () => {
    const { client, get } = makeClient();
    const result = await client.searchDevices(
      { query: 'mac_vendor:vendor', limit: 10 },
      { include_resolved: false }
    );
    expect(sentTo(get, '/v2/devices')).toEqual([{}]);
    expect(result.results.map(device => device.name)).toEqual(['laptop']);
  });

  it('drops undocumented params on /v2/devices and keeps box and group', async () => {
    const { client, get } = makeClient();
    await (client as any).request('GET', '/v2/devices', {
      query: 'box.id:x',
      limit: 5,
      sortBy: 'name:asc',
      box: BOX_B,
      group: '3',
    });
    expect(sentTo(get, '/v2/devices')).toEqual([{ box: BOX_B, group: '3' }]);
  });
});

describe('the box argument of the device tools', () => {
  it.each([
    ['get_device_status', () => new GetDeviceStatusHandler(), {}],
    ['get_offline_devices', () => new GetOfflineDevicesHandler(), {}],
    [
      'search_devices',
      () => new SearchDevicesHandler(),
      { query: 'online:false' },
    ],
  ])('%s sends box, over FIREWALLA_BOX_ID', async (_name, handler, args) => {
    const { client, get } = makeClient(BOX_A);
    const response = await handler().execute(
      { limit: 10, box: BOX_B, ...args },
      client
    );
    expect(response.isError).toBeFalsy();
    expect(sentTo(get, '/v2/devices')).toEqual([{ box: BOX_B }]);
    expect(JSON.stringify(response)).toContain('tablet');
    expect(JSON.stringify(response)).not.toContain('phone');
  });

  it.each([
    ['get_device_status', () => new GetDeviceStatusHandler(), {}],
    ['get_offline_devices', () => new GetOfflineDevicesHandler(), {}],
    [
      'search_devices',
      () => new SearchDevicesHandler(),
      { query: 'online:false' },
    ],
  ])('%s refuses a box that is not a string', async (_name, handler, args) => {
    const { client, get } = makeClient();
    const response = await handler().execute(
      { limit: 10, box: 7, ...args },
      client
    );
    expect(response.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('boxes', () => {
  it('getBoxes sends the documented group parameter', async () => {
    const { client, get } = makeClient();
    await client.getBoxes('7');
    expect(sentTo(get, '/v2/boxes')).toEqual([{ group: '7' }]);
  });
});

describe('target lists', () => {
  it('getTargetLists sends owner and nothing the endpoint ignores', async () => {
    const { client, get } = makeClient(BOX_A);
    await client.getTargetLists('cloudflare', 10, ` global,${BOX_A} `);
    expect(sentTo(get, '/v2/target-lists')).toEqual([
      { owner: `global,${BOX_A}` },
    ]);
  });

  it('getTargetLists without owner sends no params, even with a box configured', async () => {
    const { client, get } = makeClient(BOX_A);
    await client.getTargetLists(undefined, 10);
    expect(sentTo(get, '/v2/target-lists')).toEqual([{}]);
  });

  it('get_target_lists passes owner through to the API', async () => {
    const { client, get } = makeClient();
    const response = await new GetTargetListsHandler().execute(
      { limit: 5, owner: 'global' },
      client
    );
    expect(response.isError).toBeFalsy();
    expect(sentTo(get, '/v2/target-lists')).toEqual([{ owner: 'global' }]);
  });

  it('get_target_lists refuses an owner that is not a string', async () => {
    const { client, get } = makeClient();
    const response = await new GetTargetListsHandler().execute(
      { limit: 5, owner: 42 },
      client
    );
    expect(response.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('flows', () => {
  it('searchFlows sends sortBy, with bytes: as total:, and no grouping params', async () => {
    const { client, get } = makeClient();
    await client.searchFlows({
      query: 'protocol:tcp',
      limit: 10,
      sort_by: 'bytes:desc',
      group_by: 'device',
      aggregate: true,
    });
    const [params] = sentTo(get, '/v2/flows');
    expect(params.sortBy).toBe('total:desc');
    for (const key of ['sort_by', 'group_by', 'groupBy', 'aggregate']) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it('searchFlows defaults sortBy to ts:desc', async () => {
    const { client, get } = makeClient();
    await client.searchFlows({ query: 'protocol:tcp', limit: 10 });
    expect(sentTo(get, '/v2/flows')[0].sortBy).toBe('ts:desc');
  });

  it('getFlowInsights sorts on the API and groups per-flow results itself', async () => {
    const { client, get } = makeClient();
    await client.getFlowInsights('1h', { includeBlocked: true });
    const sent = sentTo(get, '/v2/flows');
    expect(sent.map(params => params.sortBy)).toEqual([
      'total:desc',
      'total:desc',
      'count:desc',
    ]);
    expect(sent.some(params => 'groupBy' in params)).toBe(false);
  });

  it('getFlowData sends timestamp: and bytes: sort fields as ts: and total:', async () => {
    const { client, get } = makeClient();
    await client.getFlowData(undefined, 'device', 'timestamp:asc,bytes:desc');
    const [params] = sentTo(get, '/v2/flows');
    expect(params.sortBy).toBe('ts:asc,total:desc');
    expect(params.groupBy).toBe('device');
  });
});

describe('alarms', () => {
  it('getActiveAlarms sends ts:desc by default and ts: for timestamp:', async () => {
    const { client, get } = makeClient();
    await client.getActiveAlarms();
    await client.getActiveAlarms('type:1', 'type', 'timestamp:asc');
    const sent = sentTo(get, '/v2/alarms');
    expect(sent.map(params => params.sortBy)).toEqual(['ts:desc', 'ts:asc']);
    expect(sent[1].groupBy).toBe('type');
  });

  it('searchAlarms sends ts: sort fields and no grouping params', async () => {
    const { client, get } = makeClient();
    await client.searchAlarms({
      query: 'type:1',
      limit: 10,
      sort_by: 'timestamp:asc',
      group_by: 'type',
    });
    const [params] = sentTo(get, '/v2/alarms');
    expect(params.sortBy).toBe('ts:asc');
    expect(params).not.toHaveProperty('groupBy');
    expect(params).not.toHaveProperty('group_by');
  });
});

describe('endpoints without a documented list', () => {
  it('/v2/rules keeps the generic scalar params', async () => {
    const { client, get } = makeClient();
    await (client as any).request('GET', '/v2/rules', {
      query: 'action:block',
      limit: 5,
      owner: 'global',
    });
    expect(sentTo(get, '/v2/rules')).toEqual([
      { query: 'action:block', limit: 5 },
    ]);
  });
});
