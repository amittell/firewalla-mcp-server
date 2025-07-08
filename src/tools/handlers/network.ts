/**
 * Network monitoring and analysis tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  unixToISOStringOrNow,
  safeUnixToISOString,
} from '../../utils/timestamp.js';
import {
  normalizeUnknownFields,
  sanitizeFieldValue,
  batchNormalize,
  sanitizeByteCount,
} from '../../utils/data-normalizer.js';
import {
  ResponseStandardizer,
  BackwardCompatibilityLayer,
} from '../../utils/response-standardizer.js';
import { shouldUseLegacyFormat } from '../../config/response-config.js';
import type { PaginationMetadata } from '../../types.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  withToolTimeout,
  TimeoutError,
  createTimeoutErrorResponse,
} from '../../utils/timeout-manager.js';
import {
  StreamingManager,
  shouldUseStreaming,
  createStreamingResponse,
  type StreamingOperation,
} from '../../utils/streaming-manager.js';

export class GetFlowDataHandler extends BaseToolHandler {
  name = 'get_flow_data';
  description = 'Query network traffic flows with pagination';
  category = 'network' as const;

  async execute(
    rawArgs: unknown,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // Early parameter sanitization to prevent null/undefined errors
    const sanitizationResult = this.sanitizeParameters(rawArgs);

    if ('errorResponse' in sanitizationResult) {
      return sanitizationResult.errorResponse;
    }

    const args = sanitizationResult.sanitizedArgs;
    const startTime = Date.now();

    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
        }
      );

      if (!limitValidation.isValid) {
        return this.createErrorResponse(
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

      // Check if streaming is requested or should be automatically enabled
      const enableStreaming =
        Boolean(args?.stream) || shouldUseStreaming(this.name, limit);
      const streamingSessionId = args?.streaming_session_id as
        | string
        | undefined;

      // Validate individual date parameters before building query
      const startTimeArg = args?.start_time as string | undefined;
      const endTime = args?.end_time as string | undefined;
      let finalQuery = query;

      // Validate start_time if provided
      if (startTimeArg !== undefined) {
        const startTimeValidation = ParameterValidator.validateDateFormat(
          startTimeArg,
          'start_time',
          false
        );
        if (!startTimeValidation.isValid) {
          return this.createErrorResponse(
            'Invalid start_time format',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: startTimeArg,
              documentation:
                'See /docs/query-syntax-guide.md for time range examples',
            },
            startTimeValidation.errors
          );
        }
      }

      // Validate end_time if provided
      if (endTime !== undefined) {
        const endTimeValidation = ParameterValidator.validateDateFormat(
          endTime,
          'end_time',
          false
        );
        if (!endTimeValidation.isValid) {
          return this.createErrorResponse(
            'Invalid end_time format',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: endTime,
              documentation:
                'See /docs/query-syntax-guide.md for time range examples',
            },
            endTimeValidation.errors
          );
        }
      }

      // Validate cursor format if provided
      if (cursor !== undefined) {
        const cursorValidation = ParameterValidator.validateCursor(
          cursor,
          'cursor'
        );
        if (!cursorValidation.isValid) {
          return this.createErrorResponse(
            'Invalid cursor format',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: cursor,
              documentation:
                'Cursors should be obtained from previous response next_cursor field',
            },
            cursorValidation.errors
          );
        }
      }

      // Build time range query if both dates are provided and valid
      if (startTimeArg && endTime) {
        const startDate = new Date(startTimeArg);
        const endDate = new Date(endTime);

        // Validate time range order (dates are already validated for format above)
        if (startDate >= endDate) {
          return this.createErrorResponse(
            'Invalid time range order',
            ErrorType.VALIDATION_ERROR,
            {
              details: 'Start time must be before end time',
              received: {
                start_time: startTimeArg,
                end_time: endTime,
                parsed_start: startDate.toISOString(),
                parsed_end: endDate.toISOString(),
              },
              time_difference: `Start is ${Math.abs(startDate.getTime() - endDate.getTime()) / 1000} seconds after end`,
            },
            [
              'Ensure start_time is chronologically before end_time',
              'Check timezone handling - times may be in different zones',
              'Verify date format includes correct year/month/day values',
              'For recent data, try: start_time: "2024-01-01T00:00:00Z", end_time: "2024-01-02T00:00:00Z"',
            ]
          );
        }

        const startTs = Math.floor(startDate.getTime() / 1000);
        const endTs = Math.floor(endDate.getTime() / 1000);
        const timeQuery = `ts:${startTs}-${endTs}`;
        finalQuery = query ? `(${query}) AND ${timeQuery}` : timeQuery;
      }

      // Handle streaming mode if enabled
      if (enableStreaming) {
        const streamingManager = StreamingManager.forTool(this.name);

        // Define the streaming operation
        const streamingOperation: StreamingOperation = async params => {
          const response = await withToolTimeout(
            async () =>
              firewalla.getFlowData(
                finalQuery,
                groupBy,
                sortBy,
                params.limit || 100,
                params.cursor
              ),
            this.name
          );

          // Process flows for this chunk
          const processedFlows = SafeAccess.safeArrayMap(
            response.results,
            (flow: any) => ({
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
              direction: SafeAccess.getNestedValue(
                flow,
                'direction',
                'unknown'
              ),
              blocked: SafeAccess.getNestedValue(flow, 'block', false),
              block_type: SafeAccess.getNestedValue(flow, 'blockType', null),
              device: SafeAccess.getNestedValue(flow, 'device', {}),
              source: SafeAccess.getNestedValue(flow, 'source', {}),
              destination: SafeAccess.getNestedValue(flow, 'destination', {}),
              region: SafeAccess.getNestedValue(flow, 'region', null),
              category: SafeAccess.getNestedValue(flow, 'category', null),
            })
          );

          return {
            data: processedFlows,
            hasMore: !!response.next_cursor,
            nextCursor: response.next_cursor,
            total: (response as any).total_count,
          };
        };

        if (streamingSessionId) {
          // Continue existing streaming session
          const chunk = await streamingManager.continueStreaming(
            streamingSessionId,
            streamingOperation
          );

          if (!chunk) {
            return this.createErrorResponse(
              'Failed to continue streaming session',
              ErrorType.API_ERROR
            );
          }

          return createStreamingResponse(chunk);
        }
        // Start new streaming session
        const { firstChunk } = await streamingManager.startStreaming(
          this.name,
          streamingOperation,
          {
            query: finalQuery,
            groupBy,
            sortBy,
            limit,
            start_time: startTimeArg,
            end_time: endTime,
          }
        );

        return createStreamingResponse(firstChunk);
      }

      const response = await withToolTimeout(
        async () =>
          firewalla.getFlowData(finalQuery, groupBy, sortBy, limit, cursor),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Process flow data
      const processedFlows = SafeAccess.safeArrayMap(
        response.results,
        (flow: any) => ({
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
        })
      );

      // Create metadata for standardized response
      const metadata: PaginationMetadata = {
        cursor: response.next_cursor,
        hasMore: !!response.next_cursor,
        limit,
        executionTime,
        cached: false,
        source: 'firewalla_api',
        queryParams: {
          query: finalQuery,
          groupBy,
          sortBy,
          limit,
          cursor,
          start_time: startTimeArg,
          end_time: endTime,
        },
        totalCount: (response as any).total_count,
      };

      // Create standardized response
      const standardResponse = ResponseStandardizer.toPaginatedResponse(
        processedFlows,
        metadata
      );

      // Apply backward compatibility if needed
      if (shouldUseLegacyFormat(this.name)) {
        const legacyResponse =
          BackwardCompatibilityLayer.toLegacyPaginatedFormat(
            standardResponse,
            this.name
          );
        return this.createSuccessResponse(legacyResponse);
      }

      return this.createSuccessResponse(standardResponse);
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
      return this.createErrorResponse(
        `Failed to get flow data: ${errorMessage}`,
        ErrorType.API_ERROR,
        { originalError: errorMessage }
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
          ...getLimitValidationConfig(this.name),
        }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation,
        limitValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const usageResponse = await withToolTimeout(
        async () =>
          firewalla.getBandwidthUsage(
            periodValidation.sanitizedValue as string,
            limitValidation.sanitizedValue as number
          ),
        this.name
      );

      // Ensure we have results and validate count vs requested limit
      const results = usageResponse.results || [];
      const requestedLimit = limitValidation.sanitizedValue as number;

      // Note: if we get fewer results than requested, this may be due to
      // insufficient data rather than an error

      return this.createSuccessResponse({
        period: periodValidation.sanitizedValue,
        top_devices: results.length,
        requested_limit: requestedLimit,
        bandwidth_usage: SafeAccess.safeArrayMap(results, (item: any) => ({
          device_id: SafeAccess.getNestedValue(item, 'device_id', 'unknown'),
          device_name: SafeAccess.getNestedValue(
            item,
            'device_name',
            'Unknown Device'
          ),
          ip: SafeAccess.getNestedValue(item, 'ip', 'unknown'),
          bytes_uploaded: SafeAccess.getNestedValue(item, 'bytes_uploaded', 0),
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
        })),
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
      return this.createErrorResponse(
        `Failed to get bandwidth usage: ${errorMessage}`,
        ErrorType.API_ERROR,
        { originalError: errorMessage }
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
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
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
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const limit = limitValidation.sanitizedValue! as number;
      const sortByLastSeen = sortValidation.sanitizedValue ?? true;

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
      const allDevicesResponse = await withToolTimeout(
        async () => firewalla.getDeviceStatus(undefined, undefined, fetchLimit),
        this.name
      );

      // Normalize device data for consistency first
      const deviceResults = SafeAccess.safeArrayAccess(
        allDevicesResponse.results,
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

      // Filter to only offline devices with consistent boolean checking
      let offlineDevices = SafeAccess.safeArrayFilter(
        normalizedDevices,
        (device: any) => device.online === false
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
            gid: SafeAccess.getNestedValue(device, 'gid', 'unknown'),
            name: device.name, // Already normalized
            ip: device.ip, // Already normalized
            macVendor: device.macVendor, // Already normalized
            online: device.online, // Already normalized to false for offline devices
            lastSeen: SafeAccess.getNestedValue(device, 'lastSeen', 0),
            lastSeenFormatted: safeUnixToISOString(
              SafeAccess.getNestedValue(device, 'lastSeen', 0) as number,
              'Never'
            ),
            ipReserved: SafeAccess.getNestedValue(device, 'ipReserved', false),
            network: device.network, // Already normalized
            group: device.group, // Already normalized
            totalDownload: sanitizeByteCount(
              SafeAccess.getNestedValue(device, 'totalDownload', 0)
            ),
            totalUpload: sanitizeByteCount(
              SafeAccess.getNestedValue(device, 'totalUpload', 0)
            ),
          })
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
      return this.createErrorResponse(
        `Failed to get offline devices: ${errorMessage}`,
        ErrorType.API_ERROR,
        { originalError: errorMessage }
      );
    }
  }
}
