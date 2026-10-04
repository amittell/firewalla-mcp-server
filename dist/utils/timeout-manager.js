/**
 * Timeout Management Utilities for Firewalla MCP Server
 * Provides consistent timeout handling across all tools and operations
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { PERFORMANCE_THRESHOLDS } from '../config/limits.js';
import { ErrorType, createErrorResponse } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';
/** What a caller is told to do before sending a write again */
function checkBeforeRetry(check) {
    return check
        ? `Check with ${check} before trying again.`
        : 'Check the current state before trying again.';
}
/**
 * What a caller is told about a write that was sent and not answered: it
 * may have been applied, and `check`, a read tool (checkingReadTool in
 * client.ts), shows whether it was
 */
export function unknownWriteOutcome(check) {
    return `The outcome is unknown: Firewalla may have applied the change. ${checkBeforeRetry(check)}`;
}
/**
 * What became of a tool's writes when the tool gave up. A write still
 * waiting for the rate limiter is never sent. One sent and not answered
 * may have reached Firewalla: cancelling it does not undo it, so the caller
 * must check before trying again, or it may pause or create a rule twice.
 * The limit is written `limit: <ms>ms`, as in every other timeout answer
 * (see generateTimeoutGuidance).
 */
function describeWrites(toolName, duration, timeoutMs, writes) {
    const check = (write) => checkBeforeRetry(write.check);
    const gaveUp = `${toolName} gave up after ${duration} ms (limit: ${timeoutMs}ms)`;
    const sent = writes.find(write => write.state === 'sent');
    if (sent) {
        return {
            writeState: 'unknown',
            writeOutcome: `${gaveUp} with ${sent.request} sent and not answered. ${unknownWriteOutcome(sent.check)}`,
        };
    }
    const answered = writes.find(write => write.state === 'answered');
    if (answered) {
        return {
            writeState: 'applied',
            writeOutcome: `${gaveUp}, after ${answered.request} was answered${answered.status ? ` HTTP ${answered.status}` : ''}: the change was made. ${check(answered)}`,
        };
    }
    const queued = writes.find(write => write.state === 'queued');
    if (queued) {
        return {
            writeState: 'not_sent',
            writeOutcome: `${gaveUp} while ${queued.request} waited for the rate limit. It was not sent, so nothing was changed.`,
        };
    }
    return {};
}
const toolBudgets = new AsyncLocalStorage();
/** The budget of the tool operation this runs in, if any (see ToolBudget) */
export function currentToolBudget() {
    return toolBudgets.getStore();
}
/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG = {
    timeoutMs: PERFORMANCE_THRESHOLDS.TIMEOUT_MS,
    warningMs: PERFORMANCE_THRESHOLDS.WARNING_MS,
    errorMs: PERFORMANCE_THRESHOLDS.ERROR_MS,
    enableMetrics: true,
    toolName: 'unknown',
};
/**
 * Timeout error class for actual timeout situations
 */
export class TimeoutError extends Error {
    constructor(toolName, duration, timeoutMs) {
        super(`Operation '${toolName}' timed out after ${duration}ms (limit: ${timeoutMs}ms). This indicates the operation took too long to complete, likely due to large data volumes or API performance issues.`);
        this.name = 'TimeoutError';
        this.duration = duration;
        this.toolName = toolName;
        this.timeoutMs = timeoutMs;
    }
}
/**
 * Performance warning class for monitoring
 */
export class PerformanceWarning extends Error {
    constructor(toolName, duration, threshold) {
        super(`Operation '${toolName}' took ${duration}ms (warning threshold: ${threshold}ms)`);
        this.name = 'PerformanceWarning';
        this.duration = duration;
        this.toolName = toolName;
    }
}
/**
 * Timeout manager class for handling operation timeouts
 */
