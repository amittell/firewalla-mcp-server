# Firewalla MCP Server - Error Handling Guide

What a tool answers when it fails, and why. The code is `createErrorResponse`
in `src/validation/error-handler.ts`, the axios interceptors in
`src/firewalla/client.ts`, `src/firewalla/rate-limit.ts` and
`src/utils/timeout-manager.ts`.

## Table of Contents

- [Error Response Format](#error-response-format)
- [Error Types](#error-types)
- [Failed API Requests](#failed-api-requests)
- [Retries](#retries)
- [Rate Limit Errors](#rate-limit-errors)
- [Timeout Errors](#timeout-errors)
- [Validation Errors](#validation-errors)
- [Query Errors](#query-errors)
- [Configuration Errors](#configuration-errors)
- [Handling Errors in a Client](#handling-errors-in-a-client)

## Error Response Format

Every tool error is one JSON object:

```typescript
interface StandardError {
  error: true;                          // Always true for error responses
  message: string;                      // Human-readable error description
  tool: string;                         // Name of the tool that generated the error
  errorType: ErrorType;                 // Specific error category
  details?: Record<string, unknown>;    // Additional error context
  validation_errors?: string[];         // Array of validation error messages
  timestamp?: string;                   // ISO timestamp when error occurred
  context?: {                           // In the type; no tool fills it
    endpoint?: string;
    parameters?: Record<string, unknown>;
    userAgent?: string;
    requestId?: string;
  };
}
```

It reaches the MCP client as the text of the result, with `isError` set:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...error object...}"
    }
  ],
  "isError": true
}
```

An error stays compact JSON even when a read tool was called with
`response_format: "markdown"`: only a successful read is rendered as
markdown (`toMarkdownResponse` in `src/utils/response-format.ts` returns an
error unchanged). `response_format` is taken off the arguments before the
handler runs, and a value other than `json`, `markdown` or `null` is itself
refused as a `validation_error`.

## Error Types

| `errorType` | Set when |
|---|---|
| `validation_error` | The input was refused before any request: a parameter, the query's syntax or fields, a query the MSP API cannot run, a geographic filter |
| `api_error` | A request to the MSP API failed, for most tools; the message says what the API answered |
| `search_error` | The same, for the five search tools |
| `timeout_error` | The tool passed its time limit, 30 s by default |
| `rate_limit_error` | The API answered 429, or the client refused to send a request for the rate limit; see [Rate Limit Errors](#rate-limit-errors) |
| `network_error` | A write tool's request went out and got no HTTP status, or 504: its outcome is unknown. `details.write` is `unknown`; see [Failed API Requests](#failed-api-requests) |
| `authentication_error` | Only `pause_rule`, for a failure whose message has 401, 403 or "permission": a 403 (`Forbidden (HTTP 403)`), not a 401, whose message is `Authentication failed. ...` |
| `unknown_error` | An error no handler caught, such as a call to a tool that is not registered: `Unknown tool: <name>. Available tools: ...` (a write tool without `FIREWALLA_ENABLE_WRITE_TOOLS=true`, for one) |

The `ErrorType` enum also has `cache_error`, `correlation_error`,
`service_unavailable` and `tool_disabled`, which no tool sets. A read's
network failure arrives as `api_error` or `search_error`, and the message
says which.

## Failed API Requests

The handler puts one prefix before the client's message, for example
`Failed to get active alarms: ` or `Failed to search flows: `. The
unknown-outcome messages below have none.

| The API's answer | Message |
|---|---|
| 400 | `Firewalla API answered 400 Bad Request: invalid parameters sent to <path>` |
| 401 | `Authentication failed. Please check your MSP token.` |
| 403 | `Forbidden (HTTP 403): <the API's message>.` It says the request names a box this token cannot access, or the token cannot access the resource, and that `get_boxes` lists the gids the token can access. For a write it adds that the token may be read-only: MSP 2.12 adds read-only tokens |
| 404 | `Resource not found. Please check your Box ID.` `get_specific_alarm` says `Alarm not found: <id>. The alarm may have been deleted or the ID may be incorrect.`, and only when every box it asked answered 404 |
| 429 | `Rate limit exceeded (HTTP 429): ...`; see [Rate Limit Errors](#rate-limit-errors) |
| 500 | `Firewalla API answered 500 Internal Server Error: the Firewalla API is experiencing issues` |
| 502 | `Firewalla API answered 502 Bad Gateway: a gateway could not reach the Firewalla API server, or the resource ID is invalid` |
| 503 | `Firewalla API answered 503 Service Unavailable: the Firewalla API is temporarily down` |
| 504 | `Firewalla API answered 504 Gateway Timeout: a gateway timed out waiting for the Firewalla API`. To a write: `POST /v2/rules got 504 Gateway Timeout: a gateway stopped waiting for the Firewalla API, which may still carry it out. The outcome is unknown: ...`, as `network_error` (below) |
| Never reached the API | `Could not reach the Firewalla API (ENOTFOUND: ...)`: the connection was refused, the host did not resolve or was unreachable, or TLS failed. Not sent again, and a write that failed this way was not applied |
| No answer, to a read | `Firewalla API sent no answer (ECONNABORTED: timeout of 30000ms exceeded)`, with `after 2 attempts` when it was sent again |
| No answer, to a write that went out | `POST /v2/rules was sent and not answered (ECONNABORTED: timeout of 100ms exceeded). The outcome is unknown: Firewalla may have applied the change. Check with get_network_rules before trying again.` as `network_error`, with no prefix, `details.write: "unknown"` and the read in `details.check`. `archive_alarm`, `mute_alarm` and `delete_alarm` say the alarm may or may not have been changed and to check with `get_specific_alarm` |

A write answered 502 or 503 is a failure and is not sent again: the API
did not take it.

A GET that got 502, 503 or 504 is sent again once (see [Retries](#retries)), and the
message then says so after the status: `Firewalla API answered 503 Service
Unavailable after 2 attempts: ...`. `after 2 attempts` counts every time the
request went to the API, a 429's retries included, as `coverage.api_requests`
does.

## Retries

The client sends a GET again once, 1 to 2 s later, after a 502, 503 or 504,
or after no answer with `ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET` or `EPIPE`.
It does so only when, from the later of that wait and the rate limiter's
next slot, as long again as the failed attempt took ends before the tool
gives up. This is checked again when the retry would take a slot and when it
would go out; a retry that no longer fits is not sent, takes no slot, and
the failure it was for is reported at once. So with the defaults
(`API_TIMEOUT` and the tool timeout both 30 s) a GET that ran out its
timeout is not sent again, while a 503 that came back at once is. The retry
goes through the rate limiter and counts against it, and a 429 answered to
it is handled like any 429 (below).

Nothing else is sent again: not a 500 or another 4xx, not `ECONNREFUSED` or
`ENOTFOUND`, and never a POST, PATCH, PUT or DELETE, which the API may have
applied before its answer was lost. A 429 has its own wait (below). Tool
handlers do not retry on top of the client.

## Rate Limit Errors

Each server process starts at most `API_RATE_LIMIT` requests (default 100) in
any rolling 5 minutes, and a request waits at most 20 s for a slot. Both
kinds of refusal are `rate_limit_error`, after the tool's prefix. The
messages:

```text
Rate limit exceeded: the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 83 s, at 2026-09-26T01:39:53Z. Not sent: this client started 100 requests in the last 5 minutes, and a request waits at most 20 s for the rate limit.

Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 190 s, at 2026-09-26T01:39:53Z. Not retried, as a request waits at most 20 s for the rate limit.
```

The wait is in the message only; there is no `retryAfter` field. After a 429
the client pauses every request until the window ends, and sends a GET again
at most twice, only when the pause ends within its 20 s. A write that gets a
429 is not sent again (`A POST is not retried.`).
[rate-limiting-guide.md](rate-limiting-guide.md) has the details, including
what to do when several processes share one token.

## Timeout Errors

A tool gives up after 30 s (`PERFORMANCE_THRESHOLDS.TIMEOUT_MS` in
`src/config/limits.ts`). Its requests still in flight are cancelled, and the
ones not yet sent are not sent and take no slot of the rate limit. A read
tool answers `timeout_error`:

```text
Operation timed out after 30012ms (limit: <m>ms).
This usually indicates the request scope is too large or the API is under heavy load.
```

followed by tips for the tool, with `duration`, `timeoutMs` and
`performance_context` in `details`. Narrow the query, lower `limit`, or page
with `cursor`.

A write tool says what became of its write instead, since the generic advice
would have the caller send it again. `details.write` is `not_sent`,
`unknown` or `applied`:

```text
pause_rule gave up after 30012 ms with POST /v2/rules/<id>/pause sent and not answered. The outcome is unknown: Firewalla may have applied the change. Check with get_network_rules before trying again.

create_target_list gave up after 30004 ms while POST /v2/target-lists waited for the rate limit. It was not sent, so nothing was changed.
```

`archive_alarm`, `mute_alarm` and `delete_alarm` do not use the tool timeout.
A write of theirs that got no HTTP status says the alarm may or may not have
been changed, and to check it with `get_specific_alarm` before retrying.

## Validation Errors

A parameter that fails its check is refused before any request, with the
message `Parameter validation failed` (`Query parameter validation failed`
for a search tool's query) and the reasons in `validation_errors`:

| Input | `validation_errors` |
|---|---|
| A required parameter left out | `query is required but was not provided`, then `Please provide a valid string value for query` |
| A number that is not one | `limit must be a valid number`; a numeric string such as `"100"` is converted and accepted |
| A boolean for a number | `limit must be a number, got boolean` |
| Over the maximum | `limit is too large ... (got 50000, maximum: 1000)` |
| Zero or less | `limit must be a positive number ... (got 0, minimum: 1)` |

The tool schemas list each tool's required parameters and maximum `limit`.

An ID that goes into a request path (`id`, `rule_id`, `alarm_id`, `gid`,
`device_id`) is refused, naming the argument, when it holds `/`, a
backslash, `?`, `#`, `%`, whitespace or a control character, or is `.` or
`..`. It is checked as given, never trimmed.

## Query Errors

| Message | Cause |
|---|---|
| `Invalid query structure` | A parenthesis or bracket that is never closed or never opened, a control character (U+0000 to U+001F other than tab, line feed and carriage return, U+007F, or U+0080 to U+009F), or more than 2000 characters, checked outside quotes by every query-taking tool: `Query opens a parenthesis '(' at position 0 that is never closed`, `Query contains a control character (U+0085) at position 12`, `Query is too long (2008 characters; maximum 2000)` |
| `Invalid query syntax` | A comma list with a space around a comma (`online:true, false`), among others; `details.syntax_errors` says what, and `details.examples` gives queries that work |
| `Query is too complex` | More than 20 `AND`/`OR`, 15 field terms or 5 `[low TO high]` ranges, counted outside quotes: `Too many logical operators: 21 (at most 20)`, `Too many field terms: 16 (at most 15)`, `Too many ranges: 6 (at most 5)` |
| `Query contains invalid field names` | A field the tool does not know. [query-syntax-guide.md](query-syntax-guide.md) lists each entity's fields; a bare MAC address gets a hint to write `mac:` (devices) or `device.id:` (others) |
| `Query "<query>" cannot be sent to the MSP API: ...` | A query with no form in the API's grammar: an `OR` between different fields, `NOT` over an `AND`, or `field:[low TO high]` (the API's ranges are `field:low-high`). `details.suggested_queries` gives runnable queries whose results together are the query's, or the query in API form |
| Refusal of `country:`, `continent:`, `city:`, `asn:` and the like | The API has no such qualifier and would match nothing. For countries, the suggestion puts `region:` in their place |

## Configuration Errors

A missing `FIREWALLA_MSP_TOKEN` or `FIREWALLA_MSP_ID` is not a tool error:
the server does not start. It exits with code 1, and the error on stderr,
with its stack trace, names the first variable missing:

```text
Error: Required environment variable FIREWALLA_MSP_ID is not set
```

With `MCP_TEST_MODE=true` and `NODE_ENV=production` it exits with code 1 and
one line: `firewalla-mcp-server: refusing to start: MCP_TEST_MODE=true replaces
the Firewalla credentials with dummy ones and is not allowed with
NODE_ENV=production. ...`

## Handling Errors in a Client

- Decide by `errorType`, then by the message. `validation_error` means
  nothing was sent: fix the input before trying again.
- Do not retry a `validation_error`, a 401 or a 403: the same request fails
  the same way.
- A read that failed with a 5xx or no answer was already sent again once when
  that could help. A retry of your own counts against the 100 requests per 5
  minutes as well.
- For `rate_limit_error` (`Rate limit exceeded`), wait until the time the message gives.
- For a write tool's `timeout_error` or `network_error`, read
  `details.write`: `not_sent` changed nothing; `unknown` may have been
  applied, so check with the read the message names before sending it
  again.
