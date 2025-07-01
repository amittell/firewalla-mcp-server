/**
 * Network monitoring and analysis tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  unixToISOStringOrNow,
  safeUnixToISOString,
} from '../../utils/timestamp.js';

export class GetFlowDataHandler extends BaseToolHandler {
  name = 'get_flow_data';
  description = 'Query network traffic flows with pagination';
  category = 'network' as const;

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

      const query = args?.query;
      const groupBy = args?.groupBy;
      const sortBy = args?.sortBy;
      const limit = limitValidation.sanitizedValue! as number;
      const cursor = args?.cursor;

      // Build query for time range if provided
      const startTime = args?.start_time as string | undefined;
      const endTime = args?.end_time as string | undefined;
      let finalQuery = query;

      if (startTime && endTime) {
        const startTs = Math.floor(new Date(startTime).getTime() / 1000);
        const endTs = Math.floor(new Date(endTime).getTime() / 1000);
        const timeQuery = `ts:${startTs}-${endTs}`;
        finalQuery = query ? `${query} AND ${timeQuery}` : timeQuery;
      }

      const response = await firewalla.getFlowData(
        finalQuery,
        groupBy,
        sortBy,
        limit,
        cursor
      );

      return this.createSuccessResponse({
        count: response.count,
        flows: SafeAccess.safeArrayMap(response.results, (flow: any) => ({
          timestamp: unixToISOStringOrNow(flow.ts),
          source_ip: SafeAccess.getNestedValue(
            flow,
            'source.ip',
            SafeAccess.getNestedValue(flow, 'device.ip', 'unknown')
          ),
          destination_ip: SafeAccess.getNestedValue(
            flow,
            'destination.ip',
            'unknown'
          ),
          protocol: SafeAccess.getNestedValue(flow, 'protocol', 'unknown'),
          bytes:
            (SafeAccess.getNestedValue(flow, 'download', 0) as number) +
            (SafeAccess.getNestedValue(flow, 'upload', 0) as number),
          download: SafeAccess.getNestedValue(flow, 'download', 0),
          upload: SafeAccess.getNestedValue(flow, 'upload', 0),
          packets: SafeAccess.getNestedValue(flow, 'count', 0),
          duration: SafeAccess.getNestedValue(flow, 'duration', 0),
          direction: SafeAccess.getNestedValue(flow, 'direction', 'unknown'),
          blocked: SafeAccess.getNestedValue(flow, 'block', false),
          block_type: SafeAccess.getNestedValue(flow, 'blockType', null),
          device: SafeAccess.getNestedValue(flow, 'device', {}),
          source: SafeAccess.getNestedValue(flow, 'source', {}),
          destination: SafeAccess.getNestedValue(flow, 'destination', {}),
          region: SafeAccess.getNestedValue(flow, 'region', null),
          category: SafeAccess.getNestedValue(flow, 'category', null),
        })),
        next_cursor: response.next_cursor,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get flow data: ${errorMessage}`
      );
    }
  }
}

export class GetBandwidthUsageHandler extends BaseToolHandler {
  name = 'get_bandwidth_usage';
  description = 'Get top bandwidth consuming devices (specify limit parameter)';
  category = 'network' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const periodValidation = ParameterValidator.validateEnum(
        args?.period,
        'period',
        ['1h', '24h', '7d', '30d'],
        true
      );
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 500,
          integer: true,
        }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation,
        limitValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const usageResponse = await firewalla.getBandwidthUsage(
        periodValidation.sanitizedValue as string,
        limitValidation.sanitizedValue as number
      );

      return this.createSuccessResponse({
        period: periodValidation.sanitizedValue,
        top_devices: SafeAccess.safeArrayAccess(
          usageResponse.results,
          arr => arr.length,
          0
        ),
        bandwidth_usage: SafeAccess.safeArrayMap(
          usageResponse.results,
          (item: any) => ({
            device_id: SafeAccess.getNestedValue(item, 'device_id', 'unknown'),
            device_name: SafeAccess.getNestedValue(
              item,
              'device_name',
              'Unknown Device'
            ),
            ip: SafeAccess.getNestedValue(item, 'ip', 'unknown'),
            bytes_uploaded: SafeAccess.getNestedValue(
              item,
              'bytes_uploaded',
              0
            ),
            bytes_downloaded: SafeAccess.getNestedValue(
              item,
              'bytes_downloaded',
              0
            ),
            total_bytes: SafeAccess.getNestedValue(item, 'total_bytes', 0),
            total_mb:
              Math.round(
                ((SafeAccess.getNestedValue(item, 'total_bytes', 0) as number) /
                  (1024 * 1024)) *
                  100
              ) / 100,
            total_gb:
              Math.round(
                ((SafeAccess.getNestedValue(item, 'total_bytes', 0) as number) /
                  (1024 * 1024 * 1024)) *
                  100
              ) / 100,
          })
        ),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get bandwidth usage: ${errorMessage}`
      );
    }
  }
}

export class GetOfflineDevicesHandler extends BaseToolHandler {
  name = 'get_offline_devices';
  description = 'Get all offline devices with last seen timestamps';
  category = 'network' as const;

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
      const sortValidation = ParameterValidator.validateBoolean(
        args?.sort_by_last_seen,
        'sort_by_last_seen',
        true
      );

      const validationResult = ParameterValidator.combineValidationResults([
        limitValidation,
        sortValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const limit = limitValidation.sanitizedValue! as number;
      const sortByLastSeen = sortValidation.sanitizedValue!;

      // Buffer Strategy: Fetch extra devices to account for post-processing filtering
      //
      // Problem: When filtering for offline devices, we don't know how many devices
      // are offline until after fetching. If we only fetch the requested limit,
      // we might get fewer results than requested after filtering.
      //
      // Solution: Use a "buffer multiplier" strategy where we fetch 3x the requested
      // limit to increase the probability of having enough offline devices after
      // filtering. This trades some API overhead for more consistent result counts.
      //
      // The multiplier of 3 is empirically chosen based on typical online/offline
      // ratios in network environments (usually 60-80% devices are online).
      const fetchLimit = Math.min(limit * 3, 1000); // 3x buffer with 1000 cap for API limits
      const allDevicesResponse = await firewalla.getDeviceStatus(
        undefined,
        undefined,
        fetchLimit
      );

      // Filter to only offline devices
      let offlineDevices = SafeAccess.safeArrayFilter(
        allDevicesResponse.results,
        (device: any) => !SafeAccess.getNestedValue(device, 'online', false)
      );

      // Sort by last seen timestamp if requested
      if (sortByLastSeen) {
        offlineDevices = offlineDevices.sort((a, b) => {
          const aTime = Number(SafeAccess.getNestedValue(a, 'lastSeen', 0));
          const bTime = Number(SafeAccess.getNestedValue(b, 'lastSeen', 0));
          return bTime - aTime; // Most recent first
        });
      }

      // Apply the requested limit
      const limitedOfflineDevices = offlineDevices.slice(0, limit);

      return this.createSuccessResponse({
        total_offline_devices: offlineDevices.length,
        limit_applied: limit,
        returned_count: limitedOfflineDevices.length,
        devices: SafeAccess.safeArrayMap(
          limitedOfflineDevices,
          (device: any) => ({
            id: SafeAccess.getNestedValue(device, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(device, 'name', 'Unknown Device'),
            ip: SafeAccess.getNestedValue(device, 'ip', 'unknown'),
            macVendor: SafeAccess.getNestedValue(
              device,
              'macVendor',
              'unknown'
            ),
            lastSeen: SafeAccess.getNestedValue(device, 'lastSeen', 0),
            lastSeenFormatted: safeUnixToISOString(
              SafeAccess.getNestedValue(device, 'lastSeen', 0) as number,
              'Never'
            ),
            network: SafeAccess.getNestedValue(device, 'network', null),
            group: SafeAccess.getNestedValue(device, 'group', null),
          })
        ),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get offline devices: ${errorMessage}`
      );
    }
  }
}
