/**
 * @fileoverview Firewalla API Client for MSP Integration
 *
 * Provides comprehensive access to Firewalla MSP APIs with enterprise-grade features:
 * - **Authentication**: Token-based MSP API authentication with error handling
 * - **Caching**: Intelligent response caching with configurable TTL
 * - **Rate Limiting**: Paces requests to `API_RATE_LIMIT` per 5 minutes and
 *   fails fast, or retries a GET, when the API refuses one with HTTP 429
 * - **Error Handling**: Comprehensive error mapping and recovery strategies
 * - **Monitoring**: Request/response logging and performance tracking
 *
 * The client supports all major Firewalla data types including alarms, flows,
 * devices, rules, bandwidth analytics, and advanced search capabilities with
 * cross-reference correlation and trend analysis.
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { createHash } from 'crypto';
import { URLSearchParams } from 'url';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import type {
  FirewallaConfig,
  Alarm,
  AlarmGroup,
  Flow,
  FlowGroup,
  Device,
  BandwidthUsage,
  NetworkRule,
  TargetList,
  Box,
  BoxSummary,
  FirewallSummary,
  SearchResult,
  SearchQuery,
  SearchOptions,
  CrossReferenceResult,
  Trend,
  TrendPeriod,
  TrendSeries,
  BoxStatisticType,
  SecurityMetricsSummary,
  SimpleStats,
  Statistics,
  GeographicData,
} from '../types.js';
import { parseSearchQuery, formatQueryForAPI } from '../search/index.js';
import { matchesQuery, unquoteQueryValue } from '../search/client-filter.js';
import {
  translateSortBy,
  translateToMspQualifiers,
} from '../utils/msp-qualifiers.js';
import {
  mspAnd,
  mspBoxScope,
  mspValue,
  toMspQuery,
} from '../utils/msp-query.js';
import { createPaginatedResponse } from '../utils/pagination.js';
import { logger } from '../monitoring/logger.js';
import {
  GeographicCache,
  type GeographicCacheStats,
  getGeographicDataForIP,
  normalizeIP,
} from '../utils/geographic.js';
import { safeAccess, safeValue } from '../utils/data-normalizer.js';
import { validateAlarmId } from '../utils/alarm-id-validation.js';
import { normalizeTimestamps } from '../utils/data-validator.js';
import {
  checkMuteRequest,
  type AlarmMuteRequest,
} from '../validation/alarm-mute.js';
import {
  DEFAULT_RATE_LIMIT,
  MAX_RATE_LIMIT_RETRIES,
  RATE_LIMIT_MAX_WAIT_MS,
  RateLimitError,
  RequestRateLimiter,
  rateLimitError,
  rateLimitPauseMs,
  systemClock,
  type Clock,
} from './rate-limit.js';

/**
 * Standard API response wrapper for Firewalla MSP endpoints
 *
 * @template T - The type of data contained in the response
 */
interface APIResponse<T> {
  /** @description Indicates if the API request was successful */
  success: boolean;
  /** @description The response data payload */
  data: T;
  /** @description Optional success message from the API */
  message?: string;
  /** @description Optional error message if the request failed */
  error?: string;
}

/**
 * A flow's content category. The MSP API sends it as a string ("games",
 * "social", or "" when uncategorized); older data models describe an object
 * with a name, so both are read.
 */
function flowCategory(item: any): string {
  const category =
    typeof item?.category === 'string' ? item.category : item?.category?.name;
  return category || 'uncategorized';
}

/**
 * The fields of a grouped /v2/alarms or /v2/flows item that identify its
 * group: every field but its totals. An empty object is left out: grouped
 * flows carry `device: {}` unless they are grouped by device.
 */
function groupKey(
  item: Record<string, unknown>,
  totals: readonly string[]
): Record<string, unknown> {
  const key: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(item)) {
    const isEmptyObject =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0;
    if (!totals.includes(field) && !isEmptyObject) {
      key[field] = value;
    }
  }
  return key;
}

/**
 * The sortBy of a grouped request. Groups have no `ts`, and the API answers a
 * grouped request sorted by `ts` with no groups: measured 2026-09-25,
 * `groupBy=category` on /v2/flows with `sortBy=ts:desc` or `ts:asc`, and
 * `groupBy=type` on /v2/alarms with `sortBy=ts:desc`, returned count 0, and
 * the same requests with `total:desc` or `count:desc` returned groups. Sort
 * terms on `ts` are dropped, and with none left the largest groups come
 * first (`largest`).
 */
function groupedSortBy(sortBy: string, largest: string): string {
  const terms = String(sortBy ?? '')
    .split(',')
    .map(term => term.trim())
    .filter(term => term && term.split(':')[0] !== 'ts');
  return terms.length > 0 ? terms.join(',') : largest;
}

/** Flow groups from the items of a grouped GET /v2/flows */
function toFlowGroups(items: unknown[]): FlowGroup[] {
  return items
    .filter((item): item is Record<string, any> =>
      Boolean(item && typeof item === 'object')
    )
    .map(item => ({
      key: groupKey(item, ['count', 'download', 'upload', 'total']),
      count: Number(item.count) || 0,
      download: Number(item.download) || 0,
      upload: Number(item.upload) || 0,
      total: Number(item.total) || 0,
    }));
}

/**
 * A flow's byte counts. GET /v2/flows sends download, upload and total on
 * every flow; total is not in the official Flow Model (measured
 * 2026-09-25: on 200 of 200 flows, total equaled download + upload).
 * Without a total, it is download + upload; bytes is the same figure.
 */
function flowBytes(
  item: Record<string, any>
): Required<Pick<Flow, 'download' | 'upload' | 'total' | 'bytes'>> {
  const download = Number(item.download) || 0;
  const upload = Number(item.upload) || 0;
  const total = Number.isFinite(item.total)
    ? Number(item.total)
    : download + upload;
  return { download, upload, total, bytes: total };
}

/** Alarm groups from the items of a grouped GET /v2/alarms */
function toAlarmGroups(items: unknown[]): AlarmGroup[] {
  return items
    .filter((item): item is Record<string, any> =>
      Boolean(item && typeof item === 'object')
    )
    .map(item => ({
      key: groupKey(item, ['count']),
      count: Number(item.count) || 0,
    }));
}

/** Largest `limit` the MSP API accepts on its /v2 list endpoints */
const MAX_API_PAGE_SIZE = 500;

const DAY_SECONDS = 24 * 60 * 60;

/** Days in a /v2/trends series (measured 2026-09-25) */
const TREND_DAYS = 30;

/**
 * Per-day count requests a box-scoped trend has in flight at once. A 30-day
 * series is 31 requests, and the API allows 100 per 5-minute window.
 */
const BOX_TREND_CONCURRENCY = 4;

/**
 * `fn` over `items` with at most `limit` calls in flight, results in the
 * order of `items`. After a call fails no new call starts, and the first
 * failure is thrown once the calls in flight settle.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  );
  if (failed) {
    throw firstError;
  }
  return results;
}

/** Length of each period the trend tools accept */
const TREND_PERIOD_SECONDS: Record<TrendPeriod, number> = {
  '1h': 60 * 60,
  '24h': DAY_SECONDS,
  '7d': 7 * DAY_SECONDS,
  '30d': 30 * DAY_SECONDS,
};

function validTrendPeriod(period: unknown): TrendPeriod {
  return typeof period === 'string' && period in TREND_PERIOD_SECONDS
    ? (period as TrendPeriod)
    : '30d';
}

/**
 * Keep the days of an ascending daily series that overlap the last `period`,
 * so the days returned cover all of it: 24h returns yesterday and today. A
 * day runs to the next point's ts, and the last day to `now`.
 */
function selectTrendDays(
  points: Trend[],
  period: TrendPeriod,
  now: number,
  about: { source: string; scope: string; note?: string }
): TrendSeries {
  const since = now - TREND_PERIOD_SECONDS[period];
  const results = points.filter((_point, i) => {
    const end = i + 1 < points.length ? points[i + 1].ts : now;
    return end > since;
  });
  const last = results[results.length - 1];
  return {
    count: results.length,
    results,
    next_cursor: undefined,
    source: about.source,
    scope: about.scope,
    interval: 'day',
    window_start: results[0]?.ts,
    window_end: now,
    last_point_partial: last !== undefined && last.ts + DAY_SECONDS > now,
    ...(about.note && { note: about.note }),
  };
}

/**
 * Query parameters the official docs define for a /v2 GET endpoint; a GET to
 * one of these paths sends no others. Measured 2026-09-25: /v2/devices and
 * /v2/target-lists answer `query`, `limit` and `sortBy` with 200 and ignore
 * them, and `box` (devices) and `owner` (target lists) do filter.
 */
const DOCUMENTED_GET_PARAMS = new Map<string, readonly string[]>([
  ['/v2/alarms', ['query', 'groupBy', 'sortBy', 'limit', 'cursor']],
  ['/v2/flows', ['query', 'groupBy', 'sortBy', 'limit', 'cursor']],
  ['/v2/devices', ['box', 'group']],
  ['/v2/boxes', ['group']],
  ['/v2/target-lists', ['owner']],
]);

/**
 * The endpoints whose `query` parameter the MSP API searches with its own
 * grammar, which has no AND, OR, NOT or parentheses (see
 * src/utils/msp-query.ts). Every GET to one of them sends its query through
 * toMspQuery.
 */
const MSP_QUERY_ENDPOINTS: ReadonlySet<string> = new Set([
  '/v2/alarms',
  '/v2/flows',
  '/v2/rules',
]);

/**
 * GET parameters with the query in the MSP API's grammar, for a search
 * endpoint; other requests are returned unchanged
 *
 * @throws {MspQueryError} When the query has no form the API can run
 */
function withMspQuery(
  method: string,
  endpoint: string,
  params: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (
    method !== 'GET' ||
    !MSP_QUERY_ENDPOINTS.has(endpoint) ||
    typeof params?.query !== 'string'
  ) {
    return params;
  }
  const { query, ...rest } = params;
  const translated = toMspQuery(query);
  return translated ? { ...rest, query: translated } : rest;
}

/**
 * A box gid as the MSP API issues them (a UUID). Anything else is refused
 * before it is put in a query, where a value such as `X OR box.id:Y` would
 * widen the scope instead of narrowing it.
 */
const BOX_GID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether `gid` has the shape of a box gid */
export function isValidBoxGid(gid: string): boolean {
  return BOX_GID_PATTERN.test(gid);
}

/** Why a box or FIREWALLA_BOX_ID that is not a box gid is refused */
const INVALID_BOX_GID = `Invalid box gid: expected letters, digits, '-' or '_' only (get_boxes lists the gids)`;

/**
 * A single-box operation could not pick a box: the account has several and
 * none was named, or the token sees none. Handlers report it as a validation
 * error rather than an API failure.
 */
export class BoxSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoxSelectionError';
  }
}

/**
 * The alarm an alarm write names is not on the box it was looked for on, or
 * on any box when each box was checked.
 */
export class AlarmNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlarmNotFoundError';
  }
}

/** The alarm archiveAlarm or muteAlarm acted on, and the API's answer */
export interface AlarmActionResult {
  gid: string;
  aid: string;
  /** The alarm as GET /v2/alarms/{gid}/{aid} returned it before the action */
  alarm: Record<string, any>;
  /** The API's answer to the POST; the official docs show no response body */
  response: unknown;
}

/**
 * request() reports an HTTP 404 as "Resource not found: ..."; the MSP API's
 * 404 body is an empty CloudFront error page, so the status is all there is.
 */
function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /\b404\b|not found/i.test(error.message);
}

/** "type 8, 'A device watched ...'" for naming an alarm in a message */
function describeAlarm(alarm: Record<string, any>): string {
  const message = String(alarm.message ?? '').slice(0, 80);
  return `type ${alarm.type ?? 'unknown'}, '${message}'`;
}

/**
 * The MSP API answered HTTP 403. The message says which box the request
 * named, when it named one, and how to list the boxes the token can access.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * An axios request config carrying the request's rate-limit state from one
 * attempt to the next
 */
interface RateLimitedConfig extends InternalAxiosRequestConfig {
  /**
   * When the request stops waiting for the rate limit: RATE_LIMIT_MAX_WAIT_MS
   * after it was first made
   */
  rateLimitDeadline?: number;
  /** 429 retries sent so far */
  rateLimitRetries?: number;
}

/**
 * Whether a request names a box: a `box` parameter, a `box` or `gid` in
 * its body, or a gid in an /v2/alarms/{gid}/... or /v2/boxes/{gid}/... path
 */
function namesBox(config?: {
  url?: string;
  params?: unknown;
  data?: unknown;
}): boolean {
  const named = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '';
  let body = config?.data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // A body that is not JSON names no box
      body = undefined;
    }
  }
  const fields = body as Record<string, unknown> | undefined;
  return (
    named((config?.params as Record<string, unknown> | undefined)?.box) ||
    named(fields?.box) ||
    named(fields?.gid) ||
    /^\/v2\/(?:alarms|boxes)\/[^/?]+/.test(config?.url ?? '')
  );
}

/**
 * The message for an HTTP 403 from the MSP API. Measured 2026-09-25: a box
 * gid the token cannot access, whether wrong, malformed or another
 * account's, gets 403 {"error":{"title":"Forbidden","message":"You are not
 * allowed to access this resource","type":"FORBIDDEN"}} from
 * GET /v2/devices?box=<gid> and GET /v2/alarms/<gid>/<aid>, while a known
 * box with an unknown alarm id gets 404. The message used to blame the MSP
 * subscription. It does not quote the gid: handlers match "404" and
 * "not found" in error messages, and a gid can contain either.
 */
export function forbiddenMessage(error: {
  config?: { url?: string; params?: unknown; data?: unknown };
  response?: { data?: unknown };
}): string {
  const apiMessage = (
    error.response?.data as { error?: { message?: unknown } } | undefined
  )?.error?.message;
  const detail =
    typeof apiMessage === 'string' && apiMessage.trim()
      ? `: ${apiMessage.trim()}`
      : '';
  const cause = namesBox(error.config)
    ? 'The MSP API answers 403 when a request names a box this token cannot access, and this request names one: check that its gid is right and belongs to this account.'
    : "This MSP token cannot access the requested resource. The MSP API answers 403 when a request names a box the token cannot access (a wrong gid, or another account's).";
  return `Forbidden (HTTP 403)${detail}. ${cause} get_boxes lists the box gids this token can access; if get_boxes is refused as well, the token itself lacks access.`;
}

/**
 * Firewalla API Client for MSP Integration
 *
 * Main client class providing authenticated access to Firewalla MSP APIs.
 * Handles authentication, caching, rate limiting and error handling for the
 * MCP server's tools.
 *
 * Features:
 * - Automatic token-based authentication with the MSP API
 * - Intelligent caching with configurable TTL policies
 * - Paces requests to `rateLimit` per 5 minutes; after a 429, pauses and
 *   retries a GET when the wait is short
 * - Comprehensive error handling with meaningful error messages
 * - Request/response logging for debugging and monitoring
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * const client = new FirewallaClient(config);
 *
 * // Get recent alarms
 * const alarms = await client.getActiveAlarms({ limit: 50 });
 *
 * // Search for high-severity flows
 * const flows = await client.searchFlows({
 *   query: 'severity:high AND bytes:>1000000',
 *   limit: 100
 * });
 * ```
 *
 * @class
 * @public
 */
export class FirewallaClient {
  /** @private Axios instance configured for Firewalla MSP API access */
  private api: AxiosInstance;

  /** @private In-memory cache for API responses with TTL management */
  private cache: Map<string, { data: unknown; expires: number }>;

  /** @private Geographic cache for IP geolocation lookups */
  private geoCache: GeographicCache;

  /** @private Paces every request through `api` to `config.rateLimit` per 5 minutes */
  private readonly rateLimiter: RequestRateLimiter;

