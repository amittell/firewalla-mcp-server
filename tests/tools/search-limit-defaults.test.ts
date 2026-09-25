/**
 * The search tools apply the limit default their schemas in src/server.ts
 * advertise when the caller passes no limit: 200 for search_flows and
 * search_alarms, 50 for search_devices and 100 for search_target_lists.
 * search_flows and search_alarms used to fail without a limit ("limit
 * parameter is required"). The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchFlowsHandler,
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchTargetListsHandler,
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

const now = Math.floor(Date.now() / 1000);
const devices = Array.from({ length: 120 }, (_, i) => ({
  id: `AA:BB:CC:00:00:${String(i).padStart(2, '0')}`,
  mac: `AA:BB:CC:00:00:${String(i).padStart(2, '0')}`,
  name: `device-${String(i).padStart(3, '0')}`,
  ip: `192.168.1.${i + 1}`,
  online: false,
}));
const lists = Array.from({ length: 150 }, (_, i) => ({
  id: `TL-${i}`,
  name: `list-${i}`,
  owner: 'global',
  category: 'social',
  targets: ['example.com'],
  count: 1,
}));

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
  const request = jest.fn(async (_method: string, endpoint: string) => {
    if (endpoint === '/v2/devices') {
      return devices;
    }
    if (endpoint === '/v2/target-lists') {
      return lists;
    }
    return { count: 1, results: [{ ts: now, aid: 1, type: 1, status: 1 }] };
  });
  (client as any).request = request;
  return { client, request };
}

const parse = (res: any) => JSON.parse(res.content[0].text);

describe('search tools without a limit', () => {
  it.each([
    ['search_flows', new SearchFlowsHandler(), '/v2/flows', 'protocol:tcp'],
    ['search_alarms', new SearchAlarmsHandler(), '/v2/alarms', 'type:1'],
  ] as const)(
    '%s asks the API for 200 results',
    async (_tool, handler, endpoint, query) => {
      const { client, request } = makeClient();
      const res = await handler.execute({ query }, client);

      expect(res.isError).toBeFalsy();
      const [, called, params] = request.mock.calls[0] as unknown as [
        string,
        string,
        { limit?: number },
      ];
      expect(called).toBe(endpoint);
      expect(params.limit).toBe(200);
    }
  );

  it.each([
    ['search_flows', new SearchFlowsHandler(), 'protocol:tcp'],
    ['search_alarms', new SearchAlarmsHandler(), 'type:1'],
  ] as const)(
    '%s still sends a limit it is given',
    async (_t, handler, query) => {
      const { client, request } = makeClient();
      await handler.execute({ query, limit: 25 }, client);

      expect(
        (
          request.mock.calls[0] as unknown as [
            string,
            string,
            { limit: number },
          ]
        )[2].limit
      ).toBe(25);
    }
  );

  it('search_devices returns at most 50 devices', async () => {
    const { client } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query: 'online:false' },
      client
    );

    expect(res.isError).toBeFalsy();
    expect(parse(res).data.devices).toHaveLength(50);
  });

  it('search_target_lists returns at most 100 lists', async () => {
    const { client } = makeClient();
    const res = await new SearchTargetListsHandler().execute(
      { query: 'category:social' },
      client
    );

    expect(res.isError).toBeFalsy();
    expect(parse(res).data.target_lists).toHaveLength(100);
  });
});
