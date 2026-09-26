/**
 * Two value forms the client-side searches did not read. Reproduced
 * 2026-09-26 with the HTTP layer stubbed:
 * - search_target_lists compared a comma list as one value, so
 *   `category:social,games` found no list; in the MSP API grammar a comma
 *   list is any of its values
 * - search_devices compared `ip:192.168.1.0/24` as text and found no
 *   device; it takes an IPv4 CIDR block now (`ip:192.168.*` still works)
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import {
  commaListValues,
  ipv4InCidr,
} from '../../src/search/client-filter.js';
import { targetListMatchesQuery } from '../../src/utils/target-lists.js';

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
  (client as any).request = jest.fn(async () => data);
  return client;
}

const body = (res: any) => JSON.parse(res.content[0].text);

describe('commaListValues', () => {
  it.each([
    ['social', ['social']],
    ['social,games', ['social', 'games']],
    ['"Block, Social",games', ['Block, Social', 'games']],
    ['a,,b', ['a', 'b']],
    ['', ['']],
  ])('%s -> %j', (value, expected) => {
    expect(commaListValues(value)).toEqual(expected);
  });
});

describe('ipv4InCidr', () => {
  it.each([
    ['192.168.1.20', '192.168.1.0/24', true],
    ['192.168.2.20', '192.168.1.0/24', false],
    ['192.168.1.20', '192.168.1.5/24', true], // host bits ignored
    ['10.1.2.3', '10.0.0.0/8', true],
    ['192.168.0.1', '10.0.0.0/8', false],
    ['172.20.1.1', '0.0.0.0/0', true],
    ['192.168.1.20', '192.168.1.20/32', true],
    ['192.168.1.21', '192.168.1.20/32', false],
    ['172.16.5.4', '172.16.0.0/12', true],
    ['172.31.255.255', '172.16.0.0/12', true],
    ['10.127.255.255', '10.0.0.0/9', true],
    ['10.128.0.1', '10.0.0.0/9', false],
    ['fe80::1', '192.168.1.0/24', false], // not IPv4: in no block
    ['unknown', '192.168.1.0/24', false],
  ])('%s in %s: %s', (ip, cidr, expected) => {
    expect(ipv4InCidr(ip, cidr)).toBe(expected);
  });

  it.each(['192.168.1.0/33', '192.168.1/24', '256.0.0.0/8', 'fe80::/64', '10.0.0.0/'])(
    '%s is not an IPv4 CIDR block',
    cidr => {
      expect(ipv4InCidr('10.0.0.1', cidr)).toBeUndefined();
    }
  );
});

describe('search_target_lists comma lists', () => {
  const LISTS = [
    { id: 'TL-1', name: 'Gaming Sites', owner: 'global', category: 'games', targets: ['steam.com'], notes: 'Consoles' },
    { id: 'TL-2', name: 'Social Block', owner: 'global', category: 'social', targets: ['facebook.com'], notes: 'Blocks social media' },
    { id: 'TL-3', name: 'Ads', owner: 'box-a', category: 'ad', targets: ['ads.example'], notes: 'Ad servers' },
  ];

  async function ids(query: string) {
    const res = await new SearchTargetListsHandler().execute(
      { query },
      makeClient(LISTS)
    );
    expect(res.isError).toBeFalsy();
    return (body(res).data.target_lists as any[]).map(list => list.id);
  }

  it.each([
    ['category:social,games', ['TL-1', 'TL-2']],
    ['category:SOCIAL,Games', ['TL-1', 'TL-2']],
    ['category:social,porn', ['TL-2']],
    ['owner:box-a,global', ['TL-1', 'TL-2', 'TL-3']],
    ['name:block,ads', ['TL-2', 'TL-3']],
    ['targets:steam.com,ads.example', ['TL-1', 'TL-3']],
    ['notes:consoles,"ad servers"', ['TL-1', 'TL-3']],
    ['notes:"ad servers",consoles', ['TL-1', 'TL-3']],
    ['name:"Social Block","Gaming Sites"', ['TL-1', 'TL-2']],
    ['NOT category:social,games', ['TL-3']],
    ['-category:social,games', ['TL-3']],
    ['category:social,games AND owner:global', ['TL-1', 'TL-2']],
  ])('%s finds %j', async (query, expected) => {
    expect(await ids(query)).toEqual(expected);
  });

  it('keeps a comma inside quotes', () => {
    const list = { id: 'TL-9', name: 'Block, Social', owner: 'global', targets: [] };
    expect(targetListMatchesQuery(list, 'name:"Block, Social"')).toBe(true);
    expect(targetListMatchesQuery(list, 'name:"Block, Games"')).toBe(false);
  });
});

describe('search_devices IPv4 CIDR blocks', () => {
  const DEVICES = [
    { id: 'aa:bb:cc:dd:ee:01', gid: 'box-a', name: 'nas', ip: '192.168.1.20', macVendor: 'Synology', online: true },
    { id: 'aa:bb:cc:dd:ee:02', gid: 'box-a', name: 'laptop', ip: '192.168.2.30', macVendor: 'Apple', online: false },
    { id: 'aa:bb:cc:dd:ee:03', gid: 'box-a', name: 'camera', ip: '10.0.5.7', macVendor: 'Axis', online: true },
  ];

  async function search(query: string) {
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      makeClient(DEVICES)
    );
    return {
      res,
      names: res.isError
        ? undefined
        : (body(res).data.devices as any[]).map(device => device.name),
    };
  }

  it.each([
    ['ip:192.168.1.0/24', ['nas']],
    ['ip:192.168.0.0/16', ['nas', 'laptop']],
    ['ip:10.0.0.0/8', ['camera']],
    ['ip:0.0.0.0/0', ['nas', 'laptop', 'camera']],
    ['ip:192.168.1.20/32', ['nas']],
    ['ip:172.16.0.0/12', []],
    ['NOT ip:192.168.0.0/16', ['camera']],
    ['-ip:192.168.0.0/16', ['camera']],
    ['ip:192.168.0.0/16 AND online:true', ['nas']],
    ['ip:10.0.0.0/8 OR name:laptop', ['laptop', 'camera']],
    // wildcards still work
    ['ip:192.168.*', ['nas', 'laptop']],
    ['ip:192.168.1.*', ['nas']],
  ])('%s -> %j', async (query, expected) => {
    expect((await search(query)).names).toEqual(expected);
  });

  it.each(['ip:192.168.1.0/33', 'ip:fe80::/64', 'ip:10.0.0.0/8x'])(
    'refuses %s as a validation error',
    async query => {
      const { res } = await search(query);
      expect(res.isError).toBe(true);
      const error = body(res);
      expect(error.errorType).toBe('validation_error');
      expect(error.message).toContain('is not an IPv4 CIDR block');
    }
  );

  it('refuses a wildcard with a prefix length', async () => {
    const { res } = await search('ip:192.168.*/24');
    expect(res.isError).toBe(true);
    expect(body(res).errorType).toBe('validation_error');
  });
});
