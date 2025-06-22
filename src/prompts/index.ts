import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaClient } from '../firewalla/client.js';

/**
 * Sets up MCP prompts for Firewalla security analysis
 * Provides intelligent prompts that generate comprehensive security reports
 * 
 * Available prompts:
 * - security_report: Comprehensive security status and threat analysis
 * - threat_analysis: Detailed analysis of security threats and incidents
 * - bandwidth_analysis: Network bandwidth usage patterns and insights
 * - device_investigation: Deep dive into specific device security posture
 * - network_health_check: Overall network health and performance assessment
 * 
 * @param server - MCP server instance to register prompts with
 * @param firewalla - Firewalla client for API communication
 */
export function setupPrompts(server: Server, firewalla: FirewallaClient): void {
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
            firewalla.getRecentThreats(period === '24h' ? 24 : period === '7d' ? 168 : 720),
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

**Active Alarms (${alarms.length}):**
${alarms.slice(0, 10).map(alarm => 
  `- ${alarm.severity.toUpperCase()}: ${alarm.description} (${alarm.timestamp})`
).join('\\n')}

**Recent Threats (${threats.length}):**
${threats.slice(0, 10).map(threat => 
  `- ${threat.type}: ${threat.source_ip} → ${threat.destination_ip} (${threat.action_taken})`
).join('\\n')}

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
          const severityThreshold = (args?.severity_threshold as string) || 'medium';
          
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
${alarms.map(alarm => 
  `- [${alarm.severity}] ${alarm.type}: ${alarm.description}
    Source: ${alarm.source_ip || 'N/A'} → Destination: ${alarm.destination_ip || 'N/A'}
    Time: ${alarm.timestamp}`
).join('\\n\\n')}

**Recent Threat Patterns:**
- Total threats in 24h: ${threats.length}
- Unique source IPs: ${new Set(threats.map(t => t.source_ip)).size}
- Most common threat types: ${Object.entries(threatPatterns.byType).slice(0, 3).map(([type, count]) => `${type} (${count})`).join(', ')}
- Attack time distribution: ${JSON.stringify(threatPatterns.timeDistribution)}

**Current Rule Status:**
- Active rules: ${rules.filter(r => r.status === 'active').length}
- Paused rules: ${rules.filter(r => r.status === 'paused').length}

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
          const thresholdMb = typeof args?.threshold_mb === 'number' ? args.threshold_mb : 100;
          
          if (!period) {
            throw new Error('Period parameter is required for bandwidth analysis');
          }

          const [usage, devices, flows] = await Promise.all([
            firewalla.getBandwidthUsage(period, 20),
            firewalla.getDeviceStatus(),
            firewalla.getFlowData(undefined, undefined, 100),
          ]);

          const highUsageDevices = usage.filter(u => u.total_bytes > thresholdMb * 1024 * 1024);
          const flowAnalysis = analyzeFlowPatterns(flows.flows.map(f => ({ 
            protocol: f.protocol, 
            duration: f.duration || 0, 
            timestamp: new Date(f.ts * 1000).toISOString() 
          })));

          const prompt = `# Bandwidth Usage Analysis (${period})

## Network Usage Overview
Analyze bandwidth consumption patterns and identify optimization opportunities:

**Top Bandwidth Consumers (>${thresholdMb}MB):**
${highUsageDevices.map(device => 
  `- ${device.device_name} (${device.ip_address})
    Total: ${Math.round(device.total_bytes / (1024 * 1024))}MB
    Upload: ${Math.round(device.bytes_uploaded / (1024 * 1024))}MB
    Download: ${Math.round(device.bytes_downloaded / (1024 * 1024))}MB
    Ratio: ${(device.bytes_uploaded / Math.max(device.bytes_downloaded, 1)).toFixed(2)}`
).join('\\n\\n')}

**Network Flow Analysis:**
- Total flows analyzed: ${flows.flows.length}
- Unique protocols: ${flowAnalysis.protocols.length}
- Top protocols: ${flowAnalysis.protocols.slice(0, 5).join(', ')}
- Average flow duration: ${flowAnalysis.avgDuration}s
- Peak bandwidth periods: ${JSON.stringify(flowAnalysis.peakPeriods)}

**Device Status Context:**
- Total devices: ${devices.length}
- Online devices: ${devices.filter(d => d.online).length}
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
          const lookbackHours = typeof args?.lookback_hours === 'number' ? args.lookback_hours : 24;
          
          if (!deviceId) {
            throw new Error('Device ID parameter is required for device investigation');
          }

          const [devices, flows, alarms] = await Promise.all([
            firewalla.getDeviceStatus(deviceId),
            firewalla.getFlowData(undefined, undefined, 200),
            firewalla.getActiveAlarms(),
          ]);

          const targetDevice = devices.find(d => d.id === deviceId);
          if (!targetDevice) {
            throw new Error(`Device with ID ${deviceId} not found`);
          }

          const deviceFlows = flows.flows.filter(f => 
            f.source?.ip === targetDevice.ip || f.destination?.ip === targetDevice.ip ||
            f.device.ip === targetDevice.ip
          );
          const deviceAlarms = alarms.filter(a => 
            a.source_ip === targetDevice.ip || a.destination_ip === targetDevice.ip
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
- Last Seen: ${targetDevice.lastSeen ? new Date(targetDevice.lastSeen * 1000).toISOString() : 'Never'}

**Network Activity (${lookbackHours}h lookback):**
- Total flows involving this device: ${deviceFlows.length}
- Outbound connections: ${deviceFlows.filter(f => f.source?.ip === targetDevice.ip || f.device.ip === targetDevice.ip).length}
- Inbound connections: ${deviceFlows.filter(f => f.destination?.ip === targetDevice.ip).length}
- Data transferred: ${deviceFlows.reduce((sum, f) => sum + ((f.download || 0) + (f.upload || 0)), 0)} bytes
- Unique remote IPs: ${new Set(deviceFlows.map(f => 
  f.source?.ip === targetDevice.ip ? f.destination?.ip : f.source?.ip
).filter(Boolean)).size}

**Security Alerts:**
${deviceAlarms.length > 0 ? 
  deviceAlarms.map(alarm => 
    `- [${alarm.severity}] ${alarm.type}: ${alarm.description} (${alarm.timestamp})`
  ).join('\\n') : 
  'No security alerts found for this device'
}

**Connection Patterns:**
${deviceFlows.slice(0, 10).map(flow => 
  `- ${flow.source?.ip || 'N/A'} → ${flow.destination?.ip || 'N/A'} (${flow.protocol})
    ${((flow.download || 0) + (flow.upload || 0))} bytes, ${flow.count} packets, ${flow.duration || 0}s duration`
).join('\\n')}

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
          const [summary, devices, metrics, topology, rules] = await Promise.all([
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
- Total Devices: ${devices.length}
- Online: ${devices.filter(d => d.online).length} (${Math.round(devices.filter(d => d.online).length / devices.length * 100)}%)
- Offline: ${devices.filter(d => !d.online).length}
- Subnets: ${topology.subnets.length}
- Active Connections: ${summary.active_connections}

**Security Posture:**
- Threat Level: ${metrics.threat_level}
- Active Alarms: ${metrics.active_alarms}
- Blocked Attempts: ${summary.blocked_attempts}
- Active Rules: ${rules.filter(r => r.status === 'active' || !r.status).length}
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
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

// Helper functions for analysis
function analyzeThreatPatterns(threats: Array<{ type: string; timestamp: string; severity: string }>) {
  const byType = threats.reduce((acc, threat) => {
    acc[threat.type] = (acc[threat.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const timeDistribution = threats.reduce((acc, threat) => {
    const hour = new Date(threat.timestamp).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return { byType, timeDistribution };
}

function analyzeAlarmPatterns(alarms: Array<{ type: string; severity: string; source_ip?: string }>) {
  const bySeverity = alarms.reduce((acc, alarm) => {
    acc[alarm.severity] = (acc[alarm.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byType = alarms.reduce((acc, alarm) => {
    acc[alarm.type] = (acc[alarm.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return { bySeverity, byType };
}

function analyzeFlowPatterns(flows: Array<{ protocol: string; duration: number; timestamp: string }>) {
  const protocols = [...new Set(flows.map(f => f.protocol))];
  const avgDuration = flows.reduce((sum, f) => sum + f.duration, 0) / flows.length;
  
  const hourlyDistribution = flows.reduce((acc, flow) => {
    const hour = new Date(flow.timestamp).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const peakPeriods = Object.entries(hourlyDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`);

  return { protocols, avgDuration: Math.round(avgDuration), peakPeriods };
}

