/**
 * search_target_lists applies its query. GET /v2/target-lists takes only
 * `owner`, and the tool returned the first `limit` lists whatever the query
 * said. The query fields and examples its schema in src/server.ts lists are
 * evaluated on the client now. The HTTP layer is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchTargetListsHandler } from '../../src/tools/handlers/search.js';
import { targetListMatchesQuery } from '../../src/utils/target-lists.js';

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

const BOX = '11111111-2222-3333-4444-555555555555';
const LISTS = [
  {
    id: 'TL-1',
    name: 'Gaming Sites',
    owner: 'global',
    category: 'games',
    targets: ['steam.com', '*.gaming.com'],
    notes: 'Gaming platforms',
  },
  {
    id: 'TL-2',
    name: 'Social Block',
    owner: 'global',
    category: 'social',
    targets: ['facebook.com'],
    notes: 'Blocks social media',
  },
  // A Firewalla-managed list: the API sends a count and no targets
  { id: 'TL-3', name: 'CrowdSec', owner: BOX, category: 'intel', count: 9 },
];

async function search(query: string): Promise<string[]> {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  (client as any).request = jest.fn(async () => LISTS);
  const res = await new SearchTargetListsHandler().execute({ query }, client);
  expect(res.isError).toBeFalsy();
  return JSON.parse(res.content[0].text).data.target_lists.map(
    (list: { id: string }) => list.id
  );
}

describe('search_target_lists query', () => {
  it.each([
    // the examples in the schema
    ['category:social', ['TL-2']],
    ['owner:global AND name:*Block*', ['TL-2']],
    ['targets:*.gaming.com', ['TL-1']],
    // the fields it lists
    ['name:*Social*', ['TL-2']],
    [`owner:${BOX}`, ['TL-3']],
    ['notes:"social media"', ['TL-2']],
    ['targets:steam.com', ['TL-1']],
    ['category:games OR category:intel', ['TL-1', 'TL-3']],
    ['category:intel OR NOT owner:global', ['TL-3']],
    ['category:SOCIAL', ['TL-2']],
    ['category:ad', []],
  ])('%s finds %j', async (query, ids) => {
    expect(await search(query)).toEqual(ids);
  });

  it('matches no targets on a list the API sent none for', () => {
    expect(targetListMatchesQuery(LISTS[2], 'targets:*')).toBe(false);
  });
});

describe('target_count and last_updated', () => {
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const lists = [
    {
      id: 'A',
      name: 'Two',
      targets: ['a.com', 'b.com'],
      lastUpdated: at('2026-09-01T00:00:00Z'),
    },
    {
      id: 'B',
      name: 'One',
      targets: ['c.com'],
      lastUpdated: at('2026-09-20T00:00:00Z'),
    },
    // A Firewalla-managed list: only a count, no targets
    {
      id: 'C',
      name: 'Managed',
      count: 9,
      lastUpdated: at('2025-01-01T00:00:00Z'),
    },
    { id: 'D', name: 'Unknown size' },
  ];
  const ids = (query: string) =>
    lists
      .filter(list => targetListMatchesQuery(list, query))
      .map(list => list.id);

  it('compares the entry count, using count when there are no targets', () => {
    expect(ids('target_count:>5')).toEqual(['C']);
    expect(ids('target_count:2')).toEqual(['A']);
    expect(ids('target_count:1-2')).toEqual(['A', 'B']);
    expect(ids('target_count:<=1')).toEqual(['B']);
    expect(ids('target_count:>=9')).toEqual(['C']);
  });

  it('compares the last update time as a date or Unix seconds', () => {
    expect(ids('last_updated:>2026-09-10')).toEqual(['B']);
    expect(ids('last_updated:<2026-01-01')).toEqual(['C']);
    expect(ids(`last_updated:>=${at('2026-09-01T00:00:00Z')}`)).toEqual([
      'A',
      'B',
    ]);
    expect(ids('last_updated:>2026-09-10 AND target_count:1')).toEqual(['B']);
  });
});
