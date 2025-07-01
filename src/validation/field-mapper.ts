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
import { 
  performEnhancedCorrelation,
  DEFAULT_CORRELATION_WEIGHTS,
  DEFAULT_FUZZY_CONFIG,
  type ScoredCorrelationResult, 
  type EnhancedCorrelationStats,
  type CorrelationWeights,
  type FuzzyMatchConfig
} from './enhanced-correlation.js';
import { getRecommendedFieldCombinations } from '../config/correlation-patterns.js';

export type EntityType = 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists';

/**
 * Valid correlation field names for type safety
 */
export type CorrelationFieldName = 
  | 'source_ip' | 'destination_ip' | 'device_ip' | 'device_id'
  | 'protocol' | 'bytes' | 'timestamp' | 'direction' | 'blocked'
  | 'gid' | 'subnet' | 'network_segment' | 'port' | 'port_range'
  | 'device_type' | 'device_vendor' | 'device_group' | 'mac_vendor'
  | 'device_category' | 'time_window' | 'hour_of_day' | 'day_of_week'
  | 'time_pattern' | 'country' | 'continent' | 'city' | 'region'
  | 'asn' | 'organization' | 'hosting_provider' | 'is_cloud_provider'
  | 'is_proxy' | 'is_vpn' | 'geographic_risk_score' | 'timezone'
  | 'isp' | 'user_agent' | 'application' | 'application_category'
  | 'domain_category' | 'ssl_subject' | 'ssl_issuer' | 'session_duration'
  | 'frequency_score' | 'bytes_per_session' | 'connection_pattern'
  | 'activity_level' | 'mac' | 'name' | 'vendor' | 'online' | 'last_seen'
  | 'network_id' | 'group_id' | 'severity' | 'alarm_type' | 'type'
  | 'resolution_status' | 'aid' | 'message_type' | 'category'
  | 'rule_category' | 'target_domain' | 'target_category'
  | 'action' | 'target_value' | 'creation_time' | 'last_hit'
  | 'hit_count' | 'rule_status' | 'direction' | 'policy_group'
  | 'owner' | 'target_count' | 'last_updated';

/**
 * Valid correlation operation types
 */
export type CorrelationType = 'AND' | 'OR';

/**
 * Valid time window units for temporal correlation
 */
export type TimeWindowUnit = 'seconds' | 'minutes' | 'hours' | 'days';

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
    'asn': ['geo.asn', 'location.asn', 'asn', 'as_number'],
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
    // Enhanced geographic fields
    'country': ['geo.country', 'location.country', 'country', 'region'],
    'country_code': ['geo.countryCode', 'location.countryCode', 'countryCode'],
    'continent': ['geo.continent', 'location.continent'],
    'region': ['geo.region', 'location.region', 'region'],
    'city': ['geo.city', 'location.city'],
    'timezone': ['geo.timezone', 'location.timezone'],
    'isp': ['geo.isp', 'location.isp', 'isp'],
    'organization': ['geo.organization', 'location.organization', 'org'],
    'hosting_provider': ['geo.hosting', 'location.hosting', 'hosting'],
    'is_cloud_provider': ['geo.isCloud', 'location.isCloud', 'cloud'],
    'is_proxy': ['geo.isProxy', 'location.isProxy', 'proxy'],
    'is_vpn': ['geo.isVPN', 'location.isVPN', 'vpn'],
    'geographic_risk_score': ['geo.riskScore', 'location.riskScore', 'geoRisk']
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
    'asn': ['geo.asn', 'location.asn', 'asn', 'as_number', 'remote.asn'],
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
    // Enhanced geographic fields
    'country': ['geo.country', 'location.country', 'country', 'remote.country'],
    'country_code': ['geo.countryCode', 'location.countryCode', 'remote.countryCode'],
    'continent': ['geo.continent', 'location.continent', 'remote.continent'],
    'region': ['geo.region', 'location.region', 'remote.region'],
    'city': ['geo.city', 'location.city', 'remote.city'],
    'timezone': ['geo.timezone', 'location.timezone', 'remote.timezone'],
    'isp': ['geo.isp', 'location.isp', 'remote.isp'],
    'organization': ['geo.organization', 'location.organization', 'remote.org'],
    'hosting_provider': ['geo.hosting', 'location.hosting', 'remote.hosting'],
    'is_cloud_provider': ['geo.isCloud', 'location.isCloud', 'remote.cloud'],
    'is_proxy': ['geo.isProxy', 'location.isProxy', 'remote.proxy'],
    'is_vpn': ['geo.isVPN', 'location.isVPN', 'remote.vpn'],
    'geographic_risk_score': ['geo.riskScore', 'location.riskScore', 'remote.geoRisk']
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
 * Common correlation fields that can be used across different entity types
 */
