/**
 * The query syntax check, the search parser, the enhanced validator and
 * toMspQuery read operators alike, as Copilot's review of #74 at 56d50fc
 * asked. x AND AND y passed the syntax check and failed later as
 * "Unexpected token: AND"; the parser refused NOT NOT x, which toMspQuery
 * reads as x, so search_devices refused it and search_flows sent it; and
 * search_devices refused -laptop as an "Unexpected character '-'" while it
 * took NOT laptop.
 * The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';
import { toMspQuery, withNotForMinus } from '../../src/utils/msp-query.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';
import { targetListMatchesQuery } from '../../src/utils/target-lists.js';
import { EnhancedQueryValidator } from '../../src/validation/enhanced-query-validator.js';

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

const DEVICES = [
  {
    id: 'aa:bb:cc:dd:ee:00',
    gid: 'box-a',
    name: 'nas',
    ip: '192.168.1.20',
    online: true,
    network: { id: 'n1', name: 'LAN' },
    group: { id: 'g1', name: 'kids' },
  },
  {
    id: 'aa:bb:cc:dd:ee:01',
    gid: 'box-a',
    name: 'laptop',
    ip: '192.168.1.21',
    online: false,
    network: { id: 'n2', name: 'Guest' },
  },
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
      return { status: 200, data: DEVICES };
    }
    if (url === '/v2/target-lists') {
      return { status: 200, data: [] };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);
const deviceNames = (res: any): string[] =>
  body(res).data.devices.map((device: any) => device.name);

describe('operators read the same in every layer', () => {
  it.each([
    ['x AND AND y', "'AND' and 'AND'"],
    ['x OR OR y', "'OR' and 'OR'"],
    ['x AND OR y', "'AND' and 'OR'"],
    ['x NOT AND y', "'NOT' and 'AND'"],
  ])(
    'the syntax check refuses %s as two operators with no term between',
    (query, pair) => {
      const result = validateFirewallaQuerySyntax(query);
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toContain(
        `Logical operators ${pair} at positions`
      );
      expect(result.errors.join(' ')).toContain('have no term between them');
      // The parser and toMspQuery refuse it too
      expect(queryParser.parse(query).errors.length).toBeGreaterThan(0);
      expect(() => toMspQuery(query)).toThrow();
    }
  );

  it.each([
    ['(x NOT)', "has no term after it, before ')'"],
    ['(x AND)', "has no term after it, before ')'"],
    ['(AND x)', "has no term before it, after '('"],
    ['y OR (OR x)', "has no term before it, after '('"],
  ])('the syntax check refuses %s', (query, message) => {
    const result = validateFirewallaQuerySyntax(query);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain(message);
    expect(queryParser.parse(query).errors.length).toBeGreaterThan(0);
  });

  it.each([
    'x AND NOT y',
    'x OR NOT y',
    'NOT NOT x',
    'NOT (x OR y)',
    '(NOT x) AND y',
    'x and and y',
    '"a AND AND b"',
  ])('the syntax check and the parser accept %s', query => {
    expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
    expect(queryParser.parse(query).errors).toEqual([]);
  });

  it('the parser reads NOT NOT x as x, as toMspQuery does', () => {
    expect(queryParser.parse('NOT NOT name:nas').ast).toEqual({
      type: 'logical',
      operator: 'NOT',
      operand: {
        type: 'logical',
        operator: 'NOT',
        operand: { type: 'field', field: 'name', value: 'nas', operator: '=' },
      },
    });
    expect(toMspQuery('NOT NOT name:nas')).toBe('name:nas');
  });

  it('search_devices matches NOT NOT x as x, and search_flows sends x', async () => {
    const devices = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query: 'NOT NOT name:nas', limit: 10 },
      devices.client
    );
    expect(res.isError).toBeFalsy();
    expect(deviceNames(res)).toEqual(['nas']);

    const flows = makeClient();
    const flowRes = await new SearchFlowsHandler().execute(
      { query: 'NOT NOT protocol:tcp', limit: 10 },
      flows.client
    );
    expect(flowRes.isError).toBeFalsy();
    expect(sentQueries(flows.get)).toEqual(['protocol:tcp']);
  });

  it.each([
    { name: 'search_devices', Handler: SearchDevicesHandler },
    { name: 'search_flows', Handler: SearchFlowsHandler },
    { name: 'search_target_lists', Handler: SearchTargetListsHandler },
  ] as const)(
    '$name refuses x AND AND y as two operators, before any request',
    async ({ Handler }) => {
      const { client, get } = makeClient();
      const res = await new Handler().execute(
        { query: 'name:x AND AND name:y', limit: 10 },
        client
      );
      expect(res.isError).toBe(true);
      expect(JSON.stringify(body(res))).toContain(
        "Logical operators 'AND' and 'AND'"
      );
      expect(get).not.toHaveBeenCalled();
    }
  );

  it.each([
    { name: 'search_devices', Handler: SearchDevicesHandler },
    { name: 'search_flows', Handler: SearchFlowsHandler },
  ] as const)(
    '$name refuses a dangling operator with the beginning-or-end message',
    async ({ Handler }) => {
      for (const query of ['AND name:x', 'name:x OR', 'NOT']) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect(res.isError).toBe(true);
        expect(JSON.stringify(body(res))).toContain(
          'cannot be at the beginning or end of query'
        );
        expect(get).not.toHaveBeenCalled();
      }
    }
  );
});

describe('a - before free text excludes it, as NOT does', () => {
  it.each([
    ['-laptop', 'NOT laptop'],
    ['nas -laptop', 'nas NOT laptop'],
    ['-"a b" x', 'NOT "a b" x'],
    ["x -'a b'", "x NOT 'a b'"],
    ['-*phone*', 'NOT *phone*'],
    ['(-x OR y)', '(NOT x OR y)'],
    ['name:"a -b" -c', 'name:"a -b" NOT c'],
    ['- x', '- x'],
    ['x -', 'x -'],
    ['a-b ts:1-2 download:>-5', 'a-b ts:1-2 download:>-5'],
  ])('withNotForMinus reads %s as %s', (query, expected) => {
    expect(withNotForMinus(query)).toBe(expected);
  });

  it.each(['-laptop', 'nas -laptop', '-"lap"', "-'lap'", 'NOT laptop'])(
    'search_devices matches %s as NOT laptop',
    async query => {
      const { client } = makeClient();
      const res = await new SearchDevicesHandler().execute(
        { query, limit: 10 },
        client
      );
      expect(res.isError).toBeFalsy();
      expect(deviceNames(res)).toEqual(['nas']);
      expect(body(res).data.query_executed).toBe(query);
    }
  );

  it('search_target_lists matches -name as NOT name', () => {
    const list = { name: 'kids', targets: ['example.com'] };
    expect(targetListMatchesQuery(list, '-kids')).toBe(false);
    expect(targetListMatchesQuery(list, '-"example.com"')).toBe(false);
    expect(targetListMatchesQuery(list, '-other')).toBe(true);
    expect(targetListMatchesQuery(list, 'kids -other')).toBe(true);
  });

  it.each([
    { name: 'search_flows', Handler: SearchFlowsHandler },
    { name: 'search_alarms', Handler: SearchAlarmsHandler },
    { name: 'search_rules', Handler: SearchRulesHandler },
  ] as const)(
    '$name refuses -laptop as it refuses NOT laptop: the API excludes field values only',
    async ({ Handler }) => {
      for (const query of ['-laptop', 'NOT laptop']) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect(res.isError).toBe(true);
        expect(body(res).message).toContain('excludes free text');
        expect(get).not.toHaveBeenCalled();
      }
    }
  );

  it.each([
    { name: 'search_devices', Handler: SearchDevicesHandler },
    { name: 'search_target_lists', Handler: SearchTargetListsHandler },
    { name: 'search_flows', Handler: SearchFlowsHandler },
    { name: 'search_alarms', Handler: SearchAlarmsHandler },
    { name: 'search_rules', Handler: SearchRulesHandler },
  ] as const)(
    '$name refuses a - before nothing as starting no term',
    async ({ Handler }) => {
      for (const query of ['- laptop', 'nas -', '--x']) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect(res.isError).toBe(true);
        expect(body(res).details.syntax_errors.join(' ')).toContain(
          "'-' at position"
        );
        expect(body(res).details.syntax_errors.join(' ')).toContain(
          'starts no term'
        );
        expect(get).not.toHaveBeenCalled();
      }
    }
  );
});

describe('the syntax check refuses what the parser refuses', () => {
  // Every query of up to four of these pieces, for each entity type the
  // parser checks, through the syntax check on the query as written and
  // through the enhanced validator and the parser on withNotForMinus of it,
  // as the search tools run them. [low TO high] is left out: the syntax
  // check refuses it with the field:low-high form, by design, as the tools
  // do before either of these runs, and the parser reads it.
  const PIECES = [
    'x',
    'AND',
    'OR',
    'NOT',
    '(',
    ')',
    '"a AND b"',
    "'a OR b'",
    'and',
    '-x',
    '-"a b"',
    '-',
    '--x',
    '-(',
  ];
  const queries: string[] = [];
  const build = (prefix: string[]) => {
    if (prefix.length > 0) {
      queries.push(prefix.join(' '));
    }
    if (prefix.length < 4) {
      for (const piece of PIECES) {
        build([...prefix, piece]);
      }
    }
  };
  build([]);

  it.each([
    ['devices', 'name:*a*', '-name:y'],
    ['target_lists', 'name:*a*', '-name:y'],
    ['rules', 'action:*a*', '-action:block'],
    ['flows', 'protocol:*a*', '-protocol:tcp'],
  ] as const)('%s', (entity, wildcard, excluded) => {
    const disagreements: string[] = [];
    let count = 0;
    for (const base of queries) {
      for (const query of [
        base,
        `${base} ${wildcard}`,
        `${excluded} ${base}`,
      ]) {
        count++;
        const syntax = validateFirewallaQuerySyntax(query).isValid;
        const rewritten = withNotForMinus(query);
        const parsed = queryParser.parse(rewritten, entity).errors.length === 0;
        const enhanced =
          !syntax ||
          EnhancedQueryValidator.validateQuery(rewritten, entity).isValid;
        if (syntax !== parsed || !enhanced) {
          disagreements.push(
            `${query}: syntax ${syntax}, parser ${parsed}, enhanced ${enhanced}`
          );
        }
      }
    }
    expect(count).toBe(3 * queries.length);
    expect(queries.length).toBe(41370);
    expect(disagreements.slice(0, 10)).toEqual([]);
  });
});
