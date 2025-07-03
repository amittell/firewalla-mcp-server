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
  normalizeUnknownFields,
  sanitizeFieldValue,
  batchNormalize,
} from '../../utils/data-normalizer.js';
import {
  validateResponseStructure,
  normalizeTimestamps,
  createValidationSchema,
} from '../../utils/data-validator.js';

export class GetDeviceStatusHandler extends BaseToolHandler {
  name = 'get_device_status';
  description = 'Check online/offline status of devices';
  category = 'device' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 1000,
          integer: true,
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

      const devicesResponse = await firewalla.getDeviceStatus(
        deviceId,
        includeOffline,
        limit,
        cursor
      );

      // Validate response structure
      const validationSchema = createValidationSchema('devices');
      const validationResult = validateResponseStructure(
        devicesResponse,
        validationSchema
      );

      if (!validationResult.isValid) {
        // Log validation warnings for debugging
        console.warn(
          'Device response validation failed:',
          validationResult.errors
        );
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
      });

      // Optimize device counting to avoid dual array iteration
      const deviceCounts = normalizedDevices.reduce(
        (acc: { online: number; offline: number }, d: any) => {
          if (d.online) {
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
            online: SafeAccess.getNestedValue(finalDevice, 'online', false),
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
            totalDownload: SafeAccess.getNestedValue(
              finalDevice,
              'totalDownload',
              0
            ),
            totalUpload: SafeAccess.getNestedValue(
              finalDevice,
              'totalUpload',
              0
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get device status: ${errorMessage}`
      );
    }
  }
}
