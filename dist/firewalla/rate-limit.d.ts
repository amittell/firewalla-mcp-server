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
export declare const RATE_LIMIT_WINDOW_MS = 300000;
/** The limit when the configured one is missing or not a positive number */
export declare const DEFAULT_RATE_LIMIT = 100;
/**
 * The longest a request waits for the rate limit, in the queue and on 429s
 * together, counted from when it was first made. Tool handlers give up after
 * 30 s by default, so a longer wait would only turn into a timeout.
 */
export declare const RATE_LIMIT_MAX_WAIT_MS = 20000;
/** Retries of a rate-limited GET, when their waits fit the budget */
export declare const MAX_RATE_LIMIT_RETRIES = 2;
/** The pause after a 429 without a usable `x-ratelimit-reset` or `retry-after` */
export declare const DEFAULT_RATE_LIMIT_PAUSE_MS = 300000;
/** The shortest pause after a 429, for a reset that is due or past */
export declare const MIN_RATE_LIMIT_PAUSE_MS = 1000;
/** The longest pause after a 429, whatever its headers say */
export declare const MAX_RATE_LIMIT_PAUSE_MS: number;
/** Time and waiting, injectable so tests need not wait in real time */
export interface Clock {
    /** Milliseconds since the epoch */
    now: () => number;
    /** Resolves after `ms` milliseconds */
    sleep: (ms: number) => Promise<void>;
}
export declare const systemClock: Clock;
/** A request refused, or given up on, because of the rate limit */
export declare class RateLimitError extends Error {
    /** When a request could next start, in milliseconds since the epoch */
    readonly availableAt: number;
    constructor(message: string, 
    /** When a request could next start, in milliseconds since the epoch */
    availableAt: number);
}
/**
 * The text of a rateLimitError(), wherever a handler quotes it: "Rate limit
 * exceeded: the Firewalla API allows 100 requests ..." or "Rate limit
 * exceeded (HTTP 429): ...". A tool's error response is given the kind
 * rate_limit_error when its message holds it (see createErrorResponse).
 */
export declare const RATE_LIMIT_TEXT: RegExp;
/**
 * A RateLimitError saying how many requests the window allows and when
 * capacity returns, in seconds from `now` and as a UTC time, then `detail`
 */
export declare function rateLimitError(options: {
    limit: number;
    windowMs: number;
    now: number;
    availableAt: number;
    detail: string;
    /** The HTTP status the API answered, when it answered */
    status?: number;
}): RateLimitError;
/**
 * A slot of the window, taken by one request. Each is its own object, so a
 * request gives back the slot it took (release), even when another request
 * took one in the same millisecond.
 */
export interface RateLimitSlot {
    /** When the request started, in milliseconds since the epoch */
    readonly at: number;
}
/**
 * Lets at most `limit` requests start in any rolling window of `windowMs`.
 * A request over the limit waits for a slot, in the order requests asked
 * (FIFO), but only until its deadline. `pauseUntil` holds every request back,
 * for when the API itself has refused one.
 */
export declare class RequestRateLimiter {
    readonly limit: number;
    private readonly clock;
    readonly windowMs: number;
    /** The slot of each request in the current window, oldest first */
    private readonly started;
    /** No request starts before this time */
    private pausedUntil;
    /** Requests waiting for a slot */
    private waiting;
    /** Settles once the last waiting request has its slot, or has given up */
    private queue;
    /**
     * Resolves when a slot is given back (release), so a request waiting for
     * a slot looks again at once instead of sleeping on a wait worked out
     * with that slot taken
     */
    private released;
    private wakeWaiting;
    constructor(limit: number, clock?: Clock, windowMs?: number);
    /** A promise that the next release() resolves */
    private nextRelease;
    /**
     * Takes a slot if one is free now and no request is waiting for one.
     * Returns false, and takes nothing, otherwise.
     */
    tryAcquire(): boolean;
    /**
     * As tryAcquire, returning the slot taken (for release), or undefined
     * when none was taken
     */
    tryAcquireSlot(): RateLimitSlot | undefined;
    /**
     * Gives back `slot`, taken by a request that was then not sent, so it
     * does not count against the window
     */
    release(slot: RateLimitSlot): void;
    /** Takes a new slot starting at `now` */
    private take;
    /**
     * When a request asked for now would start: after the requests already
     * waiting, the slots they take, and any pause
     */
    nextStartAt(): number;
    /**
     * Resolves, with the slot taken (for release), once the caller has a
     * slot, after every request queued before it. Rejects with a
     * RateLimitError if the slot would come after `deadline`, for example
     * because a 429 paused the client meanwhile. When `signal` is aborted
     * (its tool gave up), rejects at once, even mid-wait, and takes no slot:
     * a request that is never sent must not hold one for the window, and
     * must not hold up the requests queued after it.
     */
    acquire(deadline: number, signal?: AbortSignal): Promise<RateLimitSlot>;
    /**
     * Waits `ms` on the clock, or until `signal` is aborted or a slot is
     * given back, whichever comes first
     */
    private sleepUnlessAborted;
    /** Starts no request before `at` (milliseconds since the epoch) */
    pauseUntil(at: number): void;
    /** The error for a request not sent because it would start only at `at` */
    unavailable(at: number): RateLimitError;
    /** Forgets requests that started a whole window ago */
    private expire;
    /** When the next slot frees, for the request at the head of the queue */
    private slotAt;
}
/**
 * How long to pause after a 429, in milliseconds: until `x-ratelimit-reset`
 * when it is epoch seconds within MAX_RATE_LIMIT_PAUSE_MS from now, else for
 * `retry-after`, else DEFAULT_RATE_LIMIT_PAUSE_MS. Rounded up to whole
 * seconds and kept between MIN_RATE_LIMIT_PAUSE_MS and
 * MAX_RATE_LIMIT_PAUSE_MS.
 */
export declare function rateLimitPauseMs(headers: unknown, nowMs: number): number;
/**
 * The wait until an `x-ratelimit-reset` time, in milliseconds. Undefined
 * unless the header is epoch seconds after now and within
 * MAX_RATE_LIMIT_PAUSE_MS of it; a local clock far off the API's gives
 * undefined, and `retry-after` is used instead.
 */
export declare function parseRateLimitReset(value: unknown, nowMs: number): number | undefined;
/**
 * The wait a `retry-after` header asks for, in milliseconds: either
 * delay-seconds or an HTTP-date (RFC 9110 section 10.2.3). A date already
 * past gives 0. Undefined when the header is absent or unparseable.
 */
export declare function parseRetryAfter(value: unknown, nowMs: number): number | undefined;
/** A response header by name, whatever its case */
export declare function headerValue(headers: unknown, name: string): unknown;
//# sourceMappingURL=rate-limit.d.ts.map