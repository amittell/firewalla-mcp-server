/**
 * Network monitoring and analysis tool handlers
 */

import {
  BaseToolHandler,
  mspQueryErrorResponse,
  type ToolArgs,
  type ToolResponse,
} from './base.js';
import { isValidBoxGid, type FirewallaClient } from '../../firewalla/client.js';
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
import { ResponseStandardizer } from '../../utils/response-standardizer.js';
import type { PaginationMetadata } from '../../types.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  withToolTimeout,
  TimeoutError,
  createTimeoutErrorResponse,
} from '../../utils/timeout-manager.js';
import {
  StreamingManager,
  StreamingSessionError,
  shouldUseStreaming,
  createStreamingResponse,
  type StreamingOperation,
} from '../../utils/streaming-manager.js';
import { mspAnd } from '../../utils/msp-query.js';
import type { PagingCoverage } from '../../utils/paging-coverage.js';

/**
 * One get_flow_data record from a client Flow. A plain page and a streamed
 * chunk both use it, and both then have their field names normalized as
 * createUnifiedResponse does (timestamp becomes ts), so a listing whose first
 * page is streamed and whose next pages are read by cursor has one shape.
 */
function toFlowRecord(flow: any) {
  return {
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
    domain: SafeAccess.getNestedValue(flow, 'domain', null),
    network: SafeAccess.getNestedValue(flow, 'network', null),
  };
}

/** A tool's `stream` argument: true, false, or not given */
function streamArgument(value: unknown): boolean | undefined {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return undefined;
}

