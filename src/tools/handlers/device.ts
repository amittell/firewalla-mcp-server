/**
 * Device monitoring tool handlers
 */

import { BaseToolHandler, ToolArgs, ToolResponse } from './base.js';
import { FirewallaClient } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, ErrorHandler } from '../../validation/error-handler.js';

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
        return ErrorHandler.createErrorResponse(this.name, 'Parameter validation failed', {}, limitValidation.errors);
      }
      
      const deviceId = args?.device_id as string | undefined;
      const includeOffline = (args?.include_offline as boolean) !== false; // Default to true
      const limit = limitValidation.sanitizedValue!;
      const cursor = args?.cursor as string | undefined; // Cursor for pagination
      
      const devicesResponse = await firewalla.getDeviceStatus(deviceId, includeOffline, limit, cursor);
      
      return this.createSuccessResponse({
        total_devices: SafeAccess.getNestedValue(devicesResponse, 'total_count', 0),
        online_devices: SafeAccess.safeArrayFilter(devicesResponse.results, (d: any) => d.online).length,
        offline_devices: SafeAccess.safeArrayFilter(devicesResponse.results, (d: any) => !d.online).length,
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
            lastSeen: SafeAccess.getNestedValue(device, 'lastSeen', 0),
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