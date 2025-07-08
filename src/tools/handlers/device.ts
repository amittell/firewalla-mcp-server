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
// Temporarily commented out for simplification PR
// import {
//   safeAccess,
//   safeValue,
//   safeByteCount,
// } from '../../utils/data-normalizer.js';
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
  description = 'Check online/offline status of devices';
  category = 'device' as const;

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
          required: true,
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

      return this.createSuccessResponse({
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
        devices: normalizedDevices.map((device: any) => {
          // Apply timestamp normalization to device data
          const timestampNormalized = normalizeTimestamps(device);
          const finalDevice = timestampNormalized.data;

          return {
            id: SafeAccess.getNestedValue(finalDevice, 'id', 'unknown'),
            gid: SafeAccess.getNestedValue(finalDevice, 'gid', 'unknown'),
            name: finalDevice.name, // Already normalized
            ip: finalDevice.ip, // Already normalized
            macVendor: finalDevice.macVendor, // Already normalized
            online: finalDevice.online, // Already normalized to boolean
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
        }),
        next_cursor: SafeAccess.getNestedValue(
          devicesResponse,
          'next_cursor',
          null
        ),
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
