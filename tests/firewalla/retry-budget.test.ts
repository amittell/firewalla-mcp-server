/**
 * A failed GET is sent again only when its answer could still come before
 * the tool gives up: the wait before the retry (at most 2 s) plus as long
 * again as the failed attempt took must end before the tool's deadline. A
 * retry that could not answer in time still cost one of the API's 100
 * requests per 5 minutes. With the defaults (API_TIMEOUT and the tool
 * timeout both 30 s), a GET that ran out its timeout was retried after the
 * tool had already answered "timed out". The tool's deadline and an abort
 * signal reach the client from withToolTimeout, so a request in flight when
 * the tool gives up is cancelled, and one not yet sent is not sent.
 *
 * The HTTP layer is stubbed. In the budget tests Date.now, the clock the
 * tool's deadline is set with, is controlled: each answer moves it on by
 * `afterMs`, and so does the client's wait before a retry.
 */

import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import {
  TimeoutError,
  currentToolBudget,
  withToolTimeout,
} from '../../src/utils/timeout-manager.js';

/** How request i + 1 is answered: after `afterMs`, failing with `fail` */
interface Answer {
  afterMs?: number;
  /** An HTTP status, or the axios code of a request with no answer */
  fail?: number | string;
}

let now = Date.UTC(2026, 8, 27, 12);

