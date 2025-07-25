import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FirewallaClient } from '../firewalla/client.js';
import type { Device, NetworkRule } from '../types.js';
import { unixToISOString, safeUnixToISOString } from '../utils/timestamp.js';

// Type definitions for health score calculation

interface SystemSummary {
  status: string;
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
}

interface SecurityMetrics {
  active_alarms: number;
  threat_level: string;
  blocked_connections?: number;
}

interface NetworkTopology {
  subnets: Array<Record<string, unknown>>;
}

interface HealthScoreData {
  summary: SystemSummary;
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
  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'security_report': {
          const period = (args?.period as string) || '24h';
          // const includeResolved = typeof args?.include_resolved === 'boolean' ? args.include_resolved : false;

          // Gather comprehensive security data
          const [alarms, summary, metrics, threats] = await Promise.all([
            firewalla.getActiveAlarms(),
            firewalla.getFirewallSummary(),
            firewalla.getSecurityMetrics(),
            firewalla.getRecentThreats(getPeriodInHours(period)),
          ]);

          const prompt = `# Firewalla Security Report (${period})

## Executive Summary
Generate a comprehensive security report based on the following data:

**Firewall Status:**
- Status: ${summary.status}
- Uptime: ${Math.floor(summary.uptime / 3600)} hours
- CPU Usage: ${summary.cpu_usage}%
- Memory Usage: ${summary.memory_usage}%
- Active Connections: ${summary.active_connections}
- Blocked Attempts: ${summary.blocked_attempts}

**Security Metrics:**
- Total Alarms: ${metrics.total_alarms}
- Active Alarms: ${metrics.active_alarms}
- Blocked Connections: ${metrics.blocked_connections}
- Threat Level: ${metrics.threat_level}
- Recent Threats: ${threats.length}

**Active Alarms (${alarms.count}):**
${alarms.results
  .slice(0, 10)
  .map(
    alarm => `- ${alarm.type}: ${alarm.message} (${unixToISOString(alarm.ts)})`
  )
  .join('\\n')}

**Recent Threats (${threats.length}):**
${threats
  .slice(0, 10)
  .map(
    threat =>
      `- ${threat.type}: ${threat.source_ip} → ${threat.destination_ip} (${threat.action_taken})`
  )
  .join('\\n')}

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

          const [alarms, threats, rules] = await Promise.all([
            firewalla.getActiveAlarms(severityThreshold),
            firewalla.getRecentThreats(24),
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
  .join('\\n\\n')}

**Recent Threat Patterns:**
- Total threats in 24h: ${threats.length}
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
          const thresholdMb =
            typeof args?.threshold_mb === 'number' ? args.threshold_mb : 100;

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
  .join('\\n\\n')}

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
          const lookbackHours =
            typeof args?.lookback_hours === 'number' ? args.lookback_hours : 24;

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
              f.device.ip === targetDevice.ip
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
- Outbound connections: ${deviceFlows.filter(f => f.source?.ip === targetDevice.ip || f.device.ip === targetDevice.ip).length}
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
        .join('\\n')
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
  .join('\\n')}

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
- Firewall Status: ${summary.status}
- Uptime: ${Math.floor(summary.uptime / 3600)}h (${summary.uptime > 604800 ? '✅' : '⚠️'})
- CPU Usage: ${summary.cpu_usage}% (${summary.cpu_usage < 80 ? '✅' : '⚠️'})
- Memory Usage: ${summary.memory_usage}% (${summary.memory_usage < 85 ? '✅' : '⚠️'})
- Performance Score: ${calculatePerformanceScore(summary)}/100

**Network Connectivity:**
- Total Devices: ${devices.count}
- Online: ${devices.results.filter(d => d.online).length} (${Math.round((devices.results.filter(d => d.online).length / devices.count) * 100)}%)
- Offline: ${devices.results.filter(d => !d.online).length}
- Subnets: ${topology.subnets.length}
- Active Connections: ${summary.active_connections}

**Security Posture:**
- Threat Level: ${metrics.threat_level}
- Active Alarms: ${metrics.active_alarms}
- Blocked Attempts: ${summary.blocked_attempts}
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
 * Calculates an overall network health score based on system status, device connectivity, security metrics, network topology, and rule configuration.
 *
 * The score starts at 100 and deducts points for offline status, high resource usage, short uptime, offline devices, active alarms, threat severity, lack of active rules, and missing subnets. The result is a non-negative integer representing the network's health.
 *
 * @param data - Aggregated network and security data used for scoring
 * @returns The computed network health score as an integer between 0 and 100
 */
function calculateNetworkHealthScore(data: HealthScoreData): number {
  let score = 100;

  // System health (30 points)
  if (data.summary.status !== 'online') {
    score -= 30;
  }
  if (data.summary.cpu_usage > 80) {
    score -= 10;
  }
  if (data.summary.memory_usage > 85) {
    score -= 10;
  }
  if (data.summary.uptime < 86400) {
    score -= 5;
  } // Less than 1 day

  // Connectivity (25 points)
  const onlineRatio =
    data.devices.results.filter(d => d.online).length / data.devices.count;
  score -= (1 - onlineRatio) * 25;

  // Security (30 points)
  score -= Math.min(data.metrics.active_alarms * 2, 20);
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
 * Calculates a performance score for the system based on CPU and memory usage.
 *
 * Returns 0 if the system is not online. Otherwise, computes the score as the average of (100 minus CPU usage) and (100 minus memory usage), rounded to the nearest integer.
 *
 * @param summary - The system summary containing status, CPU usage, and memory usage
 * @returns The calculated performance score, or 0 if the system is offline.
 */
function calculatePerformanceScore(summary: SystemSummary): number {
  if (summary.status !== 'online') {
    return 0;
  }
  const cpuScore = Math.max(0, 100 - summary.cpu_usage);
  const memScore = Math.max(0, 100 - summary.memory_usage);
  return Math.round((cpuScore + memScore) / 2);
}

/**
 * Calculates a security score based on the number of active alarms and blocked connections.
 *
 * The score starts at 100, deducts 5 points for each active alarm, and adds up to 10 bonus points based on the number of blocked connections (1 point per 100 blocked connections, capped at 10). The final score is clamped between 0 and 100.
 *
 * @param metrics - The security metrics containing active alarms and blocked connections
 * @returns The computed security score as an integer between 0 and 100.
 */
function calculateSecurityScore(
  metrics: SecurityMetrics & { blocked_connections: number }
): number {
  const baseScore = 100;
  const alarmPenalty = metrics.active_alarms * 5;
  const connectionBonus = Math.min(metrics.blocked_connections / 100, 10);
  return Math.max(0, Math.min(100, baseScore - alarmPenalty + connectionBonus));
}
