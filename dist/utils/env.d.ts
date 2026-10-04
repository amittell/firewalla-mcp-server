/**
 * @fileoverview Environment variable utilities for configuration parsing
 *
 * Provides type-safe utilities for parsing and validating environment variables
 * with appropriate error handling and default values.
 */
/**
 * Gets a required environment variable or throws an error if not found
 *
 * @param name - The environment variable name
 * @returns The environment variable value
 * @throws {Error} If the environment variable is not set or empty
 */
export declare function getRequiredEnvVar(name: string): string;
/**
 * Gets an optional environment variable with a fallback default value
 *
 * @param name - The environment variable name
 * @param defaultValue - The default value to use if not set
 * @returns The environment variable value or default
 */
export declare function getOptionalEnvVar(name: string, defaultValue: string): string;
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
export declare function getOptionalEnvInt(name: string, defaultValue: number, min?: number, max?: number): number;
/**
 * Safely parses an environment variable to a boolean with validation
 *
 * @param name - The environment variable name to parse
 * @param defaultValue - The default value to use if parsing fails
 * @returns The parsed boolean value or default
 */
export declare function getOptionalEnvBoolean(name: string, defaultValue: boolean): boolean;
/**
 * Parses transport configuration from environment variables
 *
 * Extracts shared logic for parsing MCP_TRANSPORT, MCP_HTTP_PORT, and MCP_HTTP_PATH
 * to prevent duplication between config files.
 *
 * @returns Parsed transport configuration object
 * @throws {Error} If transport type is invalid
 */
export declare function parseTransportConfig(): {
    type: 'stdio' | 'http';
    port: number;
    path: string;
};
//# sourceMappingURL=env.d.ts.map