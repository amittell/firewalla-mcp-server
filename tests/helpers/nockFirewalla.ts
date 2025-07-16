/**
 * Nock helper for HTTP-level Firewalla API mocking
 * Enables testing the real code path: handler → FirewallaClient → HTTP → response processing
 */

import nock from 'nock';

// Use environment variable or fallback for testing
const FIREWALLA_BASE_URL = process.env.FIREWALLA_MSP_ID ? 
  `https://${process.env.FIREWALLA_MSP_ID}` : 
  'https://test.firewalla.net';

/**
 * Sets up nock interceptor for a Firewalla API endpoint
 * @param endpoint - API endpoint path (e.g., '/v2/boxes/test-box/alarms')
 * @param response - Mock response object
 * @param status - HTTP status code (default: 200)
 * @returns nock interceptor for chaining
 */
/**
 * Sets up nock interceptor for a Firewalla GET request.
 * If queryParams is omitted, the interceptor will match any query string.
 */
export function setupNockFor(
  endpoint: string,
  response: object,
  status: number = 200,
  queryParams?: Record<string, any>
) {
  const scope = nock(FIREWALLA_BASE_URL).get(endpoint);

  // Match specific query parameters if provided, otherwise accept any.
  if (queryParams) {
    scope.query(queryParams);
  } else {
    scope.query(true);
  }

  return scope.reply(status, response);
}

/**
 * Sets up nock interceptor for POST requests
 */
export function setupNockPost(
  endpoint: string,
  response: object,
  status: number = 200,
  queryParams?: Record<string, any>
) {
  const scope = nock(FIREWALLA_BASE_URL).post(endpoint);
  if (queryParams) {
    scope.query(queryParams);
  } else {
    scope.query(true);
  }
  return scope.reply(status, response);
}

/**
 * Sets up nock interceptor for DELETE requests
 */
export function setupNockDelete(
  endpoint: string,
  response: object,
  status: number = 200,
  queryParams?: Record<string, any>
) {
  const scope = nock(FIREWALLA_BASE_URL).delete(endpoint);
  if (queryParams) {
    scope.query(queryParams);
  } else {
    scope.query(true);
  }
  return scope.reply(status, response);
}

/**
 * Sets up nock interceptor for PUT requests
 */
export function setupNockPut(
  endpoint: string,
  response: object,
  status: number = 200,
  queryParams?: Record<string, any>
) {
  const scope = nock(FIREWALLA_BASE_URL).put(endpoint);
  if (queryParams) {
    scope.query(queryParams);
  } else {
    scope.query(true);
  }
  return scope.reply(status, response);
}

/**
 * Clean up all nock interceptors
 */
export function cleanupNock() {
  nock.cleanAll();
}

/**
 * Verify all nock interceptors were used
 */
export function verifyNockComplete() {
  if (!nock.isDone()) {
    const pending = nock.pendingMocks();
    throw new Error(`Unused nock interceptors: ${pending.join(', ')}`);
  }
}

/**
 * Mock responses based on real Firewalla API schema
 */
export const mockResponses = {
  alarms: {
    items: [
      {
        aid: 'alarm-123',
        id: { aid: 'alarm-123' },
        type: 'blocked_site',
        severity: 'high',
        message: 'Blocked access to malicious site',
        timestamp: '2024-01-15T10:30:00Z',
        'p.device.name': 'Test Device',
        'p.device.ip': '192.168.1.100',
        sh: '192.168.1.100',
        dh: '185.199.108.153',
        resolved: false
      },
      {
        aid: 'alarm-124',
        id: { aid: 'alarm-124' },
        type: 'intrusion_detection',
        severity: 'critical',
        message: 'Potential intrusion detected',
        timestamp: '2024-01-15T11:00:00Z',
        'p.device.name': 'Server Device',
        'p.device.ip': '192.168.1.50',
        sh: '192.168.1.50',
        dh: '103.224.182.251',
        resolved: false
      }
    ],
    total: 2,
    next_cursor: null
  },

  flows: {
    items: [
      {
        fd: 'flow-456',
        sh: '192.168.1.100',
        dh: '8.8.8.8',
        protocol: 'tcp',
        sp: 54321,
        dp: 443,
        ob: 2048,
        rb: 8192,
        blocked: false,
        ts: Date.now(),
        'p.device.name': 'Test Device'
      }
    ],
    total: 1,
    next_cursor: null
  },

  devices: {
    items: [
      {
        id: 'device-789',
        name: 'Test Device',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
        online: true,
        lastSeen: Date.now(),
        vendor: 'Apple Inc.'
      }
    ],
    total: 1,
    next_cursor: null
  },

  rules: {
    items: [
      {
        rid: 'rule-101',
        id: { rid: 'rule-101' },
        type: 'block',
        target: 'domain',
        target_value: 'malicious-site.com',
        action: 'block',
        enabled: true,
        hit_count: 15,
        created_at: '2024-01-10T00:00:00Z'
      }
    ],
    total: 1,
    next_cursor: null
  },

  error404: {
    error: 'Not Found',
    message: 'The requested resource was not found',
    code: 404
  },

  error500: {
    error: 'Internal Server Error',
    message: 'An internal server error occurred',
    code: 500
  }
};

/**
 * Setup environment for integration tests
 */
export function setupIntegrationTest() {
  // Ensure we have test environment variables
  if (!process.env.FIREWALLA_MSP_TOKEN) {
    process.env.FIREWALLA_MSP_TOKEN = 'test-token';
  }
  if (!process.env.FIREWALLA_MSP_ID) {
    process.env.FIREWALLA_MSP_ID = 'test.firewalla.net';
  }
  if (!process.env.FIREWALLA_BOX_ID) {
    process.env.FIREWALLA_BOX_ID = 'test-box-id';
  }
}

/**
 * Get the box-specific endpoint path
 */
export function getBoxEndpoint(resource: string): string {
  const boxId = process.env.FIREWALLA_BOX_ID || 'test-box-id';
  return `/v2/boxes/${boxId}/${resource}`;
}