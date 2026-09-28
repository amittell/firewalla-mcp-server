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

A field the API does not know is sent and matches nothing, and the API
answers that with no results rather than an error. `severity:high` on
alarms and `source_ip:` on flows are sent as written: MSP alarms have no
severity, so use their `type` (1 to 16), and flows are narrowed to a device
by `device.id` or `device.name`. Geographic names other than `region` and
`remote.region` are refused; see the [geographic guide](geographic-data-handling-guide.md).