export class GetFlowDataHandler extends BaseToolHandler {
  name = 'get_flow_data';
  description =
    'Query network traffic flows from the Firewalla MSP API (GET /v2/flows). Without a ts: qualifier the API covers the last 24 hours. Returns up to limit flows and a cursor for the next page, or groups with groupBy; coverage gives the oldest and newest ts returned and why paging stopped. A limit over 50 is streamed: pass nextContinuationToken back as cursor, or sessionId as streaming_session_id. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: true,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'flows',
        entity_type: 'network_flows',
        supports_geographic_enrichment: true,
        supports_field_normalization: true,
        supports_streaming: true,
        supports_pagination: true,
        standardization_version: '2.0.0',
      },
    });
  }

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
          required: false,
          defaultValue: 200,
          ...getLimitValidationConfig(this.name),
        }
      );

      const groupByValidation = ParameterValidator.validateOptionalString(
        args?.groupBy,
        'groupBy'
      );

      if (!limitValidation.isValid || !groupByValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [...limitValidation.errors, ...groupByValidation.errors]
        );
      }

      const query = args?.query;
      const groupBy = groupByValidation.sanitizedValue as string | undefined;
      const sortBy = args?.sortBy;
      const limit = limitValidation.sanitizedValue! as number;
      const cursor = args?.cursor;

      // stream: true streams any limit and stream: false none; without it a
      // limit over 50 is streamed. A request with a cursor returns the page
      // at that cursor and is not streamed: a stream started a new session
      // from the first page, so a client that passed nextContinuationToken
      // back as cursor got the first page again. A cursor is read even with
      // a streaming_session_id. A grouped request is not streamed: it
      // returns groups, not flows.
      const stream = streamArgument(args?.stream);
      const streamingSessionId =
        typeof args?.streaming_session_id === 'string' &&
        args.streaming_session_id.trim() !== ''
          ? args.streaming_session_id.trim()
          : undefined;
      // A session's next chunk is streamed, which stream: false forbids
      if (
        streamingSessionId !== undefined &&
        cursor === undefined &&
        stream === false
      ) {
        return this.createErrorResponse(
          'streaming_session_id and stream: false conflict: a session returns streamed chunks',
          ErrorType.VALIDATION_ERROR,
          { streaming_session_id: streamingSessionId, stream: false },
          [
            'To continue the session, leave out stream',
            'For plain pages, pass the nextContinuationToken of the last chunk as cursor, with stream: false or without it',
          ]
        );
      }
      const continueSession =
        streamingSessionId !== undefined && cursor === undefined;
      const enableStreaming =
        continueSession ||
        (!groupBy &&
          cursor === undefined &&
          stream !== false &&
          (stream === true || shouldUseStreaming(this.name, limit)));

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
        // ANDed in the API's grammar: a space, no parentheses (the API has
        // neither AND nor parentheses)
        finalQuery = mspAnd(query, `ts:${startTs}-${endTs}`);
      }

      // Handle streaming mode if enabled
      if (enableStreaming) {
        // One manager per client for the life of the client, so a session
        // started by one call is there for the next
        const streamingManager = StreamingManager.forTool(this.name, firewalla);
        let coverage: PagingCoverage | undefined;

        // Define the streaming operation. Its parameters are the session's:
        // the saved query and sort, the chunk size and the session's cursor,
        // so a continued session reads the query it was started with.
        const streamingOperation: StreamingOperation = async params => {
          const saved = params as typeof params & {
            query?: string;
            sortBy?: string;
          };
          const response = await withToolTimeout(
            async () =>
              firewalla.getFlowData(
                saved.query,
                undefined,
                saved.sortBy,
                params.limit || limit,
                params.cursor
              ),
            this.name
          );
          ({ coverage } = response);

          // The records of a plain page, with the field names
          // createUnifiedResponse would give them
          const processedFlows = this.normalizeFields(
            await this.flowRecords(response.results)
          );

          return {
            data: processedFlows,
            hasMore: !!response.next_cursor,
            nextCursor: response.next_cursor,
            total: (response as any).total_count,
          };
        };

        if (continueSession) {
          // Continue existing streaming session. Overlapping calls for one
          // session are read one after the other (see getNextChunk).
          let chunk;
          try {
            chunk = await streamingManager.continueStreaming(
              streamingSessionId,
              streamingOperation
            );
          } catch (error: unknown) {
            if (!(error instanceof StreamingSessionError)) {
              throw error;
            }
            return this.createErrorResponse(
              error.reason === 'complete'
                ? `${error.message}: its final chunk (isFinalChunk true) was returned`
                : error.message,
              ErrorType.VALIDATION_ERROR,
              {
                streaming_session_id: streamingSessionId,
                reason: error.reason,
              },
              [
                'A session expires 10 minutes after its latest chunk and is removed a minute after its final one; it lives in the server process that started it',
                'To read on without a session, pass the nextContinuationToken of the last response as cursor',
              ]
            );
          }

          if (!chunk) {
            return this.createErrorResponse(
              'Failed to continue streaming session',
              ErrorType.API_ERROR
            );
          }

          return createStreamingResponse(chunk, true, { coverage });
        }
        // Start new streaming session. Each chunk is limit flows, as a page
        // without streaming is: the tool's 50-flow chunk size would make a
        // 500-flow request take ten calls and ten API requests.
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
          },
          { chunkSize: limit }
        );

        return createStreamingResponse(firstChunk, true, { coverage });
      }

      const response = await withToolTimeout(
        async () =>
          firewalla.getFlowData(finalQuery, groupBy, sortBy, limit, cursor),
        this.name
      );
      const executionTime = Date.now() - startTime;

      // Grouped: the API returned one item of totals per group, not flows
      if (response.groups) {
        return this.createUnifiedResponse(
          {
            group_by: response.group_by,
            count: response.groups.length,
            groups: response.groups,
            next_cursor: response.next_cursor,
            has_more: !!response.next_cursor,
          },
          { executionTimeMs: executionTime }
        );
      }

      // Process flow data; createUnifiedResponse normalizes the field names
      const processedFlows = await this.flowRecords(response.results);

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

      return this.createUnifiedResponse(
        { ...standardResponse, coverage: response.coverage },
        { executionTimeMs: executionTime }
      );
    } catch (error: unknown) {
      // A query the MSP API cannot run was refused before any request
      const queryError = mspQueryErrorResponse(this.name, error);
      if (queryError) {
        return queryError;
      }
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

  /** The records of a page or chunk, with geographic enrichment */
  private async flowRecords(flows: unknown) {
    return this.enrichGeoIfNeeded(
      SafeAccess.safeArrayMap(flows, toFlowRecord),
      ['source_ip', 'destination_ip']
    );
  }
}

