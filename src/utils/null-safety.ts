/**
 * Null safety utilities for parameter validation
 */

/**
 * Safely convert a value to a string, handling null/undefined
 */
export function safeString(value: any, defaultValue = ''): string {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

/**
 * Safely convert a value to a number, handling null/undefined
 */
export function safeNumber(value: any, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Safely convert a value to a boolean, handling null/undefined
 */
export function safeBoolean(value: any, defaultValue = false): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return Boolean(value);
}

/**
 * Validate and sanitize tool arguments, removing null/undefined values
 */
export function sanitizeToolArgs(args: any): Record<string, any> {
  if (!args || typeof args !== 'object') {
    return {};
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(args)) {
    // Skip null or undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Handle nested objects recursively
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nestedSanitized = sanitizeToolArgs(value);
      if (Object.keys(nestedSanitized).length > 0) {
        sanitized[key] = nestedSanitized;
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
