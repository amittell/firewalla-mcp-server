/**
 * @fileoverview Entry counts of target lists as the MSP API reports them,
 * and the client-side evaluation of target list search queries
 */
/**
 * The number of entries in a target list: the length of its `targets` when
 * the API sent them, else the API's `count`, else null (not reported).
 *
 * Measured 2026-09-25: GET /v2/target-lists returned 13 Firewalla-managed
 * lists, each with a numeric `count` (from 1 to 5,968,164) and no `targets`,
 * and GET /v2/target-lists/{id} returned the same `count` and no `targets`.
 * Counting `targets` alone reported every one of them as empty.
 *
 * @param list - A target list as the API returned it
 * @returns The entry count, or null when the API reported none
 */
export declare function targetListEntryCount(list: unknown): number | null;
/**
 * The entries of a target list, at most `max` of them, or null when the API
 * did not send them (it sends none for Firewalla-managed lists)
 *
 * @param list - A target list as the API returned it
 * @param max - Most entries to return
 */
export declare function targetListEntries(list: unknown, max: number): unknown[] | null;
/**
 * Whether a target list satisfies a search_target_lists query. The MSP API
 * does not search target lists (GET /v2/target-lists takes only `owner`), so
 * the query is evaluated here, case-insensitively: `name:` and `notes:`
 * match text they contain, `owner:` and `category:` the whole value,
 * `targets:` any one entry, each with `*` wildcards and a comma list for
 * any of several values (`category:social,games`), `target_count:` the
 * entry count (`>n`, `<=n`, `a-b` or `n`) and `last_updated:` the last update
 * time (Unix seconds or a date, with the same comparisons). A term without a
 * field (free text, a word or a quoted phrase) matches text in the name, the
 * notes or an entry.
 *
 * @param list - A target list as the API returned it
 * @param query - Query such as `owner:global AND name:*Block*`
 */
export declare function targetListMatchesQuery(list: unknown, query: string): boolean;
//# sourceMappingURL=target-lists.d.ts.map