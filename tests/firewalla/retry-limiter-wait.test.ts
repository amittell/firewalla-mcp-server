/**
 * A transient retry is sent only if it can still answer before its tool
 * gives up, counting the wait for a slot of the rate limiter. The check ran
 * once, before the 1 to 2 s wait: a fast 503 whose retry then waited for a
 * slot was sent when the slot came, with too little of the tool's time
 * left. The retry is now checked up front against when the limiter next has
 * a slot, again when it would take one, and again when it would go out; one
 * that no longer fits is not sent, not counted, and gives its slot back,
 * and the 503 it was for is reported. A request whose tool gives up between
 * getting a slot and being sent gives the slot back too.
 *
 * The HTTP layer is stubbed. Date.now, the clock the tool's deadline is
 * set with, and the client's clock are one controlled time: each answer
 * moves it on by `afterMs`, and so does each wait of the client.
 */

import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  FirewallaClient,
  readTrace,
  type RequestTrace,
} from '../../src/firewalla/client.js';
import { withToolTimeout } from '../../src/utils/timeout-manager.js';

/** How request i + 1 is answered: after `afterMs`, failing with `fail` */
interface Answer {
  afterMs?: number;
  fail?: number;
  retryAfter?: string;
}

let now = Date.UTC(2026, 8, 27, 12);

