# Field names

The fields each tool's `query` takes are in the query syntax guide, one
table per entity: [alarms](query-syntax-guide.md#alarms),
[flows](query-syntax-guide.md#flows), [rules](query-syntax-guide.md#rules),
[devices](query-syntax-guide.md#devices) and
[target lists](query-syntax-guide.md#target-lists).

The server does not map field names to the API's. Before a query goes to
the API it rewrites only these, and sends everything else as written
([where the query goes](query-syntax-guide.md#where-the-query-goes)):

| Tool | You write | Sent |
|---|---|---|
| `search_flows`, `get_flow_data` | `blocked:true`, `block:true` | `status:blocked` |
| `search_flows`, `get_flow_data` | `blocked:false`, `block:false` | `-status:blocked` |
| `search_flows`, `get_flow_data` | `bytes:>1MB` | `total:>1MB` |
| `search_alarms`, `get_active_alarms` | `source_ip:192.168.1.*` | `device.ip:192.168.1.*` |
| alarm and flow tools | `ts:>1h` | `ts:` with Unix seconds |

What happens to a field the API does not document depends on the tool
(measured on a stub on 2026-09-29, with `bogusfield:1`, `foo.bar:1`,
`severity:high` and `source_ip:10.0.0.1`):

| Tools | A flat name the tool does not list | A dotted path |
| --- | --- | --- |
| `get_flow_data`, `get_active_alarms`, `get_network_rules` | sent as written | sent as written |
| `search_flows`, `search_alarms` | refused before any request: "Query contains invalid field names", with the fields it takes | sent as written |
| `search_rules`, `search_devices`, `search_target_lists` | refused before any request | refused before any request |

The lists of `search_flows` and `search_alarms` hold some names the API
does not document, and those are sent too: `search_flows` sends
`source_ip:` as written, and `search_alarms` sends `severity:`. MSP alarms
have no severity, so use their `type` (1 to 16); flows are narrowed to a
device by `device.id` or `device.name`.

What the API does with a qualifier it does not know was measured only on
flows: `country:` and `asn:` answered 200 with no results (2026-09-26). So an
empty answer to a query with an undocumented field says nothing about the
traffic. A query can also be refused by the API itself: a quoted free-text
phrase with a `:` in it answers 400. Geographic names other than `region`
and `remote.region` are refused before any request; see the
[geographic guide](geographic-data-handling-guide.md).
