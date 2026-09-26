/**
 * The trend, statistics and security-metric reads use the documented
 * /v2/trends and /v2/stats endpoints and the API's grouped counts instead of
 * counting fetched items. The HTTP layer (axios) is stubbed with the shapes
 * the live MSP API returned on 2026-09-25; the values are invented.
 */

import {
  BoxSelectionError,
  FirewallaClient,
} from '../../src/firewalla/client.js';
import {
  GetAlarmTrendsHandler,
  GetBoxesHandler,
  GetRuleTrendsHandler,
  GetSimpleStatisticsHandler,
  GetStatisticsByBoxHandler,
  GetStatisticsByRegionHandler,
} from '../../src/tools/handlers/analytics.js';
import { setupPrompts } from '../../src/prompts/index.js';
import { setupResources } from '../../src/resources/index.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    isAxiosError: (error: any) => Boolean(error?.isAxiosError),
    interceptors: instance.interceptors,
  };
});

const DAY = 86400;
/** 2026-09-25T16:00:00Z */
const NOW = 1790352000;
/** Start of 2026-09-25 in the account's time zone (04:00 UTC, as measured) */
const TODAY = 1790308800;
const BOX_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const BOX_B = 'bbbbbbbb-5555-6666-7777-888888888888';

/** An HTTP error the way axios rejects */
class HttpStatus {
  constructor(readonly status: number) {}
}

type Route = (params: Record<string, any>) => unknown;

/** 30 daily points ending today, as /v2/trends/alarms returns them */
function dailyPoints(value: (day: number) => number) {
  return Array.from({ length: 30 }, (_, i) => {
    const count = value(i);
    return { ts: TODAY - (29 - i) * DAY, count, value: count };
  });
}

const ALARM_TREND = dailyPoints(i => (i === 3 ? 0 : 100 + i));

function makeClient(
  routes: Record<string, Route>,
  config: Record<string, unknown> = {}
) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
    ...config,
  } as any);
  const api = (client as any).api as { get: jest.Mock };
  const calls: Array<{ url: string; params: Record<string, any> }> = [];
  api.get.mockImplementation(
    async (url: string, options: { params?: Record<string, any> } = {}) => {
      const params = options.params ?? {};
      calls.push({ url, params });
      const route = routes[url];
      if (!route) {
        throw new Error(`unexpected GET ${url}`);
      }
      const data = route(params);
      if (data instanceof HttpStatus) {
        throw {
          isAxiosError: true,
          message: `Request failed with status code ${data.status}`,
          response: { status: data.status, statusText: '', data: '' },
          config: { url },
        };
      }
      return { status: 200, data, config: { url } };
    }
  );
  return { client, calls };
}

function parse(res: { content: Array<{ text: string }> }) {
  return JSON.parse(res.content[0].text);
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getAlarmTrends', () => {
  it('reads /v2/trends/alarms once instead of paging /v2/alarms', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/alarms': () => ALARM_TREND,
    });
    const series = await client.getAlarmTrends('30d');
    expect(calls).toEqual([{ url: '/v2/trends/alarms', params: {} }]);
    expect(series.results).toEqual(
      ALARM_TREND.map(({ ts, value }) => ({ ts, value }))
    );
    expect(series.source).toBe('GET /v2/trends/alarms');
    expect(series.interval).toBe('day');
    expect(series.last_point_partial).toBe(true);
  });

  it('returns the days that overlap the period, in ascending order', async () => {
    // The official docs show the points newest first
    const { client } = makeClient({
      '/v2/trends/alarms': () => [...ALARM_TREND].reverse(),
    });
    const week = await client.getAlarmTrends('7d');
    expect(week.results.map(point => point.ts)).toEqual(
      Array.from({ length: 8 }, (_, i) => TODAY - (7 - i) * DAY)
    );
    expect(week.window_start).toBe(TODAY - 7 * DAY);
    expect(week.window_end).toBe(NOW);
    expect(
      (await client.getAlarmTrends('24h')).results.map(point => point.ts)
    ).toEqual([TODAY - DAY, TODAY]);
    expect(
      (await client.getAlarmTrends('1h')).results.map(point => point.ts)
    ).toEqual([TODAY]);
  });

  it('sends group, which takes precedence over FIREWALLA_BOX_ID', async () => {
    const { client, calls } = makeClient(
      { '/v2/trends/alarms': () => ALARM_TREND },
      { boxId: BOX_A }
    );
    const series = await client.getAlarmTrends('30d', 'group-7');
    expect(calls).toEqual([
      { url: '/v2/trends/alarms', params: { group: 'group-7' } },
    ]);
    expect(series.scope).toBe('box group group-7');
    expect(series.source).toBe('GET /v2/trends/alarms');
    expect(series.note).toContain('FIREWALLA_BOX_ID is not applied');
  });

  it('covers every box with one request when no box is in scope', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/alarms': () => ALARM_TREND,
    });
    const series = await client.getAlarmTrends('7d');
    expect(calls).toEqual([{ url: '/v2/trends/alarms', params: {} }]);
    expect(series.scope).toBe('all boxes');
    expect(series.note).toBeUndefined();
  });

  it('fails instead of inventing points when the API sends no array', async () => {
    const { client } = makeClient({ '/v2/trends/alarms': () => ({}) });
    await expect(client.getAlarmTrends('30d')).rejects.toThrow(
      /Failed to get alarm trends for period 30d: .*expected an array/
    );
  });
});

