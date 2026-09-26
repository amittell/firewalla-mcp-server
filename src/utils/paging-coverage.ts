/**
 * What a paged read of /v2/flows covered: the oldest and newest `ts` among
 * the flows the API returned, how many requests it took, and why paging
 * stopped. The API returns the most recent flows first (`ts:desc`) and
 * without a `ts:` qualifier covers only the last 24 hours, so a client needs
 * the oldest `ts` to tell how far back a read looked, and the stop reason to
 * tell whether it saw everything that matched.
 */

/**
 * Why a paged read stopped:
 * - `limit_reached`: it had `limit` items and the API had more (a
 *   `next_cursor`)
 * - `no_more_pages`: the API returned no `next_cursor`
 * - `repeated_cursor`: the API returned a `next_cursor` this read had already
 *   sent; following it would fetch the same page again, so the read stopped
 *   and returns no cursor
 * - `empty_page`: a page came back with no items but with a `next_cursor`
 */
export type PagingStopReason =
  'limit_reached' | 'no_more_pages' | 'repeated_cursor' | 'empty_page';

/** The paging facts of one read, as the client's requestPages reports them */
export interface PagingOutcome {
  /**
   * Requests sent to the API (what counts against its 100 per 5 minutes),
   * 429 retries included; a page answered from the client's response cache
   * sends none
   */
  api_requests: number;
  /** Pages answered from the client's response cache */
  cached_pages: number;
  stopped_reason: PagingStopReason;
}

export interface PagingCoverage extends PagingOutcome {
  /** Unix seconds of the oldest item returned; null when none has a ts */
  oldest_ts: number | null;
  /** Unix seconds of the newest item returned; null when none has a ts */
  newest_ts: number | null;
  /** oldest_ts as an ISO 8601 string */
  oldest: string | null;
  /** newest_ts as an ISO 8601 string */
  newest: string | null;
}

/** Unix seconds from an API `ts` (seconds, milliseconds or a date string) */
function toUnixSeconds(ts: unknown): number | undefined {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    return ts > 1e12 ? ts / 1000 : ts;
  }
  if (typeof ts === 'string' && ts.trim() !== '') {
    const asNumber = Number(ts);
    if (Number.isFinite(asNumber)) {
      return toUnixSeconds(asNumber);
    }
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? undefined : parsed / 1000;
  }
  return undefined;
}

/**
 * The coverage of `items` (raw API items; one without a usable `ts` is
 * skipped, not counted as now) fetched as `outcome` describes
 */
export function pagingCoverage(
  items: unknown[],
  outcome: PagingOutcome
): PagingCoverage {
  let oldest: number | undefined;
  let newest: number | undefined;
  for (const item of items) {
    const ts =
      item && typeof item === 'object'
        ? toUnixSeconds((item as Record<string, unknown>).ts)
        : undefined;
    if (ts === undefined) {
      continue;
    }
    oldest = oldest === undefined ? ts : Math.min(oldest, ts);
    newest = newest === undefined ? ts : Math.max(newest, ts);
  }
  const iso = (ts: number | undefined) =>
    ts === undefined ? null : new Date(ts * 1000).toISOString();
  return {
    oldest_ts: oldest ?? null,
    newest_ts: newest ?? null,
    oldest: iso(oldest),
    newest: iso(newest),
    api_requests: outcome.api_requests,
    cached_pages: outcome.cached_pages,
    stopped_reason: outcome.stopped_reason,
  };
}
