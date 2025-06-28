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
 * - FIREWALLA_BOX_ID: Firewalla box Global ID (GID)
 *
 * Optional environment variables:
 * - API_TIMEOUT: Request timeout in milliseconds (default: 30000)
 * - API_RATE_LIMIT: Requests per minute limit (default: 100)
 * - CACHE_TTL: Cache time-to-live in seconds (default: 300)
 * - DEFAULT_PAGE_SIZE: Default pagination page size (default: 100)
 * - MAX_PAGE_SIZE: Maximum allowed pagination page size (default: 10000)
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import dotenv from 'dotenv';
import type { FirewallaConfig } from '../types';
import { getRequiredEnvVar, getOptionalEnvInt } from '../utils/env.js';

dotenv.config();

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
  return {
    mspToken: getRequiredEnvVar('FIREWALLA_MSP_TOKEN'),
    mspId: getRequiredEnvVar('FIREWALLA_MSP_ID'),
    boxId: getRequiredEnvVar('FIREWALLA_BOX_ID'),
    apiTimeout: getOptionalEnvInt('API_TIMEOUT', 30000, 1000, 300000), // 1s to 5min
    rateLimit: getOptionalEnvInt('API_RATE_LIMIT', 100, 1, 1000), // 1 to 1000 requests per minute
    cacheTtl: getOptionalEnvInt('CACHE_TTL', 300, 0, 3600), // 0s to 1 hour
    defaultPageSize: getOptionalEnvInt('DEFAULT_PAGE_SIZE', 100, 1, 10000), // 1 to 10000 items per page
    maxPageSize: getOptionalEnvInt('MAX_PAGE_SIZE', 10000, 100, 100000), // 100 to 100000 items per page
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
