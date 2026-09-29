# Geographic data

How to search flows and alarms by country, what the server refuses, and
where the country fields in results come from. The query grammar is in the
[query syntax guide](query-syntax-guide.md).

Every call below was run through the tools' handlers on 2026-09-29 with the
HTTP layer stubbed, so nothing reached the API; "sent" is the query the
client sent with `FIREWALLA_BOX_ID` unset.

## Searching by country

The MSP API has one geographic qualifier, an ISO 3166-1 alpha-2 country
code: `region`, on flows and on alarms. Alarms also take `remote.region`,
the documented field path, which returned the same alarms (measured on the
live API on 2026-09-29: 18 alarms for `CA` with each, 34 for `DE`)
([flow](firewalla-api-reference.md#flow-qualifiers) and
[alarm](firewalla-api-reference.md#alarm-qualifiers) qualifiers).

| Tool | Query | Sent |
|---|---|---|
| `search_flows`, `get_flow_data` | `region:CN` | `region:CN` |
| `search_flows` | `region:CN OR region:RU` | `region:CN,RU` |
| `search_flows` | `status:blocked AND NOT region:US` | `status:blocked -region:US` |
| `search_alarms` | `region:AU` | `region:AU` |
| `search_alarms` | `type:1 AND remote.region:CN,RU` | `type:1 remote.region:CN,RU` |
| `get_active_alarms` | `remote.region:CN` | `status:1 remote.region:CN` |

## geographic_filters

`search_flows` and `search_alarms` also take `geographic_filters`.
`countries` and `regions` both take country codes, in either case, and are
merged into one list ANDed with the query: `region:` on flows,
`remote.region:` on alarms.

| `geographic_filters` | Sent with `status:blocked` |
|---|---|
| `{"countries": ["CN", "RU"]}` | `status:blocked region:CN,RU` |
| `{"countries": ["cn", "ru"]}` | `status:blocked region:CN,RU` |
| `{"countries": ["CN"], "regions": ["RU"]}` | `status:blocked region:CN,RU` |
| `{"countries": ["CN"], "high_risk_countries": false}` | `status:blocked region:CN` |

With `search_alarms`, `{"countries": ["cn"], "regions": ["RU"]}` and the
query `type:1` sent `type:1 remote.region:CN,RU`.

The rest are refused before anything is sent, with a `validation_error`,
by both tools:

| `geographic_filters` | Why |
|---|---|
| `{"countries": ["China"]}` | not an assigned code; the codes are checked against the 249 assigned ones, and the qualifier in the query sends any other |
| `{"countries": "CN"}` | not a list |
| `{"continents": [...]}`, `cities`, `asns`, `hosting_providers`, `min_risk_score` | no equivalent in the API |
| `{"exclude_vpn": true}`, and `true` for `exclude_cloud`, `high_risk_countries`, `exclude_known_providers` or `threat_analysis` | no equivalent; these are accepted only as `false`, which asks for nothing |

The other tools take no `geographic_filters`.

## Refused qualifiers

On flows and alarms, a geographic name that is not the API's qualifier is
refused, since the API would answer it with no results rather than an
error. Where the values are country codes, the refusal suggests the query
with `region:` in their place:

| Tool | Query | Suggested |
|---|---|---|
| `search_flows` | `country:CN OR country:RU` | `region:CN,RU` |
| `search_flows` | `destination.region:CN` | `region:CN` |
| `search_alarms` | `remote.country:CN AND type:1` | `region:CN type:1` |
| `search_flows` | `continent:Asia`, `asn:AS4134` | none |

The full list of refused names is in the
[query syntax guide](query-syntax-guide.md#what-is-refused).

## Blocked flows by region

`get_statistics_by_region` reads `GET /v2/stats/topRegionsByBlockedFlows`,
optionally for one box group (`group`). `FIREWALLA_BOX_ID` does not narrow
it. `limit` defaults to 5, and the API returned no more than 5 regions when
a larger one was tried. Each row of `regional_statistics` has
`country_code`, `flow_count` (the region's blocked flows, in the API's
order) and `percentage`, which, like `total_flow_count`, covers only the
listed regions.

## Country fields in results

The server looks up public IP addresses in the `geoip-lite` database that
ships with the package (`src/utils/geographic.ts`). The lookup is local and
sends no request. A private address, or one the database does not know,
gets no country.

- `search_flows` gives each flow `source_country`, `source_city` and
  `source_continent`, and the same for `destination_`, or `unknown`. For a
  flow to 1.1.1.1 they were `AU`, `Unknown` and `Oceania`; for one to
  240.0.0.1, which the database does not know, all three were `unknown`.
- `get_active_alarms` gives the alarm's `remote.geo`: `country` and
  `country_code`, `continent`, `region` (the state or province as
  `geoip-lite` has it, not the API's `region`), `city`, `timezone`, and
  `geographic_risk_score`, 0 to 10 from a fixed table of countries.
- `search_alarms` gives the alarm's `remote` as the API sent it, and
  `remote_country`, `remote_city` and `remote_continent`. The country is
  the API's `remote.region` when it sent one, else the lookup's: for an
  alarm with `remote.region` `AU` and the address 1.1.1.1 they were `AU`,
  null and `Oceania`.

The flow fields and `remote.geo` come from the database, not the API, and
can differ from the API's `region`. The client keeps lookups for 1 hour, at most 10,000
addresses, dropping the least recently used first. Neither is configurable:
`CACHE_TTL` and `CACHE_MAX_ENTRIES` apply to the response cache only.