describe('get_alarm_trends', () => {
  it('defaults to the 30 days the API has and labels where they came from', async () => {
    const { client } = makeClient({
      '/v2/trends/alarms': () => ALARM_TREND,
    });
    const res = await new GetAlarmTrendsHandler().execute({}, client);
    const { data } = parse(res);
    expect(data.period).toBe('30d');
    expect(data.data_points).toBe(30);
    // Field normalization renames `timestamp` to `ts`, as it did before
    expect(data.trends[29]).toEqual({
      ts: TODAY,
      timestamp_iso: '2026-09-25T04:00:00.000Z',
      alarm_count: ALARM_TREND[29].value,
    });
    const total = ALARM_TREND.reduce((sum, point) => sum + point.value, 0);
    expect(data.summary).toEqual({
      total_alarms: total,
      avg_alarms_per_interval: Math.round((total / 30) * 100) / 100,
      peak_alarm_count: 129,
      intervals_with_alarms: 29,
      alarm_frequency: 97,
    });
    expect(data.interval).toBe('day');
    expect(data.source).toBe('GET /v2/trends/alarms');
    expect(data.window).toEqual({
      from: '2026-08-27T04:00:00.000Z',
      to: '2026-09-25T16:00:00.000Z',
    });
    expect(data.note).toContain('The last point is the current day so far.');
  });

  it('rejects a period it does not know', async () => {
    const { client, calls } = makeClient({});
    const res = await new GetAlarmTrendsHandler().execute(
      { period: '90d' },
      client
    );
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});

/** The index in ALARM_TREND (0 = 29 days ago) of a count query's ts range */
function dayIndex(query: unknown): number {
  const match = /ts:(\d+)-(\d+)/.exec(String(query));
  if (!match) {
    throw new Error(`no ts range in ${String(query)}`);
  }
  return 29 - Math.round((TODAY - Number(match[1])) / DAY);
}

/**
 * The query that counts day `i` for `box`: from the day's start to the
 * second before the next day's, or to now for today
 */
function dayQuery(i: number, box: string, filter = ''): string {
  const start = TODAY - (29 - i) * DAY;
  const end = i === 29 ? NOW : start + DAY - 1;
  return `${filter}ts:${start}-${end} box.id:${box}`;
}

/** BOX_A's alarms on day `i`: none on days 24 and 25 */
const boxAAlarms = (i: number) => (i === 24 || i === 25 ? 0 : i * 2 + 1);

/**
 * /v2/alarms answering groupBy=box for the day in the query. On day 25 the
 * only row is another box's, which is not BOX_A's count.
 */
function alarmsByBox(params: Record<string, any>) {
  const i = dayIndex(params.query);
  const rows: Array<{ gid: string; count: number }> = [];
  if (i === 25) {
    rows.push({ gid: BOX_B, count: 1000 });
  }
  if (boxAAlarms(i) > 0) {
    rows.push({ gid: BOX_A, count: boxAAlarms(i) });
  }
  return { count: rows.length, results: rows };
}

function boxRoutes(): Record<string, Route> {
  return {
    '/v2/trends/alarms': () => ALARM_TREND,
    '/v2/alarms': alarmsByBox,
  };
}

describe('box-scoped getAlarmTrends and getFlowTrends', () => {
  it('counts each day of the period for the box, on the days of the account-wide series', async () => {
    const { client, calls } = makeClient(boxRoutes());
    const series = await client.getAlarmTrends('7d', undefined, BOX_A);
    // One request for the days, then one count per day
    expect(calls[0]).toEqual({ url: '/v2/trends/alarms', params: {} });
    const counts = calls.slice(1);
    expect(counts.map(call => call.url)).toEqual(Array(8).fill('/v2/alarms'));
    expect(
      counts
        .map(call => call.params)
        .sort((a, b) => a.query.localeCompare(b.query))
    ).toEqual(
      Array.from({ length: 8 }, (_, k) => ({
        groupBy: 'box',
        limit: 500,
        query: dayQuery(22 + k, BOX_A),
      }))
    );
    // The unscoped series' days, each with the box's row (0 without one)
    expect(series.results).toEqual(
      Array.from({ length: 8 }, (_, k) => ({
        ts: ALARM_TREND[22 + k].ts,
        value: boxAAlarms(22 + k),
      }))
    );
    expect(series.results.map(point => point.value)).toContain(0);
    expect(series.source).toBe('GET /v2/alarms groupBy=box per day');
    expect(series.scope).toBe(`box ${BOX_A}`);
    expect(series.note).toContain('1 + 8 requests');
    expect(series.window_start).toBe(TODAY - 7 * DAY);
    expect(series.window_end).toBe(NOW);
    expect(series.last_point_partial).toBe(true);
  });

  it('scopes to FIREWALLA_BOX_ID when no box is named', async () => {
    const { client, calls } = makeClient(boxRoutes(), { boxId: BOX_A });
    const series = await client.getAlarmTrends('24h');
    expect(calls.map(call => call.url)).toEqual([
      '/v2/trends/alarms',
      '/v2/alarms',
      '/v2/alarms',
    ]);
    expect(calls.slice(1).map(call => call.params.query)).toEqual(
      expect.arrayContaining([dayQuery(28, BOX_A), dayQuery(29, BOX_A)])
    );
    expect(series.scope).toBe(`box ${BOX_A}`);
    expect(series.results).toEqual([
      { ts: TODAY - DAY, value: boxAAlarms(28) },
      { ts: TODAY, value: boxAAlarms(29) },
    ]);
  });

  it('prefers the box named over FIREWALLA_BOX_ID', async () => {
    const { client, calls } = makeClient(boxRoutes(), { boxId: BOX_B });
    const series = await client.getAlarmTrends('1h', undefined, BOX_A);
    expect(calls.slice(1)).toEqual([
      {
        url: '/v2/alarms',
        params: { groupBy: 'box', limit: 500, query: dayQuery(29, BOX_A) },
      },
    ]);
    expect(series.results).toEqual([{ ts: TODAY, value: boxAAlarms(29) }]);
  });

  it('counts blocked flows per day for getFlowTrends', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/flows': () => dailyPoints(() => 5000),
      '/v2/flows': params => ({
        count: 1,
        results: [
          {
            gid: BOX_A,
            count: dayIndex(params.query) + 10,
            device: {},
            download: 0,
            upload: 0,
            total: 0,
          },
        ],
      }),
    });
    const series = await client.getFlowTrends('24h', undefined, BOX_A);
    expect(calls[0]).toEqual({ url: '/v2/trends/flows', params: {} });
    expect(
      calls
        .slice(1)
        .map(call => call.params)
        .sort((a, b) => a.query.localeCompare(b.query))
    ).toEqual([
      {
        groupBy: 'box',
        limit: 500,
        query: dayQuery(28, BOX_A, 'status:blocked '),
      },
      {
        groupBy: 'box',
        limit: 500,
        query: dayQuery(29, BOX_A, 'status:blocked '),
      },
    ]);
    expect(calls.slice(1).map(call => call.url)).toEqual([
      '/v2/flows',
      '/v2/flows',
    ]);
    expect(series.results).toEqual([
      { ts: TODAY - DAY, value: 38 },
      { ts: TODAY, value: 39 },
    ]);
    expect(series.source).toBe('GET /v2/flows groupBy=box per day');
    expect(series.scope).toBe(`box ${BOX_A}`);
    expect(series.note).toContain('status:blocked');
  });

  it.each([
    ['box argument', {}, 'x OR box.id:*'],
    ['FIREWALLA_BOX_ID', { boxId: 'x OR box.id:*' }, undefined],
  ])(
    'refuses a malformed %s before any request',
    async (_what, config, box) => {
      const { client, calls } = makeClient(boxRoutes(), config);
      await expect(
        client.getAlarmTrends('30d', undefined, box)
      ).rejects.toBeInstanceOf(BoxSelectionError);
      await expect(client.getFlowTrends('30d', undefined, box)).rejects.toThrow(
        /Invalid box gid/
      );
      expect(calls).toEqual([]);
    }
  );

  it('refuses a box together with a group before any request', async () => {
    const { client, calls } = makeClient(boxRoutes());
    await expect(
      client.getAlarmTrends('30d', 'group-7', BOX_A)
    ).rejects.toThrow(/box and group cannot be combined/);
    expect(calls).toEqual([]);
  });

  it('costs 31 requests for 30d, at most 4 counts at a time', async () => {
    const { client } = makeClient({});
    const api = (client as any).api as { get: jest.Mock };
    const urls: string[] = [];
    let inFlight = 0;
    let peak = 0;
    api.get.mockImplementation(
      async (url: string, options: { params?: Record<string, any> } = {}) => {
        urls.push(url);
        if (url === '/v2/trends/alarms') {
          return { status: 200, data: ALARM_TREND, config: { url } };
        }
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setImmediate(resolve));
        inFlight--;
        return {
          status: 200,
          data: alarmsByBox(options.params ?? {}),
          config: { url },
        };
      }
    );
    const series = await client.getAlarmTrends('30d', undefined, BOX_A);
    expect(urls).toHaveLength(31);
    expect(urls.filter(url => url === '/v2/alarms')).toHaveLength(30);
    expect(peak).toBe(4);
    expect(series.results.map(point => point.value)).toEqual(
      Array.from({ length: 30 }, (_, i) => boxAAlarms(i))
    );
    expect(series.note).toContain('1 + 30 requests');
  });

  it('starts no more counts after one fails', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/alarms': () => ALARM_TREND,
      '/v2/alarms': () => new HttpStatus(500),
    });
    await expect(
      client.getAlarmTrends('30d', undefined, BOX_A)
    ).rejects.toThrow(
      /Failed to get alarm trends for period 30d: Server error/
    );
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBeLessThanOrEqual(1 + 4);
  });

  it('marks days counted from items rather than groups as lower bounds', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/alarms': () => ALARM_TREND,
      '/v2/alarms': params =>
        dayIndex(params.query) === 29
          ? {
              count: 500,
              results: Array.from({ length: 500 }, (_, aid) => ({
                aid,
                gid: BOX_A,
                ts: TODAY + aid,
              })),
              next_cursor: 'more',
            }
          : { count: 1, results: [{ gid: BOX_A, count: 7 }] },
    });
    const series = await client.getAlarmTrends('24h', undefined, BOX_A);
    expect(series.results).toEqual([
      { ts: TODAY - DAY, value: 7 },
      { ts: TODAY, value: 500 },
    ]);
    expect(series.note).toContain('On 1 of the 2 days');
    expect(series.note).toContain('lower bounds');
    // An items answer is not paged, so the cost stays 1 + days even when
    // the API sends a next_cursor
    expect(calls.map(call => call.url)).toEqual([
      '/v2/trends/alarms',
      '/v2/alarms',
      '/v2/alarms',
    ]);
    expect(calls.some(call => call.params.cursor)).toBe(false);
  });
});

