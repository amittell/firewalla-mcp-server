/**
 * Single-quoted text is quoted wherever double-quoted text is. toMspQuery
 * sends 'show ts:[1 TO 2]' as one phrase, but findBracketRange, which
 * toMspQuery and the search tools' first check run before it, skipped only
 * double-quoted text: it read [1 TO 2] as range syntax and refused the
 * query. withNotForMinus had the same gap, and the qualifier renames took
 * an apostrophe (Alex's) for a quote, so a bytes: after one was not
 * renamed. The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import {
  findBracketRange,
  toMspQuery,
  withNotForMinus,
} from '../../src/utils/msp-query.js';
import { translateToMspQualifiers } from '../../src/utils/msp-qualifiers.js';

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
  get.mockResolvedValue({ status: 200, data: { count: 0, results: [] } });
  return { client, get };
}

/** The query of every GET that went out */
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

describe('single-quoted text is shielded where double-quoted text is', () => {
  it('findBracketRange does not read a range inside single quotes', () => {
    expect(findBracketRange("'show ts:[1 TO 2]'")).toBeUndefined();
    expect(findBracketRange('"show ts:[1 TO 2]"')).toBeUndefined();
    expect(findBracketRange("ts:[1 TO 2] 'x'")?.part).toBe('ts:[1 TO 2]');
  });

  it('toMspQuery sends it as one phrase', () => {
    expect(toMspQuery("'show ts:[1 TO 2]'")).toBe('"show ts:[1 TO 2]"');
  });

  it.each([
    ['search_flows', SearchFlowsHandler],
    ['search_alarms', SearchAlarmsHandler],
  ])('%s sends it as one quoted phrase', async (_name, Handler) => {
    const { client, get } = makeClient();
    const res = await new Handler().execute(
      { query: "'show ts:[1 TO 2]'", limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual(['"show ts:[1 TO 2]"']);
  });

  it('withNotForMinus leaves a - inside single quotes', () => {
    expect(withNotForMinus("'a -b:c' -d:e")).toBe("'a -b:c' NOT d:e");
  });

  it('the qualifier renames skip single-quoted text but not an apostrophe', () => {
    expect(translateToMspQualifiers("'bytes:5' bytes:>1MB", 'flows')).toBe(
      "'bytes:5' total:>1MB"
    );
    // Alex's and it's opened a "quote" that hid the bytes: between them
    expect(translateToMspQualifiers("Alex's bytes:>1MB it's", 'flows')).toBe(
      "Alex's total:>1MB it's"
    );
  });
});
