/**
 * Security Incident Response and Management Tools
 * Provides automated incident correlation, lifecycle management, and reporting
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  getCurrentTimestamp,
  unixToISOStringOrNow,
} from '../../utils/timestamp.js';
import {
  withToolTimeout,
  createTimeoutErrorResponse,
  TimeoutError,
} from '../../utils/timeout-manager.js';

// Types for incident management
interface SecurityIncident {
  incident_id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  created_at: string;
  updated_at: string;
  assigned_to?: string;
  tags: string[];
  related_alarms: string[];
  related_ips: string[];
  related_devices: string[];
  correlation_score: number;
  attack_pattern?: string;
  estimated_impact: string;
  recommended_actions: string[];
}

// Removed unused interface - correlation params handled in tool arguments

// In-memory incident storage (in production, this would be a database)
const incidents: Map<string, SecurityIncident> = new Map();

/**
 * Generate a unique incident ID
 */
function generateIncidentId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `INC-${timestamp}-${random}`;
}

/**
 * Calculate incident severity based on related alarms
 */
function calculateIncidentSeverity(alarms: any[]): 'critical' | 'high' | 'medium' | 'low' {
  if (!alarms || alarms.length === 0) {return 'low';}

  const severityScores: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const maxScore = Math.max(...alarms.map(alarm => 
    severityScores[alarm.severity] || 1
  ));

  const criticalCount = alarms.filter(a => a.severity === 'critical').length;
  const highCount = alarms.filter(a => a.severity === 'high').length;

  // Escalate severity based on alarm patterns
  if (criticalCount >= 1 || maxScore === 4) {
    return 'critical';
  }
  if (highCount >= 2 || maxScore === 3) {
    return 'high';
  }
  if (alarms.length >= 5) {
    return 'high'; // Multiple related alarms
  }
  if (maxScore === 2) {
    return 'medium';
  }
  return 'low';
}

/**
 * Analyze attack patterns from alarms
 */
function analyzeAttackPattern(alarms: any[]): string {
  if (!alarms || alarms.length === 0) {return 'unknown';}

  const types = alarms.map(a => a.type?.toLowerCase() || '');
  const messages = alarms.map(a => a.message?.toLowerCase() || '');

  // Detect common attack patterns
  if (types.some(t => t.includes('brute')) || messages.some(m => m.includes('brute'))) {
    return 'brute_force_attack';
  }
  if (types.some(t => t.includes('malware')) || messages.some(m => m.includes('malware'))) {
    return 'malware_infection';
  }
  if (types.some(t => t.includes('scan')) || messages.some(m => m.includes('scan'))) {
    return 'network_reconnaissance';
  }
  if (types.some(t => t.includes('intrusion')) || messages.some(m => m.includes('intrusion'))) {
    return 'network_intrusion';
  }
  if (types.some(t => t.includes('anomaly')) || messages.some(m => m.includes('anomaly'))) {
    return 'behavioral_anomaly';
  }

  return 'mixed_threats';
}

/**
 * Generate recommended actions based on incident analysis
 */
function generateRecommendedActions(
  severity: string,
  attackPattern: string,
  alarmCount: number
): string[] {
  const actions: string[] = [];

  // Base actions for all incidents
  actions.push('Review incident details and related alarms');
  actions.push('Verify affected systems and users');

  // Severity-based actions
  if (severity === 'critical') {
    actions.push('IMMEDIATE ACTION: Isolate affected systems if necessary');
    actions.push('Notify security team lead and management');
    actions.push('Consider activating incident response plan');
  } else if (severity === 'high') {
    actions.push('Prioritize investigation within 1 hour');
    actions.push('Notify security team members');
  }

  // Pattern-based actions
  switch (attackPattern) {
    case 'brute_force_attack':
      actions.push('Block attacking IP addresses');
      actions.push('Review authentication logs');
      actions.push('Consider account lockout policies');
      break;
    case 'malware_infection':
      actions.push('Run full antivirus scan on affected systems');
      actions.push('Check for lateral movement indicators');
      actions.push('Update antivirus signatures');
      break;
    case 'network_reconnaissance':
      actions.push('Monitor for follow-up attacks');
      actions.push('Review firewall rules and network segmentation');
      actions.push('Consider blocking scanning IPs');
      break;
    case 'network_intrusion':
      actions.push('Immediate network isolation of affected systems');
      actions.push('Forensic imaging of compromised systems');
      actions.push('Change all potentially compromised credentials');
      break;
  }

  // Volume-based actions
  if (alarmCount >= 10) {
    actions.push('Investigate for coordinated attack or system compromise');
  }

  return actions;
}

