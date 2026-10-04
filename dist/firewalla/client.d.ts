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
import { type FirewallaConfig, type Alarm, type AlarmGroup, type Flow, type FlowGroup, type Device, type BandwidthUsage, type NetworkRule, type RulesTextCoverage, type TargetList, type Box, type FirewallSummary, type SearchResult, type SearchQuery, type SearchOptions, type TrendPeriod, type TrendSeries, type BoxStatisticType, type SecurityMetricsSummary, type SimpleStats, type Statistics, type AccessPoint, type AccessPointChannels, type WifiNetwork, type WifiSettings } from '../types.js';
import { type PagingCoverage } from '../utils/paging-coverage.js';
import { type AlarmMuteRequest } from '../validation/alarm-mute.js';
import { type Clock } from './rate-limit.js';
/**
 * Most responses the client keeps cached when the config gives no
 * cacheMaxEntries (CACHE_MAX_ENTRIES). One client serves every HTTP
 * session, so the cache lives as long as the process.
 */
export declare const DEFAULT_CACHE_MAX_ENTRIES = 1000;
/** Whether `gid` has the shape of a box gid */
export declare function isValidBoxGid(gid: string): boolean;
/**
 * A single-box operation could not pick a box: the account has several and
 * none was named, or the token sees none. Handlers report it as a validation
 * error rather than an API failure.
 */
export declare class BoxSelectionError extends Error {
    constructor(message: string);
}
/** The alarm an alarm write acted on, and the API's answer */
export interface AlarmActionResult {
    gid: string;
    aid: string;
    /** The alarm as GET /v2/alarms/{gid}/{aid} returned it before the action */
    alarm: Record<string, any>;
    /**
     * The API's answer to the POST or DELETE. The official docs show no
     * response body; a DELETE answered {"message":"success","success":true}
     * (measured 2026-09-26).
     */
    response: unknown;
}
/**
 * The MSP API answered HTTP 403. The message says which box the request
 * named, when it named one, and how to list the boxes the token can access.
 */
export declare class ForbiddenError extends Error {
    constructor(message: string);
}
/**
 * A request to the MSP API failed. `status` is the HTTP status the API
 * answered, undefined when no answer came; `code` is axios's error code
 * (ECONNABORTED for a request whose timeout ran out, ECONNRESET, ...);
 * `attempts` is how many times the request went to the API, a 429's
 * retries and a transient failure's retry included (0 when it was never
 * sent), as counted in coverage.api_requests. Code that reacts to a failure
 * reads these, not the message.
 */
export declare class ApiRequestError extends Error {
    readonly status?: number | undefined;
    readonly code?: string | undefined;
    readonly attempts: number;
    constructor(message: string, status?: number | undefined, code?: string | undefined, attempts?: number);
}
/**
 * The alarm is not on the box it was looked for on, or on any box when each
 * box was checked: every GET of it answered 404 (status 404). Thrown by the
 * alarm writes and by getSpecificAlarm.
 */
export declare class AlarmNotFoundError extends ApiRequestError {
    constructor(message: string, attempts?: number);
}
/**
 * A write (POST, PUT, PATCH or DELETE) that was sent and got no HTTP
 * status (its timeout ran out, or the connection dropped, after the request
 * went out), or got 504 from a gateway that stopped waiting for the API
 * (`status` 504). Firewalla may have applied it, so it is not reported as a
 * failure, which a caller could answer by sending it again. The message
 * says the outcome is unknown and names `check`, the read that shows
 * whether it was applied (checkingReadTool); `failure` is what request()
 * would have said of it ("Firewalla API sent no answer (ECONNRESET: socket
 * hang up)").
 */