function makeClient(answers: Answer[], { rateLimit = 100 } = {}) {
  const sleeps: number[] = [];
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
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
  const calls: string[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(String(config.params?.query));
    const answer = answers[calls.length - 1] ?? {};
    now += answer.afterMs ?? 0;
    const reply = (status: number, data: unknown, headers = {}) =>
      ({
        status,
        statusText: '',
        headers,
        data,
        config,
        request: {},
      }) as AxiosResponse;
    if (answer.fail) {
      throw new AxiosError(
        `Request failed with status code ${answer.fail}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        {},
        reply(
          answer.fail,
          '',
          answer.retryAfter ? { 'retry-after': answer.retryAfter } : {}
        )
      );
    }
    const limit = Number(config.params?.limit);
    return reply(200, {
      count: limit,
      results: Array.from({ length: limit }, (_, i) => ({
        ts: 1_700_000_000 - i,
        gid: '00000000-0000-0000-0000-000000000000',
        protocol: 'tcp',
        device: { id: `dev-${i}` },
      })),
    });
  };
  (client as any).api.defaults.adapter = adapter;
  const limiter = (client as any).rateLimiter;
  return {
    client,
    calls,
    sleeps,
    limiter,
    /** When each request in the rate limiter's window started */
    started: (): number[] => limiter.started.map((slot: any) => slot.at),
  };
}

/**
 * A read of device `id` by a tool that spent `spentMs` first, with a trace
 * of its requests; resolves to the flows or the error
 */
async function readInTool(
  client: FirewallaClient,
  id: string,
  spentMs: number,
  trace: RequestTrace = readTrace()
) {
  return withToolTimeout(async () => {
    now += spentMs;
    return client
      .getFlowData(`device.id:${id}`, undefined, undefined, 5, undefined, trace)
      .catch(error => error);
  }, 'get_flow_data');
}

beforeEach(() => {
  // The client logs each request and response to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a retry's wait for the rate limiter counts", () => {
  it('a fast 503 whose retry slot comes after the deadline is not retried', async () => {
    // Two requests per 5 minutes. One taken 265 s before the tool starts
    // frees 35 s into the tool's 30 s; the tool's read takes the other at
    // 20 s and gets a 503 at once
    const { client, calls, sleeps, started } = makeClient(
      [{}, { afterMs: 50, fail: 503 }],
      { rateLimit: 2 }
    );
    const start = now;
    now = start - 265_000;
    await client.getFlowData('device.id:p', undefined, undefined, 5);
    now = start;
    const trace = readTrace();
    const failure = await readInTool(client, 'r', 20_000, trace);

    expect(failure).toMatchObject({ status: 503, attempts: 1 });
    expect(failure.message).toBe(
      'Firewalla API answered 503 Service Unavailable: the Firewalla API is temporarily down'
    );
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(1);
    // No wait before a retry, and no slot taken for one
    expect(sleeps).toEqual([]);
    expect(started()).toEqual([start - 265_000, start + 20_000]);
  });

  it('a 503 that took 10 s, whose retry would wait 10 s for a slot, is not retried', async () => {
    // Sent 5 s into the tool, answered 503 at 15 s; the next slot frees at
    // 25 s. 2 s of wait fits (27 s), the slot's 10 s does not (35 s): the
    // retry would go out with 5 s left for an attempt of 10 s.
    const { client, calls, sleeps } = makeClient(
      [{}, { afterMs: 10_000, fail: 503 }],
      { rateLimit: 2 }
    );
    const start = now;
    now = start - 275_000;
    await client.getFlowData('device.id:p', undefined, undefined, 5);
    now = start;
    const trace = readTrace();
    const failure = await readInTool(client, 'r', 5_000, trace);

    expect(failure).toMatchObject({ status: 503, attempts: 1 });
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('the same 503 with the slot 1 s away is retried', async () => {
    const { client, calls } = makeClient([{}, { afterMs: 50, fail: 503 }], {
      rateLimit: 2,
    });
    const start = now;
    now = start - 279_000;
    await client.getFlowData('device.id:p', undefined, undefined, 5);
    now = start;
    const trace = readTrace();
    const flows = await readInTool(client, 'r', 20_000, trace);

    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(3);
    expect(trace.sent).toBe(2);
  });

  it('a retry whose slot is granted too late is not sent, and gives the slot back', async () => {
    // The slot frees 5 s after the 503, which fits; the grant then comes
    // 6 s late (a hook on acquire), past the deadline
    const { client, calls, limiter, started } = makeClient(
      [{}, { afterMs: 50, fail: 503 }],
      { rateLimit: 2 }
    );
    const start = now;
    now = start - 275_000;
    await client.getFlowData('device.id:p', undefined, undefined, 5);
    now = start;
    const acquire = limiter.acquire.bind(limiter);
    const granted: any[] = [];
    jest
      .spyOn(limiter, 'acquire')
      .mockImplementation(async (...args: unknown[]) => {
        const at = await acquire(...args);
        granted.push(at);
        now += 6000;
        return at;
      });
    const trace = readTrace();
    const failure = await readInTool(client, 'r', 20_000, trace);

    expect(failure).toMatchObject({ status: 503, attempts: 1 });
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(1);
    expect(granted).toHaveLength(1);
    expect(limiter.started).not.toContain(granted[0]);
  });
});

describe("a retry's estimated answer must come before the deadline", () => {
  // A 503 that took 1 s is retried after at most 2 s and budgeted 1 s more:
  // read 26 s into the 30 s tool, that ends exactly at the deadline
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
  });

  it('a retry that would end exactly at the deadline is not sent', async () => {
    const { client, calls, sleeps } = makeClient([
      { afterMs: 1000, fail: 503 },
    ]);
    const trace = readTrace();
    const failure = await readInTool(client, 'r', 26_000, trace);

    expect(failure).toMatchObject({ status: 503, attempts: 1 });
    expect(calls).toHaveLength(1);
    expect(trace.sent).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('one that would end 1 ms before it is sent', async () => {
    const { client, calls, sleeps } = makeClient([
      { afterMs: 1000, fail: 503 },
    ]);
    const trace = readTrace();
    const flows = await readInTool(client, 'r', 25_999, trace);

    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(2);
    expect(sleeps).toEqual([2000]);
  });
});

describe('a 429 keeps its own path', () => {
  it('a 429 retry late in the tool is sent, as before', async () => {
    // 25 s into the tool, a 429 asking for 3 s: its retry is not a
    // transient retry, so no estimate applies
    const { client, calls } = makeClient([{ fail: 429, retryAfter: '3' }]);
    const trace = readTrace();
    const flows = await readInTool(client, 'r', 25_000, trace);

    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(2);
  });
});

describe('a 429 on a transient retry', () => {
  // Read 5 s into the tool; the 503 takes 8 s, and its retry, sent at
  // 14.5 s, is answered 429 with retry-after 8 s: the 429 retry can go out
  // at 22.55 s, inside the request's 20 s rate-limit wait
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it("is retried as any 429 is, not held to the 503 retry's estimate", async () => {
    const { client, calls } = makeClient([
      { afterMs: 8000, fail: 503 },
      { afterMs: 50, fail: 429, retryAfter: '8' },
      {},
    ]);
    const trace = readTrace();
    const flows = await readInTool(client, 'r', 5_000, trace);

    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(3);
    expect(trace.sent).toBe(3);
    expect(flows.coverage.api_requests).toBe(3);
  });

  it('a 503 on its 429 retry is not retried again: one transient retry per read', async () => {
    const { client, calls } = makeClient([
      { afterMs: 8000, fail: 503 },
      { afterMs: 50, fail: 429, retryAfter: '8' },
      { fail: 503 },
    ]);
    const trace = readTrace();
    const failure = await readInTool(client, 'r', 5_000, trace);

    expect(failure).toMatchObject({ status: 503, attempts: 3 });
    expect(calls).toHaveLength(3);
    expect(trace.sent).toBe(3);
  });

  it('a plain 429 at the same point is retried the same way', async () => {
    const { client, calls } = makeClient([
      { afterMs: 50, fail: 429, retryAfter: '8' },
      {},
    ]);
    const trace = readTrace();
    const flows = await readInTool(client, 'r', 14_500, trace);

    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(2);
    expect(trace.sent).toBe(2);
  });
});

describe('an abort between getting a slot and being sent', () => {
  it('sends nothing, counts nothing, and gives the slot back', async () => {
    // One request per 5 minutes; the next slot frees 1 s after the second
    // request is made. The hook aborts once acquire has granted the slot,
    // before send() runs.
    const { client, calls, limiter, started } = makeClient([], {
      rateLimit: 1,
    });
    const start = now;
    await client.getFlowData('device.id:a', undefined, undefined, 5);
    now = start + 299_000;
    const controller = new AbortController();
    const acquire = limiter.acquire.bind(limiter);
    const granted: any[] = [];
    jest
      .spyOn(limiter, 'acquire')
      .mockImplementation(async (...args: unknown[]) => {
        const at = await acquire(...args);
        granted.push(at);
        controller.abort();
        return at;
      });
    const onSent = jest.fn();
    const failure = await (client as any).api
      .get('/v2/flows', {
        params: { query: 'device.id:b', limit: 5 },
        signal: controller.signal,
        onSent,
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'ERR_CANCELED' });
    // axios's CanceledError takes (message, config, request)
    expect(failure.config?.url).toBe('/v2/flows');
    expect(calls).toHaveLength(1);
    expect(onSent).not.toHaveBeenCalled();
    // The first request's window has passed; the slot granted was given back
    expect(started()).toEqual([]);
    expect(granted.map(slot => slot.at)).toEqual([start + 300_000]);
  });
});
