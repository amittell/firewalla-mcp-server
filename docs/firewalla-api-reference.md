# Firewalla MSP API Reference

## Overview

This document describes the Firewalla MSP (Managed Service Provider) API v2: endpoints, data models, request/response formats, and examples. It follows the official documentation at https://docs.firewalla.net (synced 2026-09-25). Where this file states behavior that the official docs do not cover, it is marked as measured, with the date of the measurement.

The official docs carry their own caveat: "since Firewalla MSP is still evolving rapidly, this document might be outdated or incorrect."

**Base URL Pattern**: `https://{msp_domain}/v2/`

**Authentication**: All requests require a personal access token in the Authorization header:
```http
Authorization: Token {your_personal_access_token}
```

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
   - [Alarm Management](#alarm-management)
   - [Box Management](#box-management)
   - [Device Management](#device-management)
   - [Flow Management](#flow-management)
   - [Rule Management](#rule-management)
   - [Statistics](#statistics)
   - [Target Lists](#target-lists)
   - [Trends](#trends)
3. [Data Models](#data-models)
4. [Search Functionality](#search-functionality)
5. [Code Examples](#code-examples)
6. [Error Handling](#error-handling)
7. [Conclusion](#conclusion)

---

## API Endpoints

### Alarm Management

Source: https://docs.firewalla.net/api-reference/alarm/

#### Get Alarms
Retrieve alarms with filtering and pagination support.

**Endpoint**: `GET https://{msp_domain}/v2/alarms`

**Query Parameters**:
- `query` (string, optional): Search query for filtering alarms. If no `ts` qualifier is provided, results default to the last 30 days.
- `groupBy` (string, optional): Group alarms by specified fields (comma-separated, e.g. `type,box`)
- `sortBy` (string, optional): Sort alarms (comma-separated, e.g. `ts:desc,total:asc`; default: `ts:desc`)
- `limit` (number, optional): Maximum results (default: 200, max: 500)
- `cursor` (string, optional): Pagination cursor for next page

**Limit**: the official docs give `limit <=500`. Measured 2026-09-25 on a live account: `limit=501` returns HTTP 400 with the message `limit exceeds max allowed value of 500`. Page with `cursor` to read more than 500 alarms.

**sortBy and groupBy** (measured 2026-09-25 on a live account):
- `sortBy=ts:asc` returns the oldest alarms first. `sortBy=timestamp:asc` and `timestamp:desc` sort the same way as `ts:asc` and `ts:desc`; the client sends the documented `ts:`.
- `groupBy=type` returns one `{ "type", "count" }` item per alarm type, and `groupBy=type,box` adds the box `gid`. A grouped response has no `ts`, `aid` or `message`. With `limit=20` these returned 10 and 13 groups and no `next_cursor`.
- `groupBy=device` returns `{ "device": { "id" }, "count" }` items and `groupBy=status` `{ "status", "count" }`; an unknown field (`groupBy=nonsense`) returns 400 with an empty body.
- A grouped request sorted by `ts` returns no groups: `groupBy=type&sortBy=ts:desc` answered `count: 0`, and `sortBy=count:desc` or no `sortBy` returned the groups. `get_active_alarms` and `search_alarms` return the groups as `groups: [{ key, count }]`; on a grouped request the client drops `ts` sort terms and, with none left, sends `count:desc`.

**Response (200 Success)**:
```json
{
  "count": 42,
  "results": [
    {
      "ts": 1641024000,
      "gid": "00000000-0000-0000-0000-000000000000",
      "aid": 12345,
      "type": 1,
      "status": 1,
      "message": "Security activity detected",
      "device": {
        "id": "AA:BB:CC:DD:EE:FF",
        "name": "My Device",
        "ip": "192.168.1.100"
      }
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

#### Get Specific Alarm
Retrieve detailed information about a specific alarm.

**Endpoint**: `GET https://{msp_domain}/v2/alarms/{gid}/{aid}`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (number, required): Alarm ID, the numeric `aid` that alarm listings return

Measured 2026-09-25: a `gid` the token cannot access (an unknown UUID) returns 403 with the `Forbidden` body shown under Get Devices, and a known box with an unknown `aid` returns 404 with an empty body.

**Response (200 Success)**: the alarm, with device information:
```json
{
  "aid": 1,
  "type": 5,
  "message": "Found a new device iPhone connected to your network.",
  "ts": 1664522841.895,
  "gid": "00000000-0000-0000-0000-000000000000",
  "device": {
    "name": "iPhone",
    "id": "AA:BB:CC:DD:EE:FF",
    "ip": "192.168.1.2",
    "network": {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "Lan 1"
    },
    "group": {
      "id": "1",
      "name": "Guest"
    }
  }
}
```

**Responses**: 200 Success, 401 Permission Denied

#### Delete Alarm
Delete a specific alarm.

**Endpoint**: `DELETE https://{msp_domain}/v2/alarms/{gid}/{aid}`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (number, required): Alarm ID

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found

#### Archive Alarm
Archive an alarm. Requires MSP 2.11.0 or later.

The official docs: "The alarm is moved to the archived state and no longer appears among active alarms. Unlike muting, archiving does not create a silence exception, so future traffic matching this alarm can still trigger new alarms."

**Endpoint**: `POST https://{msp_domain}/v2/alarms/{gid}/{aid}/archive`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (number, required): Alarm ID

**Request Body**: none

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found. The official docs show no response body.

**Example Request**:
```bash
curl --request POST \
  --url "https://yourdomain.firewalla.net/v2/alarms/${gid}/${aid}/archive" \
  --header "Authorization: Token <YOUR_TOKEN>"
```

#### Mute Alarm
Mute an alarm. Requires MSP 2.11.0 or later.

The official docs: "It archives the alarm and instructs the box to create a silence exception so that future traffic matching this alarm will no longer trigger new alarms."

**Endpoint**: `POST https://{msp_domain}/v2/alarms/{gid}/{aid}/mute`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (number, required): Alarm ID

**Request Body** (`Content-Type: application/json`):
- `target` ([MuteTarget](#alarm-model), required): what to silence
  - `type`: `alarmType`, `domain` or `ip`
  - `value`: required when `type` is `domain` (a domain name) or `ip` (an IP address); not used for `alarmType`
- `scope` ([MuteScope](#alarm-model), required): which devices the silence applies to
  - `type`: `device`, `group`, `user`, `network` or `all`
  - `value`: the device ID, group ID, user ID or network ID; not used when `type` is `all`

Target semantics from the official data model:
- `alarmType`: "Explicitly silences all future alarms of the same type, regardless of destination."
- `domain`: "Silences all future alarms matching this domain. Wildcard matching is applied automatically, e.g. `example.com` also matches `sub.example.com`."
- `ip`: "Silences all future alarms matching this IP address."

```json
{
  "target": { "type": "domain", "value": "example.com" },
  "scope": { "type": "device", "value": "AA:BB:CC:DD:EE:FF" }
}
```

**Responses**: 200 Success, 400 Bad Request, 401 Permission Denied, 404 Not Found. The official docs show no response body.

**Example Requests**:
```bash
# Mute by alarm type on all devices
curl --request POST \
  --url "https://yourdomain.firewalla.net/v2/alarms/${gid}/${aid}/mute" \
  --header "Authorization: Token <YOUR_TOKEN>" \
  --header "Content-Type: application/json" \
  --data '{"target":{"type":"alarmType"},"scope":{"type":"all"}}'

# Mute a specific destination for one device
curl --request POST \
  --url "https://yourdomain.firewalla.net/v2/alarms/${gid}/${aid}/mute" \
  --header "Authorization: Token <YOUR_TOKEN>" \
  --header "Content-Type: application/json" \
  --data '{"target":{"type":"domain","value":"example.com"},"scope":{"type":"device","value":"AA:BB:CC:DD:EE:FF"}}'
```

### Box Management

Source: https://docs.firewalla.net/api-reference/box/

#### Get Boxes
Retrieve list of Firewalla boxes.

**Endpoint**: `GET https://{msp_domain}/v2/boxes`

**Query Parameters**:
- `group` (string, optional): Get boxes within a specific box group (requires group ID)

No `limit` or `cursor`: the response is a plain array.

Measured 2026-09-25: on an account whose boxes have no group, `group=999999` returned every box with 200, so that account could not show whether `group` filters.

**Response (200 Success)**:
```json
[
  {
    "gid": "00000000-0000-0000-0000-000000000000",
    "name": "My Firewalla",
    "model": "gold",
    "mode": "router",
    "online": true,
    "version": "1.975",
    "license": "license_code_here",
    "publicIP": "203.0.113.1",
    "location": "United States",
    "lastSeen": 1641024000,
    "group": "group_id_here",
    "deviceCount": 25,
    "ruleCount": 10,
    "alarmCount": 3
  }
]
```

### Device Management

Source: https://docs.firewalla.net/api-reference/device/

#### Get Devices
Retrieve list of devices on the network.

**Endpoint**: `GET https://{msp_domain}/v2/devices`

**Query Parameters**:
- `box` (string, optional): Get devices under a specific Firewalla box (requires box ID)
- `group` (string, optional): Get devices under a specific box group (requires group ID)

These are the only documented parameters. The official docs do not document `query`, `sortBy`, `limit` or `cursor` for devices; the response is a plain array, and the official examples filter and sort it on the client.

Measured 2026-09-25 on a live account with two boxes (224 devices, 190 on one box):
- `box=<gid>` returns only that box's devices (190, every one with that `gid`).
- `query=box.id:<gid>`, `limit=5` and `sortBy=name:asc` or `name:desc` return 200 and are ignored: all 224 devices, in the same order as with no parameters. Scope devices to a box with `box`, not with a `box.id:` query.
- An unknown box gid in `box` returns 403 `{"error":{"title":"Forbidden","message":"You are not allowed to access this resource","type":"FORBIDDEN"}}`. So does a malformed one (`box=notagid`). The client reports a 403 with the API's message, says whether the request named a box, and points to `get_boxes`.
- A `box.id:<unknown gid>` query on `/v2/alarms`, `/v2/flows` or `/v2/rules`, and `owner=<unknown gid>` on `/v2/target-lists`, return 200 with no results rather than 403.
- `group=999999` returned all 224 devices; the account has no box groups, so whether `group` filters was not measured.

**MCP tools**: `get_device_status`, `get_offline_devices` and `search_devices` send `box`: their `box` argument, else `FIREWALLA_BOX_ID`, else no parameter (every box's devices).

**Response (200 Success)**:
```json
[
  {
    "id": "AA:BB:CC:DD:EE:FF",
    "gid": "00000000-0000-0000-0000-000000000000",
    "name": "My iPhone",
    "ip": "192.168.120.1",
    "macVendor": "Apple Inc.",
    "online": true,
    "lastSeen": 1641024000,
    "ipReserved": false,
    "network": {
      "id": "network_id",
      "name": "Home Office"
    },
    "group": {
      "id": "group_id",
      "name": "Kids"
    },
    "totalDownload": 1048576,
    "totalUpload": 524288
  }
]
```

#### Update Device
Rename a device. Only `name` can be changed; the API ignores every other field in the body.

**Endpoint**: `PATCH https://{msp_domain}/v2/boxes/{gid}/devices/{id}`

**Path Parameters**:
- `gid` (string, required): Box GID
- `id` (string, required): Device ID (a plain MAC address, or an `ovpn:` / `wg_peer:` prefixed VPN client ID; see [Device Model](#device-model))

**Request Body**:
```json
{
  "name": "Updated Device Name"
}
```

**Parameters**:
- `name` (string, required): New device name, 32 characters max

**Responses**:
- 200 Success: the updated device object
- 400 Bad Request: the name is empty or longer than 32 characters
- 404 Not Found: the device is not found

**MCP tool**: `rename_device` (opt-in with `FIREWALLA_ENABLE_WRITE_TOOLS=true`; takes `gid` or falls back to `FIREWALLA_BOX_ID`)

### Flow Management

Source: https://docs.firewalla.net/api-reference/flow/

#### Get Flows
Retrieve network traffic flow information. Flows are always returned in reverse chronological order.

**Endpoint**: `GET https://{msp_domain}/v2/flows`

**Query Parameters**:
- `query` (string, optional): Search query for flows. If no `ts` qualifier is provided, results default to the last 24 hours.
- `groupBy` (string, optional): Group flows by specified values (e.g., "domain,box")
- `sortBy` (string, optional): Sort flows (comma-separated, e.g. `ts:desc,total:asc`; default: "ts:desc")
- `limit` (number, optional): Maximum results (default: 200, max: 500)
- `cursor` (string, optional): Pagination support

**Limit**: the official docs give `limit <=500`. Measured 2026-09-25 on a live account: `limit=501` returns HTTP 400 with the message `limit exceeds max allowed value of 500`, and `limit=10000` on `/v2/flows` returns the same 400. Page with `cursor` to read more than 500 flows.

**sortBy** (measured 2026-09-25 on a live account): `ts:asc`, `total:desc` and `count:desc` sort as named. `bytes:desc` and `timestamp:asc` return 400 with an empty body; the client sends `total:` and `ts:` for them. A snake_case `sort_by` is ignored (the default `ts:desc` order comes back).

**groupBy** (measured 2026-09-25): a grouped response has one item per group, with the group's `total`, `download`, `upload` and `count` ("totals" below), and no `ts` or `gid`:

| `groupBy` | Item fields |
| --- | --- |
| `device` | `device` (`id`, `ip`, `name`, `macVendor`, `type`, `deviceType`), totals |
| `category` | `category`, totals, `device: {}` |
| `category,domain` | `category`, `domain`, `country`, `region`, totals, `device: {}` |
| `device,category` | `category`, totals, `device` with only `id` |

Groups are not sorted by `total` unless asked: `groupBy=device&sortBy=total:desc` (the official `get-top-bandwidth-usage-devices` example) returns the devices by descending `total`. A grouped response carries `next_cursor` when there are more groups than `limit` (`groupBy=category` returned 10 groups for `limit=20` and no cursor). The client's `getFlowData` passes `groupBy` through; its `searchFlows` does not, because its callers group per-flow results themselves.

Also measured 2026-09-25: `groupBy=domain` returns `domain`, `country`, `region`, totals and `device: {}`; `groupBy=box` the box `gid` and totals; `groupBy=protocol` and `groupBy=region` return groups too, and `groupBy=nonsense` returns 400 with an empty body. A grouped request sorted by `ts` (`sortBy=ts:desc` or `ts:asc`) returns no groups (`count: 0`), while `total:desc` and `count:desc` sort them. `get_flow_data` and `search_flows` return the groups as `groups: [{ key, count, download, upload, total }]`, where `key` is every field of the item but its totals, without the empty `device: {}`; on a grouped request the client drops `ts` sort terms and, with none left, sends `total:desc`.

**Response (200 Success)**:
```json
{
  "count": 150,
  "results": [
    {
      "ts": 1641024000,
      "gid": "00000000-0000-0000-0000-000000000000",
      "protocol": "tcp",
      "direction": "outbound",
      "block": false,
      "download": 1048576,
      "upload": 262144,
      "duration": 300,
      "count": 5,
      "device": {
        "id": "AA:BB:CC:DD:EE:FF",
        "ip": "192.168.1.100",
        "name": "My Device"
      },
      "source": {
        "id": "AA:BB:CC:DD:EE:FF",
        "name": "My Device",
        "ip": "192.168.1.100"
      },
      "destination": {
        "id": "example.com",
        "name": "example.com",
        "ip": "93.184.216.34"
      },
      "region": "US",
      "category": "social",
      "network": {
        "id": "network_id",
        "name": "Home Network"
      },
      "group": {
        "id": "2",
        "name": "Mobile"
      }
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

### Rule Management

Source: https://docs.firewalla.net/api-reference/rule/

#### Get Rules
Retrieve list of firewall rules.

**Endpoint**: `GET https://{msp_domain}/v2/rules`

**Query Parameters**:
- `query` (string, optional): Search conditions for filtering rules

`query` is the only documented parameter. The official docs document no `limit`, `cursor`, `sortBy` or `groupBy` for rules, and say the endpoint "returns all matched rules for now".

**Response (200 Success)**:
```json
{
  "count": 10,
  "results": [
    {
      "id": "rule_id_here",
      "gid": "00000000-0000-0000-0000-000000000000",
      "action": "block",
      "direction": "bidirection",
      "target": {
        "type": "domain",
        "value": "example.com"
      },
      "scope": {
        "type": "device",
        "value": "AA:BB:CC:DD:EE:FF"
      },
      "status": "active",
      "protocol": "tcp",
      "notes": "Block social media",
      "ts": 1641024000,
      "updateTs": 1641024000
    }
  ]
}
```

#### Pause Rule
Pause an existing rule.

**Endpoint**: `POST https://{msp_domain}/v2/rules/{id}/pause`

**Path Parameters**:
- `id` (string, required): Rule ID. In the MSP web UI it is shown at the bottom of the rule's dialog. `GET /v2/rules` and `POST /v2/rules` return it as `<box gid>:<n>`, e.g. `00000000-0000-0000-0000-000000000000:630`.

**Request Body**: none. The official docs and the `pause-an-existing-rule` example send no body and no query string. Neither documents a duration.

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found. The official docs show no response body.

A paused rule has `status: "paused"`, and the Rule model's `resumeTs` is "the auto resume time when this rule is paused". The official docs do not say how that time is set.

**Measured 2026-09-25** on disposable block rules for the domain `mcp-pause-test.example.invalid`, created on one online box and deleted afterwards (three rules, one per run):
- A pause with no body returns 200 with the JSON string `"ok"`. Read back from `GET /v2/rules`, the rule has `status: "paused"` and no `resumeTs` field.
- The pause has no duration. A duration was accepted (200 `"ok"`) and ignored in each form tried: the body `{"duration": 2, "box": "<box gid>"}` that the client sent up to 1.4.1, `{"duration": 2}`, `{"duration": 120}`, and the query string `?duration=2`. None of them set a `resumeTs`.
- After a pause with the body `{"duration": 1, "box": "<box gid>"}` (one minute if the unit were minutes, one second if seconds), the rule was still paused 187 seconds later. It became active only after `POST /v2/rules/{id}/resume`. Longer units were not tested.
- An unknown body such as `{"bogusField": true}` is accepted, and the rule is paused. A body that is not valid JSON returns 400 `{"error":{"title":"Bad request","message":"Bad request"}}`, and the rule stays active.
- Pausing a rule that is already paused returns 200 `"ok"`.
- For a rule ID that does not exist (`00000000-0000-0000-0000-000000000000`), pause returns 403 `{"error":{"title":"Forbidden","message":"You are not allowed to access this resource","type":"FORBIDDEN"}}`, not the documented 404.

No request tried here set `resumeTs`. A rule paused through the API stays paused until it is resumed.

**Client**: `pauseRule` in `src/firewalla/client.ts` sends the request with no body and no query string, and `pause_rule` takes only `rule_id`. Up to 1.4.1 the client sent `{duration, box}` and the tool took a `duration` of 1 to 1440 minutes. The API ignored that duration, so a pause never ended by itself. `pause_rule` now ignores a `duration` argument and says so in its response (`duration_ignored: true` and a `note`).

**Example Request** (as in the official docs and the `pause-an-existing-rule` example):
```bash
curl --request POST \
  --url "https://yourdomain.firewalla.net/v2/rules/${id}/pause" \
  --header "Authorization: Token <YOUR_TOKEN>"
```

#### Resume Rule
Resume a previously paused rule.

**Endpoint**: `POST https://{msp_domain}/v2/rules/{id}/resume`

**Path Parameters**:
- `id` (string, required): Rule ID

**Request Body**: none

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found. The official docs show no response body.

**Measured 2026-09-25** on the same disposable rules: a resume with no body returns 200 with the JSON string `"ok"`, and the rule reads back with `status: "active"`. Resuming a rule that is already active also returns 200 `"ok"`. For a rule ID that does not exist, resume returns the same 403 as pause.

**Client**: `resumeRule` in `src/firewalla/client.ts` sends the request with no body. Up to 1.4.1 it sent `{box}`. After a pause or a resume the client drops its cached `GET /v2/rules` answers, so the next read shows the new status. Before this change, `resume_rule` could read the cached pre-pause `active` status for up to `CACHE_TTL` (300 s by default) and refuse to resume.

**Example Request**:
```bash
curl --request POST \
  --url "https://yourdomain.firewalla.net/v2/rules/${id}/resume" \
  --header "Authorization: Token <YOUR_TOKEN>"
```

#### Create Rule
Create a block or allow rule. Only `block` and `allow` are supported for creation.

Source: https://docs.firewalla.net/api-reference/rule/ (request body) and https://docs.firewalla.net/data-models/rule/ (field rules)

**Endpoint**: `POST https://{msp_domain}/v2/rules`

**Request Body**: a Rule without `id`, `ts`, `updateTs` and `resumeTs`.
```json
{
  "action": "block",
  "direction": "bidirection",
  "gid": "00000000-0000-0000-0000-000000000000",
  "notes": "Block example.com",
  "target": {
    "type": "domain",
    "value": "example.com",
    "dnsOnly": true
  },
  "scope": {
    "type": "device",
    "value": "AA:BB:CC:DD:EE:FF"
  }
}
```

**Field rules from the MSP rule model**:
- If neither `gid` nor `group` is provided, the rule applies to all boxes under the MSP account, including boxes added later.
- `target.type`: `app`, `category`, `domain`, `internet`, `intranet`, `ip`, `net`, `region`, `remotePort`, `targetlist`. `internet` takes no value; `intranet` takes a network ID or no value (all local networks). See [Rule Model](#rule-model) for the value lists.
- `target.dnsOnly` defaults to `true` when creating block rules with `category`, `app`, `targetlist` or `domain` targets.
- `scope.type`: `device`, `group`, `user`, `network`. No scope means all devices.
- `schedule.duration` (seconds) must be present when `schedule.cronTime` is set.

**Responses**: 200 Success (the created rule, including its `id`), 400 Bad Request, 401 Permission Denied

**MCP tool**: `create_rule` (opt-in with `FIREWALLA_ENABLE_WRITE_TOOLS=true`; takes `gid` or falls back to `FIREWALLA_BOX_ID`, and refuses when neither is set)

#### Delete Rule
Permanently delete a rule. Requires MSP 2.11.0 or later. Use Pause Rule to disable a rule temporarily.

**Endpoint**: `DELETE https://{msp_domain}/v2/rules/{id}`

**Path Parameters**:
- `id` (string, required): Rule ID

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found

**MCP tool**: `delete_rule` (opt-in with `FIREWALLA_ENABLE_WRITE_TOOLS=true`; checks the rule exists before sending the DELETE)

### Statistics

Source: https://docs.firewalla.net/api-reference/statistics/

Both statistics endpoints are documented by Firewalla. Earlier project notes called `/stats/simple` a fictional endpoint; that was wrong.

#### Get Statistics
"The Statistics API returns an ordered array of statistical data. It's usually used to render a table."

**Endpoint**: `GET https://{msp_domain}/v2/stats/{type}`

**Path Parameters**:
- `type` (string, required): Statistics type. The official docs list exactly three:
  - `topBoxesByBlockedFlows`: Top boxes by blocked flows
  - `topBoxesBySecurityAlarms`: Top boxes by security alarms
  - `topRegionsByBlockedFlows`: Top regions by blocked flows

**Query Parameters**:
- `group` (string, optional): Get statistics for a specific box group. Global statistics by default.
- `limit` (number, optional): Maximum number of results (default: 5; no maximum documented)

**Response (200 Success)**: an array of [Statistic](#statistics-models). `meta` is a Box (`gid`, `name`, `model`) for the box types and a Region (`code`) for `topRegionsByBlockedFlows`.
```json
[
  {
    "meta": {
      "gid": "00000000-0000-0000-0000-000000000000",
      "name": "My Firewalla",
      "model": "gold"
    },
    "value": 1250
  }
]
```

**Measured 2026-09-25** on a live account with two boxes (the docs give no time window for any statistic):
- `topBoxesBySecurityAlarms` counts Security Activity (type 1) alarms. Its one row (23) equalled the type 1 count of `/v2/alarms?groupBy=type` over the default 30-day window. The box with no such alarms was not listed.
- `topBoxesByBlockedFlows` covers about the last 30 days: its rows summed to within 0.1% of the 30 daily points of `/v2/trends/flows` read minutes earlier.
- `topRegionsByBlockedFlows`: `limit=3` returned 3 rows; the default, `limit=10` and `limit=50` all returned the same 5 rows.
- The values of all three types were unchanged over 22 minutes while the current day's point of `/v2/trends/flows` kept growing, so the statistics appear to be computed periodically rather than live.

**MCP tools**: `get_statistics_by_region` (`topRegionsByBlockedFlows`) and `get_statistics_by_box` (`topBoxesByBlockedFlows` or `topBoxesBySecurityAlarms`, joined with `/v2/boxes` for each box's details)

#### Get Simple Statistics
Retrieve basic statistics overview.

**Endpoint**: `GET https://{msp_domain}/v2/stats/simple`

**Query Parameters**:
- `group` (string, optional): Get statistics for a specific box group. Global statistics by default.

**Response (200 Success)**:
```json
{
  "onlineBoxes": 5,
  "offlineBoxes": 1,
  "alarms": 42,
  "rules": 25
}
```

**Measured 2026-09-25**: `alarms` and `rules` match no count the list endpoints give, and the docs do not say what they cover. On the account measured, `/v2/stats/simple` reported fewer alarms than `/v2/alarms?groupBy=status` counted in the default 30-day window, and fewer rules than `/v2/rules` returned. The `alarmCount` of each box in `/v2/boxes` does not match either: the online box reported a figure close to its active alarm count in `/v2/alarms`, and the offline box a figure far above the alarms the API holds for it. Use `groupBy` counts on `/v2/alarms` for totals.

**Counting alarms and flows exactly**: `count` on a `/v2/alarms` or `/v2/flows` response is the number of results in that page, not a total. With `groupBy`, each result is one group carrying the group's total `count` (see [Measured Query Behavior](#measured-query-behavior)), so `groupBy=status` on `/v2/alarms` gives exact active and archived counts in one request. The `security_report` and `network_health_check` prompts and `firewalla://metrics/security` count this way.

**MCP tool**: `get_simple_statistics` (passes `group`)

### Target Lists

Source: https://docs.firewalla.net/api-reference/target-lists/

A target list is owned either by the MSP (`global`, shareable across all boxes but only available to MSP users) or by one box (not shared with other boxes, but still accessible to the MSP).

#### Get All Target Lists
Retrieve all target lists. If no target list is found, an empty array is returned.

**Endpoint**: `GET https://{msp_domain}/v2/target-lists`

**Query Parameters**:
- `owner` (string, optional): Filter target lists by owner. When not provided, the API returns `global` target lists and Firewalla-managed target lists. Pass a box ID to get target lists for that box, or a comma-separated list such as `global,<box_id>` for several owners.

`owner` is the only documented parameter; there is no `query`, `limit` or `cursor` for target lists.

Measured 2026-09-25 on a live account whose only lists are Firewalla-managed:
- With no parameters, the API returned 13 lists, each with `owner` `firewalla`.
- `owner=firewalla` and `owner=global,firewalla` returned the same 13. `owner=global`, `owner=<box gid>` and `owner=global,<box gid>` returned none, and an unknown parameter name (`ownerx=global`) returned all 13, so `owner` is applied.
- `query=box.id:<gid>`, `limit=2` and `sortBy=name:desc` return 200 and are ignored.
- Every list carried `count`, its number of entries (from 1 to 5,968,164), and none carried `targets` or `category`. `GET /v2/target-lists/{id}` on two of them returned the same `count` and no `targets` either. The lists also carried `type` (`list`), `source`, `beta`, `blockMode` and, on 6 of 13, `actions`. `get_target_lists` and `search_target_lists` report `entry_count` from `targets` when the API sends them, else from `count`, and `targets: null` when it sends none.

**Response (200 Success)**:
```json
[
  {
    "id": "TL-00000000-0000-0000-0000-000000000000",
    "name": "Social Media Sites",
    "owner": "global",
    "targets": [
      "facebook.com",
      "*.twitter.com",
      "instagram.com"
    ],
    "category": "social",
    "notes": "Popular social media platforms",
    "lastUpdated": 1641024000
  }
]
```

#### Get Specific Target List
Retrieve a specific target list by ID.

**Endpoint**: `GET https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Response (200 Success)**: the target list. This response also carries `count`, the number of targets:
```json
{
  "id": "TL-00000000-0000-0000-0000-000000000000",
  "name": "A Simple Target List",
  "owner": "global",
  "count": 2,
  "targets": ["foo.com", "bar.net"],
  "category": "edu",
  "notes": "This is a simple target list",
  "lastUpdated": 1664373339.857
}
```

#### Create Target List
Create a new target list for the whole MSP or for one box under MSP management.

**Endpoint**: `POST https://{msp_domain}/v2/target-lists`

**Request Body**: a Target List without `id` and `lastUpdated`. `name` (24 characters max) and `owner` (`global` or a box gid) are required on creation.
```json
{
  "name": "Gaming Sites",
  "owner": "global",
  "targets": [
    "steam.com",
    "*.gaming.com"
  ],
  "category": "games",
  "notes": "Gaming platforms"
}
```

**Responses**: 200 Success (the created target list with its generated ID), 400 Bad Request, 401 Permission Denied

#### Update Target List
Update an existing target list.

**Endpoint**: `PATCH https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Request Body**: the fields to change (`name`, `targets`, `category`, `notes`). The official docs: "immutable properties should not be supplied in the body and are ignored by the server" (`id`, `owner`, `lastUpdated`).

**Responses**: 200 Success (the updated target list), 400 Bad Request, 401 Permission Denied, 404 Not Found

#### Delete Target List
Delete a target list.

**Endpoint**: `DELETE https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Responses**: 200 Success, 401 Permission Denied, 404 Not Found

### Trends

Source: https://docs.firewalla.net/api-reference/trend/

These are documented endpoints. Earlier project notes called `/trends/flows` a fictional endpoint; that was wrong.

#### Get Trends
Retrieve a statistical trend as a daily time series.

**Endpoints**:
- `GET https://{msp_domain}/v2/trends/flows`: "The number of blocked flows captured each day."
- `GET https://{msp_domain}/v2/trends/alarms`: "The number of alarms generated each day."
- `GET https://{msp_domain}/v2/trends/rules`: "The number of rules created each day."

**Query Parameters**:
- `group` (string, optional): Get trends for a specific box group. Global statistics by default.

**Response (200 Success)**:
```json
[
  {
    "ts": 1641024000,
    "value": 125
  },
  {
    "ts": 1641110400,
    "value": 98
  }
]
```

The official example lists the points newest first.

**Measured 2026-09-25** on a live account:
- `/v2/trends/alarms` and `/v2/trends/flows` returned 30 points in ascending `ts` order, 86,400 seconds apart. Each `ts` was the start of a day in the account's local time zone (not UTC midnight), and the last point was the current day so far.
- Each point also carries `count`, equal to `value`. Flow points also carry `download`, `upload` and `total`, which were all 0.
- A point is an exact daily count: the alarm point for a day equalled `/v2/alarms?query=ts:<day start>-<day end>&groupBy=box`, and the flow point equalled `/v2/flows?query=status:blocked ts:<day start>-<day end>&groupBy=box`.
- `group=1`, a group ID the account does not have, returned 30 points of 0 for alarms and for flows rather than an error.
- `/v2/trends/rules` returned HTTP 400 with an empty body, three times, with and without `group`.
- No parameter for the time range or the interval is documented. The endpoints take no box; a series for one box is counted per day from `/v2/alarms` or `/v2/flows` instead (see "One box" below).

**MCP tools**: `get_alarm_trends` (`/v2/trends/alarms`) and `get_rule_trends` (`/v2/trends/rules`; when it answers 400 the tool counts the creation times of the rules in `/v2/rules` per UTC day, scoped to `FIREWALLA_BOX_ID` unless `group` is given, and says so in its response). Their `period` (`1h`, `24h`, `7d`, `30d`, default `30d`) selects the days that overlap it. The client's `getFlowTrends` reads `/v2/trends/flows`, but no tool exposes it.

**One box**: with a box in scope (`get_alarm_trends`' `box` argument, else `FIREWALLA_BOX_ID` unless `group` is given), `get_alarm_trends` still reads `/v2/trends/alarms` once, account-wide, for the days, so the box's days are those of the unscoped series. It then counts each day that `period` selects with one request, `GET /v2/alarms?query=ts:<day start>-<next day start - 1> box.id:<gid>&groupBy=box`, ending the current day at the time of the request. The box's row `count` is the day's value, 0 when the box has no row. That is 1 request plus 1 per day (31 for `30d`, 9 for `7d`, 3 for `24h`), at most 4 at a time, against the API limit of 100 requests per 5-minute window. The response's `scope` is `box <gid>`, its `source` is `GET /v2/alarms groupBy=box per day`, and its `note` gives the query and the request count; if the API answers a day with items rather than grouped counts, the note says on how many days the counts are lower bounds. `box` together with `group` is refused before any request (a box is in one group, so the pair is redundant or matches nothing), and an explicit `group` takes precedence over `FIREWALLA_BOX_ID`. The client's `getFlowTrends` takes the same `box` and counts `status:blocked ts:<day start>-<next day start - 1> box.id:<gid>` on `/v2/flows` the same way. Without a box in scope both make the one `/v2/trends` request, as before.

---

## Data Models

Source: the Data Models pages at https://docs.firewalla.net (for example https://docs.firewalla.net/data-models/alarm/).

### Alarm Model

```typescript
interface Alarm {
  ts: number;                    // Unix timestamp of alarm generation
  gid: string;                   // Unique Firewalla box identifier
  aid: number;                   // Unique alarm identifier
  type: AlarmType;               // Alarm type (1-16)
  status: AlarmStatus;           // Alarm status (1=Active, 2=Archived)
  message: string;               // Descriptive alarm text
  device?: AlarmDevice;          // Device details (when type != 4)
  remote?: Remote;               // Remote host info (when type in [1,2,8,9,10,16])
  direction?: "inbound" | "outbound" | "local"; // Traffic direction
  transfer?: TransferData;       // Data transfer details (when type in [2,3,4,16])
  dataPlan?: DataPlan;           // Data plan info (when type == 4)
  vpn?: VpnDetails;              // VPN connection details (when type in [11,12,13])
  port?: PortInfo;               // Port opening information (when type == 14)
  wan?: WanInfo;                 // Internet connectivity data (when type == 15)
  protocol?: "tcp" | "udp";      // Transport protocol of this alarm
}

interface AlarmDevice {
  id: DeviceID;                  // Device identifier (see Device Model)
  ip: string;                    // Device IP address
  name: string;                  // Device display name
  port?: number[];               // Ports used on the device
  lastActive?: number;           // Last time the device was active (when type == 7)
  network: Network;              // Network the device was on when the alarm was raised
  group?: Group;                 // Group the device belonged to when the alarm was raised
}

interface Remote {
  ip: string;                    // Remote host IP address
  domain?: string;               // Remote host domain name
  rootDomain?: string;           // Domain name without any subdomains
  region?: string;               // 2-letter ISO 3166 country code
  category?: string;             // Remote host category (see Flow Model categories)
  port?: number[];               // Ports used on the remote host
}

interface TransferData {
  total: number;                 // Total bytes transferred
  percentage?: number;           // Percentage of all bandwidth or data plan
  upload?: number;               // Bytes uploaded
  download?: number;             // Bytes downloaded
  duration?: number;             // Time span of the transfer in seconds
  stats?: Array<{ ts: number; download: number; upload: number }>; // Transfer over time
}

enum AlarmType {
  SECURITY_ACTIVITY = 1,
  ABNORMAL_UPLOAD = 2,
  LARGE_BANDWIDTH_USAGE = 3,
  MONTHLY_DATA_PLAN = 4,
  NEW_DEVICE = 5,
  DEVICE_BACK_ONLINE = 6,
  DEVICE_OFFLINE = 7,
  VIDEO_ACTIVITY = 8,
  GAMING_ACTIVITY = 9,
  PORN_ACTIVITY = 10,
  VPN_ACTIVITY = 11,
  VPN_CONNECTION_RESTORED = 12,
  VPN_CONNECTION_ERROR = 13,
  OPEN_PORT = 14,
  INTERNET_CONNECTIVITY_UPDATE = 15,
  LARGE_UPLOAD = 16
}

enum AlarmStatus {
  ACTIVE = 1,
  ARCHIVED = 2
}

// Request body pieces for POST /v2/alarms/{gid}/{aid}/mute (MSP 2.11.0 or later)
interface MuteTarget {
  type: "alarmType" | "domain" | "ip";
  value?: string;                // Required for "domain" and "ip"
}

interface MuteScope {
  type: "device" | "group" | "user" | "network" | "all";
  value?: string;                // Device, group, user or network ID; not used for "all"
}
```

### Box Model

```typescript
interface Box {
  gid: string;                   // Unique box identifier
  name: string;                  // Box display name
  model: string;                 // Box model
  mode: "router" | "bridge" | "dhcp" | "simple"; // Monitoring mode
  version: string;               // Firewalla software version
  online: boolean;               // Box connection status
  lastSeen?: number;             // Unix timestamp of last online time (only returned while offline)
  license: string;               // Box license code
  publicIP: string;              // Box's public IP address
  group?: string;                // Group ID (nullable)
  location: string;              // Geographical location based on public IP
  deviceCount: number;           // Number of devices on the box
  ruleCount: number;             // Number of rules on the box
  alarmCount: number;            // Number of alarms on the box
}
```

### Device Model

```typescript
interface Device {
  id: DeviceID;                  // Unique identifier
  gid: string;                   // ID of Firewalla box
  name: string;                  // Device display name
  ip: string;                    // Device IP address
  macVendor?: string;            // MAC address vendor
  online: boolean;               // Device connection status
  lastSeen?: number;             // Unix timestamp of last seen (only returned while offline)
  ipReserved: boolean;           // IP reservation status
  network: Network;              // Network object
  group?: Group;                 // Group object
  totalDownload: number;         // Bytes downloaded in 24 hours
  totalUpload: number;           // Bytes uploaded in 24 hours
}

// A device ID is a plain MAC address by default, e.g. "AA:BB:CC:DD:EE:FF".
// Only VPN clients carry a prefix.
type DeviceID =
  | `ovpn:${string}`             // OpenVPN client, followed by its profile ID
  | `wg_peer:${string}`          // WireGuard client, followed by its profile ID
  | string;                      // MAC address (default, no prefix)

interface Network {
  id: string;                    // Network identifier
  name: string;                  // Network name
}

interface Group {
  id: string;                    // Group identifier
  name: string;                  // Group name
}
```

### Flow Model

```typescript
interface Flow {
  ts: number;                    // Unix timestamp of flow end
  gid: string;                   // Firewalla box identifier
  protocol: "tcp" | "udp";       // Network protocol
  direction: "inbound" | "outbound" | "local"; // Traffic direction
  block: boolean;                // Indicates blocked flow
  blockType?: "ip" | "dns";      // Type of block (blocked flows only)
  download?: number;             // Bytes downloaded (regular flows only)
  upload?: number;               // Bytes uploaded (regular flows only)
  total?: number;                // download + upload (not in the official model)
  duration?: number;             // Flow duration in seconds (regular flows only)
  count: number;                 // TCP connections/UDP sessions, or block count for a blocked flow
  device: FlowDevice;            // Device object
  source?: Host;                 // Source host information
  destination?: Host;            // Destination host information
  region?: string;               // 2-letter ISO 3166 country code
  country?: string;              // Equal to region where measured (not in the official model)
  category?: FlowCategory;       // Content category, a plain string
  network: Network;              // Network object
  group?: Group;                 // Group the device belonged to when the flow was captured
  domain?: string;               // Remote domain; "" for a flow to a bare IP (not in the official model)
}

// Measured 2026-09-25 on 200 live flows: every flow had a string `domain`,
// empty on the 118 whose destination.type was "ip" and set on the 82 whose
// destination.type was "dns". There it is the destination.name or a suffix
// of it (e.g. "example.com" for "www.example.com").
// Measured 2026-09-25 on another 200 live flows: every flow had numeric
// `download`, `upload` and `total`, and `total` equaled download + upload
// on all 200 (0 on the 4 blocked flows). Every flow had a top-level
// `network` ({ id, name, type, gid }) and a `country` equal to its
// `region`; none had `device.network` or `group`.

interface FlowDevice {
  id: DeviceID;                  // Device identifier
  ip: string;                    // Device IP address
  name: string;                  // Device display name
}

interface Host {
  id: string;                    // Device ID for a local device, otherwise remote domain or IP
  name: string;                  // Device name for a local device, otherwise remote domain
  ip: string;                    // Host IP address
}

// The official list of category values. The field is a string, not an object.
// Measured 2026-09-25 on a live account: flows carried "av", "social",
// "shopping", "ad", "intel" and "" (empty string when uncategorized).
// "av" is not in the official list.
type FlowCategory =
  | "ad" | "edu" | "games" | "gamble" | "intel" | "p2p"
  | "porn" | "private" | "social" | "shopping" | "video" | "vpn"
  | string;
```

### Rule Model

Source: https://docs.firewalla.net/data-models/rule/

```typescript
interface Rule {
  id: string;                    // Unique rule identifier
  name?: string;                 // Human-readable name of this rule
  gid?: string;                  // Firewalla box ID
  action: "allow" | "block" | "timelimit"; // Rule action (default: "block")
  target: Target;                // Rule target details
  direction: "bidirection" | "inbound" | "outbound"; // Traffic direction (default: "bidirection")
  group?: string;                // Firewalla box group ID (default: "global")
  scope?: Scope;                 // Local rule application scope (unset for all devices)
  notes?: string;                // Descriptive text
  status?: "active" | "paused";  // Rule status
  hit?: Hit;                     // Rule hit stats (marked "Upcoming" in the official docs)
  schedule?: Schedule;           // Rule activation schedule (unset for always active)
  timeUsage?: TimeUsage;         // Time limit details (when action == "timelimit")
  protocol?: "tcp" | "udp";      // Traffic protocol (unset for both)
  resumeTs?: number;             // Auto-resume timestamp (when status == "paused")
  ts: number;                    // Rule creation timestamp
  updateTs: number;              // Last rule update timestamp
}

interface Target {
  type: "app" | "category" | "domain" | "internet" | "intranet" |
        "ip" | "net" | "region" | "remotePort" | "targetlist";
  value: string;                 // Target value (see the mapping below)
  dnsOnly?: boolean;             // DNS-only matching; for category, app, targetlist and domain.
                                 // Defaults to true when creating block rules with these types.
  port?: string;                 // Port or port range; for domain, ip and net
}

interface Scope {
  type: "device" | "group" | "user" | "network";
  value: string;                 // Device ID, group ID, user ID or network ID
  port?: string;                 // Port or port range, matched with the scope value
}

interface Hit {
  count: number;                 // Number of hits
  lastHitTs: number;             // Timestamp of the last hit
  statsResetTs?: number;         // Timestamp of the hit info reset
}

interface Schedule {
  duration: number;              // Seconds the rule takes effect after activation
  cronTime?: string;             // Activation time in cron format
}

interface TimeUsage {
  quota: number;                 // Time usage quota in minutes
  used: number;                  // Time used in minutes
}
```

**Target type and value mapping**:

| `type` | `value` |
|--------|---------|
| `app` | App ID: `discord`, `facebook`, `fortnite`, `instagram`, `netflix`, `roblox`, `snapchat`, `tiktok`, `twitch`, `twitter`, `youtube` |
| `category` | Category code: `drugs`, `games`, `gamble`, `p2p`, `porn`, `social`, `shopping`, `video`, `violence`, `vpn` |
| `domain` | Domain name, e.g. `example.com` |
| `internet` | Always unset; matches all traffic routed through the WAN port(s) |
| `intranet` | Unset for all local networks, or a network ID for one |
| `ip` | IP address, e.g. `192.168.0.1` |
| `net` | Network address in CIDR notation, e.g. `192.168.0.0/24` |
| `region` | 2-letter ISO 3166 code, e.g. `US` |
| `remotePort` | Port or port range, e.g. `443` or `440-443` |
| `targetlist` | Target list ID |

The rule `category` codes differ from the flow and alarm category values: `drugs` and `violence` exist only for rules.

### Target List Model

```typescript
interface TargetList {
  id: string;                    // Unique system-generated identifier (immutable)
  name: string;                  // Readable name (required, max 24 chars)
  owner: "global" | string;      // "global" or box gid (required, immutable)
  targets: string[];             // Domains (with or without wildcard), IPs, or CIDR ranges
  category?: "ad" | "edu" | "games" | "gamble" | "intel" | "p2p" |
            "porn" | "private" | "social" | "shopping" | "video" | "vpn";
  notes?: string;                // Additional description
  lastUpdated: number;           // Unix timestamp of last modification (immutable)
  count?: number;                // Number of targets (returned by GET /v2/target-lists/{id})
}
```

### Statistics Models

```typescript
interface Statistic {
  meta: Region | Box;            // Region or Box metadata
  value: number;                 // Numeric statistic value
}

interface Region {
  code: string;                  // 2-letter ISO 3166 country code
}

// meta for the box statistics types: { gid, name, model }

interface SimpleStatistics {
  onlineBoxes: number;           // Number of online Firewalla boxes
  offlineBoxes: number;          // Number of offline Firewalla boxes
  alarms: number;                // Number of generated alarms
  rules: number;                 // Number of created rules
}
```

### Trend Model

```typescript
interface Trend {
  ts: number;                    // Unix timestamp paired with the data
  value: number;                 // Data point in the time series
}
```

---

## Search Functionality

Source: https://docs.firewalla.net/api-reference/search/

The `query` parameter is available on `/v2/alarms`, `/v2/flows` and `/v2/rules`. The official docs document no `query` parameter for devices, boxes or target lists.

### Search Query Syntax

The query syntax follows the same format as the MSP web UI. Each query is composed of one or multiple space-separated search terms.

**Syntax Definition:**
```bash
query = search-term [ " " search-term ]*
search-term = literal-search | numeric-search
literal-search = [ [ "-" ] qualifier ":" ] literal-match
qualifier = <property-path> | <property-alias>
literal-match = literal [ "," literal ]*
literal = <string> | <quoted-string>
numeric-search = qualifier ":" numeric-match
numeric-match = [ ">" | ">=" | "<" | "<=" ] <number> [ <unit> ] | <number> [ <unit> ] "-" <number> [ <unit> ]
```

In short:
- A space between terms means AND: every term must match. Measured, a field that appears twice is OR instead (`type:1 type:10` matches either type), and `AND`, `OR` and `NOT` are searched as words; see [Measured Query Behavior](#measured-query-behavior).
- A comma between values of one qualifier means OR within that field (`category:social,video`).
- A `-` prefix excludes the matches of a term (`-status:active`).
- `n-m` is a range (`ts:1695196894.395-1695604487.633`).
- Qualifier aliases are case insensitive; literal matching is case sensitive.
- The query string must be URL encoded when sent.

**Example Full Query:**
```bash
box.name:"Gold Plus",Purple mac:"AA:BB:CC:DD:EE:FF" Total:>50MB
```

#### Default Time Windows

If a query has no `ts` qualifier, `/v2/alarms` returns the last 30 days and `/v2/flows` returns the last 24 hours.

#### Literal Search
```bash
# Basic field searches
device.name:iphone
status:active
category:social,video  # Multiple values with comma

# Case sensitive matching
box.name:FirewallaGold
```

#### Wildcard Search
```bash
# Use * for fuzzy matching
device.name:*iphone*     # Matches "iphone-12", "joe-iphone", etc.
domain:*.facebook.com    # Matches any Facebook subdomain
device.ip:192.168.*      # Matches any IP in 192.168.x.x range (measured on alarms, 2026-09-25)
```

Wildcard search does not support unqualified search or exclusive search.

#### Quoted Search
```bash
# For strings with whitespace, comma, asterisk, or colon
box.name:"Gold Plus"
box.name:"Firewalla,GSE"

# Escape quotes, backslashes, and asterisks within quoted strings
box.name:"\"fire"              # Contains quote
box.name:"Fire\\walla:GSE"     # Contains backslash and colon
box.name:"Firewalla Gold\*"    # Contains asterisk
```

#### Numeric Search
```bash
# Comparison operators
download:>10MB          # Greater than
upload:>=1000000        # Greater than or equal to
count:<10               # Less than
total:<=50MB            # Less than or equal to

# Range searches
download:1000-2000      # Between values
ts:1695196894.395-1695604487.633  # Time range
```

Numeric search supports neither unqualified search nor exclusive search.

#### Exclusive Search
```bash
# Exclude results with hyphen prefix
-status:active          # Exclude active status
-category:ad            # Exclude ads
```

### Supported Units

Data transfer qualifiers support the following units:
```
B (Byte)
KB (KiloByte) = 1000 B
MB (MegaByte) = 1000 KB
GB (GigaByte) = 1000 MB
TB (TeraByte) = 1000 GB
```

### Search Qualifiers

The qualifier tables below are the lists in the official documentation.

#### Alarm Qualifiers

| Qualifier | Alias | Description | Example |
|-----------|-------|-------------|---------|
| `ts` | | Timestamp of alarm | `ts:<1695196894.395` |
| `type` | AlarmType | Alarm type (1-16) | `type:1,2,3` or `AlarmType:"Security Activity,Abnormal Upload"` |
| `status` | | Alarm status | `status:active` |
| `box.id` | | Box ID | `box.id:00000000-0000-0000-0000-000000000000` |
| `box.name` | Box | Box name | `box.name:FirewallaGold` |
| `box.group.id` | | MSP group ID | `box.group.id:1` |
| `device.id` | Mac | Device ID (plain MAC) | `device.id:"AA:BB:CC:DD:EE:FF"` |
| `device.name` | Device | Device name | `device.name:iphone` |
| `device.network.id` | | Device network ID | `device.network.id:00000000-1111-1111-1111-000000000000` |
| `device.network.name` | Network | Device network name | `device.network.name:Guest` |
| `remote.category` | Category | Remote host category | `remote.category:porn,game` |
| `remote.domain` | Domain | Remote domain | `remote.domain:google.com` |
| `remote.region` | Region | Remote region (ISO country code) | `remote.region:US` |
| `transfer.download` | Download | Data downloaded (with units) | `transfer.download:>10MB` |
| `transfer.upload` | Upload | Data uploaded (with units) | `transfer.upload:>10MB` |
| `transfer.total` | Total | Total data transfer (with units) | `transfer.total:>50MB` |

#### Flow Qualifiers

| Qualifier | Alias | Description | Example |
|-----------|-------|-------------|---------|
| `ts` | | Timestamp of flow | `ts:<1695196894.395` |
| `status` | | Flow status | `status:ok`; `status:blocked` returns blocked flows (measured 2026-09-25) |
| `direction` | | Traffic direction | `direction:outbound` |
| `box.id` | | Box ID | `box.id:00000000-0000-0000-0000-000000000000` |
| `box.name` | Box | Box name | `box.name:FirewallaGold` |
| `box.group.id` | | MSP group ID | `box.group.id:1` |
| `device.id` | Mac | Device ID (plain MAC) | `device.id:"AA:BB:CC:DD:EE:FF"` |
| `device.name` | Device | Device name | `device.name:iphone` |
| `network.id` | | Network ID | `network.id:00000000-1111-1111-1111-000000000000` |
| `network.name` | Network | Network name | `network.name:Guest` |
| `category` | Category | Content category | `category:porn,game` |
| `domain` | Domain | Domain name | `domain:google.com` |
| `region` | Region | Region (ISO country code) | `region:US` |
| `sport` | SourcePort | Source port | `sport:123` |
| `dport` | DestinationPort | Destination port | `dport:123` |
| `download` | Download | Data downloaded (with units) | `download:>10MB` |
| `upload` | Upload | Data uploaded (with units) | `upload:>10MB` |
| `total` | Total | Total data transfer (with units) | `total:>50MB` |

#### Rule Qualifiers

| Qualifier | Description | Example |
|-----------|-------------|---------|
| `status` | Rule status | `status:active` |
| `action` | Rule action | `action:block` |
| `box.id` | Box ID | `box.id:00000000-0000-0000-0000-000000000000` |
| `box.group.id` | MSP group ID | `box.group.id:1` |
| `device.id` | Device ID | `device.id:"AA:BB:CC:DD:EE:FF"` |

### Advanced Search Features

#### Multiple Search Terms
Combine multiple search terms with spaces (implicit AND):
```bash
status:active box.name:FirewallaGold category:social
```

#### Exclusion with Hyphen
Exclude results by prefixing search terms with hyphen (-):
```bash
-status:active          # Exclude active alarms
category:social -region:CN  # Social media traffic, excluding China
```

#### Unqualified Search
Search terms without qualifiers search across a subset of properties (varies by resource type):
```bash
porn                    # Free text; measured to work on alarms (2026-09-25)
```

### Measured Query Behavior

The official docs do not cover the points below. Each was measured against a live MSP account, on 2026-09-25 unless a date is given.

- **There are no `AND`, `OR` or `NOT` operators** (measured 2026-09-26, with exact counts from `groupBy=box`, which returns each group's total). The API searches them as free-text words: in the default 30-day window, the bare query `AND` matched 417 alarms, `and` 417 and `NOT` 9. Joined to other terms they change the result. On alarms, `type:1` and `type:1 box.id:<gid>` matched 23 and `type:1 AND box.id:<gid>` 0; `type:10 status:1` matched 12 and `type:10 AND status:1` 5; `ts:<30-day range> type:1` matched 23 and `ts:<30-day range> AND type:1` 0. On flows, `status:blocked` matched 23,420, `region:US` 737,886, `status:blocked region:US` 6,318 and `status:blocked AND region:US` 0; `region:US protocol:tcp` matched 465,213 and `region:US AND protocol:tcp` 2,924.
- **`OR` is a word as well** (2026-09-26): `type:1 or` matched 23 alarms and `type:10 or` 12, as many as `type:1` and `type:10`, because every one of those alarms has "or" in its text. That is why `type:1 OR type:10` (35) looked right. Over the last 24 hours of blocked flows, `region:US` matched 6,315, `region:CN` 109, `region:US OR region:CN` 632 and `region:US OR` 628; `status:blocked OR` matched 8,799 of the 23,420 blocked flows.
- **A field repeated, or a comma list, is OR; different fields are AND** (2026-09-26): `type:1 type:10` and `type:1,10` each matched 35 alarms (23 + 12). Over the last 24 hours of blocked flows, `region:US region:CN` matched 6,423 and `region:US,CN` 6,424. Terms on different fields must all match, so one query cannot express an OR between different fields.
- **`-` excludes; `NOT` does not** (2026-09-26): `region:US -protocol:tcp` matched 272,581 flows (`region:US protocol:udp` 272,575), and `region:US NOT protocol:tcp` 285. On alarms `type:10 -status:1` and `type:10 status:2` both matched 0, consistent with all 12 being active.
- **Unknown property paths return no results, not an error.** A qualifier the API does not know returns HTTP 200 with an empty result set. On flows, `block:true` returned 0 results, while `status:blocked` returned the blocked flows. An empty result is therefore not proof that nothing matched.
- **`total:>1MB` works on flows.**
- **`device.ip:192.168.*` works on alarms**, and so does unqualified free text such as `porn`.
- **`message:porn` on alarms returns an error.** `message` is not a searchable alarm qualifier.
- **`id:<rule id>` works on rules**, though it is not a documented rule qualifier. On `/v2/rules`, `id:<box gid>:<n>` alone or with `box.id:<box gid>`, with or without `limit=1`, returned just that rule (count 1; the box had 61 other rules). The status check in `pause_rule`, `resume_rule` and `delete_rule` uses it, and it matches the returned rule's `id` instead of taking the first result.
- **`groupBy` returns one row per group with the group's total.** On `/v2/alarms`, `groupBy=status` returned `{status, count}` rows, `type` returned `{type, count}` and `box` returned `{gid, count}`; on `/v2/flows`, `box` rows also carried `device`, `download`, `upload` and `total`. The rows have no `ts`, and `count` is the number of matching items in the query window, not limited by `limit`: with `limit=10`, a box's row counted tens of thousands of blocked flows. The row totals agreed across `status`, `type` and `box`. A plain alarm item also carries `count: 1`.
- **Parentheses match nothing**: `(type:1 OR type:10) box.id:<gid>` and `(type:1 OR type:10) AND box.id:<gid>` returned no alarms, where `type:1,10 box.id:<gid>` did; on 2026-09-26, `(region:US OR region:CN)` with other terms returned 0 flows. `type:1 OR type:10 box.id:<gid>` returned the same alarms as `type:1,10 box.id:<gid>` only because the repeated `type` is OR and every one of those alarms has "or" in its text (see above).
- **`/v2/alarms` returns archived alarms too** unless the query names a status: in the default 30-day window, `groupBy=status` counted active (`status:1`) and archived (`status:2`) alarms together. `get_active_alarms` adds `status:1` unless the query names a status.

**What the client sends.** Every GET to `/v2/alarms`, `/v2/flows` and `/v2/rules` sends its `query` through `toMspQuery` (`src/utils/msp-query.ts`), after the qualifier renames and the box scope, so the tools can take `AND`, `OR`, `NOT` and parentheses:

- `AND`, or no operator, becomes a space: `type:1 AND status:1` is sent as `type:1 status:1`.
- `OR` between values of one field becomes a comma list, also inside parentheses: `region:US OR region:CN` is sent as `region:US,CN`, and `status:blocked AND (region:US OR region:CN)` as `status:blocked region:US,CN`.
- `NOT` becomes the `-` prefix: `region:US AND NOT protocol:tcp` is sent as `region:US -protocol:tcp`. `NOT` of an `OR` excludes each term: `NOT (region:US OR region:CN)` is sent as `-region:US -region:CN` (this repeated exclusion is not yet measured). The grammar has no exclusion of numeric terms, so `NOT total:>1MB` is sent as `total:<=1MB`.
- A lower and an upper bound on one field become one range: `ts:>=a AND ts:<=b` is sent as `ts:a-b` (measured equal: 197 alarms either way). A range includes its ends, so a pair with a strict bound (`ts:>a AND ts:<b`) is refused, with the inclusive range as the suggestion.
- A query that has no form in this grammar is refused with a validation error before anything is sent, naming the part and, where there are some, the searches to run instead: an `OR` between different fields (`region:US OR category:social`), `NOT` over an `AND`, the exclusion of free text, a wildcard or a range, two other conditions on one field (the API would read them as either), and a `box.id` other than the box the request is scoped to (the API would read the two as either box).
- Lowercase `and`, `or` and `not` stay words, as the API reads them. A query already in this form (spaces, commas, `-`) is sent unchanged.

### Pagination Support

`/v2/alarms` and `/v2/flows` support cursor-based pagination. Each response (except the last) includes a base64 encoded `next_cursor`. Use this cursor in subsequent requests to get the next page of results. `/v2/rules` has no `limit` or `cursor` and "returns all matched rules for now"; boxes, devices and target lists return plain arrays.

**JavaScript Example:**
```javascript
const params = {
    query: `status:active box:${box}`,
    cursor: null,
    limit: 10
}
const alarms = [];

while (1) {
    const { results, next_cursor } = await httpClient({
        method: 'get',
        url: `/alarms`,
        params: params
    }).then(r => r.data);
    alarms.push(...results);
    if (!next_cursor) break;
    params.cursor = next_cursor;
}
```

**Important Notes:**
- Query strings must be URL encoded when sending requests
- `next_cursor` values are opaque - do not modify them
- Set `cursor` parameter to `null` or omit it for the first request
- Use `limit` parameter to control page size (default: 200, max: 500). A `limit` above 500 returns HTTP 400 (measured 2026-09-25).
- Always check for `next_cursor` in response to determine if more pages exist

---

## Code Examples

### Node.js with Axios

#### Basic Setup
```javascript
const axios = require('axios');

const config = {
  mspDomain: 'your-domain.firewalla.net',
  token: 'your_personal_access_token'
};

const apiClient = axios.create({
  baseURL: `https://${config.mspDomain}/v2`,
  headers: {
    'Authorization': `Token ${config.token}`,
    'Content-Type': 'application/json'
  }
});
```

#### Get Active Alarms
```javascript
async function getActiveAlarms(limit = 100) {
  try {
    const response = await apiClient.get('/alarms', {
      params: {
        query: 'status:active',  // Active alarms only
        limit: limit,            // 500 at most
        sortBy: 'ts:desc'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alarms:', error.response?.data || error.message);
    throw error;
  }
}
```

#### Get Device Bandwidth Usage
Group flows by device and sort by total transfer, as in the official `get-top-bandwidth-usage-devices` example (https://github.com/firewalla/msp-api-examples).
```javascript
async function getTopBandwidthUsers(boxId, limit = 10) {
  const end = Math.floor(Date.now() / 1000);
  const begin = end - 24 * 3600; // last 24 hours
  try {
    const response = await apiClient.get('/flows', {
      params: {
        query: `ts:${begin}-${end} box.id:${boxId}`,
        groupBy: 'device',
        sortBy: 'total:desc',
        limit: limit
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching flows:', error.response?.data || error.message);
    throw error;
  }
}
```

#### Block a Domain
```javascript
async function createBlockRule(domain, boxId) {
  try {
    const response = await apiClient.post('/rules', {
      action: 'block',
      target: {
        type: 'domain',
        value: domain
      },
      direction: 'bidirection',
      gid: boxId,        // the box this rule applies to; no scope means all its devices
      notes: `Block ${domain}`
    });
    return response.data;
  } catch (error) {
    console.error('Error creating rule:', error.response?.data || error.message);
    throw error;
  }
}
```

#### Search High-Risk Flows
```javascript
async function searchHighRiskFlows(boxId, hours = 1) {
  const end = Math.floor(Date.now() / 1000);
  const begin = end - hours * 3600;
  try {
    const response = await apiClient.get('/flows', {
      params: {
        // Space means AND, comma means OR within one qualifier
        query: `ts:${begin}-${end} box.id:${boxId} category:porn,gamble`,
        limit: 200,
        sortBy: 'ts:desc'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error searching flows:', error.response?.data || error.message);
    throw error;
  }
}

// Blocked flows use the status qualifier (block:true returns no results):
//   query: `ts:${begin}-${end} box.id:${boxId} status:blocked`
```

### cURL Examples

#### Get Box Information
```bash
curl --request GET \
  --url "https://your-domain.firewalla.net/v2/boxes" \
  --header "Authorization: Token your_personal_access_token"
```

#### Get Offline Devices
The devices endpoint has no `query` parameter; filter the array on the client.
```bash
curl --request GET \
  --url "https://your-domain.firewalla.net/v2/devices?box=your_box_gid_here" \
  --header "Authorization: Token your_personal_access_token" \
  | jq '.[] | select(.online == false)'
```

#### Pause a Rule
```bash
curl --request POST \
  --url "https://your-domain.firewalla.net/v2/rules/rule_id_here/pause" \
  --header "Authorization: Token your_personal_access_token"
```

#### Create Target List
```bash
curl --request POST \
  --url "https://your-domain.firewalla.net/v2/target-lists" \
  --header "Authorization: Token your_personal_access_token" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Social Media",
    "owner": "global",
    "targets": ["facebook.com", "*.twitter.com", "instagram.com"],
    "category": "social",
    "notes": "Popular social media platforms"
  }'
```

### Environment Configuration

#### Using Environment Variables
```bash
# Set environment variables
export FIREWALLA_MSP_DOMAIN="your-domain.firewalla.net"
export FIREWALLA_MSP_TOKEN="your_personal_access_token"
export FIREWALLA_BOX_ID="your_box_gid_here"

# Run your application
node your_app.js
```

#### Configuration File (.env)
```env
FIREWALLA_MSP_DOMAIN=your-domain.firewalla.net
FIREWALLA_MSP_TOKEN=your_personal_access_token
FIREWALLA_BOX_ID=your_box_gid_here
```

---

## Error Handling

### Common HTTP Status Codes

The official docs list these per endpoint:
- **200 Success**: Successful request
- **400 Bad Request**: Invalid request, for example a device name over 32 characters, an invalid mute body, or a `limit` above 500 on `/v2/alarms` or `/v2/flows`
- **401 Permission Denied**: Invalid or missing authentication token
- **404 Not Found**: Resource not found

Measured, not in the official docs:
- **429 Too Many Requests**: Rate limit exceeded (see below)
- **403 Forbidden** for `POST /v2/rules/{id}/pause` and `/resume` with a rule ID that does not exist, where the official docs list 404 (measured 2026-09-25)

### Error Response Format

The official docs do not document an error body format. Measured 2026-09-25, a limit error carries the message `limit exceeds max allowed value of 500`, and a rate-limit error has this body:

```json
{"error":{"message":"Too Many Requests"}}
```

### Rate Limiting

The official docs do not document rate limits. Measured 2026-09-26 on `GET /v2/boxes` with one token, in three bursts:

- **Burst 1.** 99 requests in 29.9 s were answered 200. The next was answered 429 with the body `{"error":{"message":"Too Many Requests"}}`, `retry-after: 190`, `x-ratelimit-reset` in epoch seconds (189.9 s ahead) and `x-ratelimit-remaining: 0`.
- A request right after that was answered 429 with `retry-after: 189` and the same `x-ratelimit-reset`: a refused request is not counted and does not extend the block.
- A request at exactly `retry-after` was answered 200, and so was a single request 42 s later, so the window does not slide over the last 300 s.
- **Burst 2**, starting 70 s after that reset: 98 requests were answered 200, then 429 with `x-ratelimit-reset` 301 s after the previous reset and `retry-after: 203`. With the 2 requests made since the reset, that is exactly 100 accepted in the window.
- A successful response carries no rate-limit headers (`GET /v2/boxes` answered with `date` only), so a client cannot see how much of the quota is left before it gets a 429.

So the API accepts 100 requests per token in each fixed 5-minute (300 s) window, and a window starts with the first request after the previous one ends. A 429's `retry-after` and `x-ratelimit-reset` both give the window's end, which can be up to about 300 s away. The waits of 40 to 60 s seen on 2026-09-25 were the tail of such a window.

Wait until `x-ratelimit-reset` (or for `retry-after`) before retrying.

#### What this server's client does

`FirewallaClient` (`src/firewalla/client.ts`, with `src/firewalla/rate-limit.ts`) counts its own requests, since the API does not report the quota:

- **Pacing.** At most `API_RATE_LIMIT` requests (default 100, range 1 to 1000) start in any rolling 5 minutes. A rolling count never lets through more than the API's fixed window of the same length accepts. It covers every request the client sends; the server has one client, which its HTTP sessions share. Answers from the response cache are not requests and are not counted. `API_RATE_LIMIT` used to be described as requests per minute, but nothing applied it, so giving it a 5-minute window changes nothing that worked before.
- **Waiting.** A request waits at most 20 s for the rate limit (`RATE_LIMIT_MAX_WAIT_MS`), in the queue and on 429 pauses together, counted from when it was first made. Tool handlers give up after 30 s by default (`PERFORMANCE_THRESHOLDS.TIMEOUT_MS` in `src/config/limits.ts`), so a longer wait would only end in a timeout. A request whose slot frees within that waits for it, in the order requests were made. Otherwise it is not sent, and fails at once with `Rate limit exceeded: the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in <n> s, at <UTC time>. Not sent: ...`.
- **HTTP 429.** The client pauses all its requests until the window ends: until `x-ratelimit-reset` when that is epoch seconds within 10 minutes from now, else for `retry-after` (seconds or an HTTP date), else for 300 s. The pause is rounded up to whole seconds, and is at least 1 s and at most 10 minutes. A local clock far off the API's makes `x-ratelimit-reset` fall outside that range, and `retry-after` is used instead.
- **Retries.** A GET is sent again when the pause ends within its 20 s, at most twice, with one line on stderr: `API Rate Limited: 429 GET <path>; retrying in <n> s (retry <k> of 2)`. Otherwise it fails at once with `Rate limit exceeded (HTTP 429): the Firewalla API allows 100 requests per 5 minutes (API_RATE_LIMIT); capacity returns in <n> s, at <UTC time>.` followed by the reason, for example `Not retried, as a request waits at most 20 s for the rate limit.` A POST, PATCH, PUT or DELETE that gets a 429 is never sent again (`A POST is not retried.`).
- **While paused**, a new request whose wait would pass 20 s fails the same way without being sent (`Not sent: the API refused an earlier request with HTTP 429, ...`).
- The count is per process. Two servers or other API clients on the same token share the API's quota but not the count, so give each a lower `API_RATE_LIMIT`.

### Best Practices

1. **Always handle errors gracefully** (for your own client; this server's client already does the 429 part, see above)
   ```javascript
   try {
     const response = await apiClient.get('/v2/alarms');
     return response.data;
   } catch (error) {
     if (error.response?.status === 401) {
       throw new Error('Authentication failed');
     }
     if (error.response?.status === 429) {
       // The quota is back when the 5-minute window ends: x-ratelimit-reset
       // (epoch seconds), else retry-after (seconds). Retry a GET once, and
       // only if the wait is short enough for the caller; never replay a write.
       const reset = Number(error.response.headers['x-ratelimit-reset']);
       const waitMs = Number.isFinite(reset)
         ? Math.max(0, reset * 1000 - Date.now())
         : (Number(error.response.headers['retry-after']) || 300) * 1000;
       if (error.config?.method === 'get' && !error.config.retried && waitMs <= 20_000) {
         await delay(waitMs);
         return apiClient.request({ ...error.config, retried: true });
       }
       throw new Error(`Rate limited; the quota returns in ${Math.ceil(waitMs / 1000)} s`);
     }
     throw error;
   }
   ```

2. **Implement exponential backoff for retries** of transient failures such as timeouts and 5xx; a 429 needs a wait until the window ends instead (above)
   ```javascript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await delay(Math.pow(2, i) * 1000); // Exponential backoff
       }
     }
   }
   ```

3. **Use appropriate pagination for large datasets**
   ```javascript
   async function getAllFlows(query) {
     const allFlows = [];
     let cursor = null;

     do {
       const params = { query, limit: 500 }; // 500 is the maximum
       if (cursor) params.cursor = cursor;

       const response = await apiClient.get('/flows', { params });
       allFlows.push(...response.data.results);
       cursor = response.data.next_cursor;
     } while (cursor);

     return allFlows;
   }
   ```

4. **Validate input parameters**
   ```javascript
   function validateBoxId(boxId) {
     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
     if (!uuidRegex.test(boxId)) {
       throw new Error('Invalid box ID format');
     }
   }
   ```

---

## Conclusion

This reference was synced with the official Firewalla MSP documentation at https://docs.firewalla.net on 2026-09-25. Behavior the official docs do not cover is marked as measured, with its date; re-measure it before relying on it, since the MSP API changes.

For additional support or questions:
- Review the official Firewalla MSP documentation at https://docs.firewalla.net
- Check the [msp-api-examples repository](https://github.com/firewalla/msp-api-examples) for more code samples
- Ensure your MSP account has appropriate permissions for the endpoints you're trying to access
