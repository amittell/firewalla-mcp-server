/**
 * @fileoverview MCP Resource handlers for Firewalla data access
 * 
 * Implements URI-based resource endpoints that provide structured, read-only access
 * to Firewalla firewall data through the Model Context Protocol. Resources are
 * designed for dashboard views, status monitoring, and analytical data consumption.
 * 
 * Available resource endpoints:
 * - **firewalla://summary**: Real-time firewall health and performance metrics
 * - **firewalla://devices**: Complete device inventory with status and metadata
 * - **firewalla://metrics/security**: Aggregated security statistics and trends
 * - **firewalla://topology**: Network structure and device relationships
 * - **firewalla://threats/recent**: Latest security events and blocked attempts
 * 
 * Each resource returns formatted JSON with contextual metadata, performance
 * indicators, and actionable insights for Claude's analysis and reporting.
 * 
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FirewallaClient } from '../firewalla/client.js';
import { safeUnixToISOString } from '../utils/timestamp.js';

/**
 * Registers MCP resource handlers on the server to provide structured Firewalla firewall data via URI-based endpoints
 * 
 * Sets up read-only resource endpoints that respond to MCP ReadResourceRequest messages.
 * Each URI maps to a specific Firewalla data source and returns formatted JSON responses
 * with enriched metadata for analytical purposes.
 * 
 * Resource responses include:
 * - Raw data from Firewalla APIs
 * - Calculated metrics and performance indicators
 * - Status summaries and health scores
 * - Formatted timestamps and human-readable values
 * - Error handling with detailed diagnostic information
 * 
 * @param server - The MCP server instance to register handlers on
 * @param firewalla - The Firewalla client for API access
 * @returns {void}
 * 
 * @example
 * ```typescript
 * const server = new Server({ name: 'firewalla' });
 * const client = new FirewallaClient(config);
 * setupResources(server, client);
 * ```
 */
