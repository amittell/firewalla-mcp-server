#!/usr/bin/env node

/**
 * @fileoverview Firewalla MCP Server - Main server implementation for Model Context Protocol
 *
 * This file implements the primary MCP server class that provides Claude with access to
 * Firewalla firewall data through standardized tools, resources, and prompts. The server
 * uses stdio transport for communication with Claude Code and supports advanced search
 * capabilities, security monitoring, and network analytics.
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { featureFlags } from './config/feature-flags.js';
import { metrics } from './monitoring/metrics.js';
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config/config.js';
import { FirewallaClient } from './firewalla/client.js';
import { setupTools } from './tools/index.js';
import { setupResources } from './resources/index.js';
import { setupPrompts } from './prompts/index.js';

/**
 * Main MCP Server class for Firewalla integration
 *
 * Provides Claude with comprehensive access to Firewalla firewall data through:
 * - **Tools**: Interactive functions for querying data, managing rules, and device operations
 * - **Resources**: Read-only data sources for firewall status, metrics, and topology
 * - **Prompts**: Intelligent analysis prompts for security reports and threat investigation
 *
 * The server communicates with Claude using the Model Context Protocol over stdio transport,
 * making it compatible with Claude Code and other MCP-enabled applications.
 *
 * @example
 * ```typescript
 * // Create and start the MCP server
 * const server = new FirewallaMCPServer();
 * await server.start();
 * ```
 *
 * @example
 * ```typescript
 * // Access through Claude Code
 * // "What security alerts do I have?"
 * // "Show me top bandwidth users"
 * // "Generate a security report for the last 24 hours"
 * ```
 *
 * @class
 * @public
 */
export class FirewallaMCPServer {
  /** @private The MCP server instance handling protocol communication */
  private server: Server;

  /** @private The Firewalla API client for accessing firewall data */
  private firewalla: FirewallaClient;

