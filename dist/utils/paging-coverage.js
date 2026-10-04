/**
 * What a paged read of /v2/flows covered: the oldest and newest `ts` among
 * the flows the API returned, how many requests it took, and why paging
 * stopped. The API returns the most recent flows first (`ts:desc`) and
 * without a `ts:` qualifier covers only the last 24 hours, so a client needs
 * the oldest `ts` to tell how far back a read looked, and the stop reason to
 * tell whether it saw everything that matched.
 */
/** Unix seconds from an API `ts` (seconds, milliseconds or a date string) */
function toUnixSeconds(ts) {
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
export function pagingCoverage(items, outcome) {
    let oldest;
    let newest;
    for (const item of items) {
        const ts = item && typeof item === 'object'
            ? toUnixSeconds(item.ts)
            : undefined;
        if (ts === undefined) {
            continue;
        }
        oldest = oldest === undefined ? ts : Math.min(oldest, ts);
        newest = newest === undefined ? ts : Math.max(newest, ts);
    }
    const iso = (ts) => ts === undefined ? null : new Date(ts * 1000).toISOString();
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
//# sourceMappingURL=paging-coverage.js.map