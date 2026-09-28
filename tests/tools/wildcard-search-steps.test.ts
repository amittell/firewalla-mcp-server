/**
 * The work each wildcard search does, counted as matchesWildcard's steps
 * rather than timed, so a loaded machine cannot fail it. The wildcard
 * searches search_rules, search_target_lists and search_devices match on
 * the client go through matchesWildcard, and every match must take fewer
 * than (n + 1)(m + 1) steps for a value of n and a pattern of m
 * characters: the regular expressions these replaced took seconds on the
 * same 50-character values (see wildcard-search-time.test.ts). The API is
 * stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchDevicesHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import * as wildcard from '../../src/utils/wildcard.js';

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

/** 9 wildcards; no value below ends in b, so each match must fail */
const PATTERN = `${'*a'.repeat(8)}*b`;
const LONG = 'a'.repeat(50);

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
          { id: LONG, gid: 'box-a', name: 'abcd router', ip: '192.168.1.20' },
          { id: `${LONG}b`, gid: 'box-a', name: 'plain', ip: '192.168.1.30' },
        ],
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: [
          { id: 'l1', name: LONG, owner: 'global', targets: ['a.example'] },
          { id: 'l2', name: 'ads', owner: 'global', targets: ['ab.example'] },
        ],
      };
    }
    return {
      status: 200,
      data: {
        count: 2,
        results: [
          {
            id: 'r1',
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value: LONG },
          },
          {
            id: 'r2',
            action: 'block',
            status: 'active',
            direction: 'bidirection',
            target: { type: 'domain', value: 'ab' },
          },
        ],
      },
    };
  });
  return client;
}

const body = (res: any) => JSON.parse(res.content[0].text);

interface Match {
  text: string;
  pattern: string;
  steps: number;
  bound: number;
}

/** Every matchesWildcard call the search made, with its steps counted */
let matches: Match[] = [];

beforeEach(() => {
  matches = [];
  const actual = jest.requireActual<typeof wildcard>(
    '../../src/utils/wildcard.js'
  ).matchesWildcard;
  jest
    .spyOn(wildcard, 'matchesWildcard')
    .mockImplementation((text, pattern, options = {}) => {
      const steps = { count: 0 };
      const matched = actual(text, pattern, { ...options, steps });
      matches.push({
        text,
        pattern,
        steps: steps.count,
        bound: (text.length + 1) * (pattern.length + 1),
      });
      return matched;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The matches of `pattern` against `text`, which must have been made */
function matchesOf(text: string, pattern: string): Match[] {
  const found = matches.filter(
    match => match.text === text && match.pattern === pattern
  );
  expect(found.length).toBeGreaterThan(0);
  return found;
}

function expectAllWithinBound() {
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.filter(match => match.steps >= match.bound)).toEqual([]);
}

describe('9 wildcards against a 50-character value', () => {
  it('search_rules matches in fewer than (n + 1)(m + 1) steps', async () => {
    const res = await new SearchRulesHandler().execute(
      { query: `target.value:${PATTERN}`, limit: 10 },
      makeClient()
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.rules).toEqual([]);
    for (const match of matchesOf(LONG, PATTERN)) {
      expect(match.steps).toBeGreaterThanOrEqual(LONG.length);
    }
    expectAllWithinBound();
  });

  it('search_target_lists matches in fewer than (n + 1)(m + 1) steps', async () => {
    const res = await new SearchTargetListsHandler().execute(
      { query: `name:${PATTERN}`, limit: 10 },
      makeClient()
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.target_lists).toEqual([]);
    for (const match of matchesOf(LONG, PATTERN)) {
      expect(match.steps).toBeGreaterThanOrEqual(LONG.length);
    }
    expectAllWithinBound();
  });
});

describe('search_devices matches id: wildcards in bounded steps', () => {
  // name: is matched as text without its *s (name.includes), so a name
  // wildcard makes no matcher call and has no steps to count
  it('10 wildcards against 50 and 51 characters', async () => {
    const pattern = `${'*a'.repeat(9)}*b`;
    const res = await new SearchDevicesHandler().execute(
      { query: `id:${pattern}`, limit: 10 },
      makeClient()
    );
    expect(res.isError).toBeFalsy();
    expect(
      (body(res).data.devices as any[]).map(device => device.name)
    ).toEqual(['plain']);
    matchesOf(LONG, pattern);
    matchesOf(`${LONG}b`, pattern);
    expectAllWithinBound();
  });
});
