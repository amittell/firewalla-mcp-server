# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `get_specific_alarm` reports "No boxes are visible to this MSP token" as a
  validation error with that message. The client rewrapped the box-selection
  error as a generic failure, and `withToolTimeout` rewrapped it again, so the
  handler's check for it never matched; the wrapped errors now keep the
  original as `cause`.
- A write no longer leaves reads serving stale data. Cached GET responses
  (`CACHE_TTL`, 300 s by default) survived `pause_rule`, `resume_rule`,
  `create_rule`, `delete_rule`, `rename_device`, `delete_alarm` and the target
  list writes, so for example `get_network_rules` right after `pause_rule` still
  showed the rule as active. Any write, including one that fails, now clears the
  response cache; the IP geolocation cache is kept.
- `pause_rule` and `resume_rule` send `POST /v2/rules/{id}/pause` and
  `/resume` with no body, as the MSP API documents. Up to 1.4.1 they sent
  `{duration, box}` and `{box}`. Measured on 2026-09-25 on a disposable rule,
  the API accepted the duration and ignored it, so a rule paused "for 60
  minutes" stayed paused until it was resumed.
- `resume_rule` right after `pause_rule` in the same server process no longer
  refuses with "Rule is already active". Its status check read the cached
  pre-pause answer from `GET /v2/rules` for up to `CACHE_TTL` (300 s by
  default). The client now drops cached rule reads after a pause or a resume.
- The status check in `pause_rule`, `resume_rule` and `delete_rule` matches
  the rule by ID instead of taking the first rule the API returns.
