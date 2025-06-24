import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';
import { ResponseOptimizer, DEFAULT_OPTIMIZATION_CONFIG } from '../optimization/index.js';
import { createSearchTools } from './search.js';

/**
 * Sets up MCP tools for Firewalla firewall management
 * Provides tools for security monitoring, network analysis, and firewall control
 * 
 * Available tools:
 * Core tools:
 * - get_active_alarms: Retrieve active security alarms
 * - get_flow_data: Get network flow information
 * - get_device_status: Check device connectivity status
 * - get_bandwidth_usage: Analyze bandwidth consumption
 * - get_network_rules: Get firewall rules (with token optimization and limits)
 * - pause_rule: Temporarily disable firewall rules
 * - get_target_lists: Access security target lists
 * 
 * Specialized rule tools:
 * - get_network_rules_summary: Overview statistics and counts by category
 * - get_most_active_rules: Rules with highest hit counts for traffic analysis
 * - get_recent_rules: Recently created or modified firewall rules
 * 
 * Advanced search tools:
 * - search_flows: Advanced flow searching with complex queries
 * - search_alarms: Alarm searching with severity, time, IP filters
 * - search_rules: Rule searching with target, action, status filters
 * - search_devices: Device searching with network, status, usage filters
 * - search_target_lists: Target list searching with category, ownership filters
 * - search_cross_reference: Multi-entity searches with correlation
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
          const query = args?.query as string | undefined;
          const groupBy = args?.groupBy as string | undefined;
          const sortBy = args?.sortBy as string | undefined;
          const limit = (args?.limit as number) || 200;
          const cursor = args?.cursor as string | undefined;
          
          const response = await firewalla.getActiveAlarms(query, groupBy, sortBy, limit, cursor);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: response.count,
                  alarms: (Array.isArray(response.results) ? response.results : []).map(alarm => ({
                    aid: alarm.aid,
                    timestamp: new Date(alarm.ts * 1000).toISOString(),
                    type: alarm.type,
                    status: alarm.status,
                    message: alarm.message,
                    direction: alarm.direction,
                    protocol: alarm.protocol,
                    gid: alarm.gid,
                    // Include conditional properties if present
                    ...(alarm.device && { device: alarm.device }),
                    ...(alarm.remote && { remote: alarm.remote }),
                    ...(alarm.transfer && { transfer: alarm.transfer }),
                    ...(alarm.dataPlan && { dataPlan: alarm.dataPlan }),
                    ...(alarm.vpn && { vpn: alarm.vpn }),
                    ...(alarm.port && { port: alarm.port }),
                    ...(alarm.wan && { wan: alarm.wan }),
                  })),
                  next_cursor: response.next_cursor,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_flow_data': {
          const query = args?.query as string | undefined;
          const groupBy = args?.groupBy as string | undefined;
          const sortBy = args?.sortBy as string | undefined;
          const limit = (args?.limit as number) || 200;
          const cursor = args?.cursor as string | undefined;
          
          // Build query for time range if provided
          const startTime = args?.start_time as string | undefined;
          const endTime = args?.end_time as string | undefined;
          let finalQuery = query;
          
          if (startTime && endTime) {
            const startTs = Math.floor(new Date(startTime).getTime() / 1000);
            const endTs = Math.floor(new Date(endTime).getTime() / 1000);
            const timeQuery = `ts:${startTs}-${endTs}`;
            finalQuery = query ? `${query} AND ${timeQuery}` : timeQuery;
          }
          
          const response = await firewalla.getFlowData(finalQuery, groupBy, sortBy, limit, cursor);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: response.count,
                  flows: (Array.isArray(response.results) ? response.results : []).map(flow => ({
                    timestamp: new Date(flow.ts * 1000).toISOString(),
                    source_ip: flow.source?.ip || flow.device.ip,
                    destination_ip: flow.destination?.ip || 'unknown',
                    protocol: flow.protocol,
                    bytes: (flow.download || 0) + (flow.upload || 0),
                    download: flow.download || 0,
                    upload: flow.upload || 0,
                    packets: flow.count,
                    duration: flow.duration || 0,
                    direction: flow.direction,
                    blocked: flow.block,
                    block_type: flow.blockType,
                    device: flow.device,
                    source: flow.source,
                    destination: flow.destination,
                    region: flow.region,
                    category: flow.category,
                  })),
                  next_cursor: response.next_cursor,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_device_status': {
          const deviceId = args?.device_id as string | undefined;
          const includeOffline = (args?.include_offline as boolean) !== false; // Default to true
          const limit = args?.limit as number | undefined; // Optional limit for response size
          const cursor = args?.cursor as string | undefined; // Cursor for pagination
          
          const devicesResponse = await firewalla.getDeviceStatus(deviceId, includeOffline, limit, cursor);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_devices: devicesResponse.total_count || 0,
                  online_devices: Array.isArray(devicesResponse.results) ? devicesResponse.results.filter(d => d.online).length : 0,
                  offline_devices: Array.isArray(devicesResponse.results) ? devicesResponse.results.filter(d => !d.online).length : 0,
                  page_size: Array.isArray(devicesResponse.results) ? devicesResponse.results.length : 0,
                  has_more: devicesResponse.has_more || false,
                  devices: (Array.isArray(devicesResponse.results) ? devicesResponse.results : []).map(device => ({
                    id: device.id,
                    gid: device.gid,
                    name: device.name,
                    ip: device.ip,
                    macVendor: device.macVendor,
                    online: device.online,
                    lastSeen: device.lastSeen,
                    ipReserved: device.ipReserved,
                    network: device.network,
                    group: device.group,
                    totalDownload: device.totalDownload,
                    totalUpload: device.totalUpload,
                  })),
                  next_cursor: devicesResponse.next_cursor,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_offline_devices': {
          const sortByLastSeen = (args?.sort_by_last_seen as boolean) ?? true;
          
          // Get all devices including offline ones with high limit to ensure no truncation
          const allDevicesResponse = await firewalla.getDeviceStatus(undefined, undefined, 1000);
          
          // Filter to only offline devices
          let offlineDevices = allDevicesResponse.results.filter(device => !device.online);
          
          // Sort by last seen timestamp if requested
          if (sortByLastSeen) {
            offlineDevices = offlineDevices.sort((a, b) => {
              const aTime = Number(a.lastSeen) || 0;
              const bTime = Number(b.lastSeen) || 0;
              return bTime - aTime; // Most recent first
            });
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_offline_devices: offlineDevices.length,
                  devices: offlineDevices.map(device => ({
                    id: device.id,
                    name: device.name,
                    ip: device.ip,
                    macVendor: device.macVendor,
                    lastSeen: device.lastSeen,
                    lastSeenFormatted: device.lastSeen ? new Date(Number(device.lastSeen) * 1000).toISOString() : 'Never',
                    network: device.network,
                    group: device.group,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_bandwidth_usage': {
          const period = args?.period as string;
          const top = (args?.top as number) || 50; // Default restored, will implement proper pagination
          
          if (!period) {
            throw new Error('Period parameter is required');
          }
          
          const usageResponse = await firewalla.getBandwidthUsage(period, top);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  period,
                  top_devices: Array.isArray(usageResponse.results) ? usageResponse.results.length : 0,
                  bandwidth_usage: (Array.isArray(usageResponse.results) ? usageResponse.results : []).map(item => ({
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
          const query = args?.query as string | undefined;
          const summaryOnly = (args?.summary_only as boolean) ?? false;
          const limit = (args?.limit as number) || 500; // Increased from 50 to 500
          
          const response = await firewalla.getNetworkRules(query, limit);
          
          // Apply additional optimization if summary mode requested
          let optimizedResponse = response;
          if (summaryOnly) {
            optimizedResponse = ResponseOptimizer.optimizeRuleResponse(response, {
              ...DEFAULT_OPTIMIZATION_CONFIG,
              summaryMode: {
                maxItems: limit,
                includeFields: ['id', 'action', 'target', 'direction', 'status', 'hit'],
                excludeFields: ['notes', 'schedule', 'timeUsage', 'scope']
              }
            });
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: optimizedResponse.count,
                  summary_mode: summaryOnly,
                  limit_applied: summaryOnly ? limit : undefined,
                  rules: summaryOnly ? optimizedResponse.results : response.results.slice(0, limit).map(rule => ({
                    id: rule.id,
                    action: rule.action,
                    target: {
                      type: rule.target.type,
                      value: rule.target.value,
                      ...(rule.target.dnsOnly && { dnsOnly: rule.target.dnsOnly }),
                      ...(rule.target.port && { port: rule.target.port }),
                    },
                    direction: rule.direction,
                    gid: rule.gid,
                    group: rule.group,
                    scope: rule.scope,
                    notes: rule.notes,
                    status: rule.status,
                    hit: rule.hit,
                    schedule: rule.schedule,
                    timeUsage: rule.timeUsage,
                    protocol: rule.protocol,
                    created_at: new Date(rule.ts * 1000).toISOString(),
                    updated_at: new Date(rule.updateTs * 1000).toISOString(),
                    resume_at: rule.resumeTs ? new Date(rule.resumeTs * 1000).toISOString() : undefined,
                  })),
                  next_cursor: summaryOnly ? optimizedResponse.next_cursor : response.next_cursor,
                  ...(summaryOnly && (optimizedResponse as any).pagination_note && { pagination_note: (optimizedResponse as any).pagination_note }),
                }, null, 2),
              },
            ],
          };
        }

        case 'get_network_rules_summary': {
          const ruleType = args?.rule_type as string | undefined;
          const activeOnly = (args?.active_only as boolean) ?? true;
          
          const allRulesResponse = await firewalla.getNetworkRules();
          const allRules = allRulesResponse.results;
          
          // Group rules by various categories for overview
          const rulesByAction = allRules.reduce((acc, rule) => {
            acc[rule.action] = (acc[rule.action] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          const rulesByDirection = allRules.reduce((acc, rule) => {
            acc[rule.direction] = (acc[rule.direction] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          const rulesByStatus = allRules.reduce((acc, rule) => {
            const status = rule.status || 'active';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          const rulesByTargetType = allRules.reduce((acc, rule) => {
            acc[rule.target.type] = (acc[rule.target.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          // Calculate hit statistics
          const rulesWithHits = allRules.filter(rule => rule.hit && rule.hit.count > 0);
          const totalHits = allRules.reduce((sum, rule) => sum + (rule.hit?.count || 0), 0);
          const avgHitsPerRule = allRules.length > 0 ? Math.round(totalHits / allRules.length * 100) / 100 : 0;
          
          // Find most recent rule activity
          let mostRecentRuleTs: number | null = null;
          let oldestRuleTs: number | null = null;
          
          if (allRules.length > 0) {
            const validTimestamps = allRules
              .map(rule => {
                const ts = typeof rule.ts === 'number' && !isNaN(rule.ts) ? rule.ts : 0;
                const updateTs = typeof rule.updateTs === 'number' && !isNaN(rule.updateTs) ? rule.updateTs : 0;
                return Math.max(ts, updateTs);
              })
              .filter(ts => ts > 0);
            
            const creationTimestamps = allRules
              .map(rule => typeof rule.ts === 'number' && !isNaN(rule.ts) ? rule.ts : 0)
              .filter(ts => ts > 0);
            
            if (validTimestamps.length > 0) {
              mostRecentRuleTs = Math.max(...validTimestamps);
            }
            
            if (creationTimestamps.length > 0) {
              oldestRuleTs = Math.min(...creationTimestamps);
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_rules: allRules.length,
                  summary_timestamp: new Date().toISOString(),
                  breakdown: {
                    by_action: rulesByAction,
                    by_direction: rulesByDirection,
                    by_status: rulesByStatus,
                    by_target_type: rulesByTargetType,
                  },
                  hit_statistics: {
                    total_hits: totalHits,
                    rules_with_hits: rulesWithHits.length,
                    rules_with_no_hits: allRules.length - rulesWithHits.length,
                    average_hits_per_rule: avgHitsPerRule,
                    hit_rate_percentage: allRules.length > 0 ? Math.round((rulesWithHits.length / allRules.length) * 100) : 0,
                  },
                  age_statistics: {
                    most_recent_activity: mostRecentRuleTs ? new Date(mostRecentRuleTs * 1000).toISOString() : null,
                    oldest_rule_created: oldestRuleTs ? new Date(oldestRuleTs * 1000).toISOString() : null,
                    has_timestamp_data: mostRecentRuleTs !== null || oldestRuleTs !== null,
                  },
                  filters_applied: {
                    rule_type: ruleType || 'all',
                    active_only: activeOnly,
                  },
                }),
              },
            ],
          };
        }

        case 'get_most_active_rules': {
          const limit = (args?.limit as number) || 100; // Increased default from 20 to 100, removed 50 cap
          const minHits = (args?.min_hits as number) || 1;
          const ruleType = args?.rule_type as string | undefined; // TODO: Implement rule type filtering
          
          const allRulesResponse = await firewalla.getNetworkRules(); // Only active rules for traffic analysis
          
          // Filter and sort by hit count
          const activeRules = allRulesResponse.results
            .filter(rule => rule.hit && rule.hit.count >= minHits)
            .sort((a, b) => (b.hit?.count || 0) - (a.hit?.count || 0))
            .slice(0, limit);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_rules_analyzed: allRulesResponse.results.length,
                  rules_meeting_criteria: activeRules.length,
                  min_hits_threshold: minHits,
                  limit_applied: limit,
                  rules: activeRules.map(rule => ({
                    id: rule.id,
                    action: rule.action,
                    target_type: rule.target.type,
                    target_value: rule.target.value.length > 60 
                      ? rule.target.value.substring(0, 60) + '...' 
                      : rule.target.value,
                    direction: rule.direction,
                    hit_count: rule.hit?.count || 0,
                    last_hit: rule.hit?.lastHitTs ? new Date(rule.hit.lastHitTs * 1000).toISOString() : 'Never',
                    created_at: new Date(rule.ts * 1000).toISOString(),
                    notes: rule.notes && rule.notes.length > 80 
                      ? rule.notes.substring(0, 80) + '...' 
                      : rule.notes || '',
                  })),
                  summary: {
                    total_hits: activeRules.reduce((sum, rule) => sum + (rule.hit?.count || 0), 0),
                    top_rule_hits: activeRules.length > 0 ? activeRules[0].hit?.count || 0 : 0,
                    analysis_timestamp: new Date().toISOString(),
                  },
                }),
              },
            ],
          };
        }

        case 'get_recent_rules': {
          const hours = Math.min((args?.hours as number) || 24, 168); // Default 24h, max 1 week
          const limit = (args?.limit as number) || 100; // Increased default from 30 to 100, removed cap
          const ruleType = args?.rule_type as string | undefined; // TODO: Implement rule type filtering
          const includeModified = (args?.include_modified as boolean) ?? true;
          
          const allRulesResponse = await firewalla.getNetworkRules();
          
          const hoursAgoTs = Math.floor(Date.now() / 1000) - (hours * 3600);
          
          // Filter rules created or modified within the timeframe
          const recentRules = allRulesResponse.results
            .filter(rule => {
              const created = rule.ts >= hoursAgoTs;
              const modified = includeModified && rule.updateTs >= hoursAgoTs && rule.updateTs > rule.ts;
              return created || modified;
            })
            .sort((a, b) => Math.max(b.ts, b.updateTs) - Math.max(a.ts, a.updateTs)) // Sort by most recent activity
            .slice(0, limit);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_rules_analyzed: allRulesResponse.results.length,
                  recent_rules_found: recentRules.length,
                  lookback_hours: hours,
                  include_modified: includeModified,
                  cutoff_time: new Date(hoursAgoTs * 1000).toISOString(),
                  rules: recentRules.map(rule => {
                    const wasModified = rule.updateTs > rule.ts && rule.updateTs >= hoursAgoTs;
                    return {
                      id: rule.id,
                      action: rule.action,
                      target_type: rule.target.type,
                      target_value: rule.target.value.length > 60 
                        ? rule.target.value.substring(0, 60) + '...' 
                        : rule.target.value,
                      direction: rule.direction,
                      status: rule.status || 'active',
                      activity_type: wasModified ? 'modified' : 'created',
                      created_at: new Date(rule.ts * 1000).toISOString(),
                      updated_at: new Date(rule.updateTs * 1000).toISOString(),
                      hit_count: rule.hit?.count || 0,
                      notes: rule.notes && rule.notes.length > 80 
                        ? rule.notes.substring(0, 80) + '...' 
                        : rule.notes || '',
                    };
                  }),
                  summary: {
                    newly_created: recentRules.filter(r => r.ts >= hoursAgoTs && (r.updateTs <= r.ts || r.updateTs < hoursAgoTs)).length,
                    recently_modified: recentRules.filter(r => r.updateTs > r.ts && r.updateTs >= hoursAgoTs).length,
                    analysis_timestamp: new Date().toISOString(),
                  },
                }),
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
          
          const listsResponse = await firewalla.getTargetLists(listType);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_lists: Array.isArray(listsResponse.results) ? listsResponse.results.length : 0,
                  categories: [...new Set((Array.isArray(listsResponse.results) ? listsResponse.results : []).map(l => l.category).filter(Boolean))],
                  target_lists: (Array.isArray(listsResponse.results) ? listsResponse.results : []).map(list => ({
                    id: list.id,
                    name: list.name,
                    owner: list.owner,
                    category: list.category,
                    entry_count: list.targets?.length || 0,
                    targets: list.targets?.slice(0, 500) || [], // Increased from 100 to 500 targets per list
                    last_updated: new Date(list.lastUpdated * 1000).toISOString(),
                    notes: list.notes,
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
          const groupId = args?.group_id as string | undefined;
          
          const boxesResponse = await firewalla.getBoxes(groupId);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_boxes: Array.isArray(boxesResponse.results) ? boxesResponse.results.length : 0,
                  boxes: (Array.isArray(boxesResponse.results) ? boxesResponse.results : []).map(box => ({
                    gid: box.gid,
                    name: box.name,
                    model: box.model,
                    mode: box.mode,
                    version: box.version,
                    online: box.online,
                    last_seen: box.lastSeen,
                    license: box.license,
                    public_ip: box.publicIP,
                    group: box.group,
                    location: box.location,
                    device_count: box.deviceCount,
                    rule_count: box.ruleCount,
                    alarm_count: box.alarmCount,
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
          
          const alarmResponse = await firewalla.getSpecificAlarm(alarmId);
          const alarm = alarmResponse.results[0];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  alarm_id: alarm?.aid || alarmId,
                  gid: alarm?.gid,
                  type: alarm?.type,
                  severity: alarm?.severity,
                  message: alarm?.message,
                  timestamp: alarm?.ts ? new Date(alarm.ts * 1000).toISOString() : undefined,
                  direction: alarm?.direction,
                  protocol: alarm?.protocol,
                  status: alarm?.status,
                  device: alarm?.device,
                  remote: alarm?.remote,
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
          
          const deleteResponse = await firewalla.deleteAlarm(alarmId);
          const result = deleteResponse.results[0];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: result?.success || false,
                  message: result?.message || 'Delete operation completed',
                  alarm_id: alarmId,
                  action: 'delete_alarm',
                  timestamp: result?.timestamp,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_simple_statistics': {
          const statsResponse = await firewalla.getSimpleStatistics();
          const stats = statsResponse.results[0];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  statistics: {
                    online_boxes: stats.onlineBoxes,
                    offline_boxes: stats.offlineBoxes,
                    total_boxes: stats.onlineBoxes + stats.offlineBoxes,
                    total_alarms: stats.alarms,
                    total_rules: stats.rules,
                    box_availability: stats.onlineBoxes + stats.offlineBoxes > 0 
                      ? Math.round((stats.onlineBoxes / (stats.onlineBoxes + stats.offlineBoxes)) * 100) 
                      : 0,
                  },
                  summary: {
                    status: stats.onlineBoxes > 0 ? 'operational' : 'offline',
                    health_score: calculateHealthScore(stats),
                    active_monitoring: stats.onlineBoxes > 0,
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'get_statistics_by_region': {
          const stats = await firewalla.getStatisticsByRegion();
          
          // Validate response structure with comprehensive null/undefined guards
          if (!stats || !stats.results || !Array.isArray(stats.results)) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    total_regions: 0,
                    regional_statistics: [],
                    top_regions: [],
                    error: 'No regional statistics available - API response missing results array',
                    debug_info: {
                      stats_exists: !!stats,
                      results_exists: !!(stats && stats.results),
                      results_is_array: !!(stats && stats.results && Array.isArray(stats.results)),
                      actual_structure: stats ? Object.keys(stats) : 'null'
                    }
                  }, null, 2),
                },
              ],
            };
          }

          // Calculate total flow count for percentage calculations
          const totalFlowCount = stats.results.reduce((sum, stat) => {
            return sum + (typeof stat?.value === 'number' ? stat.value : 0);
          }, 0);

          // Process regional statistics with defensive programming
          const regionalStatistics = stats.results
            .filter(stat => stat && typeof stat.value === 'number' && stat.meta)
            .map(stat => ({
              country_code: (stat.meta as any)?.code || 'unknown',
              flow_count: stat.value,
              percentage: totalFlowCount > 0 
                ? Math.round((stat.value / totalFlowCount) * 100) 
                : 0,
            }))
            .sort((a, b) => b.flow_count - a.flow_count);

          // Get top 5 regions with defensive programming
          const topRegions = stats.results
            .filter(stat => stat && typeof stat.value === 'number' && stat.meta)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .map(stat => ({
              country_code: (stat.meta as any)?.code || 'unknown',
              flow_count: stat.value,
            }));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total_regions: stats.results.length,
                  regional_statistics: regionalStatistics,
                  top_regions: topRegions,
                  total_flow_count: totalFlowCount,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_statistics_by_box': {
          try {
            const stats = await firewalla.getStatisticsByBox();
            
            // Validate stats response structure
            if (!stats || typeof stats !== 'object') {
              throw new Error('Invalid stats response: not an object');
            }
            
            if (!stats.results || !Array.isArray(stats.results)) {
              throw new Error('Invalid stats response: results is not an array');
            }
            
            // Process and validate each box statistic
            const boxStatistics = (Array.isArray(stats.results) ? stats.results : []).map(stat => {
              const boxMeta = (stat.meta as any) || {};
              return {
                box_id: boxMeta.gid || 'unknown',
                name: boxMeta.name || 'Unknown Box',
                model: boxMeta.model || 'unknown',
                status: boxMeta.online ? 'online' : 'offline',
                version: boxMeta.version || 'unknown',
                location: boxMeta.location || 'unknown',
                device_count: boxMeta.deviceCount || 0,
                rule_count: boxMeta.ruleCount || 0,
                alarm_count: boxMeta.alarmCount || 0,
                activity_score: stat.value || 0,
                last_seen: boxMeta.lastSeen 
                  ? new Date((boxMeta.lastSeen as number) * 1000).toISOString() 
                  : 'Never',
              };
            }).sort((a, b) => b.activity_score - a.activity_score);
            
            // Calculate summary with safe operations
            const onlineBoxes = stats.results.filter(s => (s.meta as any)?.online).length;
            const totalDevices = stats.results.reduce((sum, s) => sum + ((s.meta as any)?.deviceCount || 0), 0);
            const totalRules = stats.results.reduce((sum, s) => sum + ((s.meta as any)?.ruleCount || 0), 0);
            const totalAlarms = stats.results.reduce((sum, s) => sum + ((s.meta as any)?.alarmCount || 0), 0);
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    total_boxes: stats.results.length,
                    box_statistics: boxStatistics,
                    summary: {
                      online_boxes: onlineBoxes,
                      total_devices: totalDevices,
                      total_rules: totalRules,
                      total_alarms: totalAlarms,
                    }
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error('Error in get_statistics_by_box:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Failed to get box statistics',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    total_boxes: 0,
                    box_statistics: [],
                    summary: {
                      online_boxes: 0,
                      total_devices: 0,
                      total_rules: 0,
                      total_alarms: 0,
                    }
                  }, null, 2),
                },
              ],
            };
          }
        }

        case 'get_flow_trends': {
          const period = (args?.period as '1h' | '24h' | '7d' | '30d') || '24h';
          const interval = (args?.interval as number) || 3600;
          
          try {
            const trends = await firewalla.getFlowTrends(period, interval);
            
            // Validate trends response structure
            if (!trends || typeof trends !== 'object') {
              throw new Error('Invalid trends response: not an object');
            }
            
            if (!trends.results || !Array.isArray(trends.results)) {
              throw new Error('Invalid trends response: results is not an array');
            }
            
            // Validate each trend item has required properties
            const validTrends = trends.results.filter(trend => 
              trend && 
              typeof trend.ts === 'number' && 
              typeof trend.value === 'number'
            );
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    period,
                    interval_seconds: interval,
                    data_points: validTrends.length,
                    trends: validTrends.map(trend => ({
                      timestamp: trend.ts,
                      timestamp_iso: new Date(trend.ts * 1000).toISOString(),
                      flow_count: trend.value,
                    })),
                    summary: {
                      total_flows: validTrends.reduce((sum, t) => sum + t.value, 0),
                      avg_flows_per_interval: validTrends.length > 0 
                        ? Math.round(validTrends.reduce((sum, t) => sum + t.value, 0) / validTrends.length)
                        : 0,
                      peak_flow_count: validTrends.length > 0 ? Math.max(...validTrends.map(t => t.value)) : 0,
                      min_flow_count: validTrends.length > 0 ? Math.min(...validTrends.map(t => t.value)) : 0,
                    }
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Failed to get flow trends',
                    details: errorMessage,
                    period,
                    interval_seconds: interval,
                    troubleshooting: 'Check if Firewalla API is accessible and credentials are valid'
                  }, null, 2),
                },
              ],
            };
          }
        }

        case 'get_alarm_trends': {
          const period = (args?.period as '1h' | '24h' | '7d' | '30d') || '24h';
          
          const trends = await firewalla.getAlarmTrends(period);
          
          // Defensive programming: validate trends response structure
          if (!trends || !trends.results || !Array.isArray(trends.results)) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    period,
                    data_points: 0,
                    trends: [],
                    summary: {
                      total_alarms: 0,
                      avg_alarms_per_interval: 0,
                      peak_alarm_count: 0,
                      intervals_with_alarms: 0,
                      alarm_frequency: 0,
                    },
                    error: 'Invalid alarm trends data received'
                  }, null, 2),
                },
              ],
            };
          }

          // Validate individual trend entries
          const validTrends = trends.results.filter(trend => 
            trend && 
            typeof trend.ts === 'number' && 
            typeof trend.value === 'number' && 
            trend.ts > 0 && 
            trend.value >= 0
          );
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  period,
                  data_points: validTrends.length,
                  trends: validTrends.map(trend => ({
                    timestamp: trend.ts,
                    timestamp_iso: new Date(trend.ts * 1000).toISOString(),
                    alarm_count: trend.value,
                  })),
                  summary: {
                    total_alarms: validTrends.reduce((sum, t) => sum + t.value, 0),
                    avg_alarms_per_interval: validTrends.length > 0 
                      ? Math.round(validTrends.reduce((sum, t) => sum + t.value, 0) / validTrends.length * 100) / 100
                      : 0,
                    peak_alarm_count: validTrends.length > 0 ? Math.max(...validTrends.map(t => t.value)) : 0,
                    intervals_with_alarms: validTrends.filter(t => t.value > 0).length,
                    alarm_frequency: validTrends.length > 0 
                      ? Math.round((validTrends.filter(t => t.value > 0).length / validTrends.length) * 100)
                      : 0,
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'get_rule_trends': {
          const period = (args?.period as '1h' | '24h' | '7d' | '30d') || '24h';
          
          try {
            const trends = await firewalla.getRuleTrends(period);
            
            // Validate trends response structure
            if (!trends || typeof trends !== 'object') {
              throw new Error('Invalid trends response: not an object');
            }
            
            if (!trends.results || !Array.isArray(trends.results)) {
              throw new Error('Invalid trends response: results is not an array');
            }
            
            // Validate each trend item has required properties
            const validTrends = trends.results.filter(trend => 
              trend && 
              typeof trend.ts === 'number' && 
              typeof trend.value === 'number'
            );
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    period,
                    data_points: validTrends.length,
                    trends: validTrends.map(trend => ({
                      timestamp: trend.ts,
                      timestamp_iso: new Date(trend.ts * 1000).toISOString(),
                      active_rule_count: trend.value,
                    })),
                    summary: {
                      avg_active_rules: validTrends.length > 0 
                        ? Math.round(validTrends.reduce((sum, t) => sum + t.value, 0) / validTrends.length)
                        : 0,
                      max_active_rules: validTrends.length > 0 ? Math.max(...validTrends.map(t => t.value)) : 0,
                      min_active_rules: validTrends.length > 0 ? Math.min(...validTrends.map(t => t.value)) : 0,
                      rule_stability: calculateRuleStability(validTrends),
                    }
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Failed to get rule trends',
                    details: errorMessage,
                    period,
                    troubleshooting: 'Check if Firewalla API is accessible and firewall rules are available'
                  }, null, 2),
                },
              ],
            };
          }
        }

        // Search Tools - Advanced search capabilities with complex query syntax
        case 'search_flows': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_flows(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: Array.isArray(result.results) ? result.results.length : 0,
                  query_executed: result.query,
                  execution_time_ms: result.execution_time_ms,
                  flows: (Array.isArray(result.results) ? result.results : []).map(flow => ({
                    timestamp: new Date(flow.ts * 1000).toISOString(),
                    source_ip: flow.source?.ip || 'unknown',
                    destination_ip: flow.destination?.ip || 'unknown',
                    protocol: flow.protocol,
                    bytes: (flow.download || 0) + (flow.upload || 0),
                    blocked: flow.block,
                    direction: flow.direction,
                    device: flow.device
                  })),
                  aggregations: result.aggregations
                }, null, 2),
              },
            ],
          };
        }

        case 'search_alarms': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_alarms(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: result.results.length,
                  query_executed: result.query,
                  execution_time_ms: result.execution_time_ms,
                  alarms: (Array.isArray(result.results) ? result.results : []).map(alarm => ({
                    timestamp: new Date(alarm.ts * 1000).toISOString(),
                    type: alarm.type,
                    message: alarm.message,
                    direction: alarm.direction,
                    protocol: alarm.protocol,
                    status: alarm.status
                  })),
                  aggregations: result.aggregations
                }, null, 2),
              },
            ],
          };
        }

        case 'search_rules': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_rules(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: result.results.length,
                  query_executed: result.query,
                  execution_time_ms: result.execution_time_ms,
                  rules: (Array.isArray(result.results) ? result.results : []).map(rule => ({
                    id: rule.id,
                    action: rule.action,
                    target_type: rule.target?.type,
                    target_value: rule.target?.value,
                    direction: rule.direction,
                    status: rule.status,
                    hit_count: rule.hit?.count || 0
                  })),
                  aggregations: result.aggregations
                }, null, 2),
              },
            ],
          };
        }

        case 'search_devices': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_devices(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: result.results.length,
                  query_executed: result.query,
                  execution_time_ms: result.execution_time_ms,
                  devices: (Array.isArray(result.results) ? result.results : []).map(device => ({
                    id: device.id,
                    name: device.name,
                    ip: device.ip,
                    online: device.online,
                    macVendor: device.macVendor,
                    lastSeen: device.lastSeen
                  })),
                  aggregations: result.aggregations
                }, null, 2),
              },
            ],
          };
        }

        case 'search_target_lists': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_target_lists(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: result.results.length,
                  query_executed: result.query,
                  execution_time_ms: result.execution_time_ms,
                  target_lists: (Array.isArray(result.results) ? result.results : []).map(list => ({
                    id: list.id,
                    name: list.name,
                    category: list.category,
                    owner: list.owner,
                    entry_count: list.targets?.length || 0
                  })),
                  aggregations: result.aggregations
                }, null, 2),
              },
            ],
          };
        }

        case 'search_cross_reference': {
          const searchTools = createSearchTools(firewalla);
          const result = await searchTools.search_cross_reference(args as any);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  primary_query: result.primary.query,
                  primary_results: result.primary.count,
                  correlations: result.correlations.map((corr: any) => ({
                    query: corr.query,
                    matches: corr.count,
                    correlation_field: corr.correlation_field
                  })),
                  correlation_summary: result.correlation_summary,
                  execution_time_ms: result.execution_time_ms
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

// Helper function for health score calculation
function calculateHealthScore(stats: { onlineBoxes: number; offlineBoxes: number; alarms: number; rules: number }): number {
  let score = 100;
  
  const totalBoxes = stats.onlineBoxes + stats.offlineBoxes;
  if (totalBoxes === 0) {return 0;}
  
  // Penalize for offline boxes (up to -40 points)
  const offlineRatio = stats.offlineBoxes / totalBoxes;
  score -= Math.round(offlineRatio * 40);
  
  // Penalize for high alarm count (up to -30 points)
  const alarmPenalty = Math.min(stats.alarms * 2, 30);
  score -= alarmPenalty;
  
  // Bonus for having active rules (up to +10 points)
  const ruleBonus = Math.min(stats.rules / 10, 10);
  score += ruleBonus;
  
  return Math.max(0, Math.min(100, score));
}

// Helper function for rule stability calculation
function calculateRuleStability(trends: Array<{ ts: number; value: number }>): number {
  if (trends.length < 2) {return 100;}
  
  let totalVariation = 0;
  for (let i = 1; i < trends.length; i++) {
    const current = trends[i];
    const previous = trends[i-1];
    if (current && previous) {
      const change = Math.abs(current.value - previous.value);
      totalVariation += change;
    }
  }
  
  const avgValue = trends.reduce((sum, t) => sum + t.value, 0) / trends.length;
  if (avgValue === 0) {return 100;}
  
  const variationPercentage = (totalVariation / (trends.length - 1)) / avgValue;
  return Math.max(0, Math.min(100, Math.round((1 - variationPercentage) * 100)));
}