  /**
   * Creates a new Firewalla MCP Server instance
   *
   * Initializes the MCP server with Firewalla integration capabilities including:
   * - Tool handlers for interactive queries and operations
   * - Resource endpoints for structured data access
   * - Prompt templates for intelligent analysis
   *
   * The server uses stdio transport for local Claude Code communication and
   * automatically configures authentication using environment variables.
   *
   * @throws {Error} If required environment variables are missing
   * @throws {Error} If Firewalla client initialization fails
   */
  constructor() {
    this.server = new Server(
      {
        name: 'firewalla-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.firewalla = new FirewallaClient(config);
    this.setupHandlers();
  }

  /**
   * Sets up MCP protocol request handlers for tools, resources, and prompts
   *
   * Configures the server to respond to MCP protocol requests by registering handlers for:
   * - **ListToolsRequest**: Returns available interactive tools with input schemas
   * - **ListResourcesRequest**: Returns available data resources with URIs
   * - **ListPromptsRequest**: Returns intelligent analysis prompt templates
   *
   * Each handler provides complete metadata including input validation schemas,
   * descriptions, and parameter requirements for proper MCP client integration.
   *
   * @private
   * @returns {void}
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_active_alarms',
            description:
              'Retrieve current security alerts and alarms from Firewalla firewall',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for filtering alarms',
                },
                groupBy: {
                  type: 'string',
                  description: 'Group alarms by field (e.g., type, box)',
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort alarms (default: ts:desc)',
                },
                severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Filter by severity level',
                },
                limit: {
                  type: 'number',
                  description: 'Results per page (use cursor for more)',
                  minimum: 1,
                  maximum: 1000,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
                include_total_count: {
                  type: 'boolean',
                  description:
                    'Calculate true total count by traversing all pages (slower)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_flow_data',
            description:
              'Query network traffic flows from Firewalla firewall with pagination',
            inputSchema: {
              type: 'object',
              properties: {
                start_time: {
                  type: 'string',
                  description: 'Start time for query (ISO 8601 format)',
                },
                end_time: {
                  type: 'string',
                  description: 'End time for query (ISO 8601 format)',
                },
                limit: {
                  type: 'number',
                  description: 'Results per page (use cursor for more)',
                  minimum: 1,
                  maximum: 10000,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_device_status',
            description:
              'Check online/offline status of devices on Firewalla network',
            inputSchema: {
              type: 'object',
              properties: {
                box_id: {
                  type: 'string',
                  description: 'Filter devices under a specific Firewalla box',
                },
                group_id: {
                  type: 'string',
                  description: 'Filter devices under a specific device group',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of devices to return',
                  minimum: 1,
                  maximum: 10000,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_offline_devices',
            description:
              'Get all offline devices on Firewalla network with last seen timestamps',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of offline devices to return',
                  minimum: 1,
                  maximum: 1000,
                },
                sort_by_last_seen: {
                  type: 'boolean',
                  description: 'Sort devices by last seen time (default: true)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_bandwidth_usage',
            description:
              'Get top bandwidth consuming devices on Firewalla network',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for analysis',
                },
                limit: {
                  type: 'number',
                  description: 'Number of top devices to return',
                  minimum: 1,
                  maximum: 500,
                },
              },
              required: ['period', 'limit'],
            },
          },
          {
            name: 'get_network_rules',
            description: 'Retrieve firewall rules and conditions',
            inputSchema: {
              type: 'object',
              properties: {
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
                active_only: {
                  type: 'boolean',
                  description: 'Only return active rules (default: true)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rules to return',
                  minimum: 1,
                  maximum: 10000,
                },
                summary_only: {
                  type: 'boolean',
                  description:
                    'Return minimal rule information to reduce token usage (default: false)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'pause_rule',
            description: 'Temporarily disable a specific firewall rule',
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule identifier to pause',
                },
                duration: {
                  type: 'number',
                  description: 'Pause duration in minutes (default: 60)',
                  minimum: 1,
                  maximum: 1440,
                },
              },
              required: ['rule_id'],
            },
          },
          {
            name: 'get_target_lists',
            description:
              'Access Firewalla security target lists (CloudFlare, CrowdSec)',
            inputSchema: {
              type: 'object',
              properties: {
                list_type: {
                  type: 'string',
                  enum: ['cloudflare', 'crowdsec', 'all'],
                  description: 'Type of target list to retrieve',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of target lists to return',
                  minimum: 1,
                  maximum: 10000,
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'resume_rule',
            description: 'Resume a previously paused firewall rule',
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule identifier to resume',
                },
              },
              required: ['rule_id'],
            },
          },
          {
            name: 'get_specific_alarm',
            description:
              'Get detailed information for a specific Firewalla alarm',
            inputSchema: {
              type: 'object',
              properties: {
                alarm_id: {
                  type: 'string',
                  description: 'Alarm identifier to retrieve',
                },
              },
              required: ['alarm_id'],
            },
          },
          {
            name: 'delete_alarm',
            description: 'Delete/dismiss a specific Firewalla alarm',
            inputSchema: {
              type: 'object',
              properties: {
                alarm_id: {
                  type: 'string',
                  description: 'Alarm identifier to delete',
                },
              },
              required: ['alarm_id'],
            },
          },
          {
            name: 'get_boxes',
            description: 'List all managed Firewalla boxes',
            inputSchema: {
              type: 'object',
              properties: {
                group_id: {
                  type: 'string',
                  description: 'Filter boxes by group ID (optional)',
                },
              },
            },
          },
          {
            name: 'get_simple_statistics',
            description:
              'Get basic Firewalla statistics about boxes, alarms, and rules',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_statistics_by_region',
            description:
              'Get Firewalla flow statistics grouped by country/region',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_statistics_by_box',
            description:
              'Get statistics for each Firewalla box with activity scores',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_flow_trends',
            description: 'Get historical Firewalla flow data trends over time',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for trend analysis (default: 24h)',
                },
                interval: {
                  type: 'number',
                  description:
                    'Interval between data points in seconds (default: 3600)',
                  minimum: 60,
                  maximum: 86400,
                },
              },
            },
          },
          {
            name: 'get_alarm_trends',
            description: 'Get historical Firewalla alarm data trends over time',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for trend analysis (default: 24h)',
                },
              },
            },
          },
          {
            name: 'get_rule_trends',
            description:
              'Get historical Firewalla rule activity trends over time',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for trend analysis (default: 24h)',
                },
              },
            },
          },
          {
            name: 'search_flows',
            description:
              'Advanced Firewalla flow searching with complex query syntax',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using advanced syntax (e.g., "protocol:tcp AND device_ip:192.168.*", "blocked:true AND bytes:>1000000")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  minimum: 1,
                  maximum: 10000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                time_range: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'string',
                      description: 'Start time (ISO 8601)',
                    },
                    end: { type: 'string', description: 'End time (ISO 8601)' },
                  },
                  description: 'Optional time range filter',
                },
                include_blocked: {
                  type: 'boolean',
                  description: 'Include blocked flows (default: true)',
                },
                min_bytes: {
                  type: 'number',
                  description: 'Minimum flow size in bytes',
                },
                group_by: {
                  type: 'string',
                  enum: ['source', 'destination', 'protocol', 'device'],
                  description: 'Group results by field',
                },
                aggregate: {
                  type: 'boolean',
                  description:
                    'Include aggregation statistics (default: false)',
                },
                geographic_filters: {
                  type: 'object',
                  properties: {
                    countries: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Filter by specific countries (ISO 3166-1 alpha-2)',
                    },
                    continents: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by continents',
                    },
                    regions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by geographic regions',
                    },
                    cities: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by specific cities',
                    },
                    asns: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by ASN numbers',
                    },
                    hosting_providers: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by hosting providers',
                    },
                    exclude_cloud: {
                      type: 'boolean',
                      description: 'Exclude cloud provider traffic',
                    },
                    exclude_vpn: {
                      type: 'boolean',
                      description: 'Exclude VPN/proxy traffic',
                    },
                    min_risk_score: {
                      type: 'number',
                      minimum: 0,
                      maximum: 1,
                      description: 'Minimum geographic risk score',
                    },
                  },
                  description: 'Optional geographic filtering options',
                },
                include_analytics: {
                  type: 'boolean',
                  description:
                    'Include geographic analysis summary (default: false)',
                },
              },
              required: ['query', 'limit'],
            },
          },
          {
            name: 'search_alarms',
            description:
              'Advanced Firewalla alarm searching with severity, time, and IP filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query (e.g., "severity:high AND status:1", "type:1 AND device_ip:192.168.*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  minimum: 1,
                  maximum: 10000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                include_resolved: {
                  type: 'boolean',
                  description: 'Include resolved alarms (default: false)',
                },
                min_severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Minimum severity level',
                },
                time_window: {
                  type: 'string',
                  description: 'Time window for search (e.g., "24h", "7d")',
                },
                aggregate: {
                  type: 'boolean',
                  description:
                    'Include aggregation statistics (default: false)',
                },
              },
              required: ['query', 'limit'],
            },
          },
          {
            name: 'search_rules',
            description:
              'Advanced Firewalla rule searching with target, action, and status filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query (e.g., "action:block AND target_value:*.facebook.com")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  minimum: 1,
                  maximum: 10000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                include_paused: {
                  type: 'boolean',
                  description: 'Include paused rules (default: true)',
                },
                actions: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['allow', 'block', 'timelimit'],
                  },
                  description: 'Filter by rule actions',
                },
                directions: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['bidirection', 'inbound', 'outbound'],
                  },
                  description: 'Filter by traffic directions',
                },
                aggregate: {
                  type: 'boolean',
                  description:
                    'Include aggregation statistics (default: false)',
                },
              },
              required: ['query', 'limit'],
            },
          },
          {
            name: 'search_devices',
            description:
              'Advanced Firewalla device searching with network, status, and usage filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query (e.g., "online:true AND mac_vendor:Apple")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  minimum: 1,
                  maximum: 10000,
                },
                offset: {
                  type: 'number',
                  description:
                    'Results offset for pagination (default: 0) - DEPRECATED: use cursor',
                  minimum: 0,
                },
                cursor: {
                  type: 'string',
                  description:
                    'Pagination cursor from previous response (preferred over offset)',
                },
                include_offline: {
                  type: 'boolean',
                  description: 'Include offline devices (default: true)',
                },
                network_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by network IDs',
                },
                last_seen_threshold: {
                  type: 'number',
                  description: 'Minimum last seen threshold (seconds ago)',
                },
                aggregate: {
                  type: 'boolean',
                  description:
                    'Include aggregation statistics (default: false)',
                },
              },
              required: ['query', 'limit'],
            },
          },
          {
            name: 'search_target_lists',
            description:
              'Advanced Firewalla target list searching with category and ownership filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query (e.g., "category:ad AND owner:global")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  minimum: 1,
                  maximum: 10000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                owners: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by list owners',
                },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by categories',
                },
                min_targets: {
                  type: 'number',
                  description: 'Minimum number of targets in list',
                },
                aggregate: {
                  type: 'boolean',
                  description:
                    'Include aggregation statistics (default: false)',
                },
              },
              required: ['query', 'limit'],
            },
          },
          {
            name: 'search_cross_reference',
            description:
              'Multi-entity Firewalla searches with correlation across different data types',
            inputSchema: {
              type: 'object',
              properties: {
                primary_query: {
                  type: 'string',
                  description: 'Primary search query (typically for flows)',
                },
                secondary_queries: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Secondary queries to correlate with primary results',
                },
                correlation_field: {
                  type: 'string',
                  description:
                    'Field to use for correlation (e.g., "source_ip", "destination_ip", "device_ip", "protocol")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results per query',
                  minimum: 1,
                  maximum: 10000,
                },
              },
              required: [
                'primary_query',
                'secondary_queries',
                'correlation_field',
                'limit',
              ],
            },
          },
          {
            name: 'get_network_rules_summary',
            description:
              'Get overview statistics and counts of Firewalla network rules by category',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description:
                    'Maximum number of rules to analyze for summary statistics',
                  minimum: 1,
                  maximum: 2000,
                },
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
                active_only: {
                  type: 'boolean',
                  description:
                    'Only include active rules in summary (default: true)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_most_active_rules',
            description:
              'Get Firewalla rules with highest hit counts for traffic analysis',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Number of top rules to return',
                  minimum: 1,
                  maximum: 1000,
                },
                min_hits: {
                  type: 'number',
                  description: 'Minimum hit count threshold (default: 1)',
                  minimum: 0,
                },
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_recent_rules',
            description:
              'Get recently created or modified Firewalla firewall rules',
            inputSchema: {
              type: 'object',
              properties: {
                hours: {
                  type: 'number',
                  description:
                    'Look back period in hours (default: 24, max: 168)',
                  minimum: 1,
                  maximum: 168,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rules to return',
                  minimum: 1,
                  maximum: 1000,
                },
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
                include_modified: {
                  type: 'boolean',
                  description:
                    'Include recently modified rules, not just created (default: true)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'search_enhanced_cross_reference',
            description:
              'Advanced Firewalla multi-field correlation with temporal windows and network scoping',
            inputSchema: {
              type: 'object',
              properties: {
                primary_query: {
                  type: 'string',
                  description: 'Primary search query for correlation analysis',
                },
                secondary_queries: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Secondary queries to correlate with primary results',
                },
                correlation_params: {
                  type: 'object',
                  properties: {
                    correlationFields: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Fields to use for correlation (max 5 for performance)',
                      maxItems: 5,
                    },
                    correlationType: {
                      type: 'string',
                      enum: ['AND', 'OR'],
                      description: 'Correlation logic type',
                    },
                    temporalWindow: {
                      type: 'object',
                      properties: {
                        windowSize: {
                          type: 'number',
                          minimum: 1,
                          description: 'Temporal window size',
                        },
                        windowUnit: {
                          type: 'string',
                          enum: ['seconds', 'minutes', 'hours', 'days'],
                          description: 'Temporal window unit',
                        },
                      },
                      description: 'Optional temporal window filtering',
                    },
                    networkScope: {
                      type: 'object',
                      properties: {
                        includeSubnets: {
                          type: 'boolean',
                          description: 'Include subnet matching',
                        },
                        includePorts: {
                          type: 'boolean',
                          description: 'Include port matching',
                        },
                      },
                      description: 'Network scope options',
                    },
                    deviceScope: {
                      type: 'object',
                      properties: {
                        includeVendor: {
                          type: 'boolean',
                          description: 'Include vendor matching',
                        },
                        includeGroup: {
                          type: 'boolean',
                          description: 'Include group matching',
                        },
                      },
                      description: 'Device scope options',
                    },
                  },
                  required: ['correlationFields', 'correlationType'],
                  description: 'Enhanced correlation parameters',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 10000,
                  description: 'Maximum results per query',
                },
              },
              required: [
                'primary_query',
                'secondary_queries',
                'correlation_params',
                'limit',
              ],
            },
          },
          {
            name: 'get_correlation_suggestions',
            description:
              'Get intelligent field combination recommendations for Firewalla cross-reference searches',
            inputSchema: {
              type: 'object',
              properties: {
                primary_query: {
                  type: 'string',
                  description:
                    'Primary search query to analyze for correlation suggestions',
                },
                secondary_queries: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Secondary queries to analyze for correlation patterns',
                },
              },
              required: ['primary_query', 'secondary_queries'],
            },
          },
          {
            name: 'search_alarms_by_geography',
            description:
              'Firewalla geographic alarm search with location-based threat analysis',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Optional alarm search query using advanced syntax',
                },
                geographic_filters: {
                  type: 'object',
                  properties: {
                    countries: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by specific countries',
                    },
                    continents: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by continents',
                    },
                    regions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by geographic regions',
                    },
                    high_risk_countries: {
                      type: 'boolean',
                      description: 'Include only high-risk countries',
                    },
                    exclude_known_providers: {
                      type: 'boolean',
                      description: 'Exclude known cloud/hosting providers',
                    },
                    threat_analysis: {
                      type: 'boolean',
                      description:
                        'Enable detailed threat intelligence analysis',
                    },
                  },
                  description:
                    'Geographic filtering options for threat analysis',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 10000,
                  description: 'Maximum number of alarms to return',
                },
                sort_by: {
                  type: 'string',
                  description: 'Sort alarms by field',
                },
                group_by: {
                  type: 'string',
                  description: 'Group results by field',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_geographic_statistics',
            description:
              'Comprehensive Firewalla geographic statistics and analytics for flows and alarms',
            inputSchema: {
              type: 'object',
              properties: {
                entity_type: {
                  type: 'string',
                  enum: ['flows', 'alarms'],
                  description: 'Type of entity to analyze',
                },
                time_range: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'string',
                      description: 'Start time (ISO 8601 format)',
                    },
                    end: {
                      type: 'string',
                      description: 'End time (ISO 8601 format)',
                    },
                  },
                  description: 'Optional time range for analysis',
                },
                analysis_type: {
                  type: 'string',
                  enum: ['summary', 'detailed', 'threat_intelligence'],
                  description: 'Type of geographic analysis to perform',
                },
                group_by: {
                  type: 'string',
                  enum: ['country', 'continent', 'region', 'asn', 'provider'],
                  description: 'How to group the geographic statistics',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 1000,
                  description: 'Maximum number of statistics entries to return',
                },
              },
              required: ['entity_type'],
            },
          },
        ],
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'firewalla://summary',
            mimeType: 'application/json',
            name: 'Firewall Summary',
            description: 'Real-time firewall health and status overview',
          },
          {
            uri: 'firewalla://devices',
            mimeType: 'application/json',
            name: 'Device Inventory',
            description: 'Complete list of managed devices with metadata',
          },
          {
            uri: 'firewalla://metrics/security',
            mimeType: 'application/json',
            name: 'Security Metrics',
            description: 'Aggregated security statistics and trends',
          },
          {
            uri: 'firewalla://topology',
            mimeType: 'application/json',
            name: 'Network Topology',
            description: 'Network structure and device relationships',
          },
          {
            uri: 'firewalla://threats/recent',
            mimeType: 'application/json',
            name: 'Recent Threats',
            description: 'Latest security events and blocked attempts',
          },
        ],
      };
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'security_report',
            description: 'Generate comprehensive security status report',
            arguments: [
              {
                name: 'period',
                description: 'Time period for report',
                required: false,
              },
              {
                name: 'include_resolved',
                description: 'Include resolved issues',
                required: false,
              },
            ],
          },
          {
            name: 'threat_analysis',
            description: 'Deep dive into recent security threats and patterns',
            arguments: [
              {
                name: 'severity_threshold',
                description: 'Minimum severity level',
                required: false,
              },
            ],
          },
          {
            name: 'bandwidth_analysis',
            description: 'Investigate high bandwidth usage patterns',
            arguments: [
              {
                name: 'period',
                description: 'Analysis period',
                required: true,
              },
              {
                name: 'threshold_mb',
                description: 'Minimum bandwidth threshold in MB',
                required: false,
              },
            ],
          },
          {
            name: 'device_investigation',
            description: 'Detailed analysis of specific device activity',
            arguments: [
              {
                name: 'device_id',
                description: 'Target device identifier',
                required: true,
              },
              {
                name: 'lookback_hours',
                description: 'Hours to look back',
                required: false,
              },
            ],
          },
          {
            name: 'network_health_check',
            description: 'Overall network status and performance assessment',
            arguments: [],
          },
        ],
      };
    });

    // Set up tool, resource, and prompt handlers
    setupTools(this.server, this.firewalla);
    setupResources(this.server, this.firewalla);
    setupPrompts(this.server, this.firewalla);
  }

  /**
   * Starts the MCP server and begins listening for requests
   * Uses stdio transport for communication with Claude Code
   *
   * @returns Promise that resolves when the server is running
   * @throws Will throw an error if server startup fails
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write('Firewalla MCP Server running on stdio\n');
  }
}

// Start server if run directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FirewallaMCPServer();
  server
    .start()
    .then(() => {
      const healthPortEnv = process.env.MCP_HEALTH_PORT;
      if (healthPortEnv) {
        const port = Number(healthPortEnv);
        import('node:http')
          .then(({ createServer }) => {
            createServer((_req, res) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  wave0: featureFlags,
                  metrics: metrics.snapshot(),
                  uptime: process.uptime(),
                })
              );
            }).listen(port, () => {
              process.stderr.write(
                `Health endpoint listening on http://localhost:${port}\n`
              );
            });
          })
          .catch((error: Error) => {
            process.stderr.write(
              `Failed to start health endpoint: ${error.message}\n`
            );
          });
      }
    })
    .catch((error: Error) => {
      process.stderr.write(`Fatal error: ${error.message}\n`);
      process.exit(1);
    });
}
