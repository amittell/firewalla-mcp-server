/**
 * Simple alarm ID validation for Firewalla MCP Server
 * Replaces the complex AlarmIdNormalizer with elegant simplicity
 */
/**
 * Validates that an alarm ID is acceptable for API calls
 * @param id - The alarm ID to validate
 * @returns The validated alarm ID (trimmed)
 * @throws Error if the ID is invalid
 */
export declare function validateAlarmId(id: string | number): string;
/**
 * Validates alarm ID without throwing (returns null on invalid)
 * @param id - The alarm ID to validate
 * @returns The validated alarm ID or null if invalid
 */
export declare function validateAlarmIdSafe(id: string | number): string | null;
//# sourceMappingURL=alarm-id-validation.d.ts.map