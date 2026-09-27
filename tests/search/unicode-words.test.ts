/**
 * Words in any script, and the curly apostrophes device names carry. Live
 * alarms name devices such as "Alex’s MacBook Air" (U+2019). The search
 * parser's words were ASCII letters, digits, _, . and - only, so
 * search_devices, search_target_lists and search_rules refused free text
 * such as Alex’s, Café, 客厅 or AT&T as an "Unexpected character", and
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
import { matchesQuery } from '../../src/search/client-filter.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { toMspQuery } from '../../src/utils/msp-query.js';
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

const NAMES = [
  'Alex’s MacBook Air',
  'William‘s iPad',
  "Café's TV",
  '客厅电视',
  'AT&T router',
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
  ['Alex’s', 'Alex’s MacBook Air'],
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

  it('search_devices and search_alarms take name:Alex’s', async () => {
    expect(await names(SearchDevicesHandler, 'devices', 'name:Alex’s')).toEqual(
      ['Alex’s MacBook Air']
    );
    const { client, get } = makeClient();
    await new SearchAlarmsHandler().execute(
      { query: 'device.name:Alex’s', limit: 10 },
      client
    );
    expect(sentQueries(get)).toEqual(['device.name:Alex’s']);
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
