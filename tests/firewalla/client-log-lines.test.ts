/**
 * The client logs each API request and response to stderr from axios
 * interceptors. Each must be its own line. The HTTP layer is stubbed.
 */

import axios from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
  };
});

describe('FirewallaClient request logging', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    jest.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      writes.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ends every request and response log line with a newline', async () => {
    const instance = (axios.create as jest.Mock)();
    instance.interceptors.request.use.mockClear();
    instance.interceptors.response.use.mockClear();

    new FirewallaClient({
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      apiTimeout: 30000,
      rateLimit: 100,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    } as any);

    const [onRequest, onRequestError] =
      instance.interceptors.request.use.mock.calls[0];
    const [onResponse, onResponseError] =
      instance.interceptors.response.use.mock.calls[0];

    onRequest({ method: 'get', url: '/v2/flows' });
    onResponse({ status: 200, config: { url: '/v2/flows' } });
    await expect(onRequestError(new Error('socket hang up'))).rejects.toThrow();
    await expect(
      onResponseError({ message: 'Server Error', response: { status: 500 } })
    ).rejects.toBeDefined();

    expect(writes).toEqual([
      'API Request: GET /v2/flows\n',
      'API Response: 200 /v2/flows\n',
      'API Request Error: socket hang up\n',
      'API Response Error: 500 Server Error\n',
    ]);
  });
});
