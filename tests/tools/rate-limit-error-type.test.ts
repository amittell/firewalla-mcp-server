/**
 * A tool refused for the rate limit answers errorType "rate_limit_error",
 * as docs/error-handling-guide.md tells clients to expect for a 429. The
 * handlers passed their usual kind, so a 429 the client gave up on, or a
 * request the client's own rate limiter refused, came back as "api_error"
 * or "search_error", and a client waiting on "rate_limit_error" to back off
 * never saw one.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  json,
  readAnswer,
  startLocalApi,
} from '../firewalla/local-api.js';

let status = 429;
let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((_request, response, path) => {
    if (status) {
      // A window that ends in 2 minutes: too far to wait, so not retried
      json(
        response,
        status,
        { error: { message: 'Too Many Requests' } },
        {
          'retry-after': '120',
        }
      );
    } else {
      readAnswer(response, path);
    }
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  status = 429;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeClient(rateLimit = 100) {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    mspBaseUrl: `http://127.0.0.1:${api.port}`,
    apiTimeout: 5000,
    rateLimit,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

const registry = new ToolRegistry({ enableWriteTools: true });

async function callTool(
  name: string,
  args: Record<string, unknown>,
  client = makeClient()
) {
  const response = await registry.getHandler(name)!.execute(args, client);
  return JSON.parse(response.content[0].text);
}

describe('a 429 the client gave up on', () => {
  it.each([
    ['get_flow_data', {}],
    ['search_flows', { query: 'protocol:tcp' }],
    ['get_boxes', {}],
    ['get_active_alarms', {}],
    ['create_rule', { action: 'block', target_type: 'internet', gid: BOX }],
  ])('%s answers rate_limit_error', async (name, args) => {
    const body = await callTool(name, args);

    expect(body.message).toContain('Rate limit exceeded (HTTP 429)');
    expect(body.errorType).toBe('rate_limit_error');
  });
});

it("a request the client's own rate limiter refused answers rate_limit_error", async () => {
  status = 0;
  const client = makeClient(1);
  await callTool('get_boxes', {}, client);
  const body = await callTool('get_device_status', { box: BOX }, client);

  expect(body.message).toContain('Rate limit exceeded: the Firewalla API');
  expect(body.errorType).toBe('rate_limit_error');
});

it('another failure keeps its kind', async () => {
  status = 500;
  const body = await callTool('get_boxes', {});

  expect(body.message).toContain('500');
  expect(body.errorType).toBe('api_error');
});
