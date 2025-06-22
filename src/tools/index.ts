import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';

/**
 * Sets up MCP tools for Firewalla firewall management
 * Provides tools for security monitoring, network analysis, and firewall control
 * 
 * Available tools:
 * - get_active_alarms: Retrieve active security alarms
 * - get_flow_data: Get network flow information
 * - get_device_status: Check device connectivity status
 * - get_bandwidth_usage: Analyze bandwidth consumption
 * - pause_rule: Temporarily disable firewall rules
 * - get_target_lists: Access security target lists
 * 
 * @param server - MCP server instance to register tools with
 * @param firewalla - Firewalla client for API communication
 */
export function setupTools(server: Server, firewalla: FirewallaClient): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_active_alarms': {
          const severity = args?.severity as string | undefined;
          const limit = (args?.limit as number) || 20;
          
          const alarms = await firewalla.getActiveAlarms(severity, limit);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total: alarms.length,
                  alarms: alarms.map(alarm => ({
                    id: alarm.id,
                    timestamp: alarm.timestamp,
                    severity: alarm.severity,
                    type: alarm.type,
                    description: alarm.description,
                    source_ip: alarm.source_ip,
                    destination_ip: alarm.destination_ip,
                    status: alarm.status,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_flow_data': {
          const startTime = args?.start_time as string | undefined;
          const endTime = args?.end_time as string | undefined;
          const limit = (args?.limit as number) || 50;
          const page = (args?.page as number) || 1;
          
          const flowData = await firewalla.getFlowData(startTime, endTime, limit, page);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  flows: flowData.flows.map(flow => ({
                    timestamp: flow.timestamp,
                    source_ip: flow.source_ip,
                    destination_ip: flow.destination_ip,
                    source_port: flow.source_port,
                    destination_port: flow.destination_port,
                    protocol: flow.protocol,
                    bytes: flow.bytes,
                    packets: flow.packets,
                    duration: flow.duration,
                  })),
                  pagination: flowData.pagination,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_device_status': {
          const deviceId = args?.device_id as string | undefined;
          const includeOffline = (args?.include_offline as boolean) ?? true;
          
          const devices = await firewalla.getDeviceStatus(deviceId, includeOffline);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_devices: devices.length,
                  online_devices: devices.filter(d => d.status === 'online').length,
                  offline_devices: devices.filter(d => d.status === 'offline').length,
                  devices: devices.map(device => ({
                    id: device.id,
                    name: device.name,
                    ip_address: device.ip_address,
                    mac_address: device.mac_address,
                    status: device.status,
                    last_seen: device.last_seen,
                    device_type: device.device_type,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_bandwidth_usage': {
          const period = args?.period as string;
          const top = (args?.top as number) || 10;
          
          if (!period) {
            throw new Error('Period parameter is required');
          }
          
          const usage = await firewalla.getBandwidthUsage(period, top);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  period,
                  top_devices: usage.length,
                  bandwidth_usage: usage.map(item => ({
                    device_id: item.device_id,
                    device_name: item.device_name,
                    ip_address: item.ip_address,
                    bytes_uploaded: item.bytes_uploaded,
                    bytes_downloaded: item.bytes_downloaded,
                    total_bytes: item.total_bytes,
                    total_mb: Math.round(item.total_bytes / (1024 * 1024)),
                    total_gb: Math.round(item.total_bytes / (1024 * 1024 * 1024) * 100) / 100,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_network_rules': {
          const ruleType = args?.rule_type as string | undefined;
          const activeOnly = (args?.active_only as boolean) ?? true;
          
          const rules = await firewalla.getNetworkRules(ruleType, activeOnly);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_rules: rules.length,
                  active_rules: rules.filter(r => r.status === 'active').length,
                  paused_rules: rules.filter(r => r.status === 'paused').length,
                  rules: rules.map(rule => ({
                    id: rule.id,
                    name: rule.name,
                    type: rule.type,
                    action: rule.action,
                    status: rule.status,
                    conditions: rule.conditions,
                    created_at: rule.created_at,
                    updated_at: rule.updated_at,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'pause_rule': {
          const ruleId = args?.rule_id as string;
          const duration = (args?.duration as number) || 60;
          
          if (!ruleId) {
            throw new Error('Rule ID parameter is required');
          }
          
          const result = await firewalla.pauseRule(ruleId, duration);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: result.success,
                  message: result.message,
                  rule_id: ruleId,
                  duration_minutes: duration,
                  action: 'pause_rule',
                }, null, 2),
              },
            ],
          };
        }

        case 'get_target_lists': {
          const listType = args?.list_type as string | undefined;
          
          const lists = await firewalla.getTargetLists(listType);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_lists: lists.length,
                  list_types: [...new Set(lists.map(l => l.type))],
                  target_lists: lists.map(list => ({
                    id: list.id,
                    name: list.name,
                    type: list.type,
                    entry_count: (list as any).count || (list.entries?.length || 0),
                    entries: list.entries?.slice(0, 10) || [],
                    last_updated: list.last_updated || (list as any).lastUpdated,
                    notes: (list as any).notes,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'resume_rule': {
          const ruleId = args?.rule_id as string;
          
          if (!ruleId) {
            throw new Error('Rule ID parameter is required');
          }
          
          const result = await firewalla.resumeRule(ruleId);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: result.success,
                  message: result.message,
                  rule_id: ruleId,
                  action: 'resume_rule',
                }, null, 2),
              },
            ],
          };
        }

        case 'get_boxes': {
          const boxes = await firewalla.getBoxes();
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_boxes: boxes.length,
                  boxes: boxes.map((box: any) => ({
                    id: box.id,
                    name: box.name,
                    status: box.status,
                    version: box.version,
                    last_seen: box.last_seen,
                    location: box.location,
                    type: box.type,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_specific_alarm': {
          const alarmId = args?.alarm_id as string;
          
          if (!alarmId) {
            throw new Error('Alarm ID parameter is required');
          }
          
          const alarm = await firewalla.getSpecificAlarm(alarmId);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  alarm_id: alarm.id,
                  type: alarm.type,
                  severity: alarm.severity,
                  description: alarm.description,
                  timestamp: alarm.timestamp,
                  source_ip: alarm.source_ip,
                  destination_ip: alarm.destination_ip,
                  status: alarm.status,
                }, null, 2),
              },
            ],
          };
        }

        case 'delete_alarm': {
          const alarmId = args?.alarm_id as string;
          
          if (!alarmId) {
            throw new Error('Alarm ID parameter is required');
          }
          
          const result = await firewalla.deleteAlarm(alarmId);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: result.success,
                  message: result.message,
                  alarm_id: alarmId,
                  action: 'delete_alarm',
                }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: errorMessage,
              tool: name,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });
}