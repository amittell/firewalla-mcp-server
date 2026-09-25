/**
 * With groupBy, GET /v2/alarms and GET /v2/flows return one item per group
 * (the group's fields and its count or byte totals) instead of records, and
 * return no groups at all when the request is sorted by ts (measured
 * 2026-09-25). The client sent its default ts:desc sort, so grouped calls
 * came back empty, and with another sort it mapped the groups as alarms and
 * flows: "Unknown alarm" records and flows stamped with the current time.
 * The HTTP layer (axios) is stubbed with a model of the live API.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';

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

const BOX = '11111111-2222-3333-4444-555555555555';
const totals = (total: number, count: number) => ({
  count,
  download: total - 10,
  upload: 10,
  total,
});

/** Grouped items as the live API returns them, per groupBy */
const GROUPS: Record<string, Record<string, unknown[]>> = {
  '/v2/alarms': {
    type: [
      { type: 8, count: 40 },
      { type: 1, count: 3 },
    ],
    'type,box': [{ type: 8, gid: BOX, count: 40 }],
    device: [{ device: { id: 'AA:BB:CC:00:00:01' }, count: 7 }],
  },
  '/v2/flows': {
    category: [
      { category: 'social', device: {}, ...totals(5000, 30) },
      { category: '', device: {}, ...totals(900, 4) },
    ],
    domain: [
      {
        domain: 'example.com',
        country: 'US',
        region: 'US',
        device: {},
        ...totals(700, 5),
      },
    ],
    device: [
      {
        device: {
          id: 'AA:BB:CC:00:00:01',
          ip: '192.168.1.10',
          name: 'laptop',
          macVendor: 'Vendor',
          type: 'device',
          deviceType: 'desktop',
        },
        ...totals(8000, 60),
      },
    ],
    'device,category': [
      {
        category: 'games',
        device: { id: 'AA:BB:CC:00:00:01' },
        ...totals(300, 2),
      },
    ],
  },
};

const RECORDS: Record<string, unknown[]> = {
  '/v2/alarms': [
    {
      ts: 1790000000,
      gid: BOX,
      aid: 42,
      type: 1,
      status: 1,
      message: 'A security activity alarm',
      direction: 'inbound',
      protocol: 'tcp',
    },
  ],
  '/v2/flows': [
    {
      ts: 1790000000.5,
      gid: BOX,
      protocol: 'udp',
      direction: 'outbound',
      block: false,
      category: 'social',
      domain: 'example.com',
      device: { id: 'AA:BB:CC:00:00:01', ip: '192.168.1.10', name: 'laptop' },
      ...totals(700, 5),
    },
  ],
};

/**
 * A model of the live API: grouped requests return groups, or none when
 * sorted by ts; ungrouped ones return records
 */
function respond(endpoint: string, params: Record<string, any> = {}) {
  if (!params.groupBy) {
    const results = RECORDS[endpoint] ?? [];
    return { count: results.length, results };
  }
  const sortedByTs = String(params.sortBy ?? 'ts:desc')
    .split(',')
    .some(term => term.trim().startsWith('ts:'));
  const results = sortedByTs ? [] : (GROUPS[endpoint]?.[params.groupBy] ?? []);
  return { count: results.length, results, next_cursor: null };
}

