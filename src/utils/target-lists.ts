/**
 * @fileoverview Entry counts of target lists as the MSP API reports them,
 * and the client-side evaluation of target list search queries
 */

import { matchesQuery, unquoteQueryValue } from '../search/client-filter.js';

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

/** `value` against `pattern`: equal, or a match of its `*` wildcards */
function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return value === pattern;
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

/**
 * Whether a target list satisfies a search_target_lists query. The MSP API
 * does not search target lists (GET /v2/target-lists takes only `owner`), so
 * the query is evaluated here, case-insensitively: `name:` and `notes:`
 * match text they contain, `owner:` and `category:` the whole value, and
 * `targets:` any one entry, each with `*` wildcards. A term without a field
 * matches the name, the notes or an entry.
 *
 * @param list - A target list as the API returned it
 * @param query - Query such as `owner:global AND name:*Block*`
 */
export function targetListMatchesQuery(list: unknown, query: string): boolean {
  if (!list || typeof list !== 'object') {
    return false;
  }
  const item = list as Record<string, unknown>;
  const text = (value: unknown): string =>
    typeof value === 'string' ? value.toLowerCase() : '';
  const name = text(item.name);
  const notes = text(item.notes);
  const owner = text(item.owner);
  const category = text(item.category);
  const targets = Array.isArray(item.targets) ? item.targets.map(text) : [];

  const contains = (value: string, pattern: string): boolean =>
    pattern.includes('*')
      ? matchesPattern(value, pattern) ||
        value.includes(pattern.replace(/\*/g, ''))
      : value.includes(pattern);
  const matchesText = (value: string): boolean =>
    name.includes(value) ||
    notes.includes(value) ||
    targets.some(target => target.includes(value));

  const matchesTerm = (term: string): boolean => {
    const fieldTerm = /^([\w.]+):(.*)$/.exec(term);
    if (!fieldTerm) {
      return matchesText(unquoteQueryValue(term));
    }
    const [, field, rawValue] = fieldTerm;
    const value = unquoteQueryValue(rawValue);
    switch (field) {
      case 'name':
        return contains(name, value);
      case 'notes':
        return contains(notes, value);
      case 'owner':
        return matchesPattern(owner, value);
      case 'category':
        return matchesPattern(category, value);
      case 'targets':
        return targets.some(target => matchesPattern(target, value));
      default:
        return matchesText(term);
    }
  };

  return matchesQuery(query.toLowerCase(), matchesTerm);
}
