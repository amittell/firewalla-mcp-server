/**
 * A local HTTP server standing in for the MSP API, for tests that need a
 * real socket: it records each request it receives, as "METHOD /path", and
 * answers with `answer`. Nothing leaves the machine.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { FirewallaClient } from '../../src/firewalla/client.js';

export const BOX = '11111111-2222-3333-4444-555555555555';

export type Answer = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string
) => void;

/** Answers JSON `body` with `status` */
export function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(body));
}

/** The API's answers to the reads the write tools make first */
export function readAnswer(response: ServerResponse, path: string): void {
  if (path === '/v2/boxes') {
    json(response, 200, [{ gid: BOX, name: 'home', online: true }]);
  } else if (path.startsWith('/v2/alarms/')) {
    json(response, 200, { aid: 1, gid: BOX, type: 1, status: 1 });
  } else {
    json(response, 200, { count: 0, results: [] });
  }
}

export async function startLocalApi(answer: Answer) {
  const received: string[] = [];
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      const path = (request.url ?? '').split('?')[0];
      received.push(`${request.method} ${path}`);
      answer(request, response, path);
    });
  });
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    port,
    received,
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => {
        server.close(resolve);
      });
    },
  };
}

/** A port nothing listens on: a connection to it is refused */
export async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise(resolve => {
    server.close(resolve);
  });
  return port;
}

export function makeClient(baseUrl: string, apiTimeout = 5000) {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    mspBaseUrl: baseUrl,
    apiTimeout,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

/** What request() threw for `method path`, or 'ok' */
export async function requestError(
  client: FirewallaClient,
  method: 'GET' | 'POST' | 'DELETE',
  path: string
): Promise<any> {
  return (client as any)
    .request(method, path, undefined, method === 'POST' ? {} : undefined, false)
    .then(() => 'ok')
    .catch((error: unknown) => error);
}
