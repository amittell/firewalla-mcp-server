/**
 * Security monitoring tool handlers
 */
import { BaseToolHandler, mspQueryErrorResponse, } from './base.js';
import { AlarmNotFoundError, BoxSelectionError, readTrace, } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, ErrorType, queryShapeRefusal, } from '../../validation/error-handler.js';
import { unixToISOStringOrNow, getCurrentTimestamp, } from '../../utils/timestamp.js';
import { normalizeUnknownFields, sanitizeFieldValue, batchNormalize, } from '../../utils/data-normalizer.js';
import { validateResponseStructure, normalizeTimestamps, createValidationSchema, } from '../../utils/data-validator.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import { withToolTimeout, createTimeoutErrorResponse, TimeoutError, } from '../../utils/timeout-manager.js';
import { validateAlarmId } from '../../utils/alarm-id-validation.js';
import { mspAnd } from '../../utils/msp-query.js';
export class GetActiveAlarmsHandler extends BaseToolHandler {
    constructor() {
        super({
            enableGeoEnrichment: true,
            enableFieldNormalization: true,
            additionalMeta: {
                data_source: 'alarms',
                entity_type: 'security_alarms',
                supports_geographic_enrichment: true,
                supports_field_normalization: true,
                supports_pagination: true,
                supports_filtering: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'get_active_alarms';
        this.description = 'Retrieve active security alarms from the Firewalla MSP API (GET /v2/alarms): status:1 is added unless the query names a status (status:2 for archived alarms). Without a ts: qualifier the API covers the last 30 days. Returns up to limit alarms and a cursor for the next page, or groups with groupBy. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
        this.category = 'security';
    }
    async execute(args, firewalla) {
        try {
            // Parameter validation
            const queryValidation = ParameterValidator.validateOptionalString(args?.query, 'query');
            const groupByValidation = ParameterValidator.validateOptionalString(args?.groupBy, 'groupBy');
            const sortByValidation = ParameterValidator.validateOptionalString(args?.sortBy, 'sortBy');
            const limitValidation = ParameterValidator.validateNumber(args?.limit, 'limit', {
                required: false,
                defaultValue: 200,
                ...getLimitValidationConfig('get_active_alarms'),
            });
            const cursorValidation = ParameterValidator.validateOptionalString(args?.cursor, 'cursor');
            const includeTotalValidation = ParameterValidator.validateBoolean(args?.include_total_count, 'include_total_count', false);
            const forceRefreshValidation = ParameterValidator.validateBoolean(args?.force_refresh, 'force_refresh', false);
            const validationResult = ParameterValidator.combineValidationResults([
                queryValidation,
                groupByValidation,
                sortByValidation,
                limitValidation,
                cursorValidation,
                includeTotalValidation,
                forceRefreshValidation,
            ]);
            if (!validationResult.isValid) {
                return this.createErrorResponse('Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, validationResult.errors);
            }
            // The structural checks and complexity limits every tool that takes
            // a query runs, before it is translated or sent: an unclosed [, a
            // NUL, 11 levels of nesting and a 2,001-character query went to the API
            const shapeRefusal = queryShapeRefusal(this.name, queryValidation.sanitizedValue);
            if (shapeRefusal) {
                return shapeRefusal;
            }
            // Active alarms unless the query names a status. /v2/alarms returns
            // archived alarms too (status 2) when no status is given.
            let sanitizedQuery = queryValidation.sanitizedValue;
            // The query as given: mspAnd turns a relative time (ts:>1h) into
            // seconds, and a relative read is not cached (see readTrace)
            const givenQuery = sanitizedQuery;
            if (!/(^|[\s(,])-?status[:=]/i.test(sanitizedQuery ?? '')) {
                // ANDed in the API's grammar: prepended as text, status:1 would
                // bind to the first branch of an OR
                sanitizedQuery = mspAnd('status:1', sanitizedQuery);
            }
            // Validate cursor format if provided
            if (cursorValidation.sanitizedValue !== undefined) {
                const cursorFormatValidation = ParameterValidator.validateCursor(cursorValidation.sanitizedValue, 'cursor');
                if (!cursorFormatValidation.isValid) {
                    return this.createErrorResponse('Invalid cursor format', ErrorType.VALIDATION_ERROR, {
                        provided_value: cursorValidation.sanitizedValue,
                        documentation: 'Cursors should be obtained from previous response next_cursor field',
                    }, cursorFormatValidation.errors);
                }
            }
            const response = await withToolTimeout(async () => firewalla.getActiveAlarms(sanitizedQuery, groupByValidation.sanitizedValue, sortByValidation.sanitizedValue || 'timestamp:desc', limitValidation.sanitizedValue, cursorValidation.sanitizedValue, forceRefreshValidation.sanitizedValue, readTrace(givenQuery)), 'get_active_alarms');
            // Grouped: the API returned one { <group fields>, count } per group
            if (response.groups) {
                return this.createUnifiedResponse({
                    group_by: response.group_by,
                    count: response.groups.length,
                    groups: response.groups,
                    next_cursor: response.next_cursor,
                    has_more: !!response.next_cursor,
                    query_executed: response.query,
                });
            }
            // Calculate total count if requested
            let totalCount = SafeAccess.getNestedValue(response, 'count', 0);
            let pagesTraversed = 1;
            if (includeTotalValidation.sanitizedValue === true &&
                response.next_cursor) {
                // Traverse all pages to get true total count
                let cursor = response.next_cursor;
                const pageSize = 100; // Use smaller pages for counting
                const maxPages = 100; // Safety limit
                while (cursor && pagesTraversed < maxPages) {
                    const nextPage = await firewalla.getActiveAlarms(sanitizedQuery, undefined, 'timestamp:desc', pageSize, cursor, false, readTrace(givenQuery));
                    const pageCount = SafeAccess.getNestedValue(nextPage, 'count', 0);
                    totalCount += pageCount;
                    cursor = nextPage.next_cursor;
                    pagesTraversed++;
                }
            }
            // Validate response structure
            const alarmValidationSchema = createValidationSchema('alarms');
            const alarmValidationResult = validateResponseStructure(response, alarmValidationSchema);
            // Normalize alarm data for consistency
            const alarmResults = SafeAccess.safeArrayAccess(response.results, (arr) => arr, []);
            // First normalize other fields, then handle severity derivation separately
            const normalizedAlarms = batchNormalize(alarmResults, {
                aid: (v) => v, // Preserve alarm ID as-is from API
                gid: (v) => v, // Preserve GID as-is from API
                ts: (v) => v, // Preserve timestamp as-is from API
                type: (v) => sanitizeFieldValue(v, 'unknown').value,
                status: (v) => sanitizeFieldValue(v, 'unknown').value,
                message: (v) => sanitizeFieldValue(v, 'No message available').value,
                direction: (v) => sanitizeFieldValue(v, 'unknown').value,
                protocol: (v) => sanitizeFieldValue(v, 'unknown').value,
                device: (v) => (v ? normalizeUnknownFields(v) : null),
                remote: (v) => (v ? normalizeUnknownFields(v) : null),
            });
            // A severity only where the API sent one: its alarm model has none
            // (type, 1-16, is a number). One was derived from type names such as
            // MALWARE_FILE that the API never sends, so every alarm was "medium"
            const finalNormalizedAlarms = normalizedAlarms.map((alarm) => {
                const providedSeverity = sanitizeFieldValue(alarm.severity, null).value;
                const { severity: _severity, ...rest } = alarm;
                return typeof providedSeverity === 'string' &&
                    providedSeverity.trim() !== '' &&
                    providedSeverity !== 'unknown'
                    ? { ...rest, severity: providedSeverity }
                    : rest;
            });
            const startTime = Date.now();
            // Process alarm data with timestamps but preserve original IDs
            const processedAlarms = SafeAccess.safeArrayMap(alarmResults, // Use original client response, not normalized
            (alarm, index) => {
                // Apply timestamp normalization
                const timestampNormalized = normalizeTimestamps(alarm);
                const finalAlarm = timestampNormalized.data;
                // Get the corresponding normalized alarm for other fields
                const normalizedAlarm = finalNormalizedAlarms[index] || {};
                // Preserve original alarm ID from client response
                const originalAid = alarm.aid; // Direct from client, not processed
                return {
                    aid: originalAid || 'unknown', // Use original from client
                    timestamp: unixToISOStringOrNow(finalAlarm.ts),
                    type: normalizedAlarm.type || finalAlarm.type || 'unknown',
                    status: normalizedAlarm.status || finalAlarm.status || 'unknown',
                    message: normalizedAlarm.message || finalAlarm.message || 'Unknown alarm',
                    direction: normalizedAlarm.direction || finalAlarm.direction || 'unknown',
                    protocol: normalizedAlarm.protocol || finalAlarm.protocol || 'unknown',
                    gid: alarm.gid || 'unknown', // Use original GID too
                    ...(normalizedAlarm.severity
                        ? { severity: normalizedAlarm.severity }
                        : {}),
                    // Include conditional properties (use normalized if available, fallback to original)
                    ...(normalizedAlarm.device || finalAlarm.device
                        ? { device: normalizedAlarm.device || finalAlarm.device }
                        : {}),
                    ...(normalizedAlarm.remote || finalAlarm.remote
                        ? { remote: normalizedAlarm.remote || finalAlarm.remote }
                        : {}),
                    ...(normalizedAlarm.src || finalAlarm.src
                        ? { src: normalizedAlarm.src || finalAlarm.src }
                        : {}),
                    ...(normalizedAlarm.dst || finalAlarm.dst
                        ? { dst: normalizedAlarm.dst || finalAlarm.dst }
                        : {}),
                    ...(normalizedAlarm.port || finalAlarm.port
                        ? { port: normalizedAlarm.port || finalAlarm.port }
                        : {}),
                    ...(normalizedAlarm.dport || finalAlarm.dport
                        ? { dport: normalizedAlarm.dport || finalAlarm.dport }
                        : {}),
                };
            });
            // Apply geographic enrichment to IP fields in alarm data
            const enrichedAlarms = await this.enrichGeoIfNeeded(processedAlarms, [
                'src',
                'dst',
                'device.ip',
                'remote.ip',
            ]);
            const unifiedResponseData = {
                count: SafeAccess.getNestedValue(response, 'count', 0),
                alarms: enrichedAlarms,
                next_cursor: response.next_cursor,
                total_count: totalCount,
                pages_traversed: pagesTraversed,
                has_more: !!response.next_cursor,
                // The query sent: status:1 unless the query names a status, the
                // qualifier renames and the box scope included
                query_executed: response.query,
                validation_warnings: alarmValidationResult.warnings &&
                    alarmValidationResult.warnings.length > 0
                    ? alarmValidationResult.warnings
                    : undefined,
                cache_info: {
                    ttl_seconds: forceRefreshValidation.sanitizedValue ? 0 : 15,
                    from_cache: !forceRefreshValidation.sanitizedValue,
                    last_updated: getCurrentTimestamp(),
                },
            };
            const executionTime = Date.now() - startTime;
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            // A query the MSP API cannot run was refused before any request
            const queryError = mspQueryErrorResponse(this.name, error);
            if (queryError) {
                return queryError;
            }
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse('get_active_alarms', error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return this.createErrorResponse(`Failed to get active alarms: ${errorMessage}`, ErrorType.API_ERROR);
        }
    }
}
export class GetSpecificAlarmHandler extends BaseToolHandler {
    constructor() {
        super({
            enableGeoEnrichment: true,
            enableFieldNormalization: true,
            additionalMeta: {
                data_source: 'specific_alarm',
                entity_type: 'security_alarm_detail',
                supports_geographic_enrichment: true,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'get_specific_alarm';
        this.description = 'Get detailed information for one Firewalla alarm (GET /v2/alarms/{gid}/{aid}). Alarm IDs are per box: pass gid on a multi-box account, or each box is checked, one request per box, until one has the alarm.';
        this.category = 'security';
    }
    async execute(args, firewalla) {
        try {
            const alarmIdValidation = ParameterValidator.validateAlarmId(args?.alarm_id, 'alarm_id');
            if (!alarmIdValidation.isValid) {
                return this.createErrorResponse('Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, alarmIdValidation.errors);
            }
            // gid goes into the request path
            const gidValidation = ParameterValidator.validatePathSegment(args?.gid, 'gid', { required: false });
            if (!gidValidation.isValid) {
                return this.createErrorResponse('Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, gidValidation.errors);
            }
            const gid = gidValidation.sanitizedValue;
            const rawAlarmId = alarmIdValidation.sanitizedValue;
            const alarmId = validateAlarmId(rawAlarmId);
            const response = await withToolTimeout(async () => firewalla.getSpecificAlarm(alarmId, gid), 'get_specific_alarm');
            // Check if alarm exists
            if (!response || !response.results || response.results.length === 0) {
                return this.createErrorResponse(`Alarm with ID '${alarmId}' not found. Please verify the alarm ID is correct and the alarm has not been deleted.`, ErrorType.API_ERROR, {
                    alarm_id: alarmId,
                    suggestion: 'Use get_active_alarms to list available alarms and their IDs',
                });
            }
            const startTime = Date.now();
            // Apply geographic enrichment to the alarm data
            const enrichedAlarm = await this.enrichGeoIfNeeded(response, [
                'src',
                'dst',
                'device.ip',
                'remote.ip',
            ]);
            const unifiedResponseData = {
                alarm: enrichedAlarm,
                retrieved_at: getCurrentTimestamp(),
            };
            const executionTime = Date.now() - startTime;
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse('get_specific_alarm', error.duration, error.timeoutMs);
            }
            // The error itself (withToolTimeout throws it as it came), or one level
            // down, the error that a wrapper kept as `cause`
            const selectionError = error instanceof BoxSelectionError
                ? error
                : error?.cause instanceof BoxSelectionError
                    ? error.cause
                    : undefined;
            if (selectionError) {
                return this.createErrorResponse(selectionError.message, ErrorType.VALIDATION_ERROR);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            // Not found only when every box asked answered 404, which is when the
            // client throws AlarmNotFoundError; a 401, a host it could not reach,
            // or a 404 from /v2/boxes while it found the boxes to ask, is not
            if (error instanceof AlarmNotFoundError) {
                return this.createErrorResponse(`Alarm not found: ${args?.alarm_id}. The alarm may have been deleted or the ID may be incorrect.`, ErrorType.API_ERROR, {
                    alarm_id: args?.alarm_id,
                    suggestion: 'Use get_active_alarms to list available alarms and their IDs',
                });
            }
            return this.createErrorResponse(`Failed to get specific alarm: ${errorMessage}`, ErrorType.API_ERROR);
        }
    }
}
//# sourceMappingURL=security.js.map