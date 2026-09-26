/**
 * A term without a field is free text. Reproduced 2026-09-26 with the HTTP
 * layer stubbed: search_devices (`nas`), search_target_lists (`gaming`) and
 * search_rules (`facebook`) each refused a query that was only free text
 * with "Expected ':' after field", from the search engine's query parser,
 * and `name:nas OR laptop` the same way. search_devices and
 * search_target_lists match free text on the client; for search_rules see
 * rules-free-text.test.ts.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';

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

describe('the search parser reads free text', () => {
  it.each([
    ['nas', { type: 'text', value: 'nas' }],
    ['"Living Room"', { type: 'text', value: 'Living Room' }],
    ['192.168', { type: 'text', value: '192.168' }],
    ['my-laptop', { type: 'text', value: 'my-laptop' }],
  ])('%s', (query, ast) => {
    const parsed = queryParser.parse(query, 'devices');
    expect(parsed.errors).toEqual([]);
    expect(parsed.ast).toEqual(ast);
  });

  it('with operators and field terms', () => {
    const parsed = queryParser.parse('name:nas OR laptop', 'devices');
    expect(parsed.errors).toEqual([]);
    expect(parsed.ast).toEqual({
      type: 'logical',
      operator: 'OR',
      left: { type: 'field', field: 'name', value: 'nas', operator: '=' },
      right: { type: 'text', value: 'laptop' },
    });
  });

  it('still refuses an unknown field', () => {
    expect(queryParser.parse('nmae:nas', 'devices').isValid).toBe(false);
  });
});

describe('search_devices free text', () => {
  const DEVICES = [
    {
      id: 'aa:bb:cc:dd:ee:01',
      gid: 'box-a',
      name: 'NAS',
      ip: '192.168.1.20',
      macVendor: 'Synology',
      online: true,
      network: { id: 'n1', name: 'Living Room' },
      group: { id: 'g1', name: 'Kids' },
    },
    {
      id: 'mac:aa:bb:cc:dd:ee:02',
      gid: 'box-a',
      name: 'laptop',
      ip: '192.168.2.30',
      macVendor: 'Apple',
      online: false,
      network: { id: 'n2', name: 'Office' },
    },
  ];

  async function names(query: string) {
    const { client } = makeClient(DEVICES);
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    expect(body(res).message).toBeUndefined();
    expect(res.isError).toBeFalsy();
    return (body(res).data.devices as any[]).map(device => device.name);
  }

  it.each([
    // name, case-insensitively
    ['nas', ['NAS']],
    ['NAS', ['NAS']],
    ['LAPTOP', ['laptop']],
    // vendor, IP, MAC or id
    ['synology', ['NAS']],
    ['192.168.2', ['laptop']],
    ['"ee:02"', ['laptop']],
    // network and group names
    ['office', ['laptop']],
    ['"living room"', ['NAS']],
    ['kids', ['NAS']],
    // with operators and field terms
    ['name:nas OR laptop', ['NAS', 'laptop']],
    ['apple AND online:false', ['laptop']],
    ['NOT kids', ['laptop']],
    ['nothing-like-this', []],
  ])('%s -> %j', async (query, expected) => {
    expect(await names(query)).toEqual(expected);
  });
});

describe('search_target_lists free text', () => {
  const LISTS = [
    {
      id: 'TL-1',
      name: 'Gaming Sites',
      owner: 'global',
      category: 'games',
      targets: ['steam.com'],
      notes: 'Consoles and PCs',
    },
    {
      id: 'TL-2',
      name: 'Social Block',
      owner: 'global',
      category: 'social',
      targets: ['facebook.com'],
      notes: 'Blocks social media',
    },
  ];

  async function ids(query: string) {
    const { client } = makeClient(LISTS);
    (client as any).request = jest.fn(async () => LISTS);
    const res = await new SearchTargetListsHandler().execute({ query }, client);
    expect(body(res).message).toBeUndefined();
    expect(res.isError).toBeFalsy();
    return (body(res).data.target_lists as any[]).map(list => list.id);
  }

  it.each([
    // name, notes, an entry; case-insensitively
    ['gaming', ['TL-1']],
    ['GAMING', ['TL-1']],
    ['consoles', ['TL-1']],
    ['"social media"', ['TL-2']],
    ['facebook', ['TL-2']],
    ['steam OR facebook', ['TL-1', 'TL-2']],
    ['block AND category:social', ['TL-2']],
    ['nothing-like-this', []],
  ])('%s -> %j', async (query, expected) => {
    expect(await ids(query)).toEqual(expected);
  });
});
