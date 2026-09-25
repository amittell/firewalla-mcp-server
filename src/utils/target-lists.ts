/**
 * @fileoverview Entry counts of target lists as the MSP API reports them
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
export function targetListEntryCount(list: unknown): number | null {
  if (!list || typeof list !== 'object') {
    return null;
  }
  const { targets, count } = list as { targets?: unknown; count?: unknown };
  if (Array.isArray(targets)) {
    return targets.length;
  }
  return typeof count === 'number' && Number.isFinite(count) && count >= 0
    ? count
    : null;
}

/**
 * The entries of a target list, at most `max` of them, or null when the API
 * did not send them (it sends none for Firewalla-managed lists)
 *
 * @param list - A target list as the API returned it
 * @param max - Most entries to return
 */
export function targetListEntries(
  list: unknown,
  max: number
): unknown[] | null {
  const targets = (list as { targets?: unknown } | null)?.targets;
  return Array.isArray(targets) ? targets.slice(0, max) : null;
}
