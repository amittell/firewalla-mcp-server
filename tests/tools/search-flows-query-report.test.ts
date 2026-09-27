/**
 * search_flows reports the query it sent. metadata.query and, for groups,
 * query_executed held the query before the client's last steps, and
 * query_info.final_query held the caller's query again. Reproduced with
 * GET /v2/flows stubbed: `bytes:>1MB` was sent as `total:>1MB` and reported
 * as `bytes:>1MB`, `blocked:true` was sent as `status:blocked` and reported
 * as `blocked:1`, and with FIREWALLA_BOX_ID set, `protocol:tcp` was sent
 * with `box.id:<gid>` and reported without it. The API is stubbed; nothing
 * leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';

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

const BOX = '00000000-0000-0000-0000-000000000000';

function makeClient(boxId?: string) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
    boxId,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockResolvedValue({ status: 200, data: { count: 0, results: [] } });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

async function searchFlows(args: Record<string, unknown>, boxId?: string) {
  const { client, get } = makeClient(boxId);
  const res = await new SearchFlowsHandler().execute(
    { limit: 10, ...args },
    client
  );
  expect(res.isError).toBeFalsy();
  const sent = get.mock.calls.map(([, config]) => config?.params?.query);
  expect(sent).toHaveLength(1);
  return { data: body(res).data, sent: sent[0] };
}

describe('search_flows reports the query it sent', () => {
  it.each([
    ['bytes:>1MB', 'total:>1MB'],
    ['blocked:true', 'status:blocked'],
    ['protocol:tcp AND region:US', 'protocol:tcp region:US'],
  ])('%s is sent and reported as %s', async (query, expected) => {
    const { data, sent } = await searchFlows({ query });
    expect(sent).toBe(expected);
    expect(data.metadata.query).toBe(expected);
    expect(data.query_info.original_query).toBe(query);
    expect(data.query_info.final_query).toBe(expected);
  });

  it('with the box scope FIREWALLA_BOX_ID adds', async () => {
    const { data, sent } = await searchFlows({ query: 'protocol:tcp' }, BOX);
    expect(sent).toBe(`protocol:tcp box.id:${BOX}`);
    expect(data.metadata.query).toBe(sent);
    expect(data.query_info.final_query).toBe(sent);
  });

  it('with the region term geographic_filters adds', async () => {
    const { data, sent } = await searchFlows({
      query: 'protocol:tcp',
      geographic_filters: { countries: ['US'] },
    });
    expect(sent).toBe('protocol:tcp region:US');
    expect(data.metadata.query).toBe(sent);
    expect(data.query_info.applied_filters.geographic).toBe(true);
  });

  it('as query_executed for groups', async () => {
    const { data, sent } = await searchFlows(
      { query: 'bytes:>1MB', groupBy: 'domain' },
      BOX
    );
    expect(sent).toBe(`total:>1MB box.id:${BOX}`);
    expect(data.query_executed).toBe(sent);
  });
});
