/**
 * Field Mapping Utilities for Cross-Reference Searches
 * Handles field compatibility between different Firewalla data types
 */

import { SafeAccess } from './error-handler.js';

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
    'gid': ['gid', 'device.gid']
  },
  alarms: {
    'source_ip': ['device.ip', 'remote.ip'],
    'destination_ip': ['remote.ip', 'device.ip'],
    'device_ip': ['device.ip'],
    'protocol': ['protocol'],
    'timestamp': ['ts', 'timestamp'],
    'device_id': ['device.id', 'device.gid'],
    'type': ['type'],
    'severity': ['severity'],
    'status': ['status'],
    'message': ['message'],
    'gid': ['gid']
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
    'id': ['id']
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
    'gid': ['gid']
  },
  target_lists: {
    'name': ['name'],
    'category': ['category'],
    'owner': ['owner'],
    'target_count': ['targets.length'],
    'last_updated': ['lastUpdated'],
    'id': ['id']
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
  'status': ['alarms', 'rules']
};

/**
 * Get compatible correlation fields between two entity types
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
 * Validate if a correlation field is compatible with given entity types
 */
export function isFieldCompatible(field: string, entityTypes: EntityType[]): boolean {
  const supportedTypes = CORRELATION_FIELDS[field];
  if (!supportedTypes) {
    return false;
  }
  
  return entityTypes.every(type => supportedTypes.includes(type));
}

/**
 * Get field value from an entity using mapped field paths
 */
export function getFieldValue(entity: any, field: string, entityType: EntityType): any {
  if (!entity || typeof entity !== 'object') {
    return undefined;
  }

  const mappings = FIELD_MAPPINGS[entityType];
  if (!mappings || !mappings[field]) {
    // Fallback to direct field access
    return SafeAccess.getNestedValue(entity, field);
  }

  const fieldPaths = mappings[field];
  
  // Try each mapped field path until we find a value
  for (const path of fieldPaths) {
    const value = SafeAccess.getNestedValue(entity, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

/**
 * Extract correlation values from a result set
 */
export function extractCorrelationValues(
  results: any[],
  field: string,
  entityType: EntityType
): Set<any> {
  const values = new Set<any>();
  
  const safeResults = SafeAccess.ensureArray(results);
  
  for (const entity of safeResults) {
    const value = getFieldValue(entity, field, entityType);
    if (value !== undefined && value !== null && value !== '') {
      // Normalize IP addresses and other common field types
      const normalizedValue = normalizeFieldValue(value, field);
      values.add(normalizedValue);
    }
  }
  
  return values;
}

/**
 * Normalize field values for consistent comparison
 */
export function normalizeFieldValue(value: any, field: string): any {
  if (typeof value !== 'string') {
    return value;
  }

  // Normalize IP addresses
  if (field.includes('ip')) {
    return value.trim().toLowerCase();
  }

  // Normalize MAC addresses
  if (field === 'mac') {
    return value.replace(/[:-]/g, '').toLowerCase();
  }

  // Normalize protocol names
  if (field === 'protocol') {
    return value.toLowerCase();
  }

  return value;
}

/**
 * Filter results by correlation field and values
 */
export function filterByCorrelation(
  results: any[],
  field: string,
  entityType: EntityType,
  correlationValues: Set<any>
): any[] {
  const safeResults = SafeAccess.ensureArray(results);
  
  return safeResults.filter(entity => {
    const value = getFieldValue(entity, field, entityType);
    if (value === undefined || value === null) {
      return false;
    }
    
    const normalizedValue = normalizeFieldValue(value, field);
    return correlationValues.has(normalizedValue);
  });
}

/**
 * Get suggested entity type for a query based on field usage
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
 * Validate cross-reference search parameters
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
  
  if (!secondaryQueries || secondaryQueries.length === 0) {
    errors.push('At least one secondary query is required');
  }
  
  if (secondaryQueries?.some(q => !q || q.trim().length === 0)) {
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