/**
 * Timestamp utility functions for consistent date formatting
 * Handles conversion from Unix timestamps (seconds) to ISO 8601 strings
 */

/**
 * Timestamp detection and conversion parameters
 */
interface TimestampDetectionResult {
  timestamp: number;
  format: 'unix_seconds' | 'unix_milliseconds' | 'iso_string' | 'unknown';
  confidence: number;
}

/**
 * Advanced timestamp detection and conversion to handle multiple formats
 */
export function detectAndConvertTimestamp(
  input: number | string | null | undefined
): TimestampDetectionResult | null {
  if (input === null || input === undefined) {
    return null;
  }

  // Handle ISO string format first
  if (typeof input === 'string') {
    // Try parsing as ISO date
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime())) {
      return {
        timestamp: isoDate.getTime(),
        format: 'iso_string',
        confidence: 1.0,
      };
    }

    // Try parsing as number string
    const numInput = Number(input);
    if (isNaN(numInput)) {
      return null;
    }
    input = numInput;
  }

  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    return null;
  }

  // Detect timestamp format based on magnitude
  const now = Date.now();
  const currentUnixSeconds = Math.floor(now / 1000);

  // Unix seconds range: roughly 1970 to 2038 (and beyond)
  if (input >= 946684800 && input <= 4102444800) {
    // 2000-01-01 to 2100-01-01
    const confidence =
      Math.abs(input - currentUnixSeconds) < 365 * 24 * 3600 ? 0.9 : 0.7; // High confidence if within a year
    return {
      timestamp: input * 1000, // Convert to milliseconds
      format: 'unix_seconds',
      confidence,
    };
  }

  // Unix milliseconds range
  if (input >= 946684800000 && input <= 4102444800000) {
    // 2000-01-01 to 2100-01-01 in ms
    const confidence =
      Math.abs(input - now) < 365 * 24 * 3600 * 1000 ? 0.9 : 0.7; // High confidence if within a year
    return {
      timestamp: input,
      format: 'unix_milliseconds',
      confidence,
    };
  }

  return null;
}

/**
 * Converts various timestamp formats to an ISO 8601 formatted date string with improved detection.
 *
 * @param timestamp - The timestamp in various formats (Unix seconds, Unix milliseconds, ISO string).
 * @returns The ISO 8601 formatted date string representing the given timestamp.
 * @throws Error if the timestamp is null, undefined, not a finite number, or negative.
 */
export function unixToISOString(
  timestamp: number | string | null | undefined
): string {
  if (timestamp === null || timestamp === undefined) {
    throw new Error('Timestamp cannot be null or undefined');
  }

  const detection = detectAndConvertTimestamp(timestamp);
  if (!detection) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  return new Date(detection.timestamp).toISOString();
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
export function unixToISOStringOrNow(
  timestamp: number | string | null | undefined
): string {
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

/**
 * Enhanced timestamp conversion with detailed detection information for debugging
 */
export function convertTimestampWithDetection(
  timestamp: number | string | null | undefined,
  options?: {
    fallback?: string;
    includeDetectionInfo?: boolean;
    minimumConfidence?: number;
  }
): string | { result: string; detection: TimestampDetectionResult } {
  const {
    fallback = 'Never',
    includeDetectionInfo = false,
    minimumConfidence = 0.5,
  } = options || {};

  try {
    if (timestamp === null || timestamp === undefined) {
      const result = fallback;
      return includeDetectionInfo
        ? {
            result,
            detection: { timestamp: 0, format: 'unknown', confidence: 0 },
          }
        : result;
    }

    const detection = detectAndConvertTimestamp(timestamp);
    if (!detection || detection.confidence < minimumConfidence) {
      const result = fallback;
      return includeDetectionInfo
        ? {
            result,
            detection: detection || {
              timestamp: 0,
              format: 'unknown',
              confidence: 0,
            },
          }
        : result;
    }

    const result = new Date(detection.timestamp).toISOString();
    return includeDetectionInfo ? { result, detection } : result;
  } catch {
    const result = fallback;
    return includeDetectionInfo
      ? {
          result,
          detection: { timestamp: 0, format: 'unknown', confidence: 0 },
        }
      : result;
  }
}

/**
 * Validates whether a value appears to be a valid timestamp
 */
export function isValidTimestamp(value: unknown): boolean {
  const detection = detectAndConvertTimestamp(value as number | string);
  return detection !== null && detection.confidence >= 0.5;
}

/**
 * Attempts to parse any reasonable timestamp format and return a Date object
 */
export function parseFlexibleTimestamp(input: unknown): Date | null {
  try {
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    const detection = detectAndConvertTimestamp(input as number | string);
    if (detection && detection.confidence >= 0.5) {
      return new Date(detection.timestamp);
    }

    return null;
  } catch {
    return null;
  }
}
