# Firewalla MCP × Open WebUI

Use your Firewalla data from Open WebUI, with Ollama or any other model that supports tool calling.

Open WebUI can reach this server two ways:

- through **mcpo**, the MCP-to-OpenAPI proxy from the Open WebUI project, which turns each MCP tool into an HTTP endpoint that Open WebUI adds as an OpenAPI tool server;
- through its **native MCP connection** (Open WebUI 0.6.31 and later), which speaks MCP Streamable HTTP and needs no proxy.

Every command and file on this page was run on 2026-09-26, with the later changes that [What was tested](#what-was-tested) lists.

**Versions.** Routes 2 and 3 use the HTTP transport and need **2.0.0 or later**, the first release whose HTTP transport checks the `Host` header and a bearer token. Up to 1.5.0 the HTTP transport listens on every interface and ignores `MCP_HTTP_BEARER_TOKEN`, `MCP_HTTP_ALLOWED_HOSTS` and the other `MCP_HTTP_*` settings, so the token in these recipes protects nothing, and the server registers 5 tools that change your box. With 1.5.0 or earlier, do not expose the HTTP port: use route 1. Route 1 uses stdio and works from 1.4.0; with 1.5.0 it lists 28 tools, 5 of them write tools; with 2.0.0 to 2.0.2, 24 read-only tools; and from 2.1.0, 28 read-only tools.

## Prerequisites

- Open WebUI, and a model with tool (function) calling
- firewalla-mcp-server **1.4.0 or later** for route 1; earlier releases never start under `npx` (see [mcpo never opens its port](#mcpo-never-opens-its-port-port-8000-shows-down)). **2.0.0 or later** for routes 2 and 3; see Versions above
- For the mcpo routes: mcpo 0.0.20, as the Docker image `ghcr.io/open-webui/mcpo:main` (it includes Node.js 22 and `npx`) or through `uvx`
- Node.js 18+ if mcpo runs the server with `npx` or `node` outside the mcpo image
- Docker, for the Docker image and Compose routes
- A Firewalla MSP account with API access: your MSP domain (`yourdomain.firewalla.net`) and an access token

## Choose a route

| Route | How the server runs | Open WebUI connection |
|-------|---------------------|-----------------------|
| [1. mcpo starts the server](#1-mcpo-starts-the-server-stdio) | mcpo starts it over stdio: `npx`, a local build, or the Docker image | OpenAPI, `http://<mcpo>:8000/firewalla` |
| [2. Docker Compose](#2-the-docker-image-over-http-docker-compose) | its own container, HTTP transport | MCP, `http://firewalla-mcp:3000/mcp`, or OpenAPI through mcpo |
| [3. Native MCP to the host](#3-native-mcp-to-a-server-on-the-host) | a process on the host, HTTP transport | MCP, `http://<host>:3001/mcp` |

In Docker, route 2 with the native connection has the fewest moving parts. If you already run mcpo for other MCP servers, add Firewalla to it with route 1.

## 1. mcpo starts the server (stdio)

### Write mcpo's config.json

Create `mcpo/config.json`:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "npx",
      "args": ["-y", "firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      }
    }
  }
}
```

`FIREWALLA_BOX_ID` is optional, and so is `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"`, which goes in the same `env` block; see [How the environment reaches the server](#how-the-environment-reaches-the-server) and [Write tools](#write-tools).

### Start mcpo

Make an API key for mcpo first, and keep the value `echo` prints: Open WebUI sends it with every call.

```bash
export MCPO_API_KEY="$(openssl rand -hex 32)"
echo "$MCPO_API_KEY"
```

Then, in the same shell, in Docker:

```bash
docker run -d --name mcpo -p 8000:8000 \
  -v "$PWD/mcpo:/app/conf:ro" \
  ghcr.io/open-webui/mcpo:main \
  --config /app/conf/config.json --api-key "$MCPO_API_KEY"
```

Or on the host with [uv](https://docs.astral.sh/uv/):

```bash
uvx --with 'mcp<2' mcpo --port 8000 --api-key "$MCPO_API_KEY" --config mcpo/config.json
```

The `--with 'mcp<2'` is needed: mcpo 0.0.20 does not start with version 2 of the `mcp` Python package (see [Troubleshooting](#uvx-mcpo-fails-with-importerror-streamablehttp_client)). The Docker image ships `mcp` 1.26.0 and needs nothing extra.

On the first start `npx` downloads the package, about 144 MB installed with its GeoIP data; that took 4 to 6 seconds on the host here, and 11 seconds in the mcpo container. The mcpo container downloads it again whenever the container is re-created.

mcpo listens on all interfaces by default. Keep `--api-key`: without it, anyone who can reach port 8000 can run the Firewalla tools with your token.

With stdio, the `MCP_HTTP_*` settings of the next routes do not apply: mcpo and the server talk over a pipe.

### Or run a local build

Build from source (`npm install && npm run build`, see the [README](../../README.md#option-c-install-from-source)), then point `command` at `node`:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "node",
      "args": ["/absolute/path/to/firewalla-mcp-server/dist/server.js"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      }
    }
  }
}
```

With mcpo in Docker, mount the checkout and use the path inside the container:

```bash
docker run -d --name mcpo -p 8000:8000 \
  -v "$PWD/mcpo:/app/conf:ro" \
  -v "/absolute/path/to/firewalla-mcp-server:/app/tools/firewalla:ro" \
  ghcr.io/open-webui/mcpo:main \
  --config /app/conf/config.json --api-key "$MCPO_API_KEY"
```

In `config.json`, use `"args": ["/app/tools/firewalla/dist/server.js"]`. The server's runtime dependencies have no native modules, so a build made on macOS runs in the Linux container.

### Or start the Docker image

mcpo on the host can start the image over stdio and keeps that container while mcpo runs. The `-e NAME` form passes the value from the `env` block without putting the token on the command line. mcpo's `env` reaches the `docker` command, not the container, so every variable the server needs must be named in `args` as well:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-e", "FIREWALLA_MSP_TOKEN", "-e", "FIREWALLA_MSP_ID",
        "-e", "FIREWALLA_BOX_ID",
        "amittell/firewalla-mcp-server:latest"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_msp_access_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net"
      }
    }
  }
}
```

`-e FIREWALLA_BOX_ID` forwards a box ID when you add `"FIREWALLA_BOX_ID": "<box gid>"` to `env`, and sets nothing when you don't. To turn on the write tools here, add `"-e", "FIREWALLA_ENABLE_WRITE_TOOLS"` to `args` and `"FIREWALLA_ENABLE_WRITE_TOOLS": "true"` to `env`. This needs the Docker CLI where mcpo runs; the mcpo image does not include it.

### Add mcpo to Open WebUI

1. In Open WebUI, open **Settings > Admin > Integrations** (in mid-2025 releases, **Admin Panel > Settings > Tools**)
2. Under **External Tool Servers**, choose **Add Connection**
3. **Type**: OpenAPI. **URL**: `http://<mcpo-host>:8000/firewalla`. The `/firewalla` part is required: mcpo serves each configured server under its own path, and its root is not a tool server
4. **Auth**: Bearer, with the key you gave `--api-key`
5. Save

A connection added here is called by the Open WebUI server, not your browser. If Open WebUI runs in Docker and mcpo runs on the host, `localhost` is the Open WebUI container itself: use the host's LAN address, or `http://host.docker.internal:8000/firewalla` as the Open WebUI docs suggest.

## 2. The Docker image over HTTP (Docker Compose)

The Docker image [`amittell/firewalla-mcp-server`](https://hub.docker.com/r/amittell/firewalla-mcp-server) (amd64, arm64 and arm/v7) runs the server; with `MCP_TRANSPORT=http` it serves MCP Streamable HTTP on port 3000 at `/mcp`, and Open WebUI connects to it over the Compose network.

This route needs the 2.0.0 image or later. Do not use `1.5.0` or `1` here: they have no token or `Host` checks.

`compose.yaml`:

```yaml
services:
  firewalla-mcp:
    image: amittell/firewalla-mcp-server:2
    environment:
      MCP_TRANSPORT: http
      MCP_HTTP_PORT: "3000"
      # The other services call http://firewalla-mcp:3000/mcp, so the Host
      # header is "firewalla-mcp"; without this the server answers 403.
      MCP_HTTP_ALLOWED_HOSTS: firewalla-mcp
      MCP_HTTP_BEARER_TOKEN: ${MCP_HTTP_BEARER_TOKEN}
      FIREWALLA_MSP_TOKEN: ${FIREWALLA_MSP_TOKEN}
      FIREWALLA_MSP_ID: ${FIREWALLA_MSP_ID}
      # FIREWALLA_BOX_ID: ${FIREWALLA_BOX_ID}         # optional; set it in .env too
      # FIREWALLA_ENABLE_WRITE_TOOLS: "true"          # optional: the 11 write tools
      # MCP_SESSION_IDLE_TIMEOUT_MS: "31536000000"    # with mcpo, see below
    # No "ports:": only the other services here can reach the server.
    healthcheck:
      # Healthy once port 3000 accepts connections. A TCP check sends no
      # HTTP request, so it adds no "Refused HTTP request" line to the log.
      test: ["CMD", "node", "-e", "require('net').connect(3000, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      WEBUI_SECRET_KEY: ${WEBUI_SECRET_KEY}
    volumes:
      - open-webui:/app/backend/data
    restart: unless-stopped

volumes:
  open-webui:
```

`.env`, next to `compose.yaml` (Compose substitutes these values; keep the file private):

```env
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net
# Set each of these two to its own output of: openssl rand -hex 32
MCP_HTTP_BEARER_TOKEN=
WEBUI_SECRET_KEY=
# FIREWALLA_BOX_ID=00000000-0000-0000-0000-000000000000
```

If you uncomment `FIREWALLA_BOX_ID` in `compose.yaml`, set it in `.env` too; without a value Compose passes an empty string, and queries cover every box. Then `docker compose up -d`. The token is required: the image listens on `0.0.0.0`, where the server does not start without `MCP_HTTP_BEARER_TOKEN` or with one shorter than 16 characters, and `docker compose logs firewalla-mcp` shows a `refusing to start` line that says why. If Open WebUI already runs in another Compose file, add the `firewalla-mcp` service to that file instead, so that the two share a network.

### Connect Open WebUI natively

1. **Settings > Admin > Integrations**, under **External Tool Servers**, **Add Connection**
2. **Type**: MCP (some releases label it *MCP (Streamable HTTP)*)
3. **URL**: `http://firewalla-mcp:3000/mcp`
4. **Auth**: Bearer, with the value of `MCP_HTTP_BEARER_TOKEN`
5. Save

Open WebUI prefixes each tool with the connection's ID: with the ID `firewalla`, `get_boxes` was offered to the model as `firewalla_get_boxes`. It opens a new MCP session for each chat and closes it afterwards, so restarting the `firewalla-mcp` container does not break it.

### Or connect through mcpo

Add an mcpo service to `compose.yaml`, under `services:`:

```yaml
  mcpo:
    image: ghcr.io/open-webui/mcpo:main
    command: ["--config", "/app/conf/config.json", "--api-key", "${MCPO_API_KEY}"]
    volumes:
      - ./mcpo:/app/conf:ro
    depends_on:
      firewalla-mcp:
        condition: service_healthy
    restart: unless-stopped
```

add a key for mcpo to `.env`, and create `mcpo/config.json`. mcpo sends the `headers` with every request to the server; it does not substitute variables in `config.json`, so the file holds the token itself. In the directory with `compose.yaml` and `.env`:

```bash
echo "MCPO_API_KEY=$(openssl rand -hex 32)" >> .env
token=$(sed -n 's/^MCP_HTTP_BEARER_TOKEN=//p' .env)
mkdir -p mcpo
cat > mcpo/config.json <<EOF
{
  "mcpServers": {
    "firewalla": {
      "type": "streamable-http",
      "url": "http://firewalla-mcp:3000/mcp",
      "headers": {
        "Authorization": "Bearer $token"
      }
    }
  }
}
EOF
```

Run it again if you change `MCP_HTTP_BEARER_TOKEN`.

In Open WebUI, add the connection as in route 1: **Type** OpenAPI, **URL** `http://mcpo:8000/firewalla`, **Auth** Bearer with `MCPO_API_KEY`.

Also uncomment `MCP_SESSION_IDLE_TIMEOUT_MS: "31536000000"` (a year) in the `firewalla-mcp` service. mcpo opens one MCP session when it starts and keeps it. The server closes a session after `MCP_SESSION_IDLE_TIMEOUT_MS` without a request (default 30 minutes), and a restarted server has no sessions; either way mcpo keeps sending the old session ID, and its tool calls then hang until mcpo is restarted. For the same reason, run `docker compose restart mcpo` after the `firewalla-mcp` container restarts. See [Troubleshooting](#mcpo-tool-calls-hang-after-a-while-http).

mcpo connects to each server once, when it starts, and does not retry; `depends_on` with the health check makes it wait until the server is listening.

## 3. Native MCP to a server on the host

To run the server on the host instead of in Docker, with the HTTP transport, make a token first, and keep the value `echo` prints for Open WebUI:

```bash
export MCP_HTTP_BEARER_TOKEN="$(openssl rand -hex 32)"
echo "$MCP_HTTP_BEARER_TOKEN"
```

Then, in the same shell:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
MCP_HTTP_HOST=0.0.0.0 \
MCP_HTTP_ALLOWED_HOSTS=host.docker.internal,192.168.1.10 \
FIREWALLA_MSP_TOKEN=your_msp_access_token_here \
FIREWALLA_MSP_ID=yourdomain.firewalla.net \
npx -y 'firewalla-mcp-server@>=2.0.0'
```

The version range keeps `npx` from running 1.5.0 or earlier, which have no token or `Host` checks.

- `MCP_HTTP_HOST=0.0.0.0` accepts connections from other machines and from containers. Without it the server listens on 127.0.0.1 only.
- `MCP_HTTP_ALLOWED_HOSTS` lists every name or address clients put in the URL, besides `localhost`, `127.0.0.1` and `[::1]`: here `host.docker.internal` for an Open WebUI container on this host, and `192.168.1.10` standing for the host's LAN address. A request with any other `Host` gets 403.
- `MCP_HTTP_BEARER_TOKEN`, exported above: required with `MCP_HTTP_HOST=0.0.0.0`, at least 16 characters; without it the server does not start. In Open WebUI, choose **Auth** Bearer with this value.
- Port 3001 avoids the `3000:8080` mapping that Open WebUI installs often use.

Then add the connection as in route 2, with **URL** `http://host.docker.internal:3001/mcp` from an Open WebUI container on this host, or `http://192.168.1.10:3001/mcp` from another machine. `FIREWALLA_BOX_ID` and `FIREWALLA_ENABLE_WRITE_TOOLS=true` go on the same command line if you want them.

Plain HTTP is fine on the same host or an isolated container network. From another machine the bearer token and your Firewalla data cross the network unencrypted: put an HTTPS reverse proxy in front of the server, or connect over an encrypted tunnel such as Tailscale or WireGuard. The same goes for mcpo's port 8000.

On macOS with colima, `host.docker.internal` resolved in the Open WebUI container and reached the host. On Linux, Docker needs `extra_hosts: ["host.docker.internal:host-gateway"]` on the Open WebUI service for that name (not tested here).

## HTTP transport settings

Routes 2 and 3 use the HTTP transport. Its checks, and what Open WebUI and mcpo need for each (details in the [README](../../README.md#http-transport-security)):

| Setting | Default | What a client needs |
|---------|---------|---------------------|
| `MCP_HTTP_HOST` | `127.0.0.1`; `0.0.0.0` in the Docker image | nothing; it decides who can connect |
| `MCP_HTTP_ALLOWED_HOSTS` | only `localhost`, `127.0.0.1`, `[::1]` and the `MCP_HTTP_HOST` address; the image's `0.0.0.0` adds nothing | the host name in the client's URL must be one of these, else 403 `Host not allowed`. Between containers that is the service name |
| `MCP_HTTP_BEARER_TOKEN` | not set; required, at least 16 characters, unless `MCP_HTTP_HOST` is loopback, so the Docker image needs it | `Authorization: Bearer <token>`, else 401: **Auth** Bearer in Open WebUI, `headers` in mcpo's `config.json` |
| `MCP_HTTP_ALLOW_NO_TOKEN` | `false` | nothing; `true` starts the server beyond loopback without a token. None of these routes uses it |
| `MCP_HTTP_PATH` | `/mcp` | the URL must end in `/mcp` (or `/mcp/`), else 404 |
| `MCP_HTTP_ALLOWED_ORIGINS` | none | nothing: Open WebUI's native connection and mcpo connect from their servers, send no `Origin`, and worked with it unset |

## How the environment reaches the server

- Required: `FIREWALLA_MSP_TOKEN` and `FIREWALLA_MSP_ID` (the domain only, without `https://`). Without them the server exits with an error such as `Required environment variable FIREWALLA_MSP_ID is not set`.
- Optional: `FIREWALLA_BOX_ID`. Without it, queries cover every box on the account; `get_boxes` lists the boxes and their GIDs. `FIREWALLA_DEFAULT_BOX_ID` sets the box for single-box operations without filtering queries. See the [README](../../README.md#2-configuration).
- When mcpo starts the server (stdio), it receives mcpo's own environment plus the `env` block from `config.json`; a name set in both takes the `env` block's value. So credentials and `FIREWALLA_ENABLE_WRITE_TOOLS` can go in `config.json`, or in the environment of the mcpo container (`environment:` in Compose), and one of the two is enough.
- A `.env` file is read from the server's working directory, which under mcpo is mcpo's directory (`/app` in the mcpo image), not the server's folder. A `.env` placed next to the server's `dist/` directory is not read when mcpo starts it.
- With the HTTP transport in Docker, the server reads the container's environment, from `environment:` in Compose or `docker run -e` / `--env-file`. The `MCP_HTTP_*` settings and `FIREWALLA_ENABLE_WRITE_TOOLS` go there, not in mcpo's `config.json`: over HTTP, mcpo does not start the server.

## Verify

1. Through mcpo: open `http://<mcpo-host>:8000/docs`, which links to `firewalla`, then `http://<mcpo-host>:8000/firewalla/docs`. The page is titled **firewalla-mcp-server** with the server's version, and lists one `POST` endpoint per tool, such as `/get_boxes`: 28 by default, 39 with the write tools. A title of just `firewalla` with no endpoints means mcpo did not connect; see [Troubleshooting](#firewalladocs-lists-no-endpoints). Call a tool:

   ```bash
   curl -s -X POST http://localhost:8000/firewalla/get_boxes \
     -H "Authorization: Bearer $MCPO_API_KEY" -H "Content-Type: application/json" -d '{}'
   ```

   In route 1, run it in the shell that exported `MCPO_API_KEY`. Compose reads `.env` without exporting it to your shell, so in route 2 export the key from there first: `export MCPO_API_KEY="$(sed -n 's/^MCPO_API_KEY=//p' .env)"`. An unset variable sends an empty key, and mcpo answers 401. With real credentials this returns your boxes. An answer that quotes a Firewalla API error, such as `getaddrinfo ENOTFOUND` for a mistyped MSP domain, still shows that mcpo reached the server.

2. Over the HTTP transport: send an MCP `initialize` from where Open WebUI runs, with the URL and token it uses. In route 2, from the Open WebUI container:

   ```bash
   docker compose exec open-webui curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST http://firewalla-mcp:3000/mcp \
     -H "Authorization: Bearer $MCP_HTTP_BEARER_TOKEN" \
     -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
   ```

   `200` means the connection will work. `401` is a missing or wrong token, `403` a `Host` that is not allowed, `404` a path other than `/mcp`; the server's log (`docker compose logs firewalla-mcp`) says which, in a `Refused HTTP request` line. Export the token from `.env` first: `export MCP_HTTP_BEARER_TOKEN="$(sed -n 's/^MCP_HTTP_BEARER_TOKEN=//p' .env)"`.

3. In Open WebUI: start a chat with your model, turn the Firewalla tool server on from the integrations button below the message box, and ask *"Which Firewalla boxes do I have?"*

**Function calling**: in Open WebUI 0.11 the model setting **Function Calling** defaults to Native, which is what these tools were tested with. In August 2025 a Reddit user found that the tools worked only after setting it to Native in the model's advanced parameters. If the model answers without calling a tool, check that setting and that the model supports tool calling.

## Write tools

By default the server registers 24 read-only tools, the `get_*` and `search_*` tools, and nothing that can change your box. The 11 write tools, `create_rule`, `delete_rule`, `pause_rule`, `resume_rule`, `create_target_list`, `update_target_list`, `delete_target_list`, `rename_device`, `archive_alarm`, `mute_alarm` and `delete_alarm`, are registered only when the server's environment has `FIREWALLA_ENABLE_WRITE_TOOLS=true`; mcpo then lists 35 endpoints. They need an MSP token with write access. See [Write tools](../../README.md#write-tools-opt-in).

Where the flag goes:

- mcpo starting the server (route 1): the `env` block of `config.json`, or `-e` in the `docker run` args as shown there
- the Docker image over HTTP (route 2): `environment:` of the `firewalla-mcp` service
- the host command (route 3): the command line

To offer only some of them through mcpo, list the others in the server's entry in `config.json`:

```json
"disabledTools": ["delete_rule", "delete_target_list", "delete_alarm"]
```

With the write tools on and that list, mcpo served 32 endpoints, none of them a delete.

## Troubleshooting

### mcpo never opens its port ("port 8000 shows down")

This is the failure reported on r/firewalla in July 2025: with the README's `npx` block added to mcpo's `config.json`, mcpo never came up, and without it the other mcpo tools worked.

**Cause**: releases before 1.4.0 decided whether to start by comparing their own file URL with the path in `process.argv[1]`. Under `npx`, a global install, or any path through a symlink, that path is the symlink, the two never match, and the process loads, registers nothing and waits silently. mcpo connects to every configured server before uvicorn opens its port, and it waits for the MCP `initialize` answer with no timeout, so the port never opens for any server. `node /absolute/path/dist/server.js` on the real path did start, which is why the recipe posted later on Reddit, a local build started with `node`, worked. Fixed in 1.4.0 ([#36](https://github.com/amittell/firewalla-mcp-server/pull/36)).

Reproduced on 2026-09-26: mcpo 0.0.16 (the release current in July 2025) with `npx firewalla-mcp-server@1.0.2` and dummy credentials opened no port in 120 seconds; mcpo 0.0.20 with `firewalla-mcp-server@1.3.0` opened none in 60 seconds, with the log ending at `Initiating connection for server: 'firewalla'...`. Under `npx`, 1.4.0 and 1.5.0 answered `initialize` within 3 seconds, and mcpo with 1.5.0 was listening within 6 seconds.

**Fix**: use 1.4.0 or later. `npx -y firewalla-mcp-server` installs the current release; if your config pins a version such as `firewalla-mcp-server@1.0.2`, raise it. The Docker image always started, because it runs `node dist/server.js` on the real path.

mcpo 0.0.16 had a second way to produce the same symptom: if any configured server exited during startup, for example because a required variable was missing (1.0.x also required `FIREWALLA_BOX_ID`), the whole of mcpo exited. mcpo 0.0.20 logs `Failed to connect to MCP server 'firewalla'` and serves the other servers.

### `uvx mcpo` fails with ImportError: streamablehttp_client

```text
ImportError: cannot import name 'streamablehttp_client' from 'mcp.client.streamable_http'
```

mcpo 0.0.20 requires `mcp>=1.17.0` with no upper bound, and `mcp` 2.0 (July 2026) removed that function, so a fresh `uvx mcpo` gets a version mcpo cannot import, and `pip install mcpo` resolves the same range. Run `uvx --with 'mcp<2' mcpo ...`, pin `mcp<2` in a pip environment, or use the Docker image. Upstream: [open-webui/mcpo#303](https://github.com/open-webui/mcpo/issues/303).

### /firewalla/docs lists no endpoints

mcpo started but did not connect to the server. Its startup summary lists `firewalla` under `Failed to connect to:`, and the lines before it say why:

- `McpError: Connection closed` from a stdio server: the server exited. The lines above it show its error, often a missing `FIREWALLA_MSP_TOKEN` or `FIREWALLA_MSP_ID`.
- `Client error '401 Unauthorized'`: the `Authorization` header in `config.json` does not match `MCP_HTTP_BEARER_TOKEN`.
- `Client error '403 Forbidden'`: the host name in `url` is not in `MCP_HTTP_ALLOWED_HOSTS`.
- `McpError: Session terminated` after a `404 Not Found`: `url` does not end in `/mcp`.
- `400 Bad Request` with `"type": "sse"`: use `"type": "streamable-http"`; the server does not implement the older SSE transport.
- An HTTP server that was not answering when mcpo started: mcpo does not retry. Restart mcpo, and use the health check from the Compose example.

### mcpo tool calls hang after a while (HTTP)

With mcpo connected over HTTP (route 2 through mcpo), a tool call that worked earlier never answers, and `docker stats` may show mcpo using a whole CPU core. mcpo is still sending the MCP session ID it got at startup, but the server no longer has that session: it closed it after `MCP_SESSION_IDLE_TIMEOUT_MS` without a request (default 30 minutes), or the server restarted. Up to 1.5.0 the server answers that session ID with 400; from 2.0.0 it answers 404, which the MCP spec tells a client to take as the cue to start a new session. mcpo 0.0.20 neither opens a new session nor gives up after the 400, and whether it recovers on the 404 has not been tested ([open-webui/mcpo#302](https://github.com/open-webui/mcpo/issues/302) is the CPU part). Restart mcpo, and set `MCP_SESSION_IDLE_TIMEOUT_MS` on the server as in route 2. The stdio routes and Open WebUI's native connection do not have this problem.

### Open WebUI says "Failed to create MCP client"

The native connection could not speak MCP to that URL. Run the `curl` check from [Verify](#verify) from the Open WebUI container, and read the server's log: a `Refused HTTP request` line says whether the token (401) or the `Host` (403) was refused. Otherwise, check that the URL ends in `/mcp`, that the host resolves from the Open WebUI server (inside a container, `localhost` is the container), and that the URL is the Firewalla server rather than mcpo: an mcpo URL belongs in an OpenAPI connection.

### pause_rule and the target-list tools are missing

They are write tools now, off unless `FIREWALLA_ENABLE_WRITE_TOOLS=true`; up to 1.5.0 they were always registered. See [Write tools](#write-tools) for where the flag goes.

### npm warns EBADENGINE for geoip-lite

The mcpo image has Node.js 22, and geoip-lite 2.x declares Node 24 for its database update script. The warning is harmless; the lookups the server uses run on Node 18 and later.

## What was tested

On 2026-09-26, on macOS (arm64) with Docker in colima (Linux arm64), with dummy credentials (`FIREWALLA_MSP_ID=example.firewalla.net`, which does not resolve), so that every tool call ended in `getaddrinfo ENOTFOUND` inside the server and no request reached Firewalla:

- The server built from the main branch after 1.5.0: `node dist/server.js`, `npx` of its packed tarball, and a Docker image built from it. mcpo listed 24 tools, 35 with `FIREWALLA_ENABLE_WRITE_TOOLS=true` and 32 with the `disabledTools` example. The route 1 configs were also run with 1.5.0 from npm and the `amittell/firewalla-mcp-server:1.5.0` image, which list 28.
- mcpo 0.0.20 as `ghcr.io/open-webui/mcpo:main` (Node.js 22.22.0, npm 10.9.4, `mcp` 1.26.0) and through `uvx` with `mcp` 1.30.0, on host Node.js 24.18.0; each passed a `get_boxes` call through to the server.
- The HTTP transport: `initialize` got 200 with an allowed `Host` and the token, 401 without the token or with a wrong one, 403 for a `Host` not in `MCP_HTTP_ALLOWED_HOSTS` (the service name `firewalla-mcp` before it was added) and for a browser `Origin`, and 404 on `/mcpx`. mcpo's `headers` carried the token; without them mcpo got 401.
- The Compose file above with Open WebUI 0.11.4, with an override that used the locally built image and published the ports on loopback, with and without the mcpo service. Open WebUI accepted the native connection with **Auth** Bearer and refused it with no auth or a wrong key, and accepted the mcpo connection; each listed 24 tools. In a chat through each, a stand-in OpenAI-compatible model called `get_boxes`, and Open WebUI ran the tool and passed the server's answer back to the model. The native chat still worked after `docker compose restart firewalla-mcp`. The `build:` line for the Compose file built an image from the repository that answered 403 to an unknown `Host` and 401 without the token.
- Route 3 with the local build: an Open WebUI container reached it at `http://host.docker.internal:3001/mcp` once `host.docker.internal` was in `MCP_HTTP_ALLOWED_HOSTS`, and got 403 before. With plain `npx -y firewalla-mcp-server`, which installed 1.5.0, the same settings answered 200 to a request without the token and to one with an unknown `Host`, which is why routes 2 and 3 need 2.0.0. `npx -y 'firewalla-mcp-server@>=2.0.0'` stopped with `ETARGET` while npm had only 1.5.0, and the same form with `>=1.5.0` started the server.
- `"-e", "FIREWALLA_BOX_ID"` in the `docker run` args forwarded a value set in the environment mcpo passes to `docker`, and set nothing in the container when it was unset.
- mcpo over HTTP after the server closed its session. With the default timeout, mcpo's last request was its event stream reconnecting 5 minutes after it started; the server closed the session 31 minutes after that, and a tool call 42 minutes after the start did not answer in 25 seconds. With `MCP_SESSION_IDLE_TIMEOUT_MS=5000` the same happened within 15 seconds. After the `firewalla-mcp` container was re-created, mcpo's call hung and mcpo used 105% CPU. With the one-year setting, a call after 70 seconds idle (past the server's 60-second sweep) answered.
- On 2026-09-28 the server began refusing to start beyond loopback without a token of at least 16 characters, and the literal tokens and keys in these recipes were replaced: the commands make them with `openssl rand -hex 32`, and `.env` leaves them empty to fill in. The new lines, the `sed` lines that read `.env`, and the command that writes `mcpo/config.json` were run in zsh and bash on macOS, and the file they wrote parsed as JSON with the `.env` token in its header. They were not run again with mcpo or Open WebUI.

Not tested: a real MSP account, a real model, Windows, an amd64 host, a Linux Docker host, a user-level (browser-side) tool server connection, and the Open WebUI screens themselves (connections were made through Open WebUI's API).

---

*Need another client? [Return to main setup guide](../../README.md#client-setup-guides)*
