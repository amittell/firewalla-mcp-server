# Firewalla MCP Server specification

What the server implements as of 2.0.1. The MCP surface below was measured
on 2026-09-29 from `node dist/server.js` with `MCP_TEST_MODE=true` (dummy
credentials); the rest is read from `src/`. Each tool's arguments are in its
schema (`tools/list`) and in the README's
[tool list](README.md#available-tools-24-read-only-11-opt-in-write-tools).
The MSP API the server calls, with measured behavior, is in
[docs/firewalla-api-reference.md](docs/firewalla-api-reference.md).

## Protocol

- MCP over stdio, the default, or Streamable HTTP with `MCP_TRANSPORT=http`.
- `initialize` answers the protocol version the client asks for: measured
  with `2025-06-18` and with `2024-11-05`. `serverInfo` is
  `{"name": "firewalla-mcp-server", "version": "2.0.1"}`, the capabilities
  are `tools`, `resources` and `prompts`, and `instructions` tell the client
  to treat results as data.

## Transports

**stdio.** The client starts the server as a child process. stdout carries
only JSON-RPC; logs go to stderr. Each client that starts it has its own
process, and so its own rate-limit count and cache.

**HTTP.** `MCP_TRANSPORT=http` serves MCP at `MCP_HTTP_PATH` (default
`/mcp`) on `MCP_HTTP_PORT` (default 3000). The rules, from
`src/http-security.ts` and `src/http-transport.ts`:

- It listens on `MCP_HTTP_HOST`, default `127.0.0.1`. On any other address
  it does not start without `MCP_HTTP_BEARER_TOKEN`, unless
  `MCP_HTTP_ALLOW_NO_TOKEN=true`. A token shorter than 16 characters stops
  startup wherever it listens. With a token, a request without
  `Authorization: Bearer <token>` gets 401.
- A `Host` header other than `localhost`, `127.0.0.1`, `[::1]`, the
  `MCP_HTTP_HOST` address (a wildcard such as `0.0.0.0` adds nothing) or a
  name in `MCP_HTTP_ALLOWED_HOSTS` gets 403.
- A request with an `Origin` header gets 403 unless the origin is in
  `MCP_HTTP_ALLOWED_ORIGINS`, compared as URL origins. An entry with a
  wildcard stops startup.
- Only the configured path, and it with one trailing slash, is served;
  other paths get 404.
- A body may be at most 1 MB, and a client has 10 s for the headers and 30 s
  for the whole request.
- A session (`Mcp-Session-Id`) ends on DELETE, after
  `MCP_SESSION_IDLE_TIMEOUT_MS` without a request (default 30 minutes), or
  when the server restarts.

The README's [HTTP transport security](README.md#http-transport-security)
section has the details and the error texts.

## Tools

24 read-only tools are always registered. `FIREWALLA_ENABLE_WRITE_TOOLS=true`
(any case) registers 11 more, for 35: `create_rule`, `delete_rule`,
`pause_rule`, `resume_rule`, `create_target_list`, `update_target_list`,
`delete_target_list`, `rename_device`, `archive_alarm`, `mute_alarm` and
`delete_alarm`. Only those 11 have `readOnlyHint: false`. Without the flag
they are not listed, and a call to one answers `Unknown tool`.

| Area | Tools |
|---|---|
| Alarms | `get_active_alarms`, `get_specific_alarm` |
| Flows | `get_flow_data`, `get_recent_flow_activity`, `get_bandwidth_usage` |
| Devices and boxes | `get_device_status`, `get_offline_devices`, `get_boxes` |
| Rules | `get_network_rules`, `get_network_rules_summary` |
| Target lists | `get_target_lists`, `get_specific_target_list` |
| Search | `search_flows`, `search_alarms`, `search_rules`, `search_devices`, `search_target_lists` |
| Statistics and trends | `get_simple_statistics`, `get_statistics_by_region`, `get_statistics_by_box`, `get_flow_insights`, `get_flow_trends`, `get_alarm_trends`, `get_rule_trends` |

Every read-only tool also takes `response_format`: `json`, the default, or
`markdown`. The query grammar the search tools take, and what they refuse,
is in [docs/query-syntax-guide.md](docs/query-syntax-guide.md).

## Resources

| URI | Contents |
|---|---|
| `firewalla://summary` | Box online status and device, alarm and rule counts per box, plus blocked flows in a recent sample |
| `firewalla://devices` | The device inventory with status |
| `firewalla://metrics/security` | Security statistics and trends |
| `firewalla://topology` | Network structure and device relationships |
| `firewalla://threats/recent` | Recent alarms and blocked flows, newest first |

All are `application/json`. There are no resource templates.

## Prompts

| Prompt | Arguments |
|---|---|
| `security_report` | `period` |
| `threat_analysis` | `period` |
| `bandwidth_analysis` | `period` (required), `threshold_mb` |
| `device_investigation` | `device_id` (required), `lookback_hours` |
| `network_health_check` | none |

## Results and errors

A tool's result is one text block of compact JSON. A read answers
`{"success": true, "data": ..., "meta": ...}`, except a streamed
`get_flow_data` chunk ([docs/pagination-guide.md](docs/pagination-guide.md)).

A failure is a tool result with `isError: true`, not a JSON-RPC error. Its
text is:

```json
{
  "error": true,
  "message": "Invalid query structure",
  "tool": "search_flows",
  "errorType": "validation_error",
  "timestamp": "2026-09-29T21:44:12.925Z",
  "details": { "query": "(protocol:tcp" },
  "validation_errors": ["Query opens a parenthesis '(' at position 0 that is never closed"]
}
```

`details` and `validation_errors` appear when there is something to put in
them. The `errorType` values, and what each tool answers with, are in
[docs/error-handling-guide.md](docs/error-handling-guide.md).

## MSP API use

Requests go to `https://<FIREWALLA_MSP_ID>/v2/` with
`Authorization: Token <FIREWALLA_MSP_TOKEN>`. The client reads
`/v2/boxes`, `/v2/alarms`, `/v2/flows`, `/v2/devices`, `/v2/rules`,
`/v2/target-lists`, `/v2/stats/*` and `/v2/trends/*`. The write tools
`POST`, `PATCH` or `DELETE` rules, target lists, devices
(`/v2/boxes/{gid}/devices/{id}`) and alarms (`/v2/alarms/{gid}/{aid}`).

**Rate limiting** (`src/firewalla/rate-limit.ts`, details in
[docs/rate-limiting-guide.md](docs/rate-limiting-guide.md)):

- Each process starts at most `API_RATE_LIMIT` requests (default 100,
  1 to 1000) in any rolling 5 minutes. Retries count; cache hits do not.
- A request waits at most 20 s for a slot, then fails with
  `rate_limit_error`.
- After a 429 every request pauses until the API's window ends (at most 10
  minutes). A GET is sent again at most twice, and only when the pause ends
  within its 20 s. A write is never sent again.
