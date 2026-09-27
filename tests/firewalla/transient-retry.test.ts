/**
 * The client sends a GET again once, 1 to 2 s later, after a timeout
 * (ECONNABORTED, ETIMEDOUT), a dropped connection (ECONNRESET, EPIPE) or an
 * HTTP 502, 503 or 504, for every read. A write is never sent again. The
 * retry goes through the rate limiter and counts in coverage.api_requests.
 * search_flows used to retry on its own, deciding by the error message:
 * every failure reached it wrapped by withToolTimeout in a message that
 * says "not a timeout", so every failure matched "timeout" and was sent
 * twice, while get_flow_data and the other reads were never retried. A read
 * that still fails says what the API answered and how many attempts were
 * made; withToolTimeout no longer replaces the message.
 *
 * The HTTP layer is stubbed: `answers[i]` is how request i + 1 fails, and
 * null (or no entry) answers it. Time is a clock that moves only when the
 * client sleeps.
 */

import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import {
  TimeoutError,
  withToolTimeout,
} from '../../src/utils/timeout-manager.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';

/** An HTTP status, or the axios error code of a request with no answer */
type Failure = number | string | { status: 429; retryAfter: string };

const GID = '00000000-0000-0000-0000-000000000000';

function makeClient(
  answers: Array<Failure | null>,
  { rateLimit = 100 }: { rateLimit?: number } = {}
) {
  let time = Date.UTC(2026, 0, 1);
  const sleeps: number[] = [];
  const clock = {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += Math.max(ms, 0);
    },
  };
  const client = new FirewallaClient(
    {
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      apiTimeout: 30000,
      rateLimit,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    } as any,
    clock
  );
  /** Each request that reached the adapter: `GET /v2/flows` */
  const calls: string[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(`${config.method?.toUpperCase()} ${config.url}`);
    const reply = (status: number, data: unknown, headers = {}) =>
      ({
        status,
        statusText: '',
        headers,
        data,
        config,
        request: {},
      }) as AxiosResponse;
    const failure = answers[calls.length - 1];
    if (typeof failure === 'string') {
      // What axios says for its own timeout; a socket error's message
      throw new AxiosError(
        failure === 'ECONNABORTED'
          ? 'timeout of 30000ms exceeded'
          : `read ${failure}`,
        failure,
        config
      );
    }
    if (typeof failure === 'number' || (failure && failure.status)) {
      const status = typeof failure === 'number' ? failure : failure.status;
      const headers =
        typeof failure === 'number'
          ? {}
          : { 'retry-after': failure.retryAfter };
      throw new AxiosError(
        `Request failed with status code ${status}`,
        status >= 500
          ? AxiosError.ERR_BAD_RESPONSE
          : AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        reply(status, '', headers)
      );
    }
    if (config.url === '/v2/devices') {
      return reply(200, [
        { id: 'aa:bb:cc:00:00:01', gid: GID, name: 'laptop', online: true },
      ]);
    }
    if (config.url === '/v2/alarms') {
      return reply(200, {
        count: 1,
        results: [{ aid: 1, gid: GID, type: 1, status: 1, ts: 1_700_000_000 }],
      });
    }
    if (config.url === '/v2/flows') {
      const limit = Number(config.params?.limit);
      return reply(200, {
        count: limit,
        results: Array.from({ length: limit }, (_, i) => ({
          ts: 1_700_000_000 - i,
          gid: GID,
          protocol: 'tcp',
          device: { id: `dev-${i}`, ip: '192.168.1.10' },
        })),
      });
    }
    return reply(200, { success: true });
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, calls, sleeps };
}

/** A tool's answer: its data, or its error message */
async function run(
  handler: ToolHandler,
  args: Record<string, unknown>,
  client: FirewallaClient
) {
  const response = await handler.execute(args, client);
  const body = JSON.parse(response.content[0].text);
  return response.isError
    ? { error: body.message as string }
    : { data: body.data ?? body };
}

const TOOLS = [
  {
    name: 'get_flow_data',
    handler: new GetFlowDataHandler(),
    args: { limit: 10 },
    coverage: (data: any) => data.coverage,
  },
  {
    name: 'search_flows',
    handler: new SearchFlowsHandler(),
    args: { query: 'protocol:tcp', limit: 10 },
    coverage: (data: any) => data.coverage,
  },
  {
    name: 'get_active_alarms',
    handler: new GetActiveAlarmsHandler(),
    args: { limit: 10 },
    coverage: undefined,
  },
  {
    name: 'get_device_status',
    handler: new GetDeviceStatusHandler(),
    args: { limit: 10 },
    coverage: undefined,
  },
];

beforeEach(() => {
  // The client logs each request and response to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a 503, then a 200', () => {
  it.each(TOOLS)(
    '$name answers from the second request',
    async ({ handler, args, coverage }) => {
      const { client, calls, sleeps } = makeClient([503]);
      const result = await run(handler, args, client);
      expect(result.error).toBeUndefined();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe(calls[1]);
      // One wait of 1 to 2 s before the second request
      expect(sleeps).toHaveLength(1);
      expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
      expect(sleeps[0]).toBeLessThan(2000);
      if (coverage) {
        expect(coverage(result.data)).toMatchObject({
          api_requests: 2,
          cached_pages: 0,
        });
      }
    }
  );
});

