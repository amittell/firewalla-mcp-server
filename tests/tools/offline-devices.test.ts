/**
 * get_offline_devices looks at every device GET /v2/devices returns. It
 * used to take a page of 3 x limit devices sorted by name and filter that,
 * so offline devices later in the alphabet were never reported. The HTTP
 * layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetOfflineDevicesHandler } from '../../src/tools/handlers/network.js';

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
// a..i are online; x, y and z, last by name, are offline
const devices = [...'abcdefghixyz'].map((letter, i) => ({
  id: `AA:BB:CC:00:00:0${i.toString(16)}`,
  mac: `AA:BB:CC:00:00:0${i.toString(16)}`,
  name: `${letter}-device`,
  ip: `192.168.1.${i + 1}`,
  online: !'xyz'.includes(letter),
  lastSeen: now - (letter === 'y' ? 60 : 3600),
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
  const request = jest.fn(async () => devices);
  (client as any).request = request;
  return { client, request };
}

const parse = (res: any) => JSON.parse(res.content[0].text).data;

describe('get_offline_devices', () => {
  it('finds offline devices past the first 3 x limit by name', async () => {
    const { client, request } = makeClient();
    const res = await new GetOfflineDevicesHandler().execute(
      { limit: 1 },
      client
    );

    expect(res.isError).toBeFalsy();
    const data = parse(res);
    expect(data.total_offline_devices).toBe(3);
    // the most recently seen offline device
    expect(data.devices.map((d: any) => d.name)).toEqual(['y-device']);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns every offline device when limit allows', async () => {
    const { client } = makeClient();
    const data = parse(
      await new GetOfflineDevicesHandler().execute({ limit: 10 }, client)
    );

    expect(data.total_offline_devices).toBe(3);
    expect(data.devices.map((d: any) => d.name).sort()).toEqual([
      'x-device',
      'y-device',
      'z-device',
    ]);
  });
});
