#!/usr/bin/env node

/**
 * @fileoverview Firewalla MCP Server
 *
 * This file implements the primary MCP server class that provides Claude with access to
 * Firewalla firewall data through 29 tools that map to Firewalla API endpoints.
 * Tools include parameter validation and error handling.
 *
 * Architecture:
 * - 24 Direct API Endpoints
 * - 5 Convenience Wrappers
 * - Limits set to API maximum (500)
 * - Required parameters for proper API calls
 * - CRUD operations for all resources
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config/config.js';
import { FirewallaClient } from './firewalla/client.js';
import { setupTools } from './tools/index.js';
import { setupResources } from './resources/index.js';
import { setupPrompts } from './prompts/index.js';
import { logger } from './monitoring/logger.js';

/**
 * Main MCP Server class for Firewalla integration with 29-tool architecture
 */
export class FirewallaMCPServer {
  private server: Server;
  private firewalla: FirewallaClient;

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
   * Sets up MCP protocol request handlers for 29-tool architecture
   */
  private setupHandlers(): void {
    // List available tools - 29-Tool Complete API Coverage
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Direct API Endpoints (24 tools)
          {
            name: 'get_active_alarms',
            description:
              'Retrieve current security alerts and alarms from Firewalla firewall',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for filtering alarms (default: status:1 for active). Supports region:US for geographic filtering, severity:high, type:1-16, source_ip:*, etc.',
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
                  description:
                    'Results per page (optional, default: 200, API maximum: 500)',
                  minimum: 1,
                  maximum: 500,
                  default: 200,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: [],
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
                  description: 'Alarm ID (required for API call)',
                },
              },
              required: ['alarm_id'],
            },
          },
          // Disabled: delete_alarm tool commented out because the Firewalla MSP API
          // returns false success responses but doesn't actually delete alarms
          // {
          //   name: 'delete_alarm',
          //   description: 'Delete/dismiss a specific Firewalla alarm',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {
          //       alarm_id: {
          //         type: 'string',
          //         description: 'Alarm ID (required for API call)',
          //       },
          //     },
          //     required: ['alarm_id'],
          //   },
          // },
          {
            name: 'get_flow_data',
            description: 'Query network traffic flows from Firewalla firewall',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for flows. Supports region:US for geographic filtering, protocol:tcp, blocked:true, domain:*, category:social, etc.',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Group flows by specified values (e.g., "domain,box")',
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort flows (default: "ts:desc")',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum results (optional, default: 200, API maximum: 500)',
                  minimum: 1,
                  maximum: 500,
                  default: 200,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_device_status',
            description:
              'Check online/offline status of devices on Firewalla network',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of devices to return (required)',
                  minimum: 1,
                  maximum: 1000,
                },
                box: {
                  type: 'string',
                  description:
                    'Get devices under a specific Firewalla box (requires box ID)',
                },
                group: {
                  type: 'string',
                  description:
                    'Get devices under a specific box group (requires group ID)',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_network_rules',
            description: 'Retrieve firewall rules and conditions',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of rules to return (required)',
                  minimum: 1,
                  maximum: 1000,
                },
                query: {
                  type: 'string',
                  description: 'Search conditions for filtering rules',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'pause_rule',
            description:
              'Temporarily disable an active firewall rule for a specified duration',
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule ID to pause',
                },
                duration: {
                  type: 'number',
                  description:
                    'Duration in minutes to pause the rule (optional, default: 60, range: 1-1440)',
                  minimum: 1,
                  maximum: 1440,
                  default: 60,
                },
                box: {
                  type: 'string',
                  description: 'Box GID for context (required by API)',
                },
              },
              required: ['rule_id', 'box'],
            },
          },
          {
            name: 'resume_rule',
            description:
              'Resume a previously paused firewall rule, restoring it to active state',
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule ID to resume',
                },
                box: {
                  type: 'string',
                  description: 'Box GID for context (required by API)',
                },
              },
              required: ['rule_id', 'box'],
            },
          },
          {
            name: 'get_target_lists',
            description: 'Retrieve all target lists from Firewalla',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description:
                    'Maximum number of target lists to return (required)',
                  minimum: 1,
                  maximum: 1000,
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_specific_target_list',
            description: 'Retrieve a specific target list by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Target list ID (required)',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'create_target_list',
            description: 'Create a new target list',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Target list name (required, max 24 chars)',
                  maxLength: 24,
                },
                owner: {
                  type: 'string',
                  description: 'Owner: "global" or box GID (required)',
                },
                targets: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description:
                    'Array of domains, IPs, or CIDR ranges (required)',
                },
                category: {
                  type: 'string',
                  enum: [
                    'ad',
                    'edu',
                    'games',
                    'gamble',
                    'intel',
                    'p2p',
                    'porn',
                    'private',
                    'social',
                    'shopping',
                    'video',
                    'vpn',
                  ],
                  description: 'Content category (optional)',
                },
                notes: {
                  type: 'string',
                  description: 'Additional description (optional)',
                },
              },
              required: ['name', 'owner', 'targets'],
            },
          },
          {
            name: 'update_target_list',
            description: 'Update an existing target list',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Target list ID (required)',
                },
                name: {
                  type: 'string',
                  description: 'Updated target list name (max 24 chars)',
                  maxLength: 24,
                },
                targets: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Updated array of domains, IPs, or CIDR ranges',
                },
                category: {
                  type: 'string',
                  enum: [
                    'ad',
                    'edu',
                    'games',
                    'gamble',
                    'intel',
                    'p2p',
                    'porn',
                    'private',
                    'social',
                    'shopping',
                    'video',
                    'vpn',
                  ],
                  description: 'Updated content category',
                },
                notes: {
                  type: 'string',
                  description: 'Updated description',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_target_list',
            description: 'Delete a target list',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Target list ID to delete (required)',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'search_flows',
            description:
              'Search network flows with advanced query filters. Use this for: historical analysis, specific time ranges, complex filtering, or when you need more than 50 flows. Supports pagination, time-based queries (e.g., "ts:>1h" for last hour), and all flow fields including geographic filtering. For quick "what\'s happening now" snapshots, use get_recent_flow_activity instead.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: protocol:tcp/udp, direction:inbound/outbound/local, blocked:true/false, bytes:>1MB, domain:*.example.com, region:US (country code), category:social/games/porn/etc, gid:box_id, device.ip:192.168.*, source_ip:*, destination_ip:*. Examples: "region:US AND protocol:tcp", "blocked:true AND bytes:>1MB", "category:social OR category:games"',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Group flows by specified values (e.g., "domain,box")',
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort flows (default: "ts:desc")',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum results (optional, default: 200, API maximum: 500)',
                  minimum: 1,
                  maximum: 500,
                  default: 200,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: [],
            },
          },
          {
            name: 'search_alarms',
            description:
              'Search alarms using full-text or field filters. Supports all alarm fields including geographic filtering.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: type:1-16 (alarm type), severity:low/medium/high/critical, resolved:true/false, status:1/2 (active/archived), source_ip:192.168.*, region:US (country code), gid:box_id, device.name:*, message:"text search". Examples: "severity:high AND region:CN", "type:1 AND status:1", "source_ip:192.168.* AND NOT resolved:true"',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Group alarms by specified fields (comma-separated)',
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort alarms (default: ts:desc)',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum results (optional, default: 200, API maximum: 500)',
                  minimum: 1,
                  maximum: 500,
                  default: 200,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
              required: [],
            },
          },
          {
            name: 'search_rules',
            description:
              'Search firewall rules by target, action or status. Supports all rule fields.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: action:allow/block/timelimit, target.type:domain/ip/device, target.value:*.facebook.com, status:active/paused, direction:bidirection/inbound/outbound, protocol:tcp/udp, gid:box_id, scope.type:device/network, notes:"description text". Examples: "action:block AND target.value:*.social.com", "status:paused", "target.type:domain AND action:block"',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_boxes',
            description: 'Retrieve list of Firewalla boxes',
            inputSchema: {
              type: 'object',
              properties: {
                group: {
                  type: 'string',
                  description:
                    'Get boxes within a specific group (requires group ID)',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_simple_statistics',
            description: 'Retrieve basic statistics overview',
            inputSchema: {
              type: 'object',
              properties: {
                group: {
                  type: 'string',
                  description: 'Get statistics for specific box group',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_statistics_by_region',
            description:
              'Retrieve statistics by region (top regions by blocked flows)',
            inputSchema: {
              type: 'object',
              properties: {
                group: {
                  type: 'string',
                  description: 'Get statistics for specific box group',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum number of results (optional, default: 5)',
                  minimum: 1,
                  default: 5,
                },
              },
              required: [],
            },
          },
          {
            name: 'get_statistics_by_box',
            description:
              'Get statistics for each Firewalla box (top boxes by blocked flows or security alarms)',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['topBoxesByBlockedFlows', 'topBoxesBySecurityAlarms'],
                  description: 'Statistics type to retrieve',
                  default: 'topBoxesByBlockedFlows',
                },
                group: {
                  type: 'string',
                  description: 'Get statistics for specific box group',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum number of results (optional, default: 5)',
                  minimum: 1,
                  default: 5,
                },
              },
              required: [],
            },
          },
          {
            name: 'get_recent_flow_activity',
            description:
              'Get recent network flow activity snapshot (last 10-20 minutes). Returns up to 50 most recent flows for immediate analysis. CRITICAL: This is a quick snapshot tool only. Use this for: "what\'s happening right now?", current security threats, immediate network issues. DO NOT use for: historical analysis (use search_flows), getting more than 50 flows (use search_flows with limit), daily/weekly patterns (use search_flows with time queries like "ts:>24h"). For comprehensive analysis, always prefer search_flows.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_flow_insights',
            description:
              'Get category-based flow analysis including top content categories, bandwidth consumers, and blocked traffic. Ideal for answering questions like "what porn sites were accessed" or "what social media was used". Replaces time-based trends with actionable insights.',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for analysis (default: 24h)',
                  default: '24h',
                },
                categories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'ad',
                      'edu',
                      'games',
                      'gamble',
                      'intel',
                      'p2p',
                      'porn',
                      'private',
                      'social',
                      'shopping',
                      'video',
                      'vpn',
                    ],
                  },
                  description:
                    'Filter to specific content categories (optional)',
                },
                include_blocked: {
                  type: 'boolean',
                  description:
                    'Include blocked traffic analysis (default: false)',
                  default: false,
                },
              },
              required: [],
            },
          },
          {
            name: 'get_alarm_trends',
            description:
              'Get historical alarm trend data (alarms generated per day)',
            inputSchema: {
              type: 'object',
              properties: {
                group: {
                  type: 'string',
                  description: 'Get trends for a specific box group',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_rule_trends',
            description:
              'Get historical rule trend data (rules created per day)',
            inputSchema: {
              type: 'object',
              properties: {
                group: {
                  type: 'string',
                  description: 'Get trends for a specific box group',
                },
              },
              required: [],
            },
          },
          // Convenience Wrappers (5 tools)
          {
            name: 'get_bandwidth_usage',
            description:
              'Get top bandwidth consuming devices (convenience wrapper around get_device_status)',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  description: 'Time period for bandwidth calculation',
                  enum: ['1h', '24h', '7d', '30d'],
                },
                limit: {
                  type: 'number',
                  description: 'Number of top devices to return',
                  minimum: 1,
                  maximum: 500,
                  default: 10,
                },
                box: {
                  type: 'string',
                  description: 'Filter devices under a specific Firewalla box',
                },
              },
              required: ['period'],
            },
          },
          {
            name: 'get_offline_devices',
            description:
              'Get all offline devices (convenience wrapper around get_device_status)',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of offline devices to return',
                  minimum: 1,
                  maximum: 500,
                  default: 100,
                },
                sort_by_last_seen: {
                  type: 'boolean',
                  description: 'Sort devices by last seen time (default: true)',
                  default: true,
                },
                box: {
                  type: 'string',
                  description: 'Filter devices under a specific Firewalla box',
                },
              },
              required: [],
            },
          },
          {
            name: 'search_devices',
            description:
              'Search devices by name, IP, MAC or status (convenience wrapper with client-side filtering)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: mac:AA:BB:CC:DD:EE:FF, ip:192.168.1.*, name:*iPhone*, online:true/false, vendor:Apple, gid:box_id, network.name:*, group.name:*. Examples: "online:false AND vendor:Apple", "ip:192.168.1.* AND name:*laptop*", "mac:AA:* OR name:*phone*"',
                },
                status: {
                  type: 'string',
                  enum: ['online', 'offline', 'any'],
                  default: 'any',
                  description: 'Filter by online status',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 500,
                  default: 50,
                  description: 'Maximum number of devices to return',
                },
                box: {
                  type: 'string',
                  description: 'Filter devices under a specific Firewalla box',
                },
              },
              required: [],
            },
          },
          {
            name: 'search_target_lists',
            description:
              'Search target lists with client-side filtering (convenience wrapper around get_target_lists)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for target lists. Supported fields: name:*Social*, owner:global/box_gid, category:social/games/ad/porn/etc, targets:*.facebook.com, notes:"description text". Examples: "category:social", "owner:global AND name:*Block*", "targets:*.gaming.com"',
                },
                category: {
                  type: 'string',
                  description: 'Filter by category',
                },
                owner: {
                  type: 'string',
                  description: 'Filter by owner (global or box gid)',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 500,
                  default: 100,
                  description: 'Maximum number of target lists to return',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_network_rules_summary',
            description:
              'Get overview statistics and counts of network rules by category (convenience wrapper)',
            inputSchema: {
              type: 'object',
              properties: {
                active_only: {
                  type: 'boolean',
                  description:
                    'Only include active rules in summary (default: true)',
                  default: true,
                },
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    // Set up tool handlers using the registry
    setupTools(this.server, this.firewalla);

    // Set up resources
    setupResources(this.server, this.firewalla);

    // Set up prompts
    setupPrompts(this.server, this.firewalla);
  }

  /**
   * Starts the MCP server using stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Firewalla MCP Server running with 29 tools');
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FirewallaMCPServer();
  server.start().catch((error: unknown) => {
    logger.error(
      'Failed to start server:',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(1);
  });
}
