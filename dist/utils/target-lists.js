/**
 * @fileoverview Entry counts of target lists as the MSP API reports them,
 * and the client-side evaluation of target list search queries
 */
import { commaListValues, matchesQuery, unquoteQueryValue, } from '../search/client-filter.js';
import { containsText, matchesWildcard } from './wildcard.js';
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
export function targetListEntryCount(list) {
    if (!list || typeof list !== 'object') {
        return null;
    }
    const { targets, count } = list;
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
export function targetListEntries(list, max) {
    const targets = list?.targets;
    return Array.isArray(targets) ? targets.slice(0, max) : null;
}
/** `value` against `pattern`: equal, or a match of its `*` wildcards */
function matchesPattern(value, pattern) {
    if (!pattern.includes('*')) {
        return value === pattern;
    }
    return matchesWildcard(value, pattern);
}
/**
 * `value` against a numeric condition: `>n`, `>=n`, `<n`, `<=n`, `a-b`
 * (inclusive) or `n` (equal). A missing value matches nothing.
 */
function matchesNumber(value, condition) {
    if (value === null) {
        return false;
    }
    const range = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(condition);
    if (range) {
        return value >= Number(range[1]) && value <= Number(range[2]);
    }
    const comparison = /^(>=|<=|>|<)?(\d+(?:\.\d+)?)$/.exec(condition);
    if (!comparison) {
        return false;
    }
    const bound = Number(comparison[2]);
    switch (comparison[1]) {
        case '>':
            return value > bound;
        case '>=':
            return value >= bound;
        case '<':
            return value < bound;
        case '<=':
            return value <= bound;
        default:
            return value === bound;
    }
}
/** Unix seconds from seconds, milliseconds or a date such as 2026-09-01 */
function toUnixSeconds(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1e12 ? value / 1000 : value;
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    if (/^\d+(\.\d+)?$/.test(value)) {
        return toUnixSeconds(Number(value));
    }
    const ms = Date.parse(value.toUpperCase());
    return Number.isNaN(ms) ? null : ms / 1000;
}
/**
 * `lastUpdated` against a time condition: `>t`, `>=t`, `<t`, `<=t` or `t`,
 * where t is Unix seconds or a date (2026-09-01, 2026-09-01T12:00:00Z)
 */
function matchesTime(value, condition) {
    const seconds = toUnixSeconds(value);
    const parsed = /^(>=|<=|>|<)?(.+)$/.exec(condition);
    const bound = parsed ? toUnixSeconds(parsed[2]) : null;
    if (seconds === null || bound === null || !parsed) {
        return false;
    }
    switch (parsed[1]) {
        case '>':
            return seconds > bound;
        case '>=':
            return seconds >= bound;
        case '<':
            return seconds < bound;
        case '<=':
            return seconds <= bound;
        default:
            return seconds === bound;
    }
}
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
export function targetListMatchesQuery(list, query) {
    if (!list || typeof list !== 'object') {
        return false;
    }
    const item = list;
    const text = (value) => typeof value === 'string' ? value.toLowerCase() : '';
    const name = text(item.name);
    const notes = text(item.notes);
    const owner = text(item.owner);
    const category = text(item.category);
    const targets = Array.isArray(item.targets) ? item.targets.map(text) : [];
    const contains = (value, pattern) => pattern.includes('*')
        ? matchesPattern(value, pattern) ||
            value.includes(pattern.replace(/\*/g, ''))
        : value.includes(pattern);
    // An unquoted * in free text is a wildcard (containsText)
    const matchesText = (value, quoted) => [name, notes, ...targets].some(text => containsText(text, value, quoted));
    const matchesTerm = (term) => {
        const fieldTerm = /^([\w.]+):(.*)$/.exec(term);
        if (!fieldTerm) {
            const value = unquoteQueryValue(term);
            return matchesText(value, value !== term);
        }
        const [, field, rawValue] = fieldTerm;
        const value = unquoteQueryValue(rawValue);
        // A comma list matches any of its values, as in the MSP API grammar
        // (category:social,games); it used to be compared as one value
        const values = commaListValues(rawValue);
        switch (field) {
            case 'name':
                return values.some(entry => contains(name, entry));
            case 'notes':
                return values.some(entry => contains(notes, entry));
            case 'owner':
                return values.some(entry => matchesPattern(owner, entry));
            case 'category':
                return values.some(entry => matchesPattern(category, entry));
            case 'targets':
                return targets.some(target => values.some(entry => matchesPattern(target, entry)));
            case 'target_count':
                // The entry count: targets when sent, else the API's `count`
                return matchesNumber(targetListEntryCount(list), value);
            case 'last_updated':
                return matchesTime(item.lastUpdated ?? item.last_updated, value);
            default:
                // The whole term, as literal text
                return matchesText(term, true);
        }
    };
    // Each term is matched in lowercase; the query is not, so AND, OR and NOT
    // stay operators and and, or and not stay words
    return matchesQuery(query, term => matchesTerm(term.toLowerCase()));
}
//# sourceMappingURL=target-lists.js.map