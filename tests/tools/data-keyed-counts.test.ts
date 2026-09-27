/**
 * Counts and lists keyed by values from the API. The accumulators were
 * plain `{}`: for a rule action, target type or group value such as
 * toString or constructor, `(acc[key] || 0) + 1` read the inherited method
 * and counted "function toString() { [native code] }1", and assigning
 * __proto__ set the object's prototype instead of adding a key, so that
 * count was lost. They have no prototype now (keyedByData). The API is
 * stubbed; nothing leaves the process.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { FirewallaMCPServer } from '../../src/server.js';
import { GetNetworkRulesSummaryHandler } from '../../src/tools/handlers/rules.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';
import { logger } from '../../src/monitoring/logger.js';

const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

function answer(url: string): unknown {
  const now = Math.floor(Date.now() / 1000);
  if (url === '/v2/rules') {
    return {
      count: NAMES.length + 1,
      results: [...NAMES, 'block'].map((value, i) => ({
        id: `rule-${i}`,
        action: value,
        direction: value,
        status: value,
        target: { type: value, value: 'example.com' },
        ts: now,
        updateTs: now,
      })),
    };
  }
  if (url === '/v2/devices') {
    return [...NAMES, 'plain'].map((name, i) => ({
      id: `aa:bb:cc:dd:ee:0${i}`,
      gid: 'box-a',
      name,
      ip: `192.168.1.${20 + i}`,
      online: true,
    }));
  }
  if (url === '/v2/boxes') {
    return [];
  }
  if (url === '/v2/alarms') {
    return {
      count: NAMES.length + 1,
      results: [...NAMES, '__proto__'].map((message, i) => ({
        aid: i + 1,
        gid: 'box-a',
        type: 1,
        status: 1,
        ts: now,
        message,
      })),
    };
  }
  return { count: 0, results: [] };
}

jest.mock('axios', () => {
  const verb = () => async (url: string) => ({
    status: 200,
    data: answer(url),
    config: { url },
  });
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: verb(),
    post: verb(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

function makeClient() {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

/** A map's own entries, sorted, so __proto__ is compared as a key */
const entries = (map: Record<string, unknown>) =>
  Object.keys(map)
    .sort()
    .map(key => [key, map[key]]);

const EXPECTED = entries(
  Object.fromEntries([...NAMES, 'block'].map(name => [name, 1]))
);

let prototypeNames: string[];

beforeAll(() => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
});

beforeEach(() => {
  prototypeNames = Object.getOwnPropertyNames(Object.prototype).sort();
});

afterEach(() => {
  // Nothing was added to or changed on Object.prototype
  expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(
    prototypeNames
  );
  expect(({} as any).block).toBeUndefined();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('get_network_rules_summary counts every value as a key', () => {
  it.each(['by_action', 'by_direction', 'by_status', 'by_target_type'])(
    '%s',
    async breakdownKey => {
      const res = await new GetNetworkRulesSummaryHandler().execute(
        { limit: 100 },
        makeClient()
      );
      expect(res.isError).toBeFalsy();
      const { data } = JSON.parse(res.content[0].text);
      const counts = data.breakdown[breakdownKey];
      expect(entries(counts)).toEqual(EXPECTED);
      expect(
        Object.values(counts as Record<string, number>).reduce(
          (sum, count) => sum + count,
          0
        )
      ).toBe(data.total_rules);
    }
  );
});

describe('the search aggregations by group value', () => {
  it('count a device named for each Object.prototype member', async () => {
    const res = await new SearchDevicesHandler().execute(
      { query: 'online:true', limit: 50, aggregate: true, group_by: 'name' },
      makeClient()
    );
    expect(res.isError).toBeFalsy();
    const { aggregations } = JSON.parse(res.content[0].text).data;
    expect(Object.keys(aggregations).sort()).toEqual(
      [...NAMES, 'plain'].sort()
    );
    for (const name of [...NAMES, 'plain']) {
      expect(aggregations[name].count).toBe(1);
    }
  });
});

describe('firewalla://threats/recent counts threats by type', () => {
  it('keys by an alarm message named for an Object.prototype member', async () => {
    const server = (new FirewallaMCPServer() as any).server as Server;
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'data-keys-test', version: '0.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const { contents } = await client.readResource({
        uri: 'firewalla://threats/recent',
      });
      const [resource] = contents;
      const text = 'text' in resource ? resource.text : '';
      const { statistics } = JSON.parse(text).recent_threats;
      expect(statistics.total).toBe(5);
      expect(entries(statistics.by_type)).toEqual([
        ['__proto__', 2],
        ['constructor', 1],
        ['hasOwnProperty', 1],
        ['toString', 1],
      ]);
    } finally {
      await client.close();
    }
  });
});