export const CORRELATION_FIELDS: Record<string, EntityType[]> = {
  'source_ip': ['flows', 'alarms'],
  'destination_ip': ['flows', 'alarms'],
  'device_ip': ['flows', 'alarms', 'devices'],
  'device_id': ['flows', 'alarms', 'devices'],
  'protocol': ['flows', 'alarms', 'rules'],
  'timestamp': ['flows', 'alarms', 'rules'],
  'gid': ['flows', 'alarms', 'rules', 'devices'],
  'direction': ['flows', 'rules'],
  'status': ['alarms', 'rules'],
  // Enhanced network correlations
  'subnet': ['flows', 'alarms', 'devices'],
  'network_segment': ['flows', 'devices'],
  'port': ['flows', 'alarms', 'rules'],
  'port_range': ['flows', 'rules'],
  // Enhanced device correlations
  'device_type': ['devices', 'flows'],
  'device_vendor': ['devices', 'flows'],
  'device_group': ['devices', 'flows'],
  'mac_vendor': ['devices', 'flows'],
  'device_category': ['devices', 'flows'],
  // Enhanced temporal correlations
  'time_window': ['flows', 'alarms', 'rules'],
  'hour_of_day': ['flows', 'alarms'],
  'day_of_week': ['flows', 'alarms'],
  'time_pattern': ['flows', 'alarms'],
  // Enhanced rule and policy correlations
  'policy_group': ['rules', 'flows'],
  'rule_category': ['rules', 'flows'],
  'target_domain': ['rules', 'flows'],
  'target_category': ['rules', 'target_lists'],
  // Enhanced security correlations
  'threat_level': ['alarms', 'flows'],
  'attack_vector': ['alarms', 'flows'],
  'geo_location': ['flows', 'alarms'],
  'asn': ['flows', 'alarms'],
  // Enhanced geographic correlations
  'country': ['flows', 'alarms'],
  'country_code': ['flows', 'alarms'],
  'continent': ['flows', 'alarms'],
  'region': ['flows', 'alarms'],
  'city': ['flows', 'alarms'],
  'timezone': ['flows', 'alarms'],
  'isp': ['flows', 'alarms'],
  'organization': ['flows', 'alarms'],
  'hosting_provider': ['flows', 'alarms'],
  'is_cloud_provider': ['flows', 'alarms'],
  'is_proxy': ['flows', 'alarms'],
  'is_vpn': ['flows', 'alarms'],
  'geographic_risk_score': ['flows', 'alarms'],
  // Application-level correlations
  'user_agent': ['flows', 'alarms'],
  'application': ['flows', 'alarms'],
  'application_category': ['flows', 'alarms'],
  'domain_category': ['flows', 'alarms'],
  'ssl_subject': ['flows', 'alarms'],
  'ssl_issuer': ['flows', 'alarms'],
  // Behavioral pattern correlations
  'session_duration': ['flows', 'alarms'],
  'frequency_score': ['flows', 'alarms'],
  'bytes_per_session': ['flows', 'alarms'],
  'connection_pattern': ['flows', 'alarms'],
  'activity_level': ['flows', 'alarms']
};

/**
 * Returns the list of correlation fields that are supported by both specified entity types.
 *
 * @param primaryType - The first entity type to compare
 * @param secondaryType - The second entity type to compare
 * @returns An array of correlation field names compatible with both entity types
 */
