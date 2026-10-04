/**
 * Time Range Filter Implementation
 * Handles timestamp-based filtering for flows, alarms, and rules
 */
import { BaseFilter } from './base.js';
import { unixToISOString } from '../../utils/timestamp.js';
export class TimeRangeFilter extends BaseFilter {
    constructor() {
        super(...arguments);
        this.name = 'time_range';
        this.timeFields = [
            'timestamp',
            'ts',
            'created_at',
            'updated_at',
            'last_updated',
            'lastSeen',
        ];
        /**
         * Standardized time margin for timestamp matching (30 seconds)
         *
         * This margin is used consistently across both API-level filtering and
         * post-processing to ensure identical behavior regardless of where
         * the filtering occurs. The 30-second value provides a reasonable
         * balance between accuracy and flexibility while accounting for:
         *
         * - Network latency between client and Firewalla API (typically <5s)
         * - Clock synchronization differences between systems (typically <10s)
         * - Timestamp precision variations (seconds vs milliseconds)
         * - Small delays in data processing pipelines (<15s)
         *
         * Using a consistent value prevents subtle bugs where the same query
         * might return different results for different entity types based on
         * whether they support API-level time filtering or require post-processing.
         *
         * Note: Previously used inconsistent values (10s for API, 60s for post-processing)
         * which caused discrepancies. Standardized to 30s for optimal balance.
         */
        this.STANDARD_TIME_MARGIN = 30; // seconds
    }
    canHandle(node) {
        if (node.type === 'field' ||
            node.type === 'range' ||
            node.type === 'comparison') {
            return this.timeFields.includes(node.field);
        }
        return false;
    }
    apply(node, context) {
        switch (node.type) {
            case 'field': {
                return this.handleFieldQuery(node, context);
            }
            case 'range': {
                return this.handleRangeQuery(node, context);
            }
            case 'comparison': {
                return this.handleComparisonQuery(node, context);
            }
            case 'logical':
            case 'group':
            case 'wildcard':
            case 'text': {
                // These node types are not handled by time filter
                return { apiParams: {} };
            }
            default: {
                return { apiParams: {} };
            }
        }
    }
    handleFieldQuery(node, context) {
        const timestamp = this.parseTimestamp(node.value);
        if (timestamp === null) {
            return { apiParams: {} };
        }
        // For exact timestamp matches, use a configurable small range
        const margin = context.timeMargin || this.STANDARD_TIME_MARGIN;
        return {
            apiParams: this.buildTimeParams(timestamp - margin, timestamp + margin, context),
            cacheKeyComponent: this.createCacheKey(node),
        };
    }
    handleRangeQuery(node, context) {
        const minTime = node.min ? this.parseTimestamp(node.min) : null;
        const maxTime = node.max ? this.parseTimestamp(node.max) : null;
        return {
            apiParams: this.buildTimeParams(minTime, maxTime, context),
            cacheKeyComponent: this.createCacheKey(node),
        };
    }
    handleComparisonQuery(node, context) {
        const timestamp = this.parseTimestamp(node.value);
        if (timestamp === null) {
            return { apiParams: {} };
        }
        let minTime = null;
        let maxTime = null;
        switch (node.operator) {
            case '>': {
                minTime = timestamp + 1;
                break;
            }
            case '>=': {
                minTime = timestamp;
                break;
            }
            case '<': {
                maxTime = timestamp - 1;
                break;
            }
            case '<=': {
                maxTime = timestamp;
                break;
            }
        }
        return {
            apiParams: this.buildTimeParams(minTime, maxTime, context),
            cacheKeyComponent: this.createCacheKey(node),
        };
    }
    buildTimeParams(minTime, maxTime, context) {
        const params = {};
        // Different entities use different parameter names
        switch (context.entityType) {
            case 'flows': {
                if (minTime) {
                    params.start_time = unixToISOString(minTime);
                }
                if (maxTime) {
                    params.end_time = unixToISOString(maxTime);
                }
                break;
            }
            case 'alarms': {
                if (minTime) {
                    params.since = minTime;
                }
                if (maxTime) {
                    params.until = maxTime;
                }
                break;
            }
            case 'rules': {
                // Rules API might not support time filtering directly
                // Will need post-processing
                break;
            }
            case 'devices': {
                // Device API doesn't typically support time filtering
                break;
            }
            case 'target_lists': {
                // Target lists might filter by last_updated
                if (minTime) {
                    params.updated_since = minTime;
                }
                break;
            }
        }
        return params;
    }
    getOptimizations() {
        return [
            {
                type: 'index',
                priority: 10,
                description: 'Time-based queries can use timestamp indexes',
                condition: (context) => context.entityType === 'flows' || context.entityType === 'alarms',
            },
            {
                type: 'pushdown',
                priority: 8,
                description: 'Time filters should be applied at API level when possible',
                condition: (context) => context.entityType !== 'rules',
            },
        ];
    }
}
//# sourceMappingURL=time.js.map