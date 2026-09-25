import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { FirewallaClient } from '../firewalla/client.js';
import type {
  Device,
  FirewallSummary,
  NetworkRule,
  SecurityMetricsSummary,
} from '../types.js';
import { unixToISOString, safeUnixToISOString } from '../utils/timestamp.js';

// Type definitions for health score calculation

interface SecurityMetrics {
  active_alarms: number;
  threat_level: string;
  blocked_connections?: number;
  /** Security Activity (type 1) alarms in the last 24 hours */
  security_alarms?: number;
}

/** getRecentThreats returns at most this many items */
const RECENT_THREATS_LIMIT = 100;

/**
 * A security count as the prompts print it: "at least N" when the API did
 * not total it and the client counted one page
 */
function formatMetric(
  metrics: Partial<SecurityMetricsSummary>,
  field: keyof SecurityMetricsSummary['windows']
): string {
  const value = metrics[field] ?? 0;
  return metrics.lower_bounds?.includes(field)
    ? `at least ${value}`
    : String(value);
}

/** The recent threat count, marked when the list stopped at its limit */
function formatThreatCount(count: number, explain = false): string {
  if (count < RECENT_THREATS_LIMIT) {
    return String(count);
  }
  return explain
    ? `at least ${count} (the list stops at ${RECENT_THREATS_LIMIT})`
    : `at least ${count}`;
}

interface NetworkTopology {
  subnets: Array<Record<string, unknown>>;
}

interface HealthScoreData {
  summary: FirewallSummary;
  devices: {
    count: number;
    results: Device[];
    next_cursor?: string;
    total_count?: number;
    has_more?: boolean;
  };
  metrics: SecurityMetrics;
  topology: NetworkTopology;
  rules: {
    count: number;
    results: NetworkRule[];
    next_cursor?: string;
    total_count?: number;
    has_more?: boolean;
  };
}

/**
 * Registers intelligent prompt handlers on the MCP server for Firewalla security and network analysis.
 *
 * Sets up handlers for various prompt types, including security reports, threat analysis, bandwidth usage, device investigations, and network health checks. Each prompt gathers relevant data from the Firewalla client, formats a comprehensive prompt for analysis, and returns it as a user message. Handles errors by returning descriptive error messages.
 *
 * @param server - The MCP server instance to register prompt handlers with
 * @param firewalla - The Firewalla client used for retrieving security and network data
 */
/**
 * Convert period string to hours for threat lookback
 */
function getPeriodInHours(period: string): number {
  switch (period) {
    case '24h':
      return 24;
    case '7d':
      return 168;
    case '30d':
      return 720;
    default:
      return 720; // Default to 30 days
  }
}

