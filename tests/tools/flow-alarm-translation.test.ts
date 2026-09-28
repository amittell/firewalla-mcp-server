/**
 * What the validators accept, the MSP translation sends well formed, and
 * the two tools on one endpoint send alike, from the #77 overview ("a
 * query-validation issue").
 *
 * search_flows and search_alarms combined the query with the time range
 * through mspAnd, which translates, before the client renamed qualifiers
 * (bytes: to total:, blocked:false to -status:blocked); get_flow_data and
 * get_active_alarms renamed first. On a stub, search_flows refused
 * bytes:>1MB OR NOT -total:>1MB as an OR between two fields, bytes and
 * total, and blocked:false OR NOT status:blocked as an OR with an excluded
 * term (quoting blocked:0, which nobody wrote), where get_flow_data sent
 * total:>1MB and -status:blocked. The API is stubbed; nothing leaves the
 * process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { QUOTED_TEXT, toMspQuery } from '../../src/utils/msp-query.js';
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
    rateLimit: 1000000,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async () => ({
    status: 200,
    data: { count: 0, results: [] },
  }));
  return { client, get };
}

/** What a tool did with a query: the query it sent, or its refusal */
async function outcome(
  Handler: any,
  query: string,
  { client, get }: ReturnType<typeof makeClient>
): Promise<{ sent?: string; refused?: string }> {
  get.mockClear();
  (client as any).cache.clear();
  const res = await new Handler().execute({ query, limit: 10 }, client);
  const body = JSON.parse(res.content[0].text);
  if (res.isError) {
    expect(get).not.toHaveBeenCalled();
    return { refused: String(body.message) };
  }
  expect(get).toHaveBeenCalledTimes(1);
  return { sent: get.mock.calls[0][1]?.params?.query };
}

/** Every query of up to `size` of the pieces, joined by spaces */
function corpus(pieces: string[], size: number): string[] {
  const queries: string[] = [];
  const build = (prefix: string[]) => {
    if (prefix.length > 0) {
      queries.push(prefix.join(' '));
    }
    if (prefix.length < size) {
      for (const piece of pieces) {
        build([...prefix, piece]);
      }
    }
  };
  build([]);
  return queries;
}

/**
 * Why a query sent to the API is not in its grammar, empty when it is: one
 * space-separated conjunction of field terms and free text, balanced, with
 * no operator word or parenthesis outside quotes, no lone -, no positive
 * field twice (the API reads it as OR), and unchanged by translation
 */
function notWellFormed(sent: string): string[] {
  const problems = queryStructureErrors(sent);
  const outside = sent
    .split(QUOTED_TEXT)
    .filter((_part, i) => i % 2 === 0)
    .join(' ');
  if (/[()]/.test(outside)) {
    problems.push('a parenthesis');
  }
  if (/(^|\s)(AND|OR|NOT)(\s|$)/.test(outside)) {
    problems.push('an operator word');
  }
  if (/(^|\s)-(\s|$)/.test(outside)) {
    problems.push('a lone -');
  }
  const positive = new Map<string, number>();
  for (const [, field] of outside.matchAll(/(?:^|\s)([\w.]+):/g)) {
    positive.set(field, (positive.get(field) ?? 0) + 1);
  }
  for (const [field, count] of positive) {
    if (count > 1) {
      problems.push(`${field} twice`);
    }
  }
  if (toMspQuery(sent) !== sent) {
    problems.push('changed by translation');
  }
  return problems;
}

/** The same outcome, with a relative time's seconds and status:1 set aside */
function comparable(result: { sent?: string; refused?: string }): string {
  if (result.refused !== undefined) {
    return 'refused';
  }
  return `sent ${(result.sent ?? '')
    .replace(/^status:1 /, '')
    .replace(/\d{9,}/g, 'T')}`;
}

describe('search_flows sends what get_flow_data sends', () => {
  it.each([
    ['bytes:>1MB OR NOT -total:>1MB', 'total:>1MB'],
    ['blocked:false OR NOT status:blocked', '-status:blocked'],
    ['status:blocked OR NOT blocked:false', 'status:blocked'],
    ['bytes:>=1MB AND total:<=5MB', 'total:1MB-5MB'],
    ['blocked:true region:US', 'status:blocked region:US'],
  ])('%s as %s', async (query, sent) => {
    const client = makeClient();
    expect(await outcome(SearchFlowsHandler, query, client)).toEqual({ sent });
    expect(await outcome(GetFlowDataHandler, query, client)).toEqual({ sent });
  });

  it('names the renamed field when both refuse', async () => {
    const client = makeClient();
    for (const Handler of [SearchFlowsHandler, GetFlowDataHandler]) {
      const { refused } = await outcome(
        Handler,
        'region:US OR bytes:>1MB',
        client
      );
      expect(refused).toContain(
        'an OR between different fields (region, total)'
      );
    }
  });
});

describe.each([
  {
    endpoint: 'flows',
    pair: [SearchFlowsHandler, GetFlowDataHandler],
    pieces: [
      'region:US,CN',
      'bytes:>1MB',
      'total:<5MB',
      'blocked:false',
      'status:blocked',
      'ts:1-2',
      '-total:>1MB',
      'NOT',
      'OR',
      'AND',
      '(',
      ')',
      'and',
      '"a OR b"',
      'device.name:*x*',
    ],
  },
  {
    endpoint: 'alarms',
    pair: [SearchAlarmsHandler, GetActiveAlarmsHandler],
    pieces: [
      'type:1,10',
      'status:2',
      '-status:1',
      'ts:1-2',
      'ts:>1h',
      'remote.region:US',
      'box.id:abc',
      'NOT',
      'OR',
      'AND',
      '(',
      ')',
      'or',
      "'a b'",
    ],
  },
])('every query of up to three pieces on $endpoint', ({ pair, pieces }) => {
  const queries = corpus(pieces, 3);

  it('both tools refuse or send alike, and what they send is well formed', async () => {
    const [Search, Get] = pair;
    const client = makeClient();
    const disagreements: string[] = [];
    const malformed: string[] = [];
    let sent = 0;
    for (const query of queries) {
      const a = await outcome(Search, query, client);
      const b = await outcome(Get, query, client);
      // The search tool also runs the syntax and field checks, which the
      // other leaves to the translation; compare where it translated
      if (
        a.refused !== undefined &&
        !/cannot be sent to the MSP API|is malformed/.test(a.refused)
      ) {
        continue;
      }
      if (comparable(a) !== comparable(b)) {
        disagreements.push(`${query}: ${comparable(a)} / ${comparable(b)}`);
      }
      for (const result of [a, b]) {
        if (result.sent !== undefined) {
          sent++;
          const problems = notWellFormed(result.sent);
          if (problems.length > 0) {
            malformed.push(
              `${query} -> ${result.sent}: ${problems.join(', ')}`
            );
          }
        }
      }
    }
    expect(queries.length).toBe(
      pieces.length + pieces.length ** 2 + pieces.length ** 3
    );
    expect(sent).toBeGreaterThan(1000);
    expect(disagreements.slice(0, 10)).toEqual([]);
    expect(malformed.slice(0, 10)).toEqual([]);
  });
});
