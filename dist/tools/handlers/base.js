/**
 * @fileoverview Base types and interfaces for MCP tool handlers
 *
 * Provides foundational classes and interfaces for implementing MCP tools that
 * interact with Firewalla firewall data. Includes standardized error handling,
 * response formatting, and validation patterns for consistent tool behavior.
 *
 * The base infrastructure ensures all tools follow MCP protocol standards while
 * providing consistent error reporting and response structure across the entire
 * tool ecosystem.
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */
import { WriteOutcomeUnknownError, } from '../../firewalla/client.js';
import { createErrorResponse, ErrorType, } from '../../validation/error-handler.js';
import { validateAndSanitizeParameters, } from '../../validation/parameter-sanitizer.js';
import { toSnakeCaseDeep } from '../../utils/field-normalizer.js';
import { enrichWithGeographicData, getGlobalEnrichmentPipeline, } from '../../utils/geographic-enrichment-pipeline.js';
import { geoCache } from '../../utils/geographic.js';
import { findMspQueryError } from '../../utils/msp-query.js';
/**
 * How the MSP API reads a query, for errors about one it cannot run
 */
const MSP_QUERY_RULES = 'Terms joined by spaces or AND must all match. OR works between values of one field and is sent as a comma list (region:US OR region:CN becomes region:US,CN); the MSP API has no OR between different fields. NOT or a leading - excludes a field value. Parentheses may group terms only where the result is still one list of terms.';
/**
 * The validation-error response for a query the MSP API cannot run, when
 * `error` is, or wraps, the MspQueryError toMspQuery threw; undefined for
 * any other error. The request was not sent.
 *
 * @param toolName - The tool reporting the error
 * @param error - The error a tool caught
 */
export function mspQueryErrorResponse(toolName, error) {
    const queryError = findMspQueryError(error);
    if (!queryError) {
        return undefined;
    }
    return createErrorResponse(toolName, queryError.message, ErrorType.VALIDATION_ERROR, {
        query: queryError.query,
        ...(queryError.part && { unsupported_part: queryError.part }),
        ...(queryError.suggestions.length > 0 && {
            suggested_queries: queryError.suggestions,
        }),
        query_rules: MSP_QUERY_RULES,
    }, [queryError.message]);
}
/**
 * Generate a simple request ID for tracking
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
/**
 * Base class for tool handlers with common validation and error handling
 *
 * Provides standardized implementation patterns for MCP tools including:
 * - Unified response formatting with consistent metadata
 * - Automatic geographic enrichment for IP addresses
 * - Field normalization to snake_case
 * - JSON serialization with proper error handling
 * - Tool metadata structure validation
 * - Common utility methods for response construction
 *
 * All concrete tool implementations should extend this class to ensure
 * uniform behavior across the tool ecosystem.
 *
 * @abstract
 * @implements {ToolHandler}
 */
/**
 * Whether a response holds geographic data, at any depth: a `geo` or
 * `<field>_geo` object, as the enrichment adds (remote.geo,
 * source_ip_geo), or a known `<end>_country`, `<end>_city` or
 * `<end>_continent`, as search_flows and search_alarms give them
 * (destination_country, remote_country). The flat fields were not
 * counted, so search_flows said false with destination_country "US"
 */
