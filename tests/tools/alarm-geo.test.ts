/**
 * search_alarms reads geographic_filters, and geo_enriched says whether a
 * response holds geographic data. The docs audit found search_alarms
 * ignoring geographic_filters and reporting geo_enriched: true with no
 * geographic field in its results. The API is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

/** A client whose GETs answer `answer(url)` */
function makeClient(answer: (url: string) => unknown) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data: answer(url),
  }));
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentParams = (get: jest.Mock) =>
  get.mock.calls.map(([, config]) => config?.params ?? {});

const ALARM_PUBLIC = {
  aid: 1,
  gid: 'box-a',
  type: 1,
  ts: 1700000000,
  status: 1,
  message: 'Security activity',
  device: { ip: '192.168.1.2', name: 'laptop' },
  remote: { ip: '8.8.8.8', region: 'US' },
};
const ALARM_LOCAL = {
  aid: 2,
  gid: 'box-a',
  type: 5,
  ts: 1700000000,
  status: 1,
  message: 'New device',
  device: { ip: '192.168.1.3', name: 'phone' },
};

describe('search_alarms geographic_filters', () => {
  it("sends countries as the remote end's remote.region", async () => {
    const { client, get } = makeClient(() => ({
      count: 1,
      results: [ALARM_PUBLIC],
    }));
    const res = await new SearchAlarmsHandler().execute(
      {
        query: 'type:1',
        limit: 10,
        geographic_filters: { countries: ['CN', 'US'] },
      },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentParams(get).map(params => params.query)).toEqual([
      'type:1 remote.region:CN,US',
    ]);
    expect(body(res).data.query_info.applied_filters.geographic).toBe(
      'remote.region:CN,US'
    );
  });

  it.each([
    [{ continents: ['Asia'] }, 'remote.region'],
    [{ countries: ['ZZ'] }, 'remote.region:<code>'],
    [{ countries: 'CN' }, 'remote.region qualifier'],
  ])('refuses %j before any request', async (filters, message) => {
    const { client, get } = makeClient(() => ({ count: 0, results: [] }));
    const res = await new SearchAlarmsHandler().execute(
      { query: 'type:1', limit: 10, geographic_filters: filters as any },
      client
    );
    expect(res.isError).toBe(true);
    expect(body(res).message).toContain(message);
    expect(get).not.toHaveBeenCalled();
  });

  it('sends the query alone when the filters ask for nothing', async () => {
    const { client, get } = makeClient(() => ({ count: 0, results: [] }));
    await new SearchAlarmsHandler().execute(
      { query: 'type:1', limit: 10, geographic_filters: { countries: [] } },
      client
    );
    expect(sentParams(get).map(params => params.query)).toEqual(['type:1']);
  });
});

describe('geo_enriched says whether the response holds geographic data', () => {
  const FLOW_PUBLIC = {
    ts: 1700000000,
    gid: 'box-a',
    protocol: 'tcp',
    direction: 'outbound',
    block: false,
    count: 1,
    device: { id: 'aa:bb:cc:dd:ee:ff', ip: '192.168.1.2', name: 'laptop' },
    destination: { id: '8.8.8.8', ip: '8.8.8.8', name: 'dns.google' },
    source: { ip: '192.168.1.2' },
  };

  it.each([
    // remote_country, from the alarm's remote.region
    [
      'search_alarms',
      SearchAlarmsHandler,
      [ALARM_PUBLIC, ALARM_LOCAL],
      { query: 'type:1', limit: 10 },
      true,
    ],
    [
      'search_alarms, a local device only',
      SearchAlarmsHandler,
      [ALARM_LOCAL],
      { query: 'type:1', limit: 10 },
      false,
    ],
    [
      'search_alarms, no results',
      SearchAlarmsHandler,
      [],
      { query: 'type:1', limit: 10 },
      false,
    ],
    // destination_country "US", from the client's lookup
    [
      'search_flows',
      SearchFlowsHandler,
      [FLOW_PUBLIC],
      { query: 'protocol:tcp', limit: 10 },
      true,
    ],
    [
      'get_active_alarms, a public remote',
      GetActiveAlarmsHandler,
      [ALARM_PUBLIC],
      { limit: 10 },
      true,
    ],
    [
      'get_active_alarms, a local device only',
      GetActiveAlarmsHandler,
      [ALARM_LOCAL],
      { limit: 10 },
      false,
    ],
    [
      'get_flow_data, a public destination',
      GetFlowDataHandler,
      [FLOW_PUBLIC],
      { limit: 10 },
      true,
    ],
  ] as const)('%s: %s', async (_name, Handler, results, args, enriched) => {
    const { client } = makeClient(() => ({ count: results.length, results }));
    const res = await new Handler().execute({ ...args }, client);
    expect(res.isError).toBeFalsy();
    expect(body(res).meta.geo_enriched).toBe(enriched);
  });
});