export class TimeoutManager {
    constructor() {
        this.activeTimeouts = new Map();
        this.metrics = [];
        this.maxMetrics = 1000; // Keep last 1000 operations
    }
    /**
     * Execute an async operation with timeout protection
     */
    async withTimeout(operation, config = {}) {
        // Ensure timeoutMs is never undefined by using nullish coalescing
        const finalConfig = {
            ...DEFAULT_TIMEOUT_CONFIG,
            ...config,
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_CONFIG.timeoutMs,
        };
        const operationId = `${finalConfig.toolName}_${Date.now()}_${Math.random()}`;
        const metrics = {
            startTime: Date.now(),
            toolName: finalConfig.toolName,
            success: false,
            timedOut: false,
            warning: false,
            error: false,
        };
        const budget = new AbortController();
        const toolBudget = {
            deadline: metrics.startTime + finalConfig.timeoutMs,
            signal: budget.signal,
            writes: [],
        };
        try {
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    const duration = Date.now() - metrics.startTime;
                    metrics.timedOut = true;
                    metrics.endTime = Date.now();
                    metrics.duration = duration;
                    this.recordMetrics(metrics);
                    const timeoutError = new TimeoutError(finalConfig.toolName, duration, finalConfig.timeoutMs);
                    // Cancels the operation's requests (see ToolBudget); a write still
                    // in flight after this was sent and not answered
                    budget.abort(timeoutError);
                    Object.assign(timeoutError, describeWrites(finalConfig.toolName, duration, finalConfig.timeoutMs, toolBudget.writes));
                    reject(timeoutError);
                }, finalConfig.timeoutMs);
                this.activeTimeouts.set(operationId, timeoutId);
            });
            // Race the operation against the timeout
            const result = await Promise.race([
                toolBudgets.run(toolBudget, operation),
                timeoutPromise,
            ]);
            // Operation completed successfully
            metrics.endTime = Date.now();
            metrics.duration = metrics.endTime - metrics.startTime;
            metrics.success = true;
            // Check for performance warnings
            if (metrics.duration > finalConfig.warningMs) {
                metrics.warning = true;
                if (finalConfig.enableMetrics) {
                    const warning = new PerformanceWarning(finalConfig.toolName, metrics.duration, finalConfig.warningMs);
                    logger.warn(warning.message, {
                        tool: finalConfig.toolName,
                        duration_ms: metrics.duration,
                        warning_threshold_ms: finalConfig.warningMs,
                        warning: 'performance_warning',
                    });
                }
            }
            if (metrics.duration > finalConfig.errorMs) {
                metrics.error = true;
                if (finalConfig.enableMetrics) {
                    logger.error(`Performance error: ${finalConfig.toolName} took ${metrics.duration}ms (error threshold: ${finalConfig.errorMs}ms)`);
                }
            }
            this.recordMetrics(metrics);
            return result;
        }
        catch (error) {
            metrics.endTime = Date.now();
            metrics.duration = metrics.endTime - metrics.startTime;
            if (error instanceof TimeoutError) {
                metrics.timedOut = true;
            }
            // Debug logging for extremely fast failures that might be misclassified as timeouts
            if (metrics.duration < 100 && finalConfig.enableMetrics) {
                logger.warn(`Suspiciously fast operation failure`, {
                    tool: finalConfig.toolName,
                    duration_ms: metrics.duration,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    is_timeout: error instanceof TimeoutError,
                    error_type: error?.constructor?.name,
                    warning: 'fast_failure',
                });
            }
            this.recordMetrics(metrics);
            throw error;
        }
        finally {
            // Clean up timeout
            const timeoutId = this.activeTimeouts.get(operationId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.activeTimeouts.delete(operationId);
            }
        }
    }
    /**
     * Record performance metrics
     */
    recordMetrics(metrics) {
        this.metrics.push(metrics);
        // Keep only the most recent metrics to prevent memory leaks
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.splice(0, this.metrics.length - this.maxMetrics);
        }
    }
}
/**
 * Global timeout manager instance
 */
export const globalTimeoutManager = new TimeoutManager();
/**
 * Runs a tool's operation with a time limit. A TimeoutError when the limit
 * passes; any other failure is thrown as it came, so its message, and the
 * HTTP status and error code of an ApiRequestError, reach the tool's error
 * response. It used to wrap a failure within 50 ms in a ValidationError
 * saying "This is an immediate parameter or configuration error, not a
 * timeout", and a later one in "This appears to be a processing error, not
 * a timeout", which a 503 answered after two attempts is neither.
 */
