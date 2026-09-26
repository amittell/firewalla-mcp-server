# Security Policy

## Supported versions

Security fixes go into the latest minor release only, published to npm
(`firewalla-mcp-server`) and Docker Hub (`amittell/firewalla-mcp-server`).
Upgrade to it to get them; older releases are not patched.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue, pull request
or discussion.

Use GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**, or go to
<https://github.com/amittell/firewalla-mcp-server/security/advisories/new>.
If that button is not there, open an issue that asks for a private contact
and contains no details of the problem.

A useful report says:

- the version you run (the npm package version or the Docker image tag) and
  how you run it: stdio or `MCP_TRANSPORT=http`, in Docker or not
- what an attacker can do, and what they need first (network access to the
  HTTP port, a malicious web page the user visits, a crafted tool argument...)
- the steps to reproduce it, with every token, gid and address replaced by a
  placeholder

The fix and the advisory are coordinated in the private report.

## Scope

In scope: the code in this repository and what is built from it, the npm
package and the Docker image. For example: the stdio and HTTP transports,
the Host, Origin and bearer token checks of the HTTP transport, how the
server handles the MSP token, and validation of tool arguments.

Out of scope:

- the Firewalla MSP API, Firewalla boxes and the Firewalla apps: report
  those to Firewalla
- the MCP client (Claude Desktop, Claude Code or another) and the model
  deciding which tools to call
- a vulnerability in a dependency that this server cannot reach; report it
  upstream (if it can be reached through this server, report it here too)
- what the owner of an MSP token can do with it directly: the server acts
  with the token's full permissions

## How the server is locked down by default

- **Write tools are off.** `create_rule`, `delete_rule`, `rename_device`,
  `archive_alarm` and `mute_alarm` are registered only with
  `FIREWALLA_ENABLE_WRITE_TOOLS=true`. The other tools that change state,
  `pause_rule`, `resume_rule`, `create_target_list`, `update_target_list`
  and `delete_target_list`, are always registered; every tool carries MCP
  annotations (`readOnlyHint`, `destructiveHint`) so clients can ask before
  calling one that is not read-only.
- **stdio is the default transport**, reachable only by the process that
  started the server.
- **The HTTP transport** (`MCP_TRANSPORT=http`) listens on 127.0.0.1,
  answers 403 to a Host header it does not know and to a browser Origin that
  is not in `MCP_HTTP_ALLOWED_ORIGINS`, and with `MCP_HTTP_BEARER_TOKEN` set
  answers 401 to a request without that token. The Docker image listens on
  every interface of the container so a published port reaches it: set
  `MCP_HTTP_BEARER_TOKEN` whenever the port is reachable from other machines.
  See [HTTP transport security](README.md#http-transport-security).

## Your MSP token

Whoever holds the MSP token acts as your MSP account, on every box it
manages. Never paste the token, or a `.env` file, log, screenshot or command
line that contains it, into an issue, pull request or discussion. The server
does not put it in its logs. If a token has been exposed, revoke it in the
MSP portal (Account Settings > API Settings) and create a new one.
