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
/**
 * search_flows' `geographic_filters`, as its schema in src/server.ts lists
 * them and geographicFiltersToMspQuery takes them. `countries` and
 * `regions` (ISO 3166-1 alpha-2 codes) are sent together as one `region:`
 * comma list. The yes-or-no filters have no API equivalent and are taken
 * only as false, which asks for nothing; true is refused. The other names
 * the tools once took (continents, cities, asns, hosting_providers,
 * min_risk_score) are refused, and are read only from the unchecked
 * argument at the validation edge (geographicFiltersToMspQuery takes
 * `unknown`).
 */
export interface FlowGeographicFilters {
    /** ISO 3166-1 alpha-2 country codes, any of which may match */
    countries?: string[];
    /** Country codes too, merged with countries */
    regions?: string[];
    /** Only false: there is no VPN qualifier */
    exclude_vpn?: false;
    /** Only false: there is no cloud-provider qualifier */
    exclude_cloud?: false;
    /** Only false: there is no country-risk qualifier */
    high_risk_countries?: false;
    /** Only false: there is no hosting-provider qualifier */
    exclude_known_providers?: false;
    /** Only false: the flow search has no threat analysis */
    threat_analysis?: false;
}
/** geographic_filters that cannot be sent to the MSP API as given */
export declare class GeographicFilterError extends Error {
    /** Filters with no documented equivalent, e.g. `continents` */
    readonly unsupported: string[];
    /** Values that are not country codes, by filter */
    readonly invalid: Record<string, string[]>;
    /** One sentence per problem */
    readonly problems: string[];
    constructor(problems: string[], unsupported?: string[], invalid?: Record<string, string[]>);
}
/**
 * The query term for the `geographic_filters` of search_flows and
 * search_alarms
 *
 * @param filters - The geographic_filters argument, e.g. `{ countries: ["US", "CN"] }`
 * @param entity - `flows` (region:, the flow's country) or `alarms`
 *   (remote.region:, the remote end's country, the one geographic alarm
 *   qualifier the API documents)
 * @returns `region:US,CN` (or `remote.region:US,CN`) for the countries asked
 *   for, or undefined when the filters ask for nothing
 * @throws {GeographicFilterError} When a filter has no documented
 *   qualifier (continents, cities, asns, hosting_providers, exclude_vpn,
 *   exclude_cloud, min_risk_score, or a name this server does not know), or
 *   a value is not an ISO 3166-1 alpha-2 country code
 */
export declare function geographicFiltersToMspQuery(filters: unknown, entity?: 'flows' | 'alarms'): string | undefined;
/**
 * Refuses a flow or alarm query with a geographic qualifier the MSP API does
 * not document, such as `country:US`, `continent:Asia` or
 * `remote.country:CN`. The search tools' field lists accepted them, and
 * dotted names go to the API unchecked, but the API answers a qualifier it
 * does not know with HTTP 200 and no results (measured on flows:
 * `block:true` returned 0), so the search found nothing.
 *
 * @param query - The query, in the tools' language or the API's
 * @param endpoint - `/v2/flows` or `/v2/alarms`, for the dotted region
 *   qualifiers each documents; without it, alarms' `remote.region` is kept
 * @throws {MspQueryError} Naming the qualifier; for country codes, with the
 *   query using `region:` as the suggestion
 */
export declare function refuseUndocumentedGeoQualifiers(query: string, endpoint?: string): void;
//# sourceMappingURL=geographic-filters.d.ts.map