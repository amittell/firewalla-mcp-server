/**
 * The MSP API answers 400 "limit exceeds max allowed value of 500" to a
 * larger limit on /v2/alarms and /v2/flows. Callers that want more results
 * page through next_cursor 500 at a time. The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';

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

/** A client whose endpoint holds `total` items and refuses limit > 500 */
function makeClient(total: number) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const now = Math.floor(Date.now() / 1000);
  const request = jest.fn(
    async (_method: string, _endpoint: string, params: any = {}) => {
      if (params.limit > 500) {
        throw new Error('Bad Request: limit exceeds max allowed value of 500');
      }
      const start = params.cursor ? Number(params.cursor) : 0;
      const end = Math.min(total, start + params.limit);
      const results = Array.from({ length: end - start }, (_, i) => ({
        ts: now - 60 - i,
        aid: start + i,
        device: {
          id: `AA:BB:CC:00:00:${String((start + i) % 50).padStart(2, '0')}`,
        },
        download: 1000,
        upload: 10,
        total: 1010,
      }));
      return {
        count: results.length,
        results,
        next_cursor: end < total ? String(end) : undefined,
      };
    }
  );
  (client as any).request = request;
  return { client, request };
}

const limits = (request: jest.Mock) =>
  request.mock.calls.map(([, , params]) => params.limit);

describe('requests to capped list endpoints', () => {
  it('getAlarmTrends pages 500 at a time and counts every alarm', async () => {
    const { client, request } = makeClient(1234);
    const trends = await client.getAlarmTrends('24h');
    expect(limits(request)).toEqual([500, 500, 500]);
    expect(request.mock.calls[1][2].cursor).toBe('500');
    const counted = trends.results.reduce((sum, point) => sum + point.value, 0);
    expect(counted).toBe(1234);
  });

  it('getBandwidthUsage asks for top * 10 flows in pages of at most 500', async () => {
    const { client, request } = makeClient(5000);
    await client.getBandwidthUsage('1h', 60);
    expect(limits(request)).toEqual([500, 100]);
  });

  it('getActiveAlarms and getFlowData page a limit over 500', async () => {
    const { client, request } = makeClient(5000);
    const alarms = await client.getActiveAlarms(
      undefined,
      undefined,
      'ts:desc',
      1000
    );
    expect(alarms.results).toHaveLength(1000);
    await client.getFlowData(undefined, undefined, 'ts:desc', 700);
    expect(limits(request)).toEqual([500, 500, 500, 200]);
  });

  it('getSecurityMetrics sends no limit over 500 and asks for blocked flows with status:blocked', async () => {
    const { client, request } = makeClient(1200);
    await client.getSecurityMetrics();
    expect(Math.max(...limits(request))).toBeLessThanOrEqual(500);
    const flowQueries = request.mock.calls
      .filter(([, endpoint]) => endpoint === '/v2/flows')
      .map(([, , params]) => params.query);
    expect(flowQueries.every(query => query.includes('status:blocked'))).toBe(
      true
    );
    expect(flowQueries.some(query => query.includes('block:true'))).toBe(false);
  });

  it('stops when the endpoint has no more pages', async () => {
    const { client, request } = makeClient(120);
    await client.getBandwidthUsage('1h', 60);
    expect(limits(request)).toEqual([500]);
  });
});
