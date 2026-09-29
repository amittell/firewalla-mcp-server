/**
 * Candidates for the "client error-classification issues" of Copilot's
 * final overview of #78 that turned out to be classified right. Each test
 * pins what the client does, on a local server.
 * - A request cancelled because its tool gave up is neither a timeout of
 *   the API nor a network failure that is sent again, and the tool reports
 *   its own timeout.
 * - axios never gives a response without a status on Node (its http
 *   adapter sets `status: res.statusCode`); an answer too malformed to parse
 *   comes with no response, and counts as none.
 * - A 401 and a 403 each get their own text, and only a 403 to a write says
 *   the token may be read-only.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiRequestError } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import {
  TimeoutManager,
  withToolTimeout,
} from '../../src/utils/timeout-manager.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  json,
  makeClient,
  requestError,
  startLocalApi,
} from './local-api.js';

/** What the server does with every request */
let mode: 'hang' | 401 | 403 = 'hang';
let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((_request, response) => {
    if (mode !== 'hang') {
      json(response, mode, { error: { message: 'refused' } });
    }
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  api.received.length = 0;
  mode = 'hang';
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const client = () => makeClient(`http://127.0.0.1:${api.port}`);
const registry = new ToolRegistry({ enableWriteTools: true });

/** Tools give up after `ms` instead of 30 s */
function toolTimeout(ms: number) {
  const real = TimeoutManager.prototype.withTimeout;
  jest
    .spyOn(TimeoutManager.prototype, 'withTimeout')
    .mockImplementation(function (this: TimeoutManager, operation, config) {
      return real.call(this, operation, { ...config, timeoutMs: ms });
    });
}

describe('a request cancelled because its tool gave up', () => {
  it('is not a timeout of the API and is not sent again; the tool says it timed out', async () => {
    toolTimeout(150);
    let cancelled: any;
    const outcome = await withToolTimeout(async () => {
      try {
        return await (client() as any).request('GET', '/v2/boxes');
      } catch (error) {
        cancelled = error;
        throw error;
      }
    }, 'get_boxes').catch(error => error);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(outcome.name).toBe('TimeoutError');
    expect(cancelled).toBeInstanceOf(ApiRequestError);
    expect(cancelled).toMatchObject({ code: 'ERR_CANCELED', attempts: 1 });
    expect(api.received).toEqual(['GET /v2/boxes']);
  });

  it('get_device_status answers timeout_error, not a network error', async () => {
    toolTimeout(150);
    const response = await registry
      .getHandler('get_device_status')!
      .execute({ box: BOX }, client());
    const body = JSON.parse(response.content[0].text);

    expect(body.errorType).toBe('timeout_error');
    expect(body.message).toMatch(/^Operation timed out after \d+ms/);
  });
});

describe('an answer too malformed to parse', () => {
  let garbage: Server;
  let port: number;

  beforeAll(async () => {
    garbage = createServer();
    // Not HTTP at all: the client's parser fails before any status
    garbage.on('connection', socket => {
      socket.on('data', () => {
        socket.end('not an http answer\r\n\r\n');
      });
    });
    await new Promise<void>(resolve => {
      garbage.listen(0, '127.0.0.1', resolve);
    });
    ({ port } = garbage.address() as AddressInfo);
  });

  afterAll(async () => {
    await new Promise(resolve => {
      garbage.close(resolve);
    });
  });

  it('has no response and no status, and a read is not sent again', async () => {
    const error = await requestError(
      makeClient(`http://127.0.0.1:${port}`),
      'GET',
      '/v2/boxes'
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBeUndefined();
    expect(error.attempts).toBe(1);
    expect(error.message).toMatch(/^Firewalla API sent no answer \(/);
  });
});

describe('401 and 403', () => {
  it('a 401 says the token failed, not that it is forbidden', async () => {
    mode = 401;
    const error = await requestError(client(), 'GET', '/v2/boxes');

    expect(error.message).toContain(
      'Authentication failed. Please check your MSP token.'
    );
    expect(error.message).not.toContain('Forbidden');
  });

  it('a 403 to a read names the box, with no word of a read-only token', async () => {
    mode = 403;
    const error = await requestError(client(), 'GET', '/v2/boxes');

    expect(error.message).toMatch(/^Forbidden \(HTTP 403\): refused\. /);
    expect(error.message).not.toContain('read-only');
  });

  it('a 403 to a write says the token may be read-only', async () => {
    mode = 403;
    const error = await requestError(client(), 'POST', '/v2/rules');

    expect(error.message).toContain(
      'This request changes state (POST), so the token may be read-only'
    );
  });
});
