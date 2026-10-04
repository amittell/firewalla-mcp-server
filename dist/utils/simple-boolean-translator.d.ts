/**
 * Simple Boolean Translator for Firewalla MCP Server
 *
 * The search tools' boolean translation: the Firewalla API requires
 * "blocked:1", not "blocked:true"
 */
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
export declare function translateBooleanQuery(query: string, entityType: string): string;
//# sourceMappingURL=simple-boolean-translator.d.ts.map