/**
 * Gets the list of fields that are compatible between two entity types for correlation
 * 
 * @param primaryType - The primary entity type to match against
 * @param secondaryType - The secondary entity type to match against
 * @returns Array of field names that can be used for correlation between the two types
 */
export function getCompatibleFields(primaryType: EntityType, secondaryType: EntityType): string[] {
  const compatibleFields: string[] = [];
  
  for (const [field, supportedTypes] of Object.entries(CORRELATION_FIELDS)) {
    if (supportedTypes.includes(primaryType) && supportedTypes.includes(secondaryType)) {
      compatibleFields.push(field);
    }
  }
  
  return compatibleFields;
}

/**
 * Determines whether a correlation field is supported by all specified entity types.
 *
 * @param field - The correlation field to check
 * @param entityTypes - The list of entity types to validate against
 * @returns True if the field is supported by every entity type in the list; otherwise, false
 */
export function isFieldCompatible(field: string, entityTypes: EntityType[]): boolean {
  const supportedTypes = CORRELATION_FIELDS[field];
  if (!supportedTypes) {
    return false;
  }
  
  return entityTypes.every(type => supportedTypes.includes(type));
}

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

/**
 * Extracts unique correlation values from a collection of entities for a specific field
 * 
 * Normalization ensures consistent comparison of values such as IP addresses, MAC addresses, and protocol names.
 * 
 * @param results - Array of entities to extract values from
 * @param field - The field name to extract values for
 * @param entityType - The type of entities in the results array
 * @returns Set of unique field values found in the entities
 */
export function extractCorrelationValues(
  results: MappableEntity[],
  field: string,
  entityType: EntityType
): Set<FieldValue> {
  const values = new Set<FieldValue>();
  
  const safeResults = SafeAccess.ensureArray(results);
  
  for (const entity of safeResults) {
    const value = getFieldValue(entity as MappableEntity, field, entityType);
    if (value !== undefined && value !== null && value !== '') {
      // Normalize IP addresses and other common field types
      const normalizedValue = normalizeFieldValue(value, field);
      values.add(normalizedValue);
    }
  }
  
  return values;
}

/**
 * Normalizes a field value for consistent comparison across different entities
 * 
 * Trims and lowercases IP addresses, removes separators and lowercases MAC addresses, 
 * lowercases protocol names, and returns other values unchanged.
 * 
 * @param value - The field value to normalize
 * @param field - The field name (used to determine normalization strategy)
 * @returns The normalized field value suitable for comparison
 */
export function normalizeFieldValue(value: FieldValue, field: string): FieldValue {
  if (typeof value !== 'string') {
    return value;
  }

  // Normalize IP addresses with validation
  if (field.includes('ip')) {
    const normalized = value.trim().toLowerCase();
    
    // Enhanced IP validation with comprehensive checks
    const isValidIPv4 = (ip: string): boolean => {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(ip)) { return false; }
      
      const octets = ip.split('.');
      // Check for leading zeros (except single '0')
      if (octets.some(octet => octet.length > 1 && octet.startsWith('0'))) {
        return false;
      }
      
      return octets.every(octet => {
        const num = parseInt(octet, 10);
        return num >= 0 && num <= 255;
      });
    };
    
    const isValidIPv6 = (ip: string): boolean => {
      // Handle IPv4-mapped IPv6 addresses
      if (ip.includes('.')) {
        const ipv4MappedRegex = /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i;
        if (ipv4MappedRegex.test(ip)) {
          const ipv4Part = ip.substring(7); // Remove "::ffff:"
          return isValidIPv4(ipv4Part);
        }
        return false;
      }
      
      // Standard IPv6 validation
      const fullRegex = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
      const compressedRegex = /^(([0-9a-f]{1,4}:)*)?::?(([0-9a-f]{1,4}:)*[0-9a-f]{1,4})?$/i;
      
      // Check for valid hex segments
      if (fullRegex.test(ip)) { return true; }
      if (compressedRegex.test(ip)) {
        // Ensure no more than one "::" compression
        const compressionCount = (ip.match(/::/g) || []).length;
        if (compressionCount > 1) { return false; }
        
        // Validate segment count doesn't exceed IPv6 limits
        const segments = ip.split(':').filter(seg => seg !== '');
        return segments.length <= 8 && segments.every(seg => /^[0-9a-f]{0,4}$/i.test(seg));
      }
      
      return false;
    };
    
    if (!isValidIPv4(normalized) && !isValidIPv6(normalized)) {
      // eslint-disable-next-line no-console
      console.warn(`Invalid IP address format: ${normalized}`);
    }
    
    return normalized;
  }

  // Normalize MAC addresses
  if (field === 'mac') {
    return value.replace(/[:-]/g, '').toLowerCase();
  }

  // Normalize protocol names
  if (field === 'protocol') {
    return value.toLowerCase();
  }

  // Normalize geographic fields
  if (field.includes('country') || field === 'continent' || field === 'region' || field === 'city') {
    return value.trim().toLowerCase();
  }

  // Normalize ASN values
  if (field === 'asn') {
    return value.trim();
  }

  return value;
}