export function setupResources(server: Server, firewalla: FirewallaClient): void {
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      switch (uri) {
        case 'firewalla://summary': {
          const summary = await firewalla.getFirewallSummary();
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  firewall_status: {
                    status: summary.status,
                    uptime_seconds: summary.uptime,
                    uptime_formatted: formatUptime(summary.uptime),
                    cpu_usage_percent: summary.cpu_usage,
                    memory_usage_percent: summary.memory_usage,
                    active_connections: summary.active_connections,
                    blocked_attempts: summary.blocked_attempts,
                    last_updated: summary.last_updated,
                  },
                  health_indicators: {
                    status_ok: summary.status === 'online',
                    cpu_ok: summary.cpu_usage < 80,
                    memory_ok: summary.memory_usage < 85,
                    performance_score: calculatePerformanceScore(summary),
                  },
                }, null, 2),
              },
            ],
          };
        }

        case 'firewalla://devices': {
          const devices = await firewalla.getDeviceStatus();
          const safeResults = Array.isArray(devices?.results) ? devices.results : [];
          
          const deviceStats = {
            total: safeResults.length,
            online: safeResults.filter(d => d?.online).length,
            offline: safeResults.filter(d => !d?.online).length,
          };

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  device_inventory: {
                    statistics: deviceStats,
                    availability_percentage: deviceStats.total > 0 ? Math.round((deviceStats.online / deviceStats.total) * 100) : 0,
                    devices: safeResults.map(device => ({
                      id: device?.id || 'unknown',
                      name: device?.name || 'Unknown Device',
                      ip_address: device?.ip || 'N/A',
                      mac_vendor: device?.macVendor || 'Unknown',
                      status: device?.online ? 'online' : 'offline',
                      last_seen: safeUnixToISOString(device?.lastSeen, 'Never'),
                      network: device?.network || { id: 'unknown', name: 'Unknown Network' },
                      group: device?.group || { id: 'unknown', name: 'Default Group' },
                      status_indicator: device?.online ? '🟢' : '🔴',
                    })),
                  },
                }, null, 2),
              },
            ],
          };
        }

        case 'firewalla://metrics/security': {
          const metrics = await firewalla.getSecurityMetrics();
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  security_metrics: {
                    overview: {
                      total_alarms: metrics.total_alarms,
                      active_alarms: metrics.active_alarms,
                      resolved_alarms: metrics.total_alarms - metrics.active_alarms,
                      blocked_connections: metrics.blocked_connections,
                      suspicious_activities: metrics.suspicious_activities,
                      threat_level: metrics.threat_level,
                      last_threat_detected: metrics.last_threat_detected,
                    },
                    threat_indicators: {
                      level_emoji: getThreatLevelEmoji(metrics.threat_level),
                      active_threat_ratio: metrics.active_alarms / Math.max(metrics.total_alarms, 1),
                      security_effectiveness: calculateSecurityScore(metrics),
                      recommendation: getSecurityRecommendation(metrics.threat_level, metrics.active_alarms),
                    },
                  },
                }, null, 2),
              },
            ],
          };
        }

        case 'firewalla://topology': {
          const topology = await firewalla.getNetworkTopology();
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  network_topology: {
                    overview: {
                      total_subnets: topology.subnets.length,
                      total_devices: topology.subnets.reduce((sum, subnet) => sum + subnet.device_count, 0),
                      total_connections: topology.connections.length,
                    },
                    subnets: topology.subnets.map(subnet => ({
                      id: subnet.id,
                      name: subnet.name,
                      cidr: subnet.cidr,
                      device_count: subnet.device_count,
                      subnet_size: calculateSubnetSize(subnet.cidr),
                    })),
                    connections: topology.connections.map(conn => ({
                      source: conn.source,
                      destination: conn.destination,
                      type: conn.type,
                      bandwidth_mbps: Math.round(conn.bandwidth / (1024 * 1024)),
                      connection_strength: categorizeConnection(conn.bandwidth),
                    })),
                    network_health: {
                      connectivity_score: calculateConnectivityScore(topology),
                      bottlenecks: identifyBottlenecks(topology.connections),
                    },
                  },
                }, null, 2),
              },
            ],
          };
        }

        case 'firewalla://threats/recent': {
          const threats = await firewalla.getRecentThreats(24);
          
          const threatStats = {
            total: threats.length,
            by_severity: threats.reduce((acc, threat) => {
              acc[threat.severity] = (acc[threat.severity] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            by_type: threats.reduce((acc, threat) => {
              acc[threat.type] = (acc[threat.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
          };

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  recent_threats: {
                    time_period: '24 hours',
                    statistics: threatStats,
                    threat_trend: categorizeThreatLevel(threats.length),
                    threats: threats.map(threat => ({
                      timestamp: threat.timestamp,
                      type: threat.type,
                      source_ip: threat.source_ip,
                      destination_ip: threat.destination_ip,
                      action_taken: threat.action_taken,
                      severity: threat.severity,
                      severity_emoji: getSeverityEmoji(threat.severity),
                      time_ago: getTimeAgo(threat.timestamp),
                    })),
                    recommendations: generateThreatRecommendations(threatStats),
                  },
                }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource URI: ${uri}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: true,
              message: errorMessage,
              uri,
            }, null, 2),
          },
        ],
      };
    }
  });
}

/**
 * Converts a duration in seconds to a formatted string in days, hours, and minutes.
 *
 * @param seconds - The total number of seconds to format
 * @returns A string representing the duration in the format 'Xd Xh Xm'
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

/**
 * Calculates a performance score for the firewall based on CPU and memory usage if the status is 'online'.
 *
 * @param summary - An object containing `cpu_usage`, `memory_usage`, and `status` of the firewall.
 * @returns A score from 0 to 100 representing overall performance, or 0 if the firewall is not online.
 */
function calculatePerformanceScore(summary: { cpu_usage: number; memory_usage: number; status: string }): number {
  if (summary.status !== 'online') {return 0;}
  const cpuScore = Math.max(0, 100 - summary.cpu_usage);
  const memScore = Math.max(0, 100 - summary.memory_usage);
  return Math.round((cpuScore + memScore) / 2);
}

function getThreatLevelEmoji(level: string): string {
  const emojis: Record<string, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  return emojis[level] || '⚪';
}

function calculateSecurityScore(metrics: { blocked_connections: number; active_alarms: number }): number {
  const baseScore = 100;
  const alarmPenalty = metrics.active_alarms * 5;
  const connectionBonus = Math.min(metrics.blocked_connections / 100, 10);
  return Math.max(0, Math.min(100, baseScore - alarmPenalty + connectionBonus));
}

