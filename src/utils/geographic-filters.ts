/**
 * @fileoverview search_flows' `geographic_filters` in the MSP API's grammar
 *
 * The flow qualifiers the API documents (docs/firewalla-api-reference.md,
 * "Flow Qualifiers") have one geographic qualifier: `region`, an ISO 3166
 * country code. The filters used to be sent as `country:`, `continent:`,
 * `region:`, `city:`, `asn:` and `hosting_provider:` terms, with
 * `-is_cloud_provider:true`, `-is_vpn:true` and `geographic_risk_score:>=n`.
 * None but `region` is documented, and the API answers a qualifier it does
 * not know with HTTP 200 and no results (measured on flows: `block:true`
 * returned 0 where `status:blocked` returned the blocked flows), so such a
 * search found nothing and said nothing.
 *
 * Now `countries`, and `regions` holding country codes, are sent as one
 * `region:` comma list, which the API reads as any of the countries; a
 * filter with no documented equivalent is refused before anything is sent.
 */

import { validateCountryCodes } from './geographic.js';
import { MspQueryError, mspTerms, mspTermText } from './msp-query.js';

/** The filters that map to the documented `region` qualifier */
const REGION_FILTERS = new Set(['countries', 'regions']);

/** Filters this server knows that take a list and have no API equivalent */
const LIST_FILTERS = new Set([
  'continents',
  'cities',
  'asns',
  'hosting_providers',
]);

/** Yes-or-no filters this server knows that have no API equivalent */
const FLAG_FILTERS = new Set([
  'exclude_vpn',
  'exclude_cloud',
  'high_risk_countries',
  'exclude_known_providers',
  'threat_analysis',
]);

/** Every filter name this server knows */
const KNOWN_FILTERS = new Set([
  ...REGION_FILTERS,
  ...LIST_FILTERS,
  ...FLAG_FILTERS,
  'min_risk_score',
]);

/** geographic_filters that cannot be sent to the MSP API as given */
export class GeographicFilterError extends Error {
  /** Filters with no documented equivalent, e.g. `continents` */
  readonly unsupported: string[];
  /** Values that are not country codes, by filter */
  readonly invalid: Record<string, string[]>;
  /** One sentence per problem */
  readonly problems: string[];

  constructor(
    problems: string[],
    unsupported: string[] = [],
    invalid: Record<string, string[]> = {}
  ) {
    super(problems.join(' '));
    this.name = 'GeographicFilterError';
    this.problems = problems;
    this.unsupported = unsupported;
    this.invalid = invalid;
  }
}

/**
 * Whether a filter asks for nothing: a known one that is absent or null, a
 * yes-or-no one that is false, or a list one that is an empty list. A name
 * this server does not know always asks for something, and so does a list
 * filter set to false: `{ contintents: false }` and `{ countries: false }`
 * were skipped as unset, and the search ran without the restriction.
 */
function asksForNothing(name: string, value: unknown): boolean {
  if (!KNOWN_FILTERS.has(name)) {
    return false;
  }
  if (value === undefined || value === null) {
    return true;
  }
  if (FLAG_FILTERS.has(name)) {
    return value === false;
  }
  if (REGION_FILTERS.has(name) || LIST_FILTERS.has(name)) {
    return Array.isArray(value) && value.length === 0;
  }
  return false;
}

/**
 * The flow query term for search_flows' `geographic_filters`
 *
 * @param filters - The geographic_filters argument, e.g. `{ countries: ["US", "CN"] }`
 * @returns `region:US,CN` for the countries asked for, or undefined when the
 *   filters ask for nothing
 * @throws {GeographicFilterError} When a filter has no documented flow
 *   qualifier (continents, cities, asns, hosting_providers, exclude_vpn,
 *   exclude_cloud, min_risk_score, or a name this server does not know), or
 *   a value is not an ISO 3166-1 alpha-2 country code
 */