/**
 * Returns entities whose normalized value for a specified correlation field matches any value in the provided set.
 *
 * Filters the input array to include only those entities where the normalized value of the given field is present in `correlationValues`.
 *
 * @param results - The array of entities to filter
 * @param field - The correlation field to evaluate
 * @param entityType - The type of entity being filtered
 * @param correlationValues - Set of normalized values to match against
 * @returns An array of entities matching the correlation criteria
 */
/**
 * Filters entities based on correlation values for a specific field
 * 
 * @param results - Array of entities to filter
 * @param field - The field name to use for correlation
 * @param entityType - The type of entities in the results array
 * @param correlationValues - Set of values to match against
 * @returns Filtered array of entities that match the correlation values
 */
export function filterByCorrelation(
  results: MappableEntity[],
  field: string,
  entityType: EntityType,
  correlationValues: Set<FieldValue>
): MappableEntity[] {
  const safeResults = SafeAccess.ensureArray(results);
  
  return (safeResults as MappableEntity[]).filter(entity => {
    const value = getFieldValue(entity, field, entityType);
    if (value === undefined || value === null) {
      return false;
    }
    
    const normalizedValue = normalizeFieldValue(value, field);
    return correlationValues.has(normalizedValue);
  });
}

/**
 * Suggests the most likely entity type for a query string based on the presence of keywords or field patterns.
 *
 * Returns the matching entity type if recognized, or defaults to 'flows' if no specific pattern is found.
 *
 * @param query - The input query string to analyze
 * @returns The suggested entity type, or null if no match is found
 */
export function suggestEntityType(query: string): EntityType | null {
  const lowerQuery = query.toLowerCase();
  
  // Look for entity-specific field patterns
  if (lowerQuery.includes('target_value') || lowerQuery.includes('action:') || lowerQuery.includes('hit_count')) {
    return 'rules';
  }
  
  if (lowerQuery.includes('severity:') || lowerQuery.includes('alarm') || lowerQuery.includes('status:')) {
    return 'alarms';
  }
  
  if (lowerQuery.includes('online:') || lowerQuery.includes('mac_vendor') || lowerQuery.includes('last_seen')) {
    return 'devices';
  }
  
  if (lowerQuery.includes('download') || lowerQuery.includes('upload') || lowerQuery.includes('blocked:')) {
    return 'flows';
  }
  
  if (lowerQuery.includes('category:') || lowerQuery.includes('owner:') || lowerQuery.includes('targets')) {
    return 'target_lists';
  }
  
  // Default to flows for generic queries
  return 'flows';
}

/**
 * Validates parameters for a cross-reference search, ensuring queries and correlation field are present and compatible.
 *
 * Checks that the primary query, secondary queries, and correlation field are non-empty, suggests entity types for each query, and verifies that the correlation field is supported by all detected entity types.
 *
 * @param primaryQuery - The main search query string
 * @param secondaryQueries - An array of secondary search query strings
 * @param correlationField - The field name used for correlating entities
 * @returns An object indicating whether the parameters are valid, any error messages, and the detected entity types
 */