describe('the client sends a GET again once', () => {
  // These stubs fail at once, so a retry fits in the tool's time; how long
  // the failure took is tested in retry-budget.test.ts, where a GET that ran
  // out a 30 s timeout is not sent again
  it.each([502, 503, 504, 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'])(
    'after %s',
    async failure => {
      const { client, calls } = makeClient([failure]);
      const flows = await client.getFlowData(
        undefined,
        undefined,
        undefined,
        5
      );
      expect(flows.results).toHaveLength(5);
      expect(calls).toEqual(['GET /v2/flows', 'GET /v2/flows']);
      expect(flows.coverage).toMatchObject({ api_requests: 2 });
    }
  );

  it.each([400, 401, 403, 404, 500, 'ECONNREFUSED', 'ENOTFOUND'])(
    'but not after %s',
    async failure => {
      const { client, calls, sleeps } = makeClient([failure]);
      await expect(
        client.getFlowData(undefined, undefined, undefined, 5)
      ).rejects.toThrow();
      expect(calls).toHaveLength(1);
      expect(sleeps).toEqual([]);
    }
  );

  it('and only once', async () => {
    const { client, calls } = makeClient([503, 503]);
    await expect(
      client.getFlowData(undefined, undefined, undefined, 5)
    ).rejects.toMatchObject({ status: 503, attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it('through the rate limiter: with no capacity left it is not sent', async () => {
    // One request per 5 minutes: the retry would wait past the 20 s limit
    const { client, calls } = makeClient([503], { rateLimit: 1 });
    await expect(
      client.getFlowData(undefined, undefined, undefined, 5)
    ).rejects.toMatchObject({
      status: 503,
      attempts: 1,
      message:
        'Firewalla API answered 503 Service Unavailable: the Firewalla API is temporarily down',
    });
    expect(calls).toHaveLength(1);
  });

  it("after a 429's own retry got a 503", async () => {
    const { client, calls } = makeClient([
      { status: 429, retryAfter: '1' },
      503,
    ]);
    const flows = await client.getFlowData(undefined, undefined, undefined, 5);
    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(3);
    expect(flows.coverage).toMatchObject({ api_requests: 3 });
  });
});

describe('a 429 keeps its own path', () => {
  it('search_flows reports a 429 the client gave up on, with one request', async () => {
    // An hour is past the request's 20 s wait, so the client does not retry
    const { client, calls, sleeps } = makeClient([
      { status: 429, retryAfter: '3600' },
    ]);
    const result = await run(
      new SearchFlowsHandler(),
      { query: 'protocol:tcp', limit: 10 },
      client
    );
    expect(result.error).toMatch(/Rate limit exceeded \(HTTP 429\)/);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });
});

describe('a write is never sent again', () => {
  it.each([503, 'ECONNRESET', 'ECONNABORTED'])('after %s', async failure => {
    const { client, calls, sleeps } = makeClient([failure, failure]);
    await expect(
      client.createTargetList({
        name: 'x',
        owner: 'global',
        targets: ['a.com'],
      })
    ).rejects.toThrow();
    await expect(client.deleteTargetList('t-1')).rejects.toThrow();
    expect(calls).toEqual([
      'POST /v2/target-lists',
      'DELETE /v2/target-lists/t-1',
    ]);
    expect(sleeps).toEqual([]);
  });
});

describe('the error after the last attempt', () => {
  const FAILURES = [
    {
      name: 'a 503 twice',
      answers: [503, 503],
      says: 'Firewalla API answered 503 Service Unavailable after 2 attempts: the Firewalla API is temporarily down',
      requests: 2,
    },
    {
      name: 'a timeout twice',
      answers: ['ECONNABORTED', 'ECONNABORTED'],
      says: 'Firewalla API sent no answer after 2 attempts (ECONNABORTED: timeout of 30000ms exceeded)',
      requests: 2,
    },
    {
      name: 'a 400, not retried',
      answers: [400],
      says: 'Firewalla API answered 400 Bad Request: invalid parameters sent to /v2/flows',
      requests: 1,
    },
  ];

  for (const tool of TOOLS.slice(0, 2)) {
    it.each(FAILURES)(
      `${tool.name}: $name`,
      async ({ answers, says, requests }) => {
        const { client, calls } = makeClient(answers);
        const result = await run(tool.handler, tool.args, client);
        expect(result.error).toContain(says);
        expect(result.error).not.toMatch(
          /not a timeout|immediate parameter|configuration error|processing error/
        );
        expect(calls).toHaveLength(requests);
      }
    );
  }
});

describe("the client's searches read the status and code, not the message", () => {
  it('a timeout twice is a timed-out search that says what happened', async () => {
    const { client, calls } = makeClient(['ECONNABORTED', 'ECONNABORTED']);
    await expect(
      client.searchAlarms({ query: 'type:1', limit: 10 })
    ).rejects.toThrow(
      'Search request timed out: Firewalla API sent no answer after 2 attempts (ECONNABORTED: timeout of 30000ms exceeded). Try reducing the search scope or limit.'
    );
    expect(calls).toHaveLength(2);
  });

  it('a 400 is an invalid query', async () => {
    const { client, calls } = makeClient([400]);
    await expect(
      client.searchAlarms({ query: 'type:1', limit: 10 })
    ).rejects.toThrow(
      'Invalid search query: Firewalla API answered 400 Bad Request: invalid parameters sent to /v2/alarms'
    );
    expect(calls).toHaveLength(1);
  });
});

describe('withToolTimeout', () => {
  it('throws a failure as it came, fast or slow', async () => {
    const failure = new Error('Firewalla API answered 503 Service Unavailable');
    await expect(
      withToolTimeout(async () => Promise.reject(failure), 'get_flow_data')
    ).rejects.toBe(failure);
    await expect(
      withToolTimeout(async () => {
        await new Promise(resolve => setTimeout(resolve, 60));
        throw failure;
      }, 'get_flow_data')
    ).rejects.toBe(failure);
  });

  it('still throws TimeoutError when the limit passes', async () => {
    await expect(
      withToolTimeout(
        () => new Promise(resolve => setTimeout(resolve, 200)),
        'get_flow_data',
        20
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