export class CreateSecurityIncidentHandler extends BaseToolHandler {
  name = 'create_security_incident';
  description = 'Create a security incident by correlating related alarms, flows, and devices. Can automatically group related security events or create manual incidents. Supports custom correlation parameters and severity assessment.';
  category = 'incident_response' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const titleValidation = ParameterValidator.validateOptionalString(
        args?.title,
        'title'
      );
      const descriptionValidation = ParameterValidator.validateOptionalString(
        args?.description,
        'description'
      );
      const severityValidation = ParameterValidator.validateEnum(
        args?.severity,
        'severity',
        ['critical', 'high', 'medium', 'low'],
        false
      );
      // Validate alarm_ids array if provided
      let alarmIdsValidation: { isValid: boolean; sanitizedValue: string[] | undefined; errors: string[] } = {
        isValid: true,
        sanitizedValue: undefined,
        errors: []
      };
      
      if (args?.alarm_ids !== undefined) {
        if (Array.isArray(args.alarm_ids)) {
          const stringArray = args.alarm_ids.every(id => typeof id === 'string');
          if (stringArray) {
            alarmIdsValidation.sanitizedValue = args.alarm_ids as string[];
          } else {
            alarmIdsValidation.isValid = false;
            alarmIdsValidation.errors.push('alarm_ids must be an array of strings');
          }
        } else {
          alarmIdsValidation.isValid = false;
          alarmIdsValidation.errors.push('alarm_ids must be an array');
        }
      }
      const autoCorrelateValidation = ParameterValidator.validateBoolean(
        args?.auto_correlate,
        'auto_correlate',
        true
      );
      const timeWindowValidation = ParameterValidator.validateNumber(
        args?.time_window_minutes,
        'time_window_minutes',
        { min: 5, max: 1440, defaultValue: 60 }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        titleValidation,
        descriptionValidation,
        severityValidation,
        alarmIdsValidation,
        autoCorrelateValidation,
        timeWindowValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const autoCorrelate = autoCorrelateValidation.sanitizedValue as boolean;
      const timeWindowMinutes = timeWindowValidation.sanitizedValue as number;
      let alarmIds = (alarmIdsValidation.sanitizedValue as string[]) || [];

      // If auto-correlate is enabled, find related alarms
      if (autoCorrelate) {
        const correlationResponse = await withToolTimeout(
          async () => {
            // Get recent high-priority alarms for correlation
            const recentAlarms = await firewalla.getActiveAlarms(
              'severity:high OR severity:critical',
              undefined,
              'timestamp:desc',
              100
            );

            if (recentAlarms.results && recentAlarms.results.length > 0) {
              // Filter alarms within time window
              const cutoffTime = Date.now() - (timeWindowMinutes * 60 * 1000);
              const relevantAlarms = recentAlarms.results.filter((alarm: any) => {
                const alarmTime = alarm.ts ? alarm.ts * 1000 : Date.now();
                return alarmTime >= cutoffTime;
              });

              // Group alarms by IP correlation
              const ipGroups = new Map<string, any[]>();
              relevantAlarms.forEach((alarm: any) => {
                const ip = alarm.source_ip || alarm.remote_ip || alarm.device_ip;
                if (ip) {
                  if (!ipGroups.has(ip)) {
                    ipGroups.set(ip, []);
                  }
                  ipGroups.get(ip)!.push(alarm);
                }
              });

              // Find the largest correlated group
              let largestGroup: any[] = [];
              for (const group of ipGroups.values()) {
                if (group.length > largestGroup.length && group.length >= 2) {
                  largestGroup = group;
                }
              }

              return largestGroup;
            }
            return [];
          },
          'create_security_incident'
        );

        if (correlationResponse.length > 0) {
          alarmIds = correlationResponse.map((alarm: any) => 
            alarm.aid || alarm.id || String(alarm.ts)
          );
        }
      }

      // If no alarms found and none provided, create with minimal info
      if (alarmIds.length === 0 && !titleValidation.sanitizedValue) {
        return this.createErrorResponse(
          'Cannot create incident: No alarms provided and auto-correlation found no related alarms',
          ErrorType.VALIDATION_ERROR,
          {
            suggestion: 'Provide specific alarm_ids or ensure there are recent high-severity alarms to correlate'
          }
        );
      }

      // Get alarm details for incident analysis
      let relatedAlarms: any[] = [];
      if (alarmIds.length > 0) {
        const alarmPromises = alarmIds.map(async (id: string) => {
          try {
            const alarm = await firewalla.getSpecificAlarm(id);
            return alarm?.results?.[0] || null;
          } catch {
            return null;
          }
        });

        const alarmResults = await Promise.all(alarmPromises);
        relatedAlarms = alarmResults.filter(alarm => alarm !== null);
      }

      // Generate incident details
      const incidentId = generateIncidentId();
      const calculatedSeverity = (severityValidation.sanitizedValue as string) || 
        calculateIncidentSeverity(relatedAlarms);
      const attackPattern = analyzeAttackPattern(relatedAlarms);

      // Extract unique IPs and device IDs
      const relatedIps = [...new Set(
        relatedAlarms.flatMap((alarm: any) => [
          alarm.source_ip,
          alarm.destination_ip,
          alarm.remote_ip,
          alarm.device_ip
        ]).filter(Boolean)
      )];

      const relatedDevices = [...new Set(
        relatedAlarms.map((alarm: any) => alarm.device_id || alarm.device?.id)
          .filter(Boolean)
      )];

      const incident: SecurityIncident = {
        incident_id: incidentId,
        title: (titleValidation.sanitizedValue as string) || 
          `Auto-generated incident: ${attackPattern.replace(/_/g, ' ')}`,
        description: (descriptionValidation.sanitizedValue as string) || 
          `Security incident created from ${relatedAlarms.length} correlated alarms. Attack pattern: ${attackPattern}`,
        severity: calculatedSeverity as any,
        status: 'open',
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp(),
        tags: [attackPattern, 'auto_generated'].filter(Boolean),
        related_alarms: alarmIds,
        related_ips: relatedIps,
        related_devices: relatedDevices,
        correlation_score: Math.min(relatedAlarms.length * 0.1 + 0.5, 1.0),
        attack_pattern: attackPattern,
        estimated_impact: calculatedSeverity === 'critical' ? 'High - Immediate action required' :
          calculatedSeverity === 'high' ? 'Medium - Prompt investigation needed' :
          'Low - Monitor and investigate when convenient',
        recommended_actions: generateRecommendedActions(
          calculatedSeverity as string,
          attackPattern,
          relatedAlarms.length
        ),
      };

      // Store incident
      incidents.set(incidentId, incident);

      return this.createSuccessResponse({
        incident,
        correlation_summary: {
          alarms_analyzed: relatedAlarms.length,
          time_window_minutes: timeWindowMinutes,
          correlation_method: autoCorrelate ? 'automatic' : 'manual',
          unique_ips: relatedIps.length,
          unique_devices: relatedDevices.length,
        },
        next_steps: [
          'Review incident details and validate correlation accuracy',
          'Assign incident to security team member',
          'Begin investigation according to recommended actions',
          'Update incident status as investigation progresses',
        ],
      });

    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          'create_security_incident',
          error.duration,
          15000
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to create security incident: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GetSecurityIncidentsHandler extends BaseToolHandler {
  name = 'get_security_incidents';
  description = 'Retrieve security incidents with filtering by status, severity, or date range. Provides comprehensive incident management and tracking capabilities.';
  category = 'incident_response' as const;

  async execute(
    args: ToolArgs,
    _firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const statusValidation = ParameterValidator.validateEnum(
        args?.status,
        'status',
        ['open', 'investigating', 'resolved', 'false_positive'],
        false
      );
      const severityValidation = ParameterValidator.validateEnum(
        args?.severity,
        'severity',
        ['critical', 'high', 'medium', 'low'],
        false
      );
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        { min: 1, max: 1000, defaultValue: 50 }
      );
      const sinceValidation = ParameterValidator.validateOptionalString(
        args?.since,
        'since'
      );

      const validationResult = ParameterValidator.combineValidationResults([
        statusValidation,
        severityValidation,
        limitValidation,
        sinceValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const statusFilter = statusValidation.sanitizedValue as string | undefined;
      const severityFilter = severityValidation.sanitizedValue as string | undefined;
      const limit = limitValidation.sanitizedValue as number;
      const since = sinceValidation.sanitizedValue as string | undefined;

      // Filter incidents based on criteria
      let filteredIncidents = Array.from(incidents.values());

      if (statusFilter) {
        filteredIncidents = filteredIncidents.filter(
          incident => incident.status === statusFilter
        );
      }

      if (severityFilter) {
        filteredIncidents = filteredIncidents.filter(
          incident => incident.severity === severityFilter
        );
      }

      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          filteredIncidents = filteredIncidents.filter(
            incident => new Date(incident.created_at) >= sinceDate
          );
        }
      }

      // Sort by creation date (newest first)
      filteredIncidents.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Apply limit
      const limitedIncidents = filteredIncidents.slice(0, limit);

      // Calculate summary statistics
      const statusCounts = {
        open: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.status === 'open').length : 0,
        investigating: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.status === 'investigating').length : 0,
        resolved: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.status === 'resolved').length : 0,
        false_positive: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.status === 'false_positive').length : 0,
      };

      const severityCounts = {
        critical: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.severity === 'critical').length : 0,
        high: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.severity === 'high').length : 0,
        medium: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.severity === 'medium').length : 0,
        low: incidents.size > 0 ? Array.from(incidents.values()).filter(i => i.severity === 'low').length : 0,
      };

      return this.createSuccessResponse({
        incidents: limitedIncidents,
        total_count: filteredIncidents.length,
        total_incidents: incidents.size,
        filters_applied: {
          status: statusFilter,
          severity: severityFilter,
          since,
          limit,
        },
        summary: {
          by_status: statusCounts,
          by_severity: severityCounts,
          active_incidents: statusCounts.open + statusCounts.investigating,
          needs_attention: severityCounts.critical + severityCounts.high,
        },
        retrieved_at: getCurrentTimestamp(),
      });

    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get security incidents: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class UpdateIncidentStatusHandler extends BaseToolHandler {
  name = 'update_incident_status';
  description = 'Update the status of a security incident (open, investigating, resolved, false_positive). Supports adding notes and assignment. Required for incident lifecycle management.';
  category = 'incident_response' as const;

  async execute(
    args: ToolArgs,
    _firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const incidentIdValidation = ParameterValidator.validateRequiredString(
        args?.incident_id,
        'incident_id'
      );
      const statusValidation = ParameterValidator.validateEnum(
        args?.status,
        'status',
        ['open', 'investigating', 'resolved', 'false_positive'],
        true
      );
      const notesValidation = ParameterValidator.validateOptionalString(
        args?.notes,
        'notes'
      );
      const assignedToValidation = ParameterValidator.validateOptionalString(
        args?.assigned_to,
        'assigned_to'
      );

      const validationResult = ParameterValidator.combineValidationResults([
        incidentIdValidation,
        statusValidation,
        notesValidation,
        assignedToValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const incidentId = incidentIdValidation.sanitizedValue as string;
      const newStatus = statusValidation.sanitizedValue as string;
      const notes = notesValidation.sanitizedValue as string | undefined;
      const assignedTo = assignedToValidation.sanitizedValue as string | undefined;

      // Check if incident exists
      const incident = incidents.get(incidentId);
      if (!incident) {
        return this.createErrorResponse(
          `Incident with ID '${incidentId}' not found`,
          ErrorType.API_ERROR,
          {
            incident_id: incidentId,
            suggestion: 'Use get_security_incidents to list available incidents',
          }
        );
      }

      // Store previous status for history
      const previousStatus = incident.status;

      // Update incident
      incident.status = newStatus as any;
      incident.updated_at = getCurrentTimestamp();

      if (assignedTo !== undefined) {
        incident.assigned_to = assignedTo;
      }

      // Add status change to tags for history tracking
      incident.tags.push(`status_changed_${previousStatus}_to_${newStatus}`);

      // Update description with notes if provided
      if (notes) {
        incident.description += `\n\nStatus Update (${getCurrentTimestamp()}): ${notes}`;
      }

      // Store updated incident
      incidents.set(incidentId, incident);

      return this.createSuccessResponse({
        incident,
        status_change: {
          from: previousStatus,
          to: newStatus,
          changed_at: incident.updated_at,
          changed_by: assignedTo || 'system',
          notes,
        },
        message: `Incident ${incidentId} status updated from '${previousStatus}' to '${newStatus}'`,
      });

    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to update incident status: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GenerateIncidentReportHandler extends BaseToolHandler {
  name = 'generate_incident_report';
  description = 'Generate a comprehensive incident report combining alarm data, network flows, device information, and timeline analysis. Essential for incident documentation and post-incident review.';
  category = 'incident_response' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const incidentIdValidation = ParameterValidator.validateRequiredString(
        args?.incident_id,
        'incident_id'
      );
      const includeFlowsValidation = ParameterValidator.validateBoolean(
        args?.include_flows,
        'include_flows',
        true
      );
      const includeDevicesValidation = ParameterValidator.validateBoolean(
        args?.include_devices,
        'include_devices',
        true
      );
      const timelineAnalysisValidation = ParameterValidator.validateBoolean(
        args?.timeline_analysis,
        'timeline_analysis',
        true
      );

      const validationResult = ParameterValidator.combineValidationResults([
        incidentIdValidation,
        includeFlowsValidation,
        includeDevicesValidation,
        timelineAnalysisValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const incidentId = incidentIdValidation.sanitizedValue as string;
      const includeFlows = includeFlowsValidation.sanitizedValue as boolean;
      const includeDevices = includeDevicesValidation.sanitizedValue as boolean;
      const timelineAnalysis = timelineAnalysisValidation.sanitizedValue as boolean;

      // Check if incident exists
      const incident = incidents.get(incidentId);
      if (!incident) {
        return this.createErrorResponse(
          `Incident with ID '${incidentId}' not found`,
          ErrorType.API_ERROR,
          {
            incident_id: incidentId,
            suggestion: 'Use get_security_incidents to list available incidents',
          }
        );
      }

      const report = await withToolTimeout(
        async () => {
          // Get detailed alarm information
          const alarmDetails = await Promise.all(
            incident.related_alarms.map(async (alarmId: string) => {
              try {
                const alarm = await firewalla.getSpecificAlarm(alarmId);
                return alarm?.results?.[0] || null;
              } catch {
                return null;
              }
            })
          );

          const validAlarms = alarmDetails.filter(alarm => alarm !== null);

          // Get related network flows if requested
          let relatedFlows: any[] = [];
          if (includeFlows && incident.related_ips.length > 0) {
            try {
              const flowQuery = incident.related_ips.map(ip => `source_ip:${ip} OR destination_ip:${ip}`).join(' OR ');
              const flowResponse = await firewalla.getFlowData(
                flowQuery,
                undefined,
                'timestamp:desc',
                100
              );
              relatedFlows = flowResponse.results || [];
            } catch {
              // Flow data optional - continue without it
            }
          }

          // Get device information if requested
          let deviceInfo: any[] = [];
          if (includeDevices && incident.related_devices.length > 0) {
            try {
              const deviceResponse = await firewalla.getDeviceStatus(
                undefined,
                undefined,
                100
              );
              deviceInfo = (deviceResponse.results || []).filter((device: any) => 
                incident.related_devices.includes(device.id || device.device_id)
              );
            } catch {
              // Device data optional - continue without it
            }
          }

          // Generate timeline if requested
          let timeline: any[] = [];
          if (timelineAnalysis) {
            const events = [
              ...validAlarms.map((alarm: any) => ({
                timestamp: alarm.ts ? unixToISOStringOrNow(alarm.ts) : 'Unknown',
                type: 'alarm',
                severity: alarm.severity || 'unknown',
                description: `Security alarm: ${alarm.type || 'Unknown type'} - ${alarm.message || 'No message'}`,
                source: alarm.source_ip || alarm.device_ip || 'Unknown',
              })),
              ...relatedFlows.slice(0, 20).map((flow: any) => ({
                timestamp: flow.ts ? unixToISOStringOrNow(flow.ts) : 'Unknown',
                type: 'network_flow',
                severity: flow.blocked ? 'medium' : 'low',
                description: `Network flow: ${flow.source_ip || 'Unknown'} → ${flow.destination_ip || 'Unknown'} (${flow.protocol || 'Unknown'})`,
                source: flow.source_ip || 'Unknown',
              })),
            ];

            // Sort by timestamp
            timeline = events.sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          }

          return {
            incident_summary: incident,
            alarm_analysis: {
              total_alarms: validAlarms.length,
              severity_breakdown: {
                critical: validAlarms.filter(a => a.severity === 'critical').length,
                high: validAlarms.filter(a => a.severity === 'high').length,
                medium: validAlarms.filter(a => a.severity === 'medium').length,
                low: validAlarms.filter(a => a.severity === 'low').length,
              },
              attack_vectors: [...new Set(validAlarms.map(a => a.type).filter(Boolean))],
              affected_ips: incident.related_ips,
              alarm_details: validAlarms,
            },
            network_analysis: includeFlows ? {
              total_flows: relatedFlows.length,
              blocked_flows: relatedFlows.filter(f => f.blocked).length,
              protocols: [...new Set(relatedFlows.map(f => f.protocol).filter(Boolean))],
              top_destinations: relatedFlows.reduce((acc: any, flow: any) => {
                const dest = flow.destination_ip;
                if (dest) {
                  acc[dest] = (acc[dest] || 0) + 1;
                }
                return acc;
              }, {}),
              flow_details: relatedFlows.slice(0, 10), // Limit for readability
            } : null,
            device_analysis: includeDevices ? {
              affected_devices: deviceInfo.length,
              device_types: [...new Set(deviceInfo.map(d => d.device_type).filter(Boolean))],
              offline_devices: deviceInfo.filter(d => !d.online).length,
              device_details: deviceInfo,
            } : null,
            timeline: timelineAnalysis ? timeline : null,
            recommendations: {
              immediate_actions: incident.recommended_actions.slice(0, 3),
              follow_up_actions: incident.recommended_actions.slice(3),
              monitoring_recommendations: [
                'Continue monitoring affected IPs for 24-48 hours',
                'Review logs for additional indicators of compromise',
                'Monitor for similar attack patterns across the network',
              ],
            },
            report_metadata: {
              generated_at: getCurrentTimestamp(),
              report_type: 'comprehensive_incident_report',
              data_sources: ['alarms', ...(includeFlows ? ['flows'] : []), ...(includeDevices ? ['devices'] : [])],
              analysis_scope: {
                time_range: `${incident.created_at} to ${getCurrentTimestamp()}`,
                ip_addresses: incident.related_ips.length,
                devices: incident.related_devices.length,
                alarms: incident.related_alarms.length,
              },
            },
          };
        },
        'generate_incident_report'
      );

      return this.createSuccessResponse(report);

    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          'generate_incident_report',
          error.duration,
          20000
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to generate incident report: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}