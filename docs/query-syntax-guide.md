# Query Syntax Guide

How to write the `query` argument of the Firewalla MCP tools. The tools take `AND`, `OR`, `NOT` and parentheses; the MSP API does not, so the client rewrites each query into the API's grammar before sending it, and refuses one that has no API form. This guide gives both forms, as the code in `src/` implements them (the rewrite is `toMspQuery` in `src/utils/msp-query.ts`), and what the API was measured to do on 2026-09-25 and 2026-09-26 ([Measured Query Behavior](firewalla-api-reference.md#measured-query-behavior)).

## Contents

- [The API's grammar](#the-apis-grammar)
- [What the tools accept and send](#what-the-tools-accept-and-send)
- [What is refused](#what-is-refused)
- [Where the query goes](#where-the-query-goes)
- [Values and time windows](#values-and-time-windows)
- [Fields](#fields)
- [Pitfalls](#pitfalls)
- [Worked examples](#worked-examples)
- [Optimization tips](#optimization-tips)

## The API's grammar

`GET /v2/alarms`, `/v2/flows` and `/v2/rules` take a `query` of space-separated terms ([Search Functionality](firewalla-api-reference.md#search-functionality)). Measured on 2026-09-26:

- **Terms on different fields must all match.** `status:blocked region:US` matched 6,318 flows.
- **The same field repeated, or a comma list, matches either value.** `region:US region:CN` matched 6,423 blocked flows and `region:US,CN` 6,424, where `region:US` matched 6,315 and `region:CN` 109; `category:social,games` and `category:social category:games` each matched 26,628 flows, the 6,356 social and 20,272 games flows.
- **`-field:value` excludes, and each exclusion holds.** `region:US -protocol:tcp` matched 272,581 flows; `-region:US -region:CN` matched 56,736 and `-region:US,CN` 56,837. A comparison can be excluded too, although the official grammar says it cannot: `-total:>1MB` and `total:<=1MB` each matched 735,778 flows.
- **A range includes both ends.** `ts:>=<a> ts:<=<b>` and `ts:<a>-<b>` each matched 197 alarms.
- **Rules take the same grammar.** `action:block` returned 91 rules, `action:allow` 7, and `action:block,allow` 98; `status:paused box.id:<gid>` returned one box's 8 of the account's 10 paused rules.
- **`AND`, `OR` and `NOT` are not operators.** The API searches them as words: the bare query `AND` matched 417 alarms, `status:blocked AND region:US` 0 flows, `type:10 AND status:1` 5 alarms where `type:10 status:1` matched 12, and `region:US NOT protocol:tcp` 285 flows.
- **Parentheses match nothing.**
- **There is no OR between different fields.** No query can ask for `region:US` or `category:social`.

## What the tools accept and send

The tools accept uppercase `AND`, `OR` and `NOT`, parentheses, and the API's own forms. `NOT` binds tightest, then `AND`, then `OR`, and terms with no operator between them are ANDed. Before a query goes to `/v2/alarms`, `/v2/flows` or `/v2/rules`, the client rewrites it:

| You write | Sent | Rule |
|-----------|------|------|
| `type:10 AND status:1` or `type:10 status:1` | `type:10 status:1` | `AND`, or a space, becomes a space |
| `type:1 OR type:10` | `type:1,10` | `OR` between values of one field becomes a comma list |
| `status:blocked AND (region:US OR region:CN)` | `status:blocked region:US,CN` | parentheses may group an `OR` on one field |
| `region:US AND NOT protocol:tcp` or `region:US -protocol:tcp` | `region:US -protocol:tcp` | `NOT` becomes the `-` prefix |
| `NOT (region:US OR region:CN)` | `-region:US -region:CN` | `NOT` of an `OR` excludes each value |
| `NOT total:>1MB` or `-total:>1MB` | `total:<=1MB` | an excluded comparison is sent as the opposite comparison, the documented form (the API matched the same flows either way) |
| `ts:>=1790208000 AND ts:<=1790294400` | `ts:1790208000-1790294400` | a `>=` and a `<=` bound become one range |
| `ts:>24h` | `ts:><now-86400>` | a relative time (`s`, `m`, `h`, `d`, `w`) becomes Unix seconds |
| `type:1 and status:1` | `type:1 and status:1` | lowercase `and`, `or`, `not` are words, as the API reads them |

`<now-86400>` stands for the Unix time 86,400 seconds before the request. A query already in the API's form is sent unchanged. `search_devices` and `search_target_lists` send no query: they evaluate `AND`, `OR`, `NOT`, `-` and parentheses themselves, across fields too.

## What is refused

A query with no API form is refused before anything is sent. The response is a `validation_error` whose `details` carry the `unsupported_part`, the `suggested_queries` when there are any, and the rules. For a refused `OR` or `NOT`, the suggestions are one query per disjunct, in API form, and running them all gives the query's results.

| Query | Why | Suggested |
|-------|-----|-----------|
| `region:US OR category:social` | an `OR` between different fields | `region:US`, `category:social` |
| `region:US OR (category:social AND status:blocked)` | an `OR` between different fields | `region:US`, `category:social status:blocked` |
| `type:1 AND type:10`, `type:1 type:10` | two conditions on one field; the API would read them as either | `type:1,10` |
| `NOT (type:1 AND status:1)` | `NOT` over an `AND` | `-type:1`, `-status:1` |
| `porn OR type:10` | an `OR` with free text | `porn`, `type:10` |
| `type:1 OR -status:2` | an `OR` with an exclusion | `type:1`, `-status:2` |
| `transfer.total:>50MB OR transfer.total:<1KB` | an `OR` between comparisons | `transfer.total:>50MB`, `transfer.total:<1KB` |
| `NOT porn`, `-porn` | the exclusion of free text | |
| `NOT domain:*.ads.example.com` | the exclusion of a wildcard | |
| `NOT transfer.total:1MB-50MB` | the exclusion of a range | `transfer.total:<1MB`, `transfer.total:>50MB` |
| `ts:>1790208000 AND ts:<1790294400 AND status:blocked` | a strict bound; a range includes both ends | `ts:1790208000-1790294400 status:blocked` |
| `bytes:[1000000 TO 50000000]` | `[low TO high]`; the API's ranges are `field:low-high` | `total:1000000-50000000` |
| `transfer.total:[1000 TO *]` | the same, with an open end | `transfer.total:>=1000` |
| `box.id:<another gid> AND type:1` | with `FIREWALLA_BOX_ID` set, a second box; the API would read the two as either | `type:1` |
| `(box.id:<gid> OR box.id:<another gid>) AND type:1` | the same, with `FIREWALLA_BOX_ID=<gid>`: the list adds another box | `type:1` |

For strict bounds and for `[low TO high]`, the suggestion is the whole query with the range rewritten; for strict bounds it includes the ends the query excluded. An open end becomes a comparison (`{1000 TO *]` suggests `>1000`, `[* TO 5000]` `<=5000`); a closed range becomes `low-high`, which includes both ends even where `{` or `}` excluded one, and `[* TO *]` is to be left out.

The search tools also check field names before this. They refuse `resolved:` and `message:` on alarms, the qualifier aliases listed there, a bare MAC address in `search_devices`, and, in `search_rules`, `search_devices` and `search_target_lists`, a query that is only free text (see [Fields](#fields)).

## Where the query goes

| Tool | Endpoint | Applies the query | Before sending |
|------|----------|-------------------|----------------|
| `search_alarms` | `GET /v2/alarms` | the API | field check; `source_ip:` becomes `device.ip:`; `time_range` is ANDed as `ts:<start>-<end>` |
| `search_flows` | `GET /v2/flows` | the API | field check; `blocked:` or `block:` `true`/`false` become `status:blocked`/`-status:blocked`, `bytes:` becomes `total:`; `time_range` is ANDed |
| `search_rules` | `GET /v2/rules` | the API, then the client checks each rule's `action`, `status` and `target.value` against every term | field check |
| `get_active_alarms` | `GET /v2/alarms` | the API | `status:1` is ANDed unless the query names a status; `source_ip:` becomes `device.ip:` |
| `get_flow_data` | `GET /v2/flows` | the API | `blocked:` and `bytes:` as above; `start_time`/`end_time` are ANDed as `ts:<start>-<end>` |
| `get_network_rules` | `GET /v2/rules` | the API | |
| `search_devices` | `GET /v2/devices` | the client; the endpoint ignores `query` | field check |
| `search_target_lists` | `GET /v2/target-lists` | the client; the endpoint has no `query` | field check |

The first six then send the query through the rewrite above. When `FIREWALLA_BOX_ID` is set, `box.id:<gid>` is ANDed after the rewrite (`type:1 OR type:10` is sent as `type:1,10 box.id:<gid>`); a query that names the same box keeps one `box.id`, and one that names another box, alone or in a list with the scoped one, is refused. `search_devices` sends `box=<gid>` instead, unless its `box` argument names another box.

## Values and time windows

- `*` is a wildcard (`device.name:*iphone*`, `domain:*.example.com`). Quote a value with spaces, commas, `*` or `:` (`box.name:"Gold Plus"`).
- Comparisons are `>`, `>=`, `<`, `<=`, and a range is `low-high`, inclusive: `total:>50MB`, `total:1MB-50MB`. Sizes take `B`, `KB`, `MB`, `GB` and `TB`, each 1000 times the one before.
- A word without a field is free text (`porn`, `"brute force"`); it matched on alarms and was not measured on flows. `search_rules`, `search_devices` and `search_target_lists` refuse a query that is only free text.
- `[low TO high]` and `{low TO high}` are refused everywhere, with the `field:low-high` form suggested.
- With no `ts` term, `/v2/alarms` covers the last 30 days and `/v2/flows` the last 24 hours. `ts` takes Unix seconds, `ts:1790208000-1790294400` (2026-09-24, UTC) or `ts:>=1790208000`, or a relative time, `ts:>1h`, `ts:>=24h` or `ts:<7d` (units `s`, `m`, `h`, `d`, `w`), which `search_alarms`, `search_flows`, `get_active_alarms` and `get_flow_data` send as Unix seconds. `search_rules`, `search_devices` and `search_target_lists` do not accept `ts` (`Invalid field(s) in query: ts`).
- The search tools refuse a query with more than 10 `*`, 15 `field:value` terms or 20 `AND`/`OR`.

## Fields

The search tools check each flat field name (one with no dot) against a list of their own. `search_alarms` and `search_flows` pass every dotted name to the API unchecked; `search_rules`, `search_devices` and `search_target_lists` check dotted names against their lists too and refuse one they do not know (`Invalid field 'target.foo' for rules`). The lists include names that are not API qualifiers, such as `severity` on alarms and `country` and `source_ip` on flows. Those are sent, and the API answers a field it does not know with no results rather than an error (measured). Use the qualifiers below.

### Alarms

From the [alarm qualifier table](firewalla-api-reference.md#alarm-qualifiers):

| Qualifier | Values |
|-----------|--------|
| `type` | 1 to 16, below |
| `status` | `1` active, `2` archived; the official example is `status:active` |
| `ts` | Unix seconds |
| `box.id`, `box.name`, `box.group.id` | the box |
| `device.id`, `device.name`, `device.network.id`, `device.network.name` | the device |
| `device.ip` | the device IP; not in the table, measured with `192.168.*`; `source_ip:` is sent as `device.ip:` |
| `remote.category`, `remote.domain`, `remote.region` | the remote host; `region:` is the alias of `remote.region` |
| `transfer.download`, `transfer.upload`, `transfer.total` | bytes, with units |

Alarm types: 1 Security Activity, 2 Abnormal Upload, 3 Large Bandwidth Usage, 4 Monthly Data Plan, 5 New Device, 6 Device Back Online, 7 Device Offline, 8 Video Activity, 9 Gaming Activity, 10 Porn Activity, 11 VPN Activity, 12 VPN Connection Restored, 13 VPN Connection Error, 14 Open Port, 15 Internet Connectivity Update, 16 Large Upload.

`search_alarms` refuses the aliases `AlarmType`, `Box`, `Mac`, `Device`, `Network`, `Category`, `Domain`, `Download`, `Upload` and `Total` in upper or lower case (use the property path), `message` (the API answers it with an error) and `resolved` (use `status`). It sends `severity:`, which finds nothing: MSP alarms have no severity. `type` takes numbers: `type:intrusion` is sent, but there is no such type.

### Flows

From the [flow qualifier table](firewalla-api-reference.md#flow-qualifiers):

| Qualifier | Values |
|-----------|--------|
| `status` | `blocked`, `ok`; `blocked:` and `block:` with `true` or `false` are translated |
| `ts` | Unix seconds, or a relative time |
| `direction` | `inbound`, `outbound`, `local` |
| `box.id`, `box.name`, `box.group.id` | the box |
| `device.id`, `device.name` | the device |
| `network.id`, `network.name` | the network |
| `category` | `ad`, `edu`, `games`, `gamble`, `intel`, `p2p`, `porn`, `private`, `social`, `shopping`, `video`, `vpn`; measured with `social` and `games` |
| `domain` | the remote domain |
| `region` | 2-letter country code |
| `download`, `upload`, `total` | bytes, with units; `total` is download + upload; `bytes:` is sent as `total:` |
| `sport`, `dport` | source and destination port; `sport:443` measured |
| `protocol` | `tcp`, `udp`; not in the table, measured (`region:US protocol:tcp` 465,213 of 737,886) |

`search_flows` refuses the aliases `Box`, `Mac`, `Device`, `Network`, `SourcePort` and `DestinationPort`; the lower-case `category`, `domain`, `region`, `download`, `upload` and `total` are the qualifiers themselves. `country`, `source_ip` and `device.ip` are sent but are not in the table; use `region`, and `device.name` or `device.id`.

### Rules

The [rule qualifiers](firewalla-api-reference.md#rule-qualifiers) are `status` (`active`, `paused`), `action` (`allow`, `block`, `timelimit`), `box.id`, `box.group.id` and `device.id`, and `id:<box gid>:<n>` works too (measured). `search_rules` and `get_network_rules` accept all of them, and the API applies the same grammar to rules as to alarms and flows (measured: `action:block` 91 rules, `action:allow` 7, `action:block,allow` 98).

After the API answers, `search_rules` checks each rule's `action`, `status` and target value against every term of the sent query: a comma list is any of its values, `-` excludes, and `target.value` (or `target_value`) matches as a substring or `*` pattern. `target.value`, `target.type`, `direction`, `protocol`, `notes` and `scope.type` are sent too, but they are not rule qualifiers and the API's handling of them was not measured.

### Devices

`GET /v2/devices` takes only `box` and `group`; the `box` argument of `search_devices` scopes the request to one box. The query is evaluated by the server, case-insensitively:

| Field | Matches |
|-------|---------|
| `name:` | names containing the value; `*` is ignored |
| `ip:` | the exact address, or a `*` pattern: `192.168.*`, `192.168.1.*`, `10.*`. CIDR (`192.168.1.0/24`) matches nothing |
| `mac:` | the MAC address, a plain-MAC device id, exactly or with `*` |
| `id:` | the device id (a MAC address, or `ovpn:` / `wg_peer:` for VPN clients), exactly or with `*` |
| `mac_vendor:` | vendors containing the value |
| `online:` | `true` or `false` |
| `gid:` | the box gid, exactly or with `*` |
| `network.name:`, `group.name:` | names containing the value |

`AND`, `OR`, `NOT`, `-`, a space and parentheses are evaluated. Free text is refused, and so is a bare MAC address, with the hint to write `mac:<address>`. Other names in the tool's field list, such as `device_type` and `os`, pass the check and match nothing.

### Target lists

`GET /v2/target-lists` takes only `owner`, which is the `owner` argument of `search_target_lists`: `global`, a box gid, or a comma list such as `global,<box gid>`. Without it the API returns the global and Firewalla-managed lists, so a box's own lists need `owner`. The query is evaluated by the server, case-insensitively:

| Field | Matches |
|-------|---------|
| `name:`, `notes:` | text containing the value; `*` allowed |
| `owner:` | the whole owner (`global`, `firewalla`, a box gid); `*` allowed |
| `category:` | the whole category; `*` allowed |
| `targets:` | any one whole entry; `*` allowed (`*.twitter.com`) |
| `target_count:` | the number of entries: `n`, `>n`, `>=n`, `<n`, `<=n` or `a-b` |
| `last_updated:` | Unix seconds or a date such as `2026-09-01`, with the same comparisons |

Firewalla-managed lists carry no `targets` and no `category` (measured), so `targets:` and `category:` never match them; `target_count:` reads their `count`. `AND`, `OR`, `NOT`, `-`, a space and parentheses are evaluated. A comma list is compared as one value and matches nothing (use `OR`), and free text is refused.

## Pitfalls

**An empty result is not proof that nothing matched.** The API answers a field it does not know with HTTP 200 and no results (measured), so a misspelled or invented qualifier looks like a clean search.

**`search_alarms` returns archived alarms too.** `/v2/alarms` returns active (`status:1`) and archived (`status:2`) alarms unless the query names a status (measured). Add `AND status:1`; `get_active_alarms` adds it itself.

| Query | Tool | What happens | Write instead |
|-------|------|--------------|---------------|
| `region:US OR category:social` | `search_flows` | refused: `OR` between fields | `region:US`, then `category:social` |
| `type:1 AND type:10` | `search_alarms` | refused: two conditions on `type` | `type:1 OR type:10` |
| `region:US region:CN` | `search_flows` | refused: a space is AND in the tools | `region:US OR region:CN` |
| `NOT domain:*.ads.example.com` | `search_flows` | refused: excluding a wildcard; no single query is equivalent | `-domain:ads.example.com`, which excludes only that exact domain, not its subdomains |
| `type:1 and status:1` | `search_alarms` | sent with `and` as a word | `type:1 AND status:1` |
| `severity:high` | `search_alarms` | sent; there is no severity, so nothing | no equivalent: MSP alarms have no severity; filter by the type meant, e.g. `type:1` for Security Activity |
| `type:intrusion` | `search_alarms` | sent; types are the numbers 1 to 16 and none is named intrusion | the number of the type meant, e.g. `type:1` if Security Activity is meant |
| `resolved:false` | `search_alarms` | refused | `status:1` |
| `message:porn` | `search_alarms` | refused | `porn` |
| `bytes:[1000000 TO 50000000]` | `search_flows` | refused: `[low TO high]` | `total:1MB-50MB` |
| `country:CN` | `search_flows` | sent; not in the qualifier table | `region:CN` |
| `category:*` | `search_flows` | sent; matches nothing: `field:*` is not an existence test on `status`, `category` or `action` (measured), though `device.name:*` returns results | leave the term out |
| `AA:BB:CC:DD:EE:01` | `search_devices` | refused, with a hint | `mac:AA:BB:CC:DD:EE:01` |
| `laptop` | `search_devices` | refused: free text only | `name:laptop` |
| `ip:192.168.1.0/24` | `search_devices` | nothing: no CIDR | `ip:192.168.1.*` |
| `category:social,games` | `search_target_lists` | nothing | `category:social OR category:games` |

## Worked examples

"Sent as" is the `query` the client sends with `FIREWALLA_BOX_ID` unset; with it set, ` box.id:<gid>` follows. "Basis" is `measured` where the API behaviour the example relies on was measured on a live account (2026-09-25 or 2026-09-26), or the example itself returned results there. It is `no data` where the example was run on that account on 2026-09-26 and sent the query shown, but the account had nothing to match (for example no Guest network, no laptops and no time-limit rules; the gids and MAC addresses here are placeholders), so it shows the form, not a result.

### search_alarms

| Query | Finds | Sent as | Basis |
|-------|-------|---------|-------|
| `type:1` | Security Activity alarms, active and archived | `type:1` | measured |
| `type:1 OR type:10` | Security or Porn Activity alarms | `type:1,10` | measured |
| `type:10 AND status:1` | active Porn Activity alarms | `type:10 status:1` | measured |
| `type:10 AND NOT status:2` | Porn Activity alarms that are not archived | `type:10 -status:2` | measured |
| `status:2` | archived alarms | `status:2` | measured |
| `device.ip:192.168.* AND status:1` | active alarms of devices in 192.168.x.x | `device.ip:192.168.* status:1` | measured |
| `source_ip:192.168.1.* AND type:1` | Security Activity alarms of devices in 192.168.1.x | `device.ip:192.168.1.* type:1` | measured |
| `porn` | alarms matching the text | `porn` | measured |
| `ts:1790208000-1790294400 AND type:1` | Security Activity alarms on 2026-09-24 (UTC) | `ts:1790208000-1790294400 type:1` | measured |
| `ts:>=1790208000 AND ts:<=1790294400 AND type:1` | the same | `ts:1790208000-1790294400 type:1` | measured |
| `type:1 AND ts:>24h` | Security Activity alarms of the last 24 hours | `type:1 ts:><now-86400>` | measured |
| `(type:8 OR type:9 OR type:10) AND device.ip:192.168.* AND status:1` | active video, gaming or porn alarms from the LAN | `type:8,9,10 device.ip:192.168.* status:1` | measured |
| `type:1 AND remote.region:CN,RU` | Security Activity alarms with a remote host in China or Russia | `type:1 remote.region:CN,RU` | no data |
| `type:1 AND NOT remote.region:US` | Security Activity alarms with a remote host outside the US | `type:1 -remote.region:US` | measured |
| `remote.category:porn OR remote.category:gamble` | alarms whose remote host is porn or gambling | `remote.category:porn,gamble` | measured |
| `transfer.total:>50MB AND (type:2 OR type:16)` | Abnormal or Large Upload alarms over 50 MB | `transfer.total:>50MB type:2,16` | measured |
| `device.name:*laptop* AND type:10` | Porn Activity alarms of devices named like "laptop" | `device.name:*laptop* type:10` | no data |
| `device.network.name:Guest AND type:5` | new devices on the network named Guest | `device.network.name:Guest type:5` | no data |

### search_flows

| Query | Finds | Sent as | Basis |
|-------|-------|---------|-------|
| `status:blocked` | blocked flows, last 24 hours | `status:blocked` | measured |
| `status:blocked AND region:US` | blocked flows to or from the US | `status:blocked region:US` | measured |
| `status:blocked AND (region:US OR region:CN)` | blocked flows to or from the US or China | `status:blocked region:US,CN` | measured |
| `region:US AND NOT protocol:tcp` | US flows that are not TCP | `region:US -protocol:tcp` | measured |
| `region:US AND protocol:tcp` | US TCP flows | `region:US protocol:tcp` | measured |
| `blocked:true AND region:CN` | blocked flows to or from China | `status:blocked region:CN` | measured |
| `bytes:>10MB` | flows over 10 MB in total | `total:>10MB` | measured |
| `ts:1790208000-1790294400 AND status:blocked` | blocked flows on 2026-09-24 (UTC) | `ts:1790208000-1790294400 status:blocked` | measured |
| `status:blocked AND ts:>1h` | blocked flows in the last hour | `status:blocked ts:><now-3600>` | measured |
| `sport:443` | flows with source port 443 | `sport:443` | measured |
| `region:US AND NOT total:>1MB` | US flows of 1 MB or less | `region:US total:<=1MB` | measured |
| `status:blocked AND NOT (region:US OR region:CN)` | blocked flows from outside the US and China | `status:blocked -region:US -region:CN` | measured |
| `category:social OR category:games` | social or gaming flows | `category:social,games` | measured |
| `category:porn,gamble AND ts:>24h` | porn or gambling flows in the last 24 hours | `category:porn,gamble ts:><now-86400>` | measured |
| `total:>100MB AND direction:outbound` | outbound flows over 100 MB | `total:>100MB direction:outbound` | measured |
| `dport:22 AND NOT status:blocked` | allowed flows to port 22 | `dport:22 -status:blocked` | no data |
| `block:false AND category:video` | video flows that were not blocked | `-status:blocked category:video` | measured |
| `total:1MB-50MB AND category:video` | video flows of 1 to 50 MB | `total:1MB-50MB category:video` | measured |
| `domain:*.example.com AND NOT status:blocked` | allowed flows to subdomains of example.com | `domain:*.example.com -status:blocked` | no data |
| `device.name:*laptop* AND category:video` | video flows of devices named like "laptop" | `device.name:*laptop* category:video` | no data |
| `network.name:Guest AND status:blocked` | blocked flows on the network named Guest | `network.name:Guest status:blocked` | no data |

### search_rules

The API applies the query; `search_rules` then checks the rules it returns as described under [Rules](#rules).

| Query | Finds | Sent as | Basis |
|-------|-------|---------|-------|
| `action:block OR action:allow` | block and allow rules | `action:block,allow` | measured |
| `action:block AND NOT status:paused` | block rules that are not paused | `action:block -status:paused` | measured |
| `id:00000000-0000-0000-0000-000000000000:1` | one rule by its ID | `id:00000000-0000-0000-0000-000000000000:1` | measured |
| `action:block AND status:active` | active block rules | `action:block status:active` | measured |
| `action:timelimit` | time-limit rules | `action:timelimit` | no data |
| `status:paused` | paused rules | `status:paused` | measured |
| `status:paused AND box.id:00000000-0000-0000-0000-000000000000` | one box's paused rules | `status:paused box.id:00000000-0000-0000-0000-000000000000` | measured |
| `device.id:"AA:BB:CC:DD:EE:01"` | rules scoped to one device | `device.id:"AA:BB:CC:DD:EE:01"` | no data |
| `box.group.id:1 AND action:block` | block rules of box group 1 | `box.group.id:1 action:block` | no data |

### search_devices

The query is not sent; the server filters the device list.

| Query | Matches |
|-------|---------|
| `online:false` | offline devices |
| `online:false AND mac_vendor:samsung` | offline devices whose vendor contains "samsung" |
| `mac_vendor:apple OR mac_vendor:samsung` | Apple or Samsung devices |
| `ip:192.168.*` | devices in 192.168.x.x |
| `online:true AND ip:192.168.1.*` | online devices in 192.168.1.x |
| `mac:AA:BB:CC:DD:EE:01` | the device with that MAC address |
| `id:ovpn:*` | OpenVPN clients |
| `name:"living room"` | devices whose name contains "living room" |
| `online:true AND NOT mac_vendor:apple` | online devices from other vendors |
| `online:false OR name:nas` | offline devices, and devices named like "nas" |
| `(name:tv OR name:nas) AND online:true` | online devices named like "tv" or "nas" |
| `group.name:kids AND online:true` | online devices in a group named like "kids" |
| `gid:00000000-0000-0000-0000-000000000000 AND online:false` | one box's offline devices |

### search_target_lists

The query is not sent; the server filters the lists the API returns for `owner`.

| Query | Matches |
|-------|---------|
| `category:social` | lists in the social category |
| `category:social OR category:games` | social or games lists |
| `owner:global AND category:social` | MSP-wide social lists |
| `NOT owner:firewalla` | lists that are not Firewalla-managed |
| `name:*social*` | lists named like "social" |
| `notes:"social media"` | lists whose notes contain "social media" |
| `targets:*.twitter.com` | lists with the entry `*.twitter.com`, or an entry ending in `.twitter.com` |
| `target_count:>1000` | lists of more than 1000 entries |
| `last_updated:>=2026-09-01` | lists changed since 2026-09-01 |

For one box's lists, pass `owner` too, e.g. `owner: "global,00000000-0000-0000-0000-000000000000"` with `category:games`.

### get_active_alarms, get_flow_data and get_network_rules

These run no field check; the rewrite and the refusals apply as for the search tools.

| Tool | Query | Finds | Sent as | Basis |
|------|-------|-------|---------|-------|
| `get_active_alarms` | `type:1 OR type:10` | active Security or Porn Activity alarms | `status:1 type:1,10` | measured |
| `get_active_alarms` | `status:2 AND type:5` | archived New Device alarms | `status:2 type:5` | measured |
| `get_active_alarms` | `ts:>24h` | active alarms of the last 24 hours | `status:1 ts:><now-86400>` | measured |
| `get_flow_data` | `status:blocked region:CN` | blocked flows to or from China | `status:blocked region:CN` | measured |
| `get_flow_data` | `category:social -region:CN` | social flows, excluding China | `category:social -region:CN` | measured |
| `get_flow_data` | `dport:443 AND status:blocked` | blocked flows to port 443 | `dport:443 status:blocked` | measured |
| `get_network_rules` | `action:block OR action:timelimit` | block and time-limit rules | `action:block,timelimit` | measured |

## Optimization tips

For a search that is slow or times out:

- Narrow the window with a `ts:` range and name a box with `box.id:` (or set `FIREWALLA_BOX_ID`).
- Count with `groupBy` instead of fetching records: `search_alarms` with `groupBy: "type"` or `"status"`, `search_flows` with `groupBy: "category"`. The API returns one item per group with the group's total count in the query window (measured), not one per record.
- Lower `limit` on alarms and flows. `/v2/alarms` and `/v2/flows` return at most 500 records per request, so a larger limit means one request per 500. `/v2/rules` has no documented limit or cursor and returns every matching rule in one response.
- Pass `box` to `search_devices` and `owner` to `search_target_lists`, which scope the API request; their query only filters what comes back.
