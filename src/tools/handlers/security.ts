/**
 * Security monitoring tool handlers
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
  getCurrentTimestamp,
} from '../../utils/timestamp.js';

export class GetActiveAlarmsHandler extends BaseToolHandler {
  name = 'get_active_alarms';
  description =
    'Retrieve active security alarms with optional severity filtering';
  category = 'security' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const queryValidation = ParameterValidator.validateOptionalString(
        args?.query,
        'query'
      );
      const groupByValidation = ParameterValidator.validateOptionalString(
        args?.groupBy,
        'groupBy'
      );
      const sortByValidation = ParameterValidator.validateOptionalString(
        args?.sortBy,
        'sortBy'
      );
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
      const cursorValidation = ParameterValidator.validateOptionalString(
        args?.cursor,
        'cursor'
      );
      const includeTotalValidation = ParameterValidator.validateBoolean(
        args?.include_total_count,
        'include_total_count',
        false
      );
      const severityValidation = ParameterValidator.validateEnum(
        args?.severity,
        'severity',
        ['low', 'medium', 'high', 'critical'],
        false // not required
      );

      const validationResult = ParameterValidator.combineValidationResults([
        queryValidation,
        groupByValidation,
        sortByValidation,
        limitValidation,
        cursorValidation,
        includeTotalValidation,
        severityValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          'get_active_alarms',
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      // Build query string combining provided query and severity filter
      let sanitizedQuery = queryValidation.sanitizedValue as string | undefined;
      const severityValue = severityValidation.sanitizedValue as
        | string
        | undefined;

      // Add severity filter to query if provided
      if (severityValue) {
        const severityQuery = `severity:${severityValue}`;
        if (sanitizedQuery) {
          sanitizedQuery = `(${sanitizedQuery}) AND ${severityQuery}`;
        } else {
          sanitizedQuery = severityQuery;
        }
      }

      // Skip query sanitization that may be over-sanitizing and breaking queries
      // Just use the query directly - basic validation was already done above

      const response = await firewalla.getActiveAlarms(
        sanitizedQuery,
        groupByValidation.sanitizedValue as string | undefined,
        (sortByValidation.sanitizedValue as string) || 'timestamp:desc',
        limitValidation.sanitizedValue as number,
        cursorValidation.sanitizedValue as string | undefined
      );

      // Calculate total count if requested
      let totalCount: number = SafeAccess.getNestedValue(
        response as any,
        'count',
        0
      ) as number;
      let pagesTraversed = 1;

      if (
        includeTotalValidation.sanitizedValue === true &&
        response.next_cursor
      ) {
        // Traverse all pages to get true total count
        let cursor: string | undefined = response.next_cursor;
        const pageSize = 100; // Use smaller pages for counting
        const maxPages = 100; // Safety limit

        while (cursor && pagesTraversed < maxPages) {
          const nextPage = await firewalla.getActiveAlarms(
            sanitizedQuery,
            undefined,
            'timestamp:desc',
            pageSize,
            cursor
          );

          const pageCount = SafeAccess.getNestedValue(
            nextPage as any,
            'count',
            0
          ) as number;
          totalCount += pageCount;
          cursor = nextPage.next_cursor;
          pagesTraversed++;
        }
      }

      return this.createSuccessResponse({
        count: SafeAccess.getNestedValue(response as any, 'count', 0),
        alarms: SafeAccess.safeArrayMap(response.results, (alarm: any) => ({
          aid: SafeAccess.getNestedValue(alarm, 'aid', 0),
          timestamp: unixToISOStringOrNow(alarm.ts),
          type: SafeAccess.getNestedValue(alarm, 'type', 'unknown'),
          status: SafeAccess.getNestedValue(alarm, 'status', 'unknown'),
          message: SafeAccess.getNestedValue(alarm, 'message', 'No message'),
          direction: SafeAccess.getNestedValue(alarm, 'direction', 'unknown'),
          protocol: SafeAccess.getNestedValue(alarm, 'protocol', 'unknown'),
          gid: SafeAccess.getNestedValue(alarm, 'gid', 'unknown'),
          // Include conditional properties if present
          ...(alarm.device && { device: alarm.device }),
          ...(alarm.remote && { remote: alarm.remote }),
          ...(alarm.src && { src: alarm.src }),
          ...(alarm.dst && { dst: alarm.dst }),
          ...(alarm.port && { port: alarm.port }),
          ...(alarm.dport && { dport: alarm.dport }),
          ...(alarm.severity && { severity: alarm.severity }),
        })),
        next_cursor: response.next_cursor,
        total_count: totalCount,
        pages_traversed: pagesTraversed,
        has_more: !!response.next_cursor,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get active alarms: ${errorMessage}`
      );
    }
  }
}

export class GetSpecificAlarmHandler extends BaseToolHandler {
  name = 'get_specific_alarm';
  description = 'Get detailed information for a specific alarm';
  category = 'security' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const alarmIdValidation = ParameterValidator.validateRequiredString(
        args?.alarm_id,
        'alarm_id'
      );

      if (!alarmIdValidation.isValid) {
        return createErrorResponse(
          'get_specific_alarm',
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          alarmIdValidation.errors
        );
      }

      const response = await firewalla.getSpecificAlarm(
        alarmIdValidation.sanitizedValue as string
      );

      return this.createSuccessResponse({
        alarm: response,
        retrieved_at: getCurrentTimestamp(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get specific alarm: ${errorMessage}`
      );
    }
  }
}

export class DeleteAlarmHandler extends BaseToolHandler {
  name = 'delete_alarm';
  description = 'Delete/dismiss a specific alarm';
  category = 'security' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const alarmIdValidation = ParameterValidator.validateRequiredString(
        args?.alarm_id,
        'alarm_id'
      );

      if (!alarmIdValidation.isValid) {
        return createErrorResponse(
          'delete_alarm',
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          alarmIdValidation.errors
        );
      }

      const alarmId = alarmIdValidation.sanitizedValue as string;

      // First verify the alarm exists before attempting deletion
      try {
        const alarmCheck = await firewalla.getSpecificAlarm(alarmId);
        if (
          !alarmCheck ||
          !alarmCheck.results ||
          alarmCheck.results.length === 0
        ) {
          return createErrorResponse(
            'delete_alarm',
            `Alarm with ID '${alarmId}' not found`,
            ErrorType.API_ERROR,
            undefined,
            [`Alarm ID '${alarmId}' does not exist or has already been deleted`]
          );
        }
      } catch (checkError: unknown) {
        // If we can't retrieve the alarm, it likely doesn't exist
        const checkErrorMessage =
          checkError instanceof Error ? checkError.message : 'Unknown error';
        if (
          checkErrorMessage.includes('not found') ||
          checkErrorMessage.includes('404')
        ) {
          return createErrorResponse(
            'delete_alarm',
            `Alarm with ID '${alarmId}' not found`,
            ErrorType.API_ERROR,
            undefined,
            [`Alarm ID '${alarmId}' does not exist or has already been deleted`]
          );
        }
        // Re-throw other errors (network issues, auth problems, etc.)
        throw checkError;
      }

      // Alarm exists, proceed with deletion
      const response = await firewalla.deleteAlarm(alarmId);

      return this.createSuccessResponse({
        success: true,
        alarm_id: alarmId,
        message: 'Alarm deleted successfully',
        deleted_at: getCurrentTimestamp(),
        details: response,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to delete alarm: ${errorMessage}`
      );
    }
  }
}