export declare class WriteOutcomeUnknownError extends ApiRequestError {
    readonly failure: string;
    readonly check?: string | undefined;
    readonly writeState = "unknown";
    constructor(message: string, code: string | undefined, attempts: number, failure: string, check?: string | undefined, status?: number);
}
/** Times a GET is sent again after a failure that can pass (see retryTransient) */
export declare const MAX_TRANSIENT_RETRIES = 1;
/** The wait before a GET is sent again: this, plus up to as much again at random */
export declare const TRANSIENT_RETRY_DELAY_MS = 1000;
/**
 * The read tool that shows whether a write to `url` was applied, named in the
 * error of a tool that gave up with the write sent and not answered
 */
export declare function checkingReadTool(url: string | undefined): string | undefined;
/**
 * One read's requests: sent to the API (a 429's retries and a transient
 * failure's retry included), and answered from the cache
 */
export interface RequestTrace {
    sent: number;
    cached: number;
    /**
     * The read's query, as its caller gave it, compares `ts` with a time
     * relative to now (`ts:>1h`), so its pages are not cached (see request).
     * A caller that turns the relative time into seconds before calling sets
     * this, since the client then sees only seconds.
     */
    relativeTime?: boolean;
}
/**
 * A RequestTrace for a read of `query` as its caller gave it, before any
 * translation: it notes a relative time (`ts:>1h`), which mspAnd and
 * translateRelativeTimestamps turn into seconds before the client sees it
 */
export declare function readTrace(query?: string): RequestTrace;
/**
 * The message for an HTTP 403 from the MSP API. Measured 2026-09-25: a box
 * gid the token cannot access, whether wrong, malformed or another
 * account's, gets 403 {"error":{"title":"Forbidden","message":"You are not
 * allowed to access this resource","type":"FORBIDDEN"}} from
 * GET /v2/devices?box=<gid> and GET /v2/alarms/<gid>/<aid>, while a known
 * box with an unknown alarm id gets 404. The message used to blame the MSP
 * subscription. It does not quote the gid: handlers match "404" and
 * "not found" in error messages, and a gid can contain either.
 *
 * A 403 to a request that changes state (anything but a GET) may also come
 * from a read-only token: Firewalla said on 2026-09-08 that MSP 2.12 adds
 * read-only API tokens. What the API answers a read-only token's write is
 * not measured here, so the message says the token may be read-only, not
 * that it is.
 */
