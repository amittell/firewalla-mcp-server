/**
 * The MSP API sends a flow's remote domain in a top-level `domain` field
 * ("" for a flow to a bare IP). The client's flow mappings dropped it, so
 * get_flow_insights put every flow under the domain "unknown", and
 * get_flow_data, search_flows and get_recent_flow_activity had no domain.
 * The HTTP layer (axios) is stubbed with flows shaped like the live API's.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';
import { optimizeFlowResponse } from '../../src/optimization/index.js';

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

/** A flow as GET /v2/flows returns it (measured 2026-09-25), neutral values */
function liveFlow(
  domain: string,
  category: string,
  total: number,
  ts = Math.floor(Date.now() / 1000) - 60
) {
  const host = domain ? `www.${domain}` : '203.0.113.7';
  return {
    ts: ts + 0.25,
    gid: BOX,
    protocol: 'tcp',
    direction: 'outbound',
    block: false,
    blockType: '',
    blockedby: '',
    category,
    count: 2,
    country: 'US',
    region: 'US',
    domain,
    download: total - 100,
    upload: 100,
    total,
    duration: 12.5,
    device: {
      id: 'AA:BB:CC:00:00:01',
      ip: '192.168.1.10',
      name: 'laptop',
      macVendor: 'Vendor',
      type: 'device',
      deviceType: 'desktop',
    },
    source: {
      id: 'AA:BB:CC:00:00:01',
      ip: '192.168.1.10',
      name: 'laptop',
      type: 'device',
    },
    destination: {
      id: host,
      ip: '203.0.113.7',
      name: host,
      type: domain ? 'dns' : 'ip',
      portInfo: { port: 443, protocol: 'tcp' },
    },
    network: { gid: BOX, id: 'net-1', name: 'LAN', type: 'lan' },
  };
}

const FLOWS = [
  liveFlow('example.com', 'games', 3000),
  liveFlow('example.com', 'games', 1000),
  liveFlow('example.org', 'games', 500),
  liveFlow('example.net', 'social', 2000),
  liveFlow('', '', 700),
];

function makeClient(flows = FLOWS) {
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

/** The data payload of a unified tool response */
const payload = (response: any) => JSON.parse(response.content[0].text).data;

describe('flow domain', () => {
  it('searchFlows carries the domain, and none for a flow to a bare IP', async () => {
    const result = await makeClient().searchFlows({
      query: 'protocol:tcp',
      limit: 10,
    });
    expect(result.results.map(flow => flow.domain)).toEqual([
      'example.com',
      'example.com',
      'example.org',
      'example.net',
      undefined,
    ]);
  });

  it('getFlowData carries the domain', async () => {
    const result = await makeClient().getFlowData(
      undefined,
      undefined,
      'ts:desc',
      10
    );
    expect(result.results.map(flow => flow.domain)).toEqual([
      'example.com',
      'example.com',
      'example.org',
      'example.net',
      undefined,
    ]);
  });

  it('getFlowInsights reports top domains by the flow domain', async () => {
    const insights = await makeClient().getFlowInsights('24h');
    const games = insights.categoryBreakdown.find(
      entry => entry.category === 'games'
    );
    expect(games?.topDomains).toEqual([
      { domain: 'example.com', count: 4, bytes: 4000 },
      { domain: 'example.org', count: 2, bytes: 500 },
    ]);
    // Only the flow to a bare IP has no domain
    const unknown = insights.categoryBreakdown.flatMap(entry =>
      entry.topDomains.filter(domain => domain.domain === 'unknown')
    );
    expect(unknown).toEqual([{ domain: 'unknown', count: 2, bytes: 700 }]);
  });

  it('get_flow_data returns the domain of each flow', async () => {
    const response = await new GetFlowDataHandler().execute(
      { limit: 10 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    expect(payload(response).results.map((flow: any) => flow.domain)).toEqual([
      'example.com',
      'example.com',
      'example.org',
      'example.net',
      null,
    ]);
  });

  it('search_flows returns the domain of each flow', async () => {
    const response = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 10 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    expect(payload(response).flows.map((flow: any) => flow.domain)).toEqual([
      'example.com',
      'example.com',
      'example.org',
      'example.net',
      null,
    ]);
  });

  it('the compact flow form of a large response keeps the domain', () => {
    const optimized = optimizeFlowResponse(
      {
        count: 1,
        results: [{ ...FLOWS[0], bytes: 3000 }] as any,
      },
      {
        maxResponseSize: 1,
        autoTruncate: true,
        truncationStrategy: 'summary',
        summaryMode: { maxItems: 10, includeFields: [], excludeFields: [] },
      }
    );
    expect((optimized.results[0] as any).domain).toBe('example.com');
  });
});
