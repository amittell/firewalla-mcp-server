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
export declare function detectAndConvertTimestamp(input: number | string | null | undefined): TimestampDetectionResult | null;
/**
 * Converts various timestamp formats to an ISO 8601 formatted date string with improved detection.
 *
 * @param timestamp - The timestamp in various formats (Unix seconds, Unix milliseconds, ISO string).
 * @returns The ISO 8601 formatted date string representing the given timestamp.
 * @throws Error if the timestamp is null, undefined, not a finite number, or negative.
 */
export declare function unixToISOString(timestamp: number | string | null | undefined): string;
/**
 * Converts a Unix timestamp (in seconds) to an ISO 8601 string, returning a fallback value if the input is invalid.
 *
 * @param timestamp - The Unix timestamp in seconds to convert.
 * @param fallback - The value to return if the timestamp is null, undefined, or invalid. Defaults to 'Never'.
 * @returns The ISO 8601 formatted date string, or the fallback value if conversion fails.
 */
export declare function safeUnixToISOString(timestamp: number | string | null | undefined, fallback?: string): string;
/**
 * Converts a Unix timestamp (in seconds) to an ISO 8601 string, or returns the current time if the input is invalid or missing.
 *
 * @param timestamp - The Unix timestamp in seconds, as a number or string
 * @returns The ISO 8601 formatted date string, or the current date and time if the timestamp is invalid
 */
export declare function unixToISOStringOrNow(timestamp: number | string | null | undefined): string;
/**
 * Returns the current date and time as an ISO 8601 formatted string.
 *
 * @returns The current timestamp in ISO 8601 format
 */
export declare function getCurrentTimestamp(): string;
/**
 * Enhanced timestamp conversion with detailed detection information for debugging
 */
export declare function convertTimestampWithDetection(timestamp: number | string | null | undefined, options?: {
    fallback?: string;
    includeDetectionInfo?: boolean;
    minimumConfidence?: number;
}): string | {
    result: string;
    detection: TimestampDetectionResult;
};
/**
 * Validates whether a value appears to be a valid timestamp
 */
export declare function isValidTimestamp(value: unknown): boolean;
/**
 * Attempts to parse any reasonable timestamp format and return a Date object
 */
export declare function parseFlexibleTimestamp(input: unknown): Date | null;
/**
 * Whether a query compares `ts` with a time relative to now, which
 * translateRelativeTimestamps turns into seconds that differ every second.
 * Ask it of the query as its caller gave it: after translation only
 * seconds are left.
 */
export declare function hasRelativeTimestamp(query: unknown): boolean;
/**
 * Rewrites relative `ts` comparisons into the Unix-seconds form the MSP API
 * accepts: `ts:>1h` -> `ts:>1735689600` (one hour before `nowSeconds`).
 * Absolute epochs and ranges pass through unchanged.
 */
export declare function translateRelativeTimestamps(query: string, nowSeconds?: number): string;
export {};
//# sourceMappingURL=timestamp.d.ts.map