/**
 * Device monitoring tool handlers
 */
import { BaseToolHandler } from './base.js';
import { BoxSelectionError, } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, createErrorResponse, ErrorType, } from '../../validation/error-handler.js';
import { safeUnixToISOString } from '../../utils/timestamp.js';
import { decodeCursor } from '../../utils/pagination.js';
import { sanitizeFieldValue, normalizeUnknownFields, batchNormalize, sanitizeByteCount, } from '../../utils/data-normalizer.js';
import { validateResponseStructure, normalizeTimestamps, createValidationSchema, } from '../../utils/data-validator.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import { USER_REQUEST_ONLY } from '../../utils/untrusted-text.js';
import { withToolTimeout, TimeoutError, createTimeoutErrorResponse, } from '../../utils/timeout-manager.js';
/**
 * Why a get_device_status cursor is not one this listing issued, or
 * undefined when it is: a base64 JSON offset and page size, from a listing
 * sorted by name, ascending
 */
function deviceCursorProblem(cursor) {
    if (typeof cursor !== 'string' || cursor.trim() === '') {
        return 'cursor must be a non-empty string';
    }
    let data;
    try {
        data = decodeCursor(cursor);
    }
    catch (error) {
        return error instanceof Error ? error.message : 'Failed to decode cursor';
    }
    if ((data.sort_by !== undefined && data.sort_by !== 'name') ||
        (data.sort_order !== undefined && data.sort_order !== 'asc')) {
        return `cursor is from a listing sorted by ${data.sort_by ?? 'nothing'} ${data.sort_order ?? ''}, not from get_device_status (sorted by name)`.trim();
    }
    return undefined;
}
/** A device's lastSeen (Unix seconds) as an ISO string; null when none */
function lastSeenOf(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        !(Number(value) > 0)) {
        return null;
    }
    const iso = safeUnixToISOString(value, '');
    return iso === '' ? null : iso;
}
export class GetDeviceStatusHandler extends BaseToolHandler {
    constructor() {
        super({
            enableGeoEnrichment: true,
            enableFieldNormalization: true,
            additionalMeta: {
                data_source: 'devices',
                entity_type: 'network_devices',
                supports_geographic_enrichment: true,
                supports_field_normalization: true,
                supports_pagination: true,
                supports_filtering: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'get_device_status';
        this.description = 'Check online/offline status of devices on the Firewalla network. Reads the device list from GET /v2/devices (box, else FIREWALLA_BOX_ID, else every box; group limits it to a box group) and returns up to limit devices, sorted by name.';
        this.category = 'device';
    }
    async execute(args, firewalla) {
        try {
            // Parameter validation with standardized limits
            const limitValidation = ParameterValidator.validateNumber(args?.limit, 'limit', {
                required: false,
                defaultValue: 200,
                ...getLimitValidationConfig(this.name),
            });
            const boxValidation = ParameterValidator.validateOptionalString(args?.box, 'box');
            const groupValidation = ParameterValidator.validateOptionalString(args?.group, 'group');
            if (!limitValidation.isValid ||
                !boxValidation.isValid ||
                !groupValidation.isValid) {
                return createErrorResponse(this.name, 'Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, [
                    ...limitValidation.errors,
                    ...boxValidation.errors,
                    ...groupValidation.errors,
                ]);
            }
            const deviceId = args?.device_id;
            const includeOffline = args?.include_offline !== false; // Default to true
            const limit = limitValidation.sanitizedValue;
            const cursor = args?.cursor; // Cursor for pagination
            // A cursor is the next_cursor of a previous page of this listing,
            // checked before any request. One that did not decode was read as
            // the first page, after the device list was read, so a mistyped or
            // foreign cursor started the listing over without saying so.
            if (cursor !== undefined) {
                const problem = deviceCursorProblem(cursor);
                if (problem) {
                    return createErrorResponse(this.name, 'Invalid cursor', ErrorType.VALIDATION_ERROR, { cursor }, [
                        problem,
                        'Pass the next_cursor of a previous get_device_status page, or leave cursor out for the first page',
                    ]);
                }
            }
            // The box to list; getDeviceStatus falls back to FIREWALLA_BOX_ID
            const box = boxValidation.sanitizedValue;
            // A box group ID, sent to /v2/devices as its documented group
            const group = groupValidation.sanitizedValue;
            const devicesResponse = await withToolTimeout(async () => firewalla.getDeviceStatus(deviceId, includeOffline, limit, cursor, box, group), this.name);
            // Validate response structure
            const validationSchema = createValidationSchema('devices');
            const validationResult = validateResponseStructure(devicesResponse, validationSchema);
            if (!validationResult.isValid) {
                // Validation warnings logged for debugging
            }
            // Normalize device data for consistency
            const deviceResults = SafeAccess.safeArrayAccess(devicesResponse.results, (arr) => arr, []);
            const normalizedDevices = batchNormalize(deviceResults, {
                name: (v) => sanitizeFieldValue(v, 'Unknown Device').value,
                ip: (v) => sanitizeFieldValue(v, 'unknown').value,
                macVendor: (v) => sanitizeFieldValue(v, 'unknown').value,
                network: (v) => (v ? normalizeUnknownFields(v) : null),
                group: (v) => (v ? normalizeUnknownFields(v) : null),
                online: (v) => Boolean(v), // Ensure consistent boolean handling
            });
            // Optimize device counting to avoid dual array iteration
            const deviceCounts = normalizedDevices.reduce((acc, d) => {
                if (d.online === true) {
                    acc.online++;
                }
                else {
                    acc.offline++;
                }
                return acc;
            }, { online: 0, offline: 0 });
            const startTime = Date.now();
            // Process device data with timestamps but preserve original IDs
            const processedDevices = deviceResults.map((device, index) => {
                // Apply timestamp normalization to device data
                const timestampNormalized = normalizeTimestamps(device);
                const finalDevice = timestampNormalized.data;
                // Get normalized device for other fields
                const normalizedDevice = normalizedDevices[index] || {};
                return {
                    id: device.id || device.mac || 'unknown', // Use original ID or MAC
                    gid: device.gid || 'unknown', // Use original GID
                    name: normalizedDevice.name ||
                        finalDevice.name ||
                        device.name ||
                        'unknown',
                    ip: normalizedDevice.ip || finalDevice.ip || device.ip || 'unknown',
                    macVendor: normalizedDevice.macVendor ||
                        finalDevice.macVendor ||
                        device.macVendor ||
                        'unknown',
                    online: normalizedDevice.online !== undefined
                        ? normalizedDevice.online
                        : finalDevice.online !== undefined
                            ? finalDevice.online
                            : Boolean(device.online),
                    // The API's lastSeen, or null when it sent none: a device
                    // without one was reported as seen at the time of the request
                    lastSeen: lastSeenOf(device.lastSeen),
                    ipReserved: SafeAccess.getNestedValue(finalDevice, 'ipReserved', false),
                    network: finalDevice.network, // Already normalized
                    group: finalDevice.group, // Already normalized
                    totalDownload: sanitizeByteCount(SafeAccess.getNestedValue(finalDevice, 'totalDownload', 0)),
                    totalUpload: sanitizeByteCount(SafeAccess.getNestedValue(finalDevice, 'totalUpload', 0)),
                    deviceType: finalDevice.deviceType !== undefined
                        ? finalDevice.deviceType
                        : device.deviceType,
                    isFirewalla: finalDevice.isFirewalla !== undefined
                        ? finalDevice.isFirewalla
                        : device.isFirewalla,
                    isRouter: finalDevice.isRouter !== undefined
                        ? finalDevice.isRouter
                        : device.isRouter,
                    monitoring: finalDevice.monitoring !== undefined
                        ? finalDevice.monitoring
                        : device.monitoring,
                };
            });
            // Apply geographic enrichment for IP addresses
            const enrichedDevices = await this.enrichGeoIfNeeded(processedDevices, [
                'ip',
            ]);
            const unifiedResponseData = {
                total_devices: SafeAccess.getNestedValue(devicesResponse, 'total_count', 0),
                online_devices: deviceCounts.online,
                offline_devices: deviceCounts.offline,
                page_size: SafeAccess.safeArrayAccess(devicesResponse.results, arr => arr.length, 0),
                has_more: SafeAccess.getNestedValue(devicesResponse, 'has_more', false),
                devices: enrichedDevices,
                next_cursor: SafeAccess.getNestedValue(devicesResponse, 'next_cursor', null),
            };
            const executionTime = Date.now() - startTime;
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            // Handle timeout errors specifically
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to get device status: ${errorMessage}`, ErrorType.API_ERROR, { originalError: errorMessage });
        }
    }
}
/**
 * Handler for renaming a device
 */
export class RenameDeviceHandler extends BaseToolHandler {
    constructor() {
        super({
            enableGeoEnrichment: false,
            enableFieldNormalization: true,
            additionalMeta: {
                data_source: 'devices',
                entity_type: 'device_rename_operation',
                supports_geographic_enrichment: false,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'rename_device';
        this.description = `Rename a network device (PATCH /v2/boxes/{gid}/devices/{id}; the only device field the MSP API allows changing; 32 characters max). Uses gid, else FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, else the account's only box. ${USER_REQUEST_ONLY}`;
        this.category = 'device';
    }
    async execute(args, firewalla) {
        try {
            // device_id and gid go into the request path
            const deviceIdValidation = ParameterValidator.validatePathSegment(args?.device_id, 'device_id');
            const nameValidation = ParameterValidator.validateRequiredString(args?.name, 'name');
            const gidValidation = ParameterValidator.validatePathSegment(args?.gid, 'gid', { required: false });
            const validationResult = ParameterValidator.combineValidationResults([
                deviceIdValidation,
                nameValidation,
                gidValidation,
            ]);
            if (!validationResult.isValid) {
                return createErrorResponse(this.name, 'Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, validationResult.errors);
            }
            const deviceId = deviceIdValidation.sanitizedValue;
            const name = nameValidation.sanitizedValue;
            let gid;
            try {
                gid = await firewalla.resolveBoxGid(gidValidation.sanitizedValue);
            }
            catch (error) {
                if (!(error instanceof BoxSelectionError)) {
                    throw error;
                }
                return createErrorResponse(this.name, 'No box to rename the device on', ErrorType.VALIDATION_ERROR, undefined, [error.message]);
            }
            // API limit: the name field accepts at most 32 characters
            if (name.length > 32) {
                return createErrorResponse(this.name, 'Device name must be 32 characters or fewer', ErrorType.VALIDATION_ERROR, { name_length: name.length, max_length: 32 });
            }
            const response = await withToolTimeout(async () => firewalla.renameDevice(deviceId, name, gid), this.name);
            return this.createUnifiedResponse({
                device: response,
                device_id: deviceId,
                gid,
                new_name: name,
                renamed: true,
            });
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs, error);
            }
            const unknownWrite = this.unknownWriteResponse(error);
            if (unknownWrite) {
                return unknownWrite;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to rename device: ${errorMessage}`, ErrorType.API_ERROR, { device_id: args?.device_id, name: args?.name });
        }
    }
}
//# sourceMappingURL=device.js.map