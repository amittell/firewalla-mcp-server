/**
 * A wildcard search the client matches itself must not stall the server.
 * search_rules and search_target_lists matched `*` by building a regular
 * expression, and /^.*a.*a.*a.*a.*a.*a.*a.*a.*b$/ takes about 2 s to fail
 * against 40 a's (measured on Node 24), on the one thread every client
 * shares. The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';

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

/** 9 wildcards; no value below ends in b, so each match must fail */
const PATTERN = `${'*a'.repeat(8)}*b`;
const LONG = 'a'.repeat(40);

function makeClient() {
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
  get.mockImplementation(async (url: string) => {
    if (url === '/v2/devices') {
      return {
        status: 200,
        data: [
          { id: LONG, gid: 'box-a', name: 'abcd router', ip: '192.168.1.20' },
          { id: `${LONG}b`, gid: 'box-a', name: 'plain', ip: '192.168.1.30' },
        ],
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: [
          { id: 'l1', name: LONG, owner: 'global', targets: ['a.example'] },
          { id: 'l2', name: 'ads', owner: 'global', targets: ['ab.example'] },
        ],
      };
    }
    return {
      status: 200,
      data: {
        count: 2,
        results: [
          {
            id: 'r1',
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value: LONG },
          },
          {
            id: 'r2',
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value: 'ab' },
          },
        ],
      },
    };
  });
  return client;
}

const body = (res: any) => JSON.parse(res.content[0].text);

describe('9 wildcards against a 40-character value', () => {
  it('search_rules answers at once', async () => {
    const started = performance.now();
    const res = await new SearchRulesHandler().execute(
      { query: `target.value:${PATTERN}`, limit: 10 },
      makeClient()
    );
    const elapsed = performance.now() - started;
    expect(res.isError).toBeFalsy();
    expect(body(res).data.rules).toEqual([]);
    expect(elapsed).toBeLessThan(500);
  });

  it('search_target_lists answers at once', async () => {
    const started = performance.now();
    const res = await new SearchTargetListsHandler().execute(
      { query: `name:${PATTERN}`, limit: 10 },
      makeClient()
    );
    const elapsed = performance.now() - started;
    expect(res.isError).toBeFalsy();
    expect(body(res).data.target_lists).toEqual([]);
    expect(elapsed).toBeLessThan(500);
  });

  it('a wildcard still matches as before', async () => {
    const rules = await new SearchRulesHandler().execute(
      { query: 'target.value:a*b', limit: 10 },
      makeClient()
    );
    expect(body(rules).data.rules.map((rule: any) => rule.id)).toEqual(['r2']);
    const lists = await new SearchTargetListsHandler().execute(
      { query: 'name:a*s', limit: 10 },
      makeClient()
    );
    expect(body(lists).data.target_lists.map((list: any) => list.id)).toEqual([
      'l2',
    ]);
  });
});

describe('search_devices takes any number of wildcards', () => {
  // parseSearchQuery turned each wildcard value into a regular expression
  // only to check it, and refused four or more wildcards as a "dangerous
  // sequence"; the other search tools took them
  async function timed(query: string) {
    const handler = new SearchDevicesHandler();
    // The first call loads what the handler uses; time the second
    await handler.execute({ query: 'name:plain', limit: 10 }, makeClient());
    const started = performance.now();
    const res = await handler.execute({ query, limit: 10 }, makeClient());
    const elapsed = performance.now() - started;
    const data = body(res);
    return {
      elapsed,
      names: res.isError
        ? data.message
        : (data.data.devices as any[]).map(device => device.name),
    };
  }

  it('name:*a*b*c*d*, within 50 ms', async () => {
    const { elapsed, names } = await timed('name:*a*b*c*d*');
    expect(names).toEqual(['abcd router']);
    expect(elapsed).toBeLessThan(50);
  });

  it('10 wildcards, within 50 ms', async () => {
    const pattern = `${'*a'.repeat(9)}*b`;
    expect(pattern.split('*')).toHaveLength(11);
    const { elapsed, names } = await timed(`id:${pattern}`);
    expect(names).toEqual(['plain']);
    expect(elapsed).toBeLessThan(50);
  });
});
