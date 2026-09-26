/**
 * The MSP API allows 100 requests per fixed 5-minute window per token
 * (measured 2026-09-26). The 101st gets 429 {"error":{"message":"Too Many
 * Requests"}} with `retry-after` (seconds) and `x-ratelimit-reset` (epoch
 * seconds), both giving the window's end, up to about 300 s away. Successful
 * responses carry no rate-limit headers. The client never paced itself and
 * turned every 429 into an error. It now lets at most API_RATE_LIMIT requests
 * start in any rolling 5 minutes, waits for a slot or a 429's pause only
 * when that ends within 20 s (tools give up after 30 s), and otherwise fails
 * at once saying when capacity returns.
 *
 * axios is real; only its adapter is stubbed, so requests pass through the
 * client's interceptors as in production and nothing leaves the process.
 * Time is a clock the test moves by hand.
 */

import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  RateLimitError,
  RequestRateLimiter,
  parseRateLimitReset,
  parseRetryAfter,
  rateLimitPauseMs,
  type Clock,
} from '../../src/firewalla/rate-limit.js';
import { ErrorClassifier } from '../../src/validation/error-classification.js';
import { ErrorType } from '../../src/validation/error-handler.js';

const BOX = '00000000-0000-0000-0000-000000000000';
const START = Date.UTC(2026, 0, 1);
const epochSeconds = (ms: number) => String(Math.floor(ms / 1000));

/** Lets every queued promise callback run */
const settle = async () =>
  new Promise<void>(resolve => {
    setImmediate(resolve);
  });

/** A clock the test moves by hand; a sleep ends once the clock passes it */
class ManualClock implements Clock {
  private time = START;
  private sleepers: Array<{ at: number; wake: () => void }> = [];

  now = () => this.time;

  sleep = async (ms: number) =>
    new Promise<void>(wake => {
      this.sleepers.push({ at: this.time + Math.max(ms, 0), wake });
    });

  /** Moves the clock `ms` forward, ending each sleep when its time comes */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await settle();
    for (;;) {
      this.sleepers.sort((a, b) => a.at - b.at);
      const next = this.sleepers[0];
      if (!next || next.at > end) {
        break;
      }
      this.sleepers.shift();
      this.time = next.at;
      next.wake();
      await settle();
    }
    this.time = end;
    await settle();
  }
}

interface Reply {
  status: number;
  headers?: Record<string, string>;
  data?: unknown;
}

const tooManyRequests = (headers: Record<string, string> = {}): Reply => ({
  status: 429,
  headers: { 'x-ratelimit-remaining': '0', ...headers },
  data: { error: { message: 'Too Many Requests' } },
});

const boxes: Reply = { status: 200, data: [{ gid: BOX, name: 'Box' }] };

/**
 * A client allowing `rateLimit` requests per 5 minutes whose HTTP layer
 * answers the nth request (1-based) with `reply(n, now)`. `sent` records
 * each request as it reaches the network, with the clock's time.
 */
function makeClient(
  rateLimit: number,
  reply: (n: number, now: number) => Reply
) {
  const clock = new ManualClock();
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
  const sent: Array<{ method: string; url: string; at: number }> = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    sent.push({
      method: String(config.method).toUpperCase(),
      url: String(config.url),
      at: clock.now() - START,
    });
    const { status, headers = {}, data = {} } = reply(sent.length, clock.now());
    const response = {
      status,
      statusText: '',
      headers,
      data,
      config,
      request: {},
    } as AxiosResponse;
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response
      );
    }
    return response;
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, clock, sent };
}

/** Records how a promise settled, so the test can check it before it does */
function track<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: Error } = {
    settled: false,
  };
  void promise.then(
    value => Object.assign(state, { settled: true, value }),
    error => Object.assign(state, { settled: true, error })
  );
  return state;
}

let stderr: string[];
let stdout: string[];

