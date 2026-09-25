/**
 * get_active_alarms returns active alarms unless the query names a status.
 * /v2/alarms returns archived alarms (status 2) too when no status is given
 * (measured 2026-09-25: 855 of 5,987 alarms in the default window). The HTTP
 * layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';

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

const sentQuery = (request: jest.Mock): string =>
  (request.mock.calls[0] as unknown as [string, string, { query: string }])[2]
    .query;

describe('get_active_alarms status default', () => {
  it.each([
    [undefined, 'status:1'],
    ['type:8', 'status:1 type:8'],
  ])('adds status:1 to %p', async (query, expected) => {
    const { client, request } = makeClient();
    const res = await new GetActiveAlarmsHandler().execute(
      { query, limit: 5 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQuery(request)).toBe(expected);
  });

  it.each(['status:2', 'type:8 status:2', '-status:1'])(
    'leaves a query that names a status alone: %p',
    async query => {
      const { client, request } = makeClient();
      await new GetActiveAlarmsHandler().execute({ query, limit: 5 }, client);
      expect(sentQuery(request)).toBe(query);
    }
  );

  it('ignores the undocumented severity argument instead of sending severity:', async () => {
    const { client, request } = makeClient();
    await new GetActiveAlarmsHandler().execute(
      { query: 'type:1', severity: 'high', limit: 5 },
      client
    );
    expect(sentQuery(request)).toBe('status:1 type:1');
  });

  it('recent threats count active alarms only', async () => {
    const { client, request } = makeClient();
    await client.getRecentThreats(24);
    const queries = request.mock.calls
      .filter(([, endpoint]) => endpoint === '/v2/alarms')
      .map(
        call =>
          (call as unknown as [string, string, { query: string }])[2].query
      );
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every(q => q.startsWith('status:1 '))).toBe(true);
  });
});