function hasGeographicData(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8) {
        return false;
    }
    if (Array.isArray(value)) {
        return value.some(item => hasGeographicData(item, depth + 1));
    }
    return Object.entries(value).some(([key, entry]) => ((key === 'geo' || key.endsWith('_geo')) &&
        entry !== null &&
        typeof entry === 'object') ||
        (/_(country|city|continent)$/.test(key) &&
            typeof entry === 'string' &&
            entry.trim() !== '' &&
            !/^unknown$/i.test(entry.trim())) ||
        hasGeographicData(entry, depth + 1));
}
export class BaseToolHandler {
    /**
     * Constructor with default configuration
     */
    constructor(options = {}) {
        this.options = {
            enableGeoEnrichment: true, // Default to enabled for consistency
            enableFieldNormalization: true, // Default to enabled for consistency
            ...options,
        };
    }
    /**
     * Create a legacy success response (DEPRECATED - Use createUnifiedResponse)
     *
     * @param data - The data to include in the response
     * @returns Formatted success response compliant with MCP protocol
     * @protected
     * @deprecated Use createUnifiedResponse for new handlers
     */
    createSuccessResponse(data) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(data),
                },
            ],
        };
    }
    /**
     * The field normalization createUnifiedResponse applies, when the handler
     * enables it: snake_case keys, with the FIELD_ALIAS_MAP renames (timestamp
     * becomes ts). For data a handler returns without createUnifiedResponse.
     *
     * @param data - The data to normalize
     * @returns The data with normalized field names
     * @protected
     */
    normalizeFields(data) {
        return this.options.enableFieldNormalization ? toSnakeCaseDeep(data) : data;
    }
    /**
     * Create a unified success response with consistent formatting and enrichment
     *
     * @param data - The data to include in the response
     * @param options - Additional options for response generation
     * @returns Formatted success response with unified structure
     * @protected
     */
    async createUnifiedResponse(data, options = {}) {
        const startTime = Date.now();
        let processedData = data;
        const meta = {};
        // Apply geographic enrichment if enabled. geo_enriched says whether
        // the response holds geographic data: it was true whenever enrichment
        // was enabled and did not throw, and the pipeline reads top-level IP
        // fields only, which a list response has none of, so search_alarms and
        // search_flows said true with no geographic field in their results
        if (this.options.enableGeoEnrichment) {
            try {
                processedData = await enrichWithGeographicData(processedData, geoCache);
                meta.geo_enriched = hasGeographicData(processedData);
            }
            catch (error) {
                // Geographic enrichment failure shouldn't break the response
                meta.geo_enriched = false;
                meta.geo_enrichment_error =
                    error instanceof Error ? error.message : 'Unknown error';
            }
        }
        // Apply field normalization if enabled
        if (this.options.enableFieldNormalization) {
            try {
                processedData = this.normalizeFields(processedData);
                meta.field_normalized = true;
            }
            catch (error) {
                // Field normalization failure shouldn't break the response
                meta.field_normalized = false;
                meta.field_normalization_error =
                    error instanceof Error ? error.message : 'Unknown error';
            }
        }
        // Build unified response
        const unifiedResponse = {
            success: true,
            data: processedData,
            meta: {
                request_id: options.requestId || generateRequestId(),
                execution_time_ms: options.executionTimeMs || Date.now() - startTime,
                handler: this.name,
                timestamp: new Date().toISOString(),
                count: Array.isArray(processedData) ? processedData.length : undefined,
                ...meta,
                ...this.options.additionalMeta,
                ...options.additionalMeta,
            },
        };
        // Convert to MCP ToolResponse format
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(unifiedResponse),
                },
            ],
        };
    }
    /**
     * Helper method for geographic enrichment that can be called by handlers
     *
     * @param payload - Data to enrich with geographic information
     * @param ipFields - Array of IP field names to enrich (defaults to common fields)
     * @returns Promise resolving to enriched data
     * @protected
     */
    async enrichGeoIfNeeded(payload, ipFields = ['source_ip', 'destination_ip', 'device_ip', 'ip']) {
        if (!this.options.enableGeoEnrichment) {
            return payload;
        }
        try {
            const pipeline = getGlobalEnrichmentPipeline(geoCache);
            return (await pipeline.enrichObject(payload, ipFields));
        }
        catch (_error) {
            // Return original payload if enrichment fails
            return payload;
        }
    }
    /**
     * Create a standardized error response with diagnostic information
     *
     * @param message - Human-readable error message
     * @param errorType - Specific type of error (defaults to UNKNOWN_ERROR)
     * @param details - Optional additional error context or debugging information
     * @param validationErrors - Optional array of validation error messages
     * @returns Formatted error response with isError flag set
     * @protected
     */
    createErrorResponse(message, errorType = ErrorType.UNKNOWN_ERROR, details, validationErrors) {
        return createErrorResponse(this.name, message, errorType, details, validationErrors);
    }
    /**
     * The answer for a write that was sent and got no HTTP status
     * (WriteOutcomeUnknownError): its outcome is unknown, and the message
     * names the read to check before trying again. Undefined for any other
     * error, which the tool reports as a failure.
     */
    unknownWriteResponse(error) {
        if (!(error instanceof WriteOutcomeUnknownError)) {
            return undefined;
        }
        return this.createErrorResponse(error.message, ErrorType.NETWORK_ERROR, {
            write: error.writeState,
            code: error.code,
            check: error.check,
        });
    }
    /**
     * Sanitize and validate parameters early in the execution pipeline
     *
     * @param rawArgs - Raw arguments from MCP client
     * @param config - Optional sanitization configuration
     * @returns Sanitized arguments or error response
     * @protected
     */
    sanitizeParameters(rawArgs, config) {
        const result = validateAndSanitizeParameters(rawArgs, this.name, config);
        if ('errorResponse' in result) {
            return { errorResponse: result.errorResponse };
        }
        return { sanitizedArgs: result.sanitizedArgs };
    }
    /**
     * Execute tool with automatic parameter sanitization
     *
     * This is a convenience method that automatically sanitizes parameters
     * before calling the tool's main execution logic. Tools can override
     * this to customize sanitization behavior.
     *
     * @param rawArgs - Raw arguments from MCP client
     * @param firewalla - Firewalla API client instance
     * @param config - Optional sanitization configuration
     * @returns Promise resolving to tool response
     * @protected
     */
    async executeWithSanitization(rawArgs, firewalla, config) {
        // Early parameter sanitization
        const sanitizationResult = this.sanitizeParameters(rawArgs, config);
        if ('errorResponse' in sanitizationResult) {
            return sanitizationResult.errorResponse;
        }
        // Call the tool's execute method with sanitized parameters
        return this.execute(sanitizationResult.sanitizedArgs, firewalla);
    }
}
//# sourceMappingURL=base.js.map