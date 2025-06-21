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

class FirewallaMCPServer {
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
                page: {
                  type: 'number',
                  description: 'Page number for pagination (default: 1)',
                  minimum: 1,
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

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write('Firewalla MCP Server running on stdio\\n');
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FirewallaMCPServer();
  server.start().catch((error: Error) => {
    process.stderr.write(`Fatal error: ${error.message}\\n`);
    process.exit(1);
  });
}