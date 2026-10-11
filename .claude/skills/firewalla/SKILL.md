---
name: firewalla
description: Read and reason correctly about a Firewalla firewall through the firewalla-mcp-server MCP tools — security alarms, network flows, firewall rules, devices and bandwidth. Load BEFORE answering whether the firewall is blocking or allowing something, why a device or game console cannot reach a service, a console NAT type (Open/Moderate/Strict), blocked flows, firewall rules, bandwidth, or offline devices. Covers the traps that make an already-fixed thing read as broken (a blocked-flow count is not a current state), that rules can target ports (so "no port rule" must be checked, not assumed), the MCP tool response and rule shapes, and what the MSP API cannot see (NAT type, UPnP, double-NAT). Triggers — "firewalla", "is <port/site/device> blocked", "blocked ports", "NAT moderate", "NAT strict", "console can't connect", "why can't <device> reach <site>", "blocked flows", "firewall rules", "bandwidth", "offline devices".
---

# Firewalla — reading the data correctly

This skill is for operating the **firewalla-mcp-server** MCP tools against a
Firewalla MSP account. The server is read-only by default (28 tools; 11 write
tools only with `FIREWALLA_ENABLE_WRITE_TOOLS=true`). Getting a correct answer
is mostly about reading the data the right way and knowing what the API cannot
tell you. The long form, with a worked example and a copy-paste recipe, is in
[`docs/interpreting-results-guide.md`](../../../docs/interpreting-results-guide.md).

## Setup (generic)

The server authenticates with `FIREWALLA_MSP_TOKEN` and `FIREWALLA_MSP_ID` (your
MSP domain, e.g. `yourdomain.firewalla.net`); `FIREWALLA_BOX_ID` is optional and
retrievable with `get_boxes`. See the project README for `.env` setup. On a
multi-box account, confirm which box you mean with `get_boxes` rather than
assuming a default.

## The traps that produce wrong answers

- **A blocked-flow COUNT is not a current state.** The flow log retains blocks
  from *before* a rule change. Before saying "X is blocked", pull
  `search_flows query:"device.ip:<ip>"` (results are newest-first in
  `data.flows`), then read the newest flow for the **same endpoint** — the same
  `domain` (or `destination_ip`) AND `protocol`. Its `blocked` value is the
  current state; a later allowed flow to one endpoint says nothing about a block
  to a different IP or protocol. If both appear for one endpoint, report the
  newest and that it was mixed.
- **Can a port be blocked? Check — don't assume not.** Firewalla allows outbound
  by default and most rules target `domain|category|app|ip|targetlist`, but the
  model DOES support ports: `target.type:"remotePort"`, plus `target.port`
  (domain/ip/net) and `scope.port`. So scan `get_network_rules` for a
  `remotePort` target or a `port` field on `target`/`scope`, AND check live flows
  on that port show `blocked:false` — don't answer "no port rules" by assumption.
- **Allow vs block precedence is subtle — verify, don't theorize.** A
  device-scoped domain allow and a network-wide IP-level block (a
  `dnsOnly:false` category rule) can both apply to a connection to a shared CDN
  IP. Which wins is internal to the box; read fresh flows rather than inferring
  from the rule list.
- **Query grammar:** `block:true` → `status:blocked`; `bytes:` → `total:`;
  `domain:` is the ROOT domain (`domain:*.x.com` matches nothing); `limit` ≤ 500
  on flows and alarms.
- **Shapes (MCP tool output):** `search_flows` returns `{success, data:{flows:
  [...]}, meta}`; each `data.flows[]` has `blocked` (bool), `source_ip`,
  `destination_ip`, `domain`, `protocol`, `direction`, `bytes`, `timestamp` —
  no `portInfo`. `get_flow_data` adds `block_type`, `category` and raw
  `source`/`destination`; a flow's `category` is the flow's classification, not
  the rule's. A rule is `{action: block|allow|timelimit, status,
  direction, target:{type (… remotePort …), value, dnsOnly?, port?}, scope?:
  {type: device|group|user|network, value, port?}}` — `scope` may be absent
  (all devices); `dnsOnly:false` also enforces at the IP layer.

## What the MSP API CANNOT tell you — say so, don't guess

- **Console NAT type** (Open/Moderate/Strict) — not exposed. Moderate/Strict is
  almost always **UPnP disabled** or **double-NAT** (the firewall behind an ISP
  gateway), both app-side. If the NAT-relevant traffic is flowing (`blocked:false`
  — for Xbox: Teredo UDP 3544 and the game ports), the firewall is not the cause.
- **UPnP state / UPnP port mappings** — not exposed.
- **Which built-in blocklists are enabled**, and **target-list contents** —
  Firewalla-hosted lists return no entries over the API.

When the answer lives in one of these, say it is an app-side setting and point
the user there, rather than inventing a rule-based explanation.

## Writes

The 11 write tools (create/delete/pause/resume rule, target-list CRUD,
`rename_device`, archive/mute/delete alarm) exist only with
`FIREWALLA_ENABLE_WRITE_TOOLS=true` and an MSP token that has write access.
Treat changing a live firewall as a user-confirmed action — propose the exact
tool call or the app steps; don't change rules unprompted.
