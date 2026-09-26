/**
 * get_flow_data pages past its first page at any limit (reported in
 * martin2110/firewalla-mcp-server#3: at limit 500 the next page came back
 * with the same cursor, while limit 50 paged). Over limit 50 the tool
 * streams, and there it ignored the cursor it was given, created a streaming
 * manager with no sessions on every call (so no streaming_session_id could
 * be continued), let the saved request parameters replace a chunk's size,
 * and streamed with stream: false too. A streamed chunk's records also had
 * `timestamp` where a plain page's have `ts`. The client followed a cursor
 * the API repeated. Flow results now carry `coverage`: the oldest and newest
 * ts returned and why paging stopped.
 *
 * The HTTP layer is stubbed: an endpoint of 1,000 flows, newest first. Its
 * cursors are base64 "offset <n>", a stand-in: the API's cursors are opaque.
 */

import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';
import {
  StreamingManager,
  StreamingSessionError,
} from '../../src/utils/streaming-manager.js';
import { pagingCoverage } from '../../src/utils/paging-coverage.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
  };
});

const TOTAL = 1000;
/** Flow i ends at NOW - i */
const NOW = 1_700_000_000;
const b64 = (text: string) => Buffer.from(text).toString('base64');
const cursorAt = (offset: number) => b64(`offset ${offset}`);
const offsetOf = (cursor?: string) =>
  cursor ? Number(Buffer.from(cursor, 'base64').toString().split(' ')[1]) : 0;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
/** The device ids of flows from..to-1 */
const ids = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `dev-${from + i}`);

interface Call {
  limit: number;
  cursor?: string;
  query?: string;
}

/**
 * A client over the stubbed endpoint. With `repeatCursor`, every page after
 * the first is `pageSize` flows and carries the cursor it was asked with.
 * With `delayMs`, each answer takes that long, so overlapping calls overlap.
 */
function makeClient(
  options: { pageSize?: number; repeatCursor?: boolean; delayMs?: number } = {}
) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const calls: Call[] = [];
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (endpoint: string, config: any) => {
    const params = config?.params ?? {};
    if (options.delayMs) {
      await delay(options.delayMs);
    }
    calls.push({
      limit: Number(params.limit),
      cursor: params.cursor,
      query: params.query,
    });
    const start = offsetOf(params.cursor);
    const size = Math.min(Number(params.limit), options.pageSize ?? Infinity);
    const end = Math.min(TOTAL, start + size);
    const results = Array.from({ length: end - start }, (_, i) => ({
      ts: NOW - (start + i),
      gid: '00000000-0000-0000-0000-000000000000',
      protocol: 'tcp',
      download: 1,
      upload: 1,
      total: 2,
      device: { id: `dev-${start + i}`, ip: '192.168.1.10' },
      source: { ip: '192.168.1.10' },
      destination: { ip: '10.0.0.7' },
    }));
    let nextCursor = end < TOTAL ? cursorAt(end) : undefined;
    if (options.repeatCursor && params.cursor) {
      nextCursor = params.cursor;
    }
    return {
      status: 200,
      config: { url: endpoint },
      data: { count: results.length, results, next_cursor: nextCursor },
    };
  });
  return { client, calls };
}

const run = (args: Record<string, unknown>, client: FirewallaClient) =>
  new GetFlowDataHandler().execute(args, client);

/** A get_flow_data response, streamed or not */
function page(response: {
  content: Array<{ text: string }>;
  isError?: boolean;
}) {
  const body = JSON.parse(response.content[0].text);
  if (response.isError) {
    return { error: body.message as string, body };
  }
  if (body.streaming) {
    return {
      streaming: true,
      records: body.data as any[],
      ids: body.data.map((flow: any) => flow.device.id),
      next: body.nextContinuationToken ?? undefined,
      sessionId: body.sessionId as string,
      final: body.isFinalChunk as boolean,
      coverage: body.coverage,
    };
  }
  return {
    streaming: false,
    records: body.data.results as any[],
    ids: body.data.results.map((flow: any) => flow.device.id),
    next: body.data.pagination.cursor ?? undefined,
    hasMore: body.data.pagination.has_more as boolean,
    coverage: body.data.coverage,
  };
}