export declare function forbiddenMessage(error: {
    config?: {
        url?: string;
        method?: string;
        params?: unknown;
        data?: unknown;
    };
    response?: {
        data?: unknown;
    };
}): string;
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
export declare class FirewallaClient {
    private config;
    private readonly clock;
    /** @private Axios instance configured for Firewalla MSP API access */
    private api;
    /**
     * @private In-memory cache for API responses, least recently used first:
     * a Map iterates in insertion order, and a read inserts its entry again
     */
    private cache;
    /** @private Most entries `cache` holds; see setCache */
    private readonly cacheMaxEntries;
    /** @private When the next cache write drops the expired entries */
    private nextCacheSweepAt;
    /**
     * @private No cache entry expires before this: the earliest expiry at the
     * last sweep, lowered by each write. Entries removed since only make the
     * true earliest later, so a full cache is swept only once an entry may
     * have expired.
     */
    private earliestCacheExpiry;
    /** @private Geographic cache for IP geolocation lookups */
    private geoCache;
    /** @private Paces every request through `api` to `config.rateLimit` per 5 minutes */
    private readonly rateLimiter;
    /**
     * Creates a new Firewalla API client instance
     *
     * @param config - Configuration object containing MSP credentials and settings
     * @param clock - Time and waiting for rate limiting; tests pass their own
     * @throws {Error} If configuration is invalid or authentication fails
     */
    constructor(config: FirewallaConfig, clock?: Clock);
    /**
     * Sets up Axios request and response interceptors for logging and error handling
     *
     * Configures interceptors to:
     * - Hold each request until the rate limiter has a slot for it, or refuse
     *   it when the slot is more than RATE_LIMIT_MAX_WAIT_MS away
     * - Log all API requests and responses for debugging
     * - Pause on a 429 and retry a GET (see retryRateLimited)
     * - Send a GET again once after a timeout, a dropped connection or a
     *   502, 503 or 504 (see retryTransient)
     * - Transform HTTP error codes into meaningful error messages
     * - Handle authentication and authorization failures
     * - Provide specific guidance for common error scenarios
     *
     * @private
     * @returns {void}
     */
    private setupInterceptors;
    /**
     * Whether a failed request is a GET that retryTransient sends again: it
     * failed in a way that can pass (isTransientFailure) and has not been
     * sent again for that yet. A POST, PUT, PATCH or DELETE is never sent
     * again: the API may have applied it before the answer was lost.
     */
    private canRetryTransient;
    /**
     * Whether a GET sent again could still answer before its tool gives up
     * (toolDeadline): from when it could start, after the longest wait before
     * it (2 x TRANSIENT_RETRY_DELAY_MS) or when the rate limiter next has a
     * slot, whichever is later, as long again as the attempt that failed took
     * must be left. A retry that could not answer in time would still cost one
     * of the API's 100 requests per 5 minutes. An attempt that ran out its
     * timeout took API_TIMEOUT, so with the defaults (API_TIMEOUT and the tool
     * timeout both 30 s) a timed-out GET is never sent again, while a 503 or a
     * reset that comes back at once is, and a 503 that took 20 s is not. The
     * request interceptor checks again when the retry would take its slot and
     * when it would go out (retryFits), as other requests or a 429 pause can
     * move its slot later. Measured with Date.now(), the clock the tool's
     * deadline is set with.
     */
    private retryFitsToolBudget;
    /**
     * Whether a retry starting in `waitMs` could answer before its tool gives
     * up: more than its retryEstimateMs must be left before toolDeadline then.
     * Always true for a request that is not a transient retry.
     */
    private retryFits;
    /**
     * Sends a GET again after TRANSIENT_RETRY_DELAY_MS plus up to as much
     * again at random. It goes through the request interceptor like any
     * request, so the rate limiter releases it and `onSent` counts it in the
     * read's RequestTrace. When the rate limiter refuses it or the tool gives
     * up first, it is never sent, and the failure it was for is thrown instead.
     *
     * @private
     */
    private retryTransient;
    /**
     * Answers a 429. The API counts every request made with the token (measured
     * on one token; per token or per account was not measured), so every
     * request of this client is paused until the API's window ends (see
     * rateLimitPauseMs). A
     * GET is then sent again through the rate limiter, at most
     * MAX_RATE_LIMIT_RETRIES times, and only when the pause ends before the
     * request's deadline (RATE_LIMIT_MAX_WAIT_MS after it was first made). A
     * write is never sent again. Otherwise the 429 is thrown as a
     * RateLimitError saying when capacity returns.
     *
     * @private
     */
    private retryRateLimited;
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
    private getCacheKey;
    /**
     * Retrieves data from cache if available and not expired
     *
     * @template T - The expected return type
     * @param key - Cache key to look up
     * @returns Cached data if available and valid, otherwise null
     * @private
     */
    private getFromCache;
    /**
     * Caches `data` for `ttlSeconds`, else CACHE_TTL. The cache holds at most
     * cacheMaxEntries: when it is full, the expired entries go first, then the
     * least recently used; the entry written is never one of them. A full
     * cache is swept for expired entries only when one may have expired
     * (earliestCacheExpiry): a scan on every write cost 1.9 ms per write at
     * 100,000 entries. Expired entries are also dropped by the first write
     * CACHE_SWEEP_INTERVAL_MS after the last sweep, since an entry nothing
     * reads again is otherwise never removed.
     */
    private setCache;
    /** Drops every expired cache entry, and notes when the next one expires */
    private dropExpiredCache;
    /**
     * Drops every cached `GET /v2/rules` answer. Called after a rule changes
     * state, so the next read (and resume_rule's status check after a pause)
     * sees the new status instead of the cached one.
     */
    private invalidateRuleCache;
    /**
     * Filter parameters for GET requests to /v2/* endpoints to only include allowed scalar fields
     * Fixes issue where complex objects get serialized as [object Object] causing "Bad Request" errors
     */
    private filterParametersForDataEndpoints;
    /**
     * GET up to `limit` results from a /v2 list endpoint, at most
     * MAX_API_PAGE_SIZE per request, following next_cursor. The MSP API answers
     * 400 "limit exceeds max allowed value of 500" to a larger limit on
     * /v2/alarms and /v2/flows. Reports the requests sent to the API (a 429's
     * retries and a transient failure's retry included; a page from the
     * response cache sends none), the pages
     * answered from the cache, and why paging stopped (see PagingStopReason).
     * A next_cursor this read already sent stops it, with no cursor returned:
     * following it would fetch the same page again, and the loop would repeat
     * until `limit` with duplicates.
     *
     * @param trace - Counts this read's requests; one passed in keeps its
     *   earlier counts, and api_requests and cached_pages are its totals
     */
    private requestPages;
    /**
     * @param trace - Counts the GET's sends to the API and its cache answers
     */
    private request;
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
    getActiveAlarms(query?: string, groupBy?: string, sortBy?: string, limit?: number, cursor?: string, force_refresh?: boolean, trace?: RequestTrace): Promise<{
        count: number;
        results: Alarm[];
        next_cursor?: string;
        groups?: AlarmGroup[];
        group_by?: string;
        /** The query sent, after the renames, the box scope and toMspQuery */
        query?: string;
    }>;
    /**
     * Get flows from GET /v2/flows
     *
     * @param groupBy - Optional fields to group by (e.g., 'category',
     *   'device', 'category,domain'). The API then returns groups, not flows:
     *   the result has `groups` and `group_by`, and empty `results`.
     * @param trace - Counts the read's requests; see requestPages
     * @returns flows with `coverage`: the oldest and newest `ts` returned, the
     *   requests made and why paging stopped (no coverage for groups)
     */
    getFlowData(query?: string, groupBy?: string, sortBy?: string, limit?: number, cursor?: string, trace?: RequestTrace): Promise<{
        count: number;
        results: Flow[];
        next_cursor?: string;
        groups?: FlowGroup[];
        group_by?: string;
        coverage?: PagingCoverage;
        /** The query sent, after the renames, the box scope and toMspQuery */
        query?: string;
    }>;
    getDeviceStatus(deviceId?: string, includeOffline?: boolean, limit?: number, cursor?: string, box?: string, group?: string): Promise<{
        count: number;
        results: Device[];
        next_cursor?: string;
        total_count: number;
        has_more: boolean;
    }>;
    private transformDevice;
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
    getBandwidthUsage(period: string, top?: number, box?: string): Promise<{
        count: number;
        results: BandwidthUsage[];
        next_cursor?: string;
    }>;
    /**
     * Rules from GET /v2/rules, the box scope applied
     *
     * @param query - Rule search terms. Free-text words are not sent: the
     *   API matched none (measured 2026-09-26: a word in one of 98 rules'
     *   target value returned 0 rules), so every word must be found here,
     *   case-insensitively, in the rule's name, notes, action, target type or
     *   value, or scope type or value.
     * @param limit - Sent as `limit`, except with words: then every rule the
     *   other terms match is read, and `free_text_coverage` says how many
     *   were checked
     * @throws {MspQueryError} When the query has no form the API can run
     */
    getNetworkRules(query?: string, limit?: number): Promise<{
        count: number;
        results: NetworkRule[];
        next_cursor?: string;
        free_text_coverage?: RulesTextCoverage;
        /** The query sent: the terms other than free text; '' for none */
        query: string;
    }>;
    /**
     * GET /v2/rules for a rule search, which getNetworkRules and searchRules
     * both read rules through. Free-text words are not sent: the API matched
     * none (measured 2026-09-26: a word in one of 98 rules' target value
     * returned 0 rules), so the other terms are sent, in the API's grammar
     * and with the box scope, and the rules that come back are kept when they
     * have every word (ruleMatchesWords).
     *
     * @param query - Rule search terms, in the tools' language or the API's
     * @param params - Other GET parameters
     * @param extraTerm - A term ANDed to the query the API is sent
     * @returns The API's response, the rules that have every word, and
     *   whether there were words (the API's count then does not apply)
     * @throws {MspQueryError} When the query has no form the API can run
     */
    private requestRules;
    /**
     * Get target lists
     *
     * @param _listType - Not sent: GET /v2/target-lists has no list type filter
     * @param limit - Applied on the client; the endpoint takes no `limit`
     * @param owner - The documented `owner` filter: `global`, a box gid, or a
     *   comma-separated list such as `global,<box_gid>`. Without it the API
     *   returns global and Firewalla-managed lists.
     */
    getTargetLists(_listType?: string, limit?: number, owner?: string): Promise<{
        count: number;
        results: TargetList[];
        next_cursor?: string;
        /** Every list the API returned, before limit: it returns all of them */
        total: number;
    }>;
    /**
     * Get a specific target list by ID
     */
    getSpecificTargetList(id: string): Promise<TargetList>;
    /**
     * Create a new target list
     */
    createTargetList(targetListData: {
        name: string;
        owner: string;
        targets: string[];
        category?: string;
        notes?: string;
    }): Promise<TargetList>;
    /**
     * Update an existing target list
     */
    updateTargetList(id: string, updateData: {
        name?: string;
        targets?: string[];
        category?: string;
        notes?: string;
    }): Promise<TargetList>;
    /**
     * Delete a target list
     */
    deleteTargetList(id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * The configured default box for single-box operations: FIREWALLA_BOX_ID,
     * else FIREWALLA_DEFAULT_BOX_ID, if either is set
     */
    getDefaultBoxId(): string | undefined;
    /**
     * The box a single-box operation acts on: the explicit gid, else the
     * configured default (getDefaultBoxId), else the account's only box.
     *
     * @throws {BoxSelectionError} When the account has several boxes and none
     *   was named, or the token sees no boxes
     */
    resolveBoxGid(gid?: string): Promise<string>;
    /**
     * Create a new firewall rule
     *
     * @param ruleData - Rule definition matching the MSP v2 rule data model
     * @param gid - Box the rule applies to. The API applies a rule with no gid
     *   (and no group) to every box in the MSP account, so callers must pass one.
     * @returns The created rule as returned by the API
     */
    createRule(ruleData: {
        action: 'block' | 'allow';
        target: {
            type: string;
            value?: string;
            dnsOnly?: boolean;
        };
        scope?: {
            type: string;
            value: string;
            port?: string;
        };
        direction?: 'bidirection' | 'inbound' | 'outbound';
        protocol?: 'tcp' | 'udp';
        notes?: string;
        schedule?: {
            duration?: number;
            cronTime?: string;
        };
    }, gid: string): Promise<NetworkRule>;
    /**
     * Delete a firewall rule permanently (MSP 2.11.0+)
     *
     * @param ruleId - ID of the rule to delete
     */
    deleteRule(ruleId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Rename a device. The MSP API only allows updating the `name` field
     * (32 characters max); all other fields are ignored by the API.
     *
     * @param deviceId - Device ID (MAC address)
     * @param name - New device name
     * @param gid - Box the device belongs to
     */
    renameDevice(deviceId: string, name: string, gid: string): Promise<Device>;
    /**
     * Firewall status from /v2/boxes plus the 100 most recent flows. Covers the
     * FIREWALLA_BOX_ID box, or every box on the account. The MSP API reports no
     * CPU, memory or uptime figures, so the summary has none.
     */
    getFirewallSummary(): Promise<FirewallSummary>;
    /**
     * Count the alarms or flows matching `query`, split by `groupBy`. Given
     * `groupBy`, /v2/alarms and /v2/flows answer with one row per group
     * carrying the group's `count` and no `ts` (measured 2026-09-25), so the
     * totals are exact however many items match; more groups than one page
     * holds are paged, up to 20 pages. If the rows are items rather than
     * groups, the counts are those of the first page, and `exact` is false when
     * more pages exist. Scoped to `box`, else FIREWALLA_BOX_ID.
     */
    private countMatching;
    /**
     * Security counts for the prompts and firewalla://metrics/security. Every
     * count is an exact total from the API's grouped counts, over the window
     * in `windows`: the API's default windows are 30 days for alarms and 24
     * hours for flows. The threat level comes from Security Activity (type 1)
     * alarms, the type /v2/stats/topBoxesBySecurityAlarms counts; the other
     * types (video, gaming, new device and so on) are routine on most
     * networks. Scoped to FIREWALLA_BOX_ID when it is set.
     */
    getSecurityMetrics(): Promise<SecurityMetricsSummary>;
    getNetworkTopology(): Promise<{
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
    }>;
    getRecentThreats(hours?: number): Promise<Array<{
        timestamp: string;
        /** The alarm type's name, or Blocked Connection for a blocked flow */
        type: string;
        /** The alarm's message; null for a blocked flow */
        message: string | null;
        source_ip: string;
        destination_ip: string;
        /** "alarm raised" for an alarm, "blocked" for a blocked flow */
        action_taken: string;
        /** The alarm's severity as the API sent it; null when it sent none */
        severity: string | null;
    }>>;
    getBoxes(groupId?: string): Promise<{
        count: number;
        results: Box[];
        next_cursor?: string;
    }>;
    getSpecificAlarm(alarmId: string, gid?: string): Promise<{
        count: number;
        results: Alarm[];
        next_cursor?: string;
    }>;
    /**
     * Delete an alarm permanently; it cannot be restored. The box is found as
     * locateAlarmForWrite describes, and the alarm is read first, so an alarm
     * that is not there sends no DELETE. Measured 2026-09-26 on an archived
     * alarm: DELETE /v2/alarms/{gid}/{aid} answered 200
     * {"message":"success","success":true}, a GET of the alarm then answered
     * 404 (still 404 65 s later), and the account's archived alarms counted one
     * fewer. In July 2025 the same request answered success without deleting.
     *
     * @param alarmId - The numeric aid, as a number or a string
     * @param gid - Box the alarm belongs to (the alarm's gid field)
     */
    deleteAlarm(alarmId: string | number, gid?: string): Promise<AlarmActionResult>;
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
    archiveAlarm(alarmId: string | number, gid?: string): Promise<AlarmActionResult>;
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
    muteAlarm(alarmId: string | number, mute: AlarmMuteRequest, gid?: string): Promise<AlarmActionResult & {
        request: AlarmMuteRequest;
    }>;
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
    private locateAlarmForWrite;
    /** GET one alarm without the cache; null when the API answers 404 */
    private findAlarmOnBox;
    /**
     * Send an alarm write for an alarm locateAlarmForWrite found: POST
     * .../archive or .../mute, or DELETE the alarm. Not retried: a request that
     * got no HTTP answer may still have been applied.
     */
    private sendAlarmAction;
    /**
     * Forget cached alarm reads, so an alarm just archived or muted does not
     * show as active for the rest of the cache TTL
     */
    private dropCachedAlarms;
    getSimpleStatistics(group?: string): Promise<{
        count: number;
        results: SimpleStats[];
        next_cursor?: string;
    }>;
    /**
     * Top regions by blocked flows, from GET /v2/stats/topRegionsByBlockedFlows.
     * Measured 2026-09-25: `limit` below 5 is honoured, and a larger `limit`
     * still returned 5 regions.
     */
    getStatisticsByRegion(group?: string, limit?: number): Promise<{
        count: number;
        results: Statistics[];
        next_cursor?: string;
    }>;
    /**
     * GET /v2/trends/{kind}: the number of blocked flows captured, alarms
     * generated or rules created each day. Measured 2026-09-25: 30 points in
     * ascending ts order, one per day, each ts the start of a day in the
     * account's time zone, the last point the current day so far. `group` (a
     * box group ID) scopes it; the endpoint takes no box, so a box-scoped
     * series is counted per day by boxDailyTrend.
     */
    private fetchTrend;
    /**
     * The box a trend is scoped to: `box`, else FIREWALLA_BOX_ID unless a
     * `group` is given (an explicit group takes precedence over the default
     * box), else none. A box and a group together are refused: a box is in one
     * group, so the pair is either redundant or matches nothing.
     * @throws {BoxSelectionError} Both box and group are given, or the box is
     * not a box gid
     */
    private trendBox;
    /**
     * A documented daily trend cut to `period`. The trends API has one point
     * per day, so a period shorter than a day returns the current day so far.
     * With a box in scope (trendBox) each day is counted for that box.
     */
    private dailyTrend;
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
    private boxDailyTrend;
    /**
     * Blocked flows per day from GET /v2/trends/flows, or for one box (`box`,
     * else FIREWALLA_BOX_ID unless `group` is given) counted per day from GET
     * /v2/flows. get_flow_trends calls this.
     * @throws {BoxSelectionError} Both box and group are given, or the box is
     * not a box gid; nothing is requested
     */
    getFlowTrends(period?: TrendPeriod, group?: string, box?: string): Promise<TrendSeries>;
    /**
     * Alarms generated per day from GET /v2/trends/alarms, or for one box
     * (`box`, else FIREWALLA_BOX_ID unless `group` is given) counted per day
     * from GET /v2/alarms
     * @throws {BoxSelectionError} Both box and group are given, or the box is
     * not a box gid; nothing is requested
     */
    getAlarmTrends(period?: TrendPeriod, group?: string, box?: string): Promise<TrendSeries>;
    /**
     * Rules created per day. Without a box in scope, from GET /v2/trends/rules
     * for every box or the box group. Measured 2026-09-25, that endpoint
     * answered 400 with an empty body, with and without `group`, while the
     * alarm and flow trends answered 200; on a 400 each day counts the rules
     * GET /v2/rules returns whose creation time (`ts`) falls in it
     * (ruleCreationTrend), and the series says so. The endpoint takes no box,
     * so with a box in scope (`box`, else FIREWALLA_BOX_ID unless `group` is
     * given, as in getAlarmTrends) the box's rules are counted that way
     * without asking it.
     * @throws {BoxSelectionError} Both box and group are given, or the box is
     * not a box gid; nothing is requested
     */
    getRuleTrends(period?: TrendPeriod, group?: string, box?: string): Promise<TrendSeries>;
    /**
     * Rules created on each day of the account's 30-day series, from the
     * creation times of the rules GET /v2/rules returns. The days are those of
     * GET /v2/trends/alarms (read unscoped, as boxDailyTrend reads them), so
     * they start at the account's local midnight like the alarm and flow
     * trends' days; only if that read fails are they the last 30 UTC days.
     * With `box`, the read is scoped with box.id. With `group`, only rules for
     * that box group or for a box in it are counted; FIREWALLA_BOX_ID is not
     * applied (getRuleTrends resolves the box, and an explicit group takes
     * precedence over it). `days` says, as a sentence tail, which days these
     * are.
     */
    private ruleCreationTrend;
    /**
     * Top boxes by blocked flows or by security alarms, from GET
     * /v2/stats/{type}, with each box's details from GET /v2/boxes. Measured
     * 2026-09-25: topBoxesBySecurityAlarms counted Security Activity (type 1)
     * alarms of the last 30 days, and topBoxesByBlockedFlows summed to within
     * 0.1% of the 30 daily points of /v2/trends/flows.
     */
    getStatisticsByBox(type?: BoxStatisticType, group?: string, limit?: number): Promise<{
        count: number;
        results: Statistics[];
        next_cursor?: string;
    }>;
    clearCache(): void;
    /**
     * Get geographic data for an IP address with caching
     * @param ip - IP address to geolocate
     * @returns GeographicData object or null if lookup fails or IP is private
     */
    private getGeographicData;
    /**
     * Set field value in object using dot notation
     * @param obj - Object to modify
     * @param fieldPath - Dot notation path (e.g., 'destination.geo')
     * @param value - Value to set
     */
    private setFieldValue;
    /**
     * Generic method to enrich object with geographic data based on IP paths
     * @param obj - Object to enrich
     * @param ipPaths - Array of dot notation paths to IP fields (optional, defaults to common flow/alarm paths)
     * @returns Enriched object with geographic data
     */
    private enrichWithGeographicData;
    /**
     * Advanced search for network flows with complex query syntax
     * Supports: severity:high AND source_ip:192.168.* NOT resolved:true
     */
    searchFlows(searchQuery: SearchQuery, options?: SearchOptions): Promise<SearchResult<Flow>>;
    /**
     * Advanced search for network devices with network, status, and usage filters
     */
    searchDevices(searchQuery: SearchQuery, options?: SearchOptions): Promise<SearchResult<Device>>;
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
    pauseRule(ruleId: string): Promise<{
        success: boolean;
        message: string;
    }>;
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
    resumeRule(ruleId: string): Promise<{
        success: boolean;
        message: string;
    }>;
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
    private addBoxFilter;
    /**
     * Parameters that scope GET /v2/devices to one box: the `box` a caller
     * names, else FIREWALLA_BOX_ID. The endpoint documents only `box` and
     * `group` and ignores `query`: measured 2026-09-25, `query=box.id:<gid>`
     * returned both boxes' 224 devices and `box=<gid>` returned that box's 190.
     * A `group` (box group ID) is sent as well when given.
     */
    private deviceBoxParams;
    /**
     * Extract field value from object using dot notation
     */
    private extractFieldValue;
    /**
     * Extract and validate string values with optional allowed values
     */
    private extractValidString;
    /**
     * Get flow insights with category-based analysis
     * This provides category breakdowns and bandwidth analysis for networks with high flow volumes
     */
    getFlowInsights(period?: '1h' | '24h' | '7d' | '30d', options?: {
        categories?: string[];
        includeBlocked?: boolean;
    }): Promise<{
        period: string;
        categoryBreakdown: Array<{
            category: string;
            count: number;
            bytes: number;
            topDomains: Array<{
                domain: string;
                count: number;
                bytes: number;
            }>;
        }>;
        topDevices: Array<{
            device: string;
            totalBytes: number;
            categories: Array<{
                category: string;
                bytes: number;
            }>;
        }>;
        blockedSummary?: {
            totalBlocked: number;
            byCategory: Array<{
                category: string;
                count: number;
            }>;
        };
    }>;
    /**
     * Get list of adopted Firewalla Access Points
     *
     * @param boxId - Optional Firewalla box GID. Falls back to FIREWALLA_BOX_ID or default box.
     * @returns List of AccessPoint objects
     */
    getAccessPoints(boxId?: string): Promise<AccessPoint[]>;
    /**
     * Get Wi-Fi channels and DFS radar status for a specific Access Point
     *
     * @param apId - Access Point ID / MAC address
     * @param boxId - Optional Firewalla box GID. Falls back to FIREWALLA_BOX_ID or default box.
     * @returns Channel information mapped by band (2g, 5g, 6g)
     */
    getAccessPointChannels(apId: string, boxId?: string): Promise<AccessPointChannels>;
    /**
     * Get configured Wi-Fi Networks
     *
     * @param boxId - Optional Firewalla box GID. Falls back to FIREWALLA_BOX_ID or default box.
     * @returns List of configured WifiNetwork objects
     */
    getWifiNetworks(boxId?: string): Promise<WifiNetwork[]>;
    /**
     * Get Firewalla Wi-Fi Controller settings
     *
     * @param boxId - Optional Firewalla box GID. Falls back to FIREWALLA_BOX_ID or default box.
     * @returns WifiSettings object
     */
    getWifiSettings(boxId?: string): Promise<WifiSettings>;
}
//# sourceMappingURL=client.d.ts.map