export class GetBandwidthUsageHandler extends BaseToolHandler {
  name = 'get_bandwidth_usage';
  description =
    "Top devices by upload plus download over the period, summed client-side from up to 10 times limit (1,000 at most) of the period's most recent flows (GET /v2/flows, 500 per request), so on a busy network the totals cover a sample. Scoped to box, else FIREWALLA_BOX_ID, else every box.";
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: true,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'bandwidth_usage',
        entity_type: 'device_bandwidth',
        supports_geographic_enrichment: true,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

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
          required: false,
          defaultValue: 10,
          ...getLimitValidationConfig(this.name),
        }
      );

      // The box whose flows to sum; getBandwidthUsage falls back to
      // FIREWALLA_BOX_ID
      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );

      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation,
        limitValidation,
        boxValidation,
      ]);

      const box = boxValidation.sanitizedValue as string | undefined;
      if (
        validationResult.isValid &&
        box !== undefined &&
        !isValidBoxGid(box)
      ) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [
            "box must be a box gid (letters, digits, '-' or '_'); get_boxes lists them",
          ]
        );
      }

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
            limitValidation.sanitizedValue as number,
            box
          ),
        this.name
      );

      // Ensure we have results and validate count vs requested limit
      const results = usageResponse.results || [];
      const requestedLimit = limitValidation.sanitizedValue as number;

      // Note: if we get fewer results than requested, this may be due to
      // insufficient data rather than an error

      const startTime = Date.now();

      // Process bandwidth usage data
      const bandwidthData = SafeAccess.safeArrayMap(results, (item: any) => ({
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
      }));

      // Apply geographic enrichment for IP addresses
      const enrichedBandwidthData = await this.enrichGeoIfNeeded(
        bandwidthData,
        ['ip']
      );

      const unifiedResponseData = {
        period: periodValidation.sanitizedValue,
        top_devices: results.length,
        requested_limit: requestedLimit,
        bandwidth_usage: enrichedBandwidthData,
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
  description =
    'List offline devices from the full device list (GET /v2/devices), most recently seen first by default, up to limit; total_offline_devices counts all of them. Scoped to box, else FIREWALLA_BOX_ID, else every box.';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: true,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'devices',
        entity_type: 'offline_devices',
        supports_geographic_enrichment: true,
        supports_field_normalization: true,
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
          defaultValue: 100,
          ...getLimitValidationConfig(this.name),
        }
      );
      const sortValidation = ParameterValidator.validateBoolean(
        args?.sort_by_last_seen,
        'sort_by_last_seen',
        true
      );

      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );

      const validationResult = ParameterValidator.combineValidationResults([
        limitValidation,
        sortValidation,
        boxValidation,
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
      // The box to list; getDeviceStatus falls back to FIREWALLA_BOX_ID
      const box = boxValidation.sanitizedValue as string | undefined;

      // GET /v2/devices answers with every device, and getDeviceStatus pages
      // that list by name on the client. Take the whole list: a page of
      // 3 x limit missed every offline device after it.
      const allDevicesResponse = await withToolTimeout(
        async () =>
          firewalla.getDeviceStatus(
            undefined,
            undefined,
            Number.MAX_SAFE_INTEGER,
            undefined,
            box
          ),
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

      const responseStartTime = Date.now();

      // Process device data
      const deviceData = SafeAccess.safeArrayMap(
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
      );

      // Apply geographic enrichment for IP addresses
      const enrichedDeviceData = await this.enrichGeoIfNeeded(deviceData, [
        'ip',
      ]);

      const unifiedResponseData = {
        total_offline_devices: offlineDevices.length,
        limit_applied: limit,
        returned_count: limitedOfflineDevices.length,
        devices: enrichedDeviceData,
      };

      const executionTime = Date.now() - responseStartTime;
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
      return this.createErrorResponse(
        `Failed to get offline devices: ${errorMessage}`,
        ErrorType.API_ERROR,
        { originalError: errorMessage }
      );
    }
  }
}
