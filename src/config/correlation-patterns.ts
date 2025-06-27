/**
 * Configurable correlation patterns for cross-reference searches
 * Extracted from hardcoded patterns to improve maintainability
 */

import type { EntityType } from '../validation/field-mapper.js';

/**
 * Definition of a correlation pattern with its fields and description
 */
export interface CorrelationPattern {
  id: string;
  name: string;
  description: string;
  fields: string[];
  entityTypes: EntityType[];
  priority: 'high' | 'medium' | 'low';
  useCase: string;
}

/**
 * Common correlation patterns organized by category
 */
export interface CorrelationPatternCatalog {
  network: CorrelationPattern[];
  security: CorrelationPattern[];
  device: CorrelationPattern[];
  temporal: CorrelationPattern[];
  geographic: CorrelationPattern[];
  application: CorrelationPattern[];
}

/**
 * Default correlation patterns configuration
 */
export const DEFAULT_CORRELATION_PATTERNS: CorrelationPatternCatalog = {
  network: [
    {
      id: 'network_flow_security',
      name: 'Network Flow Security Correlation',
      description: 'Correlate network flows with security alarms based on IP addresses and protocol',
      fields: ['source_ip', 'destination_ip', 'protocol'],
      entityTypes: ['flows', 'alarms'],
      priority: 'high',
      useCase: 'Identify security threats in network traffic'
    },
    {
      id: 'device_network_activity',
      name: 'Device Network Activity Correlation',
      description: 'Correlate device activity with network flows and timestamps',
      fields: ['device_ip', 'timestamp', 'protocol'],
      entityTypes: ['flows', 'alarms', 'devices'],
      priority: 'high',
      useCase: 'Monitor device network behavior over time'
    },
    {
      id: 'ip_protocol_correlation',
      name: 'IP Protocol Analysis',
      description: 'Analyze traffic patterns by correlating IP addresses with protocols',
      fields: ['source_ip', 'protocol'],
      entityTypes: ['flows', 'alarms'],
      priority: 'medium',
      useCase: 'Protocol-specific traffic analysis'
    },
    {
      id: 'port_based_correlation',
      name: 'Port-based Traffic Correlation',
      description: 'Correlate traffic based on destination ports and protocols',
      fields: ['destination_ip', 'port', 'protocol'],
      entityTypes: ['flows', 'alarms', 'rules'],
      priority: 'medium',
      useCase: 'Service-specific traffic monitoring'
    }
  ],
  security: [
    {
      id: 'threat_source_tracking',
      name: 'Threat Source Tracking',
      description: 'Track security threats from specific IP addresses across time',
      fields: ['source_ip', 'device_id', 'timestamp'],
      entityTypes: ['flows', 'alarms'],
      priority: 'high',
      useCase: 'Track persistent threats and attack patterns'
    },
    {
      id: 'attack_vector_analysis',
      name: 'Attack Vector Analysis',
      description: 'Analyze attack vectors and threat levels across devices',
      fields: ['attack_vector', 'threat_level', 'device_ip'],
      entityTypes: ['alarms', 'flows'],
      priority: 'high',
      useCase: 'Understand attack methodologies and impacts'
    },
    {
      id: 'severity_correlation',
      name: 'Security Severity Correlation',
      description: 'Correlate security events by severity and affected assets',
      fields: ['severity', 'device_ip', 'timestamp'],
      entityTypes: ['alarms'],
      priority: 'medium',
      useCase: 'Prioritize security response based on severity'
    }
  ],
  device: [
    {
      id: 'device_vendor_behavior',
      name: 'Device Vendor Behavior Analysis',
      description: 'Analyze behavior patterns by device vendor and type',
      fields: ['device_vendor', 'device_type', 'activity_level'],
      entityTypes: ['devices', 'flows'],
      priority: 'medium',
      useCase: 'Device categorization and behavior profiling'
    },
    {
      id: 'device_group_activity',
      name: 'Device Group Activity Correlation',
      description: 'Correlate activities within device groups',
      fields: ['device_group', 'device_ip', 'timestamp'],
      entityTypes: ['devices', 'flows', 'alarms'],
      priority: 'medium',
      useCase: 'Group-based policy enforcement and monitoring'
    },
    {
      id: 'mac_vendor_analysis',
      name: 'MAC Vendor Analysis',
      description: 'Analyze device behavior by MAC address vendor',
      fields: ['mac_vendor', 'device_ip', 'online'],
      entityTypes: ['devices'],
      priority: 'low',
      useCase: 'Vendor-specific device management'
    }
  ],
  temporal: [
    {
      id: 'time_pattern_analysis',
      name: 'Temporal Pattern Analysis',
      description: 'Analyze activity patterns across different time periods',
      fields: ['timestamp', 'hour_of_day', 'day_of_week'],
      entityTypes: ['flows', 'alarms'],
      priority: 'medium',
      useCase: 'Identify unusual activity outside normal hours'
    },
    {
      id: 'session_duration_correlation',
      name: 'Session Duration Correlation',
      description: 'Correlate session durations with security events',
      fields: ['session_duration', 'frequency_score', 'device_ip'],
      entityTypes: ['flows', 'alarms'],
      priority: 'medium',
      useCase: 'Detect abnormal connection patterns'
    }
  ],
  geographic: [
    {
      id: 'geo_risk_correlation',
      name: 'Geographic Risk Correlation',
      description: 'Correlate geographic locations with risk assessments',
      fields: ['country', 'geographic_risk_score', 'source_ip'],
      entityTypes: ['flows', 'alarms'],
      priority: 'high',
      useCase: 'Geographic threat assessment'
    },
    {
      id: 'asn_correlation',
      name: 'ASN-based Correlation',
      description: 'Correlate network activities by Autonomous System Number',
      fields: ['asn', 'country', 'source_ip'],
      entityTypes: ['flows', 'alarms'],
      priority: 'medium',
      useCase: 'ISP and hosting provider analysis'
    },
    {
      id: 'vpn_proxy_detection',
      name: 'VPN/Proxy Detection Correlation',
      description: 'Detect VPN and proxy usage patterns',
      fields: ['is_vpn', 'is_proxy', 'source_ip', 'country'],
      entityTypes: ['flows', 'alarms'],
      priority: 'medium',
      useCase: 'Identify anonymization services usage'
    }
  ],
  application: [
    {
      id: 'app_security_correlation',
      name: 'Application Security Correlation',
      description: 'Correlate application usage with security events',
      fields: ['application', 'application_category', 'severity'],
      entityTypes: ['flows', 'alarms'],
      priority: 'high',
      useCase: 'Application-specific security monitoring'
    },
    {
      id: 'ssl_cert_analysis',
      name: 'SSL Certificate Analysis',
      description: 'Analyze SSL certificate patterns and issuers',
      fields: ['ssl_subject', 'ssl_issuer', 'destination_ip'],
      entityTypes: ['flows'],
      priority: 'medium',
      useCase: 'Certificate validation and trust analysis'
    },
    {
      id: 'user_agent_correlation',
      name: 'User Agent Correlation',
      description: 'Correlate user agent strings with applications and security events',
      fields: ['user_agent', 'application', 'device_ip'],
      entityTypes: ['flows', 'alarms'],
      priority: 'low',
      useCase: 'Browser and application fingerprinting'
    }
  ]
};