export function setupPrompts(server: Server, firewalla: FirewallaClient): void {
  // Enumerate the available prompts. The server declares the `prompts`
  // capability, so clients call prompts/list at startup -- without this
  // handler they get MCP error -32601.
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'security_report',
        description: 'Comprehensive security report for a time period',
        arguments: [
          { name: 'period', description: "Report period: '24h', '7d' or '30d' (default 24h)", required: false },
        ],
      },
      {
        name: 'threat_analysis',
        description: 'Deep analysis of recent threats and blocked attempts',
        arguments: [
          { name: 'period', description: "Lookback period: '24h', '7d' or '30d' (default 24h)", required: false },
          { name: 'severity_threshold', description: "Minimum alarm severity: 'low', 'medium' or 'high' (default medium)", required: false },
        ],
      },
      {
        name: 'bandwidth_analysis',
        description: 'Top bandwidth consumers and usage patterns',
        arguments: [
          { name: 'period', description: "Analysis period: '24h', '7d' or '30d'", required: true },
          { name: 'threshold_mb', description: 'Highlight devices above this usage in MB (default 100)', required: false },
        ],
      },
      {
        name: 'device_investigation',
        description: 'Investigate a specific device: flows, alarms, behavior',
        arguments: [
          { name: 'device_id', description: 'Device ID (MAC) to investigate', required: true },
          { name: 'lookback_hours', description: 'Hours of history to inspect (default 24)', required: false },
        ],
      },
      {
        name: 'network_health_check',
        description: 'Overall network health: summary, devices, metrics, topology, rules',
        arguments: [],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'security_report': {
          const period = (args?.period as string) || '24h';
          // const includeResolved = typeof args?.include_resolved === 'boolean' ? args.include_resolved : false;

          // Gather comprehensive security data
          const [alarms, summary, metrics, threats] = await Promise.all([
            firewalla.getActiveAlarms(undefined, undefined, 'ts:desc', 10),
            firewalla.getFirewallSummary(),
            firewalla.getSecurityMetrics(),
            firewalla.getRecentThreats(getPeriodInHours(period)),
          ]);

          const prompt = `# Firewalla Security Report (${period})

## Executive Summary
Generate a comprehensive security report based on the following data:

**Firewall Status:** ${summary.status} (${summary.boxes_online} of ${summary.boxes_total} boxes online)
${formatBoxStatusLines(summary)}
- Blocked in the ${summary.recent_flows_sampled} most recent flows: ${summary.blocked_in_sample}

**Security Metrics:**
- Alarms in the last 30 days: ${formatMetric(metrics, 'total_alarms')} (${formatMetric(metrics, 'active_alarms')} active)
- Alarms in the last 24 hours: ${formatMetric(metrics, 'suspicious_activities')}, of which Security Activity: ${formatMetric(metrics, 'security_alarms')}
- Blocked flows in the last 24 hours: ${formatMetric(metrics, 'blocked_connections')}
- Threat Level: ${metrics.threat_level} (from the Security Activity alarms in the last 24 hours)
- Recent Threats: ${formatThreatCount(threats.length, true)}

**Most Recent Alarms (${alarms.results.length} of ${formatMetric(metrics, 'total_alarms')} in the last 30 days):**
${alarms.results
  .slice(0, 10)
  .map(
    alarm => `- ${alarm.type}: ${alarm.message} (${unixToISOString(alarm.ts)})`
  )
  .join('\n')}

**Recent Threats (${formatThreatCount(threats.length)}):**
${threats
  .slice(0, 10)
  .map(
    threat =>
      `- ${threat.type}: ${threat.source_ip} → ${threat.destination_ip} (${threat.action_taken})`
  )
  .join('\n')}

Please analyze this data and provide:
1. Overall security status assessment
2. Key findings and concerns
3. Threat trend analysis
4. Specific recommendations for improvement
5. Priority actions to take`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: prompt,
                },
              },
            ],
          };
        }

        case 'threat_analysis': {
          const severityThreshold =
            (args?.severity_threshold as string) || 'medium';
          const period = (args?.period as string) || '24h';

          const [alarms, threats, rules] = await Promise.all([
            firewalla.getActiveAlarms(severityThreshold),
            firewalla.getRecentThreats(getPeriodInHours(period)),
            firewalla.getNetworkRules(),
          ]);

          const threatPatterns = analyzeThreatPatterns(threats);
          // const alarmPatterns = analyzeAlarmPatterns(alarms);

          const prompt = `# Threat Analysis - Pattern Detection and Response

## Current Threat Landscape
Analyze the following security data to identify patterns, trends, and recommend defensive actions:

**Active Alarms (${severityThreshold}+ severity):**
${(Array.isArray(alarms.results) ? alarms.results : [])
  .map(
    alarm =>
      `- [${alarm.type}] ${alarm.message}
    Source: ${alarm.device?.ip || 'N/A'} → Destination: ${alarm.remote?.ip || 'N/A'}
    Time: ${unixToISOString(alarm.ts)}`
  )
  .join('\n\n')}

**Recent Threat Patterns:**
- Total threats in ${period}: ${threats.length}
- Unique source IPs: ${new Set(threats.map(t => t.source_ip)).size}
- Most common threat types: ${Object.entries(threatPatterns.byType)
            .slice(0, 3)
            .map(([type, count]) => `${type} (${count})`)
            .join(', ')}
- Attack time distribution: ${JSON.stringify(threatPatterns.timeDistribution)}

**Current Rule Status:**
- Active rules: ${rules.results.filter(r => r.status === 'active').length}
- Paused rules: ${rules.results.filter(r => r.status === 'paused').length}

Please provide:
1. Threat pattern analysis and significance
2. Attack vector identification
3. Potential security gaps
4. Recommended rule adjustments
5. Proactive defense strategies
6. Timeline for implementing changes`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: prompt,
                },
              },
            ],
          };
        }

        case 'bandwidth_analysis': {
          const period = args?.period as string;
          // MCP prompt argument values are strings on the wire -- coerce
          const thresholdMbRaw = Number(args?.threshold_mb);
          const thresholdMb =
            Number.isFinite(thresholdMbRaw) && thresholdMbRaw > 0 ? thresholdMbRaw : 100;

          if (!period) {
            throw new Error(
              'Period parameter is required for bandwidth analysis'
            );
          }

          const [usage, devices, flows] = await Promise.all([
            firewalla.getBandwidthUsage(period, 20),
            firewalla.getDeviceStatus(),
            firewalla.getFlowData(undefined, undefined, undefined, 100),
          ]);

          const highUsageDevices = usage.results.filter(
            u => u.total_bytes > thresholdMb * 1024 * 1024
          );
          const flowAnalysis = analyzeFlowPatterns(
            (Array.isArray(flows.results) ? flows.results : []).map(f => ({
              protocol: f.protocol,
              duration: f.duration || 0,
              timestamp: unixToISOString(f.ts),
            }))
          );

          const prompt = `# Bandwidth Usage Analysis (${period})

## Network Usage Overview
Analyze bandwidth consumption patterns and identify optimization opportunities:

**Top Bandwidth Consumers (>${thresholdMb}MB):**
${highUsageDevices
  .map(
    device =>
      `- ${device.device_name} (${device.ip})
    Total: ${Math.round(device.total_bytes / (1024 * 1024))}MB
    Upload: ${Math.round(device.bytes_uploaded / (1024 * 1024))}MB
    Download: ${Math.round(device.bytes_downloaded / (1024 * 1024))}MB
    Ratio: ${(device.bytes_uploaded / Math.max(device.bytes_downloaded, 1)).toFixed(2)}`
  )
  .join('\n\n')}

**Network Flow Analysis:**
- Total flows analyzed: ${flows.count}
- Unique protocols: ${flowAnalysis.protocols.length}
- Top protocols: ${flowAnalysis.protocols.slice(0, 5).join(', ')}
- Average flow duration: ${flowAnalysis.avgDuration}s
- Peak bandwidth periods: ${JSON.stringify(flowAnalysis.peakPeriods)}

**Device Status Context:**
- Total devices: ${devices.count}
- Online devices: ${devices.results.filter(d => d.online).length}
- Devices with high usage: ${highUsageDevices.length}

Please analyze and provide:
1. Bandwidth usage patterns and trends
2. Unusual or suspicious usage identification
3. Network performance impact assessment
4. Device-specific recommendations
5. Optimization strategies
6. Quality of Service (QoS) suggestions`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: prompt,
                },
              },
            ],
          };
        }

        case 'device_investigation': {
          const deviceId = args?.device_id as string;
          // MCP prompt argument values are strings on the wire -- coerce
          const lookbackRaw = Number(args?.lookback_hours);
          const lookbackHours =
            Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? lookbackRaw : 24;

          if (!deviceId) {
            throw new Error(
              'Device ID parameter is required for device investigation'
            );
          }

          const [devices, flows, alarms] = await Promise.all([
            firewalla.getDeviceStatus(),
            firewalla.getFlowData(undefined, undefined, undefined, 200),
            firewalla.getActiveAlarms(),
          ]);

          const targetDevice = devices.results.find(d => d.id === deviceId);
          if (!targetDevice) {
            throw new Error(`Device with ID ${deviceId} not found`);
          }

          const deviceFlows = flows.results.filter(
            f =>
              f.source?.ip === targetDevice.ip ||
              f.destination?.ip === targetDevice.ip ||
              f.device?.ip === targetDevice.ip
          );
          const deviceAlarms = alarms.results.filter(
            a =>
              a.device?.ip === targetDevice.ip ||
              a.remote?.ip === targetDevice.ip
          );

          const prompt = `# Device Investigation Report
## Target Device: ${targetDevice.name} (${targetDevice.ip})

Investigate potential security issues and unusual behavior for this device:

**Device Information:**
- Device ID: ${targetDevice.id}
- Name: ${targetDevice.name}
- IP Address: ${targetDevice.ip}
- MAC Vendor: ${targetDevice.macVendor || 'Unknown'}
- Status: ${targetDevice.online ? 'online' : 'offline'}
- Network: ${targetDevice.network.name}
- Last Seen: ${safeUnixToISOString(targetDevice.lastSeen, 'Never')}

**Network Activity (${lookbackHours}h lookback):**
- Total flows involving this device: ${deviceFlows.length}
- Outbound connections: ${deviceFlows.filter(f => f.source?.ip === targetDevice.ip || f.device?.ip === targetDevice.ip).length}
- Inbound connections: ${deviceFlows.filter(f => f.destination?.ip === targetDevice.ip).length}
- Data transferred: ${deviceFlows.reduce((sum, f) => sum + ((f.download || 0) + (f.upload || 0)), 0)} bytes
- Unique remote IPs: ${
            new Set(
              deviceFlows
                .map(f =>
                  f.source?.ip === targetDevice.ip
                    ? f.destination?.ip
                    : f.source?.ip
                )
                .filter(Boolean)
            ).size
          }

**Security Alerts:**
${
  deviceAlarms.length > 0
    ? deviceAlarms
        .map(
          alarm =>
            `- [${alarm.type}] ${alarm.message} (${unixToISOString(alarm.ts)})`
        )
        .join('\n')
    : 'No security alerts found for this device'
}

**Connection Patterns:**
${deviceFlows
  .slice(0, 10)
  .map(
    flow =>
      `- ${flow.source?.ip || 'N/A'} → ${flow.destination?.ip || 'N/A'} (${flow.protocol})
    ${(flow.download || 0) + (flow.upload || 0)} bytes, ${flow.count} packets, ${flow.duration || 0}s duration`
  )
  .join('\n')}

Please investigate and provide:
1. Device behavior assessment (normal/suspicious)
2. Security risk evaluation
3. Network usage patterns analysis
4. Potential compromise indicators
5. Recommended monitoring or restrictions
6. Follow-up investigation steps if needed`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: prompt,
                },
              },
            ],
          };
        }

        case 'network_health_check': {
          const [summary, devices, metrics, topology, rules] =
            await Promise.all([
              firewalla.getFirewallSummary(),
              firewalla.getDeviceStatus(),
              firewalla.getSecurityMetrics(),
              firewalla.getNetworkTopology(),
              firewalla.getNetworkRules(),
            ]);

          const healthScore = calculateNetworkHealthScore({
            summary,
            devices,
            metrics,
            topology,
            rules,
          });

          const prompt = `# Network Health Assessment

## Comprehensive Network Status Check
Evaluate overall network health and performance:

**System Health:**
- Firewall Status: ${summary.status}, ${summary.boxes_online} of ${summary.boxes_total} boxes online (${summary.status === 'online' ? '✅' : '⚠️'})
${formatBoxStatusLines(summary)}

**Network Connectivity:**
- Total Devices: ${devices.count}
- Online: ${devices.results.filter(d => d.online).length} (${Math.round((devices.results.filter(d => d.online).length / devices.count) * 100)}%)
- Offline: ${devices.results.filter(d => !d.online).length}
- Subnets: ${topology.subnets.length}

**Security Posture:**
- Threat Level: ${metrics.threat_level} (from the Security Activity alarms in the last 24 hours)
- Active Alarms (last 30 days): ${formatMetric(metrics, 'active_alarms')}
- Security Activity Alarms (last 24 hours): ${formatMetric(metrics, 'security_alarms')}
- Blocked in the ${summary.recent_flows_sampled} most recent flows: ${summary.blocked_in_sample}
- Active Rules: ${rules.results.filter(r => r.status === 'active' || !r.status).length}
- Security Score: ${calculateSecurityScore(metrics)}/100

**Overall Health Score: ${healthScore}/100**

Please assess and provide:
1. Overall network health evaluation
2. Performance bottlenecks identification
3. Security posture assessment
4. Connectivity issues analysis
5. Optimization recommendations
6. Maintenance priorities
7. Monitoring improvements needed`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: prompt,
                },
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Error generating prompt '${name}': ${errorMessage}`,
            },
          },
        ],
      };
    }
  });
}

/**
 * Analyzes a list of threats to aggregate counts by threat type and by hour of occurrence.
 *
 * @param threats - Array of threat objects containing type, timestamp, and severity
 * @returns An object with counts of threats by type and a distribution of threats by hour (0–23)
 */
function analyzeThreatPatterns(
  threats: Array<{ type: string; timestamp: string; severity: string }>
): {
  byType: Record<string, number>;
  timeDistribution: Record<number, number>;
} {
  const byType = threats.reduce(
    (acc, threat) => {
      acc[threat.type] = (acc[threat.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const timeDistribution = threats.reduce(
    (acc, threat) => {
      const hour = new Date(threat.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    },
    {} as Record<number, number>
  );

  return { byType, timeDistribution };
}

/**
 * Analyzes network flow data to extract unique protocols, average flow duration, and peak activity periods.
 *
 * @param flows - Array of flow objects containing protocol, duration, and timestamp information
 * @returns An object with a list of unique protocols, the rounded average duration, and up to three peak hourly periods of flow activity
 */
function analyzeFlowPatterns(
  flows: Array<{ protocol: string; duration: number; timestamp: string }>
): { protocols: string[]; avgDuration: number; peakPeriods: string[] } {
  const protocols = [...new Set(flows.map(f => f.protocol))];
  const avgDuration =
    flows.reduce((sum, f) => sum + f.duration, 0) / flows.length;

  const hourlyDistribution = flows.reduce(
    (acc, flow) => {
      const hour = new Date(flow.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    },
    {} as Record<number, number>
  );

  const peakPeriods = Object.entries(hourlyDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`);

  return { protocols, avgDuration: Math.round(avgDuration), peakPeriods };
}

