/**
 * Base Filter Interface and Abstract Classes
 * Provides foundation for specialized filter implementations
 */
/**
 * Abstract base filter with common functionality
 */
export class BaseFilter {
    /**
     * Parse timestamp value to Unix timestamp with robust detection
     */
    parseTimestamp(value) {
        if (typeof value === 'number') {
            // Handle invalid numbers (NaN, Infinity)
            if (!Number.isFinite(value)) {
                return null;
            }
            // Handle negative timestamps (invalid)
            if (value < 0) {
                return null;
            }
            // Handle Unix epoch (1970-01-01): 0 seconds
            if (value === 0) {
                return 0;
            }
            // More robust detection: timestamps after year 3000 in seconds would be > 32503680000
            // Timestamps in milliseconds for current era would be > 1000000000000
            // This handles both current millisecond timestamps and future second timestamps correctly
            if (value > 32503680000 && value < 1000000000000) {
                // Likely seconds for far future dates
                return value;
            }
            else if (value > 1000000000000) {
                // Likely milliseconds - validate reasonable range (not beyond year 9999)
                if (value > 253402300800000) {
                    // Year 9999 in milliseconds
                    return null;
                }
                return Math.floor(value / 1000);
            }
            else if (value > 946684800) {
                // Likely seconds for dates after 2000-01-01
                return value;
            }
            else if (value >= 31536000) {
                // Valid Unix timestamp for dates after 1971 (to account for older logs)
                return value;
            }
            // Too small to be a valid timestamp
            return null;
        }
        if (typeof value === 'string') {
            // Trim whitespace and check for empty string
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }
            // Try parsing as number string first
            const numericValue = parseFloat(trimmed);
            if (!isNaN(numericValue) && Number.isFinite(numericValue)) {
                return this.parseTimestamp(numericValue);
            }
            // Try parsing as ISO date
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) {
                const timestamp = Math.floor(date.getTime() / 1000);
                // Validate the parsed timestamp is reasonable
                if (timestamp >= 0 && timestamp <= 253402300800) {
                    // Year 9999
                    return timestamp;
                }
            }
            // Try parsing as relative time (1h, 24h, 7d, etc.)
            const relativeMatch = trimmed.match(/^(\d+)([smhdw])$/i);
            if (relativeMatch) {
                const amount = parseInt(relativeMatch[1]);
                const unit = relativeMatch[2].toLowerCase();
                // Validate amount is reasonable
                if (amount < 0 || amount > 1000000) {
                    return null;
                }
                const now = Math.floor(Date.now() / 1000);
                switch (unit) {
                    case 's':
                        return now - amount;
                    case 'm':
                        return now - amount * 60;
                    case 'h':
                        return now - amount * 60 * 60;
                    case 'd':
                        return now - amount * 24 * 60 * 60;
                    case 'w':
                        return now - amount * 7 * 24 * 60 * 60;
                    default:
                        return null;
                }
            }
        }
        return null;
    }
    /**
     * Create cache key component for this filter
     */
    createCacheKey(node) {
        return `${this.name}:${JSON.stringify(node)}`;
    }
}
//# sourceMappingURL=base.js.map