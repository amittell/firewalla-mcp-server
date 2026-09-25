#!/usr/bin/env node

/**
 * @fileoverview Firewalla MCP Server
 *
 * This file implements the primary MCP server class that provides Claude with access to
 * Firewalla firewall data through 28 tools that map to Firewalla API endpoints,
 * plus 5 opt-in write tools (FIREWALLA_ENABLE_WRITE_TOOLS=true).
 * Tools include parameter validation and error handling.
 *
 * Architecture:
 * - 23 Direct API Endpoints
 * - 5 Convenience Wrappers
 * - Limits set to API maximum (500)
 * - Required parameters for proper API calls
 * - CRUD operations for all resources
 * - Dual transport support (stdio and HTTP)
 *
 * @version 1.4.1
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { config } from './config/config.js';
import { FirewallaClient } from './firewalla/client.js';
import { setupTools } from './tools/index.js';
import { setupResources } from './resources/index.js';
import { setupPrompts } from './prompts/index.js';
import { logger } from './monitoring/logger.js';
import { initializeHttpSession } from './http-session.js';
import { exitWhenStdioCloses } from './stdio-lifecycle.js';
import { PACKAGE_VERSION } from './utils/package-version.js';
import { isWriteTool, writeToolsEnabled } from './config/write-tools.js';

/**
 * UUID v4 validation regex pattern
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a properly formatted UUID v4
 *
 * @param value - The string to validate
 * @returns True if the value is a valid UUID v4, false otherwise
 */
function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Main MCP Server class for Firewalla integration with 28-tool architecture
 */
export class FirewallaMCPServer {
  private static signalHandlersRegistered = false;

  private server: Server;
  private firewalla: FirewallaClient;

  constructor() {
    this.firewalla = new FirewallaClient(config);
    this.server = this.createServerInstance();
  }

