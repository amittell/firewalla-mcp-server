/**
 * GET responses are cached (300 s by default). A write through the client
 * must not leave reads serving what the write just changed. The HTTP layer
 * is stubbed; nothing leaves the process.
 */

import axios from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: jest.fn(() => false),
  };
});

const BOX = '11111111-2222-3333-4444-555555555555';
const api = (axios.create as jest.Mock)() as Record<string, jest.Mock>;

function makeClient() {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId: BOX,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

/** /v2/rules answers with one rule whose status is whatever `status` holds */
let status = 'active';
function serveRules() {
  api.get.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: 1,
          results: [{ id: 'rule-0001', action: 'block', status }],
        },
      };
    }
    return { status: 200, data: [] };
  });
}

const ruleGets = () =>
  api.get.mock.calls.filter(([endpoint]) => endpoint === '/v2/rules').length;

beforeEach(() => {
  jest.clearAllMocks();
  status = 'active';
  serveRules();
});

describe('response cache', () => {
  it('serves a repeated read from the cache', async () => {
    const client = makeClient();
    await client.getNetworkRules();
    await client.getNetworkRules();
    expect(ruleGets()).toBe(1);
  });

  it('refetches after a write, so pause_rule is visible to the next read', async () => {
    const client = makeClient();
    const before = await client.getNetworkRules();
    expect(before.results[0].status).toBe('active');

    api.post.mockImplementation(async () => {
      status = 'paused';
      return { status: 200, data: { success: true } };
    });
    await client.pauseRule('rule-0001', 30);

    const after = await client.getNetworkRules();
    expect(ruleGets()).toBe(2);
    expect(after.results[0].status).toBe('paused');
  });

  it('refetches after a write that failed, since it may still have been applied', async () => {
    const client = makeClient();
    await client.getNetworkRules();

    api.delete.mockRejectedValue(new Error('timeout of 30000ms exceeded'));
    await expect(client.deleteRule('rule-0001')).rejects.toThrow('timeout');

    await client.getNetworkRules();
    expect(ruleGets()).toBe(2);
  });

  it('refetches after a write sent through makeApiCall', async () => {
    const client = makeClient();
    await client.getNetworkRules();

    api.patch.mockResolvedValue({
      status: 200,
      data: { id: 'AA:BB:CC:DD:EE:FF' },
    });
    await client.makeApiCall(
      'patch',
      `/v2/boxes/${BOX}/devices/AA:BB:CC:DD:EE:FF`,
      {
        name: 'renamed',
      }
    );

    await client.getNetworkRules();
    expect(ruleGets()).toBe(2);
  });
});
