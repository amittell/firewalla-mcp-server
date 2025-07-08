/**
 * Simple correlation utilities for Firewalla MCP Server
 * Provides basic exact matching and CIDR subnet matching
 */

/**
 * Simple correlation result
 */
export interface SimpleCorrelationResult {
  entity: any;
  matchedFields: string[];
  matchType: 'exact' | 'subnet';
}

/**
 * Basic correlation statistics
 */
export interface SimpleCorrelationStats {
  totalSecondaryResults: number;
  correlatedResults: number;
  exactMatches: number;
  subnetMatches: number;
}

/**
 * Check if two IP addresses are in the same subnet
 */
function isInSameSubnet(ip1: string, ip2: string, cidr: number = 24): boolean {
  try {
    const ipToNumber = (ip: string) => {
      const parts = ip.split('.').map(Number);
      return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    };

    const mask = ~((1 << (32 - cidr)) - 1);
    const num1 = ipToNumber(ip1) & mask;
    const num2 = ipToNumber(ip2) & mask;
    
    return num1 === num2;
  } catch {
    return false;
  }
}

/**
 * Extract field value from entity
 */
function getFieldValue(entity: any, field: string): any {
  if (!entity || typeof entity !== 'object') {return null;}
  return entity[field] ?? null;
}

/**
 * Simple exact match correlation
 */
export function performSimpleCorrelation(
  primaryResults: any[],
  secondaryResults: any[],
  correlationFields: string[],
  allowSubnetMatch: boolean = true
): { correlatedResults: SimpleCorrelationResult[]; stats: SimpleCorrelationStats } {
  
  const correlatedResults: SimpleCorrelationResult[] = [];
  let exactMatches = 0;
  let subnetMatches = 0;

  // Extract primary field values
  const primaryValues = new Set<string>();
  const primaryIPs = new Set<string>();
  
  for (const primary of primaryResults) {
    for (const field of correlationFields) {
      const value = getFieldValue(primary, field);
      if (value !== null) {
        primaryValues.add(String(value));
        
        // Track IP addresses for subnet matching
        if (field.includes('ip') && typeof value === 'string') {
          primaryIPs.add(value);
        }
      }
    }
  }

  // Check each secondary result for correlation
  for (const secondary of secondaryResults) {
    const matchedFields: string[] = [];
    let matchType: 'exact' | 'subnet' = 'exact';
    let hasMatch = false;

    for (const field of correlationFields) {
      const value = getFieldValue(secondary, field);
      if (value === null) {continue;}

      const stringValue = String(value);

      // Check for exact match
      if (primaryValues.has(stringValue)) {
        matchedFields.push(field);
        hasMatch = true;
        continue;
      }

      // Check for subnet match on IP fields
      if (allowSubnetMatch && field.includes('ip') && typeof value === 'string') {
        for (const primaryIP of primaryIPs) {
          if (isInSameSubnet(value, primaryIP)) {
            matchedFields.push(field);
            matchType = 'subnet';
            hasMatch = true;
            break;
          }
        }
      }
    }

    if (hasMatch) {
      correlatedResults.push({
        entity: secondary,
        matchedFields,
        matchType
      });

      if (matchType === 'exact') {
        exactMatches++;
      } else {
        subnetMatches++;
      }
    }
  }

  const stats: SimpleCorrelationStats = {
    totalSecondaryResults: secondaryResults.length,
    correlatedResults: correlatedResults.length,
    exactMatches,
    subnetMatches
  };

  return { correlatedResults, stats };
}

/**
 * Simple cross-reference search
 */
export function performCrossReference(
  _primaryQuery: string,
  secondaryQueries: string[],
  correlationField: string,
  primaryResults: any[],
  secondaryResultSets: any[][]
): any[] {
  if (secondaryResultSets.length === 0) {return [];}

  const correlationValues = new Set<string>();
  
  // Extract correlation values from primary results
  for (const result of primaryResults) {
    const value = getFieldValue(result, correlationField);
    if (value !== null) {
      correlationValues.add(String(value));
    }
  }

  // Find matches in secondary results
  const crossReferences: any[] = [];
  
  for (let i = 0; i < secondaryResultSets.length; i++) {
    const secondaryResults = secondaryResultSets[i];
    const query = secondaryQueries[i];
    
    for (const result of secondaryResults) {
      const value = getFieldValue(result, correlationField);
      if (value !== null && correlationValues.has(String(value))) {
        crossReferences.push({
          ...result,
          correlation_field: correlationField,
          correlation_value: value,
          secondary_query: query
        });
      }
    }
  }

  return crossReferences;
}