function makeClient() {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
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

/** The data payload of a unified tool response */
const payload = (response: any) => JSON.parse(response.content[0].text).data;

describe('grouped alarms', () => {
  it('getActiveAlarms returns groups, and asks for the largest first instead of ts:desc', async () => {
    const { client, get } = makeClient();
    const result = await client.getActiveAlarms(undefined, 'type');
    expect(sentTo(get, '/v2/alarms')[0]).toMatchObject({
      groupBy: 'type',
      sortBy: 'count:desc',
    });
    expect(result.results).toEqual([]);
    expect(result.group_by).toBe('type');
    expect(result.count).toBe(2);
    expect(result.groups).toEqual([
      { key: { type: 8 }, count: 40 },
      { key: { type: 1 }, count: 3 },
    ]);
  });

  it('keeps the box gid and device of a group in its key', async () => {
    const { client } = makeClient();
    const byBox = await client.getActiveAlarms(undefined, 'type,box');
    expect(byBox.groups).toEqual([{ key: { type: 8, gid: BOX }, count: 40 }]);
    const byDevice = await client.getActiveAlarms(undefined, ' device ');
    expect(byDevice.group_by).toBe('device');
    expect(byDevice.groups).toEqual([
      { key: { device: { id: 'AA:BB:CC:00:00:01' } }, count: 7 },
    ]);
  });

  it('sends a grouped sort that is not on ts as given', async () => {
    const { client, get } = makeClient();
    await client.getActiveAlarms(undefined, 'type', 'count:asc');
    await client.getActiveAlarms(undefined, 'type', 'timestamp:desc,type:asc');
    expect(sentTo(get, '/v2/alarms').map(params => params.sortBy)).toEqual([
      'count:asc',
      'type:asc',
    ]);
  });

  it('leaves ungrouped alarms as they were', async () => {
    const { client, get } = makeClient();
    const result = await client.getActiveAlarms('type:1');
    const [params] = sentTo(get, '/v2/alarms');
    expect(params.sortBy).toBe('ts:desc');
    expect(params).not.toHaveProperty('groupBy');
    expect(result.groups).toBeUndefined();
    expect(result.results.map(alarm => alarm.aid)).toEqual([42]);
  });

  it('get_active_alarms returns the groups, not alarms', async () => {
    const { client } = makeClient();
    const response = await new GetActiveAlarmsHandler().execute(
      { groupBy: 'type', limit: 20 },
      client
    );
    expect(response.isError).toBeFalsy();
    const data = payload(response);
    expect(data).not.toHaveProperty('alarms');
    expect(data).toMatchObject({
      group_by: 'type',
      count: 2,
      groups: [
        { key: { type: 8 }, count: 40 },
        { key: { type: 1 }, count: 3 },
      ],
      has_more: false,
    });
  });

  it.each([['group_by'], ['groupBy']])(
    'search_alarms returns groups for %s',
    async argName => {
      const { client, get } = makeClient();
      const response = await new SearchAlarmsHandler().execute(
        { query: 'status:1', limit: 20, [argName]: 'type' },
        client
      );
      expect(response.isError).toBeFalsy();
      expect(sentTo(get, '/v2/alarms')[0].groupBy).toBe('type');
      const data = payload(response);
      expect(data).not.toHaveProperty('alarms');
      expect(data.groups).toEqual([
        { key: { type: 8 }, count: 40 },
        { key: { type: 1 }, count: 3 },
      ]);
    }
  );
});

describe('grouped flows', () => {
  it('getFlowData returns groups with their totals, and asks for the largest first', async () => {
    const { client, get } = makeClient();
    const result = await client.getFlowData(undefined, 'category');
    expect(sentTo(get, '/v2/flows')[0]).toMatchObject({
      groupBy: 'category',
      sortBy: 'total:desc',
    });
    expect(result.results).toEqual([]);
    expect(result.group_by).toBe('category');
    // The empty device: {} of a group that is not by device is left out
    expect(result.groups).toEqual([
      {
        key: { category: 'social' },
        count: 30,
        download: 4990,
        upload: 10,
        total: 5000,
      },
      {
        key: { category: '' },
        count: 4,
        download: 890,
        upload: 10,
        total: 900,
      },
    ]);
  });

  it('keeps what the API returns for the group key', async () => {
    const { client } = makeClient();
    const byDomain = await client.getFlowData(undefined, 'domain');
    expect(byDomain.groups?.[0].key).toEqual({
      domain: 'example.com',
      country: 'US',
      region: 'US',
    });
    const byDevice = await client.getFlowData(undefined, 'device');
    expect(byDevice.groups?.[0].key).toEqual({
      device: {
        id: 'AA:BB:CC:00:00:01',
        ip: '192.168.1.10',
        name: 'laptop',
        macVendor: 'Vendor',
        type: 'device',
        deviceType: 'desktop',
      },
    });
    const byBoth = await client.getFlowData(
      undefined,
      'device,category',
      'timestamp:desc,count:desc'
    );
    expect(byBoth.groups).toEqual([
      {
        key: { category: 'games', device: { id: 'AA:BB:CC:00:00:01' } },
        count: 2,
        download: 290,
        upload: 10,
        total: 300,
      },
    ]);
  });

  it('drops only the ts terms of a grouped sort', async () => {
    const { client, get } = makeClient();
    await client.getFlowData(
      undefined,
      'device,category',
      'timestamp:desc,count:desc'
    );
    expect(sentTo(get, '/v2/flows')[0].sortBy).toBe('count:desc');
  });

  it('leaves ungrouped flows as they were', async () => {
    const { client, get } = makeClient();
    const result = await client.getFlowData('protocol:udp');
    const [params] = sentTo(get, '/v2/flows');
    expect(params.sortBy).toBe('ts:desc');
    expect(params).not.toHaveProperty('groupBy');
    expect(result.groups).toBeUndefined();
    expect(result.results.map(flow => flow.ts)).toEqual([1790000000.5]);
  });

  it('get_flow_data returns the groups, and does not stream them', async () => {
    const { client } = makeClient();
    // limit 200 streams ungrouped flows
    const response = await new GetFlowDataHandler().execute(
      { groupBy: 'category', limit: 200 },
      client
    );
    expect(response.isError).toBeFalsy();
    const data = payload(response);
    expect(data).not.toHaveProperty('results');
    expect(data).toMatchObject({ group_by: 'category', count: 2 });
    expect(data.groups[0]).toEqual({
      key: { category: 'social' },
      count: 30,
      download: 4990,
      upload: 10,
      total: 5000,
    });
  });

  it('get_flow_data refuses a groupBy that is not a string', async () => {
    const { client, get } = makeClient();
    const response = await new GetFlowDataHandler().execute(
      { groupBy: 7, limit: 10 },
      client
    );
    expect(response.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['group_by', 'device'],
    ['groupBy', 'domain'],
    ['group_by', 'device, category'],
  ])('search_flows returns groups for %s %s', async (argName, groupBy) => {
    const { client, get } = makeClient();
    const response = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 20, [argName]: groupBy },
      client
    );
    expect(response.isError).toBeFalsy();
    const sent = groupBy.replace(/\s/g, '');
    expect(sentTo(get, '/v2/flows')[0]).toMatchObject({
      groupBy: sent,
      sortBy: 'total:desc',
    });
    const data = payload(response);
    expect(data).not.toHaveProperty('flows');
    expect(data.group_by).toBe(sent);
    expect(data.groups).toHaveLength(GROUPS['/v2/flows'][sent].length);
  });

  it('search_flows refuses a group_by that is not field names', async () => {
    const { client, get } = makeClient();
    const response = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 20, group_by: 'device;drop' },
      client
    );
    expect(response.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
