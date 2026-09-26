/**
 * search_devices matches on the client. Reproduced 2026-09-26 with a stubbed
 * GET /v2/devices: `ip:192.168.*` found no device while `ip:192.168.*.*`
 * found both (the search engine's ip post-filter read `*` as one octet);
 * `mac:` did not match a device whose id is a plain MAC, which is how the
 * API reference gives device ids; `id:` compared the whole term as text; and
 * a bare MAC was refused without saying to write `mac:`.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';

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

const DEVICES = [
  { id: 'aa:bb:cc:dd:ee:01', gid: 'box-a', name: 'nas', ip: '192.168.1.20', macVendor: 'Synology', online: true },
  { id: 'mac:aa:bb:cc:dd:ee:02', gid: 'box-a', name: 'laptop', ip: '192.168.1.30', macVendor: 'Apple', online: false },
];

async function search(query: string) {
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
  get.mockResolvedValue({ status: 200, data: DEVICES });
  const res = await new SearchDevicesHandler().execute(
    { query, limit: 10 },
    client
  );
  const body = JSON.parse(res.content[0].text);
  return {
    res,
    body,
    names: res.isError
      ? undefined
      : (body.data.devices as any[]).map(device => device.name),
  };
}

describe('search_devices matching', () => {
  it.each([
    ['ip:192.168.*', ['nas', 'laptop']],
    ['ip:192.168.*.*', ['nas', 'laptop']],
    ['ip:192.168.1.*', ['nas', 'laptop']],
    ['ip:192.168.1.2*', ['nas']],
    ['ip:10.*', []],
    ['ip:192.168.1.20', ['nas']],
  ])('%s -> %j', async (query, expected) => {
    expect((await search(query)).names).toEqual(expected);
  });

  it.each([
    // A plain-MAC id, and a mac:-prefixed one, case-insensitively
    ['mac:aa:bb:cc:dd:ee:01', ['nas']],
    ['mac:AA:BB:CC:DD:EE:01', ['nas']],
    ['mac:aa:bb:cc:dd:ee:02', ['laptop']],
    ['mac:aa:bb:cc:*', ['nas', 'laptop']],
    ['-mac:aa:bb:cc:dd:ee:01', ['laptop']],
  ])('%s -> %j', async (query, expected) => {
    expect((await search(query)).names).toEqual(expected);
  });

  it.each([
    ['id:aa:bb:cc:dd:ee:01', ['nas']],
    ['id:AA:BB:CC:DD:EE:01', ['nas']],
    ['id:mac:aa:bb:cc:dd:ee:02', ['laptop']],
    ['id:*ee:02', ['laptop']],
    ['id:aa:bb:cc:dd:ee:02', []],
  ])('%s -> %j', async (query, expected) => {
    expect((await search(query)).names).toEqual(expected);
  });

  it('says to write mac: for a bare MAC address', async () => {
    const { res, body } = await search('aa:bb:cc:dd:ee:01');
    expect(res.isError).toBe(true);
    expect(body.validation_errors).toContain(
      'To search by MAC address, write mac:aa:bb:cc:dd:ee:01'
    );
  });
});
