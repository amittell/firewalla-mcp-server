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

/** The filters that map to the documented `region` qualifier */
const REGION_FILTERS = new Set(['countries', 'regions']);

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

/** A filter that asks for nothing: absent, null, false or an empty list */
function isUnset(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
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
    if (isUnset(value)) {
      continue;
    }
    if (!REGION_FILTERS.has(name)) {
      unsupported.push(name);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
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
    if (!Array.isArray(value) || bad.length > 0) {
      invalid[name] = Array.isArray(value) ? bad : [JSON.stringify(value)];
      problems.push(
        `geographic_filters.${name} takes a list of ISO 3166-1 alpha-2 country codes (the API's region qualifier), such as ["US", "CN"]; ${invalid[name].join(', ')} ${invalid[name].length === 1 ? 'is not a code' : 'are not codes'} this server knows. To send a code anyway, put region:<code> in the query.`
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