function makeClient(
  answers: Answer[],
  {
    apiTimeout = 30000,
    rateLimit = 100,
    sleep,
  }: {
    apiTimeout?: number;
    rateLimit?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {}
) {
  const sleeps: number[] = [];
  const clock = {
    now: () => now,
    sleep:
      sleep ??
      (async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      }),
  };
  const client = new FirewallaClient(
    {
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      apiTimeout,
      rateLimit,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    } as any,
    clock
  );
  const calls: Array<{ limit: number; signal?: AbortSignal }> = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    calls.push({
      limit: Number(config.params?.limit),
      signal: config.signal as AbortSignal | undefined,
    });
    const answer = answers[calls.length - 1] ?? {};
    now += answer.afterMs ?? 0;
    const reply = (status: number, data: unknown) =>
      ({
        status,
        statusText: '',
        headers: {},
        data,
        config,
        request: {},
      }) as AxiosResponse;
    if (typeof answer.fail === 'string') {
      throw new AxiosError(
        answer.fail === 'ECONNABORTED'
          ? `timeout of ${apiTimeout}ms exceeded`
          : `read ${answer.fail}`,
        answer.fail,
        config
      );
    }
    if (typeof answer.fail === 'number') {
      throw new AxiosError(
        `Request failed with status code ${answer.fail}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        {},
        reply(answer.fail, '')
      );
    }
    const start = Number(config.params?.cursor ?? 0);
    const limit = Number(config.params?.limit);
    return reply(200, {
      count: limit,
      results: Array.from({ length: limit }, (_, i) => ({
        ts: 1_700_000_000 - (start + i),
        gid: '00000000-0000-0000-0000-000000000000',
        protocol: 'tcp',
        device: { id: `dev-${start + i}`, ip: '192.168.1.10' },
      })),
      next_cursor: String(start + limit),
    });
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, calls, sleeps };
}

/** get_flow_data's answer: its coverage, or its error message */
async function getFlowData(client: FirewallaClient, limit = 10) {
  const response = await new GetFlowDataHandler().execute(
    { limit, stream: false },
    client
  );
  const body = JSON.parse(response.content[0].text);
  return response.isError
    ? { error: body.message as string }
    : { coverage: body.data.coverage };
}

beforeEach(() => {
  // The client logs each request and response to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a retry must be able to answer within the tool's 30 s", () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('with the defaults, a GET that ran out its 30 s timeout is not sent again', async () => {
    const { client, calls, sleeps } = makeClient([
      { afterMs: 30000, fail: 'ECONNABORTED' },
    ]);
    const result = await getFlowData(client);
    expect(result.error).toContain(
      'Firewalla API sent no answer (ECONNABORTED: timeout of 30000ms exceeded)'
    );
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each([503, 'ECONNRESET', 'EPIPE'])(
    'a %s that came back at once is sent again',
    async fail => {
      const { client, calls } = makeClient([{ afterMs: 50, fail }]);
      const result = await getFlowData(client);
      expect(result.coverage).toMatchObject({ api_requests: 2 });
      expect(calls).toHaveLength(2);
    }
  );

  it('a 503 that took 20 s is not sent again', async () => {
    const { client, calls, sleeps } = makeClient([
      { afterMs: 20000, fail: 503 },
    ]);
    const result = await getFlowData(client);
    expect(result.error).toContain('Firewalla API answered 503');
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('with API_TIMEOUT 5 s, a GET that timed out is sent again', async () => {
    const { client, calls } = makeClient(
      [{ afterMs: 5000, fail: 'ECONNABORTED' }],
      { apiTimeout: 5000 }
    );
    const result = await getFlowData(client);
    expect(result.coverage).toMatchObject({ api_requests: 2 });
    expect(calls).toHaveLength(2);
  });

  it('the time the read already took counts', async () => {
    // A second page that fails at once, after a first page of 20 s: 2 s
    // wait and a retry as fast as the failure fit in the 10 s left
    const quick = makeClient([{ afterMs: 20000 }, { afterMs: 50, fail: 503 }]);
    expect((await getFlowData(quick.client, 700)).coverage).toMatchObject({
      api_requests: 3,
    });
    // After a first page of 28.5 s they do not
    const late = makeClient([{ afterMs: 28500 }, { afterMs: 50, fail: 503 }]);
    expect((await getFlowData(late.client, 700)).error).toContain(
      'Firewalla API answered 503'
    );
    expect(late.calls.map(call => call.limit)).toEqual([500, 200]);
  });

  it("outside a tool, the budget is 30 s from the request's first send", async () => {
    const slow = makeClient([{ afterMs: 20000, fail: 503 }]);
    await expect(
      slow.client.getFlowData(undefined, undefined, undefined, 5)
    ).rejects.toMatchObject({ status: 503, attempts: 1 });
    expect(slow.calls).toHaveLength(1);

    const fast = makeClient([{ afterMs: 50, fail: 503 }]);
    const flows = await fast.client.getFlowData(
      undefined,
      undefined,
      undefined,
      5
    );
    expect(flows.results).toHaveLength(5);
    expect(fast.calls).toHaveLength(2);
  });

  it('outside a tool, time queued for the rate limiter is not taken from the budget', async () => {
    // Two requests per 5 minutes, both taken at the start. A read made
    // 285 s later waits 15 s for a slot, is sent at 300 s, and gets a 503
    // after 10 s: 2 s and another 10 s end at 322 s, inside 300 s + 30 s,
    // though past 285 s + 30 s. The retry's slot is free by then.
    const { client, calls } = makeClient(
      [{}, {}, { afterMs: 10000, fail: 503 }],
      { rateLimit: 2 }
    );
    const start = now;
    await client.getFlowData('device.id:a', undefined, undefined, 5);
    now += 1000;
    await client.getFlowData('device.id:b', undefined, undefined, 5);
    now = start + 285_000;
    const flows = await client.getFlowData(
      'device.id:c',
      undefined,
      undefined,
      5
    );
    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(4);
    expect(flows.coverage).toMatchObject({ api_requests: 2 });
  });
});

describe('when the tool gives up', () => {
  it('withToolTimeout gives its operation a deadline and a signal', async () => {
    const started = Date.now();
    const budget = await withToolTimeout(
      async () => currentToolBudget(),
      'get_flow_data',
      5000
    );
    expect(budget?.deadline).toBeGreaterThanOrEqual(started + 5000);
    expect(budget?.signal.aborted).toBe(false);
    expect(currentToolBudget()).toBeUndefined();
  });

  it('the request in flight is cancelled', async () => {
    const { client, calls } = makeClient([]);
    // An API that answers only when the request is cancelled, or after 1 s
    (client as any).api.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ) => {
      const signal = config.signal as AbortSignal | undefined;
      calls.push({ limit: Number(config.params?.limit), signal });
      await Promise.race([
        delay(1000),
        new Promise(resolve => signal?.addEventListener('abort', resolve)),
      ]);
      throw new CanceledError('canceled', undefined, config);
    };
    await expect(
      withToolTimeout(
        () => client.getFlowData(undefined, undefined, undefined, 5),
        'get_flow_data',
        100
      )
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(true);
  });

  it('a request made after it gave up is not sent', async () => {
    const { client, calls } = makeClient([]);
    let late: unknown;
    await expect(
      withToolTimeout(
        async () => {
          await delay(150);
          return client
            .getFlowData(undefined, undefined, undefined, 5)
            .catch(error => {
              late = error;
              throw error;
            });
        },
        'get_flow_data',
        100
      )
    ).rejects.toBeInstanceOf(TimeoutError);
    await delay(250);
    expect(calls).toHaveLength(0);
    expect(late).toMatchObject({ code: 'ERR_CANCELED' });
  });

  it('a request queued for the rate limiter takes no slot', async () => {
    // One request per 5 minutes, taken 290 s ago: the next waits 10 s, but
    // the tool gives up after 100 ms. Once the first request's window has
    // passed, a new request goes out at once: the cancelled one held no slot.
    const { client, calls } = makeClient([], {
      rateLimit: 1,
      sleep: async ms => {
        await delay(Math.min(ms, 500));
        now += ms;
      },
    });
    const start = now;
    await client.getFlowData('device.id:a', undefined, undefined, 5);
    now = start + 290_000;
    await expect(
      withToolTimeout(
        () => client.getFlowData('device.id:b', undefined, undefined, 5),
        'get_flow_data',
        100
      )
    ).rejects.toBeInstanceOf(TimeoutError);
    // Past the queued request's wait
    await delay(700);
    expect(calls).toHaveLength(1);
    now = start + 300_001;
    const flows = await client.getFlowData(
      'device.id:c',
      undefined,
      undefined,
      5
    );
    expect(flows.results).toHaveLength(5);
    expect(calls).toHaveLength(2);
  });

  it('a retry still waiting to be sent is not sent', async () => {
    // The tool's 2.1 s leave room for a retry of a 503 that came back at
    // once, but the wait before it takes 2.5 s
    const { client, calls } = makeClient([{ fail: 503 }], {
      sleep: () => delay(2500),
    });
    let late: unknown;
    await expect(
      withToolTimeout(
        () =>
          client
            .getFlowData(undefined, undefined, undefined, 5)
            .catch(error => {
              late = error;
              throw error;
            }),
        'get_flow_data',
        2100
      )
    ).rejects.toBeInstanceOf(TimeoutError);
    await delay(700);
    expect(calls).toHaveLength(1);
    // The failure the retry was for
    expect(late).toMatchObject({ status: 503, attempts: 1 });
  });
});