describe('get_flow_data reads the page at a cursor', () => {
  it.each([50, 200, 500])(
    'limit %i: the cursor of the first page reads the second',
    async limit => {
      const { client, calls } = makeClient();
      const first = page(await run({ limit }, client));
      // Over limit 50 the first page is the first chunk of a stream
      expect(first.streaming).toBe(limit > 50);
      expect(first.ids).toEqual(ids(0, limit));
      expect(first.next).toBe(cursorAt(limit));

      const second = page(await run({ limit, cursor: first.next }, client));
      expect(second.ids).toEqual(ids(limit, 2 * limit));
      // At limit 500 the second page is the last of the 1,000 flows
      expect(second.next).toBe(
        2 * limit < TOTAL ? cursorAt(2 * limit) : undefined
      );
      expect(calls.map(({ limit: l, cursor }) => ({ l, cursor }))).toEqual([
        { l: limit, cursor: undefined },
        { l: limit, cursor: cursorAt(limit) },
      ]);
    }
  );

  it('limit 500: a cursor is followed with or without stream: true', async () => {
    const { client, calls } = makeClient();
    const second = page(
      await run({ limit: 500, cursor: cursorAt(500), stream: true }, client)
    );
    expect(second.ids).toEqual(ids(500, 1000));
    expect(second.next).toBeUndefined();
    expect(calls.map(call => call.cursor)).toEqual([cursorAt(500)]);
  });
});

describe('get_flow_data streaming sessions', () => {
  it.each([200, 500])(
    'limit %i: streaming_session_id reads the next chunk of the same size',
    async limit => {
      const { client, calls } = makeClient();
      const first = page(await run({ limit }, client));
      expect(first.streaming).toBe(true);

      const second = page(
        await run({ streaming_session_id: first.sessionId }, client)
      );
      expect(second.error).toBeUndefined();
      expect(second.sessionId).toBe(first.sessionId);
      expect(second.ids).toEqual(ids(limit, 2 * limit));
      expect(calls.map(({ limit: l, cursor }) => ({ l, cursor }))).toEqual([
        { l: limit, cursor: undefined },
        { l: limit, cursor: cursorAt(limit) },
      ]);
    }
  );

  it('a continued session reads the query it was started with', async () => {
    const { client, calls } = makeClient();
    const first = page(
      await run({ limit: 200, query: 'protocol:tcp' }, client)
    );
    await run({ streaming_session_id: first.sessionId }, client);
    expect(calls).toHaveLength(2);
    expect(calls[1].query).toBe(calls[0].query);
    expect(calls[1].query).toContain('protocol:tcp');
  });

  it('reads to the end, then says the session is complete', async () => {
    const { client, calls } = makeClient();
    const first = page(await run({ limit: 500 }, client));
    const last = page(
      await run({ streaming_session_id: first.sessionId }, client)
    );
    expect(last.ids).toEqual(ids(500, 1000));
    expect(last.final).toBe(true);
    expect(last.next).toBeUndefined();
    expect(last.coverage.stopped_reason).toBe('no_more_pages');

    const after = page(
      await run({ streaming_session_id: first.sessionId }, client)
    );
    expect(after.error).toMatch(/is already complete/);
    expect(calls).toHaveLength(2);
  });

  it('an unknown session is an error that points to the cursor', async () => {
    const { client, calls } = makeClient();
    const response = await run(
      { streaming_session_id: 'stream_00000000-0000-0000-0000-000000000000' },
      client
    );
    expect(response.isError).toBe(true);
    expect(page(response).error).toMatch(/not found or expired/);
    expect(response.content[0].text).toContain('nextContinuationToken');
    expect(calls).toHaveLength(0);
  });

  it('two overlapping continuations get consecutive chunks', async () => {
    const { client, calls } = makeClient({ delayMs: 5 });
    const first = page(await run({ limit: 200 }, client));
    const both = await Promise.all([
      run({ streaming_session_id: first.sessionId }, client),
      run({ streaming_session_id: first.sessionId }, client),
    ]);
    const chunks = both.map(response => page(response));
    expect(chunks.map(chunk => chunk.error)).toEqual([undefined, undefined]);
    // In the order they were asked for
    expect(chunks.map(chunk => chunk.ids)).toEqual([
      ids(200, 400),
      ids(400, 600),
    ]);
    expect(calls.map(call => call.cursor)).toEqual([
      undefined,
      cursorAt(200),
      cursorAt(400),
    ]);
  });

  it('refuses a streaming_session_id with stream: false, and keeps the session', async () => {
    const { client, calls } = makeClient();
    const first = page(await run({ limit: 200 }, client));
    const refused = await run(
      { streaming_session_id: first.sessionId, stream: false },
      client
    );
    expect(refused.isError).toBe(true);
    expect(page(refused).error).toMatch(
      /streaming_session_id and stream: false conflict/
    );
    expect(calls).toHaveLength(1);

    const next = page(
      await run({ streaming_session_id: first.sessionId }, client)
    );
    expect(next.ids).toEqual(ids(200, 400));
  });

  it('reads a cursor given with a streaming_session_id', async () => {
    const { client } = makeClient();
    const first = page(await run({ limit: 200 }, client));
    const byCursor = page(
      await run(
        {
          limit: 200,
          streaming_session_id: first.sessionId,
          cursor: cursorAt(600),
          stream: false,
        },
        client
      )
    );
    expect(byCursor.streaming).toBe(false);
    expect(byCursor.ids).toEqual(ids(600, 800));
  });

  it('a session belongs to the client that started it', async () => {
    const { client } = makeClient();
    const first = page(await run({ limit: 200 }, client));
    const other = makeClient().client;
    const response = await run(
      { streaming_session_id: first.sessionId },
      other
    );
    expect(page(response).error).toMatch(/not found or expired/);
  });
});

