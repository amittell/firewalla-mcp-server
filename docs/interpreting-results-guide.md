# Interpreting Firewalla data: common traps and limits

This server is read-only by default and maps directly to the Firewalla MSP API.
Most wrong answers don't come from the tools failing — they come from reading
the data the wrong way, or from asking the API a question it cannot answer. This
guide collects the traps that most often produce a wrong conclusion, and the
questions the MSP API does not expose at all.

Field names below are the **MCP tool** response shape (what `search_flows`,
`get_flow_data` and `get_network_rules` return), not the internal client model.

See also: [`query-syntax-guide.md`](./query-syntax-guide.md),
[`field-mappings.md`](./field-mappings.md),
[`troubleshooting-guide.md`](./troubleshooting-guide.md).

## A blocked-flow count is not a current state

The flow log **retains flows that were blocked _before_ a rule change.**
`search_flows` with `status:blocked` returns them newest-first, so a count of
blocked flows reads as "blocked now" even after you've allowed the destination.

Before concluding something is blocked, look at the **newest flow for the same
endpoint**, not a count:

1. pull `search_flows query:"device.ip:<ip>"` — results come newest-first (the
   `data.flows` array), each flow carrying `blocked` (bool), `domain`,
   `destination_ip`, `protocol` and `timestamp`;
2. match the **equivalent endpoint** — the same `domain` (or `destination_ip`)
   **and** `protocol`; a later allowed flow to one endpoint says nothing about a
   block to a different IP or over a different protocol;
3. the newest matching flow's `blocked` value is the current state. If both
   allowed and blocked flows exist for the same endpoint, say so and report the
   newest — don't collapse a mixed picture into one verdict.

> Worked example: a games console showed 70+ blocked flows to a vendor domain
> and read as "blocked", but the domain had been allowed hours earlier — the
> newest flow to that same domain was allowed, and the blocks were all older.

## Can a port be blocked? Check the port fields — don't assume not

Firewalla allows outbound traffic by default, and most home rules target a
`domain`, `category`, `app`, `ip` or `targetlist`. But the rule model **does**
support port targeting, so you cannot answer "is port N blocked?" without
inspecting the port fields:

- `target.type: "remotePort"` targets a remote port directly;
- `target.port` (a port or range) applies to `domain`, `ip` and `net` targets;
- `scope.port` (a port or range) narrows a rule's scope to a port.

So "is my console's port 3074 blocked?" means: scan `get_network_rules` for a
`remotePort` target or a `port` field on a rule's `target`/`scope` that covers
it, **and** check that live flows on that port show `blocked:false`. Finding no
such rule and seeing the traffic flow is the answer — not an assumption that
port rules don't exist.

## Console NAT type is NOT visible to the MSP API

NAT type (**Open / Moderate / Strict** on Xbox, PlayStation, Switch) is not
exposed by the API. Neither is **UPnP** state, nor whether the box is
**double-NATed** (behind an ISP gateway that also routes). Moderate/Strict NAT
is almost always one of those two things — both **app-side settings, not
firewall rules.**

If the NAT-relevant traffic is flowing (`blocked:false` — for Xbox: Teredo on
UDP 3544, plus the game ports), the firewall is not the cause. Point the user at
UPnP / bridge-mode, not at the rule list.

## Allow vs block on shared CDN IPs

A device-scoped domain **allow** and a network-wide **IP-level block** (a
`dnsOnly:false` category rule, e.g. ad/tracker blocking) can both apply to the
same connection when a legitimate domain shares a CDN IP (Akamai, Cloudflare,
…) with blocked content. Which one wins is internal to the box.

Don't assert precedence from the rule list — read fresh flows and see what is
actually happening. If a legitimate domain keeps getting IP-blocked despite an
allow, the fix is usually to stop the ad/tracker rule enforcing at the IP layer
(make it DNS-only) or to exclude that device, **not** to add another domain
allow (a domain allow does not reliably override an IP-level block on a shared
address).

## Quick query-grammar reminders

Full grammar is in [`query-syntax-guide.md`](./query-syntax-guide.md); the ones
that bite most often:

- `block:true` is translated to `status:blocked`; `bytes:` to `total:`.
- `domain:` matches the **root** domain, so `domain:*.example.com` matches
  nothing — use `domain:example.com`.
- `limit` is capped at **500** on `/v2/flows` and `/v2/alarms` (HTTP 400 above);
  page with `next_cursor`.

## Response and rule shapes worth knowing

- **`search_flows`** returns `{ success, data: { flows: [...], metadata, coverage },
  meta }`. Each `data.flows[]` entry has `blocked` (bool), `source_ip`,
  `destination_ip`, `domain`, `protocol`, `direction`, `bytes`, `timestamp`,
  `device` and `network`. **`get_flow_data`** returns the same kind of record and
  adds `block_type`, `category` and the raw `source`/`destination` objects. There
  is no `portInfo` on a flow result.
- A **rule** (`get_network_rules`) has `action` (`block`, `allow`, or
  `timelimit`), `status` (e.g. `active`, `paused`), `direction`
  (`outbound`/`inbound`/`bidirection`), and a `target` whose `type` is one of
  `app | category | domain | internet | intranet | ip | net | region |
  remotePort | targetlist` with a `value`, an optional `dnsOnly`, and an optional
  `port`. `scope` is **optional** (no scope means all devices); when present its
  `type` is `device | group | user | network`, with a `value` and an optional
  `port`. `dnsOnly:true` blocks DNS only; `dnsOnly:false` also enforces at the IP
  layer.

## Recipe: "is this destination blocked right now?"

```js
// Pull recent flows for the device (newest-first) and read the current state
// per endpoint from the newest matching flow. (Pseudocode over a search_flows
// tool result.)
const res = await callTool('search_flows', { query: `device.ip:${ip}`, limit: 500 });
const flows = res.data.flows; // newest-first
for (const { domain, protocol } of endpoints) {
  const matches = flows.filter(f => f.domain === domain && f.protocol === protocol);
  const current = matches[0];           // newest-first, so [0] is the latest
  const mixed = matches.some(f => f.blocked !== current?.blocked);
  // current.blocked is the current state for this endpoint;
  // if `mixed`, report both the latest state and that older flows differed.
}
```