describe('get_alarm_trends for one box', () => {
  it('passes box and reports the scope and how the days were counted', async () => {
    const { client, calls } = makeClient(boxRoutes());
    const { data } = parse(
      await new GetAlarmTrendsHandler().execute(
        { box: BOX_A, period: '24h' },
        client
      )
    );
    expect(calls).toHaveLength(3);
    expect(data.scope).toBe(`box ${BOX_A}`);
    expect(data.source).toBe('GET /v2/alarms groupBy=box per day');
    expect(data.trends.map((point: any) => point.alarm_count)).toEqual([
      boxAAlarms(28),
      boxAAlarms(29),
    ]);
    expect(data.summary.total_alarms).toBe(boxAAlarms(28) + boxAAlarms(29));
    expect(data.note).toContain('1 + 2 requests');
  });

  it.each([
    ['a box that is not a gid', { box: 'x OR box.id:*' }, {}],
    ['box with group', { box: BOX_A, group: 'group-7' }, {}],
    ['a malformed FIREWALLA_BOX_ID', {}, { boxId: 'x OR box.id:*' }],
  ])(
    'reports %s as a validation error before any request',
    async (_what, args, config) => {
      const { client, calls } = makeClient(boxRoutes(), config);
      const res = await new GetAlarmTrendsHandler().execute(args, client);
      expect(res.isError).toBe(true);
      expect(parse(res).errorType).toBe('validation_error');
      expect(calls).toEqual([]);
    }
  );
});

