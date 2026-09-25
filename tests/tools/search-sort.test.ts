/**
 * search_flows and search_alarms read the sortBy their schemas in
 * src/server.ts list, as well as sort_by. They read only sort_by, so a
 * schema-following sortBy was dropped and the API got the default sort.
 * The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchFlowsHandler,
  SearchAlarmsHandler,
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
  const request = jest.fn(async () => ({ count: 0, results: [] }));
  (client as any).request = request;
  return { client, request };
}

const sentSort = (request: jest.Mock): unknown =>
  (request.mock.calls[0] as unknown as [string, string, { sortBy?: string }])[2]
    .sortBy;

describe.each([
  [
    'search_flows',
    () => new SearchFlowsHandler(),
    'protocol:tcp',
    'total:desc',
  ],
  ['search_alarms', () => new SearchAlarmsHandler(), 'type:1', 'ts:asc'],
] as const)('%s', (_tool, handler, query, sort) => {
  it.each(['sortBy', 'sort_by'])(`sends %s ${sort} to the API`, async key => {
    const { client, request } = makeClient();
    const res = await handler().execute(
      { query, limit: 10, [key]: sort },
      client
    );

    expect(res.isError).toBeFalsy();
    expect(sentSort(request)).toBe(sort);
  });

  it('keeps the ts:desc default without a sort', async () => {
    const { client, request } = makeClient();
    await handler().execute({ query, limit: 10 }, client);

    expect(sentSort(request)).toBe('ts:desc');
  });
});
