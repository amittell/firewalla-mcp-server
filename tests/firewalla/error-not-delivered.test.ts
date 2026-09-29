/**
 * A request that failed before it reached the API (the connection refused,
 * the host name not resolved, the TLS handshake failed) says the API could
 * not be reached, not that it "sent no answer". A write that failed this
 * way was not applied: a TLS failure on a write was reported as "sent and
 * not answered ... Firewalla may have applied the change", since only
 * ECONNREFUSED, ENOTFOUND and EAI_AGAIN were known to fail before sending.
 */

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  ApiRequestError,
  WriteOutcomeUnknownError,
} from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  closedPort,
  makeClient,
  readAnswer,
  requestError,
  startLocalApi,
} from './local-api.js';

let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((_request, response, path) =>
    readAnswer(response, path)
  );
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  api.received.length = 0;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const NOT_REACHED = /^Could not reach the Firewalla API \(/;

describe('a request that never reached the API', () => {
  it('a refused connection says the API could not be reached', async () => {
    const client = makeClient(`http://127.0.0.1:${await closedPort()}`);
    const error = await requestError(client, 'GET', '/v2/boxes');

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'ECONNREFUSED', status: undefined });
    expect(error.message).toMatch(NOT_REACHED);
    expect(error.message).not.toContain('sent no answer');
  });

  it('a failed TLS handshake says the same, and nothing reached the server', async () => {
    // https to a plain HTTP port: the handshake fails, no request is parsed
    const client = makeClient(`https://127.0.0.1:${api.port}`);
    const error = await requestError(client, 'GET', '/v2/boxes');

    expect(error).toMatchObject({ code: 'EPROTO' });
    expect(error.message).toMatch(NOT_REACHED);
    expect(api.received).toEqual([]);
  });

  it('create_rule whose TLS handshake failed says it failed, not that it may have been applied', async () => {
    const client = makeClient(`https://127.0.0.1:${api.port}`);
    const handler = new ToolRegistry({ enableWriteTools: true }).getHandler(
      'create_rule'
    )!;
    const response = await handler.execute(
      { action: 'block', target_type: 'internet', gid: BOX },
      client
    );
    const body = JSON.parse(response.content[0].text);

    expect(api.received).toEqual([]);
    expect(body.message).toMatch(
      /^Failed to create rule: Could not reach the Firewalla API \(EPROTO: /
    );
    expect(body.message).not.toContain('outcome is unknown');
    expect(body.details?.write).toBeUndefined();
  });

  it.each([
    ['ENOTFOUND', 'getaddrinfo ENOTFOUND api.example.invalid'],
    ['EAI_AGAIN', 'getaddrinfo EAI_AGAIN api.example.invalid'],
    ['EHOSTUNREACH', 'connect EHOSTUNREACH 192.0.2.1:443'],
    ['CERT_HAS_EXPIRED', 'certificate has expired'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'self-signed certificate'],
    [
      'ERR_TLS_CERT_ALTNAME_INVALID',
      "Hostname/IP does not match certificate's altnames",
    ],
  ])('a write failing with %s was not sent', async (code, message) => {
    const client = makeClient(`http://127.0.0.1:${api.port}`);
    (client as any).api.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ) => {
      throw new AxiosError(message, code, config);
    };
    const error = await requestError(client, 'POST', '/v2/rules');

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).not.toBeInstanceOf(WriteOutcomeUnknownError);
    expect(error.message).toBe(
      `Could not reach the Firewalla API (${code}: ${message})`
    );
  });
});
