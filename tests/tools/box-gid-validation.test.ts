/**
 * A box gid is refused unless it has the shape of one before it goes into a
 * `box.id:` query qualifier, where `X OR box.id:Y` would widen the scope
 * instead of narrowing it. The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetBandwidthUsageHandler } from '../../src/tools/handlers/network.js';

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
  const request = jest.fn(async () => ({ count: 0, results: [] }));
  (client as any).request = request;
  return { client, request };
}

describe('box gid validation', () => {
  it('get_bandwidth_usage refuses a box that is not a gid and sends nothing', async () => {
    const { client, request } = makeClient();
    const res = await new GetBandwidthUsageHandler().execute(
      { period: '1h', limit: 5, box: `${BOX} OR box.id:other` },
      client
    );
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text as string).errorType).toBe(
      'validation_error'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('get_bandwidth_usage scopes to a well-formed box gid', async () => {
    const { client, request } = makeClient();
    const res = await new GetBandwidthUsageHandler().execute(
      { period: '1h', limit: 5, box: BOX },
      client
    );
    expect(res.isError).toBeFalsy();
    const [, , params] = request.mock.calls[0] as unknown as [
      string,
      string,
      { query: string },
    ];
    expect(params.query).toContain(`box.id:${BOX}`);
    expect(params.query).not.toContain(' OR ');
  });

  it('refuses a malformed FIREWALLA_BOX_ID instead of putting it in a query', async () => {
    const { client, request } = makeClient('abc OR box.id:*');
    await expect(
      client.getFlowData(undefined, undefined, 'ts:desc', 5)
    ).rejects.toThrow(/Invalid box gid/);
    expect(request).not.toHaveBeenCalled();
  });
});
