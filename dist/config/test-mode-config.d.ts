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
export declare function getTestConfig(): FirewallaConfig;
//# sourceMappingURL=test-mode-config.d.ts.map