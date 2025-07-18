/**
 * @fileoverview Environment variable utilities for configuration parsing
 *
 * Provides type-safe utilities for parsing and validating environment variables
 * with appropriate error handling and default values.
 */

import { logger } from '../monitoring/logger.js';

/**
 * Gets a required environment variable or throws an error if not found
 *
 * @param name - The environment variable name
 * @returns The environment variable value
 * @throws {Error} If the environment variable is not set or empty
 */
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Gets an optional environment variable with a fallback default value
 *
 * @param name - The environment variable name
 * @param defaultValue - The default value to use if not set
 * @returns The environment variable value or default
 */
export function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Safely parses an environment variable to an integer with validation
 *
 * @param name - The environment variable name to parse
 * @param defaultValue - The default value to use if parsing fails
 * @param min - Optional minimum value for validation
 * @param max - Optional maximum value for validation
 * @returns The parsed integer value or the default value
 * @throws {Error} If the parsed value is outside the valid range
 */
export function getOptionalEnvInt(
  name: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const envValue = process.env[name];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }

  const parsed = parseInt(envValue, 10);
  if (!Number.isFinite(parsed)) {
    logger.warn(`Invalid numeric value for environment variable`, {
      environment_variable: name,
      invalid_value: envValue,
      default_value: defaultValue,
      action: 'using_default',
    });
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    throw new Error(
      `Environment variable ${name} must be at least ${min}, got: ${parsed}`
    );
  }

  if (max !== undefined && parsed > max) {
    throw new Error(
      `Environment variable ${name} must be at most ${max}, got: ${parsed}`
    );
  }

  return parsed;
}

/**
 * Safely parses an environment variable to a boolean with validation
 *
 * @param name - The environment variable name to parse
 * @param defaultValue - The default value to use if parsing fails
 * @returns The parsed boolean value or default
 */
export function getOptionalEnvBoolean(
  name: string,
  defaultValue: boolean
): boolean {
  const envValue = process.env[name];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }

  const normalized = envValue.toLowerCase().trim();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  logger.warn(`Invalid boolean value for environment variable`, {
    environment_variable: name,
    invalid_value: envValue,
    default_value: defaultValue,
    action: 'using_default',
  });
  return defaultValue;
}
