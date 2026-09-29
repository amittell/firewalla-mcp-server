/**
 * Field Mapping Utilities for Cross-Reference Searches
 * Handles field compatibility between different Firewalla data types
 */

import { SafeAccess } from './error-handler.js';

/**
 * Interface for entities that can be used in field mapping and correlation
 */
export type MappableEntity = Record<string, unknown>;

/**
 * Type for field values that can be used in correlations
 */
export type FieldValue = string | number | boolean | null | undefined;

export type EntityType = 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists';

/**
 * Field mapping configuration for each entity type
 */
export const FIELD_MAPPINGS: Record<EntityType, Record<string, string[]>> = {
  flows: {
    'source_ip': ['source.ip', 'device.ip', 'srcIP'],
    'destination_ip': ['destination.ip', 'dstIP'],
    'device_ip': ['device.ip', 'source.ip'],
    'protocol': ['protocol'],
    'bytes': ['bytes', 'download', 'upload'],
    'timestamp': ['ts', 'timestamp'],
    'device_id': ['device.id', 'device.gid'],
    'direction': ['direction'],
    'blocked': ['block', 'blocked'],
    'gid': ['gid', 'device.gid'],
    // Enhanced network fields
    'subnet': ['source.subnet', 'destination.subnet', 'device.subnet'],
    'network_segment': ['device.network.segment', 'network.segment'],
    'port': ['source.port', 'destination.port', 'srcPort', 'dstPort'],
    'port_range': ['port_range', 'target.port'],
    // Enhanced device fields
    'device_type': ['device.type', 'device.category'],
    'device_vendor': ['device.macVendor', 'device.vendor'],
    'device_group': ['device.group.id', 'device.group'],
    'mac_vendor': ['device.macVendor', 'macVendor'],
    'device_category': ['device.category', 'category'],
    // Enhanced temporal fields
    'time_window': ['time_window', 'ts'],
    'hour_of_day': ['hour', 'ts'],
    'day_of_week': ['day', 'ts'],
    'time_pattern': ['time_pattern', 'ts'],
    // Enhanced security fields
    'threat_level': ['threat.level', 'risk_level'],
    'attack_vector': ['attack.vector', 'method'],
    'geo_location': ['geo.country', 'location.country', 'country'],
    'asn': [
      'destination.geo.asn',
      'source.geo.asn',
      'geo.asn', 
      'location.asn', 
      'asn', 
      'as_number'
    ],
    // Application-level fields
    'user_agent': ['headers.userAgent', 'userAgent', 'ua'],
    'application': ['app', 'application', 'service'],
    'application_category': ['app.category', 'service.category'],
    'domain_category': ['domain.category', 'category'],
    'ssl_subject': ['ssl.subject', 'tls.subject'],
    'ssl_issuer': ['ssl.issuer', 'tls.issuer'],
    // Behavioral pattern fields
    'session_duration': ['duration', 'session.duration'],
    'frequency_score': ['frequency', 'rate'],
    'bytes_per_session': ['bytesPerSession', 'avgBytes'],
    'connection_pattern': ['pattern', 'connectionPattern'],
    'activity_level': ['activity', 'level'],
    // Enhanced geographic fields (prioritize enriched data)
    'country': [
      'destination.geo.country', 
      'source.geo.country',
      'geo.country', 
      'location.country', 
      'country', 
      'region'
    ],
    'country_code': [
      'destination.geo.country_code',
      'source.geo.country_code',
      'geo.countryCode', 
      'location.countryCode', 
      'countryCode'
    ],
    'continent': [
      'destination.geo.continent',
      'source.geo.continent',
      'geo.continent', 
      'location.continent'
    ],
    'region': [
      'destination.geo.region',
      'source.geo.region',
      'geo.region', 
      'location.region', 
      'region'
    ],
    'city': [
      'destination.geo.city',
      'source.geo.city',
      'geo.city', 
      'location.city'
    ],
    'timezone': [
      'destination.geo.timezone',
      'source.geo.timezone',
      'geo.timezone', 
      'location.timezone'
    ],
    'isp': [
      'destination.geo.isp',
      'source.geo.isp',
      'geo.isp', 
      'location.isp', 
      'isp'
    ],
    'organization': [
      'destination.geo.organization',
      'source.geo.organization',
      'geo.organization', 
      'location.organization', 
      'org'
    ],
    'hosting_provider': [
      'destination.geo.hosting_provider',
      'source.geo.hosting_provider',
      'geo.hosting', 
      'location.hosting', 
      'hosting'
    ],
    'is_cloud_provider': [
      'destination.geo.is_cloud_provider',
      'source.geo.is_cloud_provider',
      'geo.isCloud', 
      'location.isCloud', 
      'cloud'
    ],
    'is_proxy': [
      'destination.geo.is_proxy',
      'source.geo.is_proxy',
      'geo.isProxy', 
      'location.isProxy', 
      'proxy'
    ],
    'is_vpn': [
      'destination.geo.is_vpn',
      'source.geo.is_vpn',
      'geo.isVPN', 
      'location.isVPN', 
      'vpn'
    ],
    'geographic_risk_score': [
      'destination.geo.geographic_risk_score',
      'source.geo.geographic_risk_score',
      'geo.riskScore', 
      'location.riskScore', 
      'geoRisk'
    ]
  },
  alarms: {
    'source_ip': ['device.ip', 'remote.ip'],
    'destination_ip': ['remote.ip', 'device.ip'],
    'device_ip': ['device.ip'],
    'protocol': ['protocol'],
    'timestamp': ['ts', 'timestamp'],
    'device_id': ['device.id', 'device.gid'],
    'type': ['type'],
    'severity': ['type', 'severity'],
    'status': ['status'],
    'message': ['message'],
    'gid': ['gid'],
    // Enhanced network fields
    'subnet': ['device.subnet', 'remote.subnet'],
    'port': ['port', 'remote.port'],
    // Enhanced temporal fields
    'time_window': ['time_window', 'ts'],
    'hour_of_day': ['hour', 'ts'],
    'day_of_week': ['day', 'ts'],
    'time_pattern': ['time_pattern', 'ts'],
    // Enhanced security fields
    'threat_level': ['threat.level', 'risk_level', 'severity'],
    'attack_vector': ['attack.vector', 'method', 'type'],
    'geo_location': ['geo.country', 'location.country', 'country'],
    'asn': [
      'remote.geo.asn',
      'geo.asn', 
      'location.asn', 
      'asn', 
      'as_number', 
      'remote.asn'
    ],
    // Application-level fields
    'user_agent': ['headers.userAgent', 'userAgent', 'ua', 'remote.userAgent'],
    'application': ['app', 'application', 'service', 'remote.app'],
    'application_category': ['app.category', 'service.category', 'remote.category'],
    'domain_category': ['domain.category', 'category', 'remote.domainCategory'],
    'ssl_subject': ['ssl.subject', 'tls.subject', 'remote.sslSubject'],
    'ssl_issuer': ['ssl.issuer', 'tls.issuer', 'remote.sslIssuer'],
    // Behavioral pattern fields
    'session_duration': ['duration', 'session.duration', 'remote.duration'],
    'frequency_score': ['frequency', 'rate', 'remote.frequency'],
    'bytes_per_session': ['bytesPerSession', 'avgBytes', 'remote.avgBytes'],
    'connection_pattern': ['pattern', 'connectionPattern', 'remote.pattern'],
    'activity_level': ['activity', 'level', 'remote.activity'],
    // Enhanced geographic fields (prioritize enriched data)
    'country': [
      'remote.geo.country',
      'geo.country', 
      'location.country', 
      'country', 
      'remote.country'
    ],
    'country_code': [
      'remote.geo.country_code',
      'geo.countryCode', 
      'location.countryCode', 
      'remote.countryCode'
    ],
    'continent': [
      'remote.geo.continent',
      'geo.continent', 
      'location.continent', 
      'remote.continent'
    ],
    'region': [
      'remote.geo.region',
      'geo.region', 
      'location.region', 
      'remote.region'
    ],
    'city': [
      'remote.geo.city',
      'geo.city', 
      'location.city', 
      'remote.city'
    ],
    'timezone': [
      'remote.geo.timezone',
      'geo.timezone', 
      'location.timezone', 
      'remote.timezone'
    ],
    'isp': [
      'remote.geo.isp',
      'geo.isp', 
      'location.isp', 
      'remote.isp'
    ],
    'organization': [
      'remote.geo.organization',
      'geo.organization', 
      'location.organization', 
      'remote.org'
    ],
    'hosting_provider': [
      'remote.geo.hosting_provider',
      'geo.hosting', 
      'location.hosting', 
      'remote.hosting'
    ],
    'is_cloud_provider': [
      'remote.geo.is_cloud_provider',
      'geo.isCloud', 
      'location.isCloud', 
      'remote.cloud'
    ],
    'is_proxy': [
      'remote.geo.is_proxy',
      'geo.isProxy', 
      'location.isProxy', 
      'remote.proxy'
    ],
    'is_vpn': [
      'remote.geo.is_vpn',
      'geo.isVPN', 
      'location.isVPN', 
      'remote.vpn'
    ],
    'geographic_risk_score': [
      'remote.geo.geographic_risk_score',
      'geo.riskScore', 
      'location.riskScore', 
      'remote.geoRisk'
    ]
  },
  rules: {
    'target_value': ['target.value'],
    'target_type': ['target.type'],
    'action': ['action'],
    'direction': ['direction'],
    'status': ['status'],
    'protocol': ['protocol'],
    'hit_count': ['hit.count'],
    'timestamp': ['ts', 'updateTs'],
    'gid': ['gid'],
    'id': ['id'],
    // Enhanced network fields
    'port': ['port', 'target.port'],
    'port_range': ['port_range', 'target.port_range'],
    // Enhanced rule and policy fields
    'policy_group': ['policy.group', 'group'],
    'rule_category': ['category', 'type'],
    'target_domain': ['target.domain', 'target.value'],
    'target_category': ['target.category', 'category']
  },
  devices: {
    'device_ip': ['ip', 'ipAddress'],
    'device_id': ['id', 'gid'],
    'mac': ['mac', 'macAddress'],
    'name': ['name', 'hostname'],
    'vendor': ['macVendor', 'manufacturer'],
    'online': ['online', 'isOnline'],
    'last_seen': ['lastSeen', 'onlineTs'],
    'network_id': ['network.id'],
    'group_id': ['group.id'],
    'gid': ['gid'],
    // Enhanced device fields
    'device_type': ['type', 'category'],
    'device_vendor': ['macVendor', 'vendor'],
    'device_group': ['group.id', 'group'],
    'mac_vendor': ['macVendor'],
    'device_category': ['category', 'type'],
    // Enhanced network fields
    'subnet': ['subnet', 'network.subnet'],
    'network_segment': ['network.segment', 'segment']
  },
  target_lists: {
    'name': ['name'],
    'category': ['category'],
    'owner': ['owner'],
    'target_count': ['targets.length'],
    'last_updated': ['lastUpdated'],
    'id': ['id'],
    // Enhanced target list fields
    'target_category': ['category', 'target.category'],
    'target_domain': ['domain', 'targets.domain']
  }
};