- A GET that got 502, 503 or 504, or no answer (`ECONNABORTED`, `ETIMEDOUT`,
  `ECONNRESET`, `EPIPE`), is sent again once, 1 to 2 s later, when its answer
  can still come before the tool gives up.

**Caching** (`src/firewalla/client.ts`): a GET answer is kept for `CACHE_TTL`
seconds (default 300, 0 to 3600), and answers from `/alarms` and `/flows`
endpoints for 15 s. The cache holds at most `CACHE_MAX_ENTRIES` answers
(default 1000), dropping the least recently used. A query with a relative
time (`ts:>1h`) is not cached, and any write clears the cache. Geographic
lookups are local (`geoip-lite`), kept for 1 hour, at most 10,000 addresses.

**Timeouts.** Each request has `API_TIMEOUT` ms (default 30000). A tool
gives up after 30 s (`PERFORMANCE_THRESHOLDS.TIMEOUT_MS`) and cancels its
requests; `archive_alarm`, `mute_alarm` and `delete_alarm` are not under that
limit. A write that timed out, or went out and got no answer, says whether
it may have been applied.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `FIREWALLA_MSP_TOKEN`, `FIREWALLA_MSP_ID` | required | Credentials and MSP domain; without them the server exits with code 1 |
| `FIREWALLA_BOX_ID` | none | Scope every query to one box |
| `FIREWALLA_DEFAULT_BOX_ID` | none | Box for tools that act on one box, such as `get_specific_alarm`, `archive_alarm`, `mute_alarm`, `create_rule` and `rename_device`, without scoping queries |
| `FIREWALLA_ENABLE_WRITE_TOOLS` | off | `true` registers the 11 write tools |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_PORT`, `MCP_HTTP_PATH`, `MCP_HTTP_HOST` | 3000, `/mcp`, `127.0.0.1` | HTTP listener |
| `MCP_HTTP_BEARER_TOKEN` | none | Required beyond loopback, 16 characters or more |
| `MCP_HTTP_ALLOW_NO_TOKEN` | `false` | `true` starts beyond loopback without a token |
| `MCP_HTTP_ALLOWED_HOSTS`, `MCP_HTTP_ALLOWED_ORIGINS` | none | Extra `Host` names and browser origins to accept |
| `MCP_SESSION_IDLE_TIMEOUT_MS` | 1800000 | HTTP session idle limit |
| `API_TIMEOUT` | 30000 | Per-request timeout, ms |
| `API_RATE_LIMIT` | 100 | Requests per rolling 5 minutes, per process |
| `CACHE_TTL`, `CACHE_MAX_ENTRIES` | 300, 1000 | Response cache |
| `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | 100, 10000 | Rows in a markdown table, and the page-size ceiling |
| `LOG_LEVEL`, `DEBUG` | `info`, off | Logging to stderr |
| `MCP_TEST_MODE` | off | Dummy credentials; refused with `NODE_ENV=production` |

`.env.example` has the same variables with longer notes. `src/` also reads
`FIREWALLA_STREAMING_THRESHOLD`, which changes nothing a client sees: it sets
a streaming default no tool uses.

## Source layout

| Path | What it holds |
|---|---|
| `src/server.ts` | The MCP server: tool schemas, stdio and HTTP startup |
| `src/tools/registry.ts`, `src/tools/handlers/` | One handler per tool |
| `src/firewalla/client.ts`, `src/firewalla/rate-limit.ts` | The MSP API client: requests, retries, cache, rate limit |
| `src/utils/msp-query.ts` | The query rewrite into the API's grammar |
| `src/http-transport.ts`, `src/http-security.ts` | The HTTP transport and its checks |
| `src/resources/`, `src/prompts/` | Resources and prompts |
| `src/config/` | Environment, limits and the write-tool flag |