/**
 * Common field combinations that work well together (extracted from hardcoded triples)
 */
export const COMMON_FIELD_COMBINATIONS = {
  security_triples: [
    ['source_ip', 'destination_ip', 'protocol'],
    ['device_ip', 'timestamp', 'protocol'],
    ['source_ip', 'device_id', 'timestamp'],
    ['severity', 'device_ip', 'timestamp'],
    ['attack_vector', 'threat_level', 'source_ip']
  ],
  network_triples: [
    ['source_ip', 'destination_ip', 'port'],
    ['device_ip', 'protocol', 'bytes'],
    ['source_ip', 'asn', 'country'],
    ['destination_ip', 'application', 'protocol']
  ],
  device_triples: [
    ['device_ip', 'device_vendor', 'device_type'],
    ['mac_vendor', 'device_group', 'online'],
    ['device_id', 'network_segment', 'timestamp']
  ],
  application_triples: [
    ['application', 'application_category', 'user_agent'],
    ['ssl_subject', 'ssl_issuer', 'destination_ip'],
    ['session_duration', 'frequency_score', 'application']
  ]
};

/**
 * Current correlation patterns configuration (can be updated at runtime)
 */
let currentCorrelationPatterns: CorrelationPatternCatalog = DEFAULT_CORRELATION_PATTERNS;