/**
 * One line per box in the firewall summary, for prompt text
 *
 * @param summary - The firewall summary from getFirewallSummary
 * @returns Markdown list lines, one per box
 */
function formatBoxStatusLines(summary: FirewallSummary): string {
  if (summary.boxes.length === 0) {
    return '- No boxes are visible to this MSP token';
  }
  return summary.boxes
    .map(box => {
      const state = box.online
        ? 'online'
        : `offline, last seen ${safeUnixToISOString(box.last_seen, 'unknown')}`;
      return `- ${box.name} (${box.model}, ${box.gid}): ${state}; ${box.device_count} devices, ${box.alarm_count} alarms, ${box.rule_count} rules`;
    })
    .join('\n');
}

/**
 * Calculates an overall network health score based on system status, device connectivity, security metrics, network topology, and rule configuration.
 *
 * The score starts at 100 and deducts points for offline or partly offline boxes, offline devices, Security Activity alarms, threat severity, lack of active rules, and missing subnets. The result is a non-negative integer representing the network's health.
 *
 * @param data - Aggregated network and security data used for scoring
 * @returns The computed network health score as an integer between 0 and 100
 */
function calculateNetworkHealthScore(data: HealthScoreData): number {
  let score = 100;

  // System health (30 points): the MSP API reports box online state, not
  // CPU, memory or uptime
  if (data.summary.status === 'partial') {
    score -= 15;
  } else if (data.summary.status !== 'online') {
    score -= 30;
  }

  // Connectivity (25 points)
  const onlineRatio =
    data.devices.results.filter(d => d.online).length / data.devices.count;
  score -= (1 - onlineRatio) * 25;

  // Security (30 points): Security Activity alarms, not every active alarm;
  // video, gaming and new-device alarms stay active until archived
  score -= Math.min(
    (data.metrics.security_alarms ?? data.metrics.active_alarms) * 2,
    20
  );
  const threatPenalty = { low: 0, medium: 5, high: 10, critical: 15 };
  score -=
    threatPenalty[data.metrics.threat_level as keyof typeof threatPenalty] || 0;

  // Configuration (15 points)
  const activeRules = data.rules.results.filter(
    r => r.status === 'active' || !r.status
  ).length;
  if (activeRules === 0) {
    score -= 15;
  }
  if (data.topology.subnets.length === 0) {
    score -= 5;
  }

  return Math.max(0, Math.round(score));
}

/**
 * Calculates a security score from the Security Activity alarms of the last 24 hours and the blocked connections.
 *
 * The score starts at 100, deducts 5 points for each Security Activity alarm (each active alarm when the metrics have no security_alarms), and adds up to 10 bonus points based on the number of blocked connections (1 point per 100 blocked connections, capped at 10). The final score is clamped between 0 and 100.
 *
 * @param metrics - The security metrics containing security alarms and blocked connections
 * @returns The computed security score as an integer between 0 and 100.
 */
function calculateSecurityScore(
  metrics: SecurityMetrics & { blocked_connections: number }
): number {
  const baseScore = 100;
  const alarmPenalty = (metrics.security_alarms ?? metrics.active_alarms) * 5;
  const connectionBonus = Math.min(metrics.blocked_connections / 100, 10);
  return Math.max(0, Math.min(100, baseScore - alarmPenalty + connectionBonus));
}
