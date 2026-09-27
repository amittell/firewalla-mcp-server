/**
 * search_devices refuses the qualifiers its matcher does not read, and
 * reports the query it matched, as Copilot's review of #74 at 56d50fc
 * asked. It accepted os:linux and matched it as the literal text
 * "os:linux", which no device holds, refused total_download:>1000 for its
 * '>' on a "non-numeric field", and matched network_name:LAN against
 * nothing although network.name:LAN found the device.
 * The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';

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

const DEVICES = [
  {
    id: 'aa:bb:cc:dd:ee:00',
    gid: 'box-a',
    name: 'nas',
    ip: '192.168.1.20',
    online: true,
    network: { id: 'n1', name: 'LAN' },
    group: { id: 'g1', name: 'kids' },
  },
  {
    id: 'aa:bb:cc:dd:ee:01',
    gid: 'box-a',
    name: 'laptop',
    ip: '192.168.1.21',
    online: false,
    network: { id: 'n2', name: 'Guest' },
  },
];

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
      return { status: 200, data: DEVICES };
    }
    if (url === '/v2/target-lists') {
      return { status: 200, data: [] };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const deviceNames = (res: any): string[] =>
  body(res).data.devices.map((device: any) => device.name);

describe('search_devices reads the qualifiers it accepts', () => {
  it.each([
    'os:linux',
    'device_type:phone',
    'last_seen:>1h',
    'bandwidth_usage:>1',
    'connection_count:>1',
    'total_download:>1000',
    'total_upload:>1000',
  ])('refuses %s, which its matcher does not read', async query => {
    const { client, get } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.message).toBe('Query contains invalid field names');
    expect(error.validation_errors[0]).toBe(
      `Invalid field(s) in query: ${query.split(':')[0]}`
    );
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['network_name:LAN', ['nas']],
    ['network.name:LAN', ['nas']],
    ['group_name:kids', ['nas']],
    ['group.name:kids', ['nas']],
    ['network_name:Guest', ['laptop']],
  ])('matches %s', async (query, names) => {
    const { client } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(deviceNames(res)).toEqual(names);
  });

  it.each([
    { query: 'online:true', args: {} },
    { query: ' -name:nas ', args: {} },
    { query: 'online:true', args: { group_by: 'online', aggregate: true } },
  ])(
    'reports $query as matched in query_executed and final_query ($args)',
    async ({ query, args }) => {
      const { client } = makeClient();
      const res = await new SearchDevicesHandler().execute(
        { query, limit: 10, ...args },
        client
      );
      expect(res.isError).toBeFalsy();
      const { data } = body(res);
      expect(data.query_executed).toBe(query.trim());
      expect(data.query_info.final_query).toBe(query.trim());
    }
  );
});
