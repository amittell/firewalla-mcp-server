/**
 * Device monitoring tool handlers
 */

import { BaseToolHandler, ToolArgs, ToolResponse } from './base.js';
import { FirewallaClient } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, createErrorResponse } from '../../validation/error-handler.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';

export class GetDeviceStatusHandler extends BaseToolHandler {
  name = 'get_device_status';
  description = 'Check online/offline status of devices';
  category = 'device' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(args?.limit, 'limit', {
        required: true, min: 1, max: 10000, integer: true
      });
      
      if (!limitValidation.isValid) {
        return createErrorResponse(this.name, 'Parameter validation failed', {}, limitValidation.errors);
      }
      
      const deviceId = args?.device_id as string | undefined;
      const includeOffline = (args?.include_offline as boolean) !== false; // Default to true
      const limit = limitValidation.sanitizedValue!;
      const cursor = args?.cursor as string | undefined; // Cursor for pagination
      
      const devicesResponse = await firewalla.getDeviceStatus(deviceId, includeOffline, limit, cursor);
      
      // Optimize device counting to avoid dual array iteration
      const deviceCounts = SafeAccess.safeArrayAccess(
        devicesResponse.results,
        (devices: any[]) => devices.reduce(
          (acc: { online: number; offline: number }, d: any) => {
            if (d.online) acc.online++;
            else acc.offline++;
            return acc;
          },
          { online: 0, offline: 0 }
        ),
        { online: 0, offline: 0 }
      );
      
      return this.createSuccessResponse({
        total_devices: SafeAccess.getNestedValue(devicesResponse, 'total_count', 0),
        online_devices: deviceCounts.online,
        offline_devices: deviceCounts.offline,
        page_size: SafeAccess.safeArrayAccess(devicesResponse.results, (arr) => arr.length, 0),
        has_more: SafeAccess.getNestedValue(devicesResponse, 'has_more', false),
        devices: SafeAccess.safeArrayMap(
          devicesResponse.results,
          (device: any) => ({
            id: SafeAccess.getNestedValue(device, 'id', 'unknown'),
            gid: SafeAccess.getNestedValue(device, 'gid', 'unknown'),
            name: SafeAccess.getNestedValue(device, 'name', 'Unknown Device'),
            ip: SafeAccess.getNestedValue(device, 'ip', 'unknown'),
            macVendor: SafeAccess.getNestedValue(device, 'macVendor', 'unknown'),
            online: SafeAccess.getNestedValue(device, 'online', false),
            lastSeen: unixToISOStringOrNow(SafeAccess.getNestedValue(device, 'lastSeen', 0)),
            ipReserved: SafeAccess.getNestedValue(device, 'ipReserved', false),
            network: SafeAccess.getNestedValue(device, 'network', null),
            group: SafeAccess.getNestedValue(device, 'group', null),
            totalDownload: SafeAccess.getNestedValue(device, 'totalDownload', 0),
            totalUpload: SafeAccess.getNestedValue(device, 'totalUpload', 0),
          })
        ),
        next_cursor: SafeAccess.getNestedValue(devicesResponse, 'next_cursor', null),
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get device status: ${errorMessage}`);
    }
  }
}