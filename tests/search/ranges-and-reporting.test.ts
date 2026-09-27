/**
 * Guards for three points of the review of #74:
 * - Ranges, numbers and addresses read as they did on main (334b3a6)
 *   after the to, apostrophe and quote changes: [low TO high] is refused
 *   with the field:low-high form, low-high stays one range, a comparison
 *   keeps a negative number, and IPv4 and IPv6 values with - and : are
 *   sent as written. Each of these answered the same on main.
 * - search_devices and search_target_lists report the query they matched
 *   against, as the API tools report the query they sent. They reported
 *   the validator's rewrite of it: -name:plain as NOT name:plain.
 * - Operator counts read uppercase AND, OR and NOT only.
 * The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';
import { mspTerms, toMspQuery } from '../../src/utils/msp-query.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { ResponseStandardizer } from '../../src/utils/response-standardizer.js';

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

const NAMES = ['plain', 'other'];

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
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

describe('ranges, numbers and addresses', () => {
  it.each([
    ['search_flows', SearchFlowsHandler, 'bytes:1000-2000', 'total:1000-2000'],
    ['search_flows', SearchFlowsHandler, 'ts:1-2', 'ts:1-2'],
    ['search_flows', SearchFlowsHandler, 'bytes:>=1MB', 'total:>=1MB'],
    ['search_flows', SearchFlowsHandler, 'download:>-5', 'download:>-5'],
    [
      'search_flows',
      SearchFlowsHandler,
      'device.ip:fe80::1',
      'device.ip:fe80::1',
    ],
    [
      'search_alarms',
      SearchAlarmsHandler,
      'device.ip:2001:db8::a-b',
      'device.ip:2001:db8::a-b',
    ],
    [
      'search_alarms',
      SearchAlarmsHandler,
      'device.ip:10.0.0.1',
      'device.ip:10.0.0.1',
    ],
  ] as const)('%s sends %s as %s', async (_name, Handler, query, sent) => {
    const { client, get } = makeClient();
    const res = await new Handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual([sent]);
  });

  it('refuses [low TO high] with the field:low-high form', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'bytes:[1000 TO 2000]', limit: 10 },
      client
    );
    expect(res.isError).toBe(true);
    expect(body(res).details.suggested_queries).toEqual(['total:1000-2000']);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads low-high as one range and a negative bound as a comparison', () => {
    expect(mspTerms('bytes:1000-2000')[0].kind).toBe('range');
    expect(mspTerms('ts:1-2')[0].kind).toBe('range');
    expect(mspTerms('download:>-5')[0].kind).toBe('comparison');
    expect(toMspQuery('bytes:>=1MB')).toBe('bytes:>=1MB');
  });

  it('parses a range, a number and addresses as before', () => {
    expect(queryParser.parse('ts:[1 TO 2]').ast).toEqual({
      type: 'range',
      field: 'ts',
      min: 1,
      max: 2,
      inclusive: true,
    });
    expect(queryParser.parse('100-200').ast).toEqual({
      type: 'text',
      value: '100-200',
    });
    expect(queryParser.parse('ip:fe80::1').ast).toEqual({
      type: 'field',
      field: 'ip',
      value: 'fe80::1',
      operator: '=',
    });
    expect(queryParser.parse('ip:10.0.0.1-10.0.0.9').ast).toEqual({
      type: 'field',
      field: 'ip',
      value: '10.0.0.1-10.0.0.9',
      operator: '=',
    });
    expect(queryParser.parse('bytes:>=1MB').ast).toEqual({
      type: 'comparison',
      field: 'bytes',
      operator: '>=',
      value: '1MB',
    });
  });
});

describe('search_devices and search_target_lists report the query they matched', () => {
  it.each([
    ['search_devices', SearchDevicesHandler],
    ['search_target_lists', SearchTargetListsHandler],
  ] as const)('%s', async (_name, Handler) => {
    const { client } = makeClient();
    const res = await new Handler().execute(
      { query: ' -name:plain ', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    const { data } = body(res);
    expect(data.query_executed).toBe('-name:plain');
    expect(data.query_info.final_query).toBe('-name:plain');
    expect(data.query_info.original_query).toBe(' -name:plain ');
  });
});

describe('operator counts read uppercase operators only', () => {
  it('the complexity class of a search response', () => {
    const classOf = (query: string) =>
      ResponseStandardizer.toSearchResponse([], {
        query,
        entityType: 'devices',
        executionTime: 0,
        cached: false,
      }).search_metadata?.query_complexity;
    expect(classOf('a or b and c or d')).toBe('simple');
    expect(classOf('a OR b AND c OR d')).toBe('complex');
  });

  it('the "Too many logical operators" limit', () => {
    const words = `name:x${' or y'.repeat(21)}`;
    const operators = `name:x${' OR name:y'.repeat(21)}`;
    const errors = (query: string) =>
      QuerySanitizer.validateQueryComplexity(query).errors.join(' ');
    expect(errors(words)).not.toContain('Too many logical operators');
    expect(errors(operators)).toContain('Too many logical operators (21)');
  });
});