describe('getRuleTrends', () => {
  it('uses /v2/trends/rules when it answers', async () => {
    const points = dailyPoints(i => (i % 10 === 0 ? 2 : 0));
    const { client, calls } = makeClient({
      '/v2/trends/rules': () => points,
    });
    const series = await client.getRuleTrends('30d');
    expect(calls.map(call => call.url)).toEqual(['/v2/trends/rules']);
    expect(series.source).toBe('GET /v2/trends/rules');
    expect(series.note).toBeUndefined();
    expect(series.results.map(point => point.value)).toEqual(
      points.map(point => point.value)
    );
  });

  it('counts rule creation times per UTC day when the endpoint answers 400', async () => {
    const utcToday = Math.floor(NOW / DAY) * DAY;
    const { client, calls } = makeClient(
      {
        '/v2/trends/rules': () => new HttpStatus(400),
        '/v2/rules': () => ({
          count: 5,
          results: [
            { id: 'r1', ts: utcToday + 60 },
            { id: 'r2', ts: utcToday - DAY + 5 },
            { id: 'r3', ts: utcToday - DAY + 7 },
            { id: 'r4', ts: utcToday - 40 * DAY },
            { id: 'r5' },
          ],
        }),
      },
      { boxId: BOX_A }
    );
    const series = await client.getRuleTrends('30d');
    expect(calls).toEqual([
      { url: '/v2/trends/rules', params: {} },
      { url: '/v2/rules', params: { query: `box.id:${BOX_A}` } },
    ]);
    expect(series.source).toBe('GET /v2/rules');
    expect(series.scope).toBe(`box ${BOX_A}`);
    expect(series.note).toContain('answered 400');
    expect(series.results).toHaveLength(30);
    expect(series.results[29]).toEqual({ ts: utcToday, value: 1 });
    expect(series.results[28]).toEqual({ ts: utcToday - DAY, value: 2 });
    expect(series.results.reduce((sum, p) => sum + p.value, 0)).toBe(3);
  });

  it('keeps the rules of a box group in the fallback', async () => {
    const utcToday = Math.floor(NOW / DAY) * DAY;
    const { client, calls } = makeClient({
      '/v2/trends/rules': () => new HttpStatus(400),
      '/v2/rules': () => ({
        count: 3,
        results: [
          { id: 'r1', gid: BOX_A, ts: utcToday + 1 },
          { id: 'r2', gid: BOX_B, ts: utcToday + 2 },
          { id: 'r3', group: 'group-7', ts: utcToday + 3 },
        ],
      }),
      '/v2/boxes': () => [{ gid: BOX_A, name: 'Box A', online: true }],
    });
    const series = await client.getRuleTrends('24h', 'group-7');
    expect(calls).toContainEqual({
      url: '/v2/boxes',
      params: { group: 'group-7' },
    });
    expect(series.scope).toBe('box group group-7');
    expect(series.results[series.results.length - 1]).toEqual({
      ts: utcToday,
      value: 2,
    });
  });

  it('counts the group, not FIREWALLA_BOX_ID, when a group is given', async () => {
    const utcToday = Math.floor(NOW / DAY) * DAY;
    const { client, calls } = makeClient(
      {
        '/v2/trends/rules': () => new HttpStatus(400),
        '/v2/rules': () => ({
          count: 2,
          results: [
            { id: 'r1', gid: BOX_A, ts: utcToday + 1 },
            { id: 'r2', group: 'group-7', ts: utcToday + 2 },
          ],
        }),
        '/v2/boxes': () => [{ gid: BOX_A, name: 'Box A', online: true }],
      },
      { boxId: BOX_B }
    );
    const series = await client.getRuleTrends('24h', 'group-7');
    expect(calls).toContainEqual({ url: '/v2/rules', params: {} });
    expect(series.scope).toBe('box group group-7');
    expect(series.note).toContain('FIREWALLA_BOX_ID is not applied');
    expect(series.results[series.results.length - 1]).toEqual({
      ts: utcToday,
      value: 2,
    });
  });

  it('does not hide other errors behind the fallback', async () => {
    const { client, calls } = makeClient({
      '/v2/trends/rules': () => new HttpStatus(500),
    });
    await expect(client.getRuleTrends('30d')).rejects.toThrow(
      /Failed to get rule trends/
    );
    expect(calls.map(call => call.url)).toEqual(['/v2/trends/rules']);
  });
});

