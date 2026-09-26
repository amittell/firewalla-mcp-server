/**
 * @fileoverview Client-side pacing for the Firewalla MSP API
 *
 * The MSP API allows 100 requests per fixed 5-minute window, which starts
 * with the first request after the previous window ends. Over that it
 * answers HTTP 429 with `retry-after` (seconds) and `x-ratelimit-reset`
 * (epoch seconds), both giving the window's end. Its successful responses
 * carry no rate-limit headers, so the client counts its own requests
 * (RequestRateLimiter) and pauses on a 429 (see FirewallaClient).
 *
 * A request waits for the rate limit only as long as a tool waits for its
 * answer: past RATE_LIMIT_MAX_WAIT_MS it fails at once with a RateLimitError
 * saying when capacity returns.
 */

/**
 * The window `API_RATE_LIMIT` counts requests over. The client counts over a
 * rolling window of this length, which never lets more requests through
 * than the API's fixed window of the same length accepts.
 */
export const RATE_LIMIT_WINDOW_MS = 300_000;

/** The limit when the configured one is missing or not a positive number */
export const DEFAULT_RATE_LIMIT = 100;

/**
 * The longest a request waits for the rate limit, in the queue and on 429s
 * together, counted from when it was first made. Tool handlers give up after
 * 30 s by default, so a longer wait would only turn into a timeout.
 */
export const RATE_LIMIT_MAX_WAIT_MS = 20_000;

/** Retries of a rate-limited GET, when their waits fit the budget */
export const MAX_RATE_LIMIT_RETRIES = 2;

/** The pause after a 429 without a usable `x-ratelimit-reset` or `retry-after` */
export const DEFAULT_RATE_LIMIT_PAUSE_MS = RATE_LIMIT_WINDOW_MS;

/** The shortest pause after a 429, for a reset that is due or past */
export const MIN_RATE_LIMIT_PAUSE_MS = 1_000;

/** The longest pause after a 429, whatever its headers say */
export const MAX_RATE_LIMIT_PAUSE_MS = 2 * RATE_LIMIT_WINDOW_MS;

/** Time and waiting, injectable so tests need not wait in real time */
export interface Clock {
  /** Milliseconds since the epoch */
  now: () => number;
  /** Resolves after `ms` milliseconds */
  sleep: (ms: number) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: async ms =>
    new Promise<void>(resolve => {
      setTimeout(resolve, Math.max(ms, 0));
    }),
};

