/**
 * GET /v2/flows sends `download`, `upload` and `total` bytes on every flow
 * (`total` is not in the official Flow Model; measured 2026-09-25, it
 * equaled download + upload on 200 of 200 flows). The client's flow
 * mappings dropped `total`, and get_recent_flow_activity, which reads it,
 * reported 0 bytes for every flow. They also dropped the flow's top-level
 * `network` (documented, and sent on 200 of 200 flows; no flow had a
 * `device.network`) and `country` (undocumented, sent beside `region`).
 * The HTTP layer (axios) is stubbed with flows shaped like the live API's;
 * all values are invented.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetRecentFlowActivityHandler } from '../../src/tools/handlers/analytics.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';

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
const NOW = Math.floor(Date.now() / 1000);

/** A flow as GET /v2/flows returns it, neutral values */
function liveFlow(i: number, download: number, upload: number) {
  return {
    ts: NOW - 60 * i + 0.25,
    gid: BOX,
    protocol: 'tcp',
    direction: 'outbound',
    block: false,
    blockType: '',
    blockedby: '',
    category: '',
    count: 1,
    country: 'US',
    region: 'US',
    domain: 'example.com',
    download,
    upload,
    total: download + upload,
    duration: 3.5,
    device: { id: 'AA:BB:CC:00:00:01', ip: '192.168.1.10', name: 'laptop' },
    source: { id: 'AA:BB:CC:00:00:01', ip: '192.168.1.10', name: 'laptop' },
    destination: {
      id: 'www.example.com',
      ip: '203.0.113.7',
      name: 'www.example.com',
    },
    network: { gid: BOX, id: 'net-1', name: 'LAN', type: 'lan' },
  };
}

/** A blocked flow: no bytes moved */
const BLOCKED = {
  ...liveFlow(3, 0, 0),
  block: true,
  blockType: 'dns',
  blockedby: 'adblock',
};

const FLOWS = [
  liveFlow(0, 4000, 1000),
  liveFlow(1, 250, 50),
  liveFlow(2, 70000, 0),
  BLOCKED,
];

function makeClient(flows: unknown[] = FLOWS) {
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
  get.mockImplementation(async (endpoint: string) => ({
    status: 200,
    data:
      endpoint === '/v2/flows'
        ? { count: flows.length, results: flows }
        : { count: 0, results: [] },
    config: { url: endpoint },
  }));
  return client;
}

const bytesOf = (flow: any) => ({
  download: flow.download,
  upload: flow.upload,
  total: flow.total,
  bytes: flow.bytes,
});

const EXPECTED_BYTES = [
  { download: 4000, upload: 1000, total: 5000, bytes: 5000 },
  { download: 250, upload: 50, total: 300, bytes: 300 },
  { download: 70000, upload: 0, total: 70000, bytes: 70000 },
  { download: 0, upload: 0, total: 0, bytes: 0 },
];

describe('flow bytes', () => {
  it('getFlowData carries download, upload and total, and bytes is total', async () => {
    const result = await makeClient().getFlowData(
      undefined,
      undefined,
      'ts:desc',
      10
    );
    expect(result.results.map(bytesOf)).toEqual(EXPECTED_BYTES);
  });

  it('searchFlows carries them as well', async () => {
    const result = await makeClient().searchFlows({
      query: 'protocol:tcp',
      limit: 10,
    });
    expect(result.results.map(bytesOf)).toEqual(EXPECTED_BYTES);
  });

  it('a flow without total gets download + upload', async () => {
    const { total: _total, ...withoutTotal } = liveFlow(0, 600, 40);
    const result = await makeClient([withoutTotal]).getFlowData(
      undefined,
      undefined,
      'ts:desc',
      10
    );
    expect(bytesOf(result.results[0])).toEqual({
      download: 600,
      upload: 40,
      total: 640,
      bytes: 640,
    });
  });

  it("get_recent_flow_activity reports each flow's bytes", async () => {
    const response = await new GetRecentFlowActivityHandler().execute(
      {},
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const { flows } = JSON.parse(response.content[0].text).data;
    expect(flows.map((flow: any) => flow.bytes)).toEqual([5000, 300, 70000, 0]);
  });
});

describe('flow network and country', () => {
  const LAN = { id: 'net-1', name: 'LAN' };

  it('getFlowData and searchFlows carry the network and country', async () => {
    const client = makeClient();
    const byData = await client.getFlowData(
      undefined,
      undefined,
      'ts:desc',
      10
    );
    const bySearch = await client.searchFlows({
      query: 'protocol:tcp',
      limit: 10,
    });
    for (const result of [byData, bySearch]) {
      expect(result.results.map(flow => flow.network)).toEqual(
        FLOWS.map(() => LAN)
      );
      expect(result.results.map(flow => flow.country)).toEqual(
        FLOWS.map(() => 'US')
      );
    }
  });

  it('a flow without them has neither', async () => {
    const { network: _network, country: _country, ...bare } = liveFlow(0, 1, 1);
    const result = await makeClient([bare]).getFlowData(
      undefined,
      undefined,
      'ts:desc',
      10
    );
    expect(result.results[0]).not.toHaveProperty('network');
    expect(result.results[0]).not.toHaveProperty('country');
  });

  it('get_flow_data and search_flows return the network of each flow', async () => {
    const byData = await new GetFlowDataHandler().execute(
      { limit: 10 },
      makeClient()
    );
    const bySearch = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 10 },
      makeClient()
    );
    expect(
      JSON.parse(byData.content[0].text).data.results.map(
        (flow: any) => flow.network
      )
    ).toEqual(FLOWS.map(() => LAN));
    expect(
      JSON.parse(bySearch.content[0].text).data.flows.map(
        (flow: any) => flow.network
      )
    ).toEqual(FLOWS.map(() => LAN));
  });

  it('get_recent_flow_activity falls back to the country without a region', async () => {
    const response = await new GetRecentFlowActivityHandler().execute(
      {},
      makeClient([{ ...liveFlow(0, 1, 1), region: '', country: 'CA' }])
    );
    const { flows } = JSON.parse(response.content[0].text).data;
    expect(flows.map((flow: any) => flow.region)).toEqual(['CA']);
  });
});