  /**
   * Creates a new Firewalla API client instance
   *
   * @param config - Configuration object containing MSP credentials and settings
   * @param clock - Time and waiting for rate limiting; tests pass their own
   * @throws {Error} If configuration is invalid or authentication fails
   */
  constructor(
    private config: FirewallaConfig,
    private readonly clock: Clock = systemClock
  ) {
    const { rateLimit } = config;
    this.rateLimiter = new RequestRateLimiter(
      Number.isFinite(rateLimit) && rateLimit >= 1
        ? Math.floor(rateLimit)
        : DEFAULT_RATE_LIMIT,
      clock
    );
    this.cache = new Map();
    this.geoCache = new GeographicCache({
      maxSize: 10000,
      ttlMs: 3600000, // 1 hour cache for geographic data
      enableStats:
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test',
    });

    // Use mspBaseUrl if provided, otherwise construct from mspId
    const baseURL = config.mspBaseUrl || `https://${config.mspId}`;

    this.api = axios.create({
      baseURL,
      timeout: config.apiTimeout,
      headers: {
        Authorization: `Token ${config.mspToken}`,
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Sets up Axios request and response interceptors for logging and error handling
   *
   * Configures interceptors to:
   * - Hold each request until the rate limiter has a slot for it, or refuse
   *   it when the slot is more than RATE_LIMIT_MAX_WAIT_MS away
   * - Log all API requests and responses for debugging
   * - Pause on a 429 and retry a GET (see retryRateLimited)
   * - Transform HTTP error codes into meaningful error messages
   * - Handle authentication and authorization failures
   * - Provide specific guidance for common error scenarios
   *
   * @private
   * @returns {void}
   */
  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      (
        config
      ): InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig> => {
        const request = config as RateLimitedConfig;
        const deadline = (request.rateLimitDeadline ??=
          this.clock.now() + RATE_LIMIT_MAX_WAIT_MS);
        const name = `${config.method?.toUpperCase()} ${config.url}`;
        const send = () => {
          process.stderr.write(`API Request: ${name}\n`);
          return config;
        };
        const refuse = (error: RateLimitError) => {
          process.stderr.write(
            `API Request refused for the rate limit: ${name}; capacity returns in ${Math.max(0, Math.ceil((error.availableAt - this.clock.now()) / 1000))} s\n`
          );
          return error;
        };
        // A free slot is taken at once, so an unthrottled request goes out
        // without waiting a tick
        if (this.rateLimiter.tryAcquire()) {
          return send();
        }
        const startAt = this.rateLimiter.nextStartAt();
        if (startAt > deadline) {
          throw refuse(this.rateLimiter.unavailable(startAt));
        }
        // A retry's wait was logged when its 429 came back
        if (request.rateLimitRetries === undefined) {
          process.stderr.write(
            `API Request queued for the rate limit: ${name}\n`
          );
        }
        return this.rateLimiter.acquire(deadline).then(send, error => {
          throw error instanceof RateLimitError ? refuse(error) : error;
        });
      },
      async error => {
        process.stderr.write(`API Request Error: ${error.message}\n`);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      response => {
        process.stderr.write(
          `API Response: ${response.status} ${response.config.url}\n`
        );
        return response;
      },
      async error => {
        // Refused before it was sent; the request interceptor logged it
        if (error instanceof RateLimitError) {
          throw error;
        }
        process.stderr.write(
          `API Response Error: ${error.response?.status} ${error.message}\n`
        );

        if (error.response?.status === 401) {
          throw new Error(
            'Authentication failed. Please check your MSP token.'
          );
        }
        if (error.response?.status === 403) {
          throw new ForbiddenError(forbiddenMessage(error));
        }
        if (error.response?.status === 404) {
          throw new Error('Resource not found. Please check your Box ID.');
        }
        if (error.response?.status === 429) {
          return this.retryRateLimited(error);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Answers a 429. The API's quota is per token, so every request of this
   * client is paused until the API's window ends (see rateLimitPauseMs). A
   * GET is then sent again through the rate limiter, at most
   * MAX_RATE_LIMIT_RETRIES times, and only when the pause ends before the
   * request's deadline (RATE_LIMIT_MAX_WAIT_MS after it was first made). A
   * write is never sent again. Otherwise the 429 is thrown as a
   * RateLimitError saying when capacity returns.
   *
   * @private
   */
  private async retryRateLimited(error: AxiosError): Promise<AxiosResponse> {
    const config = error.config as RateLimitedConfig | undefined;
    const method = config?.method?.toUpperCase() ?? 'request';
    const now = this.clock.now();
    const resumeAt = now + rateLimitPauseMs(error.response?.headers, now);
    this.rateLimiter.pauseUntil(resumeAt);

    const retries = config?.rateLimitRetries ?? 0;
    const giveUp = (detail: string) =>
      rateLimitError({
        limit: this.rateLimiter.limit,
        windowMs: this.rateLimiter.windowMs,
        now,
        availableAt: resumeAt,
        detail,
        status: 429,
      });
    if (!config || method !== 'GET') {
      throw giveUp(`A ${method} is not retried.`);
    }
    if (retries >= MAX_RATE_LIMIT_RETRIES) {
      throw giveUp(`Gave up after ${retries} retries.`);
    }
    const deadline = config.rateLimitDeadline ?? now + RATE_LIMIT_MAX_WAIT_MS;
    if (resumeAt > deadline) {
      const notRetried =
        retries === 0
          ? 'Not retried'
          : `Not retried again after ${retries} ${retries === 1 ? 'retry' : 'retries'}`;
      throw giveUp(
        `${notRetried}, as a request waits at most ${RATE_LIMIT_MAX_WAIT_MS / 1000} s for the rate limit.`
      );
    }

    process.stderr.write(
      `API Rate Limited: 429 ${method} ${config.url}; retrying in ${Math.ceil((resumeAt - now) / 1000)} s (retry ${retries + 1} of ${MAX_RATE_LIMIT_RETRIES})\n`
    );
    const retry: RateLimitedConfig = {
      ...config,
      rateLimitRetries: retries + 1,
    };
    return this.api.request(retry);
  }

  /**
   * Generates a unique cache key for API requests with enhanced collision prevention
   *
   * Creates a cache key that includes the box ID, endpoint, method, and sorted parameters
   * to ensure uniqueness across different boxes and API calls.
   *
   * @param endpoint - API endpoint path
   * @param params - Optional request parameters
   * @param method - HTTP method (default: 'GET')
   * @returns Unique cache key string with collision prevention
   * @private
   */
  private getCacheKey(
    endpoint: string,
    params?: Record<string, unknown>,
    method: string = 'GET'
  ): string {
    // Sort parameters to ensure consistent key generation regardless of parameter order
    const sortedParams = params
      ? Object.keys(params)
          .sort()
          .reduce(
            (acc, key) => {
              acc[key] = params[key];
              return acc;
            },
            {} as Record<string, unknown>
          )
      : {};

    // Create hash-like key with multiple components for uniqueness
    const paramStr =
      Object.keys(sortedParams).length > 0
        ? JSON.stringify(sortedParams)
        : 'no-params';

    // Include box ID, method, endpoint, and parameters with separators
    // Use SHA256 hash to ensure unique cache keys without truncation issues
    const paramHash = createHash('sha256')
      .update(paramStr)
      .digest('hex')
      .substring(0, 32);

    // Use 'all-boxes' when no box ID is configured to avoid cache key collisions
    const boxKey = this.config.boxId || 'all-boxes';
    return `fw:${boxKey}:${method}:${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}:${paramHash}`;
  }

  /**
   * Retrieves data from cache if available and not expired
   *
   * @template T - The expected return type
   * @param key - Cache key to look up
   * @returns Cached data if available and valid, otherwise null
   * @private
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds || this.config.cacheTtl;
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl * 1000,
    });
  }

  /**
   * Drops every cached `GET /v2/rules` answer. Called after a rule changes
   * state, so the next read (and resume_rule's status check after a pause)
   * sees the new status instead of the cached one.
   */
  private invalidateRuleCache(): void {
    const marker = `:GET:${'/v2/rules'.replace(/[^a-zA-Z0-9]/g, '_')}:`;
    for (const key of [...this.cache.keys()]) {
      if (key.includes(marker)) {
        this.cache.delete(key);
      }
    }
  }

  private sanitizeInput(input: string | undefined): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    // Enhanced sanitization that preserves search query functionality
    // Remove only the most dangerous characters while preserving search syntax
    return input
      .replace(/[<>"']/g, '') // Remove HTML/injection characters
      .replace(/\0/g, '') // Remove null bytes
      .trim();
  }

  /**
   * Filter parameters for GET requests to /v2/* endpoints to only include allowed scalar fields
   * Fixes issue where complex objects get serialized as [object Object] causing "Bad Request" errors
   */
  private filterParametersForDataEndpoints(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    // Only filter GET requests to raw /v2/* data endpoints
    if (method !== 'GET' || !endpoint.startsWith('/v2/') || !params) {
      return params;
    }

    // Skip filtering for /v2/*/search endpoints that accept JSON bodies
    if (endpoint.includes('/search')) {
      return params;
    }

    // The parameters the official docs give for this endpoint, else the
    // scalar parameters every other /v2 GET has always been allowed. `group`
    // (a box group ID) is documented on /v2/boxes, /v2/stats and /v2/trends.
    const allowedParams = DOCUMENTED_GET_PARAMS.get(endpoint) ?? [
      'query',
      'limit',
      'sortBy',
      'groupBy',
      'cursor',
      'box',
      'group',
    ];

    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (allowedParams.includes(key) && value !== undefined) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * GET up to `limit` results from a /v2 list endpoint, at most
   * MAX_API_PAGE_SIZE per request, following next_cursor. The MSP API answers
   * 400 "limit exceeds max allowed value of 500" to a larger limit on
   * /v2/alarms and /v2/flows.
   */
  private async requestPages<T>(
    endpoint: string,
    params: Record<string, unknown>,
    limit: number,
    cacheable = true
  ): Promise<{
    count: number;
    results: T[];
    next_cursor?: string;
    [key: string]: any;
  }> {
    // The API's own default when no usable limit is given
    const wanted = Number.isFinite(limit) && limit >= 1 ? limit : 200;
    const results: T[] = [];
    let cursor = params.cursor as string | undefined;
    let first: Record<string, unknown> | undefined;
    do {
      const pageParams: Record<string, unknown> = {
        ...params,
        limit: Math.min(MAX_API_PAGE_SIZE, wanted - results.length),
      };
      if (cursor) {
        pageParams.cursor = cursor;
      }
      const page = await this.request<{
        results?: T[];
        next_cursor?: string;
      }>('GET', endpoint, pageParams, undefined, cacheable);
      if (!first && page && !Array.isArray(page)) {
        first = page;
      }
      const pageResults = Array.isArray(page) ? page : page?.results || [];
      results.push(...pageResults);
      cursor = Array.isArray(page) ? undefined : page?.next_cursor;
      if (pageResults.length === 0) {
        break;
      }
    } while (cursor && results.length < wanted);

    return { ...first, count: results.length, results, next_cursor: cursor };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    params?: Record<string, unknown>,
    body?: Record<string, unknown> | boolean,
    cacheable = true
  ): Promise<T> {
    // Filter parameters for raw /v2/* data endpoints to prevent "Bad Request"
    // errors, and send a search query in the API's grammar (AND, OR, NOT and
    // parentheses are words to the API)
    const filteredParams = withMspQuery(
      method,
      endpoint,
      this.filterParametersForDataEndpoints(method, endpoint, params)
    );
    const cacheKey = this.getCacheKey(endpoint, filteredParams, method);

    if (cacheable && method === 'GET') {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      let response: AxiosResponse<APIResponse<T>>;

      switch (method) {
        case 'GET':
          response = await this.api.get(endpoint, { params: filteredParams });
          break;
        case 'POST':
          response = await this.api.post(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'PUT':
          response = await this.api.put(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'PATCH':
          response = await this.api.patch(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'DELETE':
          response = await this.api.delete(endpoint, {
            params: filteredParams,
          });
          break;
      }

      // Log successful API requests
      logger.debug('API Request completed', {
        method,
        endpoint,
        status: response.status,
      });

      // Check if we're getting HTML instead of JSON
      if (
        typeof response.data === 'string' &&
        (response.data as string).includes('<!DOCTYPE html>')
      ) {
        throw new Error(
          `Received HTML login page instead of JSON API response. This indicates authentication or API access issues. URL: ${response.config.url}`
        );
      }

      // Handle different response formats from Firewalla API
      let result: T;
      if (
        response.data &&
        typeof response.data === 'object' &&
        'success' in response.data
      ) {
        // Standard API response format
        if (!response.data.success) {
          throw new Error(response.data.error || 'API request failed');
        }
        // For DELETE operations, the response might not have a 'data' field
        // In this case, return the entire response object as the result
        result =
          response.data.data !== undefined
            ? response.data.data
            : (response.data as T);
      } else {
        // Direct data response (more common with Firewalla API)
        result = response.data;
      }

      if (cacheable && method === 'GET') {
        // Use shorter TTL for dynamic data (alarms, flows)
        const ttlSeconds =
          endpoint.includes('/alarms') || endpoint.includes('/flows')
            ? 15
            : undefined;
        this.setCache(cacheKey, result, ttlSeconds);
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const url = error.config?.url;

        let errorMessage = `API Error (${status || 'unknown'}): ${error.message}`;

        if (status) {
          switch (status) {
            case 400:
              logger.debug('API 400 Error Details:', {
                url,
                params: filteredParams,
                response: error.response?.data,
              });
              errorMessage = `Bad Request: Invalid parameters sent to ${url}`;
              break;
            case 401:
              errorMessage =
                'Authentication failed: Invalid or expired MSP token';
              break;
            case 403:
              throw new ForbiddenError(forbiddenMessage(error));
            case 404:
              errorMessage = `Resource not found: ${url} does not exist`;
              break;
            case 429:
              errorMessage =
                'Rate limit exceeded: Too many requests, please wait before retrying';
              break;
            case 500:
              errorMessage =
                'Server error: Firewalla API is experiencing issues';
              break;
            case 502:
              errorMessage =
                'Bad Gateway: Unable to connect to Firewalla API server or invalid resource ID';
              break;
            case 503:
              errorMessage =
                'Service unavailable: Firewalla API is temporarily down';
              break;
            default:
              errorMessage = `HTTP ${status} ${statusText}: ${error.message}`;
          }
        }

        throw new Error(errorMessage);
      }

      // A 403 from the response interceptor carries its own explanation, and
      // a rate-limit refusal says when capacity returns
      if (error instanceof ForbiddenError || error instanceof RateLimitError) {
        throw error;
      }

      // Handle other types of errors
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }

      throw new Error('Unknown error occurred during API request');
    } finally {
      // A write can change what any cached read returns, and one that
      // failed may still have been applied, so drop cached reads either way
      if (method !== 'GET') {
        this.clearCache();
      }
    }
  }

  /**
   * Retrieves active security alarms from the Firewalla system
   *
   * Fetches current security alerts, alarms, and notifications with support for
   * advanced filtering, grouping, and pagination.
   *
   * @param query - Optional search query for filtering alarms
   * @param groupBy - Optional fields to group by (e.g., 'type', 'type,box').
   *   The API then returns groups, not alarms: the result has `groups` and
   *   `group_by`, and empty `results`.
   * @param sortBy - Sort order specification (default: 'ts:desc'; `timestamp`
   *   is sent as `ts`)
   * @param limit - Maximum number of results to return (required for pagination)
   * @param cursor - Pagination cursor from previous response
   * @returns Promise resolving to paginated alarm results with metadata
   *
   * @example
   * ```typescript
   * // Get recent high-severity alarms
   * const highSeverityAlarms = await client.getActiveAlarms(
   *   'severity:high',
   *   undefined,
   *   'ts:desc',
   *   50
   * );
   *
   * // Get alarms grouped by type
   * const groupedAlarms = await client.getActiveAlarms(
   *   undefined,
   *   'type',
   *   'ts:desc',
   *   100
   * );
   * ```
   *
   * @public
   */
  async getActiveAlarms(
    query?: string,
    groupBy?: string,
    sortBy = 'ts:desc',
    limit = 200,
    cursor?: string,
    force_refresh = false
  ): Promise<{
    count: number;
    results: Alarm[];
    next_cursor?: string;
    groups?: AlarmGroup[];
    group_by?: string;
  }> {
    const params: Record<string, unknown> = {
      sortBy: translateSortBy(sortBy, 'alarms'),
      limit, // Remove artificial limit - let pagination handle large datasets
    };

    if (query) {
      // source_ip: is rejected by /v2/alarms; send it as device.ip:
      params.query = translateToMspQualifiers(query, 'alarms');
    }
    const group = typeof groupBy === 'string' ? groupBy.trim() : undefined;
    if (group) {
      params.groupBy = group;
      // A ts sort returns no groups; see groupedSortBy
      params.sortBy = groupedSortBy(params.sortBy as string, 'count:desc');
    }
    if (cursor) {
      params.cursor = cursor;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.requestPages<any>(
      '/v2/alarms',
      params,
      Number(limit),
      !force_refresh
    );

    // Basic response validation
    if (!response || typeof response !== 'object') {
      logger.warn('Invalid alarm response structure');
      return {
        count: 0,
        results: [],
        next_cursor: undefined,
      };
    }

    // Extract alarm data with safe defaults
    const rawAlarms = Array.isArray(response.results) ? response.results : [];

    // A grouped response has one { <group fields>, count } item per group
    // and no ts, aid or message (measured 2026-09-25); mapped as alarms,
    // they became "Unknown alarm" records stamped with the current time
    if (group) {
      const groups = toAlarmGroups(rawAlarms);
      return {
        count: groups.length,
        results: [],
        groups,
        group_by: group,
        next_cursor: response.next_cursor,
      };
    }

    // Apply basic safety to the raw alarm data
    const normalizedAlarms = rawAlarms.map((alarm: any) => ({
      ...alarm,
      message: safeValue(alarm.message, 'Unknown alarm'),
      direction: safeValue(alarm.direction, 'inbound'),
      protocol: safeValue(alarm.protocol, 'tcp'),
      device: alarm.device ? safeAccess(alarm.device) : undefined,
      remote: alarm.remote ? safeAccess(alarm.remote) : undefined,
    }));

    // Map normalized data to Alarm objects
    const alarms = normalizedAlarms.map((item: any): Alarm => ({
      ts: item.ts || Math.floor(Date.now() / 1000),
      gid: item.gid || this.config.boxId,
      aid: item.aid !== undefined && item.aid !== null ? item.aid : 0,
      type: item.type || 1,
      status: item.status || 1,
      message: item.message,
      direction: item.direction,
      protocol: item.protocol,
      // Conditional properties based on alarm type
      ...(item.device && { device: item.device }),
      ...(item.remote && { remote: item.remote }),
      ...(item.transfer && { transfer: item.transfer }),
      ...(item.dataPlan && { dataPlan: item.dataPlan }),
      ...(item.vpn && { vpn: item.vpn }),
      ...(item.port && { port: item.port }),
      ...(item.wan && { wan: item.wan }),
    }));

    // Normalize timestamps in the alarm objects
    const timestampNormalizedAlarms = alarms.map(alarm => {
      const result = normalizeTimestamps(alarm);
      if (result.warnings.length > 0) {
        logger.warn(
          `Timestamp normalization warnings for alarm ${alarm.aid}:`,
          { warnings: result.warnings }
        );
      }
      return result.data;
    });

    return {
      count: response.count || timestampNormalizedAlarms.length,
      results: timestampNormalizedAlarms.map(alarm =>
        this.enrichWithGeographicData(alarm, ['remote.ip'])
      ),
      next_cursor: response.next_cursor,
    };
  }

  /**
   * Get flows from GET /v2/flows
   *
   * @param groupBy - Optional fields to group by (e.g., 'category',
   *   'device', 'category,domain'). The API then returns groups, not flows:
   *   the result has `groups` and `group_by`, and empty `results`.
   */
  async getFlowData(
    query?: string,
    groupBy?: string,
    sortBy = 'ts:desc',
    limit = 200,
    cursor?: string
  ): Promise<{
    count: number;
    results: Flow[];
    next_cursor?: string;
    groups?: FlowGroup[];
    group_by?: string;
  }> {
    const params: Record<string, unknown> = {
      // timestamp: and bytes: are rejected by /v2/flows; sent as ts: and total:
      sortBy: translateSortBy(sortBy, 'flows'),
      limit, // Remove artificial limit - let pagination handle large datasets
    };

    // Simplified: only add query if provided. blocked: and bytes: are
    // rejected by /v2/flows; send them as status:blocked and total:
    if (query?.trim()) {
      params.query = translateToMspQualifiers(query.trim(), 'flows');
    }
    const group = typeof groupBy === 'string' ? groupBy.trim() : undefined;
    if (group) {
      params.groupBy = group;
      // A ts sort returns no groups; see groupedSortBy
      params.sortBy = groupedSortBy(params.sortBy as string, 'total:desc');
    }
    if (cursor) {
      params.cursor = cursor;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.requestPages<any>(
      '/v2/flows',
      params,
      Number(limit)
    );

    // A grouped response has one item of totals per group and no ts or gid
    // (measured 2026-09-25); mapped as flows, they became records stamped
    // with the current time
    if (group) {
      const groups = toFlowGroups(
        Array.isArray(response.results) ? response.results : []
      );
      return {
        count: groups.length,
        results: [],
        groups,
        group_by: group,
        next_cursor: response.next_cursor,
      };
    }

    // API returns {count, results[], next_cursor} format
    const flows = (Array.isArray(response.results) ? response.results : []).map(
      (item: any): Flow => {
        const parseTimestamp = (ts: any): number => {
          if (!ts) {
            return Math.floor(Date.now() / 1000);
          }

          if (typeof ts === 'number') {
            return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
          }

          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            return Math.floor(parsed / 1000);
          }

          return Math.floor(Date.now() / 1000);
        };

        const flow: Flow = {
          ts: parseTimestamp(item.ts || item.timestamp),
          gid: item.gid || this.config.boxId,
          protocol: item.protocol || 'tcp',
          direction: item.direction || 'outbound',
          block: Boolean(item.block || item.blocked),
          ...flowBytes(item),
          duration: item.duration || 0,
          count: item.count || item.packets || 1,
          device: {
            id:
              item.device?.id !== null && item.device?.id !== undefined
                ? String(item.device.id)
                : 'unknown',
            ip: item.device?.ip || item.srcIP || 'unknown',
            name: item.device?.name || 'Unknown Device',
          },
        };

        if (item.blockType) {
          flow.blockType = item.blockType;
        }

        if (item.device?.network) {
          flow.device.network = {
            id: item.device.network.id,
            name: item.device.network.name,
          };
        }

        if (item.source) {
          flow.source = {
            id: item.source.id || 'unknown',
            name: item.source.name || 'Unknown',
            ip: item.source.ip || item.srcIP || 'unknown',
          };
        }

        if (item.destination) {
          flow.destination = {
            id: item.destination.id || 'unknown',
            name: item.destination.name || item.domain || 'Unknown',
            ip: item.destination.ip || item.dstIP || 'unknown',
          };
        }

        if (item.region) {
          flow.region = item.region;
        }

        if (item.country) {
          flow.country = item.country;
        }

        if (item.category) {
          flow.category = item.category;
        }

        if (item.domain) {
          flow.domain = item.domain;
        }

        // The flow's network is top-level; the API sends no device.network
        if (item.network) {
          flow.network = { id: item.network.id, name: item.network.name };
        }

        return flow;
      }
    );

    return {
      count: response.count || flows.length,
      results: flows.map(flow =>
        this.enrichWithGeographicData(flow, ['destination.ip', 'source.ip'])
      ),
      next_cursor: response.next_cursor,
    };
  }

  async getDeviceStatus(
    deviceId?: string,
    includeOffline = true,
    limit?: number,
    cursor?: string,
    box?: string,
    group?: string
  ): Promise<{
    count: number;
    results: Device[];
    next_cursor?: string;
    total_count: number;
    has_more: boolean;
  }> {
    try {
      const startTime = Date.now();

      // Create a data fetcher function for pagination
      const dataFetcher = async (): Promise<Device[]> => {
        const endpoint = `/v2/devices`;

        // API returns direct array of devices
        const response = await this.request<Device[]>(
          'GET',
          endpoint,
          this.deviceBoxParams(box, group)
        );

        // Enhanced null safety and error handling
        const rawResults = Array.isArray(response) ? response : [];

        let results = rawResults
          .filter(item => item && typeof item === 'object')
          .map(item => this.transformDevice(item))
          .filter(device => device && device.id && device.id !== 'unknown');

        // Filter by device ID if provided
        if (deviceId?.trim()) {
          const targetId = deviceId.trim().toLowerCase();
          results = results.filter(
            device =>
              device.id.toLowerCase() === targetId ||
              (device.mac &&
                device.mac.toLowerCase().replace(/[:-]/g, '') ===
                  targetId.replace(/[:-]/g, ''))
          );
        }

        // Filter by online status if requested
        if (!includeOffline) {
          results = results.filter(device => device.online);
        }

        return results;
      };

      // Use universal pagination for client-side chunking
      const pageSize = limit || 100; // Default page size
      const paginatedResult = await createPaginatedResponse(
        dataFetcher,
        cursor,
        pageSize,
        'name', // Sort by name for consistent ordering
        'asc'
      );

      process.stderr.write(
        `Device pagination: ${paginatedResult.results.length}/${paginatedResult.total_count} (${Date.now() - startTime}ms)\n`
      );

      return {
        count: paginatedResult.results.length,
        results: paginatedResult.results,
        next_cursor: paginatedResult.next_cursor,
        total_count: paginatedResult.total_count,
        has_more: paginatedResult.has_more,
      };
    } catch (error) {
      logger.error(
        'Error in getDeviceStatus:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get device status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getOfflineDevices(
    sortByLastSeen: boolean = true
  ): Promise<{ count: number; results: Device[]; next_cursor?: string }> {
    try {
      // Input validation
      const shouldSort =
        typeof sortByLastSeen === 'boolean' ? sortByLastSeen : true;

      // Get all devices first
      const allDevices = await this.getDeviceStatus();

      // Enhanced filtering for offline devices with comprehensive null safety
      const offlineDevices = (allDevices.results || []).filter(
        device =>
          device &&
          typeof device === 'object' &&
          device.id &&
          device.id !== 'unknown' &&
          !device.online
      );

      // Sort by last seen if requested with enhanced error handling
      if (shouldSort && offlineDevices.length > 0) {
        try {
          offlineDevices.sort((a, b) => {
            const aLastSeen = new Date(a.lastSeen || 0).getTime();
            const bLastSeen = new Date(b.lastSeen || 0).getTime();
            // Handle invalid dates - push invalid dates to end, then sort by most recent first
            const aValid = !isNaN(aLastSeen);
            const bValid = !isNaN(bLastSeen);

            if (aValid !== bValid) {
              return bValid ? 1 : -1; // Valid dates come first
            }

            return aValid ? bLastSeen - aLastSeen : 0; // Most recent first if both valid
          });
        } catch (sortError) {
          logger.debugNamespace(
            'api',
            'Error sorting offline devices by lastSeen',
            { error: sortError }
          );
          // Continue without sorting if sort fails
        }
      }

      return {
        count: offlineDevices.length,
        results: offlineDevices,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getOfflineDevices:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get offline devices: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private transformDevice = (item: any): Device => {
    const device: Device = {
      id: item.id || item.mac || item._id || 'unknown',
      gid: item.gid || this.config.boxId,
      name: item.name || item.hostname || item.deviceName || 'Unknown Device',
      ip: item.ip || item.ipAddress || item.localIP || 'unknown',
      online: Boolean(item.online || item.isOnline || item.connected),
      ipReserved: Boolean(item.ipReserved),
      network: {
        id: item.network?.id || 'unknown',
        name: item.network?.name || 'Unknown Network',
      },
      totalDownload: item.totalDownload || 0,
      totalUpload: item.totalUpload || 0,
    };

    if (item.mac || item.macAddress || item.hardwareAddr) {
      device.mac = item.mac || item.macAddress || item.hardwareAddr;
    }

    if (item.macVendor || item.manufacturer || item.vendor) {
      device.macVendor = item.macVendor || item.manufacturer || item.vendor;
    }

    if (item.lastSeen || item.onlineTs || item.lastActivity) {
      // Handle different timestamp formats
      const timestamp = item.lastSeen || item.onlineTs || item.lastActivity;
      device.lastSeen =
        typeof timestamp === 'number' && timestamp > 1000000000000
          ? Math.floor(timestamp / 1000)
          : timestamp;
    }

    if (item.group) {
      device.group = {
        id: item.group.id || 'unknown',
        name: item.group.name || 'Unknown Group',
      };
    }

    return device;
  };

  /**
   * Get top bandwidth consuming devices on the network
   *
   * @param period - Time period for analysis ('1h', '24h', '7d', '30d')
   * @param top - Maximum number of devices to return (default: 10, max: 500)
   * @returns Promise resolving to bandwidth usage data with device details
   * @throws {Error} If period is invalid or API request fails
   * @example
   * ```typescript
   * const usage = await client.getBandwidthUsage('24h', 50);
   * usage.results.forEach(device => {
   *   console.log(`${device.name}: ${device.total_bytes} bytes`);
   * });
   * ```
   */
  async getBandwidthUsage(
    period: string,
    top = 10,
    box?: string
  ): Promise<{
    count: number;
    results: BandwidthUsage[];
    next_cursor?: string;
  }> {
    try {
      // Enhanced input validation and sanitization
      if (!period || typeof period !== 'string') {
        throw new Error('Period parameter is required and must be a string');
      }

      const validPeriods = ['1h', '24h', '7d', '30d'];
      const validatedPeriod = validPeriods.includes(period.toLowerCase())
        ? period.toLowerCase()
        : '24h';
      const validatedTop = Math.max(1, Number(top) || 50);

      // Calculate time range for the period
      const end = Math.floor(Date.now() / 1000);
      let begin: number;

      switch (validatedPeriod) {
        case '1h':
          begin = end - 60 * 60;
          break;
        case '24h':
          begin = end - 24 * 60 * 60;
          break;
        case '7d':
          begin = end - 7 * 24 * 60 * 60;
          break;
        case '30d':
          begin = end - 30 * 24 * 60 * 60;
          break;
        default:
          begin = end - 24 * 60 * 60;
      }

      // Use global endpoint with box parameter for filtering
      // Note: groupBy parameter conflicts with query+box combination, so we do client-side grouping
      const params: Record<string, unknown> = {
        query: `ts:${begin}-${end}`,
        sortBy: 'ts:desc',
      };

      // Scope to the box named, else FIREWALLA_BOX_ID, with the query
      params.query = this.addBoxFilter(params.query as string | undefined, box);

      // Get more data than `top` for client-side grouping
      const response = await this.requestPages<any>(
        '/v2/flows',
        params,
        Math.min(validatedTop * 10, 1000)
      );

      // Process and aggregate bandwidth by device
      const deviceBandwidth = new Map<string, BandwidthUsage>();

      logger.debug(
        `Processing ${response.results?.length || 0} flows for bandwidth calculation`
      );

      (response.results || []).forEach((flow: any) => {
        // Enhanced device ID detection with more fallbacks
        const deviceId =
          flow.device?.id ||
          flow.deviceId ||
          flow.source?.id ||
          flow.localIP ||
          flow.device?.ip ||
          'unknown';
        const deviceName =
          flow.device?.name ||
          flow.deviceName ||
          flow.device?.dns ||
          'Unknown Device';
        const deviceIp =
          flow.device?.ip || flow.localIP || flow.source?.ip || 'unknown';

        // Enhanced bandwidth field detection
        const upload = Number(
          flow.upload || flow.uploadBytes || flow.tx || flow.bytes_sent || 0
        );
        const download = Number(
          flow.download ||
            flow.downloadBytes ||
            flow.rx ||
            flow.bytes_received ||
            0
        );

        // More permissive filtering - only skip if BOTH device is unknown AND no traffic
        if (deviceId === 'unknown' && upload === 0 && download === 0) {
          return;
        }

        logger.debug(
          `Flow: deviceId=${deviceId}, upload=${upload}, download=${download}`
        );

        if (deviceBandwidth.has(deviceId)) {
          const existing = deviceBandwidth.get(deviceId)!;
          existing.bytes_uploaded += upload;
          existing.bytes_downloaded += download;
          existing.total_bytes =
            existing.bytes_uploaded + existing.bytes_downloaded;
        } else {
          deviceBandwidth.set(deviceId, {
            device_id: deviceId,
            device_name: deviceName,
            ip: deviceIp,
            bytes_uploaded: upload,
            bytes_downloaded: download,
            total_bytes: upload + download,
            period: validatedPeriod,
          });
        }
      });

      // Convert to array and sort by total bandwidth
      const allDevices = Array.from(deviceBandwidth.values());
      logger.debug(`Total unique devices found: ${allDevices.length}`);

      const results = allDevices
        .filter(device => device.total_bytes > 0)
        .sort((a, b) => b.total_bytes - a.total_bytes)
        .slice(0, validatedTop);

      logger.debug(
        `Final results after filtering and limiting: ${results.length}`
      );

      return {
        count: results.length,
        results,
        next_cursor: response.next_cursor,
      };
    } catch (error) {
      logger.error(
        'Error in getBandwidthUsage:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get bandwidth usage for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getNetworkRules(
    query?: string,
    limit?: number
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    const params: Record<string, unknown> = {};

    if (query) {
      params.query = query;
    }

    if (limit !== undefined) {
      params.limit = limit;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.request<{
      count: number;
      results: any[];
      next_cursor?: string;
    }>('GET', `/v2/rules`, params);

    // API returns {count, results[]} format
    const rules = (Array.isArray(response.results) ? response.results : []).map(
      (item: any): NetworkRule => ({
        id: item.id || 'unknown',
        action: item.action || 'block',
        target: {
          type: item.target?.type || 'ip',
          value: item.target?.value || 'unknown',
          dnsOnly: item.target?.dnsOnly,
          port: item.target?.port,
        },
        direction: item.direction || 'bidirection',
        gid: item.gid || this.config.boxId,
        group: item.group,
        scope: item.scope
          ? {
              type: item.scope.type || 'ip',
              value: item.scope.value || 'unknown',
              port: item.scope.port,
            }
          : undefined,
        notes: item.notes,
        status: item.status,
        hit: item.hit
          ? {
              count: item.hit.count || 0,
              lastHitTs: item.hit.lastHitTs || 0,
              statsResetTs: item.hit.statsResetTs,
            }
          : undefined,
        schedule: item.schedule
          ? {
              duration: item.schedule.duration || 0,
              cronTime: item.schedule.cronTime,
            }
          : undefined,
        timeUsage: item.timeUsage
          ? {
              quota: item.timeUsage.quota || 0,
              used: item.timeUsage.used || 0,
            }
          : undefined,
        protocol: item.protocol,
        ts: item.ts || Math.floor(Date.now() / 1000),
        updateTs: item.updateTs || Math.floor(Date.now() / 1000),
        resumeTs: item.resumeTs,
      })
    );

    return {
      count: response.count || rules.length,
      results: rules,
      next_cursor: response.next_cursor,
    };
  }

  /**
   * Get target lists
   *
   * @param _listType - Not sent: GET /v2/target-lists has no list type filter
   * @param limit - Applied on the client; the endpoint takes no `limit`
   * @param owner - The documented `owner` filter: `global`, a box gid, or a
   *   comma-separated list such as `global,<box_gid>`. Without it the API
   *   returns global and Firewalla-managed lists.
   */
  async getTargetLists(
    _listType?: string,
    limit?: number,
    owner?: string
  ): Promise<{ count: number; results: TargetList[]; next_cursor?: string }> {
    // `owner` is the endpoint's only parameter; it ignores query and limit
    const params: Record<string, unknown> = {};
    if (owner?.trim()) {
      params.owner = owner.trim();
    }

    const response = await this.request<
      TargetList[] | { results: TargetList[] }
    >('GET', `/v2/target-lists`, params);

    // Handle response format
    const results = Array.isArray(response)
      ? response
      : response?.results || [];

    // Apply client-side limit if not handled by API
    const limitedResults =
      limit !== undefined ? results.slice(0, limit) : results;

    return {
      count: Array.isArray(limitedResults) ? limitedResults.length : 0,
      results: Array.isArray(limitedResults) ? limitedResults : [],
    };
  }

  /**
   * Get a specific target list by ID
   */
  async getSpecificTargetList(id: string): Promise<TargetList> {
    return this.request<TargetList>('GET', `/v2/target-lists/${id}`);
  }

  /**
   * Create a new target list
   */
  async createTargetList(targetListData: {
    name: string;
    owner: string;
    targets: string[];
    category?: string;
    notes?: string;
  }): Promise<TargetList> {
    return this.request<TargetList>(
      'POST',
      `/v2/target-lists`,
      {},
      targetListData
    );
  }

  /**
   * Update an existing target list
   */
  async updateTargetList(
    id: string,
    updateData: {
      name?: string;
      targets?: string[];
      category?: string;
      notes?: string;
    }
  ): Promise<TargetList> {
    return this.request<TargetList>(
      'PATCH',
      `/v2/target-lists/${id}`,
      {},
      updateData
    );
  }

  /**
   * Delete a target list
   */
  async deleteTargetList(
    id: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'DELETE',
      `/v2/target-lists/${id}`
    );
  }

  /**
   * The configured default box for single-box operations: FIREWALLA_BOX_ID,
   * else FIREWALLA_DEFAULT_BOX_ID, if either is set
   */
  getDefaultBoxId(): string | undefined {
    return this.config.boxId ?? this.config.defaultBoxId;
  }

  /**
   * The box a single-box operation acts on: the explicit gid, else the
   * configured default (getDefaultBoxId), else the account's only box.
   *
   * @throws {BoxSelectionError} When the account has several boxes and none
   *   was named, or the token sees no boxes
   */
  async resolveBoxGid(gid?: string): Promise<string> {
    const named = gid?.trim() || this.getDefaultBoxId();
    if (named) {
      return named;
    }

    const boxes = await this.getBoxes();
    if (boxes.results.length === 1) {
      return boxes.results[0].gid;
    }
    if (boxes.results.length === 0) {
      throw new BoxSelectionError('No boxes are visible to this MSP token');
    }

    const listed = boxes.results
      .map(box => `${box.name} (${box.gid})`)
      .join(', ');
    throw new BoxSelectionError(
      `This MSP account has ${boxes.results.length} boxes: ${listed}. Pass gid, or set FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID`
    );
  }

  /**
   * Create a new firewall rule
   *
   * @param ruleData - Rule definition matching the MSP v2 rule data model
   * @param gid - Box the rule applies to. The API applies a rule with no gid
   *   (and no group) to every box in the MSP account, so callers must pass one.
   * @returns The created rule as returned by the API
   */
  async createRule(
    ruleData: {
      action: 'block' | 'allow';
      target: { type: string; value?: string; dnsOnly?: boolean };
      scope?: { type: string; value: string; port?: string };
      direction?: 'bidirection' | 'inbound' | 'outbound';
      protocol?: 'tcp' | 'udp';
      notes?: string;
      schedule?: { duration?: number; cronTime?: string };
    },
    gid: string
  ): Promise<NetworkRule> {
    if (!gid) {
      throw new Error('createRule requires a box gid');
    }
    const body: Record<string, unknown> = {
      action: ruleData.action,
      target: ruleData.target,
      gid,
    };
    if (ruleData.scope) {
      body.scope = ruleData.scope;
    }
    if (ruleData.direction) {
      body.direction = ruleData.direction;
    }
    if (ruleData.protocol) {
      body.protocol = ruleData.protocol;
    }
    if (ruleData.notes) {
      body.notes = ruleData.notes;
    }
    if (ruleData.schedule) {
      body.schedule = ruleData.schedule;
    }

    return this.request<NetworkRule>('POST', `/v2/rules`, {}, body, false);
  }

  /**
   * Delete a firewall rule permanently (MSP 2.11.0+)
   *
   * @param ruleId - ID of the rule to delete
   */
  async deleteRule(
    ruleId: string
  ): Promise<{ success: boolean; message: string }> {
    const validatedRuleId = this.sanitizeInput(ruleId);
    if (!validatedRuleId) {
      throw new Error('Invalid rule ID provided');
    }

    return this.request<{ success: boolean; message: string }>(
      'DELETE',
      `/v2/rules/${validatedRuleId}`,
      {},
      undefined,
      false
    );
  }

  /**
   * Rename a device. The MSP API only allows updating the `name` field
   * (32 characters max); all other fields are ignored by the API.
   *
   * @param deviceId - Device ID (MAC address)
   * @param name - New device name
   * @param gid - Box the device belongs to
   */
  async renameDevice(
    deviceId: string,
    name: string,
    gid: string
  ): Promise<Device> {
    const validatedDeviceId = this.sanitizeInput(deviceId);
    if (!validatedDeviceId) {
      throw new Error('Invalid device ID provided');
    }
    if (!gid) {
      throw new Error('renameDevice requires a box gid');
    }

    return this.request<Device>(
      'PATCH',
      `/v2/boxes/${encodeURIComponent(gid)}/devices/${encodeURIComponent(validatedDeviceId)}`,
      {},
      { name },
      false
    );
  }

  /**
   * Firewall status from /v2/boxes plus the 100 most recent flows. Covers the
   * FIREWALLA_BOX_ID box, or every box on the account. The MSP API reports no
   * CPU, memory or uptime figures, so the summary has none.
   */
  async getFirewallSummary(): Promise<FirewallSummary> {
    const [boxes, flows] = await Promise.all([
      this.getBoxes(),
      this.getFlowData(undefined, undefined, 'ts:desc', 100),
    ]);

    const inScope = this.config.boxId
      ? boxes.results.filter(box => box.gid === this.config.boxId)
      : boxes.results;
    const summaries: BoxSummary[] = inScope.map(box => ({
      gid: box.gid,
      name: box.name,
      model: box.model,
      online: box.online,
      last_seen: box.lastSeen,
      device_count: box.deviceCount,
      alarm_count: box.alarmCount,
      rule_count: box.ruleCount,
    }));

    const online = summaries.filter(box => box.online).length;
    let status: FirewallSummary['status'] = 'partial';
    if (summaries.length === 0) {
      status = 'unknown';
    } else if (online === summaries.length) {
      status = 'online';
    } else if (online === 0) {
      status = 'offline';
    }

    return {
      status,
      boxes: summaries,
      boxes_online: online,
      boxes_total: summaries.length,
      recent_flows_sampled: flows.results.length,
      blocked_in_sample: flows.results.filter(flow => flow.block).length,
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Count the alarms or flows matching `query`, split by `groupBy`. Given
   * `groupBy`, /v2/alarms and /v2/flows answer with one row per group
   * carrying the group's `count` and no `ts` (measured 2026-09-25), so the
   * totals are exact however many items match; more groups than one page
   * holds are paged, up to 20 pages. If the rows are items rather than
   * groups, the counts are those of the first page, and `exact` is false when
   * more pages exist. Scoped to `box`, else FIREWALLA_BOX_ID.
   */
  private async countMatching(
    endpoint: '/v2/alarms' | '/v2/flows',
    query: string | undefined,
    groupBy: 'status' | 'type' | 'box',
    box?: string
  ): Promise<{ total: number; groups: Map<string, number>; exact: boolean }> {
    const params: Record<string, unknown> = {
      groupBy,
      limit: MAX_API_PAGE_SIZE,
    };
    const scoped = this.addBoxFilter(query, box);
    if (scoped) {
      params.query = scoped;
    }
    const keyOf = (row: Record<string, unknown>): string =>
      String(groupBy === 'box' ? (row.gid ?? row.box) : row[groupBy]);
    const groups = new Map<string, number>();
    let total = 0;
    let cursor: string | undefined;
    let grouped = true;
    for (let pages = 0; pages < 20 && grouped; pages++) {
      const page = await this.request<{
        results?: Array<Record<string, unknown>>;
        next_cursor?: string;
      }>('GET', endpoint, cursor ? { ...params, cursor } : params);
      const rows = Array.isArray(page?.results) ? page.results : [];
      grouped = rows.every(
        row => typeof row?.count === 'number' && row.ts === undefined
      );
      for (const row of rows) {
        const n = grouped ? (row.count as number) : 1;
        groups.set(keyOf(row), (groups.get(keyOf(row)) || 0) + n);
        total += n;
      }
      cursor = rows.length > 0 ? page?.next_cursor : undefined;
      if (!cursor) {
        break;
      }
    }
    return { total, groups, exact: !cursor };
  }

  /**
   * Security counts for the prompts and firewalla://metrics/security. Every
   * count is an exact total from the API's grouped counts, over the window
   * in `windows`: the API's default windows are 30 days for alarms and 24
   * hours for flows. The threat level comes from Security Activity (type 1)
   * alarms, the type /v2/stats/topBoxesBySecurityAlarms counts; the other
   * types (video, gaming, new device and so on) are routine on most
   * networks. Scoped to FIREWALLA_BOX_ID when it is set.
   */
  async getSecurityMetrics(): Promise<SecurityMetricsSummary> {
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 24 * 60 * 60;

    const [byStatus, lastDayByType, blocked, newestSecurityAlarm] =
      await Promise.all([
        this.countMatching('/v2/alarms', undefined, 'status'),
        this.countMatching('/v2/alarms', `ts:${dayAgo}-${now}`, 'type'),
        // The API has no `block` qualifier and answers `block:true` with no
        // results; `status:blocked` selects blocked flows
        this.countMatching('/v2/flows', 'status:blocked', 'box'),
        this.request<{ results?: Array<{ ts?: unknown }> }>(
          'GET',
          '/v2/alarms',
          {
            query: this.addBoxFilter('type:1'),
            sortBy: 'ts:desc',
            limit: 1,
          }
        ),
      ]);

    const securityAlarms = lastDayByType.groups.get('1') || 0;
    let threat_level: SecurityMetricsSummary['threat_level'] = 'low';
    if (securityAlarms > 10) {
      threat_level = 'critical';
    } else if (securityAlarms > 5) {
      threat_level = 'high';
    } else if (securityAlarms > 1) {
      threat_level = 'medium';
    }

    const newestTs = Number(newestSecurityAlarm?.results?.[0]?.ts);
    const lower_bounds: string[] = [];
    if (!byStatus.exact) {
      lower_bounds.push('total_alarms', 'active_alarms');
    }
    if (!blocked.exact) {
      lower_bounds.push('blocked_connections');
    }
    if (!lastDayByType.exact) {
      lower_bounds.push('suspicious_activities', 'security_alarms');
    }

    return {
      total_alarms: byStatus.total,
      active_alarms: byStatus.groups.get('1') || 0,
      blocked_connections: blocked.total,
      suspicious_activities: lastDayByType.total,
      security_alarms: securityAlarms,
      threat_level,
      last_threat_detected:
        Number.isFinite(newestTs) && newestTs > 0
          ? new Date(newestTs * 1000).toISOString()
          : null,
      windows: {
        total_alarms: 'last 30 days',
        active_alarms: 'last 30 days',
        blocked_connections: 'last 24 hours',
        suspicious_activities: 'last 24 hours',
        security_alarms: 'last 24 hours',
      },
      lower_bounds,
    };
  }

  async getNetworkTopology(): Promise<{
    subnets: Array<{
      id: string;
      name: string;
      cidr: string;
      device_count: number;
    }>;
    connections: Array<{
      source: string;
      destination: string;
      type: string;
      bandwidth: number;
    }>;
  }> {
    // Build topology from device and flow data since /topology doesn't exist
    const [devices, flows] = await Promise.all([
      this.getDeviceStatus(undefined, true, 1000),
      this.getFlowData(undefined, undefined, 'ts:desc', 1000),
    ]);

    // Group devices by network/subnet
    const networkMap = new Map<string, any[]>();
    devices.results.forEach(device => {
      const networkId = device.network?.id || 'default';
      if (!networkMap.has(networkId)) {
        networkMap.set(networkId, []);
      }
      networkMap.get(networkId)!.push(device);
    });

    // Create subnet information
    const subnets = Array.from(networkMap.entries()).map(
      ([networkId, devices]) => ({
        id: networkId,
        name: devices[0]?.network?.name || 'Default Network',
        cidr: '192.168.1.0/24', // Mock CIDR - not available in API
        device_count: devices.length,
      })
    );

    // Create connection information from flows
    const connections = flows.results.slice(0, 50).map(flow => ({
      source: flow.device?.ip || flow.source?.ip || 'unknown',
      destination: flow.destination?.ip || 'unknown',
      type: flow.protocol,
      bandwidth: flow.bytes || 0,
    }));

    return { subnets, connections };
  }

  async getRecentThreats(hours = 24): Promise<
    Array<{
      timestamp: string;
      type: string;
      source_ip: string;
      destination_ip: string;
      action_taken: string;
      severity: string;
    }>
  > {
    // Optimized: Use server-side timestamp filtering instead of client-side filtering
    const timeThreshold = Math.floor(Date.now() / 1000 - hours * 60 * 60);

    const [alarms, blockedFlows] = await Promise.all([
      // Active alarms only: archived ones are dismissed, not threats
      this.getActiveAlarms(
        `status:1 ts:>=${timeThreshold}`,
        undefined,
        'ts:desc',
        1000
      ),
      this.getFlowData(
        `status:blocked ts:>=${timeThreshold}`,
        undefined,
        'ts:desc',
        50
      ),
    ]);

    // Convert recent alarms to threat format
    const threats = alarms.results.map(alarm => {
      // Handle both string and number timestamp formats
      const timestamp =
        typeof alarm.ts === 'string'
          ? alarm.ts
          : new Date(alarm.ts * 1000).toISOString();

      return {
        timestamp,
        type: alarm.message || 'Security Alert',
        source_ip: alarm.device?.ip || 'unknown',
        destination_ip: alarm.remote?.ip || 'unknown',
        action_taken: alarm.status === 1 ? 'blocked' : 'logged',
        severity: alarm.type >= 5 ? 'high' : alarm.type >= 3 ? 'medium' : 'low',
      };
    });

    // Add blocked flows as threats
    const blockedThreats = blockedFlows.results.map(flow => {
      // Handle both string and number timestamp formats
      const timestamp =
        typeof flow.ts === 'string'
          ? flow.ts
          : new Date(flow.ts * 1000).toISOString();

      return {
        timestamp,
        type: 'Blocked Connection',
        source_ip: flow.device.ip,
        destination_ip: flow.destination?.ip || 'unknown',
        action_taken: 'blocked',
        severity: 'medium',
      };
    });

    return [...threats, ...blockedThreats].slice(0, 100); // Limit total results
  }

  async getBoxes(
    groupId?: string
  ): Promise<{ count: number; results: Box[]; next_cursor?: string }> {
    try {
      // Input validation and sanitization
      const params: Record<string, unknown> = {};

      if (groupId?.trim()) {
        params.group = groupId.trim();
      }

      // API returns direct array of boxes
      const response = await this.request<any[]>(
        'GET',
        `/v2/boxes`,
        params,
        true
      );

      // Enhanced null safety and data validation
      const rawResults = Array.isArray(response) ? response : [];
      const results = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): Box => {
          // Enhanced data transformation with null safety
          const box: Box = {
            gid: (item.gid || item.id || 'unknown').toString(),
            name: (item.name || 'Unknown Box').toString(),
            model: (item.model || 'unknown').toString(),
            mode: (item.mode || 'router').toString(),
            version: (item.version || 'unknown').toString(),
            online: Boolean(item.online || item.status === 'online'),
            lastSeen: item.lastSeen || item.last_seen || undefined,
            license: (item.license || 'unknown').toString(),
            publicIP: (item.publicIP || item.public_ip || 'unknown').toString(),
            group: item.group || undefined,
            location: (item.location || 'unknown').toString(),
            deviceCount: Math.max(
              0,
              Number(item.deviceCount || item.device_count || 0)
            ),
            ruleCount: Math.max(
              0,
              Number(item.ruleCount || item.rule_count || 0)
            ),
            alarmCount: Math.max(
              0,
              Number(item.alarmCount || item.alarm_count || 0)
            ),
          };
          return box;
        })
        .filter(box => box.gid && box.gid !== 'unknown');

      return {
        count: results.length,
        results,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getBoxes:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get boxes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getSpecificAlarm(
    alarmId: string,
    gid?: string
  ): Promise<{ count: number; results: Alarm[]; next_cursor?: string }> {
    try {
      // An explicit gid or FIREWALLA_BOX_ID names the one box to ask. Without
      // either, ask each box on the account (FIREWALLA_DEFAULT_BOX_ID first)
      // until one has the alarm: alarm IDs are per box.
      const namedGid = gid?.trim() || this.config.boxId;
      let candidateGids: string[];
      if (namedGid) {
        candidateGids = [namedGid];
      } else {
        const boxes = await this.getBoxes();
        candidateGids = boxes.results.map(box => box.gid);
        const preferred = this.config.defaultBoxId;
        if (preferred && candidateGids.includes(preferred)) {
          candidateGids = [
            preferred,
            ...candidateGids.filter(candidate => candidate !== preferred),
          ];
        }
        if (candidateGids.length === 0) {
          throw new BoxSelectionError('No boxes are visible to this MSP token');
        }
      }

      // Enhanced input validation and sanitization
      const validatedGids = candidateGids.map(candidate => {
        const validatedGid = this.sanitizeInput(candidate);

        if (!validatedGid || validatedGid.length === 0) {
          throw new Error('Invalid or empty gid provided');
        }

        // Additional validation for GID format
        if (!/^[a-zA-Z0-9_-]+$/.test(validatedGid)) {
          throw new Error('GID contains invalid characters');
        }

        return validatedGid;
      });

      // Simple alarm ID validation
      const validatedAlarmId = validateAlarmId(alarmId);

      // Get all possible alarm ID variations to try
      const idVariations = [validatedAlarmId]; // Just use the validated ID
      const debugInfo = { originalId: alarmId };

      logger.debug('Attempting alarm ID resolution', {
        originalId: alarmId,
        variations: idVariations,
        debugInfo,
      });

      let lastError: Error | null = null;
      let response: any = null;
      let foundGid: string | undefined;
      let attempts = 0;
      let forbidden = 0;

      // Try each box, and each ID variation on it, until one succeeds
      for (const validatedGid of validatedGids) {
        for (const idVariation of idVariations) {
          const validatedAlarmId = this.sanitizeInput(idVariation);

          if (!validatedAlarmId || validatedAlarmId.length === 0) {
            continue; // Skip invalid variations
          }

          // Additional validation for alarm ID format (relaxed for ID variations)
          if (!/^[a-zA-Z0-9_-]+$/.test(validatedAlarmId)) {
            continue; // Skip invalid format variations
          }

          try {
            logger.debug(`Trying alarm ID variation: ${validatedAlarmId}`);

            response = await this.request<any>(
              'GET',
              `/v2/alarms/${validatedGid}/${validatedAlarmId}`
            );

            // If we get here, the request succeeded
            foundGid = validatedGid;
            logger.debug(
              `Successfully found alarm with ID: ${validatedAlarmId}`
            );
            break;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            attempts++;
            if (error instanceof ForbiddenError) {
              forbidden++;
            }
            logger.debug(`Failed to find alarm with ID ${validatedAlarmId}:`, {
              error: lastError.message,
            });

            // Skip invalid variations
          }
        }
        if (response) {
          break;
        }
      }

      // Every box refused the token (403): say so, not "not found"
      if (!response && attempts > 0 && forbidden === attempts) {
        throw lastError;
      }

      // If no variation worked, throw the last error
      if (!response) {
        const errorMessage = `Alarm not found: tried ${validatedGids.length} box(es) and ${idVariations.length} ID variation(s). Last error: ${lastError?.message || 'Unknown error'}`;
        logger.warn('All alarm ID variations failed', {
          originalId: alarmId,
          variations: idVariations,
          lastError: lastError?.message,
        });
        throw new Error(errorMessage);
      }

      // Enhanced null/undefined checks for response
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from API');
      }

      // Enhanced timestamp parsing with better validation
      const parseTimestamp = (ts: any): number => {
        if (!ts && ts !== 0) {
          return Math.floor(Date.now() / 1000);
        }

        if (typeof ts === 'number') {
          // Handle milliseconds vs seconds timestamp
          const timestamp = ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
          // Validate timestamp is reasonable (not in the far future or past)
          const now = Math.floor(Date.now() / 1000);
          const yearAgo = now - 365 * 24 * 60 * 60;
          const hourFromNow = now + 60 * 60;

          if (timestamp >= yearAgo && timestamp <= hourFromNow) {
            return timestamp;
          }
        }

        if (typeof ts === 'string') {
          const parsed = parseInt(ts, 10);
          if (!isNaN(parsed)) {
            const timestamp =
              parsed > 1000000000000 ? Math.floor(parsed / 1000) : parsed;
            return timestamp;
          }
        }

        return Math.floor(Date.now() / 1000);
      };

      // Enhanced alarm object construction with comprehensive validation
      const alarm: Alarm = {
        ts: parseTimestamp(response.ts),
        gid:
          response.gid &&
          typeof response.gid === 'string' &&
          response.gid.trim()
            ? response.gid.trim()
            : foundGid,
        aid:
          response.aid && typeof response.aid === 'number' && response.aid >= 0
            ? response.aid
            : response.id && typeof response.id === 'number' && response.id >= 0
              ? response.id
              : 0,
        type:
          response.type &&
          typeof response.type === 'number' &&
          response.type > 0
            ? response.type
            : 1,
        status:
          response.status &&
          typeof response.status === 'number' &&
          response.status >= 0
            ? response.status
            : 1,
        message: this.extractValidString(
          response.message ||
            response.description ||
            response.msg ||
            response.title,
          `Alarm ${response._type || response.alarmType || 'security event'} detected`
        ),
        direction: this.extractValidString(response.direction, 'inbound', [
          'inbound',
          'outbound',
          'bidirection',
        ]),
        protocol: this.extractValidString(response.protocol, 'tcp', [
          'tcp',
          'udp',
          'icmp',
          'http',
          'https',
        ]),
      };

      // Add optional fields with validation
      if (response.device && typeof response.device === 'object') {
        alarm.device = response.device;
      }
      if (response.remote && typeof response.remote === 'object') {
        alarm.remote = response.remote;
      }
      if (response.transfer && typeof response.transfer === 'object') {
        alarm.transfer = response.transfer;
      }
      if (
        response.severity &&
        typeof response.severity === 'string' &&
        response.severity.trim()
      ) {
        alarm.severity = response.severity.trim();
      }

      return {
        count: 1,
        results: [alarm],
        next_cursor: undefined,
      };
    } catch (error) {
      if (error instanceof BoxSelectionError) {
        throw error; // the handler reports it as a validation error
      }
      logger.error(
        'Error in getSpecificAlarm:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (error instanceof ForbiddenError) {
        throw error;
      }
      // Enhanced error handling
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('validation')
        ) {
          throw error; // Re-throw validation errors
        }
        if (
          error.message.includes('404') ||
          error.message.includes('not found')
        ) {
          throw new Error(`Alarm with ID '${alarmId}' not found`);
        }
      }
      throw new Error(
        `Failed to get specific alarm: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteAlarm(alarmId: string, gid?: string): Promise<any> {
    try {
      // Enhanced input validation and sanitization
      const validatedGid = this.sanitizeInput(gid || this.config.boxId);

      if (!validatedGid || validatedGid.length === 0) {
        throw new Error('Invalid or empty gid provided');
      }

      // Additional validation for GID format
      if (!/^[a-zA-Z0-9_-]+$/.test(validatedGid)) {
        throw new Error('GID contains invalid characters');
      }

      // Enhanced length validation for GID
      if (validatedGid.length > 128) {
        throw new Error('GID is too long (maximum 128 characters)');
      }

      // Simple alarm ID validation
      const validatedAlarmId = validateAlarmId(alarmId);

      // Get all possible alarm ID variations to try
      const idVariations = [validatedAlarmId]; // Just use the validated ID
      const debugInfo = { originalId: alarmId };

      logger.debug('Attempting alarm deletion with ID resolution', {
        originalId: alarmId,
        variations: idVariations,
        debugInfo,
      });

      let lastError: Error | null = null;
      let response: any = null;
      let successfulId: string | null = null;

      // Try each ID variation until one succeeds
      for (const idVariation of idVariations) {
        const validatedAlarmId = this.sanitizeInput(idVariation);

        if (!validatedAlarmId || validatedAlarmId.length === 0) {
          continue; // Skip invalid variations
        }

        // Additional validation for alarm ID format
        if (!/^[a-zA-Z0-9_-]+$/.test(validatedAlarmId)) {
          continue; // Skip invalid format variations
        }

        // Enhanced length validation for alarm ID
        if (validatedAlarmId.length > 128) {
          continue; // Skip variations that are too long
        }

        try {
          logger.debug(
            `Trying to delete alarm with ID variation: ${validatedAlarmId}`
          );

          response = await this.request<{
            success: boolean;
            message: string;
            deleted?: boolean;
            status?: string;
          }>(
            'DELETE',
            `/v2/alarms/${validatedGid}/${validatedAlarmId}`,
            undefined,
            false
          );

          // If we get here, the request succeeded
          successfulId = validatedAlarmId;
          logger.debug(
            `Successfully deleted alarm with ID: ${validatedAlarmId}`
          );
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.debug(`Failed to delete alarm with ID ${validatedAlarmId}:`, {
            error: lastError.message,
          });

          // Continue to next variation
        }
      }

      // If no variation worked, throw the last error
      if (!response || !successfulId) {
        const errorMessage = `Alarm deletion failed: tried ${idVariations.length} ID variations. Last error: ${lastError?.message || 'Unknown error'}`;
        logger.warn('All alarm ID variations failed for deletion', {
          originalId: alarmId,
          variations: idVariations,
          lastError: lastError?.message,
        });
        throw new Error(errorMessage);
      }

      // Handle various response formats - API may return empty body, status text, or object
      let isSuccess = true; // Default to success for 200 responses
      let responseMessage = `Alarm ${successfulId} deleted successfully`;

      if (response && typeof response === 'object') {
        // Check if it's an empty object {} which indicates success
        if (Object.keys(response).length === 0) {
          isSuccess = true;
          responseMessage = `Alarm ${successfulId} deleted successfully`;
        } else {
          // Complex response object - check multiple success indicators
          isSuccess = Boolean(
            response.success ||
            response.deleted ||
            (response.status &&
              ['deleted', 'removed', 'success', 'ok'].includes(
                response.status.toLowerCase()
              ))
          );
          if ('message' in response && response.message) {
            responseMessage = response.message;
          }
        }
      } else if (typeof response === 'string') {
        // String response - check for success keywords
        isSuccess = /success|deleted|removed|ok/i.test(response);
        responseMessage = response;
      }
      // For null/undefined response with 200 status, assume success

      // Enhanced response object construction
      const result = {
        id: successfulId,
        success: isSuccess,
        message: responseMessage,
        timestamp: getCurrentTimestamp(),
        // Add additional fields if available from object responses
        ...(response &&
          typeof response === 'object' &&
          response.status && { status: response.status }),
        ...(response &&
          typeof response === 'object' &&
          typeof response.deleted === 'boolean' && {
            deleted: response.deleted,
          }),
      };

      return result;
    } catch (error) {
      logger.error(
        'Error in deleteAlarm:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Log detailed error information for debugging
      logger.error(
        `DeleteAlarm detailed error info - alarmId: ${alarmId}, errorType: ${(error as any)?.constructor?.name}, errorMessage: ${error instanceof Error ? error.message : String(error)}`
      );

      // Enhanced error handling with specific error types
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('validation')
        ) {
          throw error; // Re-throw validation errors
        }
        if (
          error.message.includes('404') ||
          error.message.includes('not found')
        ) {
          throw new Error(
            `Alarm with ID '${alarmId}' not found or already deleted`
          );
        }
        if (
          error.message.includes('403') ||
          error.message.includes('unauthorized')
        ) {
          throw new Error(
            `Insufficient permissions to delete alarm '${alarmId}'`
          );
        }
        if (
          error.message.includes('409') ||
          error.message.includes('conflict')
        ) {
          throw new Error(
            `Cannot delete alarm '${alarmId}' due to conflict or dependency`
          );
        }
        // Include the actual error message for better debugging
        throw new Error(`Failed to delete alarm: ${error.message}`);
      }
      throw new Error(
        `Failed to delete alarm: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Archive an alarm (MSP 2.11.0 or later). It leaves the active alarms, and
   * unlike muteAlarm it creates no silence exception: future matching traffic
   * can still raise new alarms. The box is found as locateAlarmForWrite
   * describes, and the alarm is read first so a wrong ID fails before any
   * write.
   *
   * @param alarmId - The numeric aid, as a number or a string
   * @param gid - Box the alarm belongs to (the alarm's gid field)
   */
  async archiveAlarm(
    alarmId: string | number,
    gid?: string
  ): Promise<AlarmActionResult> {
    const located = await this.locateAlarmForWrite(alarmId, gid);
    const response = await this.postAlarmAction(located, 'archive');
    return { ...located, response };
  }

  /**
   * Mute an alarm (MSP 2.11.0 or later): the API archives it and has the box
   * create a lasting silence exception, so future alarms matching `target`
   * within `scope` are no longer raised. The body is checked against the
   * documented model before anything is sent, then the box is found as
   * locateAlarmForWrite describes.
   *
   * @param alarmId - The numeric aid, as a number or a string
   * @param mute - What to silence (target) and for which devices (scope)
   * @param gid - Box the alarm belongs to (the alarm's gid field)
   * @throws {Error} When the body is not one the docs allow; nothing is sent
   */
  async muteAlarm(
    alarmId: string | number,
    mute: AlarmMuteRequest,
    gid?: string
  ): Promise<AlarmActionResult & { request: AlarmMuteRequest }> {
    const checked = checkMuteRequest(mute);
    if (!checked.ok) {
      throw new Error(`Invalid mute request: ${checked.problems.join('; ')}`);
    }
    const located = await this.locateAlarmForWrite(alarmId, gid);
    const response = await this.postAlarmAction(located, 'mute', {
      target: checked.request.target,
      scope: checked.request.scope,
    });
    return { ...located, request: checked.request, response };
  }

  /**
   * The box and alarm an alarm write acts on. An explicit gid, else
   * FIREWALLA_BOX_ID, names the one box to look on. Without either, each box
   * is checked, as getSpecificAlarm does. Alarm IDs are per box, so the same
   * aid can name different alarms on different boxes: the
   * FIREWALLA_DEFAULT_BOX_ID box is used if it has the alarm (the one
   * getSpecificAlarm returns), and otherwise exactly one box must have it.
   *
   * @throws {AlarmNotFoundError} The alarm is not on the box, or on any box
   * @throws {BoxSelectionError} Several boxes have the aid, a box could not be
   *   checked, or the token sees no boxes
   */
  private async locateAlarmForWrite(
    alarmId: string | number,
    gid?: string
  ): Promise<{ gid: string; aid: string; alarm: Record<string, any> }> {
    const aid = validateAlarmId(alarmId);
    if (!/^\d+$/.test(aid)) {
      throw new Error(
        `Invalid alarm ID: "${aid}" is not a numeric aid (the aid field of get_active_alarms or search_alarms)`
      );
    }

    const named = gid?.trim() || this.config.boxId;
    if (named) {
      const alarm = await this.findAlarmOnBox(named, aid);
      if (!alarm) {
        throw new AlarmNotFoundError(`Alarm ${aid} not found on box ${named}`);
      }
      return { gid: named, aid, alarm };
    }

    const boxes = (await this.getBoxes()).results;
    if (boxes.length === 0) {
      throw new BoxSelectionError('No boxes are visible to this MSP token');
    }
    const preferred = this.config.defaultBoxId;
    const ordered = [
      ...boxes.filter(box => box.gid === preferred),
      ...boxes.filter(box => box.gid !== preferred),
    ];

    const found: Array<{ box: Box; alarm: Record<string, any> }> = [];
    const unchecked: string[] = [];
    for (const box of ordered) {
      let alarm: Record<string, any> | null;
      try {
        alarm = await this.findAlarmOnBox(box.gid, aid);
      } catch (error) {
        unchecked.push(
          `${box.name} (${box.gid}): ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      if (alarm && box.gid === preferred) {
        return { gid: box.gid, aid, alarm };
      }
      if (alarm) {
        found.push({ box, alarm });
      }
    }

    // A box that could not be checked may hold the same aid
    if (unchecked.length > 0) {
      throw new BoxSelectionError(
        `Could not check every box for alarm ${aid}: ${unchecked.join('; ')}. Pass gid to act on one box`
      );
    }
    if (found.length === 1) {
      return { gid: found[0].box.gid, aid, alarm: found[0].alarm };
    }
    if (found.length === 0) {
      throw new AlarmNotFoundError(
        boxes.length === 1
          ? `Alarm ${aid} not found on the account's only box (${boxes[0].gid})`
          : `Alarm ${aid} not found on any of the ${boxes.length} boxes on this account`
      );
    }
    const listed = found
      .map(
        ({ box, alarm }) => `${box.name} (${box.gid}): ${describeAlarm(alarm)}`
      )
      .join('; ');
    throw new BoxSelectionError(
      `Alarm ID ${aid} exists on ${found.length} boxes, and alarm IDs are per box: ${listed}. Pass gid to pick one, or set FIREWALLA_DEFAULT_BOX_ID`
    );
  }

  /** GET one alarm without the cache; null when the API answers 404 */
  private async findAlarmOnBox(
    gid: string,
    aid: string
  ): Promise<Record<string, any> | null> {
    if (!/^[a-zA-Z0-9_-]+$/.test(gid)) {
      throw new Error(`Invalid box gid: "${gid}"`);
    }
    try {
      const alarm = await this.request<Record<string, any>>(
        'GET',
        `/v2/alarms/${gid}/${aid}`,
        undefined,
        undefined,
        false
      );
      return alarm && typeof alarm === 'object' ? alarm : null;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * POST an alarm action for an alarm locateAlarmForWrite found. Not retried:
   * a request that got no HTTP answer may still have been applied.
   */
  private async postAlarmAction(
    located: { gid: string; aid: string },
    action: 'archive' | 'mute',
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const endpoint = `/v2/alarms/${located.gid}/${located.aid}/${action}`;
    let response: unknown;
    try {
      response = await this.request<unknown>(
        'POST',
        endpoint,
        undefined,
        body,
        false
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNotFoundError(error)) {
        throw new Error(
          `POST ${endpoint} returned 404 although the alarm exists (GET returned it). ${action} needs MSP 2.11.0 or later, and the API's 404 does not say whether the endpoint or the alarm was missing`
        );
      }
      if (/API Error \(unknown\)|^Request failed:/.test(message)) {
        throw new Error(
          `POST ${endpoint} got no HTTP status (${message}). The alarm may or may not have been ${action === 'archive' ? 'archived' : 'muted'}: check its status with get_specific_alarm (2 is archived) before retrying`
        );
      }
      throw error;
    }
    this.dropCachedAlarms();
    return response;
  }

  /**
   * Forget cached alarm reads, so an alarm just archived or muted does not
   * show as active for the rest of the cache TTL
   */
  private dropCachedAlarms(): void {
    for (const key of this.cache.keys()) {
      if (key.includes(':GET:_v2_alarms')) {
        this.cache.delete(key);
      }
    }
  }

  // Statistics API Implementation
  async getSimpleStatistics(group?: string): Promise<{
    count: number;
    results: SimpleStats[];
    next_cursor?: string;
  }> {
    const params: Record<string, unknown> = {};
    if (group?.trim()) {
      params.group = group.trim();
    }
    const response = await this.request<{
      onlineBoxes: number;
      offlineBoxes: number;
      alarms: number;
      rules: number;
    }>('GET', '/v2/stats/simple', params);

    return {
      count: 1,
      results: [response],
    };
  }

  /**
   * Top regions by blocked flows, from GET /v2/stats/topRegionsByBlockedFlows.
   * Measured 2026-09-25: `limit` below 5 is honoured, and a larger `limit`
   * still returned 5 regions.
   */
  async getStatisticsByRegion(
    group?: string,
    limit?: number
  ): Promise<{
    count: number;
    results: Statistics[];
    next_cursor?: string;
  }> {
    try {
      const params: Record<string, unknown> = {};
      if (group?.trim()) {
        params.group = group.trim();
      }
      if (limit !== undefined) {
        params.limit = limit;
      }
      const response = await this.request<unknown>(
        'GET',
        '/v2/stats/topRegionsByBlockedFlows',
        params
      );
      if (!Array.isArray(response)) {
        throw new Error(
          'Unexpected response from /v2/stats/topRegionsByBlockedFlows: expected an array'
        );
      }
      const results: Statistics[] = response
        .filter(
          (item: any) =>
            item &&
            typeof item.value === 'number' &&
            typeof item.meta?.code === 'string'
        )
        .map((item: any) => ({
          meta: { code: item.meta.code },
          value: item.value,
        }));

      return {
        count: results.length,
        results,
      };
    } catch (error) {
      logger.error(
        'Error in getStatisticsByRegion:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get statistics by region: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * GET /v2/trends/{kind}: the number of blocked flows captured, alarms
   * generated or rules created each day. Measured 2026-09-25: 30 points in
   * ascending ts order, one per day, each ts the start of a day in the
   * account's time zone, the last point the current day so far. `group` (a
   * box group ID) scopes it; the endpoint takes no box, so a box-scoped
   * series is counted per day by boxDailyTrend.
   */
  private async fetchTrend(
    kind: 'flows' | 'alarms' | 'rules',
    group?: string
  ): Promise<Trend[]> {
    const params: Record<string, unknown> = {};
    if (group?.trim()) {
      params.group = group.trim();
    }
    const response = await this.request<unknown>(
      'GET',
      `/v2/trends/${kind}`,
      params
    );
    if (!Array.isArray(response)) {
      throw new Error(
        `Unexpected response from /v2/trends/${kind}: expected an array of {ts, value}`
      );
    }
    return response
      .filter(
        (point: any) =>
          point &&
          Number.isFinite(point.ts) &&
          point.ts > 0 &&
          Number.isFinite(point.value) &&
          point.value >= 0
      )
      .map((point: any) => ({ ts: point.ts, value: point.value }))
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * The box a trend is scoped to: `box`, else FIREWALLA_BOX_ID unless a
   * `group` is given (an explicit group takes precedence over the default
   * box), else none. A box and a group together are refused: a box is in one
   * group, so the pair is either redundant or matches nothing.
   * @throws {BoxSelectionError} Both box and group are given, or the box is
   * not a box gid
   */
  private trendBox(group?: string, box?: string): string | undefined {
    const named = box?.trim();
    const groupId = group?.trim();
    if (named && groupId) {
      throw new BoxSelectionError(
        'box and group cannot be combined: pass box for one box or group for a box group'
      );
    }
    const gid =
      named || (groupId ? undefined : this.config.boxId?.trim() || undefined);
    if (gid !== undefined && !isValidBoxGid(gid)) {
      throw new BoxSelectionError(INVALID_BOX_GID);
    }
    return gid;
  }

  /**
   * A documented daily trend cut to `period`. The trends API has one point
   * per day, so a period shorter than a day returns the current day so far.
   * With a box in scope (trendBox) each day is counted for that box.
   */
  private async dailyTrend(
    kind: 'flows' | 'alarms',
    period: TrendPeriod,
    group?: string,
    box?: string
  ): Promise<TrendSeries> {
    // Checked before any request
    const gid = this.trendBox(group, box);
    const validated = validTrendPeriod(period);
    const now = Math.floor(Date.now() / 1000);
    if (gid) {
      return this.boxDailyTrend(kind, validated, now, gid);
    }
    const groupId = group?.trim() || undefined;
    const points = await this.fetchTrend(kind, groupId);
    return selectTrendDays(points, validated, now, {
      source: `GET /v2/trends/${kind}`,
      scope: groupId ? `box group ${groupId}` : 'all boxes',
      note:
        groupId && this.config.boxId?.trim()
          ? 'FIREWALLA_BOX_ID is not applied: an explicit group takes precedence over it.'
          : undefined,
    });
  }

  /**
   * One box's daily series. GET /v2/trends/{kind} takes no box, so it gives
   * only the days: the account-wide series' points, so the days match the
   * unscoped series. Each day that overlaps `period` is then counted with one
   * grouped GET /v2/alarms (or /v2/flows with status:blocked) over
   * ts:<day start>-<next day start - 1>, to `now` for the current day,
   * scoped with box.id; its row for the box is the day's count, 0 when the
   * box has no row. Measured 2026-09-25, a trend point equals that query's
   * rows summed over the boxes. 1 + days requests, at most
   * BOX_TREND_CONCURRENCY at a time.
   */
  private async boxDailyTrend(
    kind: 'flows' | 'alarms',
    period: TrendPeriod,
    now: number,
    gid: string
  ): Promise<TrendSeries> {
    const days = await this.fetchTrend(kind);
    const endpoint = kind === 'alarms' ? '/v2/alarms' : '/v2/flows';
    // The API has no `block` qualifier; status:blocked selects blocked flows
    const filter = kind === 'flows' ? 'status:blocked ' : '';
    const series = selectTrendDays(days, period, now, {
      source: `GET ${endpoint} groupBy=box per day`,
      scope: `box ${gid}`,
    });
    const nextStart = new Map(
      days.map((day, i) => [day.ts, days[i + 1]?.ts] as const)
    );
    const counts = await mapWithConcurrency(
      series.results,
      BOX_TREND_CONCURRENCY,
      async day => {
        const next = nextStart.get(day.ts);
        // The current day ends when its count is requested, not when the
        // series started, so alarms raised meanwhile are counted, but never
        // after the day itself ends (the account's day can roll over while
        // the counts run). max: a clock behind the API's would end the current
        // day before it starts
        const end = Math.max(
          day.ts,
          next !== undefined
            ? next - 1
            : Math.min(Math.floor(Date.now() / 1000), day.ts + DAY_SECONDS - 1)
        );
        const { groups, exact } = await this.countMatching(
          endpoint,
          `${filter}ts:${day.ts}-${end}`,
          'box',
          gid
        );
        return { ts: day.ts, value: groups.get(gid) ?? 0, exact };
      }
    );
    const inexact = counts.filter(day => !day.exact).length;
    const notes = [
      `GET /v2/trends/${kind} takes no box, so it gave the days and each day is counted for box ${gid} with one GET ${endpoint}?query=${filter}ts:<day start>-<next day start - 1> box.id:${gid}&groupBy=box (the current day up to now): 1 + ${counts.length} requests.`,
    ];
    if (inexact > 0) {
      notes.push(
        `On ${inexact} of the ${counts.length} days the API sent items rather than grouped counts, so those days count only the first page and are lower bounds.`
      );
    }
    return {
      ...series,
      results: counts.map(({ ts, value }) => ({ ts, value })),
      note: notes.join(' '),
    };
  }

  /**
   * Blocked flows per day from GET /v2/trends/flows, or for one box (`box`,
   * else FIREWALLA_BOX_ID unless `group` is given) counted per day from GET
   * /v2/flows. No tool calls this; it replaced client-side counting of up to
   * 10000 flows.
   * @throws {BoxSelectionError} Both box and group are given, or the box is
   * not a box gid; nothing is requested
   */
  async getFlowTrends(
    period: TrendPeriod = '30d',
    group?: string,
    box?: string
  ): Promise<TrendSeries> {
    try {
      return await this.dailyTrend('flows', period, group, box);
    } catch (error) {
      if (error instanceof BoxSelectionError) {
        throw error;
      }
      logger.error(
        'Error in getFlowTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get flow trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Alarms generated per day from GET /v2/trends/alarms, or for one box
   * (`box`, else FIREWALLA_BOX_ID unless `group` is given) counted per day
   * from GET /v2/alarms
   * @throws {BoxSelectionError} Both box and group are given, or the box is
   * not a box gid; nothing is requested
   */
  async getAlarmTrends(
    period: TrendPeriod = '30d',
    group?: string,
    box?: string
  ): Promise<TrendSeries> {
    try {
      return await this.dailyTrend('alarms', period, group, box);
    } catch (error) {
      if (error instanceof BoxSelectionError) {
        throw error;
      }
      logger.error(
        'Error in getAlarmTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get alarm trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Rules created per day from GET /v2/trends/rules. Measured 2026-09-25,
   * that endpoint answered 400 with an empty body, with and without `group`,
   * while the alarm and flow trends answered 200. On a 400 the days are
   * counted from the creation times (`ts`) of the rules GET /v2/rules
   * returns, per UTC day, and the series says so.
   */
  async getRuleTrends(
    period: TrendPeriod = '30d',
    group?: string
  ): Promise<TrendSeries> {
    const validated = validTrendPeriod(period);
    const now = Math.floor(Date.now() / 1000);
    const groupId = group?.trim() || undefined;
    try {
      let points: Trend[];
      let source = 'GET /v2/trends/rules';
      let scope = groupId ? `box group ${groupId}` : 'all boxes';
      let note: string | undefined;
      try {
        points = await this.fetchTrend('rules', groupId);
      } catch (error) {
        if (!(
          error instanceof Error && error.message.startsWith('Bad Request')
        )) {
          throw error;
        }
        points = await this.ruleCreationsPerDay(now, groupId);
        source = 'GET /v2/rules';
        if (!groupId && this.config.boxId) {
          scope = `box ${this.config.boxId}`;
        }
        note =
          'GET /v2/trends/rules answered 400, so each day counts the rules in GET /v2/rules whose creation time (ts) falls in it, by UTC day. Rules deleted since are not counted.';
        if (groupId && this.config.boxId) {
          note +=
            ' FIREWALLA_BOX_ID is not applied: an explicit group takes precedence over it.';
        }
      }
      return selectTrendDays(points, validated, now, { source, scope, note });
    } catch (error) {
      logger.error(
        'Error in getRuleTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get rule trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Rules created on each of the last 30 UTC days (today last), from the
   * creation times of the rules GET /v2/rules returns. With `group`, only
   * rules for that box group or for a box in it; without, scoped to
   * FIREWALLA_BOX_ID. An explicit group takes precedence over
   * FIREWALLA_BOX_ID, as in getAlarmTrends: filtering the group's rules to
   * one box as well counted only that box while the scope said the group.
   */
  private async ruleCreationsPerDay(
    now: number,
    group?: string
  ): Promise<Trend[]> {
    const query = group ? undefined : this.addBoxFilter(undefined);
    const [rules, boxes] = await Promise.all([
      this.request<{ results?: Array<Record<string, unknown>> }>(
        'GET',
        '/v2/rules',
        query ? { query } : {}
      ),
      group ? this.getBoxes(group) : Promise.resolve(undefined),
    ]);
    const groupGids = boxes
      ? new Set(boxes.results.map(box => box.gid))
      : undefined;
    const first =
      Math.floor(now / DAY_SECONDS) * DAY_SECONDS -
      (TREND_DAYS - 1) * DAY_SECONDS;
    const counts: number[] = new Array(TREND_DAYS).fill(0);
    for (const rule of Array.isArray(rules?.results) ? rules.results : []) {
      if (
        groupGids &&
        rule.group !== group &&
        !groupGids.has(String(rule.gid))
      ) {
        continue;
      }
      const ts = Number(rule.ts);
      if (Number.isFinite(ts) && ts >= first && ts <= now) {
        counts[Math.floor((ts - first) / DAY_SECONDS)]++;
      }
    }
    return counts.map((value, i) => ({ ts: first + i * DAY_SECONDS, value }));
  }

  /**
   * Top boxes by blocked flows or by security alarms, from GET
   * /v2/stats/{type}, with each box's details from GET /v2/boxes. Measured
   * 2026-09-25: topBoxesBySecurityAlarms counted Security Activity (type 1)
   * alarms of the last 30 days, and topBoxesByBlockedFlows summed to within
   * 0.1% of the 30 daily points of /v2/trends/flows.
   */
  async getStatisticsByBox(
    type: BoxStatisticType = 'topBoxesByBlockedFlows',
    group?: string,
    limit?: number
  ): Promise<{
    count: number;
    results: Statistics[];
    next_cursor?: string;
  }> {
    try {
      const params: Record<string, unknown> = {};
      if (group?.trim()) {
        params.group = group.trim();
      }
      if (limit !== undefined) {
        params.limit = limit;
      }
      const [response, boxes] = await Promise.all([
        this.request<unknown>(
          'GET',
          `/v2/stats/${encodeURIComponent(type)}`,
          params
        ),
        this.getBoxes(group?.trim() || undefined),
      ]);
      if (!Array.isArray(response)) {
        throw new Error(
          `Unexpected response from /v2/stats/${type}: expected an array`
        );
      }
      const byGid = new Map(boxes.results.map(box => [box.gid, box]));
      const results: Statistics[] = response
        .filter(
          (item: any) =>
            item &&
            typeof item.value === 'number' &&
            typeof item.meta?.gid === 'string'
        )
        .map((item: any): Statistics => {
          const box = byGid.get(item.meta.gid);
          return {
            meta: {
              mode: box?.mode ?? 'router',
              version: box?.version ?? 'unknown',
              online: box?.online ?? false,
              lastSeen: box?.lastSeen,
              license: box?.license ?? 'unknown',
              publicIP: box?.publicIP ?? 'unknown',
              group: box?.group,
              location: box?.location ?? 'unknown',
              deviceCount: box?.deviceCount ?? 0,
              ruleCount: box?.ruleCount ?? 0,
              alarmCount: box?.alarmCount ?? 0,
              gid: item.meta.gid,
              name: String(item.meta.name ?? box?.name ?? 'Unknown Box'),
              model: String(item.meta.model ?? box?.model ?? 'unknown'),
            },
            value: item.value,
          };
        });

      return {
        count: results.length,
        results,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getStatisticsByBox:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get statistics by box: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get geographic cache statistics
   */
  getGeographicCacheStats(): GeographicCacheStats {
    return this.geoCache.getStats();
  }

  /**
   * Clear geographic cache
   */
  clearGeographicCache(): void {
    this.geoCache.clear();
  }

  /**
   * Get geographic data for an IP address with caching
   * @param ip - IP address to geolocate
   * @returns GeographicData object or null if lookup fails or IP is private
   */
  private getGeographicData(ip: string): GeographicData | null {
    const normalizedIP = normalizeIP(ip);
    if (!normalizedIP) {
      return null;
    }

    // Check cache first
    const cached = this.geoCache.get(normalizedIP);
    if (cached !== undefined) {
      return cached;
    }

    // Get fresh data and cache it
    const geoData = getGeographicDataForIP(normalizedIP);
    this.geoCache.set(normalizedIP, geoData);
    return geoData;
  }

  /**
   * Set field value in object using dot notation
   * @param obj - Object to modify
   * @param fieldPath - Dot notation path (e.g., 'destination.geo')
   * @param value - Value to set
   */
  private setFieldValue(obj: any, fieldPath: string, value: any): void {
    const keys = fieldPath.split('.');
    const lastKey = keys.pop();
    if (!lastKey) {
      return;
    }

    let current = obj;
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[lastKey] = value;
  }

  /**
   * Generic method to enrich object with geographic data based on IP paths
   * @param obj - Object to enrich
   * @param ipPaths - Array of dot notation paths to IP fields (optional, defaults to common flow/alarm paths)
   * @returns Enriched object with geographic data
   */
  private enrichWithGeographicData(obj: any, ipPaths?: string[]): any {
    const enriched = { ...obj };
    const processedIPs = new Set<string>();

    // Ensure ipPaths is always an array, with default paths for common flow/alarm fields
    const defaultPaths = [
      'source.ip',
      'destination.ip',
      'src.ip',
      'dst.ip',
      'remote.ip',
      'device.ip',
      'local.ip',
      'peer.ip',
    ];
    const pathsArray = ipPaths
      ? Array.isArray(ipPaths)
        ? ipPaths
        : [ipPaths]
      : defaultPaths;

    for (const path of pathsArray) {
      const ip = this.extractFieldValue(obj, path);
      if (ip && typeof ip === 'string' && !processedIPs.has(ip)) {
        processedIPs.add(ip);
        const geoData = this.getGeographicData(ip);
        if (geoData) {
          const pathParts = path.split('.');
          const geoPath = [...pathParts.slice(0, -1), 'geo'].join('.');
          this.setFieldValue(enriched, geoPath, geoData);
        }
      }
    }

    return enriched;
  }

  /**
   * Backward compatibility method for alarm enrichment
   * @param alarm - Alarm object to enrich
   * @returns Enriched alarm with geographic data
   */
  enrichAlarmWithGeographicData(alarm: any): any {
    return this.enrichWithGeographicData(alarm, [
      'src.ip',
      'dst.ip',
      'remote.ip',
      'device.ip',
    ]);
  }

  // Advanced Search Methods

  /**
   * Advanced search for network flows with complex query syntax
   * Supports: severity:high AND source_ip:192.168.* NOT resolved:true
   */
  async searchFlows(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Flow>> {
    const startTime = Date.now();

    // Simplified: just use the query as provided, add box filter only if needed
    const params: Record<string, unknown> = {
      limit: searchQuery.limit || 200, // Use API default
      // The API's sortBy; timestamp: and bytes: are sent as ts: and total:
      sortBy: translateSortBy(searchQuery.sort_by || 'ts:desc', 'flows'),
    };

    // group_by is not sent as groupBy: a grouped response has one item of
    // totals per group, with no ts or gid, and groupBy=device,category names
    // the device only by id (measured 2026-09-25). Callers such as
    // getFlowInsights group these per-flow results themselves.
    if (searchQuery.cursor) {
      params.cursor = searchQuery.cursor;
    }

    // The query, time range and blocked filter, ANDed in the API's grammar
    // (a space: the API has no AND). blocked: and bytes: are rejected by
    // /v2/flows (see getFlowData) and are translated first.
    let timeQuery: string | undefined;
    if (options.time_range) {
      const startTs =
        typeof options.time_range.start === 'string'
          ? Math.floor(new Date(options.time_range.start).getTime() / 1000)
          : options.time_range.start;
      const endTs =
        typeof options.time_range.end === 'string'
          ? Math.floor(new Date(options.time_range.end).getTime() / 1000)
          : options.time_range.end;

      timeQuery = `ts:${startTs}-${endTs}`;
    }

    // The API has no `block` qualifier and answers `block:false` with no
    // results; `-status:blocked` excludes blocked flows
    const unblocked =
      options.include_resolved === false ? '-status:blocked' : undefined;

    params.query = this.addBoxFilter(
      mspAnd(
        translateToMspQualifiers(searchQuery.query?.trim() ?? '', 'flows'),
        timeQuery,
        unblocked
      ) || undefined
    );

    const response = await this.requestPages<any>(
      '/v2/flows',
      params,
      Number(params.limit)
    );

    // Defensive programming: ensure results is an array before mapping
    const resultsList = Array.isArray(response.results) ? response.results : [];
    const flows = resultsList.map((item: any): Flow => {
      const parseTimestamp = (ts: any): number => {
        if (!ts) {
          return Math.floor(Date.now() / 1000);
        }
        if (typeof ts === 'number') {
          return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
        }
        if (typeof ts === 'string') {
          const parsed = Date.parse(ts);
          return Math.floor(parsed / 1000);
        }
        return Math.floor(Date.now() / 1000);
      };

      const flow: Flow = {
        ts: parseTimestamp(item.ts || item.timestamp),
        gid: item.gid || this.config.boxId,
        protocol: item.protocol || 'tcp',
        direction: item.direction || 'outbound',
        block: Boolean(item.block || item.blocked),
        ...flowBytes(item),
        duration: item.duration || 0,
        count: item.count || item.packets || 1,
        device: {
          id:
            item.device?.id !== null && item.device?.id !== undefined
              ? String(item.device.id)
              : 'unknown',
          ip: item.device?.ip || item.srcIP || 'unknown',
          name: item.device?.name || 'Unknown Device',
        },
      };

      if (item.blockType) {
        flow.blockType = item.blockType;
      }
      if (item.device?.network) {
        flow.device.network = item.device.network;
      }
      if (item.source) {
        flow.source = item.source;
      }
      if (item.destination) {
        flow.destination = item.destination;
      }
      if (item.region) {
        flow.region = item.region;
      }
      if (item.country) {
        flow.country = item.country;
      }
      if (item.category) {
        flow.category = item.category;
      }
      // getFlowInsights groups by it; empty for flows to a bare IP
      if (item.domain) {
        flow.domain = item.domain;
      }
      if (item.network) {
        flow.network = { id: item.network.id, name: item.network.name };
      }

      return flow;
    });

    // Enrich flows with geographic data
    const enrichedFlows = flows.map(flow =>
      this.enrichWithGeographicData(flow, ['destination.ip', 'source.ip'])
    );

    return {
      count: response.count || enrichedFlows.length,
      results: enrichedFlows,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: [], // Simplified without query parsing
      },
    };
  }

  /**
   * Advanced search for security alarms with severity, time, and IP filters
   */
  async searchAlarms(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Alarm>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'timestamp:desc';

      const params: Record<string, unknown> = {
        // source_ip: is not an alarm qualifier (see getActiveAlarms)
        query: translateToMspQualifiers(optimizedQuery, 'alarms'),
        limit,
        sortBy,
      };

      // group_by is not sent as groupBy: a grouped response has one
      // { type, count } item per group (measured 2026-09-25), which the
      // alarm mapping below cannot read
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application with validation
      if (options.include_resolved === false) {
        params.query = mspAnd(params.query as string, 'status:1');
      }

      // Build request parameters for GET endpoint
      // Use the standard /v2/alarms endpoint with query parameter
      const requestParams: Record<string, unknown> = {
        limit,
      };

      // Add box.id filter to query for proper filtering
      if (params.query) {
        params.query = this.addBoxFilter(params.query as string);
      } else {
        params.query = this.addBoxFilter();
      }

      // Only include query if it's meaningful
      if (params.query && params.query !== 'undefined') {
        requestParams.query = params.query;
      }

      // Send timestamp: as the documented ts:
      if (params.sortBy) {
        requestParams.sortBy = translateSortBy(
          params.sortBy as string,
          'alarms'
        );
      }

      // Only include cursor if present
      if (params.cursor) {
        requestParams.cursor = params.cursor;
      }

      // Log parameters for debugging
      logger.info(
        'searchAlarms: Making GET request with params:',
        requestParams
      );

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.requestPages<any>(
          '/v2/alarms',
          requestParams,
          Number(requestParams.limit)
        );
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search alarms API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced alarm transformation with comprehensive validation
      const alarms = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): Alarm => {
          // Enhanced data validation and extraction
          const ts =
            item.ts && typeof item.ts === 'number' && item.ts > 0
              ? item.ts
              : Math.floor(Date.now() / 1000);

          const gid =
            item.gid && typeof item.gid === 'string' && item.gid.trim()
              ? item.gid.trim()
              : this.config.boxId;

          const aid =
            item.aid !== undefined &&
            item.aid !== null &&
            typeof item.aid === 'number'
              ? item.aid
              : 0;

          const type =
            item.type && typeof item.type === 'number' && item.type > 0
              ? item.type
              : 1;

          const status =
            item.status && typeof item.status === 'number' ? item.status : 1;

          const message =
            item.message &&
            typeof item.message === 'string' &&
            item.message.trim()
              ? item.message.trim()
              : 'Unknown alarm';

          const direction =
            item.direction &&
            typeof item.direction === 'string' &&
            item.direction.trim()
              ? item.direction.trim()
              : 'inbound';

          const protocol =
            item.protocol &&
            typeof item.protocol === 'string' &&
            item.protocol.trim()
              ? item.protocol.trim()
              : 'tcp';

          const alarm: Alarm = {
            ts,
            gid,
            aid,
            type,
            status,
            message,
            direction,
            protocol,
          };

          // Conditionally add optional properties with validation
          if (item.device && typeof item.device === 'object') {
            alarm.device = item.device;
          }
          if (item.remote && typeof item.remote === 'object') {
            alarm.remote = item.remote;
          }
          if (item.transfer && typeof item.transfer === 'object') {
            alarm.transfer = item.transfer;
          }
          if (item.dataPlan && typeof item.dataPlan === 'object') {
            alarm.dataPlan = item.dataPlan;
          }
          if (item.vpn && typeof item.vpn === 'object') {
            alarm.vpn = item.vpn;
          }
          if (
            item.port &&
            (typeof item.port === 'number' || typeof item.port === 'string')
          ) {
            alarm.port = item.port;
          }
          if (item.wan && typeof item.wan === 'object') {
            alarm.wan = item.wan;
          }

          return alarm;
        })
        .filter(alarm => alarm.gid && alarm.gid !== 'unknown'); // Filter out invalid alarms

      // Enrich alarms with geographic data
      const enrichedAlarms = alarms.map(alarm =>
        this.enrichWithGeographicData(alarm, ['remote.ip'])
      );

      return {
        count: response.count || enrichedAlarms.length,
        results: enrichedAlarms,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchAlarms:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search alarms: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for firewall rules with target, action, and status filters
   */
  async searchRules(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<NetworkRule>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'timestamp:desc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application with validation
      if (
        options.min_hits &&
        typeof options.min_hits === 'number' &&
        options.min_hits > 0
      ) {
        const minHits = Math.max(1, Math.floor(options.min_hits));
        params.query = mspAnd(params.query as string, `hit.count:>=${minHits}`);
      }

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.request<{
          count: number;
          results: any[];
          next_cursor?: string;
          aggregations?: any;
        }>('GET', `/v2/rules`, params);
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search rules API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced rule transformation with comprehensive validation
      const rules = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): NetworkRule => {
          // Enhanced data validation and extraction
          const id =
            item.id && typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `rule_${Math.random().toString(36).substr(2, 9)}`;

          const action =
            item.action && typeof item.action === 'string' && item.action.trim()
              ? item.action.trim()
              : 'block';

          const direction =
            item.direction &&
            typeof item.direction === 'string' &&
            item.direction.trim()
              ? item.direction.trim()
              : 'bidirection';

          const gid =
            item.gid && typeof item.gid === 'string' && item.gid.trim()
              ? item.gid.trim()
              : this.config.boxId;

          const ts =
            item.ts && typeof item.ts === 'number' && item.ts > 0
              ? item.ts
              : Math.floor(Date.now() / 1000);

          const updateTs =
            item.updateTs &&
            typeof item.updateTs === 'number' &&
            item.updateTs > 0
              ? item.updateTs
              : ts;

          // Enhanced target validation
          const target = {
            type:
              item.target?.type &&
              typeof item.target.type === 'string' &&
              item.target.type.trim()
                ? item.target.type.trim()
                : 'ip',
            value:
              item.target?.value &&
              typeof item.target.value === 'string' &&
              item.target.value.trim()
                ? item.target.value.trim()
                : 'unknown',
            dnsOnly: item.target?.dnsOnly
              ? Boolean(item.target.dnsOnly)
              : undefined,
            port: item.target?.port ? item.target.port : undefined,
          };

          const rule: NetworkRule = {
            id,
            action,
            target,
            direction,
            gid,
            ts,
            updateTs,
          };

          // Conditionally add optional properties with validation
          if (item.group && typeof item.group === 'object') {
            rule.group = item.group;
          }
          if (item.scope && typeof item.scope === 'object') {
            rule.scope = item.scope;
          }
          if (
            item.notes &&
            typeof item.notes === 'string' &&
            item.notes.trim()
          ) {
            rule.notes = item.notes.trim();
          }
          if (
            item.status &&
            typeof item.status === 'string' &&
            item.status.trim()
          ) {
            rule.status = item.status.trim();
          }
          if (item.hit && typeof item.hit === 'object') {
            rule.hit = {
              count:
                item.hit.count && typeof item.hit.count === 'number'
                  ? Math.max(0, item.hit.count)
                  : 0,
              lastHitTs:
                item.hit.lastHitTs && typeof item.hit.lastHitTs === 'number'
                  ? item.hit.lastHitTs
                  : 0,
              statsResetTs:
                item.hit.statsResetTs &&
                typeof item.hit.statsResetTs === 'number'
                  ? item.hit.statsResetTs
                  : undefined,
            };
          }
          if (item.schedule && typeof item.schedule === 'object') {
            rule.schedule = item.schedule;
          }
          if (item.timeUsage && typeof item.timeUsage === 'object') {
            rule.timeUsage = item.timeUsage;
          }
          if (
            item.protocol &&
            typeof item.protocol === 'string' &&
            item.protocol.trim()
          ) {
            rule.protocol = item.protocol.trim();
          }
          if (
            item.resumeTs &&
            typeof item.resumeTs === 'number' &&
            item.resumeTs > 0
          ) {
            rule.resumeTs = item.resumeTs;
          }

          return rule;
        })
        .filter(
          rule =>
            rule.id &&
            rule.id !== 'unknown' &&
            rule.target.value &&
            rule.target.value !== 'unknown'
        ); // Filter out invalid rules

      return {
        count: response.count || rules.length,
        results: rules,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for network devices with network, status, and usage filters
   */
  async searchDevices(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Device>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling; formatQueryForAPI throws
      // on invalid syntax
      let parsed;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // GET /v2/devices takes only `box` and `group`, and answers query,
      // limit and sortBy with every device (measured 2026-09-25), so the
      // query is matched and the limit applied on the client below
      const params = this.deviceBoxParams(options.box);

      // Enhanced filter application with validation
      const clientQuery =
        options.include_resolved === false
          ? `(${trimmedQuery}) AND online:true`
          : trimmedQuery;

      // Enhanced API request with better error handling
      let response;
      try {
        // Use correct device endpoint (devices don't have search endpoint)
        const endpoint = `/v2/devices`;

        // Device endpoint returns direct array, not search result object
        const deviceArray = await this.request<any[]>('GET', endpoint, params);

        // Apply client-side filtering since devices don't support search queries
        let filteredDevices = deviceArray || [];

        if (searchQuery.query?.trim()) {
          const query = clientQuery.toLowerCase();
          filteredDevices = filteredDevices.filter(device => {
            if (!device) {
              return false;
            }

            // Device field extraction
            const name = device.name?.toLowerCase() || '';
            const ip = device.ip?.toLowerCase() || '';
            const macVendor = device.macVendor?.toLowerCase() || '';
            const id = device.id?.toLowerCase() || '';
            // MSP device ids are `mac:<address>` for devices identified by MAC
            const mac =
              device.mac?.toLowerCase() ||
              (id.startsWith('mac:') ? id.slice(4) : '');
            const gid = device.gid?.toLowerCase() || '';
            const networkName = device.network?.name?.toLowerCase() || '';
            const groupName = device.group?.name?.toLowerCase() || '';
            const isOnline = Boolean(
              device.online || device.isOnline || device.connected
            );

            // `ip:`, `mac:` and `gid:` take an exact value or a `*` wildcard
            // (172.16.2.*, AA:BB:*)
            const matchesPattern = (
              value: string,
              pattern: string
            ): boolean => {
              if (!pattern.includes('*')) {
                return value === pattern;
              }
              const escaped = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
              return new RegExp(`^${escaped}$`).test(value);
            };
            const matchesText = (text: string): boolean =>
              name.includes(text) ||
              mac.includes(text) ||
              ip.includes(text) ||
              macVendor.includes(text) ||
              id.includes(text);

            // Match one `field:value` term; matchesQuery evaluates AND, OR,
            // NOT and parentheses between terms
            const matchesTerm = (term: string): boolean => {
              const fieldTerm = /^([\w.]+):(.*)$/.exec(term);
              if (!fieldTerm) {
                return matchesText(unquoteQueryValue(term));
              }
              const [, field, rawValue] = fieldTerm;
              const value = unquoteQueryValue(rawValue);

              switch (field) {
                case 'ip':
                  return matchesPattern(ip, value);
                case 'mac':
                  return matchesPattern(mac, value);
                case 'gid':
                  return matchesPattern(gid, value);
                case 'mac_vendor':
                  return macVendor.includes(value);
                case 'name':
                  return name.includes(value.replace(/\*/g, ''));
                case 'network.name':
                  return networkName.includes(value.replace(/\*/g, ''));
                case 'group.name':
                  return groupName.includes(value.replace(/\*/g, ''));
                case 'online':
                  if (value === 'true') {
                    return isOnline;
                  } else if (value === 'false') {
                    return !isOnline;
                  }
                  return true; // Unknown online value, let it pass
                default:
                  // Fallback: search the whole term in all text fields
                  return matchesText(term);
              }
            };

            return matchesQuery(query, matchesTerm);
          });
        }

        // Apply limit if specified
        if (searchQuery.limit && searchQuery.limit > 0) {
          filteredDevices = filteredDevices.slice(0, searchQuery.limit);
        }

        // Transform to search result format for compatibility
        response = {
          count: filteredDevices.length,
          results: filteredDevices,
          next_cursor: undefined,
          aggregations: undefined,
        };
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search devices API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced device transformation with comprehensive validation
      const devices = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any) => {
          try {
            return this.transformDevice(item);
          } catch (transformError) {
            logger.debugNamespace('api', 'Failed to transform device', {
              error: transformError,
              item,
            });
            return null;
          }
        })
        .filter(
          (device): device is Device =>
            device !== null &&
            Boolean(device.id) &&
            device.id !== 'unknown' &&
            Boolean(device.name) &&
            device.name !== 'Unknown Device'
        ); // Filter out invalid devices

      return {
        count: response.count || devices.length,
        results: devices,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchDevices:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search devices: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for target lists with category and ownership filters
   */
  async searchTargetLists(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<TargetList>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'name:asc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application for target-specific options
      if (
        options.min_targets &&
        typeof options.min_targets === 'number' &&
        options.min_targets > 0
      ) {
        const minTargets = Math.max(1, Math.floor(options.min_targets));
        params.query = [params.query, `targets.length:>=${minTargets}`]
          .filter(Boolean)
          .join(' ');
      }

      if (options.categories && Array.isArray(options.categories)) {
        const validCategories = options.categories.filter(
          cat => typeof cat === 'string' && cat.trim()
        );
        if (validCategories.length > 0) {
          const categoryFilter = `category:${validCategories.join(',')}`;
          params.query = [params.query, categoryFilter]
            .filter(Boolean)
            .join(' ');
        }
      }

      if (options.owners && Array.isArray(options.owners)) {
        const validOwners = options.owners.filter(
          owner => typeof owner === 'string' && owner.trim()
        );
        if (validOwners.length > 0) {
          const ownerFilter = `owner:${validOwners.join(',')}`;
          params.query = [params.query, ownerFilter].filter(Boolean).join(' ');
        }
      }

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.request<{
          count: number;
          results: any[];
          next_cursor?: string;
          aggregations?: any;
        }>('GET', `/v2/target-lists`, params);
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search target lists API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced target list transformation with comprehensive validation
      const targetLists = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): TargetList => {
          // Enhanced data validation and extraction
          const id =
            item.id && typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `list_${Math.random().toString(36).substr(2, 9)}`;

          const name =
            item.name && typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : 'Unknown List';

          const owner =
            item.owner && typeof item.owner === 'string' && item.owner.trim()
              ? item.owner.trim()
              : 'global';

          const targets = Array.isArray(item.targets)
            ? item.targets.filter(
                (target: any) =>
                  target &&
                  (typeof target === 'string' || typeof target === 'object')
              )
            : [];

          const lastUpdated =
            item.lastUpdated &&
            typeof item.lastUpdated === 'number' &&
            item.lastUpdated > 0
              ? item.lastUpdated
              : Math.floor(Date.now() / 1000);

          const targetList: TargetList = {
            id,
            name,
            owner,
            targets,
            lastUpdated,
          };

          // Conditionally add optional properties with validation
          if (
            item.category &&
            typeof item.category === 'string' &&
            item.category.trim()
          ) {
            targetList.category = item.category.trim();
          }
          if (
            item.notes &&
            typeof item.notes === 'string' &&
            item.notes.trim()
          ) {
            targetList.notes = item.notes.trim();
          }

          return targetList;
        })
        .filter(
          targetList =>
            targetList.id &&
            targetList.id !== 'unknown' &&
            targetList.name &&
            targetList.name !== 'Unknown List'
        ); // Filter out invalid target lists

      return {
        count: response.count || targetLists.length,
        results: targetLists,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchTargetLists:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search target lists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Multi-entity searches with correlation across different data types
   * Enhanced with proper entity type handling
   */
  async searchCrossReference(
    primaryQuery: SearchQuery,
    secondaryQueries: Record<string, SearchQuery>,
    correlationField: string,
    options: SearchOptions = {},
    primaryEntityType: 'flows' | 'alarms' | 'rules' | 'devices' = 'flows'
  ): Promise<CrossReferenceResult> {
    try {
      // Execute primary search with specified entity type
      const primary = await this.executeSearchByEntityType(
        primaryEntityType,
        primaryQuery,
        options
      );

      // Extract correlation values from primary results
      const correlationValues = new Set<string>();
      primary.results.forEach(result => {
        const value = this.extractFieldValue(result, correlationField);
        if (value) {
          correlationValues.add(String(value));
        }
      });

      // Execute secondary searches with correlation filter
      const secondary: Record<string, SearchResult<any>> = {};

      for (const [name, query] of Object.entries(secondaryQueries)) {
        if (correlationValues.size === 0) {
          secondary[name] = {
            count: 0,
            results: [],
            metadata: { execution_time: 0, cached: false, filters_applied: [] },
          };
          continue;
        }

        // Add correlation filter to secondary query
        const correlationFilter = `${correlationField}:(${Array.from(correlationValues).join(',')})`;
        const enhancedQuery: SearchQuery = {
          ...query,
          query: query.query
            ? `${query.query} AND ${correlationFilter}`
            : correlationFilter,
        };

        // Infer secondary entity type from query name or default to flows
        const secondaryEntityType = this.inferEntityTypeFromName(name);

        // Execute appropriate search based on entity type
        secondary[name] = await this.executeSearchByEntityType(
          secondaryEntityType,
          enhancedQuery,
          options
        );
      }

      // Calculate correlation statistics
      const totalSecondaryResults = Object.values(secondary).reduce(
        (sum, result) => sum + result.count,
        0
      );
      const correlationStrength =
        correlationValues.size > 0
          ? totalSecondaryResults / correlationValues.size
          : 0;

      return {
        primary,
        secondary,
        correlations: {
          correlation_field: correlationField,
          correlated_count: totalSecondaryResults,
          correlation_strength: Math.min(1, correlationStrength / 10), // Normalize to 0-1
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchCrossReference:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to search cross reference: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute search based on entity type
   */
  private async executeSearchByEntityType(
    entityType: 'flows' | 'alarms' | 'rules' | 'devices',
    query: SearchQuery,
    options: SearchOptions
  ): Promise<SearchResult<any>> {
    switch (entityType) {
      case 'flows':
        return this.searchFlows(query, options);
      case 'alarms':
        return this.searchAlarms(query, options);
      case 'rules':
        return this.searchRules(query, options);
      case 'devices':
        return this.searchDevices(query, options);
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /**
   * Infer entity type from query name (fallback for backward compatibility)
   */
  private inferEntityTypeFromName(
    name: string
  ): 'flows' | 'alarms' | 'rules' | 'devices' {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('alarm')) {
      return 'alarms';
    } else if (lowerName.includes('rule')) {
      return 'rules';
    } else if (lowerName.includes('device')) {
      return 'devices';
    }
    return 'flows'; // Default fallback
  }

  /**
   * Get overview statistics and counts of network rules by category
   */
  async getNetworkRulesSummary(
    activeOnly: boolean = true,
    ruleType?: string
  ): Promise<{ count: number; results: any[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      if (typeof activeOnly !== 'boolean') {
        throw new Error('activeOnly parameter must be a boolean');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error(
          'ruleType parameter must be a non-empty string if provided'
        );
      }

      // Sanitize ruleType to prevent injection
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 1,
          results: [
            {
              total_rules: 0,
              by_action: {},
              by_target_type: {},
              by_direction: {},
              active_rules: 0,
              paused_rules: 0,
              rules_with_hits: 0,
            },
          ],
        };
      }

      // Filter rules based on parameters with enhanced safety
      let filteredRules = rules.results.filter(
        rule => rule && typeof rule === 'object'
      );

      if (activeOnly) {
        filteredRules = filteredRules.filter(rule => {
          const { status } = rule;
          return status === 'active' || !status || status === undefined;
        });
      }

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Generate summary statistics by category with enhanced safety
      const summary = {
        total_rules: filteredRules.length,
        by_action: {} as Record<string, number>,
        by_target_type: {} as Record<string, number>,
        by_direction: {} as Record<string, number>,
        active_rules: 0,
        paused_rules: 0,
        rules_with_hits: 0,
      };

      // Safe counting with comprehensive validation
      filteredRules.forEach(rule => {
        if (!rule || typeof rule !== 'object') {
          return;
        }

        // Count by action with validation
        const action =
          rule.action && typeof rule.action === 'string'
            ? rule.action
            : 'unknown';
        summary.by_action[action] = (summary.by_action[action] || 0) + 1;

        // Count by target type with validation
        const targetType =
          rule.target?.type && typeof rule.target.type === 'string'
            ? rule.target.type
            : 'unknown';
        summary.by_target_type[targetType] =
          (summary.by_target_type[targetType] || 0) + 1;

        // Count by direction with validation
        const direction =
          rule.direction && typeof rule.direction === 'string'
            ? rule.direction
            : 'bidirection';
        summary.by_direction[direction] =
          (summary.by_direction[direction] || 0) + 1;

        // Count by status with validation
        const { status } = rule;
        if (status === 'active' || !status || status === undefined) {
          summary.active_rules++;
        } else if (status === 'paused') {
          summary.paused_rules++;
        }

        // Count rules with hits with validation
        const hitCount = rule.hit?.count;
        if (typeof hitCount === 'number' && hitCount > 0) {
          summary.rules_with_hits++;
        }
      });

      return {
        count: 1,
        results: [summary],
      };
    } catch (error) {
      logger.error(
        'Error in getNetworkRulesSummary:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with more specific error types
      if (error instanceof TypeError) {
        throw new Error(
          `Data type error in network rules summary: ${error.message}`
        );
      } else if (error instanceof RangeError) {
        throw new Error(
          `Range error in network rules summary: ${error.message}`
        );
      }
      throw new Error(
        `Failed to get network rules summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get rules with highest hit counts for traffic analysis
   */
  async getMostActiveRules(
    limit: number = 20,
    minHits: number = 1,
    ruleType?: string
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    try {
      // Comprehensive input validation and sanitization
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
      ) {
        throw new Error('limit must be a positive integer between 1 and 1000');
      }

      if (
        typeof minHits !== 'number' ||
        !Number.isInteger(minHits) ||
        minHits < 0
      ) {
        throw new Error('minHits must be a non-negative integer');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error('ruleType must be a non-empty string if provided');
      }

      // Sanitize inputs to prevent injection
      const sanitizedLimit = Math.max(Math.floor(limit), 1); // Remove artificial cap
      const sanitizedMinHits = Math.max(Math.floor(minHits), 0);
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 0,
          results: [],
        };
      }

      // Filter and sort rules by hit count with enhanced safety
      let filteredRules = rules.results.filter(
        rule => rule && typeof rule === 'object'
      );

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Filter by minimum hits with comprehensive validation
      filteredRules = filteredRules.filter(rule => {
        if (!rule || typeof rule !== 'object') {
          return false;
        }
        const hitCount = rule.hit?.count;
        if (typeof hitCount !== 'number' || !Number.isFinite(hitCount)) {
          return sanitizedMinHits === 0;
        }
        return hitCount >= sanitizedMinHits;
      });

      // Sort by hit count (descending) with safe comparison
      filteredRules.sort((a, b) => {
        const aHits =
          a?.hit?.count &&
          typeof a.hit.count === 'number' &&
          Number.isFinite(a.hit.count)
            ? a.hit.count
            : 0;
        const bHits =
          b?.hit?.count &&
          typeof b.hit.count === 'number' &&
          Number.isFinite(b.hit.count)
            ? b.hit.count
            : 0;
        return bHits - aHits;
      });

      // Apply limit with bounds checking
      const results = filteredRules.slice(0, sanitizedLimit);

      // Validate results before returning
      const validatedResults = results.filter(rule => {
        return rule && typeof rule === 'object' && rule.id;
      });

      return {
        count: validatedResults.length,
        results: validatedResults,
      };
    } catch (error) {
      logger.error(
        'Error in getMostActiveRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with specific error types
      if (error instanceof TypeError) {
        throw new Error(
          `Data type error in most active rules: ${error.message}`
        );
      } else if (error instanceof RangeError) {
        throw new Error(`Range error in most active rules: ${error.message}`);
      }
      throw new Error(
        `Failed to get most active rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get recently created or modified firewall rules
   */
  async getRecentRules(
    hours: number = 24,
    includeModified: boolean = true,
    limit: number = 30,
    ruleType?: string
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    try {
      // Comprehensive input validation and sanitization
      if (
        typeof hours !== 'number' ||
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 168
      ) {
        throw new Error(
          'hours must be a positive number between 0 and 168 (7 days)'
        );
      }

      if (typeof includeModified !== 'boolean') {
        throw new Error('includeModified must be a boolean');
      }

      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
      ) {
        throw new Error('limit must be a positive integer between 1 and 1000');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error('ruleType must be a non-empty string if provided');
      }

      // Sanitize inputs to prevent issues
      const sanitizedHours = Math.min(Math.max(hours, 0.1), 168); // Min 6 minutes, max 7 days
      const sanitizedLimit = Math.max(Math.floor(limit), 1); // Remove artificial cap
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 0,
          results: [],
        };
      }

      // Safe timestamp calculation with overflow protection
      const now = Date.now();
      if (!Number.isFinite(now) || now <= 0) {
        throw new Error('Invalid current timestamp');
      }

      const cutoffTime = Math.floor(now / 1000) - sanitizedHours * 3600;

      // Validate cutoff time
      if (!Number.isFinite(cutoffTime) || cutoffTime < 0) {
        throw new Error('Invalid cutoff time calculation');
      }

      // Filter rules by creation/modification time with enhanced safety
      let filteredRules = rules.results.filter(rule => {
        if (!rule || typeof rule !== 'object') {
          return false;
        }

        const createdTime = rule.ts;
        const updatedTime = rule.updateTs;

        // Validate timestamps
        const validCreatedTime =
          typeof createdTime === 'number' &&
          Number.isFinite(createdTime) &&
          createdTime >= 0
            ? createdTime
            : 0;
        const validUpdatedTime =
          typeof updatedTime === 'number' &&
          Number.isFinite(updatedTime) &&
          updatedTime >= 0
            ? updatedTime
            : 0;

        // Include if created recently
        if (validCreatedTime >= cutoffTime) {
          return true;
        }

        // Include if modified recently (if includeModified is true)
        if (includeModified && validUpdatedTime >= cutoffTime) {
          return true;
        }

        return false;
      });

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Sort by most recent first with enhanced safety
      filteredRules.sort((a, b) => {
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
          return 0;
        }

        const aCreated =
          typeof a.ts === 'number' && Number.isFinite(a.ts) ? a.ts : 0;
        const aUpdated =
          typeof a.updateTs === 'number' && Number.isFinite(a.updateTs)
            ? a.updateTs
            : 0;
        const bCreated =
          typeof b.ts === 'number' && Number.isFinite(b.ts) ? b.ts : 0;
        const bUpdated =
          typeof b.updateTs === 'number' && Number.isFinite(b.updateTs)
            ? b.updateTs
            : 0;

        const aTime = Math.max(aCreated, aUpdated);
        const bTime = Math.max(bCreated, bUpdated);

        return bTime - aTime;
      });

      // Apply limit with bounds checking
      const results = filteredRules.slice(0, sanitizedLimit);

      // Validate results before returning
      const validatedResults = results.filter(rule => {
        return rule && typeof rule === 'object' && rule.id;
      });

      return {
        count: validatedResults.length,
        results: validatedResults,
      };
    } catch (error) {
      logger.error(
        'Error in getRecentRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with specific error types
      if (error instanceof TypeError) {
        throw new Error(`Data type error in recent rules: ${error.message}`);
      } else if (error instanceof RangeError) {
        throw new Error(`Range error in recent rules: ${error.message}`);
      } else if (error instanceof ReferenceError) {
        throw new Error(`Reference error in recent rules: ${error.message}`);
      }
      throw new Error(
        `Failed to get recent rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Pause a firewall rule until it is resumed.
   *
   * Sends `POST /v2/rules/{id}/pause` with no body, as the MSP API documents.
   * The endpoint takes no duration: on 2026-09-25 a `duration` in the body or
   * the query string was accepted and ignored, the rule showed no `resumeTs`,
   * and it stayed paused until `resumeRule`.
   *
   * @param ruleId - The rule ID, e.g. `<box gid>:<n>` as `get_network_rules` returns it
   * @returns Promise resolving to operation result with success status and message
   * @throws {Error} If rule ID is invalid or API request fails
   * @example
   * ```typescript
   * const result = await client.pauseRule('rule-123');
   * console.log(result.message); // "Rule rule-123 paused until resumed"
   * ```
   */
  async pauseRule(
    ruleId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Enhanced input validation and sanitization
      const validatedRuleId = this.sanitizeInput(ruleId);
      if (!validatedRuleId) {
        throw new Error('Invalid rule ID provided');
      }

      // The API answers 200 with the JSON string "ok"
      const response = await this.request<{
        success?: boolean;
        message?: string;
      }>('POST', `/v2/rules/${validatedRuleId}/pause`, {}, undefined, false);
      this.invalidateRuleCache();

      return {
        success: response?.success ?? true, // Default to true if API doesn't return success field
        message:
          response?.message || `Rule ${validatedRuleId} paused until resumed`,
      };
    } catch (error) {
      logger.error(
        'Error in pauseRule:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Resume a paused firewall rule, restoring it to active state.
   *
   * Sends `POST /v2/rules/{id}/resume` with no body, as the MSP API documents.
   *
   * @param ruleId - The unique identifier of the rule to resume
   * @returns Promise resolving to operation result with success status and message
   * @throws {Error} If rule ID is invalid or API request fails
   * @example
   * ```typescript
   * const result = await client.resumeRule('rule-123');
   * console.log(result.message); // "Rule rule-123 resumed successfully"
   * ```
   */
  async resumeRule(
    ruleId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Enhanced input validation and sanitization
      const validatedRuleId = this.sanitizeInput(ruleId);
      if (!validatedRuleId) {
        throw new Error('Invalid rule ID provided');
      }

      // The API answers 200 with the JSON string "ok"
      const response = await this.request<{
        success?: boolean;
        message?: string;
      }>('POST', `/v2/rules/${validatedRuleId}/resume`, {}, undefined, false);
      this.invalidateRuleCache();

      return {
        success: response?.success ?? true, // Default to true if API doesn't return success field
        message:
          response?.message || `Rule ${validatedRuleId} resumed successfully`,
      };
    } catch (error) {
      logger.error(
        'Error in resumeRule:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Helper method to build the query for an array-based geographic filter:
   * one comma list, the MSP API's OR within a field (it has no OR keyword
   * and no parentheses)
   *
   * @param fieldName - The field name for the query (e.g., 'country', 'region')
   * @param values - Array of values any of which may match
   * @returns Query string or null if values array is empty
   * @private
   */
  private buildArrayFilterQuery(
    fieldName: string,
    values?: string[]
  ): string | null {
    if (!values || values.length === 0) {
      return null;
    }

    return `${fieldName}:${values.map(mspValue).join(',')}`;
  }

  /**
   * Helper method to add box.id qualifier to search queries
   *
   * @param query - Existing query string (optional)
   * @param box - Box gid to scope to instead of FIREWALLA_BOX_ID (optional)
   * @returns Query string with box.id filter added, or just box.id filter if no query
   * @throws {MspQueryError} When the query has no form the MSP API can run,
   *   or names a box other than the one it is scoped to
   * @private
   */
  private addBoxFilter(query?: string, box?: string): string | undefined {
    const gid = box?.trim() || this.config.boxId;
    if (!gid) {
      return query;
    }
    if (!isValidBoxGid(gid)) {
      throw new BoxSelectionError(INVALID_BOX_GID);
    }

    // Translated before the box is added: appended to `type:1 OR type:10`,
    // box.id would bind to type:10 alone. A query naming another box is
    // refused: the API would read the two box.id terms as either box.
    return mspBoxScope(query, gid);
  }

  /**
   * Parameters that scope GET /v2/devices to one box: the `box` a caller
   * names, else FIREWALLA_BOX_ID. The endpoint documents only `box` and
   * `group` and ignores `query`: measured 2026-09-25, `query=box.id:<gid>`
   * returned both boxes' 224 devices and `box=<gid>` returned that box's 190.
   * A `group` (box group ID) is sent as well when given.
   */
  private deviceBoxParams(
    box?: string,
    group?: string
  ): Record<string, unknown> {
    const gid = box?.trim() || this.config.boxId;
    const params: Record<string, unknown> = gid ? { box: gid } : {};
    // The endpoint's other documented parameter: a box group ID
    if (group?.trim()) {
      params.group = group.trim();
    }
    return params;
  }

  /**
   * Build geographic query string from filters for Firewalla API
   *
   * Converts geographic filter objects into API-compatible query syntax.
   * Supports countries, continents, regions, cities, ASNs, hosting providers,
   * and boolean exclusion filters.
   *
   * @param filters - Geographic filter configuration
   * @returns Query string compatible with Firewalla API
   */
  buildGeoQuery(filters: {
    countries?: string[];
    continents?: string[];
    regions?: string[];
    cities?: string[];
    asns?: string[];
    hosting_providers?: string[];
    exclude_cloud?: boolean;
    exclude_vpn?: boolean;
    min_risk_score?: number;
    high_risk_countries?: boolean;
    exclude_known_providers?: boolean;
    threat_analysis?: boolean;
  }): string {
    const queryParts: string[] = [];

    // Define filter configurations in a data-driven approach
    const filterConfigs = {
      // Array filters
      arrayFilters: [
        { field: 'country', values: filters.countries },
        { field: 'continent', values: filters.continents },
        { field: 'region', values: filters.regions },
        { field: 'city', values: filters.cities },
        { field: 'asn', values: filters.asns },
        { field: 'hosting_provider', values: filters.hosting_providers },
      ],
      // Boolean filters
      booleanFilters: [
        {
          condition: filters.exclude_cloud === true,
          query: '-is_cloud_provider:true',
        },
        { condition: filters.exclude_vpn === true, query: '-is_vpn:true' },
        {
          condition: filters.high_risk_countries === true,
          query: 'geographic_risk_score:>=7',
        },
        {
          // The API grammar cannot exclude a wildcard (-hosting_provider:*)
          condition: filters.exclude_known_providers === true,
          query: '-is_cloud_provider:true',
        },
      ],
    };

    // Process array filters
    filterConfigs.arrayFilters.forEach(({ field, values }) => {
      const query = this.buildArrayFilterQuery(field, values);
      if (query) {
        queryParts.push(query);
      }
    });

    // Process boolean filters
    filterConfigs.booleanFilters.forEach(({ condition, query }) => {
      if (condition) {
        queryParts.push(query);
      }
    });

    // Process numeric filters
    if (
      filters.min_risk_score !== undefined &&
      typeof filters.min_risk_score === 'number' &&
      filters.min_risk_score >= 0
    ) {
      queryParts.push(`geographic_risk_score:>=${filters.min_risk_score}`);
    }

    // Note: threat_analysis is handled by the API server, not as a query filter

    // A space ANDs terms: the API has no AND keyword
    return mspAnd(...queryParts);
  }

  /**
   * Extract field value from object using dot notation
   */
  private extractFieldValue(obj: any, fieldPath: string): any {
    if (!fieldPath || typeof fieldPath !== 'string') {
      logger.warn('extractFieldValue called with invalid fieldPath:', {
        fieldPath,
      });
      return undefined;
    }
    return fieldPath.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Extract and validate string values with optional allowed values
   */
  private extractValidString(
    value: any,
    defaultValue: string,
    allowedValues?: string[]
  ): string {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return defaultValue;
    }

    const trimmedValue = value.trim();

    if (allowedValues && allowedValues.length > 0) {
      return allowedValues.includes(trimmedValue) ? trimmedValue : defaultValue;
    }

    return trimmedValue;
  }

  /**
   * An endpoint with a `?query=` for /v2/alarms, /v2/flows or /v2/rules
   * rewritten into the MSP API's grammar, as request() sends its params
   *
   * @throws {MspQueryError} When the query has no form the API can run
   */
  private withMspQueryInUrl(endpoint: string): string {
    const separator = endpoint.indexOf('?');
    if (separator < 0) {
      return endpoint;
    }
    const path = endpoint.slice(0, separator);
    const search = new URLSearchParams(endpoint.slice(separator + 1));
    const query = search.get('query');
    if (!MSP_QUERY_ENDPOINTS.has(path) || query === null) {
      return endpoint;
    }
    const translated = toMspQuery(query);
    if (translated === query) {
      return endpoint;
    }
    if (translated) {
      search.set('query', translated);
    } else {
      search.delete('query');
    }
    const rest = search.toString();
    return rest ? `${path}?${rest}` : path;
  }

  /**
   * Public method for making raw API calls
   * Used by management tools for bulk operations
   */
  async makeApiCall(
    method: 'get' | 'post' | 'patch' | 'delete',
    endpoint: string,
    data?: any
  ): Promise<any> {
    try {
      let response;
      switch (method) {
        case 'get':
          response = await this.api.get(this.withMspQueryInUrl(endpoint));
          break;
        case 'post':
          response = await this.api.post(endpoint, data || {});
          break;
        case 'patch':
          response = await this.api.patch(endpoint, data || {});
          break;
        case 'delete':
          response = await this.api.delete(endpoint);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
      return response.data;
    } catch (error) {
      logger.error(`API call failed: ${method} ${endpoint}`, error as Error);
      throw error;
    } finally {
      if (method !== 'get') {
        this.clearCache();
      }
    }
  }

  /**
   * Get flow insights with category-based analysis
   * This provides category breakdowns and bandwidth analysis for networks with high flow volumes
   */
  async getFlowInsights(
    period: '1h' | '24h' | '7d' | '30d' = '24h',
    options?: {
      categories?: string[];
      includeBlocked?: boolean;
    }
  ): Promise<{
    period: string;
    categoryBreakdown: Array<{
      category: string;
      count: number;
      bytes: number;
      topDomains: Array<{ domain: string; count: number; bytes: number }>;
    }>;
    topDevices: Array<{
      device: string;
      totalBytes: number;
      categories: Array<{ category: string; bytes: number }>;
    }>;
    blockedSummary?: {
      totalBlocked: number;
      byCategory: Array<{ category: string; count: number }>;
    };
  }> {
    try {
      // Calculate time range
      const end = Math.floor(Date.now() / 1000);
      let begin: number;
      switch (period) {
        case '1h':
          begin = end - 3600;
          break;
        case '24h':
          begin = end - 24 * 3600;
          break;
        case '7d':
          begin = end - 7 * 24 * 3600;
          break;
        case '30d':
          begin = end - 30 * 24 * 3600;
          break;
      }

      // Get category breakdown with error handling. The categories are one
      // comma list (the API has no OR or parentheses); an empty list means
      // all categories
      const categoryQuery = mspAnd(
        `ts:${begin}-${end}`,
        options?.categories?.length
          ? `category:${options.categories.map(mspValue).join(',')}`
          : undefined
      );

      let categoryData;
      try {
        categoryData = await this.searchFlows({
          query: categoryQuery,
          group_by: 'category,domain',
          sort_by: 'bytes:desc',
          limit: 500,
        });
      } catch (error) {
        logger.error(
          'Failed to get category data in getFlowInsights:',
          error instanceof Error ? error : new Error(String(error))
        );
        categoryData = { results: [], count: 0 };
      }

      // Process category breakdown
      const categoryMap = new Map<
        string,
        {
          count: number;
          bytes: number;
          domains: Map<string, { count: number; bytes: number }>;
        }
      >();

      categoryData.results.forEach((item: any) => {
        const category = flowCategory(item);
        const domain = item.domain || 'unknown';

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            count: 0,
            bytes: 0,
            domains: new Map(),
          });
        }

        const cat = categoryMap.get(category)!;
        cat.count += item.count || 1;
        cat.bytes += item.bytes || 0;

        if (!cat.domains.has(domain)) {
          cat.domains.set(domain, { count: 0, bytes: 0 });
        }
        const dom = cat.domains.get(domain)!;
        dom.count += item.count || 1;
        dom.bytes += item.bytes || 0;
      });

      // Get top devices by bandwidth with error handling
      let deviceData;
      try {
        deviceData = await this.searchFlows({
          query: `ts:${begin}-${end}`,
          group_by: 'device,category',
          sort_by: 'bytes:desc',
          limit: 200,
        });
      } catch (error) {
        logger.error(
          'Failed to get device data in getFlowInsights:',
          error instanceof Error ? error : new Error(String(error))
        );
        deviceData = { results: [], count: 0 };
      }

      // Process device data
      const deviceMap = new Map<
        string,
        {
          totalBytes: number;
          categories: Map<string, number>;
        }
      >();

      deviceData.results.forEach((item: any) => {
        const deviceName = item.device?.name || item.device?.ip || 'unknown';
        const category = flowCategory(item);

        if (!deviceMap.has(deviceName)) {
          deviceMap.set(deviceName, {
            totalBytes: 0,
            categories: new Map(),
          });
        }

        const dev = deviceMap.get(deviceName)!;
        dev.totalBytes += item.bytes || 0;

        if (!dev.categories.has(category)) {
          dev.categories.set(category, 0);
        }
        dev.categories.set(
          category,
          (dev.categories.get(category) || 0) + (item.bytes || 0)
        );
      });

      // Get blocked flows summary if requested with error handling
      let blockedSummary;
      if (options?.includeBlocked) {
        try {
          const blockedData = await this.searchFlows({
            query: `ts:${begin}-${end} status:blocked`,
            group_by: 'category',
            sort_by: 'count:desc',
            limit: 50,
          });

          blockedSummary = {
            totalBlocked: blockedData.count,
            byCategory: blockedData.results.map((item: any) => ({
              category: flowCategory(item),
              count: item.count || 0,
            })),
          };
        } catch (error) {
          logger.error(
            'Failed to get blocked data in getFlowInsights:',
            error instanceof Error ? error : new Error(String(error))
          );
          blockedSummary = {
            totalBlocked: 0,
            byCategory: [],
          };
        }
      }

      // Format results
      const categoryBreakdown = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          count: data.count,
          bytes: data.bytes,
          topDomains: Array.from(data.domains.entries())
            .map(([domain, stats]) => ({ domain, ...stats }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 5),
        }))
        .sort((a, b) => b.bytes - a.bytes);

      const topDevices = Array.from(deviceMap.entries())
        .map(([device, data]) => ({
          device,
          totalBytes: data.totalBytes,
          categories: Array.from(data.categories.entries())
            .map(([category, bytes]) => ({ category, bytes }))
            .sort((a, b) => b.bytes - a.bytes),
        }))
        .sort((a, b) => b.totalBytes - a.totalBytes)
        .slice(0, 10);

      return {
        period,
        categoryBreakdown,
        topDevices,
        blockedSummary,
      };
    } catch (error) {
      logger.error('Error in getFlowInsights:', error as Error);
      throw error instanceof Error
        ? error
        : new Error('Failed to get flow insights');
    }
  }
}
