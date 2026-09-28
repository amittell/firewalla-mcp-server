/**
 * A write that reached the API and got no HTTP status, because its
 * API_TIMEOUT ran out or the connection was reset after the request went
 * out, may have been applied. The write tools reported it as an ordinary
 * failure ("Failed to create rule: Firewalla API sent no answer ..."), and
 * a caller that sends it again can create the rule twice. They now say the
 * outcome is unknown and name the read to check first, as a tool that
 * gives up with its write in flight does. A write that got an HTTP status,
 * or never reached the server, keeps its ordinary error.
 *
 * The API is a local HTTP server that records each request it receives,
 * so a test sees that the write reached it. Nothing leaves the machine.
 */

import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';

const BOX = '11111111-2222-3333-4444-555555555555';

/** What the server does with a write (POST, PUT, PATCH or DELETE) */
type WriteMode = 'hang' | 'reset' | 'status500';

let server: Server;
let port: number;
let writeMode: WriteMode;
/** Every request the server received, as "METHOD /path" */
let received: string[];

/** An answer shaped like the API's to each read the write tools make first */
function readAnswer(request: IncomingMessage): unknown {
  const path = (request.url ?? '').split('?')[0];
  if (path === '/v2/boxes') {
    return [{ gid: BOX, name: 'home', model: 'gold', online: true }];
  }
  if (path === '/v2/rules') {
    const rule = { id: 'rule-1', action: 'block', status: 'active' };
    const target = { type: 'domain', value: 'example.com' };
    return { count: 1, results: [{ ...rule, target, gid: BOX }] };
  }
  if (path.startsWith('/v2/alarms/')) {
    return { aid: 1, gid: BOX, type: 1, status: 1, ts: 1_700_000_000 };
  }
  return {};
}

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      received.push(`${request.method} ${(request.url ?? '').split('?')[0]}`);
      if (request.method === 'GET') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(readAnswer(request)));
        return;
      }
      if (writeMode === 'reset') {
        // The whole request arrived; the connection drops before an answer
        request.socket.destroy();
        return;
      }
      if (writeMode === 'status500') {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: 'boom' }));
      }
      // 'hang': never answered
    });
  });
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  ({ port } = server.address() as AddressInfo);
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => {
    server.close(resolve);
  });
});

beforeEach(() => {
  received = [];
  writeMode = 'hang';
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  server.closeAllConnections();
});

function makeClient(apiTimeout: number, baseUrl?: string) {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    mspBaseUrl: baseUrl ?? `http://127.0.0.1:${port}`,
    apiTimeout,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

const registry = new ToolRegistry({ enableWriteTools: true });

/** Runs a tool and returns its answer's text and parsed body */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  client: FirewallaClient
) {
  const handler = registry.getHandler(name);
  if (!handler) {
    throw new Error(`${name} is not registered`);
  }
  const response = await handler.execute(args, client);
  const text = response.content[0].text;
  return { response, text, body: JSON.parse(text) };
}

const UNKNOWN =
  'The outcome is unknown: Firewalla may have applied the change.';

describe('a write sent and not answered', () => {
  it('create_rule whose API_TIMEOUT of 100 ms runs out says the rule may have been created', async () => {
    const { response, body } = await callTool(
      'create_rule',
      { action: 'block', target_type: 'internet', gid: BOX },
      makeClient(100)
    );

    expect(received.filter(line => line.startsWith('POST'))).toEqual([
      'POST /v2/rules',
    ]);
    expect(response.isError).toBe(true);
    expect(body.message).toBe(
      `POST /v2/rules was sent and not answered (ECONNABORTED: timeout of 100ms exceeded). ${UNKNOWN} Check with get_network_rules before trying again.`
    );
    expect(body.message).not.toContain('Failed to');
    expect(body.details).toMatchObject({ write: 'unknown' });
  });

  it('delete_target_list whose connection is reset after the request is written says it may have been deleted', async () => {
    writeMode = 'reset';
    const { response, body } = await callTool(
      'delete_target_list',
      { id: 'TL-1' },
      makeClient(5000)
    );

    expect(received).toEqual(['DELETE /v2/target-lists/TL-1']);
    expect(response.isError).toBe(true);
    expect(body.message).toBe(
      `DELETE /v2/target-lists/TL-1 was sent and not answered (ECONNRESET: socket hang up). ${UNKNOWN} Check with get_target_lists before trying again.`
    );
    expect(body.details).toMatchObject({ write: 'unknown' });
  });

  it('pause_rule with its connection reset says the rule may have been paused', async () => {
    writeMode = 'reset';
    const { body } = await callTool(
      'pause_rule',
      { rule_id: 'rule-1' },
      makeClient(5000)
    );

    expect(received).toEqual(['GET /v2/rules', 'POST /v2/rules/rule-1/pause']);
    expect(body.message).toContain(
      `POST /v2/rules/rule-1/pause was sent and not answered (ECONNRESET: socket hang up). ${UNKNOWN} Check with get_network_rules before trying again.`
    );
    expect(body.message).not.toContain('Failed to');
  });

  it('archive_alarm keeps its own wording, and does not say it failed', async () => {
    writeMode = 'reset';
    const { response, body } = await callTool(
      'archive_alarm',
      { alarm_id: '1', gid: BOX },
      makeClient(5000)
    );

    expect(received).toEqual([
      `GET /v2/alarms/${BOX}/1`,
      `POST /v2/alarms/${BOX}/1/archive`,
    ]);
    expect(response.isError).toBe(true);
    expect(body.message).toBe(
      `POST /v2/alarms/${BOX}/1/archive got no HTTP status (Firewalla API sent no answer (ECONNRESET: socket hang up)). The alarm may or may not have been archived: check its status with get_specific_alarm (2 is archived) before retrying`
    );
    expect(body.details).toMatchObject({ write: 'unknown' });
  });
});

describe('a write with an ordinary failure keeps its error', () => {
  it('create_rule answered 500 says it failed, with the status', async () => {
    writeMode = 'status500';
    const { body } = await callTool(
      'create_rule',
      { action: 'block', target_type: 'internet', gid: BOX },
      makeClient(5000)
    );

    expect(body.message).toBe(
      'Failed to create rule: Firewalla API answered 500 Internal Server Error: the Firewalla API is experiencing issues'
    );
    expect(body.details?.write).toBeUndefined();
  });

  it('create_rule whose connection is refused never reached the API, and says it failed', async () => {
    // A port nothing listens on: the connection is refused before any
    // request is written
    const closed = createServer();
    await new Promise<void>(resolve => {
      closed.listen(0, '127.0.0.1', resolve);
    });
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise(resolve => {
      closed.close(resolve);
    });
    const client = makeClient(5000, `http://127.0.0.1:${closedPort}`);
    const handler = registry.getHandler('create_rule')!;
    // The box gid is given, so no read comes first
    const response = await handler.execute(
      { action: 'block', target_type: 'internet', gid: BOX },
      client
    );
    const body = JSON.parse(response.content[0].text);

    expect(body.message).toMatch(
      /^Failed to create rule: Firewalla API sent no answer \(ECONNREFUSED: /
    );
    expect(body.message).not.toContain('outcome is unknown');
  });
});