/** A request refused, or given up on, because of the rate limit */
export class RateLimitError extends Error {
  constructor(
    message: string,
    /** When a request could next start, in milliseconds since the epoch */
    readonly availableAt: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * A RateLimitError saying how many requests the window allows and when
 * capacity returns, in seconds from `now` and as a UTC time, then `detail`
 */
export function rateLimitError(options: {
  limit: number;
  windowMs: number;
  now: number;
  availableAt: number;
  detail: string;
  /** The HTTP status the API answered, when it answered */
  status?: number;
}): RateLimitError {
  const { limit, windowMs, now, availableAt, detail, status } = options;
  const seconds = Math.max(0, Math.ceil((availableAt - now) / 1000));
  const at = new Date(Math.ceil(availableAt / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
  return new RateLimitError(
    `Rate limit exceeded${status ? ` (HTTP ${status})` : ''}: the Firewalla API allows ${limit} requests per ${windowMs / 60_000} minutes (API_RATE_LIMIT); capacity returns in ${seconds} s, at ${at}. ${detail}`,
    availableAt
  );
}

/**
 * Lets at most `limit` requests start in any rolling window of `windowMs`.
 * A request over the limit waits for a slot, in the order requests asked
 * (FIFO), but only until its deadline. `pauseUntil` holds every request back,
 * for when the API itself has refused one.
 */
export class RequestRateLimiter {
  /** When each request in the current window started, oldest first */
  private readonly started: number[] = [];
  /** No request starts before this time */
  private pausedUntil = 0;
  /** Requests waiting for a slot */
  private waiting = 0;
  /** Settles once the last waiting request has its slot, or has given up */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly limit: number,
    private readonly clock: Clock = systemClock,
    readonly windowMs: number = RATE_LIMIT_WINDOW_MS
  ) {}

  /**
   * Takes a slot if one is free now and no request is waiting for one.
   * Returns false, and takes nothing, otherwise.
   */
  tryAcquire(): boolean {
    const now = this.clock.now();
    if (this.waiting > 0 || this.slotAt(now) > now) {
      return false;
    }
    this.started.push(now);
    return true;
  }

  /**
   * When a request asked for now would start: after the requests already
   * waiting, the slots they take, and any pause
   */
  nextStartAt(): number {
    const now = this.clock.now();
    this.expire(now);
    const free = this.limit - this.started.length;
    const ahead = this.waiting;
    let windowAt: number;
    if (ahead < free) {
      windowAt = now;
    } else if (ahead - free < this.started.length) {
      windowAt = this.started[ahead - free] + this.windowMs;
    } else {
      // The slot depends on requests not yet started: a window away at least
      windowAt = now + this.windowMs;
    }
    return Math.max(windowAt, this.pausedUntil);
  }

  /**
   * Resolves once the caller has a slot, after every request queued before
   * it. Rejects with a RateLimitError if the slot would come after
   * `deadline`, for example because a 429 paused the client meanwhile.
   */
  async acquire(deadline: number): Promise<void> {
    this.waiting++;
    const turn = this.queue.then(async () => {
      for (;;) {
        const now = this.clock.now();
        const at = this.slotAt(now);
        if (at <= now) {
          this.started.push(now);
          return;
        }
        if (at > deadline) {
          throw this.unavailable(at);
        }
        await this.clock.sleep(at - now);
      }
    });
    this.queue = turn.catch(() => undefined);
    try {
      await turn;
    } finally {
      this.waiting--;
    }
  }

  /** Starts no request before `at` (milliseconds since the epoch) */
  pauseUntil(at: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, at);
  }

  /** The error for a request not sent because it would start only at `at` */
  unavailable(at: number): RateLimitError {
    const cause =
      this.pausedUntil >= at
        ? 'the API refused an earlier request with HTTP 429'
        : `this client started ${this.limit} requests in the last ${this.windowMs / 60_000} minutes`;
    return rateLimitError({
      limit: this.limit,
      windowMs: this.windowMs,
      now: this.clock.now(),
      availableAt: at,
      detail: `Not sent: ${cause}, and a request waits at most ${RATE_LIMIT_MAX_WAIT_MS / 1000} s for the rate limit.`,
    });
  }

  /** Forgets requests that started a whole window ago */
  private expire(now: number): void {
    while (this.started.length > 0 && this.started[0] + this.windowMs <= now) {
      this.started.shift();
    }
  }

  /** When the next slot frees, for the request at the head of the queue */
  private slotAt(now: number): number {
    this.expire(now);
    const windowAt =
      this.started.length < this.limit ? now : this.started[0] + this.windowMs;
    return Math.max(windowAt, this.pausedUntil);
  }
}

/**
 * How long to pause after a 429, in milliseconds: until `x-ratelimit-reset`
 * when it is epoch seconds within MAX_RATE_LIMIT_PAUSE_MS from now, else for
 * `retry-after`, else DEFAULT_RATE_LIMIT_PAUSE_MS. Rounded up to whole
 * seconds and kept between MIN_RATE_LIMIT_PAUSE_MS and
 * MAX_RATE_LIMIT_PAUSE_MS.
 */
export function rateLimitPauseMs(headers: unknown, nowMs: number): number {
  const wait =
    parseRateLimitReset(headerValue(headers, 'x-ratelimit-reset'), nowMs) ??
    parseRetryAfter(headerValue(headers, 'retry-after'), nowMs) ??
    DEFAULT_RATE_LIMIT_PAUSE_MS;
  return Math.min(
    Math.max(Math.ceil(wait / 1000) * 1000, MIN_RATE_LIMIT_PAUSE_MS),
    MAX_RATE_LIMIT_PAUSE_MS
  );
}

/**
 * The wait until an `x-ratelimit-reset` time, in milliseconds. Undefined
 * unless the header is epoch seconds after now and within
 * MAX_RATE_LIMIT_PAUSE_MS of it; a local clock far off the API's gives
 * undefined, and `retry-after` is used instead.
 */
export function parseRateLimitReset(
  value: unknown,
  nowMs: number
): number | undefined {
  const text = headerText(value);
  if (!/^\d+$/.test(text)) {
    return undefined;
  }
  const wait = Number(text) * 1000 - nowMs;
  return wait > 0 && wait <= MAX_RATE_LIMIT_PAUSE_MS ? wait : undefined;
}

/**
 * The wait a `retry-after` header asks for, in milliseconds: either
 * delay-seconds or an HTTP-date (RFC 9110 section 10.2.3). A date already
 * past gives 0. Undefined when the header is absent or unparseable.
 */
export function parseRetryAfter(
  value: unknown,
  nowMs: number
): number | undefined {
  const text = headerText(value);
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text) * 1000;
  }
  // IMF-fixdate ("Sun, 06 Nov 1994 08:49:37 GMT") and the obsolete RFC 850
  // form both end in GMT; Date.parse alone accepts almost anything
  const at = text.endsWith('GMT') ? Date.parse(text) : NaN;
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

/** A response header by name, whatever its case */
export function headerValue(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find(k => k.toLowerCase() === wanted);
  return key === undefined
    ? undefined
    : (headers as Record<string, unknown>)[key];
}

/** A header value as trimmed text; the first of several */
function headerText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] : (value ?? '')).trim();
}