describe('get_rule_trends', () => {
  it('reports rules created per day, not an estimated active rule count', async () => {
    const points = dailyPoints(i => (i === 29 ? 3 : i === 20 ? 1 : 0));
    const { client } = makeClient({ '/v2/trends/rules': () => points });
    const { data } = parse(
      await new GetRuleTrendsHandler().execute({ period: '7d' }, client)
    );
    expect(data.data_points).toBe(8);
    expect(data.trends[data.trends.length - 1]).toEqual({
      ts: TODAY,
      timestamp_iso: '2026-09-25T04:00:00.000Z',
      rules_created: 3,
    });
    expect(data.summary).toEqual({
      total_rules_created: 3,
      avg_rules_created_per_day: 0.38,
      peak_rules_created: 3,
      days_with_new_rules: 1,
    });
    expect(JSON.stringify(data)).not.toContain('active_rule');
  });
});

/** Grouped counts, as /v2/alarms and /v2/flows answer a groupBy */
function securityRoutes(): Record<string, Route> {
  return {
    '/v2/alarms': params => {
      if (params.groupBy === 'status') {
        return {
          count: 2,
          results: [
            { status: 1, count: 4210 },
            { status: 2, count: 733 },
          ],
        };
      }
      if (params.groupBy === 'type') {
        return {
          count: 3,
          results: [
            { type: 1, count: 3 },
            { type: 2, count: 30 },
            { type: 8, count: 90 },
          ],
        };
      }
      return {
        count: 1,
        results: [{ aid: 7, gid: BOX_A, type: 1, ts: NOW - 5000, count: 1 }],
        next_cursor: 'abc',
      };
    },
    '/v2/flows': () => ({
      count: 2,
      results: [
        { gid: BOX_A, count: 17000, download: 0, upload: 0, total: 0 },
        { gid: BOX_B, count: 1000, download: 0, upload: 0, total: 0 },
      ],
    }),
  };
}

