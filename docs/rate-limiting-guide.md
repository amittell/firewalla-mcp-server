# Firewalla MCP Server - Rate Limiting Guide

The Firewalla MSP API's rate limit, as measured, and what this server's
client does about it. The code is `src/firewalla/rate-limit.ts` and the axios
interceptors in `src/firewalla/client.ts`.

## The MSP API's limit

The official docs do not document rate limits. Measured 2026-09-26 on
`GET /v2/boxes` with one token (details in
[firewalla-api-reference.md](firewalla-api-reference.md#rate-limiting)):

- The API accepts 100 requests per token in each fixed 5-minute (300 s)
  window. A window starts with the first request after the previous one
  ends.
- Over that, it answers HTTP 429 with the body
  `{"error":{"message":"Too Many Requests"}}`, `retry-after` (seconds),
  `x-ratelimit-reset` (epoch seconds) and `x-ratelimit-remaining: 0`.
  `retry-after` and `x-ratelimit-reset` both give the window's end, up to
  about 300 s away (190 and 203 s were measured).
- A refused request is not counted and does not extend the window.
- A successful response carries no rate-limit headers, so the remaining
  quota cannot be read before a 429.

## What the client does

**Pacing.** At most `API_RATE_LIMIT` requests (default 100, range 1-1000)
start in any rolling 5 minutes, counted over every request the client sends.
The server has one client, which its HTTP sessions share. Answers from the
response cache are not requests and are not counted. (`API_RATE_LIMIT` used
to be described as requests per minute, but nothing applied it.)

**Waiting at most 20 s.** Tool handlers give up after 30 s by default, so a
request waits at most 20 s for the rate limit, in the queue and on 429
pauses together, counted from when it was first made. A request whose slot
frees within that waits for it, in the order requests were made. Otherwise it
is not sent and fails at once.

**After a 429.** The client pauses all its requests until the window ends:
until `x-ratelimit-reset` when that is epoch seconds within 10 minutes from
now, else for `retry-after` (seconds or an HTTP date), else for 300 s. The
pause is at least 1 s and at most 10 minutes. A GET is sent again when the
pause ends within its 20 s, at most twice. Otherwise, and always for a POST,
PATCH, PUT or DELETE, the 429 fails at once. While the client is paused, a
new request whose wait would pass 20 s fails without being sent.

**The error.** A rate-limit failure reads like this:

```
Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in 190 s, at 2026-09-26T01:39:53Z. Not retried, as a request waits at most 20 s for the rate limit.
```

`(HTTP 429)` is there when the API refused the request itself. The last
sentence gives the reason: `Not sent: this client started 100 requests in
the last 5 minutes, ...`, `Not sent: the API refused an earlier request with
HTTP 429, ...`, `Gave up after 2 retries.` or `A POST is not retried.` A
tool's error response includes this message.

## stderr lines

| Line | Meaning |
|------|---------|
| `API Request queued for the rate limit: GET <path>` | The request waits, less than 20 s, for a slot or for a 429's pause to end |
| `API Request refused for the rate limit: GET <path>; capacity returns in <n> s` | The request was not sent, because it would wait more than 20 s |
| `API Rate Limited: 429 GET <path>; retrying in <n> s (retry <k> of 2)` | The API refused the request; the client sends it again when the pause ends |

## Troubleshooting

**Tools fail with "Rate limit exceeded" for a few minutes.** The window is
spent. Wait until the time the error gives; every request before then fails
at once rather than waiting.

**429s from the API although the client paces itself.** The count is per
process. Another server, script or client using the same token spends the
same quota without this client counting it. Give each a lower
`API_RATE_LIMIT`, so that together they stay under 100 per 5 minutes.
