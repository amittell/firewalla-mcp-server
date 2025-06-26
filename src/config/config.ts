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
 * 
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import dotenv from 'dotenv';
import { FirewallaConfig } from '../types';

dotenv.config();

/**
 * Retrieves a required environment variable with validation
 * 
 * @param name - The environment variable name to retrieve
 * @returns The environment variable value
 * @throws {Error} If the environment variable is not set or empty
 */
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Retrieves an optional environment variable with a default fallback
 * 
 * @param name - The environment variable name to retrieve
 * @param defaultValue - The default value to use if the variable is not set
 * @returns The environment variable value or the default value
 */
function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

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
    apiTimeout: parseInt(getOptionalEnvVar('API_TIMEOUT', '30000'), 10),
    rateLimit: parseInt(getOptionalEnvVar('API_RATE_LIMIT', '100'), 10),
    cacheTtl: parseInt(getOptionalEnvVar('CACHE_TTL', '300'), 10),
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