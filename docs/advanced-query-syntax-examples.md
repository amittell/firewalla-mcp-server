# Query workflows

Queries for common investigations, a few tools at a time. The grammar, the
fields each tool takes and what is refused are in the
[query syntax guide](query-syntax-guide.md), which also says which forms were
measured against a live account. This page does not repeat them.

Every call here was run through the tools' handlers on 2026-09-27 with the
HTTP layer stubbed, so nothing reached the API. "Sent" is the request the
client made with `FIREWALLA_BOX_ID` unset; with it set, ` box.id:<gid>`
follows. `<now>` stands for the Unix time of the call and `<now-3600>` for an
hour before it. The
IP, MAC address and names are placeholders. `search_devices` and
`search_target_lists` send no query: they filter what the API returns, and
were checked against sample devices and lists.

## Forms from earlier versions of this page

Earlier versions used forms the tools refuse, or send although the API does
not know them. The API answers an unknown field with no results rather than
an error, so those look like searches that found nothing.

| Earlier form | What happens | Write instead |
|---|---|---|
| `severity:high` on alarms | sent; alarms have no severity, so nothing matches | the type meant, e.g. `type:1` for Security Activity |
| `timestamp:>NOW-1h` | sent as written; `timestamp` is not a qualifier and `NOW-1h` is not a time | `ts:>1h`, sent as `ts:><now-3600>` |
| `bytes:[1000 TO 50000]` | refused, with `total:1000-50000` suggested | `total:1000-50000` |
| `country:CN` | refused, with `region:CN` suggested | `region:CN` on flows, `remote.region:CN` on alarms |
| `country:China`, `continent:Asia` | refused: not qualifiers, and not country codes | the countries' codes, e.g. `region:CN` |
| `protocol:(tcp OR udp)` | refused as malformed | `protocol:tcp OR protocol:udp`, sent as `protocol:tcp,udp` |
| `destination_port:443` on flows | refused: not a flow field | `dport:443` |
| `resolved:false` on alarms | refused | `status:1` |
| `type:intrusion_detection` | sent; alarm types are the numbers 1 to 16 | the number, e.g. `type:1` |
| `device_type:laptop` on devices | refused: not a field `search_devices` matches | `name:*laptop*` |
| `last_seen:<NOW-1h` on devices | refused: not a field `search_devices` matches | `online:false` |

## One device

| Step | Call | Sent |
|---|---|---|
| Find it by IP | `search_devices` with `ip:192.168.1.100` | `GET /v2/devices`, filtered by the server |
| Its active alarms | `search_alarms` with `device.ip:192.168.1.100 AND status:1` | `device.ip:192.168.1.100 status:1` |
| Its flows in the last hour | `search_flows` with `device.id:"AA:BB:CC:DD:EE:01" AND ts:>1h` | `device.id:"AA:BB:CC:DD:EE:01" ts:><now-3600>` |
| Its traffic by category over 24 hours | `search_flows` with `device.id:"AA:BB:CC:DD:EE:01" AND ts:>24h` and `groupBy: "category"` | the same with `ts:><now-86400>`, plus `groupBy=category` and `sortBy=total:desc` |
| Rules scoped to it | `search_rules` with `device.id:"AA:BB:CC:DD:EE:01"` | `device.id:"AA:BB:CC:DD:EE:01"` |

`device.id` takes the device's `id` from the first step, its MAC address, in
quotes. On flows, prefer it (or `device.name`) to `device.ip`: that one is
sent but is not in the API's flow qualifier table.

## Where blocked traffic goes

| Step | Call | Sent |
|---|---|---|
| Top regions by blocked flows | `get_statistics_by_region` | `GET /v2/stats/topRegionsByBlockedFlows`; the API returned at most 5 |
| Blocked domains over 24 hours | `search_flows` with `status:blocked AND ts:>24h` and `groupBy: "domain"` | `status:blocked ts:><now-86400>`, grouped by domain |
| Blocked flows to or from two countries | `search_flows` with `status:blocked AND ts:>24h` and `geographic_filters: {"countries": ["CN", "RU"]}` | `status:blocked ts:><now-86400> region:CN,RU` |
| Security alarms involving them | `search_alarms` with `type:1 AND remote.region:CN,RU` | `type:1 remote.region:CN,RU` |

`region:CN,RU` in the query does the same as `geographic_filters`. The
[geographic guide](geographic-data-handling-guide.md) lists what else is
accepted and refused.

## Bandwidth

| Step | Call | Sent |
|---|---|---|
| Top devices by bytes | `get_bandwidth_usage` with `period: "24h"` and `limit: 10` | `ts:<now-86400>-<now>`, limit 100: it sums up to 10 times `limit` of the most recent flows |
| Flows over 100 MB | `search_flows` with `total:>100MB AND ts:>24h` | `total:>100MB ts:><now-86400>` |
| One device's video, by domain | `search_flows` with `device.name:*tv* AND category:video AND ts:>24h` and `groupBy: "domain"` | `device.name:*tv* category:video ts:><now-86400>`, grouped by domain |

## Content categories

| Step | Call | Sent |
|---|---|---|
| Categories, top devices and blocked traffic | `get_flow_insights` with `period: "24h"`, `categories: ["porn", "gamble"]` and `include_blocked: true` | three reads of `/v2/flows` over the period: the largest flows in those categories, the largest flows, and the blocked flows |
| Active Porn Activity alarms | `search_alarms` with `type:10 AND status:1` | `type:10 status:1` |
| Such flows that were allowed | `search_flows` with `category:porn,gamble AND NOT status:blocked AND ts:>24h` | `category:porn,gamble -status:blocked ts:><now-86400>` |

## Rules

| Step | Call | Sent |
|---|---|---|
| Counts by action, direction, status and target type | `get_network_rules_summary` | `GET /v2/rules` with `limit=200`, counted by the server |
| Paused rules | `search_rules` with `status:paused` | `status:paused` |
| Block rules that mention a word | `search_rules` with `tiktok AND action:block` | `action:block`; the server keeps the rules with "tiktok" in their name, notes, action, target or scope |
| Social target lists | `search_target_lists` with `category:social` | `GET /v2/target-lists`, filtered by the server |

`get_network_rules_summary` sends `limit=200`, which its schema does not
list, and the API documents no limit for rules, so whether it counts more
than 200 rules was not measured. Its `active_only` and `rule_type` arguments
are repeated in the answer and filter nothing (`src/tools/handlers/rules.ts`).
