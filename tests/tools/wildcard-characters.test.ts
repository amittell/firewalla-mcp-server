/**
 * A wildcard value may hold any character that is text. The query syntax
 * check allowed only [*\w.:,-] around a `*`, so every search tool refused
 * name:*Disney+*, C++*, *AT&T*, *[kids]* and any non-ASCII name as an
 * "Invalid wildcard pattern", and search_devices' parser also refused a +
 * next to a * as a "dangerous sequence". The API grammar gives none of
 * those characters a meaning (docs/firewalla-api-reference.md, "Quoted
 * Search"), and the client matches * without a regular expression. The
 * API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';

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
  'Disney+ box',
  'C++ laptop',
  'AT&T router',
  '[kids] tablet',
  'Café TV',
  '客厅电视',
  'Büro 🖨️ printer',
  'Alex’s MacBook Air',
  'plain',
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
  get.mockImplementation(async (url: string) => {
    if (url === '/v2/devices') {
      return {
        status: 200,
        data: NAMES.map((name, i) => ({
          id: `aa:bb:cc:dd:ee:0${i}`,
          gid: 'box-a',
          name,
          ip: `192.168.1.${20 + i}`,
          online: true,
        })),
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: NAMES.map((name, i) => ({
          id: `list-${i}`,
          name,
          owner: 'global',
          targets: [],
        })),
      };
    }
    if (url === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: NAMES.length,
          results: NAMES.map((value, i) => ({
            id: `rule-${i}`,
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value },
          })),
        },
      };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

async function names(Handler: any, key: string, query: string) {
  const { client } = makeClient();
  const res = await new Handler().execute({ query, limit: 50 }, client);
  const body = JSON.parse(res.content[0].text);
  if (res.isError) {
    return body.message;
  }
  return (body.data[key] as any[]).map(item =>
    key === 'rules'
      ? NAMES[Number(String(item.id).replace('rule-', ''))]
      : item.name
  );
}

const CASES: Array<[string, string]> = [
  ['*Disney+*', 'Disney+ box'],
  ['C++*', 'C++ laptop'],
  ['*AT&T*', 'AT&T router'],
  ['*[kids]*', '[kids] tablet'],
  ['*Café*', 'Café TV'],
  ['*客厅*', '客厅电视'],
  ['*🖨️*', 'Büro 🖨️ printer'],
  // The U+2019 apostrophe device names in live alarms carry
  ['*Alex’s*', 'Alex’s MacBook Air'],
];

describe('wildcard values with any text are matched on the client', () => {
  it.each(CASES)('search_devices name:%s', async (value, name) => {
    expect(
      await names(SearchDevicesHandler, 'devices', `name:${value}`)
    ).toEqual([name]);
  });

  it.each(CASES)('search_target_lists name:%s', async (value, name) => {
    expect(
      await names(SearchTargetListsHandler, 'target_lists', `name:${value}`)
    ).toEqual([name]);
  });

  it.each(CASES)('search_rules target.value:%s', async (value, name) => {
    expect(
      await names(SearchRulesHandler, 'rules', `target.value:${value}`)
    ).toEqual([name]);
  });
});

describe('and sent to the API as written', () => {
  it.each(CASES.map(([value]) => value))(
    'search_flows and search_alarms send %s',
    async value => {
      for (const [Handler, field] of [
        [SearchFlowsHandler, 'domain'],
        [SearchAlarmsHandler, 'device.name'],
      ] as const) {
        const { client, get } = makeClient();
        const res = await new Handler().execute(
          { query: `${field}:${value}`, limit: 10 },
          client
        );
        expect(res.isError).toBeFalsy();
        expect(
          get.mock.calls.map(([, config]) => config?.params?.query)
        ).toEqual([`${field}:${value}`]);
      }
    }
  );
});

describe('the query syntax check', () => {
  it.each(CASES.map(([value]) => value))('accepts name:%s', value => {
    expect(validateFirewallaQuerySyntax(`name:${value}`).errors).toEqual([]);
  });

  it.each([
    ['a control character', 'name:*a\u0007b*'],
    ['half a surrogate pair', 'name:*a\ud800b*'],
    // ? is a wildcard marker too: the check ran only with a *
    ['half a surrogate pair and a ?', 'name:?a\ud800b?'],
  ])('still refuses a wildcard value with %s', (_what, query) => {
    const { errors } = validateFirewallaQuerySyntax(query);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid wildcard pattern');
  });

  it('still reads a value that starts with [ as a range', () => {
    expect(validateFirewallaQuerySyntax('bytes:[1 TO 2]').isValid).toBe(false);
  });
});
