# Interpreting Firewalla data: common traps and limits

This server is read-only by default and maps directly to the Firewalla MSP API.
Most wrong answers don't come from the tools failing — they come from reading
the data the wrong way, or from asking the API a question it cannot answer. This
guide collects the traps that most often produce a wrong conclusion, and the
questions the MSP API does not expose at all.

See also: [`query-syntax-guide.md`](./query-syntax-guide.md),
[`field-mappings.md`](./field-mappings.md),
[`troubleshooting-guide.md`](./troubleshooting-guide.md).

## A blocked-flow count is not a current state

The flow log **retains flows that were blocked _before_ a rule change.**
`search_flows` with `status:blocked` returns them newest-first, so a count of
blocked flows reads as "blocked now" even after you've allowed the destination.

Before concluding that something is blocked, compare the newest **allowed** vs
newest **blocked** flow to that destination:

1. pull `device.ip:<ip>` (default sort is newest-first),
2. split the results on each flow's `block` flag,
3. compare timestamps — if the newest flow to the destination is allowed (or
   newer than the newest block), it is flowing **now** and the blocks are
   history.

> Worked example: a games console showed 70+ blocked flows to a vendor domain
> and read as "blocked", but the domain had been allowed hours earlier — the
> blocks were all older than the newest allowed flow to the same domain.

## "Is port N blocked?" is almost always "no"

Firewalla allows outbound traffic by default, and **there is no port-based block
rule type.** Rule targets are `domain`, `category`, `app`, `ip`, `targetlist`
or `internet` — never a port. So "is my console's port 3074 blocked?" is
answered by two checks, both of which usually say no:

- no rule targets that port (scan `get_network_rules` — you will find
  domain/category/app/ip targets, not ports), and
- live flows on that port show `block:false`.

Don't infer a port block from a connectivity or NAT symptom.

## Console NAT type is NOT visible to the MSP API

NAT type (**Open / Moderate / Strict** on Xbox, PlayStation, Switch) is not
exposed by the API. Neither is **UPnP** state, nor whether the box is
**double-NATed** (behind an ISP gateway that also routes). Moderate/Strict NAT
is almost always one of those two things — both **app-side settings, not
firewall rules.**

If the NAT-relevant traffic is flowing `block:false` (for Xbox: Teredo on
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

## Flow and rule shapes worth knowing

- A **flow** carries `block` (bool), `blockType` (`ip` or `dns`), `direction`,
  and `source` / `destination` each with `portInfo{protocol, port, name}`. A
  flow's `category` is the **flow's** classification, not the blocking rule's.
- A **rule** is `{action: allow|block, status: active|paused, direction:
  outbound|inbound|bidirection, target: {type, value, dnsOnly}, scope: {type:
  device|group, value}}`. `dnsOnly:true` blocks DNS only; `dnsOnly:false` also
  enforces at the IP layer.

## Recipe: "is this destination blocked right now?"

```js
// Pull recent flows for the device, newest-first, and compare allowed vs
// blocked per destination. (Pseudocode over a search_flows result.)
const r = await searchFlows({ query: `device.ip:${ip}`, limit: 500 });
for (const name of ['example.com']) {
  const m = r.results.filter(f => (f.destination?.name || '').includes(name));
  const newest = a => (a.length ? a.reduce((x, y) => (y.ts > x.ts ? y : x)) : null);
  const allowed = newest(m.filter(f => !f.block));
  const blocked = newest(m.filter(f => f.block));
  // allowed newer than blocked (or no blocked) => flowing NOW; blocks are history.
}
```