/** Every key path of a record, nested objects included */
function keyPaths(record: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(record).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? [
          `${prefix}${key}`,
          ...keyPaths(value as Record<string, unknown>, `${prefix}${key}.`),
        ]
      : [`${prefix}${key}`]
  );
}

describe('get_flow_data records', () => {
  it('a streamed page and the plain page read by its cursor have one shape', async () => {
    const { client } = makeClient();
    const first = page(await run({ limit: 200 }, client));
    const second = page(await run({ limit: 200, cursor: first.next }, client));
    expect(first.streaming).toBe(true);
    expect(second.streaming).toBe(false);

    const shapes = new Set(
      [...first.records!, ...second.records!].map(record =>
        JSON.stringify(keyPaths(record).sort())
      )
    );
    expect(shapes.size).toBe(1);
    const [record] = first.records!;
    expect(record).not.toHaveProperty('timestamp');
    expect(record.ts).toBe(iso(NOW));
    expect(second.records![0].ts).toBe(iso(NOW - 200));
  });

  it('the same flows streamed and not are the same records', async () => {
    const { client } = makeClient();
    const streamed = page(await run({ limit: 200, stream: true }, client));
    const plain = page(await run({ limit: 200, stream: false }, client));
    expect(streamed.streaming).toBe(true);
    expect(plain.streaming).toBe(false);
    expect(streamed.records).toEqual(plain.records);
  });
});

describe('get_flow_data stream argument', () => {
  it.each([false, 'false'])(
    'stream: %p returns a plain page at limit 200',
    async stream => {
      const { client } = makeClient();
      const first = page(await run({ limit: 200, stream }, client));
      expect(first.streaming).toBe(false);
      expect(first.ids).toEqual(ids(0, 200));
      expect(first.next).toBe(cursorAt(200));
      expect(first.hasMore).toBe(true);
    }
  );

  it.each([
    [50, false],
    [51, true],
  ])('without stream, limit %i is streamed: %p', async (limit, streamed) => {
    const { client } = makeClient();
    expect(page(await run({ limit }, client)).streaming).toBe(streamed);
  });

  it('stream: true streams limit 50', async () => {
    const { client } = makeClient();
    const first = page(await run({ limit: 50, stream: true }, client));
    expect(first.streaming).toBe(true);
    expect(first.ids).toEqual(ids(0, 50));
  });
});

describe('a cursor the API repeats', () => {
  it('stops the client paging instead of reading the same page again', async () => {
    const { client, calls } = makeClient({ pageSize: 10, repeatCursor: true });
    const result = await client.getFlowData(
      undefined,
      undefined,
      'ts:desc',
      200
    );
    expect(calls.map(call => call.cursor)).toEqual([undefined, cursorAt(10)]);
    expect(result.results.map(flow => flow.device.id)).toEqual(ids(0, 20));
    expect(result.next_cursor).toBeUndefined();
    expect(result.coverage?.stopped_reason).toBe('repeated_cursor');
  });

  it('ends a get_flow_data stream', async () => {
    const { client, calls } = makeClient({ pageSize: 10, repeatCursor: true });
    const first = page(await run({ limit: 200 }, client));
    expect(calls).toHaveLength(2);
    expect(first.ids).toEqual(ids(0, 20));
    expect(first.final).toBe(true);
    expect(first.next).toBeUndefined();
    expect(first.coverage.stopped_reason).toBe('repeated_cursor');
  });
});

