/**
 * Single-quoted text is quoted wherever double-quoted text is. toMspQuery
 * reads 'show ts:[1 TO 2]' as one phrase, but findBracketRange, which
 * toMspQuery and the search tools' first check run before it, skipped only
 * double-quoted text: it read [1 TO 2] as range syntax and refused the
 * query. withNotForMinus had the same gap, and the qualifier renames took
 * an apostrophe (Alex's) for a quote, so a bytes: after one was not
 * renamed. search_rules matches the phrase on the client; for flows and
 * alarms the phrase is refused for its colon, which the MSP API answers
 * with 400 (quoted-colon.test.ts), not as a range. The API is stubbed;
 * nothing leaves the process.
 */
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
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
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data:
      url === '/v2/rules'
        ? {
            count: 1,
            results: [
              {
                id: 'r1',
                action: 'block',
                status: 'active',
                direction: 'bidirection',
                target: { type: 'domain', value: 'example.com' },
                notes: 'show ts:[1 TO 2]',
              },
            ],
          }
        : { count: 0, results: [] },
  }));
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

  it('search_rules matches it as one phrase on the client', async () => {
    const { client, get } = makeClient();
    const res = await new SearchRulesHandler().execute(
      { query: "'show ts:[1 TO 2]'", limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(
      JSON.parse(res.content[0].text).data.rules.map((rule: any) => rule.id)
    ).toEqual(['r1']);
    // Free text is not sent to /v2/rules
    expect(sentQueries(get)).toEqual([undefined]);
  });

  it.each([
    ['search_flows', SearchFlowsHandler],
    ['search_alarms', SearchAlarmsHandler],
  ])(
    '%s reads it as one phrase, and refuses it for its colon',
    async (_name, Handler) => {
      const { client, get } = makeClient();
      const res = await new Handler().execute(
        { query: "'show ts:[1 TO 2]'", limit: 10 },
        client
      );
      expect(res.isError).toBe(true);
      const { message } = JSON.parse(res.content[0].text);
      expect(message).toContain('"show ts:[1 TO 2]" is a quoted phrase');
      expect(message).not.toContain('range syntax');
      expect(sentQueries(get)).toEqual([]);
    }
  );

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
