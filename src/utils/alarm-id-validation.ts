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
export function validateAlarmId(id: string | number): string {
  // Convert to string and trim
  const stringId = String(id).trim();

  // Check for empty or invalid IDs
  if (!stringId || stringId.length === 0) {
    throw new Error('Invalid alarm ID: cannot be empty');
  }

  // Reject obviously invalid IDs
  if (stringId === '0' || stringId === 'null' || stringId === 'undefined') {
    throw new Error(`Invalid alarm ID: "${stringId}" is not a valid alarm ID`);
  }

  return stringId;
}

/**
 * Validates alarm ID without throwing (returns null on invalid)
 * @param id - The alarm ID to validate
 * @returns The validated alarm ID or null if invalid
 */
export function validateAlarmIdSafe(id: string | number): string | null {
  try {
    return validateAlarmId(id);
  } catch {
    return null;
  }
}
