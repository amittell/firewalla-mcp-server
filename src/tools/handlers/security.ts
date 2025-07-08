/**
 * Security monitoring tool handlers
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
  getCurrentTimestamp,
} from '../../utils/timestamp.js';
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
import { getLimitValidationConfig } from '../../config/limits.js';
import {
  withToolTimeout,
  createTimeoutErrorResponse,
  TimeoutError,
} from '../../utils/timeout-manager.js';

/**
 * Map alarm types to severity levels
 * Based on Firewalla alarm classification and threat levels
 */
const ALARM_TYPE_SEVERITY_MAP: Record<string, string> = {
  // Critical severity (immediate threat)
  'MALWARE_FILE': 'critical',
  'MALWARE_URL': 'critical', 
  'RANSOMWARE': 'critical',
  'BOTNET': 'critical',
  'C2_COMMUNICATION': 'critical',
  'CRYPTOJACKING': 'critical',
  'DATA_EXFILTRATION': 'critical',
  'BRUTE_FORCE_ATTACK': 'critical',
  'KNOWN_VULNERABILITY_EXPLOIT': 'critical',
  'PHISHING': 'critical',
  'TROJAN': 'critical',
  'SPYWARE': 'critical',

  // High severity (significant security concern)
  'SUSPICIOUS_ACTIVITY': 'high',
  'NETWORK_INTRUSION': 'high',
  'PORT_SCAN': 'high',
  'DGA_DOMAIN': 'high',
  'SUSPICIOUS_DNS': 'high',
  'TOR_CONNECTION': 'high',
  'PROXY_DETECTED': 'high',
  'VPN_DETECTED': 'high',
  'UNUSUAL_TRAFFIC': 'high',
  'ABNORMAL_PROTOCOL': 'high',
  'SUSPICIOUS_URL': 'high',
  'AD_BLOCK_VIOLATION': 'high',
  'PARENTAL_CONTROL_VIOLATION': 'high',
  'POLICY_VIOLATION': 'high',
  'BLOCKED_CONTENT': 'high',

  // Medium severity (notable events requiring attention)
  'DNS_ANOMALY': 'medium',
  'LARGE_UPLOAD': 'medium',
  'LARGE_DOWNLOAD': 'medium',
  'UNUSUAL_BANDWIDTH': 'medium',
  'NEW_DEVICE': 'medium',
  'DEVICE_OFFLINE': 'medium',
  'VULNERABILITY_SCAN': 'medium',
  'INTEL_MATCH': 'medium',
  'GEO_IP_ANOMALY': 'medium',
  'TIME_ANOMALY': 'medium',
  'FREQUENCY_ANOMALY': 'medium',
  'P2P_ACTIVITY': 'medium',
  'GAMING_TRAFFIC': 'medium',
  'STREAMING_TRAFFIC': 'medium',

  // Low severity (informational or minor issues)
  'DNS_REQUEST': 'low',
  'HTTP_REQUEST': 'low',
  'SSL_CERT_ISSUE': 'low',
  'CONNECTIVITY_ISSUE': 'low',
  'DEVICE_WAKEUP': 'low',
  'DEVICE_SLEEP': 'low',
  'CONFIG_CHANGE': 'low',
  'SOFTWARE_UPDATE': 'low',
  'HEARTBEAT': 'low',
  'STATUS_UPDATE': 'low',
  'MONITORING_ALERT': 'low',
  'BACKUP_EVENT': 'low',
  'MAINTENANCE_EVENT': 'low',
  'DIAGNOSTIC_EVENT': 'low',
};

/**
 * Derives alarm severity from alarm type using predefined mappings
 * @param alarmType - The type field from the alarm
 * @returns The derived severity level (critical, high, medium, low) or 'medium' as default
 */
