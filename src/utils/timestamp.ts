/**
 * Timestamp utility functions for consistent date formatting
 * Handles conversion from Unix timestamps (seconds) to ISO 8601 strings
 */

/**
 * Converts a Unix timestamp in seconds to an ISO 8601 formatted date string.
 *
 * @param timestamp - The Unix timestamp in seconds, as a number or string.
 * @returns The ISO 8601 formatted date string representing the given timestamp.
 * @throws Error if the timestamp is null, undefined, not a finite number, or negative.
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
 * Converts a Unix timestamp (in seconds) to an ISO 8601 string, returning a fallback value if the input is invalid.
 *
 * @param timestamp - The Unix timestamp in seconds to convert.
 * @param fallback - The value to return if the timestamp is null, undefined, or invalid. Defaults to 'Never'.
 * @returns The ISO 8601 formatted date string, or the fallback value if conversion fails.
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
 * Converts a Unix timestamp (in seconds) to an ISO 8601 string, or returns the current time if the input is invalid or missing.
 *
 * @param timestamp - The Unix timestamp in seconds, as a number or string
 * @returns The ISO 8601 formatted date string, or the current date and time if the timestamp is invalid
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
 * Returns the current date and time as an ISO 8601 formatted string.
 *
 * @returns The current timestamp in ISO 8601 format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}