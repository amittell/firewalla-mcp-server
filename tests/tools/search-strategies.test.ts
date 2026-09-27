/**
 * SearchEngine's strategies run only under executeSearch, which
 * searchRules, searchDevices and searchTargetLists call with 'rules',
 * 'devices' and 'target_lists'. searchFlows and searchAlarms call the
 * client themselves, and get_active_alarms and get_flow_data do not use
 * the engine. So the 'flows' and 'alarms' strategies never ran, including
 * the alarm one's re-filter, which built `new RegExp` from the raw
 * source_ip: value: source_ip:.*+* gave the pattern ..*+.*, which throws
 * "Nothing to repeat". They are removed. The API is stubbed; nothing
 * leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchAlarmsHandler } from '../../src/tools/handlers/search.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { SearchEngine } from '../../src/tools/search.js';

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

/** An alarm the alarm strategy's re-filter would have dropped for type:1 */
const ALARM = {
  aid: 7,
  gid: '00000000-0000-0000-0000-000000000000',
  type: 10,
  status: 1,
  ts: 1735689600,
  message: 'Porn activity',
  device: { id: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.5', name: 'tablet' },
};

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
  // The stub ignores the query, as a filter the client applied would not
  get.mockResolvedValue({ status: 200, data: { count: 1, results: [ALARM] } });
  return client;
}

describe('the search engine has strategies only for what executeSearch runs', () => {
  it('rules, devices and target_lists', () => {
    const strategies = (new SearchEngine(makeClient()) as any)
      .strategies as Map<string, unknown>;
    expect([...strategies.keys()].sort()).toEqual([
      'devices',
      'rules',
      'target_lists',
    ]);
  });
});

describe('no alarm tool re-filters the API answer by the raw query', () => {
  // With the alarm strategy's processResults on the path, type:1 would keep
  // no type 10 alarm and source_ip:192.168.* no alarm from 10.0.0.5
  it.each([
    ['search_alarms', SearchAlarmsHandler],
    ['get_active_alarms', GetActiveAlarmsHandler],
  ])('%s returns what the API returned', async (_name, Handler) => {
    const res = await new Handler().execute(
      { query: 'type:1 AND source_ip:192.168.*', limit: 10 },
      makeClient()
    );
    expect(res.isError).toBeFalsy();
    const { alarms } = JSON.parse(res.content[0].text).data;
    expect(alarms.map((alarm: any) => alarm.type)).toEqual([10]);
  });
});
