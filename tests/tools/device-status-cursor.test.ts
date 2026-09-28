/**
 * get_device_status reports last_seen as the API sent it, or null, and
 * refuses a cursor it did not issue before any request. The docs audit
 * found a device with no lastSeen reported as seen at the time of the
 * request, and an undecodable cursor read as the first page. The API is
 * stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { encodeCursor } from '../../src/utils/pagination.js';

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

/** A client whose GETs answer `answer(url)` */
function makeClient(answer: (url: string) => unknown) {
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
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data: answer(url),
  }));
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

const DEVICES = [
  {
    id: 'aa:bb:cc:dd:ee:01',
    gid: 'box-a',
    name: 'alpha',
    ip: '10.0.0.1',
    online: true,
    lastSeen: 1700000000,
  },
  {
    id: 'aa:bb:cc:dd:ee:02',
    gid: 'box-a',
    name: 'bravo',
    ip: '10.0.0.2',
    online: false,
  },
  {
    id: 'aa:bb:cc:dd:ee:03',
    gid: 'box-a',
    name: 'charlie',
    ip: '10.0.0.3',
    online: false,
    lastSeen: 0,
  },
];

describe('get_device_status last_seen', () => {
  it("is the API's lastSeen, or null when it sends none", async () => {
    const { client } = makeClient(() => DEVICES);
    const res = await new GetDeviceStatusHandler().execute(
      { limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    const seen = Object.fromEntries(
      body(res).data.devices.map((device: any) => [
        device.name,
        device.last_seen,
      ])
    );
    expect(seen).toEqual({
      alpha: '2023-11-14T22:13:20.000Z',
      bravo: null,
      charlie: null,
    });
  });
});

describe('get_device_status cursor', () => {
  it('pages on with a next_cursor it issued', async () => {
    const first = makeClient(() => DEVICES);
    const page1 = body(
      await new GetDeviceStatusHandler().execute({ limit: 2 }, first.client)
    ).data;
    expect(page1.devices.map((device: any) => device.name)).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(typeof page1.next_cursor).toBe('string');

    const second = makeClient(() => DEVICES);
    const page2 = body(
      await new GetDeviceStatusHandler().execute(
        { limit: 2, cursor: page1.next_cursor },
        second.client
      )
    ).data;
    expect(page2.devices.map((device: any) => device.name)).toEqual([
      'charlie',
    ]);
    expect(second.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    ['an API cursor', 'eyJ0cyI6MTcwMDAwMDAwMH0='],
    ['empty', ''],
    ['a negative offset', encodeCursor({ offset: -1, page_size: 2 } as any)],
    [
      'from a listing sorted another way',
      encodeCursor({
        offset: 1,
        page_size: 2,
        sort_by: 'ts',
        sort_order: 'desc',
      }),
    ],
  ])('refuses %s before any request', async (_label, cursor) => {
    const { client, get } = makeClient(() => DEVICES);
    const res = await new GetDeviceStatusHandler().execute(
      { limit: 2, cursor },
      client
    );
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.message).toBe('Invalid cursor');
    expect(error.errorType).toBe('validation_error');
    expect(get).not.toHaveBeenCalled();
  });
});
