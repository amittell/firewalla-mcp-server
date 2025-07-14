/**
 * Simple Boolean Translator for Firewalla MCP Server
 *
 * Replaces the over-engineered BooleanFieldTranslator with a minimal solution
 * that solves only the documented problem: Firewalla API requires "blocked:1" not "blocked:true"
 *
 * Philosophy: OSS elegance over complexity, solve real problems minimally
 */

/**
 * Boolean fields that need translation for each entity type
 */
const BOOLEAN_FIELDS: Record<string, string[]> = {
  flows: ['blocked', 'allowed', 'encrypted', 'compressed'],
  alarms: ['resolved', 'acknowledged', 'dismissed', 'active'],
  rules: ['active', 'enabled', 'disabled', 'paused'],
  devices: ['online', 'monitored', 'blocked', 'trusted'],
};

/**
 * Translate boolean queries to Firewalla API format
 *
 * Problem: Firewalla API fails with "blocked:true" but works with "blocked:1"
 * Solution: Simple regex replacement for documented boolean fields
 *
 * @param query - Query string (e.g., "blocked:true AND protocol:tcp")
 * @param entityType - Entity type (flows, alarms, rules, devices)
 * @returns Translated query string
 */
export function translateBooleanQuery(
  query: string,
  entityType: string
): string {
  if (!query || typeof query !== 'string') {
    return query;
  }

  const booleanFields = BOOLEAN_FIELDS[entityType];
  if (!booleanFields) {
    return query; // No translation for unknown entity types
  }

  let translatedQuery = query;

  // Simple regex replacement for each boolean field
  for (const field of booleanFields) {
    // Replace "field:true" with "field:1"
    translatedQuery = translatedQuery.replace(
      new RegExp(`\\b${field}:true\\b`, 'gi'),
      `${field}:1`
    );

    // Replace "field:false" with "field:0"
    translatedQuery = translatedQuery.replace(
      new RegExp(`\\b${field}:false\\b`, 'gi'),
      `${field}:0`
    );

    // Replace "field=true" with "field:1" (equals syntax support)
    translatedQuery = translatedQuery.replace(
      new RegExp(`\\b${field}=true\\b`, 'gi'),
      `${field}:1`
    );

    // Replace "field=false" with "field:0" (equals syntax support)
    translatedQuery = translatedQuery.replace(
      new RegExp(`\\b${field}=false\\b`, 'gi'),
      `${field}:0`
    );
  }

  return translatedQuery;
}
