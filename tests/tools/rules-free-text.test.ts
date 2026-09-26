/**
 * Free text in a rule search is matched on the client. Measured live
 * 2026-09-26: of 98 rules, one had a given word in its target value, and
 * GET /v2/rules?query=<that word> returned 0 rules, so search_rules with the
 * word returned none. The stub below answers as the API did: no rules for a
 * query with a free-text word, every rule otherwise.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchRulesHandler } from '../../src/tools/handlers/search.js';
import { GetNetworkRulesHandler } from '../../src/tools/handlers/rules.js';
import { mspSplitText } from '../../src/utils/msp-query.js';
import { renderMarkdown } from '../../src/utils/response-format.js';

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

const RULES = [
  {
    id: 'r1',
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'tiktokcdn.example' },
  },
  {
    id: 'r2',
    action: 'allow',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'school.example' },
    notes: 'Homework site for the kids',
  },
  {
    id: 'r3',
    action: 'block',
    status: 'paused',
    direction: 'outbound',
    name: 'Gaming at night',
    target: { type: 'category', value: 'games' },
    scope: { type: 'network', value: 'guest-network-id' },
  },
];

/** A term without a qualifier: a word or a quoted phrase */
const hasFreeText = (query: unknown): boolean =>
  typeof query === 'string' &&
  (query.match(/"[^"]*"|\S+/g) || []).some(term => !/^-?[\w.]+:/.test(term));

function makeClient() {
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
  get.mockImplementation(async (_endpoint: string, config: any) => {
    const results = hasFreeText(config?.params?.query) ? [] : RULES;
    return { status: 200, data: { count: results.length, results } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

async function searchRules(query: string) {
  const { client, get } = makeClient();
  const res = await new SearchRulesHandler().execute(
    { query, limit: 50 },
    client
  );
  return { res, get, ids: res.isError ? undefined : (body(res).data.rules as any[]).map(rule => rule.id) };
}

describe('mspSplitText', () => {
  it.each([
    ['tiktok', '', ['tiktok']],
    ['tiktok action:block', 'action:block', ['tiktok']],
    ['tiktok AND action:block AND NOT status:paused', 'action:block -status:paused', ['tiktok']],
    ['"homework site" kids', '', ['"homework site"', 'kids']],
    ['action:block OR action:allow', 'action:block,allow', []],
  ])('%s', (query, fields, text) => {
    expect(mspSplitText(query)).toEqual({ fields, text });
  });
});

describe('search_rules free text', () => {
  it('finds the rule whose target value has the word, without sending the word', async () => {
    const { res, get, ids } = await searchRules('tiktok');
    expect(res.isError).toBeFalsy();
    expect(ids).toEqual(['r1']);
    expect(sentQueries(get)).toEqual([undefined]);
    expect(body(res).data.metadata).toBeDefined();
  });

  it.each([
    // case-insensitively, in target value, notes, name, action, target
    // type and scope
    ['TikTok', ['r1']],
    ['homework', ['r2']],
    ['"homework site"', ['r2']],
    ['gaming', ['r3']],
    ['allow', ['r2']],
    ['category', ['r3']],
    ['guest-network', ['r3']],
    ['example', ['r1', 'r2']],
    // every word must match
    ['homework kids', ['r2']],
    ['homework tiktok', []],
    ['nothing-like-this', []],
  ])('%s -> %j', async (query, expected) => {
    expect((await searchRules(query)).ids).toEqual(expected);
  });

  it('sends the field terms and matches the words among their rules', async () => {
    const { get, ids } = await searchRules('example AND action:block');
    expect(sentQueries(get)).toEqual(['action:block']);
    // the stub ignores action:, and the client re-check keeps block rules
    expect(ids).toEqual(['r1']);
  });

  it('keeps the box scope when only words are given', async () => {
    const { client, get } = makeClient();
    (client as any).config.boxId = '00000000-0000-0000-0000-000000000000';
    const res = await new SearchRulesHandler().execute(
      { query: 'tiktok', limit: 50 },
      client
    );
    expect(sentQueries(get)).toEqual([
      'box.id:00000000-0000-0000-0000-000000000000',
    ]);
    expect((body(res).data.rules as any[]).map(rule => rule.id)).toEqual(['r1']);
  });

  it('refuses an OR with free text, which one request cannot answer', async () => {
    const { res, get } = await searchRules('tiktok OR twitter');
    expect(res.isError).toBe(true);
    expect(body(res).errorType).toBe('validation_error');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('get_network_rules free text', () => {
  it('matches the words on the client and counts what it returns', async () => {
    const { client, get } = makeClient();
    const res = await new GetNetworkRulesHandler().execute(
      { query: 'homework' },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual([undefined]);
    const data = body(res).data;
    const rules = data.rules ?? data.results;
    expect(rules.map((rule: any) => rule.id)).toEqual(['r2']);
  });
});

describe('FirewallaClient.searchRules free text', () => {
  // The client's other rule search, which its cross-reference dispatcher
  // calls; it reads rules through the same code as getNetworkRules
  it('finds the rule whose target value has the word, without sending the word', async () => {
    const { client, get } = makeClient();
    const result = await client.searchRules({ query: 'tiktok', limit: 50 });
    expect(sentQueries(get)).toEqual([undefined]);
    expect(result.results.map(rule => rule.id)).toEqual(['r1']);
    expect(result.count).toBe(1);
  });

  it('sends the field terms and matches the words among their rules', async () => {
    const { client, get } = makeClient();
    const result = await client.searchRules({
      query: 'homework AND action:allow',
      limit: 50,
    });
    expect(sentQueries(get)).toEqual(['action:allow']);
    expect(result.results.map(rule => rule.id)).toEqual(['r2']);
  });
});

describe('free text reads every rule the other terms match', () => {
  // 300 rules, of which only the 251st has the word in its target. The
  // stub honors a limit the way a capped API would: search_rules sent
  // limit*2 (at most 2,000) and get_network_rules its limit, so the match
  // past them was never checked and both tools answered with no rules.
  const MANY = Array.from({ length: 300 }, (_, i) => ({
    id: `r${i + 1}`,
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: {
      type: 'domain',
      value: i === 250 ? 'needle.example' : `site${i + 1}.example`,
    },
  }));

  function cappedClient(extra: Record<string, unknown> = {}) {
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
    get.mockImplementation(async (_endpoint: string, config: any) => {
      const limit = config?.params?.limit;
      const results = typeof limit === 'number' ? MANY.slice(0, limit) : MANY;
      return {
        status: 200,
        data: { count: results.length, results, ...extra },
      };
    });
    return { client, get };
  }

  it('search_rules finds the match past the first page, and says it checked every rule', async () => {
    const { client, get } = cappedClient();
    const res = await new SearchRulesHandler().execute(
      { query: 'needle', limit: 10 },
      client
    );
    expect(body(res).message).toBeUndefined();
    expect(get.mock.calls[0][1].params.limit).toBeUndefined();
    const data = body(res).data;
    expect(data.rules.map((rule: any) => rule.id)).toEqual(['r251']);
    expect(data.free_text_coverage).toEqual({
      rules_checked: 300,
      rules_matched: 1,
      complete: true,
    });
  });

  it('get_network_rules finds it too', async () => {
    const { client, get } = cappedClient();
    const res = await new GetNetworkRulesHandler().execute(
      { query: 'needle', limit: 5 },
      client
    );
    expect(get.mock.calls[0][1].params.limit).toBeUndefined();
    const data = body(res).data;
    expect(data.rules.map((rule: any) => rule.id)).toEqual(['r251']);
    expect(data.free_text_coverage.complete).toBe(true);
  });

  it('says when the API answered as if it had more rules than it sent', async () => {
    const { client } = cappedClient({ next_cursor: 'more' });
    const res = await new SearchRulesHandler().execute(
      { query: 'needle', limit: 10 },
      client
    );
    const { free_text_coverage: coverage } = body(res).data;
    expect(coverage.complete).toBe(false);
    expect(coverage.note).toContain('next_cursor');
  });

  it('says so for a count above the rules returned', async () => {
    const { client } = cappedClient({ count: 5000 });
    const res = await new GetNetworkRulesHandler().execute(
      { query: 'needle' },
      client
    );
    const { free_text_coverage: coverage } = body(res).data;
    expect(coverage).toMatchObject({
      rules_checked: 300,
      rules_matched: 1,
      complete: false,
    });
    expect(coverage.note).toContain('counted 5000 rules');
  });

  it('sends the limit, and reports no coverage, without free text', async () => {
    const { client, get } = cappedClient();
    const res = await new GetNetworkRulesHandler().execute(
      { query: 'action:block', limit: 5 },
      client
    );
    expect(get.mock.calls[0][1].params.limit).toBe(5);
    expect(body(res).data.free_text_coverage).toBeUndefined();
  });
});

describe('where rule coverage goes', () => {
  // search_rules and get_network_rules put it under data.coverage, the key
  // search_flows and get_flow_data use for their paging coverage (oldest_ts,
  // newest_ts, api_requests, stopped_reason); the same key held two shapes
  it.each([
    ['search_rules', () => new SearchRulesHandler()],
    ['get_network_rules', () => new GetNetworkRulesHandler()],
  ])('%s answers free_text_coverage, not coverage', async (_tool, handler) => {
    const { client } = makeClient();
    const res = await handler().execute({ query: 'tiktok', limit: 10 }, client);
    const { data } = body(res);
    expect(data.coverage).toBeUndefined();
    expect(data.free_text_coverage).toEqual({
      rules_checked: 3,
      rules_matched: 1,
      complete: true,
    });
  });

  it('the markdown view shows it under its name', async () => {
    const { client } = makeClient();
    const res = await new SearchRulesHandler().execute(
      { query: 'tiktok', limit: 10 },
      client
    );
    const markdown = renderMarkdown('search_rules', body(res));
    expect(markdown).toContain('- **free_text_coverage:**');
    expect(markdown).toContain('  - **rules_checked:** 3');
    expect(markdown).toContain('  - **complete:** true');
  });
});
