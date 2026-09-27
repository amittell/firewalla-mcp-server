/**
 * The query sanitizer refused ordinary names as "potentially dangerous
 * content": its patterns for shell commands (cat, top, ps, kill), network
 * tools (ping, dig), SQL, script, templates and file paths matched words
 * in device, rule and list names. The query goes only into the query
 * string of an HTTPS request and into matching on the client, so those
 * patterns guarded nothing. Control characters and the length limit are
 * still checked. GET /v2/devices is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';

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

const NAMES = [
  'Cat Feeder',
  'Top Floor',
  'ping pong',
  'PS 5',
  'kill switch',
  'dig site',
  'nas',
];

function makeClient() {
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
  get.mockResolvedValue({
    status: 200,
    data: NAMES.map((name, i) => ({
      id: `aa:bb:cc:dd:ee:0${i}`,
      gid: 'box-a',
      name,
      ip: `192.168.1.${20 + i}`,
      online: true,
    })),
  });
  return { client, get };
}

async function searchDevices(query: string) {
  const { client } = makeClient();
  const res = await new SearchDevicesHandler().execute(
    { query, limit: 50 },
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

describe('search_devices finds names that looked like commands', () => {
  it.each([
    ['Cat Feeder', 'Cat Feeder'],
    ['name:"Top Floor"', 'Top Floor'],
    ['ping pong', 'ping pong'],
    ['name:"PS 5"', 'PS 5'],
    ['kill switch', 'kill switch'],
    ['dig site', 'dig site'],
  ])('%s', async (query, name) => {
    const { res, body, names } = await searchDevices(query);
    expect([query, res.isError ? body.message : names]).toEqual([
      query,
      [name],
    ]);
  });
});

describe('search_flows and search_alarms send words that looked like SQL', () => {
  it.each([
    ['search_flows', SearchFlowsHandler],
    ['search_alarms', SearchAlarmsHandler],
  ])('%s sends drop table', async (_name, Handler) => {
    const { client, get } = makeClient();
    get.mockResolvedValue({ status: 200, data: { count: 0, results: [] } });
    const res = await new Handler().execute(
      { query: 'drop table', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(get.mock.calls.map(([, config]) => config?.params?.query)).toEqual([
      'drop table',
    ]);
  });
});

describe('the sanitizer still refuses', () => {
  it.each([
    ['a NUL', 'nas\u0000x'],
    ['an escape sequence', 'nas \u001b[2J'],
    ['a backspace', 'nas\u0008'],
    ['DEL', 'nas\u007f'],
  ])('%s, through search_devices', async (_name, query) => {
    const { res, body } = await searchDevices(query);
    expect(res.isError).toBe(true);
    expect(body.message).toContain('Query contains control characters');
    expect(QuerySanitizer.sanitizeSearchQuery(query).errors).toContain(
      'Query contains control characters'
    );
  });

  it('a query over 2000 characters, through search_devices', async () => {
    const query = `name:${'a'.repeat(2001)}`;
    const { res, body } = await searchDevices(query);
    expect(res.isError).toBe(true);
    expect(body.message).toContain(
      'Query is too long (maximum 2000 characters)'
    );
    expect(
      QuerySanitizer.sanitizeSearchQuery(`name:${'a'.repeat(1995)}`).isValid
    ).toBe(true);
  });

  it('nesting deeper than 10 levels', () => {
    expect(
      QuerySanitizer.sanitizeSearchQuery(
        `${'('.repeat(11)}nas${')'.repeat(11)}`
      ).errors
    ).toContain('Query nesting too deep (maximum 10 levels)');
  });
});

describe('the sanitizer no longer refuses', () => {
  it.each([
    'cat feeder',
    'top floor',
    'name:"rm -rf"',
    'notes:"ftp://files.example"',
    'notes:"../shared"',
    '"C++ *"',
  ])('%s', query => {
    expect(QuerySanitizer.sanitizeSearchQuery(query).errors).toEqual([]);
  });
});
