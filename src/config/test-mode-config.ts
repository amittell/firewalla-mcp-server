/**
 * @fileoverview Test mode configuration for Docker health checks
 *
 * Provides a configuration that allows the server to start without real credentials
 * for Docker container health checks and testing purposes.
 */

import type { FirewallaConfig } from '../types';

/**
 * Creates a test configuration when MCP_TEST_MODE is set
 * This allows the server to start for health checks without real credentials
 */
export function getTestConfig(): FirewallaConfig {
  return {
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    mspBaseUrl: 'https://test.firewalla.net',
    boxId: 'test-box-id',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
    transport: {
      type: 'stdio',
      port: 3000,
      path: '/mcp',
    },
  };
}
