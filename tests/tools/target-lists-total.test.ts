/**
 * get_target_lists' total_lists is every list the API returned, not the
 * lists limit let through. The API is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetTargetListsHandler } from '../../src/tools/handlers/rules.js';

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
const sentParams = (get: jest.Mock) =>
  get.mock.calls.map(([, config]) => config?.params ?? {});

describe('get_target_lists total_lists', () => {
  const LISTS = ['a', 'b', 'c', 'd', 'e'].map(name => ({
    id: `TL-${name}`,
    name,
    owner: 'global',
    count: 3,
  }));

  it('is every list the API returned, with limit applied after', async () => {
    const { client, get } = makeClient(() => LISTS);
    const res = await new GetTargetListsHandler().execute({ limit: 2 }, client);
    expect(res.isError).toBeFalsy();
    const data = body(res).data;
    expect(data.total_lists).toBe(5);
    expect(data.returned_lists).toBe(2);
    expect(data.has_more).toBe(true);
    expect(data.target_lists).toHaveLength(2);
    // The endpoint takes no limit: none is sent
    expect(sentParams(get)).toEqual([{}]);
  });

  it('equals the lists returned when limit leaves none out', async () => {
    const { client } = makeClient(() => LISTS);
    const data = body(
      await new GetTargetListsHandler().execute({ limit: 10 }, client)
    ).data;
    expect([data.total_lists, data.returned_lists, data.has_more]).toEqual([
      5,
      5,
      false,
    ]);
  });
});