export function validateCrossReference(
  primaryQuery: string,
  secondaryQueries: string[],
  correlationField: string
): { isValid: boolean; errors: string[]; entityTypes?: EntityType[] } {
  const errors: string[] = [];
  
  // Validate queries are not empty
  if (!primaryQuery || primaryQuery.trim().length === 0) {
    errors.push('Primary query cannot be empty');
  }
  
  if (!secondaryQueries || !Array.isArray(secondaryQueries) || secondaryQueries.length === 0) {
    errors.push('At least one secondary query is required');
  }
  
  if (Array.isArray(secondaryQueries) && secondaryQueries.some(q => !q || q.trim().length === 0)) {
    errors.push('Secondary queries cannot be empty');
  }
  
  // Validate correlation field
  if (!correlationField || correlationField.trim().length === 0) {
    errors.push('Correlation field cannot be empty');
  }
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  // Suggest entity types
  const primaryType = suggestEntityType(primaryQuery);
  const secondaryTypes = secondaryQueries.map(q => suggestEntityType(q));
  const allTypes = [primaryType, ...secondaryTypes].filter(Boolean) as EntityType[];
  
  // Validate field compatibility
  if (!isFieldCompatible(correlationField, allTypes)) {
    const compatibleTypes = CORRELATION_FIELDS[correlationField] || [];
    errors.push(
      `Correlation field '${correlationField}' is not compatible with detected entity types. ` +
      `Field is supported by: ${compatibleTypes.join(', ')}`
    );
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    entityTypes: allTypes
  };
}

/**
 * Enhanced correlation parameters for multi-field correlation
 */
/**
 * Enhanced correlation parameters with strict type checking
 */
export interface EnhancedCorrelationParams {
  /** Array of correlation field names (must be valid CorrelationFieldName values) */
  correlationFields: CorrelationFieldName[];
  /** Type of correlation logic to apply */
  correlationType: CorrelationType;
  /** Optional temporal window for time-based correlation */
  temporalWindow?: {
    /** Size of the time window (must be positive) */
    windowSize: number;
    /** Unit of time for the window */
    windowUnit: TimeWindowUnit;
  };
  /** Optional network scope configuration */
  networkScope?: {
    /** Whether to include subnet-level matching */
    includeSubnets: boolean;
    /** Whether to include port-level matching */
    includePorts: boolean;
  };
  /** Optional device scope configuration */
  deviceScope?: {
    /** Whether to include vendor-level matching */
    includeVendor: boolean;
    /** Whether to include group-level matching */
    includeGroup: boolean;
  };
}

/**
 * Validates parameters for enhanced multi-field cross-reference search
 */
