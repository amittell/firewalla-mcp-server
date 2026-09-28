/**
 * Every search tool refuses a structurally malformed or oversized query
 * before it translates or sends it, and they agree on what that is, from
 * the #74 overview: "Flow and alarm paths bypass structural sanitization."
 *
 * On a stub, search_flows, search_alarms, get_flow_data and
 * get_active_alarms each sent an unclosed [, a NUL, BEL, ESC or DEL and a
 * 2,001-character query to the API, and get_flow_data and
 * get_active_alarms sent 6 and 11 levels of parentheses, which the other
 * search tools refused as too complex; search_devices, search_rules and
 * search_target_lists refused them, but also refused name:"a(b", counting
 * the ( inside the quotes. The API is stubbed; nothing leaves the process.
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
import { queryStructureErrors } from '../../src/utils/query-structure.js';

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
          {
            id: 'aa:bb:cc:dd:ee:00',
            gid: 'box-a',
            name: 'Alex’s MacBook Air',
            ip: '10.0.0.2',
          },
          {
            id: 'aa:bb:cc:dd:ee:01',
            gid: 'box-a',
            name: 'nas',
            ip: '10.0.0.3',
          },
          {
            id: 'aa:bb:cc:dd:ee:02',
            gid: 'box-a',
            name: 'star*box',
            ip: '10.0.0.4',
          },
        ],
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: [
          {
            id: 'l1',
            name: 'Alex’s list',
            owner: 'global',
            targets: ['a.com'],
          },
          { id: 'l2', name: 'ads', owner: 'global', targets: ['b.com'] },
        ],
      };
    }
    if (url === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: 2,
          results: [
            {
              id: 'r1',
              action: 'block',
              status: 'active',
              target: { type: 'domain', value: 'x.example' },
              notes: 'Alex’s rule',
            },
            {
              id: 'r2',
              action: 'block',
              status: 'active',
              target: { type: 'domain', value: 'b.example' },
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

/** Each tool, and a field it takes */
const TOOLS = [
  { name: 'search_flows', Handler: SearchFlowsHandler, field: 'domain' },
  { name: 'search_alarms', Handler: SearchAlarmsHandler, field: 'type' },
  { name: 'get_flow_data', Handler: GetFlowDataHandler, field: 'domain' },
  { name: 'get_active_alarms', Handler: GetActiveAlarmsHandler, field: 'type' },
  { name: 'search_devices', Handler: SearchDevicesHandler, field: 'name' },
  { name: 'search_rules', Handler: SearchRulesHandler, field: 'action' },
  {
    name: 'search_target_lists',
    Handler: SearchTargetListsHandler,
    field: 'name',
  },
] as const;

/** Malformed queries for a field, and the message each gets */
function malformed(field: string): Array<[string, string, RegExp]> {
  return [
    ['an unclosed (', `${field}:x (`, /opens a parenthesis '\(' at position/],
    [
      'a ) with no (',
      `${field}:x )`,
      /closing parenthesis '\)' at position \d+ with no '\('/,
    ],
    ['an unclosed [', `${field}:[x`, /opens a bracket '\[' at position/],
    ['an unclosed "', `${field}:"x`, /opens a " quote at position/],
    ["an unclosed '", `${field}:'x`, /opens a ' quote at position/],
    ['a NUL', `${field}:x\u0000`, /control character \(U\+0000\)/],
    ['a BEL', `${field}:x\u0007y`, /control character \(U\+0007\)/],
    ['an ESC', `${field}:x\u001b`, /control character \(U\+001B\)/],
    ['a DEL', `${field}:x\u007f`, /control character \(U\+007F\)/],
    [
      '6 levels of parentheses',
      `${'('.repeat(6)}${field}:x${')'.repeat(6)}`,
      /nesting is too deep \(6 levels; maximum 5\)/,
    ],
    [
      '11 levels of parentheses',
      `${'('.repeat(11)}${field}:x${')'.repeat(11)}`,
      /nesting is too deep \(11 levels; maximum 5\)/,
    ],
    [
      '2,001 characters',
      `${field}:${'a'.repeat(2000 - field.length)}`,
      /too long \(2001 characters; maximum 2000\)/,
    ],
  ];
}

describe('queryStructureErrors', () => {
  it.each(malformed('domain'))('finds %s', (_label, query, message) => {
    const errors = queryStructureErrors(query);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
  });

  it.each([
    'domain:"a(b"',
    "domain:'x)'",
    'domain:"[1 TO"',
    'name:"say \\"hi\\" (loud"',
    "Alex's (MacBook)",
    'Café’s [1 TO 2]',
    `${'('.repeat(5)}domain:x${')'.repeat(5)}`,
    `domain:${'a'.repeat(1993)}`,
    'domain:x\ttype:1\nstatus:1\r',
    '*Alex’s*',
  ])('takes %j', query => {
    expect(queryStructureErrors(query)).toEqual([]);
  });

  it('counts 2,000 characters after trimming', () => {
    expect(queryStructureErrors(`  domain:${'a'.repeat(1993)}  `)).toEqual([]);
  });

  it('pairs each closer with the latest opener', () => {
    expect(queryStructureErrors('(a ] b)')).toEqual([
      "Query has a closing bracket ']' at position 3 with no '[' open before it",
    ]);
  });
});

describe('every search tool refuses a malformed query before any request', () => {
  it.each(
    TOOLS.flatMap(({ name, Handler, field }) =>
      malformed(field).map(([label, query, message]) => ({
        name,
        Handler,
        label,
        query,
        message,
      }))
    )
  )('$name refuses $label', async ({ Handler, query, message }) => {
    const { client, get } = makeClient();
    const res = await new Handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.message).toBe('Invalid query structure');
    expect(error.details.structure_errors.join(' ')).toMatch(message);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(TOOLS)(
    '$name takes a parenthesis inside quotes, 5 levels and 2,000 characters',
    async ({ Handler, field }) => {
      for (const query of [
        `${field}:"a(b"`,
        `${'('.repeat(5)}${field}:x${')'.repeat(5)}`,
        `${field}:${'a'.repeat(1999 - field.length)}`,
      ]) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect([query.slice(0, 20), res.isError]).toEqual([
          query.slice(0, 20),
          undefined,
        ]);
        expect(get).toHaveBeenCalledTimes(1);
      }
    }
  );
});
