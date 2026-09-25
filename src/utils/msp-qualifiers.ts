/**
 * Rewrites field names the MSP API rejects into the qualifiers it documents,
 * so older queries keep working:
 *
 * - flows: `blocked:true` -> `status:blocked`, `blocked:false` ->
 *   `-status:blocked` (also `block:`, `=` and `1`/`0`), `bytes:` -> `total:`
 * - alarms: `source_ip:` -> `device.ip:`
 *
 * The API answers `blocked:` and `bytes:` on /v2/flows and `source_ip:` on
 * /v2/alarms with 400 "Invalid parameters", and `block:true` matches nothing.
 * Quoted values are left alone.
 */

// Leading context of a term: start of text, whitespace or '('
const BLOCKED_TERM =
  /(^|[\s(])(-?)(?:blocked|block)[:=](true|false|1|0)(?=$|[\s)])/gi;

const TRANSLATIONS: Record<string, Array<(text: string) => string>> = {
  flows: [
    text =>
      text.replace(
        BLOCKED_TERM,
        (_match, lead: string, minus: string, value: string) => {
          const wantsBlocked = /^(true|1)$/i.test(value);
          // `-blocked:false` excludes unblocked flows, so it means blocked
          const exclude = (minus === '-') === wantsBlocked;
          return `${lead}${exclude ? '-' : ''}status:blocked`;
        }
      ),
    text => text.replace(/(^|[\s(])(-?)bytes:/g, '$1$2total:'),
  ],
  alarms: [text => text.replace(/(^|[\s(])(-?)source_ip:/g, '$1$2device.ip:')],
};

// Splits a query into unquoted text (even indexes) and quoted values (odd)
const QUOTED_VALUE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

/**
 * Translates legacy field names in a query into MSP qualifiers
 *
 * @param query - Query as the caller wrote it
 * @param entityType - `flows` or `alarms`; other types pass through unchanged
 * @returns The query with documented MSP qualifiers
 */
export function translateToMspQualifiers(
  query: string,
  entityType: string
): string {
  const translations = TRANSLATIONS[entityType];
  if (!query || typeof query !== 'string' || !translations) {
    return query;
  }
  return query
    .split(QUOTED_VALUE)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : translations.reduce((text, translate) => translate(text), part)
    )
    .join('');
}

/**
 * Sort fields rewritten into the ones the MSP API documents (`ts`, `total`).
 * Measured 2026-09-25: /v2/flows answers `sortBy=timestamp:asc` and
 * `sortBy=bytes:desc` with 400; /v2/alarms sorts `timestamp` like `ts`.
 */
const SORT_FIELDS: Record<string, Map<string, string>> = {
  flows: new Map([
    ['timestamp', 'ts'],
    ['bytes', 'total'],
  ]),
  alarms: new Map([['timestamp', 'ts']]),
};

/**
 * Translates the fields of a `sortBy` value ("timestamp:desc", or a
 * comma-separated list such as "bytes:desc,ts:asc") into MSP sort fields
 *
 * @param sortBy - Sort value as the caller wrote it
 * @param entityType - `flows` or `alarms`; other types pass through unchanged
 * @returns The sort value with documented MSP fields
 */
export function translateSortBy(sortBy: string, entityType: string): string {
  const fields = SORT_FIELDS[entityType];
  if (!sortBy || typeof sortBy !== 'string' || !fields) {
    return sortBy;
  }
  return sortBy
    .split(',')
    .map(term => {
      const [field, ...rest] = term.trim().split(':');
      return [fields.get(field) ?? field, ...rest].join(':');
    })
    .join(',');
}
