# Pagination

Which tools return more than one page, how to ask for the next one, and
where each answer puts its cursor. Every shape here was measured on
2026-09-28, and again on 2026-09-29, by running the tools' handlers with
the HTTP layer stubbed, so
nothing reached the API; the cursors shown are the stub's.

Every answer is `{success, data, meta}`, except a streamed `get_flow_data`
chunk, which has its own shape (below).

## Which tools page

| Tool | Next page | Cursor in the answer |
|---|---|---|
| `get_active_alarms` | `cursor` | `data.next_cursor`, with `data.has_more` |
| `search_alarms`, `search_flows` | `cursor` | `data.metadata.cursor`, with `data.metadata.has_more` |
| `get_flow_data`, not streamed | `cursor` | `data.pagination.cursor`, with `data.pagination.has_more` |
| `get_flow_data`, streamed | `streaming_session_id`, or `cursor` for a plain page | `sessionId` and `nextContinuationToken`, with `isFinalChunk` |
| `get_device_status` | `cursor` | `data.next_cursor`, with `data.has_more` |

The other tools return at most `limit` items in one answer and no cursor:
`search_rules`, `get_network_rules`, `search_devices`, `search_target_lists`,
`get_target_lists`, `get_offline_devices` and `get_bandwidth_usage`.
`search_rules` ignores a `cursor`.

## Alarms and flows

The cursor is the API's own `next_cursor`, passed through unchanged. Treat
it as opaque: pass it back exactly as it came, with the same query. With
`limit: 2` on the stub, `search_alarms` answered two alarms,
`metadata.cursor: "QVBJX0NVUlNPUl8x"` and `metadata.has_more: true`; the
same call with that `cursor` answered the rest, `cursor: null` and
`has_more: false`.

- `/v2/alarms` and `/v2/flows` return at most 500 records per request, so a
  page larger than 500 is read in several requests: a limit of 700 sends
  `limit=500`, then follows the API's cursor for the rest.
- `get_flow_data` and `search_flows` report what the page covered in
  `coverage`: `api_requests`, `cached_pages`, the oldest and newest `ts`,
  and `stopped_reason`, `limit_reached` when the API had more and
  `no_more_pages` when it did not.
- A cursor is refused before anything is sent, as a `validation_error`
  with the message `Invalid cursor format`, when it holds characters other
  than letters, digits, `+`, `/`, `=`, `_` and `-`, or is over 1000
  characters. An empty cursor is read as none.
- Each page is a request against the rate limit (100 per 5 minutes by
  default), and a tool call gives up after 30 s. For a large read, narrow
  the query with `ts:` first.

A caller-side loop over every page of a search:

```javascript
async function allFlows(callTool, query) {
  const flows = [];
  let cursor;
  do {
    const result = await callTool('search_flows', {
      query,
      limit: 500,
      ...(cursor && { cursor })
    });
    if (result.isError) {
      throw new Error(result.content[0].text);
    }
    const { data } = JSON.parse(result.content[0].text);
    flows.push(...data.flows);
    cursor = data.metadata.has_more ? data.metadata.cursor : undefined;
  } while (cursor);
  return flows;
}
```

## Streamed get_flow_data

`get_flow_data` streams a limit over 50, or any limit with `stream: true`.
`stream: false` returns a plain page with `pagination.cursor` instead. A
request with a `cursor` or a `groupBy` is not streamed.

A streamed answer is one chunk of up to `limit` flows:

```json
{
  "streaming": true,
  "sessionId": "stream_21971e15-1d22-4727-b063-d30385149fb1",
  "chunkId": 1,
  "data": ["...20 flows..."],
  "count": 20,
  "isFinalChunk": false,
  "nextContinuationToken": "QVBJX0NVUlNPUl8x",
  "coverage": { "api_requests": 1, "cached_pages": 0, "stopped_reason": "limit_reached" },
  "metadata": { "chunkIndex": 0, "totalItemsInSession": 20 }
}
```

- `streaming_session_id: <sessionId>` returns the next chunk, for the same
  query and of the same size: with `limit: 20` and `stream: true` the
  second call answered `chunkId: 2`, 20 flows, `totalItemsInSession: 40`.
  A session expires 10 minutes after its latest chunk.
- A session whose final chunk was returned is refused: `Streaming session
  <id> is already complete: its final chunk (isFinalChunk true) was
  returned`.
- `nextContinuationToken` is the API cursor. Passed back as `cursor`, it
  returns a plain page at that point, not a chunk.

## get_device_status

`get_device_status` reads the whole device list (`GET /v2/devices`, one
request, cached for `CACHE_TTL`), sorts it by name, and returns `limit`
devices. When more remain it returns `next_cursor`, an offset cursor the
server makes, and `has_more: true`: with three sample devices and
`limit: 2`, the first call answered two devices and a cursor, and the call
with that cursor the third device, `next_cursor: null` and
`has_more: false`.

- `total_devices` counts every device; `online_devices`, `offline_devices`
  and `page_size` count the page.
- A cursor the tool did not issue is refused before anything is sent, as a
  `validation_error` with the message `Invalid cursor` (measured with `%%%`
  and with base64 that is not JSON: `Failed to decode cursor: ...` and
  `Pass the next_cursor of a previous get_device_status page, or leave
  cursor out for the first page`).

## Tools without pages

- `search_devices` and `search_target_lists` read the whole list the API
  returns and filter it on the server. They return up to `limit` matches.
- `search_rules` and `get_network_rules` read `GET /v2/rules`, which
  documents no cursor and returns every matching rule in one response, and
  return up to `limit`.
- `get_target_lists` returns up to `limit` lists; `total_lists` counts
  every list, and `has_more` says whether some were left out (two sample
  lists at `limit: 1`: `total_lists: 2`, `has_more: true`).
  `get_offline_devices` returns up to `limit`, and its
  `total_offline_devices` counts every offline device.

For more than one answer holds, narrow the query.