describe('coverage of flow results', () => {
  it('get_flow_data gives the oldest and newest ts and why paging stopped', async () => {
    const { client } = makeClient();
    const first = page(await run({ limit: 50 }, client));
    expect(first.coverage).toEqual({
      oldest_ts: NOW - 49,
      newest_ts: NOW,
      oldest: iso(NOW - 49),
      newest: iso(NOW),
      api_requests: 1,
      stopped_reason: 'limit_reached',
    });

    const last = page(await run({ limit: 50, cursor: cursorAt(950) }, client));
    expect(last.hasMore).toBe(false);
    expect(last.coverage).toMatchObject({
      oldest_ts: NOW - 999,
      newest_ts: NOW - 950,
      stopped_reason: 'no_more_pages',
    });
  });

  it('a streamed chunk over 500 flows counts both requests', async () => {
    const { client, calls } = makeClient();
    const first = page(await run({ limit: 700 }, client));
    expect(first.ids).toEqual(ids(0, 700));
    expect(calls.map(call => call.limit)).toEqual([500, 200]);
    expect(first.coverage).toMatchObject({
      oldest_ts: NOW - 699,
      newest_ts: NOW,
      api_requests: 2,
      stopped_reason: 'limit_reached',
    });
  });

  it('search_flows gives the coverage too', async () => {
    const { client } = makeClient();
    const response = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 100 },
      client
    );
    const body = JSON.parse(response.content[0].text);
    expect(body.data.flows).toHaveLength(100);
    expect(body.data.coverage).toEqual({
      oldest_ts: NOW - 99,
      newest_ts: NOW,
      oldest: iso(NOW - 99),
      newest: iso(NOW),
      api_requests: 1,
      stopped_reason: 'limit_reached',
    });
  });

  it('skips an item without a usable ts, and reads milliseconds', () => {
    expect(
      pagingCoverage(
        [
          { ts: 1_700_000_000.5 },
          {},
          { ts: 'soon' },
          { ts: 1_700_000_100_000 },
        ],
        { api_requests: 1, stopped_reason: 'no_more_pages' }
      )
    ).toMatchObject({ oldest_ts: 1_700_000_000.5, newest_ts: 1_700_000_100 });
    expect(
      pagingCoverage([], { api_requests: 1, stopped_reason: 'no_more_pages' })
    ).toMatchObject({ oldest_ts: null, newest_ts: null, oldest: null });
  });
});

describe('StreamingManager', () => {
  it("sends each chunk the chunk size and the session's cursor", async () => {
    const manager = new StreamingManager({ chunkSize: 50 });
    const operation = jest.fn(async (params: any) => ({
      data: [params.cursor ?? 'start'],
      hasMore: true,
      nextCursor: `after-${params.cursor ?? 'start'}`,
    }));
    const { sessionId } = await manager.startStreaming('t', operation, {
      query: 'protocol:tcp',
      limit: 200,
      cursor: 'saved',
    });
    await manager.continueStreaming(sessionId, operation);
    expect(operation.mock.calls.map(([params]) => params)).toEqual([
      { query: 'protocol:tcp', limit: 50, cursor: undefined },
      { query: 'protocol:tcp', limit: 50, cursor: 'after-start' },
    ]);
    manager.shutdown();
  });

  it('reads overlapping chunks of a session one after the other', async () => {
    const manager = new StreamingManager({ chunkSize: 10 });
    const operation = jest.fn(async (params: any) => {
      await delay(5);
      const at = Number(params.cursor ?? 0);
      return { data: [at], hasMore: at < 20, nextCursor: String(at + 10) };
    });
    const { sessionId } = await manager.startStreaming('t', operation, {});
    const [second, third, fourth] = await Promise.allSettled([
      manager.continueStreaming(sessionId, operation),
      manager.continueStreaming(sessionId, operation),
      manager.continueStreaming(sessionId, operation),
    ]);
    expect(second).toMatchObject({ value: { data: [10], chunkId: 2 } });
    expect(third).toMatchObject({
      value: { data: [20], chunkId: 3, isFinalChunk: true },
    });
    // Queued behind the final chunk
    expect(fourth.status).toBe('rejected');
    const reason = (fourth as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(StreamingSessionError);
    expect(reason.reason).toBe('complete');
    expect(operation.mock.calls.map(([params]) => params.cursor)).toEqual([
      undefined,
      '10',
      '20',
    ]);
    manager.shutdown();
  });

  it('forTool returns the same manager for a tool and owner', () => {
    const owner = {};
    const manager = StreamingManager.forTool('get_flow_data', owner);
    expect(StreamingManager.forTool('get_flow_data', owner)).toBe(manager);
    expect(StreamingManager.forTool('get_flow_data', {})).not.toBe(manager);
    expect(StreamingManager.forTool('search_flows', owner)).not.toBe(manager);
  });
});
