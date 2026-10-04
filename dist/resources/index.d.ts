/**
 * @fileoverview MCP Resource handlers for Firewalla data access
 *
 * Implements URI-based resource endpoints that provide structured, read-only access
 * to Firewalla firewall data through the Model Context Protocol. Resources are
 * designed for dashboard views, status monitoring, and analytical data consumption.
 *
 * Available resource endpoints:
 * - **firewalla://summary**: Real-time firewall health and performance metrics
 * - **firewalla://devices**: Complete device inventory with status and metadata
 * - **firewalla://metrics/security**: Aggregated security statistics and trends
 * - **firewalla://topology**: Network structure and device relationships
 * - **firewalla://threats/recent**: Latest security events and blocked attempts
 *
 * Each resource returns compact JSON with contextual metadata, performance
 * indicators, and actionable insights for Claude's analysis and reporting.
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { FirewallaClient } from '../firewalla/client.js';
/**
 * Registers MCP resource handlers on the server to provide structured Firewalla firewall data via URI-based endpoints
 *
 * Sets up read-only resource endpoints that respond to MCP ReadResourceRequest messages.
 * Each URI maps to a specific Firewalla data source and returns compact JSON responses
 * with enriched metadata for analytical purposes.
 *
 * Resource responses include:
 * - Raw data from Firewalla APIs
 * - Calculated metrics and performance indicators
 * - Status summaries and health scores
 * - Formatted timestamps and human-readable values
 * - Error handling with detailed diagnostic information
 *
 * @param server - The MCP server instance to register handlers on
 * @param firewalla - The Firewalla client for API access
 * @returns {void}
 *
 * @example
 * ```typescript
 * const server = new Server({ name: 'firewalla' });
 * const client = new FirewallaClient(config);
 * setupResources(server, client);
 * ```
 */
export declare function setupResources(server: Server, firewalla: FirewallaClient): void;
//# sourceMappingURL=index.d.ts.map