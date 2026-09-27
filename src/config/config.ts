/**
 * @fileoverview Configuration management for Firewalla MCP Server
 *
 * Provides centralized configuration loading from environment variables with validation
 * and type safety. Handles MSP API credentials, timeout settings, rate limiting, and
 * caching configuration for optimal Firewalla API integration.
 *
 * Required environment variables:
 * - FIREWALLA_MSP_TOKEN: MSP API access token
 * - FIREWALLA_MSP_ID: MSP domain (e.g., 'yourdomain.firewalla.net')
 *
 * Optional environment variables:
 * - FIREWALLA_BOX_ID: Box GID. Scopes queries to that box and is the default for
 *   single-box operations. Without it, queries cover every box on the account.
 * - FIREWALLA_DEFAULT_BOX_ID: Box GID used as the default for single-box operations
 *   only; queries still cover every box
 * - API_TIMEOUT: Request timeout in milliseconds (default: 30000)
 * - API_RATE_LIMIT: API requests the client starts in any 5 minutes (default: 100)
 * - CACHE_TTL: Cache time-to-live in seconds (default: 300)
 * - CACHE_MAX_ENTRIES: Most API responses kept cached (default: 1000)
 * - DEFAULT_PAGE_SIZE: Default pagination page size (default: 100)
 * - MAX_PAGE_SIZE: Maximum allowed pagination page size (default: 10000)
 * - MCP_TRANSPORT: Transport type (stdio or http, default: stdio)
 * - MCP_HTTP_PORT: HTTP server port (default: 3000)
 * - MCP_HTTP_PATH: HTTP server path (default: /mcp)
 * - MCP_TEST_MODE: 'true' starts with the dummy settings of test-mode-config.ts;
 *   refused, with exit code 1, when NODE_ENV is production
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import * as dotenv from 'dotenv';
import { writeSync } from 'node:fs';
import type { FirewallaConfig } from '../types';
import {
  getRequiredEnvVar,
  getOptionalEnvInt,
  parseTransportConfig,
} from '../utils/env.js';
import { getTestConfig } from './test-mode-config.js';
import { logger } from '../monitoring/logger.js';

dotenv.config();

/** What the server prints to stderr before it exits when test mode is refused */
const TEST_MODE_PRODUCTION_REFUSAL =
  'firewalla-mcp-server: refusing to start: MCP_TEST_MODE=true replaces the ' +
  'Firewalla credentials with dummy ones and is not allowed with ' +
  'NODE_ENV=production. Unset MCP_TEST_MODE to use FIREWALLA_MSP_TOKEN and ' +
  'FIREWALLA_MSP_ID, or set NODE_ENV to another value, such as development, ' +
  'to run in test mode.';

/**
 * Creates and validates the complete Firewalla configuration
 *
 * Loads all required and optional configuration values from environment variables,
 * validates their presence and format, and returns a typed configuration object
 * ready for use by the Firewalla client.
 *
 * @returns {FirewallaConfig} Complete validated configuration object
 * @throws {Error} If any required environment variables are missing
 * @throws {Error} If numeric environment variables cannot be parsed
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * console.log(`Using MSP: ${config.mspId}`);
 * console.log(`Box ID: ${config.boxId}`);
 * ```
 */
export function getConfig(): FirewallaConfig {
  // Check if running in test mode (for Docker health checks)
  const testMode =
    (process.env.MCP_TEST_MODE || 'false').toLowerCase() === 'true';

  if (testMode) {
    if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
      // One plain line on stderr, not through the logger, which prints
      // nothing when LOG_LEVEL is not one of its levels. writeSync because
      // process.exit does not wait for a pending write to process.stderr.
      writeSync(2, `${TEST_MODE_PRODUCTION_REFUSAL}\n`);
      process.exit(1);
    }
    // Through the logger, which writes to stderr: stdout carries the stdio
    // transport's JSON-RPC, and a line of text there breaks the client.
    logger.warn('Running in test mode - using dummy credentials');
    return getTestConfig();
  }

  const mspId = getRequiredEnvVar('FIREWALLA_MSP_ID');

  return {
    mspToken: getRequiredEnvVar('FIREWALLA_MSP_TOKEN'),
    mspId,
    mspBaseUrl: `https://${mspId}`,
    boxId: process.env.FIREWALLA_BOX_ID || undefined,
    defaultBoxId: process.env.FIREWALLA_DEFAULT_BOX_ID || undefined,
    apiTimeout: getOptionalEnvInt('API_TIMEOUT', 30000, 1000, 300000), // 1s to 5min
    rateLimit: getOptionalEnvInt('API_RATE_LIMIT', 100, 1, 1000), // 1 to 1000 requests per 5 minutes
    cacheTtl: getOptionalEnvInt('CACHE_TTL', 300, 0, 3600), // 0s to 1 hour
    // DEFAULT_CACHE_MAX_ENTRIES in src/firewalla/client.ts
    cacheMaxEntries: getOptionalEnvInt('CACHE_MAX_ENTRIES', 1000, 1, 100000),
    defaultPageSize: getOptionalEnvInt('DEFAULT_PAGE_SIZE', 100, 1, 10000), // 1 to 10000 items per page
    maxPageSize: getOptionalEnvInt('MAX_PAGE_SIZE', 10000, 100, 100000), // 100 to 100000 items per page
    transport: parseTransportConfig(),
  };
}

/**
 * Default configuration instance for the Firewalla MCP Server
 *
 * Pre-loaded configuration object that can be imported and used throughout
 * the application. This instance is created at module load time and includes
 * all validated environment variables.
 *
 * @constant {FirewallaConfig}
 * @example
 * ```typescript
 * import { config } from './config/config.js';
 * const client = new FirewallaClient(config);
 * ```
 */
export const config = getConfig();
