/**
 * GET /v2/target-lists returns a `count` on every list and no `targets` for
 * Firewalla-managed lists (measured 2026-09-25: 13 lists, counts from 1 to
 * 5,968,164, none with targets). get_target_lists and search_target_lists
 * counted `targets` only and reported every managed list with 0 entries.
 * The HTTP layer (axios) is stubbed with lists shaped like the live API's.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetTargetListsHandler } from '../../src/tools/handlers/rules.js';
import { SearchTargetListsHandler } from '../../src/tools/handlers/search.js';
import {
  targetListEntries,
  targetListEntryCount,
} from '../../src/utils/target-lists.js';

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

/** A Firewalla-managed list as the live API returns it: a count, no targets */
const managed = (id: string, count: number) => ({
  id,
  name: `Managed ${id}`,
  owner: 'firewalla',
  type: 'list',
  source: '',
  beta: false,
  blockMode: 'domainOnly',
  notes: 'A list Firewalla maintains',
  lastUpdated: 1790326112,
  count,
});

/** A global list with its targets, as the official docs describe */
const own = {
  id: 'TL-1',
  name: 'Own list',
  owner: 'global',
  targets: ['example.com', 'example.org', '203.0.113.0/24'],
  count: 3,
  lastUpdated: 1790326112,
};

function makeClient(lists: unknown[]) {
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
  get.mockImplementation(async (endpoint: string) => ({
    status: 200,
    data: endpoint === '/v2/target-lists' ? lists : [],
    config: { url: endpoint },
  }));
  return client;
}

/** The data payload of a unified tool response */
const payload = (response: any) => JSON.parse(response.content[0].text).data;

describe('target list entry counts', () => {
  it('get_target_lists reports the API count of lists sent without targets', async () => {
    const response = await new GetTargetListsHandler().execute(
      { limit: 10 },
      makeClient([managed('doh', 1294), managed('big', 5968164), own])
    );
    expect(response.isError).toBeFalsy();
    const data = payload(response);
    expect(data.target_lists.map((list: any) => list.entry_count)).toEqual([
      1294, 5968164, 3,
    ]);
    expect(data.target_lists.map((list: any) => list.targets)).toEqual([
      null,
      null,
      own.targets,
    ]);
    expect(data.targets_note).toMatch(/Firewalla-managed/);
    expect(data).not.toHaveProperty('entry_count_note');
  });

  it('get_target_lists reports null, with a note, when the API sent no count', async () => {
    const { count: _count, ...noCount } = managed('x', 1);
    const response = await new GetTargetListsHandler().execute(
      { limit: 10 },
      makeClient([noCount])
    );
    const data = payload(response);
    expect(data.target_lists[0].entry_count).toBeNull();
    expect(data.entry_count_note).toMatch(/get_specific_target_list/);
  });

  it('get_target_lists adds no notes when every list has its targets', async () => {
    const data = payload(
      await new GetTargetListsHandler().execute(
        { limit: 10 },
        makeClient([own])
      )
    );
    expect(data.target_lists[0].entry_count).toBe(3);
    expect(data).not.toHaveProperty('targets_note');
    expect(data).not.toHaveProperty('entry_count_note');
  });

  it('search_target_lists reports the API count too', async () => {
    const response = await new SearchTargetListsHandler().execute(
      { query: 'owner:firewalla', limit: 10 },
      makeClient([managed('doh', 1294), managed('one', 1)])
    );
    expect(response.isError).toBeFalsy();
    expect(
      payload(response).target_lists.map((list: any) => list.entry_count)
    ).toEqual([1294, 1]);
  });

  it.each([
    [{ targets: ['a', 'b'], count: 99 }, 2],
    [{ count: 7 }, 7],
    [{ count: 0 }, 0],
    [{ count: '7' }, null],
    [{ count: -1 }, null],
    [{}, null],
    [null, null],
  ])('targetListEntryCount(%j) is %j', (list, expected) => {
    expect(targetListEntryCount(list)).toBe(expected);
  });

  it('targetListEntries caps the targets and is null without them', () => {
    expect(targetListEntries({ targets: ['a', 'b', 'c'] }, 2)).toEqual([
      'a',
      'b',
    ]);
    expect(targetListEntries({ count: 3 }, 2)).toBeNull();
  });
});