export function geographicFiltersToMspQuery(
  filters: unknown
): string | undefined {
  if (filters === undefined || filters === null) {
    return undefined;
  }
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new GeographicFilterError([
      'geographic_filters must be an object, such as {"countries": ["US", "CN"]}.',
    ]);
  }

  const unsupported: string[] = [];
  const invalid: Record<string, string[]> = {};
  const problems: string[] = [];
  const codes: string[] = [];

  for (const [name, value] of Object.entries(filters)) {
    if (asksForNothing(name, value)) {
      continue;
    }
    if (!REGION_FILTERS.has(name)) {
      unsupported.push(name);
      continue;
    }
    if (!Array.isArray(value)) {
      invalid[name] = [JSON.stringify(value)];
      problems.push(
        `geographic_filters.${name} takes a list of ISO 3166-1 alpha-2 country codes (the API's region qualifier), such as ["US", "CN"], not ${JSON.stringify(value)}.`
      );
      continue;
    }
    const values: unknown[] = value;
    const strings = values.filter(
      (entry): entry is string => typeof entry === 'string'
    );
    const { valid, invalid: bad } = validateCountryCodes(
      strings.map(entry => entry.trim())
    );
    bad.push(
      ...values
        .filter(entry => typeof entry !== 'string')
        .map(entry => JSON.stringify(entry))
    );
    if (bad.length > 0) {
      invalid[name] = bad;
      problems.push(
        `geographic_filters.${name} takes a list of ISO 3166-1 alpha-2 country codes (the API's region qualifier), such as ["US", "CN"]; ${invalid[name].join(', ')} ${invalid[name].length === 1 ? 'is not an assigned code' : 'are not assigned codes'}. To send another code anyway (such as XK), put region:<code> in the query.`
      );
      continue;
    }
    codes.push(...valid);
  }

  if (unsupported.length > 0) {
    const names = unsupported.map(name => `geographic_filters.${name}`);
    problems.unshift(
      `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no equivalent in the MSP API's flow search, whose one geographic qualifier is region (an ISO 3166 country code), so the search was not sent: the API answers a qualifier it does not know with no results rather than an error. Use geographic_filters.countries (sent as region:US,CN) or region: in the query.`
    );
  }
  if (problems.length > 0) {
    throw new GeographicFilterError(problems, unsupported, invalid);
  }

  const unique = [...new Set(codes)];
  return unique.length > 0 ? `region:${unique.join(',')}` : undefined;
}

/**
 * Geographic names the flow and alarm field lists accepted as qualifiers,
 * which the MSP API does not document (its one geographic qualifier is
 * `region`, `remote.region` on alarms, an ISO 3166 country code)
 */
const UNDOCUMENTED_GEO_QUALIFIERS: ReadonlySet<string> = new Set([
  'country',
  'country_code',
  'remote_country',
  'continent',
  'remote_continent',
  'city',
  'timezone',
  'isp',
  'organization',
  'hosting_provider',
  'asn',
  'is_cloud_provider',
  'is_cloud',
  'is_proxy',
  'is_vpn',
  'geographic_risk_score',
  'geo_risk_score',
  'geo_location',
]);

/** Qualifiers whose values are country codes, as `region` takes them */
const COUNTRY_QUALIFIERS: ReadonlySet<string> = new Set([
  'country',
  'country_code',
  'remote_country',
]);

/**
 * Refuses a flow or alarm query with a geographic qualifier the MSP API does
 * not document, such as `country:US` or `continent:Asia`. The search tools'
 * field lists accepted them and the query was sent, but the API answers a
 * qualifier it does not know with HTTP 200 and no results (measured on
 * flows: `block:true` returned 0), so the search found nothing.
 *
 * @param query - The query, in the tools' language or the API's
 * @throws {MspQueryError} Naming the qualifier; for country codes, with the
 *   query using `region:` as the suggestion
 */
export function refuseUndocumentedGeoQualifiers(query: string): void {
  if (typeof query !== 'string' || !query.trim()) {
    return;
  }
  const terms = mspTerms(query);
  const refused = terms.filter(term =>
    UNDOCUMENTED_GEO_QUALIFIERS.has(term.field.toLowerCase())
  );
  if (refused.length === 0) {
    return;
  }
  const part = refused.map(mspTermText).join(' ');
  // The whole query with region: for each qualifier of country codes
  const asRegion = terms.map(term => {
    if (!refused.includes(term)) {
      return mspTermText(term);
    }
    const codes = term.values.map(value => value.replace(/^"(.*)"$/s, '$1'));
    const { valid, invalid } = validateCountryCodes(codes);
    if (
      !COUNTRY_QUALIFIERS.has(term.field.toLowerCase()) ||
      term.kind !== 'exact' ||
      invalid.length > 0
    ) {
      return undefined;
    }
    return `${term.negated ? '-' : ''}region:${valid.join(',')}`;
  });
  const suggestion = asRegion.every(text => text !== undefined)
    ? asRegion.join(' ')
    : undefined;
  const names = [...new Set(refused.map(term => term.field))];
  const trimmed = query.trim();
  throw new MspQueryError(
    `Query "${trimmed}" cannot be sent to the MSP API: ${names.join(', ')} ${names.length === 1 ? 'is not a qualifier' : 'are not qualifiers'} the API documents, and it answers a qualifier it does not know with no results rather than an error. Its one geographic qualifier is region, an ISO 3166 country code: region:US, or region:US,CN for either country.${suggestion ? ` Send ${suggestion}.` : ''}`,
    trimmed,
    part,
    suggestion ? [suggestion] : []
  );
}