describe('getSecurityMetrics', () => {
  it('reports exact totals from grouped counts, not a count of fetched items', async () => {
    const { client, calls } = makeClient(securityRoutes());
    const metrics = await client.getSecurityMetrics();
    expect(metrics).toEqual({
      total_alarms: 4943,
      active_alarms: 4210,
      blocked_connections: 18000,
      suspicious_activities: 123,
      security_alarms: 3,
      threat_level: 'medium',
      last_threat_detected: new Date((NOW - 5000) * 1000).toISOString(),
      windows: {
        total_alarms: 'last 30 days',
        active_alarms: 'last 30 days',
        blocked_connections: 'last 24 hours',
        suspicious_activities: 'last 24 hours',
        security_alarms: 'last 24 hours',
      },
      lower_bounds: [],
    });
    expect(calls).toHaveLength(4);
    expect(calls.every(call => (call.params.limit ?? 0) <= 500)).toBe(true);
    expect(calls).toContainEqual({
      url: '/v2/alarms',
      params: { groupBy: 'type', limit: 500, query: `ts:${NOW - DAY}-${NOW}` },
    });
    expect(calls).toContainEqual({
      url: '/v2/flows',
      params: { groupBy: 'box', limit: 500, query: 'status:blocked' },
    });
  });

  it('scopes every count to FIREWALLA_BOX_ID', async () => {
    const { client, calls } = makeClient(securityRoutes(), { boxId: BOX_A });
    await client.getSecurityMetrics();
    expect(
      calls.every(call => String(call.params.query).includes(`box.id:${BOX_A}`))
    ).toBe(true);
  });

  it('bases the threat level on Security Activity alarms only', async () => {
    const routes = securityRoutes();
    const alarms = routes['/v2/alarms'];
    routes['/v2/alarms'] = params =>
      params.groupBy === 'type'
        ? {
            count: 2,
            results: [
              { type: 8, count: 200 },
              { type: 9, count: 50 },
            ],
          }
        : params.groupBy
          ? alarms(params)
          : { count: 0, results: [] };
    const { client } = makeClient(routes);
    const metrics = await client.getSecurityMetrics();
    expect(metrics.suspicious_activities).toBe(250);
    expect(metrics.security_alarms).toBe(0);
    expect(metrics.threat_level).toBe('low');
    expect(metrics.last_threat_detected).toBeNull();
  });

  it('marks a count as a lower bound when the API returns items, not groups', async () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        aid: i,
        type: 8,
        status: 1,
        ts: NOW - i,
        count: 1,
      }));
    const { client } = makeClient({
      '/v2/alarms': params =>
        params.groupBy === 'status'
          ? { count: 500, results: items(500), next_cursor: 'more' }
          : { count: 20, results: items(20) },
      '/v2/flows': () => ({ count: 2, results: [{ gid: BOX_A, count: 9 }] }),
    });
    const metrics = await client.getSecurityMetrics();
    expect(metrics.total_alarms).toBe(500);
    expect(metrics.lower_bounds).toEqual(['total_alarms', 'active_alarms']);
    expect(metrics.suspicious_activities).toBe(20);
    expect(metrics.blocked_connections).toBe(9);
  });

  it('pages grouped counts when there are more groups than one page', async () => {
    const routes = securityRoutes();
    routes['/v2/flows'] = params =>
      params.cursor === 'page-2'
        ? { count: 1, results: [{ gid: BOX_B, count: 250 }] }
        : {
            count: 1,
            results: [{ gid: BOX_A, count: 750 }],
            next_cursor: 'page-2',
          };
    const { client, calls } = makeClient(routes);
    const metrics = await client.getSecurityMetrics();
    expect(metrics.blocked_connections).toBe(1000);
    expect(metrics.lower_bounds).toEqual([]);
    expect(calls.filter(call => call.url === '/v2/flows')).toHaveLength(2);
  });
});