function deriveAlarmSeverity(alarmType: any): string {
  if (!alarmType || typeof alarmType !== 'string') {
    return 'medium'; // Default severity for unknown types
  }

  // Normalize alarm type to uppercase and remove special characters
  const normalizedType = alarmType.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  
  // Try exact match first
  if (ALARM_TYPE_SEVERITY_MAP[normalizedType]) {
    return ALARM_TYPE_SEVERITY_MAP[normalizedType];
  }

  // Try partial matches for common patterns
  const typeString = normalizedType.toLowerCase();
  
  if (typeString.includes('malware') || typeString.includes('virus') || typeString.includes('trojan')) {
    return 'critical';
  }
  
  if (typeString.includes('intrusion') || typeString.includes('attack') || typeString.includes('exploit')) {
    return 'high';
  }
  
  if (typeString.includes('scan') || typeString.includes('suspicious') || typeString.includes('anomaly')) {
    return 'medium';
  }
  
  if (typeString.includes('dns') || typeString.includes('http') || typeString.includes('status')) {
    return 'low';
  }

  // Default to medium severity for unrecognized types
  return 'medium';
}

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
          ...getLimitValidationConfig('get_active_alarms'),
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
        return this.createErrorResponse(
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

      // Validate cursor format if provided
      if (cursorValidation.sanitizedValue !== undefined) {
        const cursorFormatValidation = ParameterValidator.validateCursor(
          cursorValidation.sanitizedValue,
          'cursor'
        );
        if (!cursorFormatValidation.isValid) {
          return this.createErrorResponse(
            'Invalid cursor format',
            ErrorType.VALIDATION_ERROR,
            {
              provided_value: cursorValidation.sanitizedValue,
              documentation: 'Cursors should be obtained from previous response next_cursor field',
            },
            cursorFormatValidation.errors
          );
        }
      }

      // Skip query sanitization that may be over-sanitizing and breaking queries
      // Just use the query directly - basic validation was already done above

      const response = await withToolTimeout(
        async () =>
          firewalla.getActiveAlarms(
            sanitizedQuery,
            groupByValidation.sanitizedValue as string | undefined,
            (sortByValidation.sanitizedValue as string) || 'timestamp:desc',
            limitValidation.sanitizedValue as number,
            cursorValidation.sanitizedValue as string | undefined
          ),
        'get_active_alarms'
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

      // Validate response structure
      const alarmValidationSchema = createValidationSchema('alarms');
      const alarmValidationResult = validateResponseStructure(
        response,
        alarmValidationSchema
      );

      if (!alarmValidationResult.isValid) {
        // Validation warnings logged for debugging
      }

      // Normalize alarm data for consistency
      const alarmResults = SafeAccess.safeArrayAccess(
        response.results,
        (arr: any[]) => arr,
        []
      ) as any[];
      // First normalize other fields, then handle severity derivation separately
      const normalizedAlarms = batchNormalize(alarmResults, {
        type: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        status: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        message: (v: any) =>
          sanitizeFieldValue(v, 'No message available').value,
        direction: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        protocol: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        device: (v: any) => (v ? normalizeUnknownFields(v) : null),
        remote: (v: any) => (v ? normalizeUnknownFields(v) : null),
      });

      // Handle severity derivation separately since we need access to the full item
      normalizedAlarms.forEach(alarm => {
        const providedSeverity = sanitizeFieldValue(alarm.severity, null).value;
        if (!providedSeverity || providedSeverity === 'unknown' || providedSeverity === null) {
          // Derive severity from alarm type if severity is missing or unknown
          alarm.severity = deriveAlarmSeverity(alarm.type);
        } else {
          alarm.severity = providedSeverity;
        }
      });

      return this.createSuccessResponse({
        count: SafeAccess.getNestedValue(response as any, 'count', 0),
        alarms: SafeAccess.safeArrayMap(normalizedAlarms, (alarm: any) => {
          // Apply timestamp normalization to each alarm
          const timestampNormalized = normalizeTimestamps(alarm);
          const finalAlarm = timestampNormalized.data;

          return {
            aid: SafeAccess.getNestedValue(finalAlarm, 'aid', 0),
            timestamp: unixToISOStringOrNow(finalAlarm.ts),
            type: finalAlarm.type, // Already normalized
            status: finalAlarm.status, // Already normalized
            message: finalAlarm.message, // Already normalized
            direction: finalAlarm.direction, // Already normalized
            protocol: finalAlarm.protocol, // Already normalized
            gid: SafeAccess.getNestedValue(finalAlarm, 'gid', 'unknown'),
            severity: finalAlarm.severity, // Already normalized
            // Include conditional properties if present (now normalized)
            ...(finalAlarm.device && { device: finalAlarm.device }),
            ...(finalAlarm.remote && { remote: finalAlarm.remote }),
            ...(finalAlarm.src && { src: finalAlarm.src }),
            ...(finalAlarm.dst && { dst: finalAlarm.dst }),
            ...(finalAlarm.port && { port: finalAlarm.port }),
            ...(finalAlarm.dport && { dport: finalAlarm.dport }),
          };
        }),
        next_cursor: response.next_cursor,
        total_count: totalCount,
        pages_traversed: pagesTraversed,
        has_more: !!response.next_cursor,
        validation_warnings:
          alarmValidationResult.warnings.length > 0
            ? alarmValidationResult.warnings
            : undefined,
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          'get_active_alarms',
          error.duration,
          10000 // default timeout
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get active alarms: ${errorMessage}`,
        ErrorType.API_ERROR
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
      const alarmIdValidation = ParameterValidator.validateAlarmId(
        args?.alarm_id,
        'alarm_id'
      );

      if (!alarmIdValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          alarmIdValidation.errors
        );
      }

      const alarmId = alarmIdValidation.sanitizedValue as string;

      const response = await withToolTimeout(
        async () => firewalla.getSpecificAlarm(alarmId),
        'get_specific_alarm'
      );

      // Check if alarm exists
      if (!response || !response.results || response.results.length === 0) {
        return this.createErrorResponse(
          `Alarm with ID '${alarmId}' not found. Please verify the alarm ID is correct and the alarm has not been deleted.`,
          ErrorType.API_ERROR,
          {
            alarm_id: alarmId,
            suggestion:
              'Use get_active_alarms to list available alarms and their IDs',
          }
        );
      }

      return this.createSuccessResponse({
        alarm: response,
        retrieved_at: getCurrentTimestamp(),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          'get_specific_alarm',
          error.duration,
          10000
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      // Check for specific API error patterns
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return this.createErrorResponse(
          `Alarm not found: ${args?.alarm_id}. The alarm may have been deleted or the ID may be incorrect.`,
          ErrorType.API_ERROR,
          {
            alarm_id: args?.alarm_id,
            suggestion:
              'Use get_active_alarms to list available alarms and their IDs',
          }
        );
      }

      return this.createErrorResponse(
        `Failed to get specific alarm: ${errorMessage}`,
        ErrorType.API_ERROR
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
    // Pre-flight validation - check parameters first
    const alarmIdValidation = ParameterValidator.validateAlarmId(
      args?.alarm_id,
      'alarm_id'
    );

    if (!alarmIdValidation.isValid) {
      return this.createErrorResponse(
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        alarmIdValidation.errors
      );
    }

    const alarmId = alarmIdValidation.sanitizedValue as string;

    // Use single timeout wrapper for the entire operation
    return withToolTimeout(
      async () => {
        // First verify the alarm exists before attempting deletion
        try {
          const alarmCheck = await firewalla.getSpecificAlarm(alarmId);

          if (
            !alarmCheck ||
            !alarmCheck.results ||
            alarmCheck.results.length === 0
          ) {
            return this.createErrorResponse(
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
            return this.createErrorResponse(
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
      },
      'delete_alarm'
    );
  }
}
