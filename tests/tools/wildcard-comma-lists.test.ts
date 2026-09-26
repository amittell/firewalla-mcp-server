/**
 * Comma lists with wildcards, and comma lists in search_devices. The shared
 * query validator refused a wildcard value with a comma
 * (`name:*Block*,Ads`: "Invalid wildcard pattern"), although toMspQuery
 * sends an OR of wildcard values as that list. search_devices compared a
 * comma list as one value, so `name:nas,laptop` found no device. The HTTP
 * layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

function makeClient(data: unknown) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockResolvedValue({ status: 200, data });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

describe('the query validator', () => {
  it.each([
    'name:*Block*,Ads',
    'domain:*apple*,*google*',
    'ip:192.168.1.*,10.*',
  ])('accepts the wildcard comma list %s', query => {
    expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
  });
});

describe('search_target_lists wildcard comma lists', () => {
  const LISTS = [
    { id: 'TL-1', name: 'Gaming Sites', owner: 'global', category: 'games', targets: ['steam.com'] },
    { id: 'TL-2', name: 'Social Block', owner: 'global', category: 'social', targets: ['facebook.com'] },
    { id: 'TL-3', name: 'Ads', owner: 'global', category: 'ad', targets: ['ads.example'] },
  ];

  it.each([
    ['name:*Block*,Ads', ['TL-2', 'TL-3']],
    ['targets:*.com,ads.*', ['TL-1', 'TL-2', 'TL-3']],
    ['targets:steam.*,*.example', ['TL-1', 'TL-3']],
  ])('%s finds %j', async (query, expected) => {
    const { client } = makeClient(LISTS);
    (client as any).request = jest.fn(async () => LISTS);
    const res = await new SearchTargetListsHandler().execute({ query }, client);
    expect(body(res).message).toBeUndefined();
    expect((body(res).data.target_lists as any[]).map(list => list.id)).toEqual(
      expected
    );
  });
});

describe('search_devices comma lists', () => {
  const DEVICES = [
    { id: 'aa:bb:cc:dd:ee:01', gid: 'box-a', name: 'nas', ip: '192.168.1.20', macVendor: 'Synology', online: true, network: { name: 'Home' } },
    { id: 'aa:bb:cc:dd:ee:02', gid: 'box-a', name: 'laptop', ip: '192.168.2.30', macVendor: 'Apple', online: false, network: { name: 'Office' } },
    { id: 'aa:bb:cc:dd:ee:03', gid: 'box-a', name: 'camera', ip: '10.0.5.7', macVendor: 'Axis', online: true, network: { name: 'IoT' } },
  ];

  async function names(query: string) {
    const { client } = makeClient(DEVICES);
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    expect(body(res).message).toBeUndefined();
    return (body(res).data.devices as any[]).map(device => device.name);
  }

  it.each([
    ['name:nas,laptop', ['nas', 'laptop']],
    ['name:*na*,*cam*', ['nas', 'camera']],
    ['mac_vendor:apple,axis', ['laptop', 'camera']],
    ['network.name:home,iot', ['nas', 'camera']],
    ['ip:192.168.1.20,10.0.5.7', ['nas', 'camera']],
    ['ip:192.168.1.*,10.*', ['nas', 'camera']],
    ['ip:192.168.1.0/24,10.0.0.0/8', ['nas', 'camera']],
    ['mac:aa:bb:cc:dd:ee:01,aa:bb:cc:dd:ee:03', ['nas', 'camera']],
    ['NOT name:nas,laptop', ['camera']],
    ['name:nas,laptop AND online:true', ['nas']],
  ])('%s -> %j', async (query, expected) => {
    expect(await names(query)).toEqual(expected);
  });

  it('refuses a list with a block that is not IPv4', async () => {
    const { client } = makeClient(DEVICES);
    const res = await new SearchDevicesHandler().execute(
      { query: 'ip:192.168.1.0/24,fe80::/64', limit: 10 },
      client
    );
    expect(res.isError).toBe(true);
    expect(body(res).details.invalid_ip_blocks).toEqual(['fe80::/64']);
  });
});

describe('search_flows wildcard comma lists', () => {
  it('sends domain:*apple*,*google* as it is', async () => {
    const { client, get } = makeClient({ count: 0, results: [] });
    const res = await new SearchFlowsHandler().execute(
      { query: 'domain:*apple*,*google*', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(get.mock.calls[0][1].params.query).toBe(
      'domain:*apple*,*google*'
    );
  });
});

describe('search_devices online:', () => {
  // online: compared the whole value with true and false and let any other
  // value match every device: online:yes, which the query check accepts,
  // returned offline devices too, and online:true,false was refused
  const DEVICES = [
    { id: 'aa:bb:cc:dd:ee:01', gid: 'box-a', name: 'nas', ip: '192.168.1.20', online: true },
    { id: 'aa:bb:cc:dd:ee:02', gid: 'box-a', name: 'laptop', ip: '192.168.2.30', online: false },
    { id: 'aa:bb:cc:dd:ee:03', gid: 'box-a', name: 'camera', ip: '10.0.5.7', online: true },
  ];

  async function search(query: string) {
    const { client } = makeClient(DEVICES);
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    return {
      res,
      names: res.isError
        ? undefined
        : (body(res).data.devices as any[]).map(device => device.name),
    };
  }

  it.each([
    ['online:true', ['nas', 'camera']],
    ['online:false', ['laptop']],
    ['online:yes', ['nas', 'camera']],
    ['online:no', ['laptop']],
    ['online:1', ['nas', 'camera']],
    ['online:0', ['laptop']],
    ['online:true,false', ['nas', 'laptop', 'camera']],
    ['online:false,false', ['laptop']],
    ['online:TRUE,true', ['nas', 'camera']],
    ['NOT online:false,false', ['nas', 'camera']],
  ])('%s -> %j', async (query, expected) => {
    expect((await search(query)).names).toEqual(expected);
  });

  it.each(['online:maybe', 'online:true,maybe', 'online:tr*'])(
    'refuses %s',
    async query => {
      const { res } = await search(query);
      expect(res.isError).toBe(true);
      expect(body(res).message).toContain("Field 'online' expects a boolean");
    }
  );

  it('matches no device for a value it does not know, called directly', async () => {
    const { client } = makeClient(DEVICES);
    const result = await client.searchDevices({ query: 'online:maybe', limit: 10 });
    expect(result.results).toEqual([]);
  });
});