describe('security_report and firewalla://metrics/security', () => {
  const summary = {
    status: 'online',
    boxes: [],
    boxes_online: 1,
    boxes_total: 1,
    recent_flows_sampled: 100,
    blocked_in_sample: 4,
    last_updated: '2026-09-25T16:00:00.000Z',
  };

  function fakeFirewalla(metrics: Record<string, unknown>) {
    return {
      getActiveAlarms: jest.fn(async () => ({
        count: 1,
        results: [{ type: 1, message: 'a', ts: NOW - 60 }],
      })),
      getFirewallSummary: async () => summary,
      getSecurityMetrics: async () => metrics,
      getRecentThreats: async () =>
        Array.from({ length: 100 }, () => ({
          timestamp: '',
          type: 'Blocked Connection',
          source_ip: '192.168.1.10',
          destination_ip: '203.0.113.5',
          action_taken: 'blocked',
          severity: 'medium',
        })),
    };
  }

  const metrics = {
    total_alarms: 4943,
    active_alarms: 4210,
    blocked_connections: 18000,
    suspicious_activities: 123,
    security_alarms: 0,
    threat_level: 'low',
    last_threat_detected: null,
    windows: {},
    lower_bounds: ['blocked_connections'],
  };

  it('prints each count with its window and marks lower bounds', async () => {
    const setRequestHandler = jest.fn();
    const firewalla = fakeFirewalla(metrics);
    setupPrompts({ setRequestHandler } as any, firewalla as any);
    const getPrompt = setRequestHandler.mock.calls[1][1];
    const res = await getPrompt({
      params: { name: 'security_report', arguments: { period: '24h' } },
    });
    const text: string = res.messages[0].content.text;
    expect(text).toContain('- Alarms in the last 30 days: 4943 (4210 active)');
    expect(text).toContain(
      '- Alarms in the last 24 hours: 123, of which Security Activity: 0'
    );
    expect(text).toContain(
      '- Blocked flows in the last 24 hours: at least 18000'
    );
    expect(text).toContain(
      '**Most Recent Alarms (1 of 4943 in the last 30 days):**'
    );
    expect(text).toContain(
      '- Recent Threats: at least 100 (the list stops at 100)'
    );
    expect(text).toContain('**Recent Threats (at least 100):**');
    expect(text).not.toContain('Total Alarms:');
    expect(firewalla.getActiveAlarms).toHaveBeenCalledWith(
      undefined,
      undefined,
      'ts:desc',
      10
    );
  });

  it('network_health_check labels the windows and scores Security Activity alarms', async () => {
    const setRequestHandler = jest.fn();
    setupPrompts(
      { setRequestHandler } as any,
      {
        ...fakeFirewalla(metrics),
        getDeviceStatus: async () => ({
          count: 2,
          results: [{ online: true }, { online: false }],
        }),
        getNetworkTopology: async () => ({
          subnets: [{ id: 'n1' }],
          connections: [],
        }),
        getNetworkRules: async () => ({
          count: 1,
          results: [{ status: 'active' }],
        }),
      } as any
    );
    const getPrompt = setRequestHandler.mock.calls[1][1];
    const res = await getPrompt({
      params: { name: 'network_health_check', arguments: {} },
    });
    const text: string = res.messages[0].content.text;
    expect(text).toContain('- Active Alarms (last 30 days): 4210');
    expect(text).toContain('- Security Activity Alarms (last 24 hours): 0');
    expect(text).toContain('- Security Score: 100/100');
  });

  it('scores security from Security Activity alarms, not every active alarm', async () => {
    const setRequestHandler = jest.fn();
    setupResources(
      { setRequestHandler } as any,
      fakeFirewalla({ ...metrics, lower_bounds: [] }) as any
    );
    const readResource = setRequestHandler.mock.calls[1][1];
    const res = await readResource({
      params: { uri: 'firewalla://metrics/security' },
    });
    const body = JSON.parse(res.contents[0].text).security_metrics;
    expect(body.overview.resolved_alarms).toBe(733);
    expect(body.overview.security_alarms).toBe(0);
    expect(body.threat_indicators.security_effectiveness).toBe(100);
    expect(body.threat_indicators.recommendation).toBe(
      'Security status is good - maintain current monitoring'
    );
  });
});