  /**
   * Creates a new MCP Server instance with all handlers registered.
   * Used once for stdio transport, and per-session for HTTP transport
   * (each HTTP session needs its own Server instance to avoid
   * "Already connected to a transport" errors).
   */
  private createServerInstance(): Server {
    const server = new Server(
      {
        name: 'firewalla-mcp-server',
        version: PACKAGE_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.registerHandlers(server);
    return server;
  }

  /**
   * Registers all MCP protocol request handlers on a Server instance
   */
  private registerHandlers(server: Server): void {
    // List available tools - 28-Tool Complete API Coverage
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Direct API Endpoints (24 tools)
          {
            name: 'get_active_alarms',
            description:
              'Retrieve active security alarms from the Firewalla MSP API (GET /v2/alarms): status:1 is added unless the query names a status (status:2 for archived alarms). Without a ts: qualifier the API covers the last 30 days. Returns up to limit alarms and a cursor for the next page, or groups with groupBy. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Get Active Alarms',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for filtering alarms. Active alarms only (status:1) unless the query names a status. Use type:N where N is: 1=Security Activity, 2=Abnormal Upload, 3=Large Bandwidth Usage, 4=Monthly Data Plan, 5=New Device, 6=Device Back Online, 7=Device Offline, 8=Video Activity, 9=Gaming Activity, 10=Porn Activity, 11=VPN Activity, 12=VPN Connection Restored, 13=VPN Connection Error, 14=Open Port, 15=Internet Connectivity Update, 16=Large Upload. Examples: type:8 (video), type:10 (porn), region:US, device.ip:192.168.*',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Fields to group by, comma-separated, e.g. "type", "status", "device" or "type,box". The API then returns groups instead of alarms: groups of { key, count }, where key holds the group fields (gid for box, device.id for device) and count the alarms in the group.',
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort alarms (default: ts:desc)',
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
              'Get detailed information for one Firewalla alarm (GET /v2/alarms/{gid}/{aid}). Alarm IDs are per box: pass gid on a multi-box account, or each box is checked, one request per box, until one has the alarm.',
            annotations: {
              title: 'Get Alarm Details',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                alarm_id: {
                  type: ['string', 'number'],
                  description:
                    'Alarm ID (required for API call): the aid from get_active_alarms or search_alarms, as a number or a string',
                },
                gid: {
                  type: 'string',
                  description:
                    'Box the alarm belongs to (the gid field of get_active_alarms or search_alarms results). Defaults to FIREWALLA_BOX_ID; without either, each box on the account is checked.',
                },
              },
              required: ['alarm_id'],
            },
          },
          // Disabled: delete_alarm tool commented out because the Firewalla MSP API
          // returns false success responses but doesn't actually delete alarms
          // archive_alarm (below, opt-in) is the documented alternative
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
            name: 'archive_alarm',
            description:
              "Archive an alarm (MSP 2.11.0 or later): it leaves the active alarms. It creates no silence exception, so future matching traffic can still raise new alarms (mute_alarm silences them). Alarm IDs are per box: pass gid (the alarm's gid field); without gid or FIREWALLA_BOX_ID each box is checked, and the tool refuses when several boxes have that aid and none is FIREWALLA_DEFAULT_BOX_ID.",
            annotations: {
              title: 'Archive Alarm',
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                alarm_id: {
                  type: ['string', 'number'],
                  description:
                    'Alarm ID: the numeric aid from get_active_alarms or search_alarms, as a number or a string',
                },
                gid: {
                  type: 'string',
                  description:
                    'Box the alarm belongs to (the gid field of get_active_alarms or search_alarms results). Defaults to FIREWALLA_BOX_ID; without either, each box on the account is checked.',
                },
              },
              required: ['alarm_id'],
            },
          },
          {
            name: 'mute_alarm',
            description:
              "Mute an alarm (MSP 2.11.0 or later): the API archives it and has the box create a lasting silence exception, so future alarms matching the target within the scope are no longer raised. target_type alarmType silences every future alarm of this alarm's type (for example all Security Activity alarms), domain a domain and its subdomains, ip one IP address. scope_type all covers every device on the box; device, group, user or network limit it to the one named by scope_value. This server has no tool to remove the exception. Box selection is the same as archive_alarm.",
            annotations: {
              title: 'Mute Alarm',
              readOnlyHint: false,
              // A lasting silence of future alarms, which this server cannot undo
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                alarm_id: {
                  type: ['string', 'number'],
                  description:
                    'Alarm ID: the numeric aid from get_active_alarms or search_alarms, as a number or a string',
                },
                target_type: {
                  type: 'string',
                  enum: ['alarmType', 'domain', 'ip'],
                  description:
                    "What to silence: alarmType (every future alarm of this alarm's type, whatever the destination), domain (target_value and its subdomains) or ip (target_value)",
                },
                target_value: {
                  type: 'string',
                  description:
                    'Required for domain (a plain domain name such as example.com; the API applies wildcard matching itself) and ip (one IP address). Omit for alarmType.',
                },
                scope_type: {
                  type: 'string',
                  enum: ['device', 'group', 'user', 'network', 'all'],
                  description:
                    'Which devices the silence covers: all (every device on the box), or one device, group, user or network named by scope_value',
                },
                scope_value: {
                  type: 'string',
                  description:
                    'The device ID (MAC address), group ID, user ID or network ID. Required unless scope_type is all; omit for all.',
                },
                gid: {
                  type: 'string',
                  description:
                    'Box the alarm belongs to (the gid field of get_active_alarms or search_alarms results). Defaults to FIREWALLA_BOX_ID; without either, each box on the account is checked.',
                },
              },
              required: ['alarm_id', 'target_type', 'scope_type'],
            },
          },
          {
            name: 'get_flow_data',
            description:
              'Query network traffic flows from the Firewalla MSP API (GET /v2/flows). Without a ts: qualifier the API covers the last 24 hours. Returns up to limit flows and a cursor for the next page, or groups with groupBy. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Get Flow Data',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for flows. Supports region:US for geographic filtering, protocol:tcp, status:blocked, domain:*, category:social, etc.',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Fields to group by, comma-separated, e.g. "category", "domain", "device", "box" or "device,category". The API then returns groups instead of flows: groups of { key, count, download, upload, total }, where key holds the group fields (gid for box; for device the device with its name, but only its id for "device,category") and the rest are the group\'s summed connection count and bytes.',
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
              'Check online/offline status of devices on the Firewalla network. Reads the device list from GET /v2/devices (box, else FIREWALLA_BOX_ID, else every box; group limits it to a box group) and returns up to limit devices, sorted by name.',
            annotations: {
              title: 'Get Device Status',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
            description:
              'Retrieve firewall rules and conditions (GET /v2/rules). The API returns every matching rule; the tool returns the first limit. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Get Firewall Rules',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
              "Pause an active firewall rule on the box until resume_rule reactivates it (POST /v2/rules/{id}/pause, no body). The MSP API takes no duration, so the pause does not expire on its own. Checks the rule's status first and changes nothing if it is already paused.",
            annotations: {
              title: 'Pause Firewall Rule',
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule ID to pause',
                },
              },
              required: ['rule_id'],
            },
          },
          {
            name: 'resume_rule',
            description:
              "Resume a paused firewall rule on the box, restoring it to active (POST /v2/rules/{id}/resume, no body). Checks the rule's status first and changes nothing if it is already active.",
            annotations: {
              title: 'Resume Firewall Rule',
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule ID to resume',
                },
              },
              required: ['rule_id'],
            },
          },
          {
            name: 'get_target_lists',
            description:
              "Retrieve target lists (GET /v2/target-lists). Without owner the API returns the MSP's global lists and the Firewalla-managed lists; owner selects global lists, a box's lists, or several. entry_count is the number of entries in each list; the API does not return the entries of Firewalla-managed lists, so their targets is null. Returns up to limit lists.",
            annotations: {
              title: 'Get Target Lists',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
                owner: {
                  type: 'string',
                  description:
                    'Only lists with this owner: "global" (MSP lists), a box gid (that box\'s lists), or several comma-separated, e.g. "global,<box_gid>". Default: global and Firewalla-managed lists.',
                },
              },
              required: ['limit'],
            },
          },
          {
            name: 'get_specific_target_list',
            description:
              'Retrieve one target list by ID, including its targets (GET /v2/target-lists/{id}).',
            annotations: {
              title: 'Get Target List',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
            name: 'create_rule',
            description:
              "Create a new firewall rule (block or allow) on one box (POST /v2/rules), with optional device/group/network scope and cron schedule. Each call adds another rule; delete_rule removes one. Uses gid, else FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, else the account's only box; refuses on a multi-box account with none of those.",
            annotations: {
              title: 'Create Firewall Rule',
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['block', 'allow'],
                  description: 'Rule action',
                },
                target_type: {
                  type: 'string',
                  enum: [
                    'app',
                    'category',
                    'domain',
                    'internet',
                    'intranet',
                    'ip',
                    'net',
                    'region',
                    'remotePort',
                    'targetlist',
                  ],
                  description: 'What the rule matches',
                },
                target_value: {
                  type: 'string',
                  description:
                    'Target value: domain name, IP, CIDR, category code (e.g. games, social, vpn), app id (e.g. tiktok), ISO region code, port, or target list id. Omit for internet; for intranet, a network ID or omit for all local networks.',
                },
                scope_type: {
                  type: 'string',
                  enum: ['device', 'group', 'user', 'network'],
                  description:
                    'Optional scope: limit the rule to one device, device group, user, or network',
                },
                scope_value: {
                  type: 'string',
                  description:
                    'Scope identifier, e.g. device MAC address, group id, or network id. Required when scope_type is set.',
                },
                direction: {
                  type: 'string',
                  enum: ['bidirection', 'inbound', 'outbound'],
                  description: 'Traffic direction (default: bidirection)',
                },
                protocol: {
                  type: 'string',
                  enum: ['tcp', 'udp'],
                  description: 'Protocol filter (optional, default: both)',
                },
                notes: {
                  type: 'string',
                  description: 'Free-text note stored on the rule',
                },
                duration: {
                  type: 'number',
                  description:
                    'Seconds the rule stays in effect each activation (60 to 31536000). Required with cron_time, where it sets the length of each recurring window.',
                  minimum: 60,
                  maximum: 31536000,
                },
                cron_time: {
                  type: 'string',
                  description:
                    "Cron expression for recurring activation, e.g. '0 21 * * *' for 9pm daily. Requires duration.",
                },
                gid: {
                  type: 'string',
                  description:
                    "Box to create the rule on. Defaults to FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, then to the account's only box; the tool refuses on a multi-box account when none is set.",
                },
              },
              required: ['action', 'target_type'],
            },
          },
          {
            name: 'delete_rule',
            description:
              'Permanently delete a firewall rule (DELETE /v2/rules/{id}; cannot be undone; MSP 2.11.0+). Checks the rule exists first and sends nothing for an unknown ID. Use pause_rule for a temporary disable.',
            annotations: {
              title: 'Delete Firewall Rule',
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                rule_id: {
                  type: 'string',
                  description: 'Rule ID to delete',
                },
              },
              required: ['rule_id'],
            },
          },
          {
            name: 'rename_device',
            description:
              "Rename a network device (PATCH /v2/boxes/{gid}/devices/{id}; the only device field the MSP API allows changing; 32 characters max). Uses gid, else FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, else the account's only box.",
            annotations: {
              title: 'Rename Device',
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                device_id: {
                  type: 'string',
                  description: 'Device ID (MAC address)',
                },
                name: {
                  type: 'string',
                  description: 'New device name (max 32 characters)',
                  maxLength: 32,
                },
                gid: {
                  type: 'string',
                  description:
                    "Box the device belongs to. Defaults to FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, then to the account's only box; the tool refuses on a multi-box account when none is set.",
                },
              },
              required: ['device_id', 'name'],
            },
          },
          {
            name: 'create_target_list',
            description:
              'Create a new target list (POST /v2/target-lists); each call creates another list. owner global makes it shareable across all boxes, a box GID ties it to that box.',
            annotations: {
              title: 'Create Target List',
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
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
            description:
              'Update an existing target list (PATCH /v2/target-lists/{id}). Only the fields given are sent; targets, when given, is the complete new list and is not merged with the current targets.',
            annotations: {
              title: 'Update Target List',
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: true,
              openWorldHint: true,
            },
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
            description:
              'Permanently delete a target list (DELETE /v2/target-lists/{id}); cannot be undone. The tool does not check whether a rule still targets the list.',
            annotations: {
              title: 'Delete Target List',
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: true,
              openWorldHint: true,
            },
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
              'Search network flows with advanced query filters. Use this for: historical analysis, specific time ranges, complex filtering, or when you need more than 50 flows. Supports pagination, time-based queries (e.g., "ts:>1h" for the last hour, or Unix seconds such as "ts:1735689600-1735693200"), and all flow fields including geographic filtering. For quick "what\'s happening now" snapshots, use get_recent_flow_activity instead. Reads GET /v2/flows, 500 per request, following the cursor up to limit. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Search Flows',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: protocol:tcp/udp, direction:inbound/outbound/local, status:blocked/ok, total:>1MB (download + upload in B/KB/MB/GB/TB), download:>10MB, upload:>10MB, domain:*.example.com, region:US (country code), category:social/games/porn/etc, box.id:box_gid, device.ip:192.168.*, source.ip:*, destination.ip:*, ts:>1h. Examples: "region:US AND protocol:tcp", "status:blocked AND region:CN", "category:social OR category:games"',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Fields to group by, comma-separated, e.g. "category", "domain", "device", "box" or "device,category". The API then returns groups instead of flows: groups of { key, count, download, upload, total }, where key holds the group fields (gid for box; for device the device with its name, but only its id for "device,category") and the rest are the group\'s summed connection count and bytes.',
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
              // the shared search validator requires query -- advertise it
              required: ['query'],
            },
          },
          {
            name: 'search_alarms',
            description:
              'Search alarms using full-text or field filters. Alarm types: 1=Security Activity, 2=Abnormal Upload, 3=Large Bandwidth Usage, 4=Monthly Data Plan, 5=New Device, 6=Device Back Online, 7=Device Offline, 8=Video Activity, 9=Gaming Activity, 10=Porn Activity, 11=VPN Activity, 12=VPN Connection Restored, 13=VPN Connection Error, 14=Open Port, 15=Internet Connectivity Update, 16=Large Upload. Reads GET /v2/alarms, 500 per request, following the cursor up to limit. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Search Alarms',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: type:1-16 (see alarm types above), status:1/2 (active/archived), device.ip:192.168.*, region:US (country code), box.id:box_gid, device.name:*. Examples: "type:8 AND region:US" (video from US), "type:10 AND status:1" (active porn alerts), "device.ip:192.168.* AND status:1" (active alarms from the LAN), "porn" (free text: a term without a qualifier searches alarm text)',
                },
                groupBy: {
                  type: 'string',
                  description:
                    'Fields to group by, comma-separated, e.g. "type", "status", "device" or "type,box". The API then returns groups instead of alarms: groups of { key, count }, where key holds the group fields (gid for box, device.id for device) and count the alarms in the group.',
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
              // the shared search validator requires query -- advertise it
              required: ['query'],
            },
          },
          {
            name: 'search_rules',
            description:
              'Search firewall rules by target, action or status; the MSP API applies the query (GET /v2/rules). Supports all rule fields. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Search Firewall Rules',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: action:allow/block/timelimit, target.type:domain/ip/device, target.value:*.facebook.com, status:active/paused, direction:bidirection/inbound/outbound, protocol:tcp/udp, box.id:box_gid, scope.type:device/network, notes:"description text". Examples: "action:block AND target.value:*.social.com", "status:paused", "target.type:domain AND action:block"',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rules to return',
                },
              },
              // the handler validates query as required -- advertise it so
              // schema-following clients do not get a validation error on {}
              required: ['query'],
            },
          },
          {
            name: 'get_boxes',
            description:
              'List the Firewalla boxes this MSP token can see (GET /v2/boxes, optionally one box group), with online status, model and version. Not limited by FIREWALLA_BOX_ID.',
            annotations: {
              title: 'List Firewalla Boxes',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
            description:
              'Get account-wide counts from GET /v2/stats/simple: online boxes, offline boxes, alarms and rules, optionally for one box group. Not limited by FIREWALLA_BOX_ID.',
            annotations: {
              title: 'Get Simple Statistics',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
              'Top regions by blocked flows, from GET /v2/stats/topRegionsByBlockedFlows, optionally for one box group; the API returned no more than 5 regions. Not limited by FIREWALLA_BOX_ID.',
            annotations: {
              title: 'Top Regions by Blocked Flows',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
                    'Maximum number of regions (optional, default: 5; the API returned no more than 5 when a larger limit was tried)',
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
              "Top boxes by blocked flows (the default) or by Security Activity alarms, from GET /v2/stats/{type}, with each box's details from GET /v2/boxes; each box's value is the statistic, over about the last 30 days when measured. Not limited by FIREWALLA_BOX_ID.",
            annotations: {
              title: 'Top Boxes',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
              'Get a snapshot of the 50 most recent network flows (one GET /v2/flows request) with protocol, region and blocked/allowed counts; the minutes they span depend on how busy the network is. Use this for: "what\'s happening right now?", current security threats, immediate network issues. DO NOT use for: historical analysis, more than 50 flows, or daily/weekly patterns; use search_flows with time queries like "ts:>24h" for those. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Recent Flow Activity',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_flow_insights',
            description:
              'Get category-based flow analysis for a period: top content categories and their domains, top devices by bandwidth, and optionally blocked traffic. Ideal for answering questions like "what porn sites were accessed" or "what social media was used". Computed client-side from the period\'s largest flows (GET /v2/flows by total bytes: up to 500 for categories, 200 for devices) and, with include_blocked, the 50 most frequent blocked flows, so on a busy network it covers the largest flows, not all of them. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Flow Category Insights',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
              'Alarms generated per day, from GET /v2/trends/alarms: one point per day for the last 30 days, the last point being today so far. period (default 30d) returns the days that overlap it. The trends API takes no box, so it covers every box (or the group) even with FIREWALLA_BOX_ID set.',
            annotations: {
              title: 'Alarm Trends',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description:
                    'Return the days that overlap this period (default: 30d). The API has no finer resolution than a day, so 1h returns today so far and 24h returns yesterday and today',
                  default: '30d',
                },
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
              'Rules created per day for the last 30 days, from GET /v2/trends/rules; period and group work as in get_alarm_trends. When that endpoint answers 400 (it did when measured), each UTC day counts the rules in GET /v2/rules created on it, scoped to FIREWALLA_BOX_ID when set (rules deleted since are not counted), and the response says so.',
            annotations: {
              title: 'Rule Trends',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['1h', '24h', '7d', '30d'],
                  description:
                    'Return the days that overlap this period (default: 30d). The API has no finer resolution than a day',
                  default: '30d',
                },
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
              "Top devices by upload plus download over the period, summed client-side from up to 10 times limit (1,000 at most) of the period's most recent flows (GET /v2/flows, 500 per request), so on a busy network the totals cover a sample. Scoped to box, else FIREWALLA_BOX_ID, else every box.",
            annotations: {
              title: 'Top Bandwidth Devices',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
                  description:
                    'Only flows of this box (box gid). Defaults to FIREWALLA_BOX_ID; without either, every box.',
                },
              },
              required: ['period'],
            },
          },
          {
            name: 'get_offline_devices',
            description:
              'List offline devices from the full device list (GET /v2/devices), most recently seen first by default, up to limit; total_offline_devices counts all of them. Scoped to box, else FIREWALLA_BOX_ID, else every box.',
            annotations: {
              title: 'Offline Devices',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
              'Search devices by name, IP, MAC or status (convenience wrapper with client-side filtering): reads the device list from GET /v2/devices (box, else FIREWALLA_BOX_ID, else every box) and filters it locally.',
            annotations: {
              title: 'Search Devices',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query using Firewalla syntax. Supported fields: mac:AA:BB:CC:DD:EE:FF, ip:192.168.1.*, name:*iPhone*, online:true/false, mac_vendor:Apple, gid:box_gid, network.name:*, group.name:*. Examples: "online:false AND mac_vendor:Apple", "ip:192.168.1.* AND name:*laptop*", "mac:AA:* OR name:*phone*"',
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
              // the shared search validator requires query -- advertise it
              required: ['query'],
            },
          },
          {
            name: 'search_target_lists',
            description:
              'Search target lists (convenience wrapper with client-side filtering): reads GET /v2/target-lists, sending owner if given (without it, the global and Firewalla-managed lists), and applies the query locally.',
            annotations: {
              title: 'Search Target Lists',
              readOnlyHint: true,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for target lists. Supported fields: name:*Social*, owner:global/box_gid, category:social/games/ad/porn/etc, targets:*.facebook.com, notes:"description text". Examples: "category:social", "owner:global AND name:*Block*", "targets:*.gaming.com"',
                },
                owner: {
                  type: 'string',
                  description:
                    'Only lists with this owner, sent to the API: "global" (MSP lists), a box gid (that box\'s lists), or several comma-separated, e.g. "global,<box_gid>". Default: global and Firewalla-managed lists.',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 500,
                  default: 100,
                  description: 'Maximum number of target lists to return',
                },
              },
              // the shared search validator requires query -- advertise it
              required: ['query'],
            },
          },
          {
            name: 'get_network_rules_summary',
            description:
              'Get overview counts of network rules by action, direction, status and target type (convenience wrapper): reads the rules from GET /v2/rules and counts them locally. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.',
            annotations: {
              title: 'Firewall Rules Summary',
              readOnlyHint: true,
              openWorldHint: true,
            },
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
        ].filter(tool => writeToolsEnabled() || !isWriteTool(tool.name)),
      };
    });

    // Set up tool handlers using the registry
    setupTools(server, this.firewalla);

    // Set up resources
    setupResources(server, this.firewalla);

    // Set up prompts
    setupPrompts(server, this.firewalla);
  }

  /**
   * Starts the MCP server using configured transport (stdio or HTTP)
   */
  async start(): Promise<void> {
    const transportType = config.transport.type;

    if (transportType === 'stdio') {
      await this.startStdioTransport();
    } else if (transportType === 'http') {
      await this.startHttpTransport();
    }
    // Note: TypeScript type system ensures transportType is 'stdio' | 'http'
    // No else block needed - config validation ensures only valid values reach here
  }

  /**
   * Starts the MCP server using stdio transport
   */
  private async startStdioTransport(): Promise<void> {
    const transport = new StdioServerTransport();
    // MCP clients stop a stdio server by closing its stdin, so exit then
    // instead of waiting for the client's SIGTERM.
    const shutdown = exitWhenStdioCloses({
      stdin: process.stdin,
      cleanup: async () => this.server.close(),
      exit: code => process.exit(code),
      flush: [process.stdout, process.stderr],
    });
    // Server.connect() chains this onclose ahead of its own handler.
    transport.onclose = () => shutdown('transport closed');
    await this.server.connect(transport);
    logger.info('Firewalla MCP Server running on stdio transport');
  }

  /**
   * Starts the MCP server using HTTP transport with StreamableHTTP
   */
  private async startHttpTransport(): Promise<void> {
    const { port, path } = config.transport;

    // Map to store transports and their associated server instances by session ID
    const transports = new Map<string, StreamableHTTPServerTransport>();
    const servers = new Map<string, Server>();

    // Abandoned-session reaper: transport.onclose only fires on an explicit
    // client DELETE or shutdown, so clients that crash / lose network would pin
    // their Server + transport in the maps forever. Stamp activity per request
    // and close sessions idle past MCP_SESSION_IDLE_TIMEOUT_MS (default 30 min).
    const lastActivity = new Map<string, number>();
    const idleTimeoutMs =
      Number(process.env.MCP_SESSION_IDLE_TIMEOUT_MS) || 30 * 60 * 1000;
    const reapEveryMs = Math.min(60_000, idleTimeoutMs); // sweep at least as often as the timeout
    const reaper = setInterval(() => {
      const now = Date.now();
      for (const [sid, seen] of lastActivity.entries()) {
        if (!transports.has(sid)) {
          lastActivity.delete(sid); // closed elsewhere; drop the stamp
        } else if (now - seen > idleTimeoutMs) {
          logger.info(`Reaping idle HTTP session: ${sid}`);
          lastActivity.delete(sid);
          void transports.get(sid)?.close(); // onclose cleans transports/servers
        }
      }
    }, reapEveryMs);
    reaper.unref();

    // Helper function to parse JSON body from request with size limit
    const parseJsonBody = async (req: IncomingMessage): Promise<unknown> => {
      const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit to prevent memory exhaustion
      return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_BODY_SIZE) {
            req.destroy();
            reject(new Error('Request body too large (max 1MB)'));
            return;
          }
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch (_error) {
            reject(new Error('Invalid JSON in request body'));
          }
        });
        req.on('error', reject);
      });
    };

    // Create HTTP server
    const httpServer = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          // Only handle requests to our configured path
          if (!req.url?.startsWith(path)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          const sessionId = req.headers['mcp-session-id'] as string | undefined;
          if (sessionId && transports.has(sessionId)) {
            lastActivity.set(sessionId, Date.now());
          }

          // Validate session ID format if present
          if (sessionId && !isValidUUID(sessionId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Invalid session ID format (must be UUID v4)',
                },
                id: null,
              })
            );
            return;
          }

          try {
            if (req.method === 'POST') {
              // Handle POST requests for MCP messages
              const parsedBody = await parseJsonBody(req);

              let transport: StreamableHTTPServerTransport;

              if (sessionId && transports.has(sessionId)) {
                // Reuse existing transport for this session
                transport = transports.get(sessionId)!;
              } else if (!sessionId && isInitializeRequest(parsedBody)) {
                // New initialization request - create new transport
                // Generate session ID immediately to prevent race condition
                const newSessionId = randomUUID();
                transport = new StreamableHTTPServerTransport({
                  sessionIdGenerator: () => newSessionId,
                  onsessioninitialized: (initializedSessionId: string) => {
                    logger.info(
                      `HTTP session initialized: ${initializedSessionId}`
                    );
                    // Transport already in map, no need to add again
                  },
                });

                lastActivity.set(newSessionId, Date.now());
                await initializeHttpSession({
                  sessionId: newSessionId,
                  transport,
                  transports,
                  servers,
                  createServerInstance: () => this.createServerInstance(),
                });
              } else {
                // Invalid request - no session ID or not initialization request
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                  })
                );
                return;
              }

              // Handle the request
              await transport.handleRequest(req, res, parsedBody);
            } else if (req.method === 'GET') {
              // Handle GET requests for SSE streams
              if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid or missing session ID');
                return;
              }

              const transport = transports.get(sessionId)!;
              await transport.handleRequest(req, res);
            } else if (req.method === 'DELETE') {
              // Handle DELETE requests for session termination
              if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid or missing session ID');
                return;
              }

              const transport = transports.get(sessionId)!;
              await transport.handleRequest(req, res);
            } else {
              // Unsupported method
              res.writeHead(405, { 'Content-Type': 'text/plain' });
              res.end('Method Not Allowed');
            }
          } catch (error) {
            logger.error(
              'Error handling HTTP request:',
              error instanceof Error ? error : new Error(String(error))
            );
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32603,
                    message: 'Internal server error',
                  },
                  id: null,
                })
              );
            }
          }
        })();
      }
    );

    // Start listening with error handling
    await new Promise<void>((resolve, reject) => {
      httpServer.on('error', err => {
        logger.error(
          'HTTP server error (port conflict or permission issue):',
          err instanceof Error ? err : new Error(String(err))
        );
        reject(err);
      });

      httpServer.listen(port, () => {
        logger.info(`Firewalla MCP Server running on HTTP transport`);
        logger.info(`HTTP server listening on http://localhost:${port}${path}`);
        resolve();
      });
    });

    // Handle graceful shutdown
    let isShuttingDown = false;
    const shutdown = () => {
      // Prevent duplicate shutdown sequences
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal');
        return;
      }
      isShuttingDown = true;

      void (async () => {
        logger.info('Shutting down HTTP server...');
        clearInterval(reaper);

        // Close all active transports and their server instances
        for (const [sessionId, transport] of transports.entries()) {
          try {
            await transport.close();
            transports.delete(sessionId);
            servers.delete(sessionId);
          } catch (error) {
            logger.error(
              `Error closing transport for session ${sessionId}:`,
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }

        // Close HTTP server with error handling and timeout
        const shutdownTimeout = setTimeout(() => {
          logger.error('HTTP server shutdown timed out, forcing exit');
          process.exit(1);
        }, 10000); // 10 second timeout

        httpServer.close(err => {
          clearTimeout(shutdownTimeout);
          if (err) {
            logger.error(
              'Error during HTTP server shutdown:',
              err instanceof Error ? err : new Error(String(err))
            );
            process.exit(1);
          } else {
            logger.info('HTTP server shut down complete');
            process.exit(0);
          }
        });
      })();
    };

    // Track signal handler registration to prevent duplicates
    if (!FirewallaMCPServer.signalHandlersRegistered) {
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      FirewallaMCPServer.signalHandlersRegistered = true;
    }
  }
}

// Start the server if this file is run directly.
// Resolve symlinks before comparing: when launched via a bin symlink (npx,
// npm global install), process.argv[1] is the symlink path while
// import.meta.url points at the real file, so a plain string comparison
// never matches and the server silently does nothing.
const isMainModule = (() => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const server = new FirewallaMCPServer();
  server.start().catch((error: unknown) => {
    logger.error(
      'Failed to start server:',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(1);
  });
}
