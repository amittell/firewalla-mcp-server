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
import type { FirewallaConfig } from '../types';
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
export declare function getConfig(): FirewallaConfig;
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
export declare const config: FirewallaConfig;
//# sourceMappingURL=config.d.ts.map