function calculateNetworkHealthScore(data: {
  summary: { status: string; cpu_usage: number; memory_usage: number; uptime: number };
  devices: Array<{ online: boolean }>;
  metrics: { active_alarms: number; threat_level: string };
  topology: { subnets: unknown[] };
  rules: Array<{ status?: string }>;
}): number {
  let score = 100;

  // System health (30 points)
  if (data.summary.status !== 'online') score -= 30;
  if (data.summary.cpu_usage > 80) score -= 10;
  if (data.summary.memory_usage > 85) score -= 10;
  if (data.summary.uptime < 86400) score -= 5; // Less than 1 day

  // Connectivity (25 points)
  const onlineRatio = data.devices.filter(d => d.online).length / data.devices.length;
  score -= (1 - onlineRatio) * 25;

  // Security (30 points)
  score -= Math.min(data.metrics.active_alarms * 2, 20);
  const threatPenalty = { low: 0, medium: 5, high: 10, critical: 15 };
  score -= threatPenalty[data.metrics.threat_level as keyof typeof threatPenalty] || 0;

  // Configuration (15 points)
  const activeRules = data.rules.filter(r => r.status === 'active' || !r.status).length;
  if (activeRules === 0) score -= 15;
  if (data.topology.subnets.length === 0) score -= 5;

  return Math.max(0, Math.round(score));
}

function calculatePerformanceScore(summary: { cpu_usage: number; memory_usage: number; status: string }): number {
  if (summary.status !== 'online') return 0;
  const cpuScore = Math.max(0, 100 - summary.cpu_usage);
  const memScore = Math.max(0, 100 - summary.memory_usage);
  return Math.round((cpuScore + memScore) / 2);
}

function calculateSecurityScore(metrics: { blocked_connections: number; active_alarms: number }): number {
  const baseScore = 100;
  const alarmPenalty = metrics.active_alarms * 5;
  const connectionBonus = Math.min(metrics.blocked_connections / 100, 10);
  return Math.max(0, Math.min(100, baseScore - alarmPenalty + connectionBonus));
}