/**
 * The client's response cache holds at most cacheMaxEntries (default 1000,
 * CACHE_MAX_ENTRIES), dropping the least recently used entry first, and a
 * write drops the expired entries at least once a minute. It had no limit
 * and removed an entry only when that key was read again after it expired,
 * so every distinct read stayed in memory for the life of the process, and
 * one client serves every HTTP session. A query with a relative time
 * (`ts:>1h`) is not cached: it is sent as Unix seconds counted from now, so
 * each read was a new key that nothing read again.
 *
 * The HTTP layer is stubbed and Date.now is controlled.
 */

import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { getConfig } from '../../src/config/config.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetNetworkRulesHandler } from '../../src/tools/handlers/rules.js';

let now = Date.UTC(2026, 8, 26, 12);

function makeClient(config: Record<string, unknown> = {}) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 1000,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
    ...config,
  } as any);
  /** The query of each request that reached the adapter */
  const sent: string[] = [];
  const adapter: AxiosAdapter = async (request: InternalAxiosRequestConfig) => {
    sent.push(String(request.params?.query));
    return {
      status: 200,
      statusText: '',
      headers: {},
      config: request,
      request: {},
      data: { count: 0, results: [] },
    } as AxiosResponse;
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, sent };
}

/** A rules read with its own cache key */
const readRules = (client: FirewallaClient, n: number | string) =>
  client.getNetworkRules(`action:block target.value:host${n}.example`);

const cacheSize = (client: FirewallaClient) => client.getCacheStats().size;

beforeEach(() => {
  // The client logs each request and response to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the response cache', () => {
  it('holds at most cacheMaxEntries: 200 distinct reads leave 50', async () => {
    const { client, sent } = makeClient({ cacheMaxEntries: 50 });
    for (let i = 0; i < 200; i++) {
      await readRules(client, i);
    }
    expect(sent).toHaveLength(200);
    expect(cacheSize(client)).toBe(50);
    // The newest 50 are kept: the last is read from the cache
    await readRules(client, 199);
    expect(sent).toHaveLength(200);
    await readRules(client, 0);
    expect(sent).toHaveLength(201);
  });

  it('drops the expired entries: 200 reads, then one more after the TTL, leave 1', async () => {
    const { client } = makeClient();
    for (let i = 0; i < 200; i++) {
      await readRules(client, i);
    }
    expect(cacheSize(client)).toBe(200);
    now += 301_000;
    await readRules(client, 'later');
    expect(cacheSize(client)).toBe(1);
  });

  it('drops expired flow pages, cached for 15 s, on the first write a minute after the last sweep', async () => {
    const { client } = makeClient();
    for (let i = 0; i < 10; i++) {
      await client.getFlowData(`device.id:dev-${i}`, undefined, undefined, 10);
    }
    expect(cacheSize(client)).toBe(10);
    now += 61_000;
    await readRules(client, 'later');
    expect(cacheSize(client)).toBe(1);
  });

  it('keeps a key that is read, and drops the least recently used', async () => {
    const { client } = makeClient({ cacheMaxEntries: 3 });
    const read = async (id: string) =>
      (await client.getFlowData(`device.id:${id}`, undefined, undefined, 10))
        .coverage;
    for (const id of ['a', 'b', 'c']) {
      await read(id);
    }
    // a is read again from the cache, so b is now the least recently used
    expect(await read('a')).toMatchObject({ api_requests: 0, cached_pages: 1 });
    await read('d');
    expect(await read('a')).toMatchObject({ api_requests: 0, cached_pages: 1 });
    expect(await read('b')).toMatchObject({ api_requests: 1, cached_pages: 0 });
  });

  it('does not cache a query with a relative time, and does cache an absolute one', async () => {
    const { client, sent } = makeClient();
    await client.getFlowData('ts:>1h', undefined, undefined, 10);
    now += 1_100;
    await client.getFlowData('ts:>1h', undefined, undefined, 10);
    expect(sent).toEqual([
      `ts:>${Math.floor((now - 1_100) / 1000) - 3600}`,
      `ts:>${Math.floor(now / 1000) - 3600}`,
    ]);
    expect(cacheSize(client)).toBe(0);

    await client.getFlowData('ts:>1790000000', undefined, undefined, 10);
    await client.getFlowData('ts:>1790000000', undefined, undefined, 10);
    expect(sent).toHaveLength(3);
    expect(cacheSize(client)).toBe(1);
  });

  it('does not cache a relative time that search_flows turned into seconds', async () => {
    // Twice in the same second: the same seconds, so the same key, but the
    // caller asked for a relative time
    const { client, sent } = makeClient();
    const search = (query: string) =>
      new SearchFlowsHandler().execute({ query, limit: 10 }, client);
    await search('ts:>1h');
    await search('ts:>1h');
    expect(sent).toEqual([
      `ts:>${Math.floor(now / 1000) - 3600}`,
      `ts:>${Math.floor(now / 1000) - 3600}`,
    ]);
    expect(cacheSize(client)).toBe(0);

    // An absolute time is cached as before
    await search('ts:>1790000000');
    await search('ts:>1790000000');
    expect(sent).toHaveLength(3);
  });

  // Each turns the caller's relative time into seconds before the client
  // sees it: search_flows and search_alarms, get_active_alarms when it adds
  // status:1, and the client's rule read
  it.each([
    { name: 'search_flows', handler: new SearchFlowsHandler() },
    { name: 'search_alarms', handler: new SearchAlarmsHandler() },
    { name: 'get_active_alarms', handler: new GetActiveAlarmsHandler() },
    { name: 'get_network_rules', handler: new GetNetworkRulesHandler() },
  ])(
    '$name: ts:>1h twice in one second sends two requests',
    async ({ handler }) => {
      const { client, sent } = makeClient();
      const args = { query: 'ts:>1h', limit: 10 };
      const first = await handler.execute(args, client);
      const second = await handler.execute(args, client);
      expect(first.isError).toBeFalsy();
      expect(second.isError).toBeFalsy();
      expect(sent).toHaveLength(2);
      expect(sent[1]).toBe(sent[0]);
      expect(cacheSize(client)).toBe(0);
    }
  );
});

describe('CACHE_MAX_ENTRIES', () => {
  const saved = process.env.CACHE_MAX_ENTRIES;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.CACHE_MAX_ENTRIES;
    } else {
      process.env.CACHE_MAX_ENTRIES = saved;
    }
  });

  it('sets cacheMaxEntries, 1000 by default, and refuses a value under 1', () => {
    delete process.env.CACHE_MAX_ENTRIES;
    expect(getConfig().cacheMaxEntries).toBe(1000);
    process.env.CACHE_MAX_ENTRIES = '250';
    expect(getConfig().cacheMaxEntries).toBe(250);
    process.env.CACHE_MAX_ENTRIES = '0';
    expect(() => getConfig()).toThrow(/CACHE_MAX_ENTRIES must be at least 1/);
  });
});
