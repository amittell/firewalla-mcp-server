#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_active_alarms',
            description: 'Retrieve current security alerts and alarms',
            inputSchema: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Filter by severity level',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 20)',
                  minimum: 1,
                  maximum: 100,
                },
              },
            },
          },
          {
            name: 'get_flow_data',
            description: 'Query network traffic flows with pagination',
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
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 100,
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor from previous response',
                },
              },
            },
          },
          {
            name: 'get_device_status',
            description: 'Check online/offline status of devices',
            inputSchema: {
              type: 'object',
              properties: {
                device_id: {
                  type: 'string',
                  description: 'Specific device ID to query',
                },
                include_offline: {
                  type: 'boolean',
                  description: 'Include offline devices (default: true)',
                },
              },
            },
          },
          {
            name: 'get_offline_devices',
            description: 'Get all offline devices with last seen timestamps',
            inputSchema: {
              type: 'object',
              properties: {
                sort_by_last_seen: {
                  type: 'boolean',
                  description: 'Sort devices by last seen time (default: true)',
                },
              },
            },
          },
          {
            name: 'get_bandwidth_usage',
            description: 'Get top bandwidth consuming devices',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description: 'Time period for analysis',
                },
                top: {
                  type: 'number',
                  description: 'Number of top devices (default: 10)',
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: ['period'],
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
                  description: 'Maximum number of rules to return (default: 50, max: 200)',
                  minimum: 1,
                  maximum: 200,
                },
                summary_only: {
                  type: 'boolean',
                  description: 'Return minimal rule information to reduce token usage (default: false)',
                },
              },
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
            description: 'Access security target lists (CloudFlare, CrowdSec)',
            inputSchema: {
              type: 'object',
              properties: {
                list_type: {
                  type: 'string',
                  enum: ['cloudflare', 'crowdsec', 'all'],
                  description: 'Type of target list to retrieve',
                },
              },
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
            name: 'get_boxes',
            description: 'List all managed Firewalla boxes',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_specific_alarm',
            description: 'Get detailed information for a specific alarm',
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
            description: 'Delete/dismiss a specific alarm',
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
            name: 'get_simple_statistics',
            description: 'Get basic statistics about boxes, alarms, and rules',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_statistics_by_region',
            description: 'Get flow statistics grouped by country/region',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_statistics_by_box',
            description: 'Get statistics for each Firewalla box with activity scores',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_flow_trends',
            description: 'Get historical flow data trends over time',
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
                  description: 'Interval between data points in seconds (default: 3600)',
                  minimum: 60,
                  maximum: 86400,
                },
              },
            },
          },
          {
            name: 'get_alarm_trends',
            description: 'Get historical alarm data trends over time',
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
            description: 'Get historical rule activity trends over time',
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
            description: 'Advanced flow searching with complex query syntax',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query using advanced syntax (e.g., "severity:high AND source_ip:192.168.*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                time_range: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', description: 'Start time (ISO 8601)' },
                    end: { type: 'string', description: 'End time (ISO 8601)' }
                  },
                  description: 'Optional time range filter'
                },
                include_blocked: {
                  type: 'boolean',
                  description: 'Include blocked flows (default: true)'
                },
                min_bytes: {
                  type: 'number',
                  description: 'Minimum flow size in bytes'
                },
                group_by: {
                  type: 'string',
                  enum: ['source', 'destination', 'protocol', 'device'],
                  description: 'Group results by field'
                },
                aggregate: {
                  type: 'boolean',
                  description: 'Include aggregation statistics (default: false)'
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'search_alarms',
            description: 'Advanced alarm searching with severity, time, and IP filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (e.g., "severity:>=high AND source_ip:192.168.*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                include_resolved: {
                  type: 'boolean',
                  description: 'Include resolved alarms (default: false)'
                },
                min_severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Minimum severity level'
                },
                time_window: {
                  type: 'string',
                  description: 'Time window for search (e.g., "24h", "7d")'
                },
                aggregate: {
                  type: 'boolean',
                  description: 'Include aggregation statistics (default: false)'
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'search_rules',
            description: 'Advanced rule searching with target, action, and status filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (e.g., "action:block AND target_value:*.facebook.com")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                include_paused: {
                  type: 'boolean',
                  description: 'Include paused rules (default: true)'
                },
                actions: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['allow', 'block', 'timelimit']
                  },
                  description: 'Filter by rule actions'
                },
                directions: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['bidirection', 'inbound', 'outbound']
                  },
                  description: 'Filter by traffic directions'
                },
                aggregate: {
                  type: 'boolean',
                  description: 'Include aggregation statistics (default: false)'
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'search_devices',
            description: 'Advanced device searching with network, status, and usage filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (e.g., "online:true AND mac_vendor:Apple")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                include_offline: {
                  type: 'boolean',
                  description: 'Include offline devices (default: true)'
                },
                network_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by network IDs'
                },
                last_seen_threshold: {
                  type: 'number',
                  description: 'Minimum last seen threshold (seconds ago)'
                },
                aggregate: {
                  type: 'boolean',
                  description: 'Include aggregation statistics (default: false)'
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'search_target_lists',
            description: 'Advanced target list searching with category and ownership filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (e.g., "category:ad AND owner:global")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 50)',
                  minimum: 1,
                  maximum: 1000,
                },
                offset: {
                  type: 'number',
                  description: 'Results offset for pagination (default: 0)',
                  minimum: 0,
                },
                owners: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by list owners'
                },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by categories'
                },
                min_targets: {
                  type: 'number',
                  description: 'Minimum number of targets in list'
                },
                aggregate: {
                  type: 'boolean',
                  description: 'Include aggregation statistics (default: false)'
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'search_cross_reference',
            description: 'Multi-entity searches with correlation across different data types',
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
                  description: 'Secondary queries to correlate with primary results',
                },
                correlation_field: {
                  type: 'string',
                  description: 'Field to use for correlation (e.g., "source_ip", "destination_ip")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results per query (default: 1000)',
                  minimum: 1,
                  maximum: 10000,
                }
              },
              required: ['primary_query', 'secondary_queries', 'correlation_field'],
            },
          },
          {
            name: 'get_network_rules_summary',
            description: 'Get overview statistics and counts of network rules by category',
            inputSchema: {
              type: 'object',
              properties: {
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
                active_only: {
                  type: 'boolean',
                  description: 'Only include active rules in summary (default: true)',
                },
              },
            },
          },
          {
            name: 'get_most_active_rules',
            description: 'Get rules with highest hit counts for traffic analysis',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Number of top rules to return (default: 20, max: 50)',
                  minimum: 1,
                  maximum: 50,
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
            },
          },
          {
            name: 'get_recent_rules',
            description: 'Get recently created or modified firewall rules',
            inputSchema: {
              type: 'object',
              properties: {
                hours: {
                  type: 'number',
                  description: 'Look back period in hours (default: 24, max: 168)',
                  minimum: 1,
                  maximum: 168,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rules to return (default: 30, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
                rule_type: {
                  type: 'string',
                  description: 'Filter by rule type',
                },
                include_modified: {
                  type: 'boolean',
                  description: 'Include recently modified rules, not just created (default: true)',
                },
              },
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
  server.start().catch((error: Error) => {
    process.stderr.write(`Fatal error: ${error.message}\n`);
    process.exit(1);
  });
}