export function validateEnhancedCrossReference(
  primaryQuery: string,
  secondaryQueries: string[],
  correlationParams: EnhancedCorrelationParams
): { isValid: boolean; errors: string[]; entityTypes?: EntityType[] } {
  const errors: string[] = [];
  let entityTypes: EntityType[] | undefined;
  
  // Basic validation if we have correlation fields
  if (correlationParams.correlationFields && correlationParams.correlationFields.length > 0) {
    const basicValidation = validateCrossReference(primaryQuery, secondaryQueries, correlationParams.correlationFields[0]);
    const { isValid, errors: validationErrors, entityTypes: validatedEntityTypes } = basicValidation;
    if (!isValid) {
      errors.push(...validationErrors);
    }
    entityTypes = validatedEntityTypes;
  }
  
  // Validate correlation fields array
  if (!correlationParams.correlationFields || correlationParams.correlationFields.length === 0) {
    errors.push('At least one correlation field is required');
  }
  
  if (correlationParams.correlationFields.length > 5) {
    errors.push('Maximum of 5 correlation fields allowed for performance reasons');
  }
  
  // Validate correlation type
  if (!['AND', 'OR'].includes(correlationParams.correlationType)) {
    errors.push('Correlation type must be either "AND" or "OR"');
  }
  
  // Validate temporal window
  if (correlationParams.temporalWindow) {
    const { windowSize, windowUnit } = correlationParams.temporalWindow;
    if (!windowSize || windowSize <= 0) {
      errors.push('Temporal window size must be positive');
    }
    if (!['seconds', 'minutes', 'hours', 'days'].includes(windowUnit)) {
      errors.push('Temporal window unit must be one of: seconds, minutes, hours, days');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    entityTypes
  };
}

/**
 * Calculate correlation rate for a specific field
 */
function calculateFieldCorrelationRate(
  field: string,
  index: number,
  secondaryResults: MappableEntity[],
  secondaryType: EntityType,
  correlationValueSets: Array<Set<FieldValue>>
): { field: string; matchingItems: number; correlationRate: number } {
  const matchingItems = filterItemsByFieldValue(secondaryResults, field, secondaryType, correlationValueSets[index]);
  
  return {
    field,
    matchingItems: matchingItems.length,
    correlationRate: secondaryResults.length > 0 
      ? Math.round((matchingItems.length / secondaryResults.length) * 100)
      : 0
  };
}

/**
 * Filter items that have matching field values in the correlation set
 */
function filterItemsByFieldValue(
  items: MappableEntity[],
  field: string,
  entityType: EntityType,
  correlationValues: Set<FieldValue>
): MappableEntity[] {
  return items.filter(item => {
    const itemValue = getFieldValue(item, field, entityType);
    if (itemValue === undefined || itemValue === null) {
      return false;
    }
    const normalizedValue = normalizeFieldValue(itemValue, field);
    return correlationValues.has(normalizedValue);
  });
}

/**
 * Filter results based on multi-field correlation logic (AND/OR)
 */
function filterByCorrelationLogic(
  results: MappableEntity[],
  correlationFields: string[],
  correlationValueSets: Array<Set<FieldValue>>,
  entityType: EntityType,
  correlationType: 'AND' | 'OR'
): MappableEntity[] {
  return results.filter(item => {
    const fieldMatches = correlationFields.map((field, index) => {
      const itemValue = getFieldValue(item, field, entityType);
      if (itemValue === undefined || itemValue === null) {
        return false;
      }
      const normalizedValue = normalizeFieldValue(itemValue, field);
      return correlationValueSets[index].has(normalizedValue);
    });
    
    // Apply correlation logic
    return correlationType === 'AND' 
      ? fieldMatches.every(match => match)
      : fieldMatches.some(match => match);
  });
}

/**
 * Perform multi-field correlation between entity results
 */
export function performMultiFieldCorrelation(
  primaryResults: MappableEntity[],
  secondaryResults: MappableEntity[],
  primaryType: EntityType,
  secondaryType: EntityType,
  correlationParams: EnhancedCorrelationParams
): { correlatedResults: MappableEntity[]; correlationStats: Record<string, unknown>; warnings?: string[] } {
  const { correlationFields, correlationType } = correlationParams;
  const warnings: string[] = [];
  
  // Add dataset size warnings for large correlation operations
  const totalDatasetSize = primaryResults.length + secondaryResults.length;
  const primarySize = primaryResults.length;
  const secondarySize = secondaryResults.length;
  
  if (totalDatasetSize > 5000) {
    warnings.push(`Large dataset detected (${totalDatasetSize} items). Correlation may take longer than usual.`);
  }
  
  if (primarySize > 2000) {
    warnings.push(`Large primary dataset (${primarySize} items). Consider using more specific queries to improve performance.`);
  }
  
  if (secondarySize > 2000) {
    warnings.push(`Large secondary dataset (${secondarySize} items). Consider using more specific queries to improve performance.`);
  }
  
  // Warn about complex correlations
  const complexityScore = correlationFields.length * Math.max(primarySize, secondarySize);
  if (complexityScore > 10000) {
    warnings.push(`High complexity correlation (score: ${complexityScore}). Consider reducing correlation fields or dataset size.`);
  }
  
  // Warn about fuzzy matching on large datasets (if fuzzy matching is enabled)
  if ('enableFuzzyMatching' in correlationParams && correlationParams.enableFuzzyMatching && totalDatasetSize > 1000) {
    warnings.push(`Fuzzy matching on large dataset (${totalDatasetSize} items) may be slow. Consider using exact matching for better performance.`);
  }
  
  // Extract correlation values for each field from primary results
  const correlationValueSets = correlationFields.map(field => 
    extractCorrelationValues(primaryResults, field, primaryType)
  );
  
  // Filter secondary results based on correlation logic
  const correlatedResults = filterByCorrelationLogic(
    secondaryResults,
    correlationFields,
    correlationValueSets,
    secondaryType,
    correlationType
  );
  
  // Apply temporal window filtering if specified
  let temporallyFilteredResults = correlatedResults;
  if (correlationParams.temporalWindow && correlationFields.includes('timestamp')) {
    temporallyFilteredResults = applyTemporalWindowFilter(
      correlatedResults,
      primaryResults,
      correlationParams.temporalWindow,
      secondaryType,
      primaryType
    );
  }
  
  // Generate correlation statistics
  const correlationStats = {
    totalSecondaryResults: secondaryResults.length,
    correlatedResults: correlatedResults.length,
    temporallyFiltered: temporallyFilteredResults.length,
    correlationRate: secondaryResults.length > 0 
      ? Math.round((temporallyFilteredResults.length / secondaryResults.length) * 100) 
      : 0,
    fieldCorrelationRates: correlationFields.map((field, index) => 
      calculateFieldCorrelationRate(field, index, secondaryResults, secondaryType, correlationValueSets)
    )
  };
  
  return {
    correlatedResults: temporallyFilteredResults,
    correlationStats,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Apply temporal window filtering to correlation results
 */
function applyTemporalWindowFilter(
  correlatedResults: MappableEntity[],
  primaryResults: MappableEntity[],
  temporalWindow: { windowSize: number; windowUnit: string },
  secondaryType: EntityType,
  primaryType: EntityType
): MappableEntity[] {
  // Extract timestamp ranges from primary results
  const primaryTimestamps = primaryResults
    .map(item => getFieldValue(item, 'timestamp', primaryType))
    .filter(ts => ts !== undefined && ts !== null)
    .map(ts => typeof ts === 'number' ? ts : new Date(ts as string).getTime() / 1000)
    .sort((a, b) => a - b);
  
  if (primaryTimestamps.length === 0) {
    return correlatedResults;
  }
  
  const windowSizeSeconds = convertToSeconds(temporalWindow.windowSize, temporalWindow.windowUnit);
  const minTimestamp = Math.min(...primaryTimestamps) - windowSizeSeconds;
  const maxTimestamp = Math.max(...primaryTimestamps) + windowSizeSeconds;
  
  return correlatedResults.filter(item => {
    const itemTimestamp = getFieldValue(item, 'timestamp', secondaryType);
    if (itemTimestamp === undefined || itemTimestamp === null) {
      return false;
    }
    
    const normalizedTimestamp = typeof itemTimestamp === 'number' 
      ? itemTimestamp 
      : new Date(itemTimestamp as string).getTime() / 1000;
    
    return normalizedTimestamp >= minTimestamp && normalizedTimestamp <= maxTimestamp;
  });
}

/**
 * Convert time window to seconds
 */
function convertToSeconds(value: number, unit: string): number {
  switch (unit) {
    case 'seconds': return value;
    case 'minutes': return value * 60;
    case 'hours': return value * 3600;
    case 'days': return value * 86400;
    default: return value;
  }
}

/**
 * Get all supported correlation field combinations for a set of entity types
 */
export function getSupportedCorrelationCombinations(entityTypes: EntityType[]): string[][] {
  // Return empty array if no entity types provided
  if (!entityTypes || entityTypes.length === 0) {
    return [];
  }
  
  const allFields = Object.keys(CORRELATION_FIELDS);
  const supportedFields = allFields.filter(field => 
    isFieldCompatible(field, entityTypes)
  );
  
  // Return empty if no supported fields
  if (supportedFields.length === 0) {
    return [];
  }
  
  // Generate meaningful combinations (2-3 fields max for performance)
  const combinations: string[][] = [];
  
  // Single field combinations
  combinations.push(...supportedFields.map(field => [field]));
  
  // Two field combinations
  for (let i = 0; i < supportedFields.length; i++) {
    for (let j = i + 1; j < supportedFields.length; j++) {
      combinations.push([supportedFields[i], supportedFields[j]]);
    }
  }
  
  // Three field combinations from configurable patterns
  const recommendedCombinations = getRecommendedFieldCombinations(entityTypes)
    .filter(combo => combo.length === 3) // Only three-field combinations
    .filter(combo => combo.every(field => supportedFields.includes(field)));
  
  combinations.push(...recommendedCombinations);
  
  return combinations;
}

/**
 * Enhanced correlation parameters with scoring and fuzzy matching options
 */
export interface ScoringCorrelationParams extends EnhancedCorrelationParams {
  enableScoring?: boolean;
  enableFuzzyMatching?: boolean;
  minimumScore?: number;
  customWeights?: CorrelationWeights;
  fuzzyConfig?: FuzzyMatchConfig;
}

/**
 * Enhanced correlation result with scoring information
 */
export interface EnhancedCorrelationResult {
  correlatedResults: MappableEntity[];
  scoredResults?: ScoredCorrelationResult[];
  correlationStats: Record<string, unknown>;
  enhancedStats?: EnhancedCorrelationStats;
}

/**
 * Perform enhanced multi-field correlation with optional scoring and fuzzy matching
 * This extends the existing performMultiFieldCorrelation with advanced capabilities
 */
export function performEnhancedMultiFieldCorrelation(
  primaryResults: MappableEntity[],
  secondaryResults: MappableEntity[],
  primaryType: EntityType,
  secondaryType: EntityType,
  correlationParams: ScoringCorrelationParams
): EnhancedCorrelationResult {
  
  // Check if enhanced features are enabled
  const useEnhancedFeatures = correlationParams.enableScoring || correlationParams.enableFuzzyMatching;
  
  if (useEnhancedFeatures) {
    // Use new enhanced correlation algorithm
    const weights = correlationParams.customWeights || DEFAULT_CORRELATION_WEIGHTS;
    const fuzzyConfig = correlationParams.enableFuzzyMatching 
      ? (correlationParams.fuzzyConfig || DEFAULT_FUZZY_CONFIG)
      : { ...DEFAULT_FUZZY_CONFIG, enabled: false };
    
    const minimumScore = correlationParams.minimumScore || 0.3;
    
    const { correlatedResults: scoredResults, stats: enhancedStats } = performEnhancedCorrelation(
      primaryResults,
      secondaryResults,
      primaryType,
      secondaryType,
      correlationParams.correlationFields,
      correlationParams.correlationType,
      weights,
      fuzzyConfig,
      minimumScore
    );
    
    // Convert scored results back to standard format for backward compatibility
    const correlatedResults = scoredResults.map(scored => scored.entity);
    
    // Generate legacy stats for backward compatibility
    const legacyStats = {
      totalSecondaryResults: enhancedStats.totalSecondaryResults,
      correlatedResults: enhancedStats.correlatedResults,
      temporallyFiltered: enhancedStats.correlatedResults, // Same as correlated for enhanced
      correlationRate: enhancedStats.totalSecondaryResults > 0
        ? Math.round((enhancedStats.correlatedResults / enhancedStats.totalSecondaryResults) * 100)
        : 0,
      fieldCorrelationRates: correlationParams.correlationFields.map(field => {
        const fieldStats = enhancedStats.fieldStatistics[field];
        const totalMatches = fieldStats ? 
          fieldStats.exactMatches + fieldStats.fuzzyMatches + fieldStats.partialMatches : 0;
        
        return {
          field,
          matchingItems: totalMatches,
          correlationRate: enhancedStats.totalSecondaryResults > 0
            ? Math.round((totalMatches / enhancedStats.totalSecondaryResults) * 100)
            : 0
        };
      })
    };
    
    return {
      correlatedResults,
      scoredResults,
      correlationStats: legacyStats,
      enhancedStats
    };
    
  } 
    // Use legacy correlation algorithm
    const legacyResult = performMultiFieldCorrelation(
      primaryResults,
      secondaryResults,
      primaryType,
      secondaryType,
      correlationParams
    );
    
    return {
      correlatedResults: legacyResult.correlatedResults,
      correlationStats: legacyResult.correlationStats
    };
  
}