/**
 * Update correlation patterns at runtime
 */
export function updateCorrelationPatterns(newPatterns: Partial<CorrelationPatternCatalog>): void {
  currentCorrelationPatterns = {
    ...currentCorrelationPatterns,
    ...newPatterns,
    network: [...(currentCorrelationPatterns.network ?? []), ...(newPatterns.network ?? [])],
    security: [...(currentCorrelationPatterns.security ?? []), ...(newPatterns.security ?? [])],
    device: [...(currentCorrelationPatterns.device ?? []), ...(newPatterns.device ?? [])],
    temporal: [...(currentCorrelationPatterns.temporal ?? []), ...(newPatterns.temporal ?? [])],
    geographic: [...(currentCorrelationPatterns.geographic ?? []), ...(newPatterns.geographic ?? [])],
    application: [...(currentCorrelationPatterns.application ?? []), ...(newPatterns.application ?? [])]
  };
}

/**
 * Get current correlation patterns
 */
export function getCorrelationPatterns(): CorrelationPatternCatalog {
  return currentCorrelationPatterns;
}

/**
 * Get patterns by entity types
 */
export function getPatternsByEntityTypes(entityTypes: EntityType[]): CorrelationPattern[] {
  const allPatterns = [
    ...currentCorrelationPatterns.network,
    ...currentCorrelationPatterns.security,
    ...currentCorrelationPatterns.device,
    ...currentCorrelationPatterns.temporal,
    ...currentCorrelationPatterns.geographic,
    ...currentCorrelationPatterns.application
  ];
  
  return allPatterns.filter(pattern => 
    pattern.entityTypes.some(type => entityTypes.includes(type))
  );
}

/**
 * Get patterns by priority
 */
export function getPatternsByPriority(priority: 'high' | 'medium' | 'low'): CorrelationPattern[] {
  const allPatterns = [
    ...currentCorrelationPatterns.network,
    ...currentCorrelationPatterns.security,
    ...currentCorrelationPatterns.device,
    ...currentCorrelationPatterns.temporal,
    ...currentCorrelationPatterns.geographic,
    ...currentCorrelationPatterns.application
  ];
  
  return allPatterns.filter(pattern => pattern.priority === priority);
}

/**
 * Get field combinations based on patterns and entity types
 */
export function getRecommendedFieldCombinations(entityTypes: EntityType[]): string[][] {
  const applicablePatterns = getPatternsByEntityTypes(entityTypes);
  const combinations = applicablePatterns.map(pattern => pattern.fields);
  
  // Add common combinations based on entity types
  if (entityTypes.includes('flows') && entityTypes.includes('alarms')) {
    combinations.push(...COMMON_FIELD_COMBINATIONS.security_triples);
    combinations.push(...COMMON_FIELD_COMBINATIONS.network_triples);
  }
  
  if (entityTypes.includes('devices')) {
    combinations.push(...COMMON_FIELD_COMBINATIONS.device_triples);
  }
  
  // Remove duplicates and sort by length (simpler combinations first)
  const uniqueCombinations = Array.from(
    new Set(combinations.map(combo => JSON.stringify(combo.sort())))
  ).map(combo => JSON.parse(combo));
  
  return uniqueCombinations.sort((a, b) => a.length - b.length);
}

/**
 * Find patterns by field combination
 */
export function findPatternsByFields(fields: string[]): CorrelationPattern[] {
  const allPatterns = [
    ...currentCorrelationPatterns.network,
    ...currentCorrelationPatterns.security,
    ...currentCorrelationPatterns.device,
    ...currentCorrelationPatterns.temporal,
    ...currentCorrelationPatterns.geographic,
    ...currentCorrelationPatterns.application
  ];
  
  const fieldSet = new Set(fields);
  
  return allPatterns.filter(pattern => {
    const patternFieldSet = new Set(pattern.fields);
    // Check if there's overlap between pattern fields and provided fields
    return pattern.fields.some(field => fieldSet.has(field)) ||
           fields.some(field => patternFieldSet.has(field));
  });
}