function getSecurityRecommendation(threatLevel: string, activeAlarms: number): string {
  if (threatLevel === 'critical' || activeAlarms > 10) {
    return 'Immediate attention required - review and address active alarms';
  }
  if (threatLevel === 'high' || activeAlarms > 5) {
    return 'Monitor closely and consider additional security measures';
  }
  if (threatLevel === 'medium' || activeAlarms > 0) {
    return 'Review active alarms and update security policies if needed';
  }
  return 'Security status is good - maintain current monitoring';
}

/**
 * Calculates the number of possible IP addresses in a subnet given its CIDR notation.
 *
 * @param cidr - The subnet in CIDR notation (e.g., "192.168.1.0/24")
 * @returns The total number of IP addresses in the subnet
 */
function calculateSubnetSize(cidr: string): number {
  const prefix = parseInt(cidr.split('/')[1] || '24', 10);
  return Math.pow(2, 32 - prefix);
}

/**
 * Categorizes a network connection's bandwidth as 'low', 'medium', or 'high'.
 *
 * @param bandwidth - The bandwidth of the connection in bytes per second
 * @returns The bandwidth category: 'low' for less than 1MB, 'medium' for less than 100MB, or 'high'
 */
function categorizeConnection(bandwidth: number): 'low' | 'medium' | 'high' {
  if (bandwidth < 1024 * 1024) {return 'low';} // < 1MB
  if (bandwidth < 100 * 1024 * 1024) {return 'medium';} // < 100MB
  return 'high';
}

/**
 * Calculates a connectivity score for a network topology based on the ratio of connections to subnets.
 *
 * The score is scaled so that a higher number of connections per subnet increases the score, up to a maximum of 100.
 *
 * @param topology - An object containing arrays of subnets and connections
 * @returns The connectivity score as a number between 0 and 100
 */
function calculateConnectivityScore(topology: { subnets: unknown[]; connections: unknown[] }): number {
  const subnetCount = topology.subnets.length;
  const connectionCount = topology.connections.length;
  if (subnetCount === 0) {return 0;}
  return Math.min(100, (connectionCount / subnetCount) * 50);
}

/**
 * Identifies up to five network connections with bandwidth below 10MB as bottlenecks.
 *
 * @param connections - List of network connections with bandwidth, source, and destination information
 * @returns An array of strings describing the source and destination of each identified bottleneck connection
 */
function identifyBottlenecks(connections: Array<{ bandwidth: number; source: string; destination: string }>): string[] {
  return connections
    .filter(conn => conn.bandwidth < 10 * 1024 * 1024) // < 10MB
    .map(conn => `${conn.source} → ${conn.destination}`)
    .slice(0, 5);
}

/**
 * Categorizes the threat level based on the number of threats.
 *
 * @param threatCount - The total number of detected threats
 * @returns 'low' if fewer than 10 threats, 'medium' if fewer than 50, otherwise 'high'
 */
function categorizeThreatLevel(threatCount: number): 'low' | 'medium' | 'high' {
  if (threatCount < 10) {return 'low';}
  if (threatCount < 50) {return 'medium';}
  return 'high';
}

function getSeverityEmoji(severity: string): string {
  const emojis: Record<string, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  return emojis[severity] || '⚪';
}

/**
 * Returns a human-readable string indicating how long ago the given timestamp occurred.
 *
 * The output is formatted as minutes (`Xm ago`), hours (`Xh ago`), or days (`Xd ago`) depending on the elapsed time.
 *
 * @param timestamp - An ISO 8601 date string representing the past time to compare.
 * @returns A string describing the elapsed time since the timestamp.
 */
function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) {return `${diffMins}m ago`;}
  if (diffMins < 1440) {return `${Math.floor(diffMins / 60)}h ago`;}
  return `${Math.floor(diffMins / 1440)}d ago`;
}

function generateThreatRecommendations(stats: { total: number; by_severity: Record<string, number> }): string[] {
  const recommendations: string[] = [];
  
  if (stats.total === 0) {
    recommendations.push('No recent threats detected - maintain current security posture');
  } else {
    if ((stats.by_severity.critical || 0) > 0) {
      recommendations.push('Address critical threats immediately');
    }
    if ((stats.by_severity.high || 0) > 5) {
      recommendations.push('Review and strengthen firewall rules');
    }
    if (stats.total > 50) {
      recommendations.push('Consider implementing additional threat detection measures');
    }
  }
  
  return recommendations;
}