/**
 * Retrieves the value of a specified field from an entity object of a given type, using mapped field paths when available.
 *
 * If the field has mapped paths for the entity type, attempts each path in order and returns the first non-null, non-undefined value found. Falls back to direct field access if no mapping exists.
 *
 * @param entity - The entity object to extract the field value from
 * @param field - The standardized field name to retrieve
 * @param entityType - The type of the entity, used to determine field mappings
 * @returns The value of the field if found, otherwise `undefined`
 */
/**
 * Extracts the value of a field from an entity using entity-specific field mappings
 * 
 * @param entity - The entity object to extract the field value from
 * @param field - The logical field name to extract
 * @param entityType - The type of entity to determine the correct field mapping
 * @returns The extracted field value, or undefined if not found
 */
export function getFieldValue(entity: MappableEntity, field: string, entityType: EntityType): FieldValue {
  if (!entity || typeof entity !== 'object') {
    return undefined;
  }

  const mappings = FIELD_MAPPINGS[entityType];
  if (!mappings?.[field]) {
    // Fallback to direct field access
    return SafeAccess.getNestedValue(entity, field) as FieldValue;
  }

  const fieldPaths = mappings[field];
  
  // Try each mapped field path until we find a value
  for (const path of fieldPaths) {
    const value = SafeAccess.getNestedValue(entity, path);
    if (value !== undefined && value !== null) {
      return value as FieldValue;
    }
  }

  return undefined;
}