- The security counts in the `security_report` and `network_health_check`
  prompts and in `firewalla://metrics/security` are exact totals. They were
  counts of at most 1000 fetched alarms or flows, so the report showed "Total
  Alarms: 1000". The client asks `/v2/alarms` and `/v2/flows` with `groupBy`,
  which returns each group's total, and each count names its window: alarms
  over the last 30 days (the API's default), blocked flows and recent alarms
  over the last 24 hours. If the API ever returns items instead of groups,
  the count is printed as "at least N". `last_threat_detected` is the time of
  the newest Security Activity alarm, or `null`, instead of the current time
  when there was none.
- The `security_report` prompt listed "Active Alarms (200)" for the 200 most
  recent alarms of any status; it now fetches 10 and says how many there are
  in total. A recent threat list that reached its limit of 100 reads "at
  least 100".
- `get_simple_statistics` and `get_boxes` pass their `group` argument to the
  API. The client dropped `group` from every `/v2` request, and `get_boxes`
  read `group_id` while its schema offers `group`.
- `update_target_list` called without `targets` sent `targets: []` in its
  PATCH, which asks the API to empty the list. It now sends only the fields
  it is given.

### Changed

- `pause_rule` and `resume_rule` take only `rule_id`. The MSP API pause
  endpoint takes no duration, so a pause lasts until `resume_rule`. The
  `duration` argument (1 to 1440 minutes) and the `box` argument that both
  schemas required are gone. A caller that still passes `duration` gets the
  pause, plus `duration_ignored: true` and a note in the response.
- `get_alarm_trends` reads `GET /v2/trends/alarms`, the documented series of
  alarms generated per day, instead of fetching up to 10000 alarms and
  counting them per hour. The API has one point per day for the last 30
  days, so `period` (now in the tool schema, default `30d` instead of `24h`)
  selects the days that overlap it: `24h` returns yesterday and today, and
  `1h` today so far. The response keeps its fields and adds `interval`,
  `source`, `scope`, `window`, `last_point_partial` and `note`. The trends
  API takes no box, so with `FIREWALLA_BOX_ID` set the tool still covers
  every box (or the `group`), and `scope` says so. The old `30d` counted only
  the first 30 hours of the 30 days, and the `group` argument in the schema
  was ignored.
- `get_rule_trends` reports rules created per day from
  `GET /v2/trends/rules`. The live API answers that endpoint with HTTP 400, so
  the tool then counts the creation times of the rules in `GET /v2/rules` per
  UTC day, and says so in `source` and `note`. It no longer builds an "active
  rule count" from an estimated baseline, shifted toward the current count
  when the two differed by more than 20%: each point is `rules_created`, and
  the summary has
  `total_rules_created`, `avg_rules_created_per_day`, `peak_rules_created` and
  `days_with_new_rules` in place of `avg_active_rules`, `max_active_rules`,
  `min_active_rules` and `rule_stability`. It takes the same `period` and
  `group` as `get_alarm_trends`.
- `get_statistics_by_region` reads `GET /v2/stats/topRegionsByBlockedFlows`,
  as its schema already said, instead of counting the regions of the 200 most
  recent flows, blocked or not. It passes `group` and `limit`; the API
  returned no more than 5 regions.
- `get_statistics_by_box` reads `GET /v2/stats/{type}`
  (`topBoxesByBlockedFlows` by default, or `topBoxesBySecurityAlarms`), the
  types its schema already offered, and fills in each box from `/v2/boxes`.
  Each box's `value` is the statistic; it replaces `activity_score`, which
  added the box's rule count to its share of the 200 most recent alarms.
- The client's `getFlowTrends`, which no tool calls, reads
  `GET /v2/trends/flows` (blocked flows per day) instead of paging up to 10000
  flows.
- The threat level in the `security_report` and `network_health_check`
  prompts and in `firewalla://metrics/security` comes from the Security
  Activity (type 1) alarms of the last 24 hours, the type
  `/v2/stats/topBoxesBySecurityAlarms` counts. It counted every alarm of type
  5 or above, which includes video, gaming and new-device alarms, so an
  account with a hundred such alarms a day and no Security Activity alarm
  read as critical. The security scores and the resource's recommendation
  also count Security Activity alarms instead of every active alarm. Alarms
  stay active until archived, and each cost 5 of the score's 100 points.

### Added

- Opt-in write tools `archive_alarm` and `mute_alarm` (MSP 2.11.0+), off
  unless `FIREWALLA_ENABLE_WRITE_TOOLS=true` like the other write tools.
  `archive_alarm` takes an alarm out of the active alarms and nothing else.
  `mute_alarm` also has the box create a lasting silence exception for the
  alarm's type, a domain and its subdomains, or one IP, on every device or on
  one device, group, user or network. The mute is checked against the
  documented model and refused before anything is sent, for example a
  `domain` target without a value, a wildcard domain, or a CIDR for `ip`.
  Alarm IDs are per box, so both tools take `gid`, else use
  `FIREWALLA_BOX_ID`, else check each box, and refuse when several boxes have
  the alarm ID and none of them is `FIREWALLA_DEFAULT_BOX_ID`. They read the
  alarm before writing, so a wrong ID changes nothing, and never retry a
  write. Neither is marked `destructiveHint`; `archive_alarm` is
  `idempotentHint` and `mute_alarm` is not. The client gains `archiveAlarm`
  and `muteAlarm`. Checked live on 2026-09-25 with error-path calls only:
  both routes exist on the MSP (a mute without `target.value` answers 400
  `target.value is required for domain target`).
- CI `Docker Build` workflow runs the image as well as building it. After the
  multi-platform build it loads the linux/amd64 image, starts it with
  `docker run -i --rm` and dummy credentials, and requires an answer to MCP
  `initialize` over stdio whose `serverInfo.version` is package.json's.
  `scripts/launch-smoke.mjs --docker <image>` does the check. A manual run
  with the `image` input (for example `amittell/firewalla-mcp-server:1.4.1`)
  pulls and checks that published image instead of building.

## [1.4.1] - 2026-09-25

### Fixed
- The Docker image builds again. 1.4.0 moved it to `node:24-alpine`, which
  publishes no `linux/arm/v7` image, so the tag's image build failed and no
  1.4.0 image reached Docker Hub (`latest` stayed on 1.3.0). The image now uses
  `node:22-alpine`, which has amd64, arm64 and arm/v7.
- `force_refresh` on alarm queries bypasses the cache again: the paging added
  in 1.4.0 passed the cache flag where `request()` expects the body.
- `get_flow_insights` with `include_blocked` asked the API for `blocked:true`,
  which it refuses; it asks for `status:blocked`. The client's `searchFlows` and
  `searchAlarms`, which the flow insights and the geography helpers use, now
  translate `blocked:`, `bytes:` and alarm `source_ip:` the way `get_flow_data`
  and `get_active_alarms` already did.
- The `get_specific_alarm` schema lists `alarm_id` as a string or a number, to
  match the numeric `aid` that `get_active_alarms` returns.
- The client's `searchFlows` with `include_resolved: false` added `block:false`
  after translating the query, and the API answers that with no results; it
  adds `-status:blocked`, and the whole query is translated at the end.

### Added
- CI `Docker Build` workflow: a pull request that touches the Dockerfile, the
  package files or the Docker workflows builds the image for amd64, arm64 and
  arm/v7 without pushing it.

## [1.4.0] - 2026-09-25

### Added
- Opt-in write tools `create_rule`, `delete_rule` and `rename_device` (#37,
  from @mefrati75). Off unless `FIREWALLA_ENABLE_WRITE_TOOLS=true`, and marked
  with MCP tool annotations (`destructiveHint: true` on `create_rule` and
  `delete_rule`). `create_rule` and `rename_device` act on one box (see the
  `FIREWALLA_BOX_ID` entry under Changed) and never send a rule without a
  `gid`: the MSP API applies such a rule to every box in the account.
  `delete_rule` needs MSP 2.11.0+ and checks the rule exists first.
- `get_specific_alarm` takes an optional `gid`. Alarm IDs are per box, and
  without `gid` or `FIREWALLA_BOX_ID` it checks each box on the account
  (`FIREWALLA_DEFAULT_BOX_ID` first). In 1.3.0 it failed with `Invalid or
  empty gid provided` whenever `FIREWALLA_BOX_ID` was unset, and could not
  reach another box's alarms when it was set.
- `get_specific_alarm` accepts a numeric `alarm_id`. `get_active_alarms` and
  `search_alarms` return `aid` as a number, and passing it on failed with
  `alarm_id must be a string, got number`.
- CI `launch` job (#44): on ubuntu-latest, macos-latest and windows-latest it
  packs the server and requires an answer to MCP `initialize` over stdio
  through the global bin, `npx` and `node dist/server.js`.
- `publish.yml`: a `v*` tag publishes to npm with provenance (npm trusted
  publishing, no token secret), verifies the published package's signatures
  and attestations, and creates the GitHub release from this file.

### Changed
- `FIREWALLA_BOX_ID` is optional for every tool (fixes #27). `create_rule`
  and `rename_device` use `gid`, else `FIREWALLA_BOX_ID`, else
  `FIREWALLA_DEFAULT_BOX_ID`, else the account's only box. On a multi-box
  account with none of those they still refuse, and the error now lists the
  boxes. `FIREWALLA_DEFAULT_BOX_ID` was documented but nothing read it; it is
  now the default box for single-box operations, without scoping queries the
  way `FIREWALLA_BOX_ID` does.
- The `security_report` and `network_health_check` prompts and the
  `firewalla://summary` resource report each box's online state and device,
  alarm and rule counts from `/v2/boxes`, and the blocked flows among the 100
  most recent. The CPU and memory figures they showed were `Math.random()`
  values (the MSP API reports neither), the "uptime" was the time since the
  box was last seen, and without `FIREWALLA_BOX_ID` the firewall read as
  offline.
- `geoip-lite` 1.4.10 -> 2.0.3, and the `geoip-lite > ip-address` override is
  gone (2.0.3 depends on `ip-address ^10.2.0` itself). npm only applies
  `overrides` from the root project, so the override never reached npm or npx
  installs, which resolved `ip-address@5.9.4` under geoip-lite.
- Node.js 18 or later is still supported (`engines.node` `>=18.0.0`).
  geoip-lite 2.x declares `node >=24`, which only its `updatedb` script needs
  (`fetch`, `fs.rmSync`); its lookup code uses `fs`, `net` and `path`, and
  gives the same answers on Node 18.20.8, 20.20.2, 22.23.1 and 24.18.0. On
  Node 18-22, npm prints an `EBADENGINE` warning for geoip-lite when
  installing, and an install with `engine-strict=true` refuses it. CI runs the
  tests on Node 18, 20, 22 and 24 and the `launch` job on 18 and 24. The
  Docker image moves to `node:24-alpine`.
- Docker examples in the README mark `FIREWALLA_BOX_ID` as optional (#39).

### Fixed
- `get_rule_trends` no longer adds a random -1, 0 or +1 to every point.
- The `security_report`, `threat_analysis`, `bandwidth_analysis` and
  `device_investigation` prompts joined their list lines with a literal `\n`
  instead of a newline.
- The readiness check reported "Missing required configuration" without
  `FIREWALLA_BOX_ID`, and the environment check warned that a box ID "will be
  required for all operations".
- `get_alarm_trends`, `get_bandwidth_usage` and the `security_report` and
  `network_health_check` prompts failed against the live API with
  `Bad Request: Invalid parameters sent to /v2/alarms` (or `/v2/flows`). The
  API refuses a `limit` over 500 ("limit exceeds max allowed value of 500",
  measured 2026-09-25), and they asked for 10000 alarms, `top * 10` flows (up
  to 1000) or 1000 alarms and flows in one request, so `get_bandwidth_usage`
  failed for any `limit` over 50. `getActiveAlarms`, `getFlowData`,
  `searchFlows`, `searchAlarms` and the trend and bandwidth queries now page
  through `next_cursor` 500 at a time, up to the same totals.
- The blocked-connection count behind `security_report` and
  `network_health_check` queried flows with `block:true`, which the API
  answers with no results; it uses `status:blocked` now.
- `network_health_check` no longer throws `Cannot read properties of
  undefined (reading 'ip')` on flows without a `device`; neither does the
  `device_investigation` prompt.
- `get_flow_insights` returned no content categories and filed every
  device's traffic under "uncategorized". The API sends a flow's `category` as
  a string (`"games"`, `"social"`, or `""`), and the code read
  `category.name`; and with no `categories` argument the handler passed an
  empty list, which became the query `ts:<range> AND ()` and matched nothing.
- The server now starts under `npx`, global installs and on Windows (#36,
  from @mefrati75). The entrypoint check compared `import.meta.url` with
  `file://${process.argv[1]}`, which never matches through a bin symlink, or
  on Windows at all, so 1.3.0 started, registered nothing and sat silent.
- Search queries (#41, fixes #35): dot-separated MSP qualifiers
  (`source.ip`, `destination.ip`, `device.ip`, `target.type`) and the numeric
  operators `:>`, `:>=`, `:<`, `:<=` pass validation; `ts` is allowed for
  flows and alarms and `ts:>1h`-style values become Unix seconds;
  `search_flows` documents `source.ip`/`destination.ip`; and `search_devices`
  `ip:` filters match (every `ip:` query returned 0 devices).
- Search schemas and validators agree (fixes #42): every field and example
  query in the `search_flows`, `search_alarms`, `search_rules` and
  `search_devices` schemas now passes validation and reaches the API. Newly
  accepted: `domain` on flows, `region` on alarms (the MSP alias for
  `remote.region`), and `protocol`, `notes`, `scope.type` and `box.id` on
  rules. Dotted fields such as `scope.type` and `network.name` no longer fail
  with "Expected ':' after field". Values containing colons parse as one
  value, so `mac:AA:BB:CC:DD:EE:FF`, `mac:AA:*` and `ip:fe80::1` work, quoted
  or not. `search_devices` evaluates `OR`, `NOT` and parentheses
  (`name:nas OR name:tv` returned only `nas`) and filters on `mac`, `gid`,
  `network.name` and `group.name`, and the query parser no longer drops the
  right-hand side of an `OR`. Removed from the schemas: `resolved` on alarms
  (the MSP API has no such qualifier; use `status`), `gid:` on flows, alarms
  and rules (use the documented `box.id:`), and `vendor:` on devices (use
  `mac_vendor:`).
- Flow and alarm queries use the qualifiers the MSP API accepts (#42). Run
  live, `/v2/flows` answered `blocked:` and `bytes:` and `/v2/alarms`
  answered `source_ip:` and `message:` with 400 "Invalid parameters", and
  `block:true` matched no flows. The flow and alarm clients now send
  `blocked:true` as `status:blocked`, `blocked:false` as `-status:blocked`,
  `bytes:` as `total:`, and alarm `source_ip:` as `device.ip:`, so existing
  queries keep working in `search_flows`, `search_alarms`, `get_flow_data`
  and `get_active_alarms`. `blocked_connections` in the security metrics
  resource and prompts now counts `status:blocked` flows; it queried
  `block:true`, which matched no flows in the live run. The schemas, tool
  descriptions and example
  queries advertise `status:blocked`/`status:ok`, `total:`, `download:`,
  `upload:` and alarm `device.ip:`, and show an unqualified term (`porn`) for
  alarm text search. Alarm `message:` and `resolved:` are rejected before the
  request with the replacement to use.
- Installing the package (`npm install -g`, npx) no longer prints
  `npm warn deprecated` for `inflight@1.0.6`, `rimraf@2.7.1` and
  `glob@7.2.3` (#32). All three came from geoip-lite
  1.4.10, which pins `rimraf 2.5.2 - 2.7.1` for its `updatedb` script;
  geoip-lite 2.x drops rimraf.
- `pause_rule`, `resume_rule` and `delete_rule` accept short rule IDs and the
  `<box-gid>:<n>` form; `validateRuleId` required 8-64 characters.
- The logs and the MCP `serverInfo` report the package version, which
  `npm version` now keeps in sync with package.json; the logger had `1.2.1`
  hard-coded and `serverInfo` had `1.3.0`.
- The startup log no longer hard-codes "28 tools"; the registry log reports
  the actual count.

### Security
- Lockfile refreshed with `npm audit fix`: `npm audit` goes from 10 (4
  moderate, 6 high) on 1.3.0 to 0.

## [1.3.0] - 2026-07-10

### Added
- Per-session MCP `Server` instances for the HTTP transport (PR #31): each
  Streamable HTTP session gets its own Server, fixing "Already connected to a
  transport" under concurrent sessions. New `initializeHttpSession` helper with
  error cleanup + tests.

### Security
- Updated `@modelcontextprotocol/sdk` 1.13.2 -> 1.29.0 (fixes ReDoS
  GHSA-8r9q-7v3j-jr4g) and `axios` 1.10 -> 1.18.1.
- Pinned `ip-address` to `^10.2.0` under `geoip-lite` 1.4.10 with an npm
  override (GHSA-v2v4-37r5-5v8g). `npm audit`: 13 vulnerabilities -> 0.

### Fixed
- Registered `resources/list` and `prompts/list` handlers: the server declared
  the `resources` and `prompts` capabilities but only implemented read/get, so
  clients that enumerate at startup (e.g. Claude Desktop) got MCP -32601.
- All five `search_*` schemas now match the shared validator: `query` is
  advertised as required (calling with `{}` always errored).
- Prompt catalog is truthful and prompt arguments actually work: MCP prompt
  argument values arrive as strings, so `threshold_mb` / `lookback_hours` are
  now coerced (they previously could never take effect); `threat_analysis`
  honors `period` (data and display) and advertises `severity_threshold`;
  dead `include_resolved` removed from the catalog.
- Idle HTTP sessions are reaped (`MCP_SESSION_IDLE_TIMEOUT_MS`, default 30
  min): clients that vanish without a DELETE no longer pin per-session Server
  instances forever.
- `geoip-lite` stays on 1.4.x with an `ip-address@^10.2.0` override, keeping
  `engines: node >=18` honest (geoip-lite 2.x requires Node 24) while the
  audit remains clean.

### Changed
- Adapted `unified-response.ts` to SDK >=1.29's discriminated-union content
  types (narrow before `.text`).
- Refreshed in-range dev/runtime dependencies (jest 30.4, typescript-eslint
  8.63, nock 14.0.16, prettier 3.9, ts-jest 29.4.11, ...).
- Added `scripts/functional-test.mjs`: live end-to-end harness exercising all
  28 tools, 5 resources, 5 prompts over stdio, plus concurrent Streamable HTTP
  sessions (validates the per-session Server fix).

## [1.2.1] - 2025-08-01

### Security
- **CRITICAL**: Fixed CVE-2025-7783 vulnerability in form-data dependency
- Updated form-data from 4.0.3 to 4.0.4 to address predictable boundary generation
- Rebuilt Docker images with patched dependencies

### Changed
- Updated package-lock.json with security patches
- Docker image now includes the latest security fixes

## [1.2.0] - 2025-07-30

### Added
- HTTP transport support for standalone operation in Docker containers
- Dual transport support (stdio and HTTP) with automatic selection
- Session management with UUID-based IDs for HTTP mode
- MCP orchestrator compatibility (e.g., open-webui)
- New environment variables: MCP_TRANSPORT, MCP_HTTP_PORT, MCP_HTTP_PATH
- Optional FIREWALLA_BOX_ID for MSP connections (resolves #27)

### Changed
- Made FIREWALLA_BOX_ID optional for MSP connections
- Enhanced configuration system to support transport selection
- Improved HTTP transport robustness and error handling
- Added transport configuration parsing utilities
- Updated documentation for HTTP transport and optional box ID

### Fixed
- Resolved linting issues in HTTP transport implementation
- Improved code quality and removed redundant checks
- Applied Prettier formatting throughout codebase

## [1.1.0] - 2025-07-24

### Added
- Test mode support via MCP_TEST_MODE environment variable
- Docker health check compatibility for deployment platforms
- Glama.ai directory integration support
- Test configuration fallback for containerized environments

### Changed
- Extended configuration system to support test mode in both regular and production configs
- Allow server to start without real credentials when MCP_TEST_MODE=true

## [1.0.0] - 2025-07-14

### Added
- Initial release of Firewalla MCP Server
- 35+ MCP tools for comprehensive firewall data access
- Advanced search functionality with complex query syntax
- Geographic filtering and threat analysis capabilities
- Bulk operations for alarm and rule management
- Real-time security alert monitoring
- Bandwidth usage tracking and analysis
- Device status monitoring and management
- Rule management with pause/resume functionality
- Target list access for CloudFlare and CrowdSec intelligence
- Cross-reference search with correlation scoring
- Comprehensive error handling and validation
- Cache optimization for improved performance
- Professional logging and monitoring
- Complete TypeScript support with detailed interfaces

### Features
- **Security Analysis**: Monitor threats, blocked attacks, and network anomalies
- **Search Engine**: Complex queries with logical operators, wildcards, and filtering
- **Geographic Intelligence**: Location-based threat analysis and filtering
- **Performance Optimization**: Intelligent caching and query optimization
- **Bulk Operations**: Manage multiple alarms and rules efficiently
- **Real-time Monitoring**: Live firewall data access via MCP protocol
- **Professional Polish**: Comprehensive documentation and testing (97%+ pass rate)

### Technical Highlights
- 94% complexity reduction through elegant simplification
- Model Context Protocol (MCP) compliant server implementation
- RESTful integration with Firewalla MSP API v2
- Robust parameter validation and error handling
- Extensive test coverage with 918+ passing tests
- Production-ready logging and monitoring
- Docker containerization support
- TypeScript-first development with comprehensive type safety

## [1.0.2] - 2025-07-20

### Added
- Full Docker support with multi-stage builds for security and optimization
- Docker Hub publishing via GitHub Actions CI/CD pipeline
- Multi-architecture Docker builds (linux/amd64, linux/arm64, linux/arm/v7)
- Comprehensive Docker documentation with security warnings
- Docker Compose configuration with security best practices
- Non-root user (nodejs:1001) in Docker containers
- Docker MCP Registry submission for Docker Desktop integration

### Fixed
- Corrected tool count documentation from 29 to 28 throughout codebase
- Fixed markdown linting issues (MD036, MD026) in all documentation
- Standardized environment variable naming (FIREWALLA_BOX_ID)
- Removed emojis from documentation for consistency

### Changed
- Updated documentation to reflect actual tool count (28 tools: 23 direct API + 5 convenience)
- Enhanced security warnings for Docker credential handling
- Improved consistency in environment variable examples

### Security
- Added prominent warnings about Docker command-line credential exposure
- Provided secure alternatives using --env-file and Docker secrets
- Implemented read-only filesystem and tmpfs for Docker containers

## [1.0.1] - 2025-07-14

### Fixed
- Minor documentation updates and clarifications
- Updated npm package metadata

## [1.1.1] - 2025-08-01

### Security
- **CRITICAL**: Fixed CVE-2025-7783 vulnerability in form-data dependency
- Updated form-data from 4.0.3 to 4.0.4 to address predictable boundary generation
- Rebuilt Docker images with patched dependencies

### Changed
- Updated package-lock.json with security patches
- Docker image now includes the latest security fixes

## [Unreleased]

### Planned
- Make FIREWALLA_BOX_ID optional (see issue #27)
- Enhanced correlation algorithms
- Additional geographic data sources
- Performance optimization for large datasets
- Extended bulk operation capabilities

---

**Note**: This project follows the philosophy of "elegance over complexity, no bloat" - delivering professional functionality through clean, simple implementations.