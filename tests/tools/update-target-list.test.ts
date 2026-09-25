/**
 * update_target_list sends only the fields it was given. An omitted targets
 * used to go out as targets: [], which PATCHes the list's targets to empty.
 * The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { UpdateTargetListHandler } from '../../src/tools/handlers/rules.js';

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

const ID = 'TL-00000000-0000-0000-0000-000000000000';

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
  const request = jest.fn(
    async (
      _method: string,
      _endpoint: string,
      _params?: unknown,
      body?: any
    ) => ({
      id: ID,
      ...body,
    })
  );
  (client as any).request = request;
  return { client, request };
}

describe('update_target_list', () => {
  it.each([
    [{ id: ID, name: 'Renamed' }, { name: 'Renamed' }],
    [{ id: ID, notes: 'n', targets: null }, { notes: 'n' }],
    [{ id: ID, category: 'social' }, { category: 'social' }],
  ])('%j sends no targets', async (args, body) => {
    const { client, request } = makeClient();
    const res = await new UpdateTargetListHandler().execute(args, client);

    expect(res.isError).toBeFalsy();
    expect(request.mock.calls).toEqual([
      ['PATCH', `/v2/target-lists/${ID}`, {}, body],
    ]);
  });

  it.each([[['example.com', 'example.org']], [[]]])(
    'sends targets %j when given',
    async targets => {
      const { client, request } = makeClient();
      await new UpdateTargetListHandler().execute({ id: ID, targets }, client);

      expect(request.mock.calls).toEqual([
        ['PATCH', `/v2/target-lists/${ID}`, {}, { targets }],
      ]);
    }
  );
});
