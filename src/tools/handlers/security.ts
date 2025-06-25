/**
 * Security monitoring tool handlers
 */

import { BaseToolHandler, ToolArgs, ToolResponse } from './base.js';
import { FirewallaClient } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, QuerySanitizer, ErrorHandler } from '../../validation/error-handler.js';
import { unixToISOStringOrNow, getCurrentTimestamp } from '../../utils/timestamp.js';

export class GetActiveAlarmsHandler extends BaseToolHandler {
  name = 'get_active_alarms';
  description = 'Retrieve active security alarms';
  category = 'security' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const queryValidation = ParameterValidator.validateOptionalString(args?.query, 'query');
      const groupByValidation = ParameterValidator.validateOptionalString(args?.groupBy, 'groupBy');
      const sortByValidation = ParameterValidator.validateOptionalString(args?.sortBy, 'sortBy');
      const limitValidation = ParameterValidator.validateNumber(args?.limit, 'limit', {
        required: true, min: 1, max: 10000, integer: true
      });
      const cursorValidation = ParameterValidator.validateOptionalString(args?.cursor, 'cursor');
      
      const validationResult = ParameterValidator.combineValidationResults([
        queryValidation, groupByValidation, sortByValidation, limitValidation, cursorValidation
      ]);
      
      if (!validationResult.isValid) {
        return ErrorHandler.createErrorResponse('get_active_alarms', 'Parameter validation failed', null, validationResult.errors);
      }
      
      // Sanitize query if provided
      let sanitizedQuery = queryValidation.sanitizedValue;
      if (sanitizedQuery) {
        const queryCheck = QuerySanitizer.sanitizeSearchQuery(sanitizedQuery);
        if (!queryCheck.isValid) {
          return ErrorHandler.createErrorResponse('get_active_alarms', 'Query validation failed', null, queryCheck.errors);
        }
        sanitizedQuery = queryCheck.sanitizedValue;
      }
      
      const response = await firewalla.getActiveAlarms(
        sanitizedQuery,
        groupByValidation.sanitizedValue,
        sortByValidation.sanitizedValue || 'ts:desc',
        limitValidation.sanitizedValue!,
        cursorValidation.sanitizedValue
      );
      
      return this.createSuccessResponse({
        count: SafeAccess.getNestedValue(response, 'count', 0),
        alarms: SafeAccess.safeArrayMap(
          response.results,
          (alarm: any) => ({
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
            ...(alarm.severity && { severity: alarm.severity })
          })
        ),
        next_cursor: response.next_cursor,
        total_count: SafeAccess.getNestedValue(response, 'total_count', 0),
        has_more: SafeAccess.getNestedValue(response, 'has_more', false)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get active alarms: ${errorMessage}`);
    }
  }
}

export class GetSpecificAlarmHandler extends BaseToolHandler {
  name = 'get_specific_alarm';
  description = 'Get detailed information for a specific alarm';
  category = 'security' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const alarmIdValidation = ParameterValidator.validateRequiredString(args?.alarm_id, 'alarm_id');
      
      if (!alarmIdValidation.isValid) {
        return ErrorHandler.createErrorResponse('get_specific_alarm', 'Parameter validation failed', null, alarmIdValidation.errors);
      }
      
      const response = await firewalla.getSpecificAlarm(alarmIdValidation.sanitizedValue!);
      
      return this.createSuccessResponse({
        alarm: response,
        retrieved_at: getCurrentTimestamp()
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get specific alarm: ${errorMessage}`);
    }
  }
}

export class DeleteAlarmHandler extends BaseToolHandler {
  name = 'delete_alarm';
  description = 'Delete/dismiss a specific alarm';
  category = 'security' as const;

  async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const alarmIdValidation = ParameterValidator.validateRequiredString(args?.alarm_id, 'alarm_id');
      
      if (!alarmIdValidation.isValid) {
        return ErrorHandler.createErrorResponse('delete_alarm', 'Parameter validation failed', null, alarmIdValidation.errors);
      }
      
      const response = await firewalla.deleteAlarm(alarmIdValidation.sanitizedValue!);
      
      return this.createSuccessResponse({
        success: true,
        alarm_id: alarmIdValidation.sanitizedValue,
        message: 'Alarm deleted successfully',
        deleted_at: getCurrentTimestamp(),
        details: response
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to delete alarm: ${errorMessage}`);
    }
  }
}