describe('statistics', () => {
  const REGIONS = [
    { meta: { code: 'US' }, value: 3000 },
    { meta: { code: 'DE' }, value: 600 },
    { meta: { code: 'FR' }, value: 400 },
  ];
  const BOXES = [
    {
      gid: BOX_A,
      name: 'Box A',
      model: 'gold',
      online: true,
      deviceCount: 20,
      ruleCount: 12,
      alarmCount: 40,
      version: '1.980',
      location: 'US',
    },
    {
      gid: BOX_B,
      name: 'Box B',
      model: 'purple',
      online: false,
      lastSeen: 1787832000,
      deviceCount: 5,
      ruleCount: 3,
      alarmCount: 2,
    },
  ];

  it('get_statistics_by_region reads the top regions by blocked flows', async () => {
    const { client, calls } = makeClient({
      '/v2/stats/topRegionsByBlockedFlows': () => REGIONS,
    });
    const { data } = parse(
      await new GetStatisticsByRegionHandler().execute(
        { group: 'group-7', limit: 3 },
        client
      )
    );
    expect(calls).toEqual([
      {
        url: '/v2/stats/topRegionsByBlockedFlows',
        params: { group: 'group-7', limit: 3 },
      },
    ]);
    expect(data.metric).toBe('blocked_flows');
    expect(data.total_flow_count).toBe(4000);
    expect(data.regional_statistics).toEqual([
      { country_code: 'US', flow_count: 3000, percentage: 75 },
      { country_code: 'DE', flow_count: 600, percentage: 15 },
      { country_code: 'FR', flow_count: 400, percentage: 10 },
    ]);
  });

  it('get_statistics_by_box reads /v2/stats/{type} and fills in each box', async () => {
    const { client, calls } = makeClient({
      '/v2/stats/topBoxesBySecurityAlarms': () => [
        { meta: { gid: BOX_A, name: 'Box A', model: 'gold' }, value: 23 },
      ],
      '/v2/boxes': () => BOXES,
    });
    const { data } = parse(
      await new GetStatisticsByBoxHandler().execute(
        { type: 'topBoxesBySecurityAlarms' },
        client
      )
    );
    expect(calls.map(call => call.url).sort()).toEqual([
      '/v2/boxes',
      '/v2/stats/topBoxesBySecurityAlarms',
    ]);
    expect(data.stat_type).toBe('topBoxesBySecurityAlarms');
    expect(data.metric).toBe('security_alarms');
    expect(data.box_statistics).toEqual([
      {
        box_id: BOX_A,
        name: 'Box A',
        model: 'gold',
        value: 23,
        status: 'online',
        version: '1.980',
        location: 'US',
        device_count: 20,
        rule_count: 12,
        alarm_count: 40,
        last_seen: 'Never',
      },
    ]);
    expect(data.summary.total_value).toBe(23);
  });

  it('get_statistics_by_box defaults to blocked flows and refuses other types', async () => {
    const { client, calls } = makeClient({
      '/v2/stats/topBoxesByBlockedFlows': () => [
        { meta: { gid: BOX_A, name: 'Box A', model: 'gold' }, value: 9000 },
        { meta: { gid: BOX_B, name: 'Box B', model: 'purple' }, value: 150 },
      ],
      '/v2/boxes': () => BOXES,
    });
    const { data } = parse(
      await new GetStatisticsByBoxHandler().execute({}, client)
    );
    expect(data.box_statistics.map((box: any) => box.value)).toEqual([
      9000, 150,
    ]);
    expect(data.box_statistics[1].status).toBe('offline');
    const bad = await new GetStatisticsByBoxHandler().execute(
      { type: 'topRegionsByBlockedFlows' },
      client
    );
    expect(bad.isError).toBe(true);
    expect(calls.map(call => call.url)).not.toContain(
      '/v2/stats/topRegionsByBlockedFlows'
    );
  });

  it('get_boxes passes the advertised group argument to /v2/boxes', async () => {
    const { client, calls } = makeClient({ '/v2/boxes': () => [BOXES[0]] });
    await new GetBoxesHandler().execute({ group: 'group-7' }, client);
    expect(calls).toEqual([{ url: '/v2/boxes', params: { group: 'group-7' } }]);
  });

  it('get_simple_statistics passes group to /v2/stats/simple', async () => {
    const { client, calls } = makeClient({
      '/v2/stats/simple': () => ({
        onlineBoxes: 1,
        offlineBoxes: 1,
        alarms: 480,
        rules: 90,
      }),
    });
    const { data } = parse(
      await new GetSimpleStatisticsHandler().execute(
        { group: 'group-7' },
        client
      )
    );
    expect(calls).toEqual([
      { url: '/v2/stats/simple', params: { group: 'group-7' } },
    ]);
    expect(data.statistics.total_alarms).toBe(480);
  });
});
