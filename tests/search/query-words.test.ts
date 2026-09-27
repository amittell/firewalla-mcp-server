/**
 * Words in a query that look like syntax. toMspQuery reads only uppercase
 * AND, OR and NOT as operators, as the API reads and, or and not as words
 * (docs/firewalla-api-reference.md, "Measured Query Behavior"). The search
 * parser, the query syntax check and the client-side matcher of
 * search_devices and search_target_lists read them in any case, so on
 * stubs `nas or laptop` found every device named nas or laptop, where
 * search_rules found the one rule with all three words; `nas or` was
 * refused by every search tool as ending in an operator; `go to school`
 * was refused for its `to`; `name:Alex's` was refused as an unclosed
 * quote; `'rock AND roll'` was sent to the API as `'rock roll'`; and the
 * empty phrase `""` matched every device and target list. The API is
 * stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';
import { matchesQuery } from '../../src/search/client-filter.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { MspQueryError, toMspQuery } from '../../src/utils/msp-query.js';

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
  'nas',
  'laptop',
  'nas or laptop box',
  'rock and roll',
  'rock',
  "Alex's iPhone",
  'go to school',
];

const DEVICES = NAMES.map((name, i) => ({
  id: `aa:bb:cc:dd:ee:0${i}`,
  gid: 'box-a',
  name,
  ip: `192.168.1.${20 + i}`,
  online: true,
}));

const LISTS = NAMES.map((name, i) => ({
  id: `list-${i}`,
  name,
  owner: 'global',
  targets: [`site${i}.example`],
}));

const RULES = NAMES.map((notes, i) => ({
  id: `rule-${i}`,
  action: 'block',
  status: 'active',
  direction: 'bidirection',
  target: { type: 'domain', value: `site${i}.example` },
  notes,
}));

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
      return { status: 200, data: LISTS };
    }
    if (url === '/v2/rules') {
      return { status: 200, data: { count: RULES.length, results: RULES } };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

/** The query of every GET that went out */
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

async function devices(query: string) {
  const { client } = makeClient();
  const res = await new SearchDevicesHandler().execute(
    { query, limit: 50 },
    client
  );
  return res.isError
    ? body(res)
    : (body(res).data.devices as any[]).map(device => device.name);
}

async function lists(query: string) {
  const { client } = makeClient();
  const res = await new SearchTargetListsHandler().execute(
    { query, limit: 50 },
    client
  );
  return res.isError
    ? body(res)
    : (body(res).data.target_lists as any[]).map(list => list.name);
}

async function rules(query: string) {
  const { client } = makeClient();
  const res = await new SearchRulesHandler().execute(
    { query, limit: 50 },
    client
  );
  // Each rule's notes are the name of the same index
  return res.isError
    ? body(res)
    : (body(res).data.rules as any[]).map(
        rule => NAMES[Number(String(rule.id).replace('rule-', ''))]
      );
}

async function flows(query: string) {
  const { client, get } = makeClient();
  const res = await new SearchFlowsHandler().execute(
    { query, limit: 10 },
    client
  );
  return { res, sent: sentQueries(get) };
}

describe('lowercase and, or and not are words', () => {
  it.each([
    ['nas or laptop', ['nas or laptop box']],
    ['nas OR laptop', ['nas', 'laptop', 'nas or laptop box']],
    ['rock and roll', ['rock and roll']],
    ['not nas', []],
    [
      'NOT nas',
      ['laptop', 'rock and roll', 'rock', "Alex's iPhone", 'go to school'],
    ],
  ])('search_devices %s', async (query, expected) => {
    expect(await devices(query)).toEqual(expected);
  });

  it.each([
    ['nas or laptop', ['nas or laptop box']],
    ['nas OR laptop', ['nas', 'laptop', 'nas or laptop box']],
    ['not nas', []],
  ])('search_target_lists %s', async (query, expected) => {
    expect(await lists(query)).toEqual(expected);
  });

  it('search_rules reads them as words too, as before', async () => {
    expect(await rules('nas or laptop')).toEqual(['nas or laptop box']);
  });

  it.each(['nas or', 'or nas', 'not', 'status:blocked or'])(
    'the query check accepts %s, which ends or starts with a word',
    query => {
      expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
      expect(queryParser.parse(query).errors).toEqual([]);
    }
  );

  it('sends them to the API as words', async () => {
    const { res, sent } = await flows('status:blocked or');
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual(['status:blocked or']);
  });

  it.each(['nas OR', 'OR nas', 'nas AND'])(
    'still refuses %s, with an uppercase operator and no term',
    query => {
      expect(validateFirewallaQuerySyntax(query).isValid).toBe(false);
      expect(queryParser.parse(query).isValid).toBe(false);
    }
  );

  it('matchesQuery reads only uppercase operators', () => {
    const has = (text: string) => (term: string) => text.includes(term);
    expect(matchesQuery('nas or laptop', has('nas laptop'))).toBe(false);
    expect(matchesQuery('nas OR laptop', has('nas laptop'))).toBe(true);
    expect(matchesQuery('not nas', has('laptop'))).toBe(false);
    expect(matchesQuery('NOT nas', has('laptop'))).toBe(true);
  });
});

