/**
 * The complexity limits: each refusal names the limit it hit, with the
 * count and the maximum, and every search tool answers a query the same
 * way. Live, search_devices refused name:*a*b*c*d*e*f*g*h*i*j* (11
 * wildcards) as "Query contains invalid field names": the complexity check
 * ran inside the field check, only in the five search_* tools, and not for
 * free text alone. The wildcard limit is gone: matchesWildcard takes fewer
 * than (n + 1)(m + 1) steps, and the 2,000-character limit bounds m. The
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
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';

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

const NAME = 'abcdefghij';

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
        data: [
          { id: 'aa:bb:cc:dd:ee:01', gid: 'box-a', name: NAME, ip: '10.0.0.1' },
          {
            id: 'aa:bb:cc:dd:ee:02',
            gid: 'box-a',
            name: 'nas',
            ip: '10.0.0.2',
          },
        ],
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: [{ id: 'l1', name: NAME, owner: 'global', targets: ['a.com'] }],
      };
    }
    if (url === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: 1,
          results: [
            {
              id: 'r1',
              action: 'block',
              status: 'active',
              target: { type: 'domain', value: NAME },
            },
          ],
        },
      };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

const TOOLS = [
  ['search_flows', SearchFlowsHandler],
  ['search_alarms', SearchAlarmsHandler],
  ['get_flow_data', GetFlowDataHandler],
  ['get_active_alarms', GetActiveAlarmsHandler],
  ['search_devices', SearchDevicesHandler],
  ['search_rules', SearchRulesHandler],
  ['search_target_lists', SearchTargetListsHandler],
] as const;

const OVER = {
  operators: `x${' OR x'.repeat(21)}`,
  terms: Array.from({ length: 16 }, (_, i) => `x${i}:1`).join(' '),
  ranges: Array.from({ length: 6 }, () => 'ts:[1 TO 2]').join(' '),
};

/** The one message each query over a limit gets */
const MESSAGES: Record<keyof typeof OVER, string> = {
  operators: 'Too many logical operators: 21 (at most 20)',
  terms: 'Too many field terms: 16 (at most 15)',
  ranges: 'Too many ranges: 6 (at most 5)',
};

describe('every search tool answers a query over a limit the same way', () => {
  it.each(
    TOOLS.flatMap(([name, Handler]) =>
      (Object.keys(OVER) as Array<keyof typeof OVER>).map(limit => ({
        name,
        Handler,
        limit,
        query: OVER[limit],
      }))
    )
  )(
    '$name refuses too many $limit before any request',
    async ({ Handler, limit, query }) => {
      const { client, get } = makeClient();
      const res = await new Handler().execute({ query, limit: 10 }, client);
      expect(res.isError).toBe(true);
      const error = body(res);
      expect(error.message).toBe('Query is too complex');
      expect(error.details.complexity_errors).toEqual([MESSAGES[limit]]);
      expect(JSON.stringify(error)).not.toContain('invalid field names');
      expect(get).not.toHaveBeenCalled();
    }
  );
});

describe('any number of wildcards', () => {
  it('search_devices finds name:*a*b*c*d*e*f*g*h*i*j*', async () => {
    const { client } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query: 'name:*a*b*c*d*e*f*g*h*i*j*', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.devices.map((device: any) => device.name)).toEqual([
      NAME,
    ]);
  });

  it.each(TOOLS)(
    '%s takes free text with 11 and with 500 wildcards, with one request',
    async (_name, Handler) => {
      for (const query of ['*a*b*c*d*e*f*g*h*i*j*', `${'*a'.repeat(499)}*`]) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect([query.length, res.isError]).toEqual([query.length, undefined]);
        expect(get).toHaveBeenCalledTimes(1);
      }
    }
  );
});

describe('no limit of its own in search_devices', () => {
  // client.searchDevices ran formatQueryForAPI, which refused a legacy
  // complexity score over 10 (1, plus 1 a term, 3 a wildcard term and 0.5
  // an operator): 7 name terms joined by OR were "Query too complex (11)"
  it.each([
    'name:a OR name:b OR name:c OR name:d OR name:e OR name:f OR name:g',
    'name:*a* OR name:*b* OR name:*c*',
    // 15 terms and 14 operators, at the limits
    `name:x${' OR name:y'.repeat(14)}`,
  ])(
    'search_devices, search_rules and search_target_lists take %s',
    async query => {
      for (const Handler of [
        SearchDevicesHandler,
        SearchRulesHandler,
        SearchTargetListsHandler,
      ]) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect([Handler.name, res.isError]).toEqual([Handler.name, undefined]);
        expect(get).toHaveBeenCalledTimes(1);
      }
    }
  );
});
