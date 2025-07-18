/**
 * Device monitoring tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';
import {
  sanitizeFieldValue,
  normalizeUnknownFields,
  batchNormalize,
  sanitizeByteCount,
} from '../../utils/data-normalizer.js';
import {
  validateResponseStructure,
  normalizeTimestamps,
  createValidationSchema,
} from '../../utils/data-validator.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  withToolTimeout,
  TimeoutError,
  createTimeoutErrorResponse,
} from '../../utils/timeout-manager.js';

export class GetDeviceStatusHandler extends BaseToolHandler {
  name = 'get_device_status';
  description =
    'Check online/offline status of all network devices with detailed information including MAC addresses, IP addresses, device types, and last seen timestamps. Requires limit parameter. Data is cached for 2 minutes for performance.';
  category = 'device' as const;

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
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: false,
          defaultValue: 200,
          ...getLimitValidationConfig(this.name),
        }
      );

      if (!limitValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          limitValidation.errors
        );
      }

      const deviceId = args?.device_id;
      const includeOffline = (args?.include_offline as boolean) !== false; // Default to true
      const limit = limitValidation.sanitizedValue! as number;
      const cursor = args?.cursor; // Cursor for pagination

      const devicesResponse = await withToolTimeout(
        async () =>
          firewalla.getDeviceStatus(deviceId, includeOffline, limit, cursor),
        this.name
      );

      // Validate response structure
      const validationSchema = createValidationSchema('devices');
      const validationResult = validateResponseStructure(
        devicesResponse,
        validationSchema
      );

      if (!validationResult.isValid) {
        // Validation warnings logged for debugging
      }

      // Normalize device data for consistency
      const deviceResults = SafeAccess.safeArrayAccess(
        devicesResponse.results,
        (arr: any[]) => arr,
        []
      ) as any[];
      const normalizedDevices = batchNormalize(deviceResults, {
        name: (v: any) => sanitizeFieldValue(v, 'Unknown Device').value,
        ip: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        macVendor: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        network: (v: any) => (v ? normalizeUnknownFields(v) : null),
        group: (v: any) => (v ? normalizeUnknownFields(v) : null),
        online: (v: any) => Boolean(v), // Ensure consistent boolean handling
      });

      // Optimize device counting to avoid dual array iteration
      const deviceCounts = normalizedDevices.reduce(
        (acc: { online: number; offline: number }, d: any) => {
          if (d.online === true) {
            acc.online++;
          } else {
            acc.offline++;
          }
          return acc;
        },
        { online: 0, offline: 0 }
      );

      const startTime = Date.now();

      // Process device data with timestamps but preserve original IDs
      const processedDevices = deviceResults.map((device: any, index: number) => {
        // Apply timestamp normalization to device data
        const timestampNormalized = normalizeTimestamps(device);
        const finalDevice = timestampNormalized.data;
        
        // Get normalized device for other fields
        const normalizedDevice = normalizedDevices[index] || {};

        return {
          id: device.id || device.mac || 'unknown', // Use original ID or MAC
          gid: device.gid || 'unknown', // Use original GID
          name: normalizedDevice.name || finalDevice.name || device.name || 'unknown',
          ip: normalizedDevice.ip || finalDevice.ip || device.ip || 'unknown',
          macVendor: normalizedDevice.macVendor || finalDevice.macVendor || device.macVendor || 'unknown',
          online: normalizedDevice.online !== undefined ? normalizedDevice.online : (finalDevice.online !== undefined ? finalDevice.online : Boolean(device.online)),
          lastSeen: unixToISOStringOrNow(
            SafeAccess.getNestedValue(finalDevice, 'lastSeen', 0) as number
          ),
          ipReserved: SafeAccess.getNestedValue(
            finalDevice,
            'ipReserved',
            false
          ),
          network: finalDevice.network, // Already normalized
          group: finalDevice.group, // Already normalized
          totalDownload: sanitizeByteCount(
            SafeAccess.getNestedValue(finalDevice, 'totalDownload', 0)
          ),
          totalUpload: sanitizeByteCount(
            SafeAccess.getNestedValue(finalDevice, 'totalUpload', 0)
          ),
        };
      });

      // Apply geographic enrichment for IP addresses
      const enrichedDevices = await this.enrichGeoIfNeeded(processedDevices, [
        'ip',
      ]);

      const unifiedResponseData = {
        total_devices: SafeAccess.getNestedValue(
          devicesResponse,
          'total_count',
          0
        ),
        online_devices: (deviceCounts as { online: number; offline: number })
          .online,
        offline_devices: (deviceCounts as { online: number; offline: number })
          .offline,
        page_size: SafeAccess.safeArrayAccess(
          devicesResponse.results,
          arr => arr.length,
          0
        ),
        has_more: SafeAccess.getNestedValue(
          devicesResponse as any,
          'has_more',
          false
        ),
        devices: enrichedDevices,
        next_cursor: SafeAccess.getNestedValue(
          devicesResponse,
          'next_cursor',
          null
        ),
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      // Handle timeout errors specifically
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout from timeout-manager
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return createErrorResponse(
        this.name,
        `Failed to get device status: ${errorMessage}`,
        ErrorType.API_ERROR,
        { originalError: errorMessage }
      );
    }
  }
}