export async function withToolTimeout(operation, toolName, customTimeoutMs) {
    const startTime = Date.now();
    try {
        return await globalTimeoutManager.withTimeout(operation, {
            toolName,
            timeoutMs: customTimeoutMs ?? DEFAULT_TIMEOUT_CONFIG.timeoutMs,
            enableMetrics: true,
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof TimeoutError) {
            logger.error(`Actual timeout occurred - operation exceeded time limit`, error, {
                tool: toolName,
                duration_ms: duration,
                timeout_limit_ms: error.timeoutMs,
                error_type: 'actual_timeout',
            });
        }
        throw error;
    }
}
/**
 * Generate actionable guidance based on tool name and timeout context
 */
function generateTimeoutGuidance(toolName, duration, timeoutMs) {
    const guidance = [];
    // General timeout guidance
    guidance.push(`Operation timed out after ${duration}ms (limit: ${timeoutMs}ms).`, 'This usually indicates the request scope is too large or the API is under heavy load.');
    // Tool-specific guidance
    if (toolName.includes('search') ||
        toolName.includes('flow') ||
        toolName.includes('alarm')) {
        guidance.push('🔍 Search Optimization Tips:', '• Reduce the limit parameter (try 100-500 instead of 1000+)', '• Add more specific filters to narrow results', '• Use time_range filters to limit the search window', '• Try cursor-based pagination for large datasets');
        if (toolName.includes('flow')) {
            guidance.push('• Flow searches: Use protocol filters (e.g., "protocol:tcp")', '• Flow searches: Filter by specific IPs or subnets', '• Flow searches: Limit to recent time periods (last hour/day)');
        }
        if (toolName.includes('alarm')) {
            guidance.push('• Alarm searches: Filter by severity (e.g., "severity:high")', '• Alarm searches: Use resolved:false to get active alarms only', '• Alarm searches: Search by specific alarm types');
        }
    }
    else if (toolName.includes('rule')) {
        guidance.push('🛡️ Rule Operation Tips:', '• Use active_only:true to reduce dataset size', '• Filter by specific rule actions (block, allow, timelimit)', '• Search for rules by target type or value', '• Consider using get_network_rules_summary for large rule sets');
    }
    else if (toolName.includes('device')) {
        guidance.push('📱 Device Query Tips:', '• Use online:true to focus on active devices', '• Filter by device vendor or type', '• Limit to specific network segments', '• Use cursor pagination for large device lists');
    }
    else if (toolName.includes('geographic') ||
        toolName.includes('correlation')) {
        guidance.push('🌍 Geographic/Correlation Tips:', '• These operations are computationally intensive', '• Reduce the number of correlation fields', '• Use smaller time windows for analysis', '• Consider breaking into multiple smaller queries');
    }
    // Network and system guidance
    guidance.push('', '🔧 Troubleshooting Steps:', '1. Check your network connection to the Firewalla API', '2. Verify the Firewalla box is online and responsive', '3. Try the same operation with a much smaller limit (e.g., 10-50)', '4. Check if other tools work to isolate the issue', '5. Wait a few minutes and retry in case of temporary API overload');
    // Recovery suggestions
    guidance.push('', '💡 Recovery Suggestions:', '• Break large requests into multiple smaller ones', '• Use more specific filters to reduce data processing', '• Try the operation during off-peak hours', '• Consider using summary tools instead of detailed searches', '• Enable retry logic for automatic recovery from transient timeouts');
    return guidance;
}
/**
 * Create a standardized timeout error response for MCP tools with enhanced guidance
 */
export function createTimeoutErrorResponse(toolName, duration, timeoutMs, error) {
    // A tool that writes says what became of its write: the generic advice
    // (a narrower query, a smaller limit) would have the caller send it again.
    // Its limit is the one it was stopped at, as the TimeoutError carries it.
    if (error instanceof TimeoutError && error.writeOutcome) {
        return createErrorResponse(toolName, error.writeOutcome, ErrorType.TIMEOUT_ERROR, { duration, timeoutMs: error.timeoutMs, write: error.writeState });
    }
    const guidance = generateTimeoutGuidance(toolName, duration, timeoutMs);
    return createErrorResponse(toolName, guidance.join('\n'), ErrorType.TIMEOUT_ERROR, {
        duration,
        timeoutMs,
        performance_context: {
            timeout_ratio: Math.round((duration / timeoutMs) * 100),
            was_actual_timeout: duration >= timeoutMs,
            operation_category: toolName.includes('search')
                ? 'search'
                : toolName.includes('rule')
                    ? 'rule_management'
                    : toolName.includes('device')
                        ? 'device_monitoring'
                        : 'general',
        },
        documentation: {
            timeout_guide: '/docs/error-handling-guide.md#timeout-errors',
            performance_guide: '/docs/limits-and-performance-guide.md',
            query_optimization: '/docs/query-syntax-guide.md#optimization-tips',
        },
    }, [
        'Actual timeout occurred - operation exceeded time limit',
        'Try reducing the scope of your request or using more specific filters',
        'Check network connectivity and Firewalla API status',
        'Consider breaking large operations into smaller chunks',
        'See the timeout troubleshooting guide for detailed recovery steps',
    ]);
}
//# sourceMappingURL=timeout-manager.js.map