describe('the word to', () => {
  it('is free text outside [low TO high]', async () => {
    expect(await devices('go to school')).toEqual(['go to school']);
    expect(await rules('go to school')).toEqual(['go to school']);
    expect(queryParser.parse('nas TO laptop').errors).toEqual([]);
  });

  it('is still the keyword of [low TO high]', () => {
    expect(queryParser.parse('ts:[1 TO 2]').ast).toEqual({
      type: 'range',
      field: 'ts',
      min: 1,
      max: 2,
      inclusive: true,
    });
  });
});

describe('an apostrophe in a word', () => {
  it.each([
    ["name:Alex's", ["Alex's iPhone"]],
    ["Alex's", ["Alex's iPhone"]],
    ['name:"Alex\'s iPhone"', ["Alex's iPhone"]],
    ["name:'Alex\\'s iPhone'", ["Alex's iPhone"]],
  ])('is not a quote in search_devices %s', async (query, expected) => {
    expect(await devices(query)).toEqual(expected);
  });

  it('is not a quote in search_target_lists or search_rules', async () => {
    expect(await lists("name:Alex's")).toEqual(["Alex's iPhone"]);
    expect(await rules("Alex's")).toEqual(["Alex's iPhone"]);
  });

  it.each([
    ["name:Alex's", "name:Alex's"],
    ["don't", "don't"],
    ["rock'n'roll", "rock'n'roll"],
  ])('is sent as it is: %s', (query, sent) => {
    expect(toMspQuery(query)).toBe(sent);
  });

  it('passes the query check and the sanitizer', () => {
    for (const query of [
      "name:Alex's",
      "don't",
      "name:O'Brien AND online:true",
    ]) {
      expect([query, validateFirewallaQuerySyntax(query).errors]).toEqual([
        query,
        [],
      ]);
      expect([query, QuerySanitizer.sanitizeSearchQuery(query).errors]).toEqual(
        [query, []]
      );
      expect([query, queryParser.parse(query).errors]).toEqual([query, []]);
    }
  });

  it('leaves an escaped double quote inside double quotes alone', () => {
    // three quote characters, one escaped: counting them refused it
    expect(
      QuerySanitizer.sanitizeSearchQuery('name:"say \\"hi"').errors
    ).toEqual([]);
  });

  it.each([
    ["name:'Home Office", 'Unmatched single quotes in query'],
    ['name:"Home Office', 'Unmatched double quotes in query'],
    ["'open", 'Unmatched single quotes in query'],
  ])('the sanitizer still refuses the unclosed quote in %s', (query, error) => {
    expect(QuerySanitizer.sanitizeSearchQuery(query).errors).toContain(error);
  });
});

describe('a single-quoted phrase', () => {
  it.each([
    ["'rock AND roll'", '"rock AND roll"'],
    ["name:'Home Office'", 'name:"Home Office"'],
    ["name:nas,'Home Office'", 'name:nas,"Home Office"'],
    ['\'say "hi"\'', '"say \\"hi\\""'],
    ["'it\\'s'", '"it\'s"'],
    ["'a\\*b'", '"a\\*b"'],
  ])('is sent in double quotes: %s -> %s', (query, sent) => {
    expect(toMspQuery(query)).toBe(sent);
  });

  it('keeps its AND inside the phrase on flows', async () => {
    const { res, sent } = await flows("'rock AND roll'");
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual(['"rock AND roll"']);
  });

  it('finds the rule with the phrase', async () => {
    expect(await rules("'rock AND roll'")).toEqual(['rock and roll']);
    expect(await rules('"rock AND roll"')).toEqual(['rock and roll']);
  });

  it('is refused when it is not closed', () => {
    expect(() => toMspQuery("'rock AND roll")).toThrow(MspQueryError);
  });
});

describe('an empty phrase', () => {
  it.each(['""', '" "', 'nas ""'])(
    'is refused by search_devices, search_target_lists and search_rules: %s',
    async query => {
      for (const result of [
        await devices(query),
        await lists(query),
        await rules(query),
      ]) {
        expect(result.message).toContain('Empty phrase at position');
      }
    }
  );

  it('is refused before a flow search is sent', async () => {
    const { res, sent } = await flows('protocol:tcp ""');
    expect(res.isError).toBe(true);
    expect(body(res).errorType).toBe('validation_error');
    expect(body(res).message).toContain('empty phrase');
    expect(sent).toEqual([]);
  });

  it('is a parse error naming it', () => {
    expect(queryParser.parse('nas ""').errors).toEqual([
      'Empty phrase at position 4: it has no text to find, so it would match everything. Put a word in it or leave it out',
    ]);
    expect(() => toMspQuery('""')).toThrow(/"" is an empty phrase/);
  });

  it('as a field value is left alone', () => {
    expect(queryParser.parse('name:""').errors).toEqual([]);
    expect(toMspQuery('name:""')).toBe('name:""');
  });
});
