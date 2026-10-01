/**
 * Words in any script, and the curly apostrophes device names carry: live
 * device names use U+2019, as the invented "Nora’s MacBook Air" here does. The search
 * parser's words were ASCII letters, digits, _, . and - only, so
 * search_devices, search_target_lists and search_rules refused free text
 * such as Nora’s, Café, 客厅 or AT&T as an "Unexpected character", and
 * the tokenizers that read a ' after a letter as an apostrophe knew only
 * ASCII letters, so in Café's it opened a quote that was never closed.
 * The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';
import {
  commaListValues,
  matchesQuery,
} from '../../src/search/client-filter.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { toMspQuery } from '../../src/utils/msp-query.js';
import { translateToMspQualifiers } from '../../src/utils/msp-qualifiers.js';
import { followsWordCharacter } from '../../src/utils/word-characters.js';

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
  'Nora’s MacBook Air',
  'William‘s iPad',
  "Café's TV",
  '客厅电视',
  'AT&T router',
  "𝒜's printer",
  "𐐀's lamp",
  "e\u0301's clock",
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
          results: NAMES.map((notes, i) => ({
            id: `rule-${i}`,
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value: `site${i}.example` },
            notes,
          })),
        },
      };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

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

const WORDS: Array<[string, string]> = [
  ['Nora’s', 'Nora’s MacBook Air'],
  ['William‘s', 'William‘s iPad'],
  ["Café's", "Café's TV"],
  ['客厅', '客厅电视'],
  ['AT&T', 'AT&T router'],
];

describe('free text in any script, with any apostrophe', () => {
  it.each(WORDS)('is one word to the parser: %s', word => {
    const parsed = queryParser.parse(word);
    expect([word, parsed.errors]).toEqual([word, []]);
    expect(parsed.ast).toEqual({ type: 'text', value: word });
  });

  it.each(WORDS)('search_devices finds %s', async (word, name) => {
    expect(await names(SearchDevicesHandler, 'devices', word)).toEqual([name]);
  });

  it.each(WORDS)('search_target_lists finds %s', async (word, name) => {
    expect(await names(SearchTargetListsHandler, 'target_lists', word)).toEqual(
      [name]
    );
  });

  it.each(WORDS)('search_rules finds %s', async (word, name) => {
    expect(await names(SearchRulesHandler, 'rules', word)).toEqual([name]);
  });

  it.each(WORDS)('search_alarms sends %s as written', async word => {
    const { client, get } = makeClient();
    const res = await new SearchAlarmsHandler().execute(
      { query: word, limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual([word]);
  });

  it('search_devices and search_alarms take name:Nora’s', async () => {
    expect(await names(SearchDevicesHandler, 'devices', 'name:Nora’s')).toEqual(
      ['Nora’s MacBook Air']
    );
    const { client, get } = makeClient();
    await new SearchAlarmsHandler().execute(
      { query: 'device.name:Nora’s', limit: 10 },
      client
    );
    expect(sentQueries(get)).toEqual(['device.name:Nora’s']);
  });

  it('curly quotes are characters, not quotes', async () => {
    // Only ASCII quotes quote; ‘William’ is the word with its quote marks
    expect(queryParser.parse('‘William’').ast).toEqual({
      type: 'text',
      value: '‘William’',
    });
    expect(toMspQuery('‘William’ AND x')).toBe('‘William’ x');
  });
});

describe("a ' after a letter in any script is an apostrophe", () => {
  it('in every tokenizer', () => {
    expect(toMspQuery("Café's")).toBe("Café's");
    expect(QuerySanitizer.sanitizeSearchQuery("name:Café's").errors).toEqual(
      []
    );
    expect(matchesQuery("Café's", term => term === "Café's")).toBe(true);
    expect(translateToMspQualifiers("Café's bytes:>1MB naïve's", 'flows')).toBe(
      "Café's total:>1MB naïve's"
    );
  });

  it('still opens a quote at the start of a word', () => {
    expect(toMspQuery("'Café TV'")).toBe('"Café TV"');
  });
});

describe("a ' after a letter outside the BMP, or after a combining mark", () => {
  // 𝒜 (U+1D49C) and 𐐀 (U+10400) are surrogate pairs, so the code unit
  // before the ' is the pair's low half; é is written as e and U+0301, so
  // the character before the ' is a mark. Each tokenizer read the ' as a
  // quote that was never closed.
  const WORDS_BEFORE = ["𝒜's", "𐐀's", "e\u0301's"];

  it.each(WORDS_BEFORE)(
    "followsWordCharacter reads the character before the ' of %s",
    word => {
      expect(followsWordCharacter(word, word.indexOf("'"))).toBe(true);
    }
  );

  it('followsWordCharacter is false at the start, after a space, after punctuation and after a lone surrogate', () => {
    expect(followsWordCharacter("'a", 0)).toBe(false);
    expect(followsWordCharacter(" 'a", 1)).toBe(false);
    expect(followsWordCharacter("('a", 1)).toBe(false);
    expect(followsWordCharacter("\udc9c'a", 1)).toBe(false);
  });

  it.each(WORDS_BEFORE)('is an apostrophe in every tokenizer: %s', word => {
    expect(queryParser.parse(word).ast).toEqual({ type: 'text', value: word });
    expect(toMspQuery(word)).toBe(word);
    expect(QuerySanitizer.sanitizeSearchQuery(`name:${word}`).errors).toEqual(
      []
    );
    expect(matchesQuery(word, term => term === word)).toBe(true);
    expect(commaListValues(`${word},x`)).toEqual([word, 'x']);
    expect(translateToMspQualifiers(`${word} bytes:>1MB it's`, 'flows')).toBe(
      `${word} total:>1MB it's`
    );
  });

  it.each([
    ["𝒜's", "𝒜's printer"],
    ["𐐀's", "𐐀's lamp"],
    ["e\u0301's", "e\u0301's clock"],
  ])('search_devices finds %s', async (word, name) => {
    expect(await names(SearchDevicesHandler, 'devices', word)).toEqual([name]);
  });

  it.each(WORDS_BEFORE)('search_alarms sends %s as written', async word => {
    const { client, get } = makeClient();
    const res = await new SearchAlarmsHandler().execute(
      { query: word, limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual([word]);
  });
});
