/**
 * A relative time (ts:>1h) is resolved once per read. get_flow_data passed
 * it to getFlowData untranslated, which translated it to report it, and
 * request() translated it again for every page, each time against the
 * clock, so a read whose pages straddled a second sent a different window
 * on each page and reported only one of them. A streamed get_flow_data
 * session saved the query untranslated, so each later chunk resolved
 * ts:>1h anew under the first chunk's cursor. get_active_alarms was not
 * affected (its handler resolves the query with mspAnd first); its tests
 * here keep it so. The clock is Date.now, stubbed; the API is stubbed;
 * nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';

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

/** 400 ms past a second, so a one-second step crosses a second */
let now = Date.UTC(2026, 0, 1, 0, 0, 0, 400);

beforeEach(() => {
  now = Date.UTC(2026, 0, 1, 0, 0, 0, 400);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const seconds = () => Math.floor(now / 1000);

function flow(i: number) {
  return {
    ts: seconds() - i,
    gid: '00000000-0000-0000-0000-000000000000',
    protocol: 'tcp',
    direction: 'outbound',
    block: false,
    count: 1,
    device: { id: `dev-${i}`, ip: '192.168.1.10', name: `device ${i}` },
  };
}

function alarm(i: number) {
  return {
    aid: i + 1,
    gid: '00000000-0000-0000-0000-000000000000',
    type: 1,
    status: 1,
    ts: seconds() - i,
    message: `alarm ${i}`,
  };
}

/**
 * A client whose API answers `pageSize` items and a cursor to the next page,
 * `pages` pages in all, and moves the clock one second after each answer
 */
function makeClient(item: (i: number) => unknown, pageSize = 500, pages = 2) {
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
  const sent: string[] = [];
  get.mockImplementation(async (_url: string, config: any) => {
    const params = config?.params ?? {};
    sent.push(params.query);
    const index = params.cursor ? Number(params.cursor) : 0;
    const count = Math.min(Number(params.limit), pageSize);
    const results = Array.from({ length: count }, (_, i) =>
      item(index * pageSize + i)
    );
    now += 1000;
    return {
      status: 200,
      data: {
        count: results.length,
        results,
        ...(index + 1 < pages && { next_cursor: String(index + 1) }),
      },
    };
  });
  return { client, sent };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const WINDOW = /^ts:>\d+$/;

describe('a relative time is resolved once per read', () => {
  it('get_flow_data sends one window on every page and reports it', async () => {
    const { client, sent } = makeClient(flow);
    const res = await new GetFlowDataHandler().execute(
      { query: 'ts:>1h', limit: 600, stream: false },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(WINDOW);
    expect(sent[1]).toBe(sent[0]);
    expect(body(res).data.query_parameters.query).toBe(sent[0]);
  });

  it('get_active_alarms sends one window on every page and reports it', async () => {
    // 300 alarms a page, so a limit of 500 reads two pages
    const { client, sent } = makeClient(alarm, 300);
    const res = await new GetActiveAlarmsHandler().execute(
      { query: 'ts:>1h', limit: 500 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(/^status:1 ts:>\d+$/);
    expect(sent[1]).toBe(sent[0]);
    expect(body(res).data.query_executed).toBe(sent[0]);
  });

  it('get_active_alarms counts every page with the first window', async () => {
    // include_total_count reads the pages after the first one call each
    const { client, sent } = makeClient(alarm, 100, 4);
    const res = await new GetActiveAlarmsHandler().execute(
      { query: 'ts:>1h', limit: 100, include_total_count: true },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.total_count).toBe(400);
    expect(sent).toHaveLength(4);
    expect(new Set(sent)).toEqual(new Set([sent[0]]));
  });

  it('a streamed get_flow_data session keeps its first window', async () => {
    const { client, sent } = makeClient(flow, 100, 5);
    const handler = new GetFlowDataHandler();
    const first = body(
      await handler.execute({ query: 'ts:>1h', limit: 100 }, client)
    );
    expect(first.streaming).toBe(true);
    // A minute later, the next chunk of the same session
    now += 60_000;
    const second = body(
      await handler.execute({ streaming_session_id: first.sessionId }, client)
    );
    expect(second.sessionId).toBe(first.sessionId);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(WINDOW);
    expect(sent[1]).toBe(sent[0]);
  });
});