beforeEach(() => {
  stderr = [];
  stdout = [];
  jest.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    stderr.push(String(chunk));
    return true;
  });
  // stdout carries the MCP stdio transport
  jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    stdout.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('client-side rate limit', () => {
  it('refuses at once a request over API_RATE_LIMIT whose slot is more than 20 s away', async () => {
    const { client, sent } = makeClient(3, () => boxes);
    // Distinct groups, so no answer comes from the cache
    const calls = [1, 2, 3, 4].map(n => track(client.getBoxes(`group-${n}`)));
    await settle();
    expect(sent).toHaveLength(3);
    expect(calls.slice(0, 3).every(call => call.value)).toBe(true);
    const message = calls[3].error?.message;
    expect(message).toContain(
      'Rate limit exceeded: the Firewalla API allows 3 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 300 s, at 2026-01-01T00:05:00Z. Not sent: this client started 3 requests in the last 5 minutes, and a request waits at most 20 s for the rate limit.'
    );
    expect(ErrorClassifier.classifyError(message!)).toBe(
      ErrorType.RATE_LIMIT_ERROR
    );
    expect(stderr).toContain(
      'API Request refused for the rate limit: GET /v2/boxes; capacity returns in 300 s\n'
    );
    expect(stderr.some(line => line.includes('API Response Error'))).toBe(
      false
    );
  });

  it('queues a request whose slot frees within 20 s, in order, counting every request of the client', async () => {
    const { client, clock, sent } = makeClient(2, () => ({
      status: 200,
      data: [],
    }));
    const first = [
      track(client.getBoxes('group-1')),
      track(client.makeApiCall('get', '/v2/devices')),
    ];
    await clock.advance(285_000);
    const queued = [
      track(client.getBoxes('group-2')),
      track(client.makeApiCall('get', '/v2/rules')),
    ];
    // Needs a slot the two queued requests have yet to take and free
    const refused = track(client.getBoxes('group-3'));
    await settle();
    expect(refused.error?.message).toContain('capacity returns in 300 s');
    expect(stderr).toContain(
      'API Request queued for the rate limit: GET /v2/rules\n'
    );

    await clock.advance(14_999);
    expect(sent).toHaveLength(2);
    await clock.advance(1);
    expect(
      [...first, ...queued].every(call => call.settled && !call.error)
    ).toBe(true);
    expect(sent.map(request => [request.url, request.at])).toEqual([
      ['/v2/boxes', 0],
      ['/v2/devices', 0],
      ['/v2/boxes', 300_000],
      ['/v2/rules', 300_000],
    ]);
  });

  it('gives up on a queued request when a pause pushes its slot past its deadline, and the queue moves on', async () => {
    const clock = new ManualClock();
    const limiter = new RequestRateLimiter(1, clock);
    expect(limiter.tryAcquire()).toBe(true);
    await clock.advance(290_000);
    const late = track(limiter.acquire(clock.now() + 20_000));
    const patient = track(limiter.acquire(clock.now() + 200_000));
    limiter.pauseUntil(START + 400_000);
    await clock.advance(10_000);
    expect(late.error).toBeInstanceOf(RateLimitError);
    expect((late.error as RateLimitError).availableAt).toBe(START + 400_000);
    expect(late.error?.message).toContain(
      'Not sent: the API refused an earlier request with HTTP 429'
    );
    expect(patient.settled).toBe(false);
    await clock.advance(100_000);
    expect(patient.settled).toBe(true);
    expect(patient.error).toBeUndefined();
  });
});

