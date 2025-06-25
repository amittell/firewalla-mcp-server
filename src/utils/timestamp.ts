/**
 * Timestamp utility functions for consistent date formatting
 * Handles conversion from Unix timestamps (seconds) to ISO 8601 strings
 */

/**
 * Converts a Unix timestamp (seconds) to ISO 8601 string format
 * @param timestamp - Unix timestamp in seconds (number or string)
 * @returns ISO 8601 formatted date string
 * @throws Error if timestamp is invalid
 */
export function unixToISOString(timestamp: number | string | null | undefined): string {
  if (timestamp === null || timestamp === undefined) {
    throw new Error('Timestamp cannot be null or undefined');
  }

  const numTimestamp = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  
  if (isNaN(numTimestamp) || !isFinite(numTimestamp)) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  if (numTimestamp < 0) {
    throw new Error(`Timestamp cannot be negative: ${numTimestamp}`);
  }

  // Convert from Unix timestamp (seconds) to milliseconds and create ISO string
  return new Date(numTimestamp * 1000).toISOString();
}

/**
 * Safely converts a Unix timestamp to ISO string with fallback
 * @param timestamp - Unix timestamp in seconds (number or string)
 * @param fallback - Fallback value if timestamp is invalid (default: 'Never')
 * @returns ISO 8601 formatted date string or fallback value
 */
export function safeUnixToISOString(
  timestamp: number | string | null | undefined, 
  fallback: string = 'Never'
): string {
  try {
    if (timestamp === null || timestamp === undefined) {
      return fallback;
    }
    return unixToISOString(timestamp);
  } catch {
    return fallback;
  }
}

/**
 * Converts Unix timestamp to ISO string or returns current time if invalid
 * @param timestamp - Unix timestamp in seconds (number or string)
 * @returns ISO 8601 formatted date string (current time if timestamp invalid)
 */
export function unixToISOStringOrNow(timestamp: number | string | null | undefined): string {
  try {
    if (timestamp === null || timestamp === undefined) {
      return new Date().toISOString();
    }
    return unixToISOString(timestamp);
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Gets the current timestamp in ISO 8601 format
 * @returns Current date and time as ISO 8601 string
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}