describe('HTTP 429', () => {
  it('retries a GET when the pause ends within 20 s, and returns its answer', async () => {
    const { client, clock, sent } = makeClient(100, n =>
      n === 1 ? tooManyRequests({ 'retry-after': '2' }) : boxes
    );
    const call = track(client.getBoxes());
    await settle();
    expect(sent).toHaveLength(1);

    await clock.advance(1_999);
    expect(sent).toHaveLength(1);
    await clock.advance(1);
    expect(sent).toHaveLength(2);
    expect(call.error).toBeUndefined();
    expect(call.value?.results.map(box => box.gid)).toEqual([BOX]);
    // One line says why the request waits; nothing goes to stdout
    expect(stderr.filter(line => line.startsWith('API '))).toEqual([
      'API Request: GET /v2/boxes\n',
      'API Response Error: 429 Request failed with status code 429\n',
      'API Rate Limited: 429 GET /v2/boxes; retrying in 2 s (retry 1 of 2)\n',
      'API Request: GET /v2/boxes\n',
      'API Response: 200 /v2/boxes\n',
    ]);
    expect(stdout).toEqual([]);
  });

  it('pauses until x-ratelimit-reset rather than for retry-after', async () => {
    const { client, clock, sent } = makeClient(100, (n, now) =>
      n === 1
        ? tooManyRequests({
            'retry-after': '15',
            'x-ratelimit-reset': epochSeconds(now + 5_000),
          })
        : boxes
    );
    const call = track(client.getBoxes());
    await clock.advance(20_000);
    expect(sent.map(request => request.at)).toEqual([0, 5_000]);
    expect(call.error).toBeUndefined();
  });

  it('falls back to retry-after as an HTTP date when x-ratelimit-reset is not epoch seconds', async () => {
    const { client, clock, sent } = makeClient(100, (n, now) =>
      n === 1
        ? tooManyRequests({
            'Retry-After': new Date(now + 5_000).toUTCString(),
            'X-RateLimit-Reset': '5',
          })
        : boxes
    );
    const call = track(client.getBoxes());
    await clock.advance(20_000);
    expect(sent.map(request => request.at)).toEqual([0, 5_000]);
    expect(call.error).toBeUndefined();
  });

  it('fails at once when the window ends more than 20 s away, and holds back the client’s other requests until then', async () => {
    // As measured: retry-after 190 and a reset 190 s away
    const { client, clock, sent } = makeClient(100, (n, now) =>
      n === 1
        ? tooManyRequests({
            'retry-after': '190',
            'x-ratelimit-reset': epochSeconds(now + 190_000),
          })
        : boxes
    );
    const first = track(client.getBoxes('group-1'));
    await settle();
    expect(first.error?.message).toContain(
      'Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 190 s, at 2026-01-01T00:03:10Z. Not retried, as a request waits at most 20 s for the rate limit.'
    );
    expect(ErrorClassifier.classifyError(first.error!)).toBe(
      ErrorType.RATE_LIMIT_ERROR
    );

    const during = track(client.getBoxes('group-2'));
    await settle();
    expect(during.error?.message).toContain(
      'capacity returns in 190 s, at 2026-01-01T00:03:10Z. Not sent: the API refused an earlier request with HTTP 429'
    );
    expect(sent).toHaveLength(1);

    await clock.advance(171_000);
    const after = track(client.getBoxes('group-3'));
    await clock.advance(18_999);
    expect(sent).toHaveLength(1);
    await clock.advance(1);
    expect(sent.map(request => request.at)).toEqual([0, 190_000]);
    expect(after.error).toBeUndefined();
  });

  it('pauses a whole window when the 429 has no usable header', async () => {
    const { client, sent } = makeClient(100, () => tooManyRequests());
    const call = track(client.getBoxes());
    await settle();
    expect(sent).toHaveLength(1);
    expect(call.error?.message).toContain(
      'capacity returns in 300 s, at 2026-01-01T00:05:00Z. Not retried'
    );
  });

  it('gives up after two retries', async () => {
    const { client, clock, sent } = makeClient(100, () =>
      tooManyRequests({ 'retry-after': '3' })
    );
    const call = track(client.getBoxes());
    await clock.advance(10_000);
    expect(sent.map(request => request.at)).toEqual([0, 3_000, 6_000]);
    expect(call.error?.message).toContain(
      'Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 3 s, at 2026-01-01T00:00:09Z. Gave up after 2 retries.'
    );
  });

  it('counts the 20 s from when the request was first made', async () => {
    const { client, clock, sent } = makeClient(100, () =>
      tooManyRequests({ 'retry-after': '12' })
    );
    const call = track(client.getBoxes());
    await clock.advance(30_000);
    expect(sent.map(request => request.at)).toEqual([0, 12_000]);
    expect(call.error?.message).toContain(
      'Not retried again after 1 retry, as a request waits at most 20 s for the rate limit.'
    );
  });

  it('does not replay a POST, but still holds back the next request', async () => {
    const { client, clock, sent } = makeClient(100, n =>
      n === 1 ? tooManyRequests({ 'retry-after': '2' }) : boxes
    );
    const post = track(
      client.createTargetList({ name: 'list', owner: 'global', targets: [] })
    );
    await settle();
    expect(post.error?.message).toContain(
      'Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 2 s, at 2026-01-01T00:00:02Z. A POST is not retried.'
    );

    const get = track(client.getBoxes());
    await clock.advance(10_000);
    expect(sent.map(request => [request.method, request.at])).toEqual([
      ['POST', 0],
      ['GET', 2_000],
    ]);
    expect(get.error).toBeUndefined();
  });
});

describe('429 headers', () => {
  const now = START;

  it('parseRetryAfter reads delay-seconds and HTTP dates', () => {
    expect(parseRetryAfter('190', now)).toBe(190_000);
    expect(parseRetryAfter(' 2 ', now)).toBe(2_000);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:40 GMT', now)).toBe(40_000);
    expect(parseRetryAfter('Wed, 31 Dec 2025 23:59:00 GMT', now)).toBe(0);
    for (const value of [undefined, '', 'soon', 'foo 2', '-5']) {
      expect(parseRetryAfter(value, now)).toBeUndefined();
    }
  });

  it('parseRateLimitReset reads epoch seconds within 10 minutes from now', () => {
    expect(parseRateLimitReset(epochSeconds(now + 190_000), now)).toBe(190_000);
    // Seconds rather than a time, a past time, or a local clock far off
    for (const value of [
      '190',
      epochSeconds(now - 1_000),
      epochSeconds(now + 3_600_000),
      'soon',
      undefined,
    ]) {
      expect(parseRateLimitReset(value, now)).toBeUndefined();
    }
  });

  it('rateLimitPauseMs prefers the reset, rounds up to whole seconds, and keeps within 1 s and 10 minutes', () => {
    // Measured: reset - now = 189.9 s beside retry-after 190
    expect(
      rateLimitPauseMs(
        {
          'x-ratelimit-reset': epochSeconds(now + 190_000),
          'retry-after': '1',
        },
        now + 100
      )
    ).toBe(190_000);
    expect(rateLimitPauseMs({ 'retry-after': '203' }, now)).toBe(203_000);
    expect(rateLimitPauseMs({}, now)).toBe(300_000);
    expect(rateLimitPauseMs({ 'retry-after': '0' }, now)).toBe(1_000);
    expect(rateLimitPauseMs({ 'retry-after': '86400' }, now)).toBe(600_000);
  });
});
