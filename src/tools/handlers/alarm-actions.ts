/**
 * Alarm write tools: archive_alarm and mute_alarm (MSP 2.11.0 or later) and
 * delete_alarm. They change alarms on the box, so they are registered only
 * with FIREWALLA_ENABLE_WRITE_TOOLS=true.
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import {
  AlarmNotFoundError,
  BoxSelectionError,
  type FirewallaClient,
} from '../../firewalla/client.js';
import {
  createErrorResponse,
  ErrorType,
  ParameterValidator,
} from '../../validation/error-handler.js';
import {
  checkMuteRequest,
  MUTE_SCOPE_TYPES,
  MUTE_TARGET_TYPES,
  type AlarmMuteRequest,
} from '../../validation/alarm-mute.js';

type AlarmWriteArgs =
  { alarmId: string; gid?: string; errors?: undefined } | { errors: string[] };

/**
 * alarm_id and gid for an alarm write. The aid must be the numeric one that
 * get_active_alarms and search_alarms return, as a number or a string. Both
 * go into the request path, so gid is checked as a path segment first.
 */
function readAlarmWriteArgs(args: ToolArgs): AlarmWriteArgs {
  const alarmIdValidation = ParameterValidator.validateAlarmId(
    args?.alarm_id,
    'alarm_id'
  );
  const gidValidation = ParameterValidator.validatePathSegment(
    args?.gid,
    'gid',
    { required: false }
  );
  const errors = [...alarmIdValidation.errors, ...gidValidation.errors];
  const alarmId = alarmIdValidation.sanitizedValue as string | undefined;
  if (alarmIdValidation.isValid && !/^\d+$/.test(alarmId ?? '')) {
    errors.push(
      `alarm_id must be the numeric aid from get_active_alarms or search_alarms, got '${alarmId}'`
    );
  }
  const gid = gidValidation.sanitizedValue as string | undefined;
  if (
    gidValidation.isValid &&
    gid !== undefined &&
    !/^[a-zA-Z0-9_-]+$/.test(gid)
  ) {
    errors.push(
      `gid must be a box gid such as the alarm's gid field, got '${gid}'`
    );
  }
  if (errors.length > 0 || !alarmId) {
    return { errors };
  }
  return { alarmId, gid };
}

/** The fields of an alarm that say which one was acted on */
function summarizeAlarm(alarm: Record<string, any>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    aid: alarm.aid,
    gid: alarm.gid,
    type: alarm.type,
    status_before: alarm.status,
    message: alarm.message,
    ts: alarm.ts,
  };
  if (alarm.device && typeof alarm.device === 'object') {
    summary.device = {
      id: alarm.device.id,
      name: alarm.device.name,
      ip: alarm.device.ip,
    };
  }
  if (alarm.remote && typeof alarm.remote === 'object') {
    summary.remote = { domain: alarm.remote.domain, ip: alarm.remote.ip };
  }
  return summary;
}

/** What a mute silences, in words */
function describeMute(
  request: AlarmMuteRequest,
  alarm: Record<string, any>
): string {
  const what =
    request.target.type === 'alarmType'
      ? `every future type ${alarm.type ?? 'unknown'} alarm, whatever the destination`
      : request.target.type === 'domain'
        ? `future alarms for ${request.target.value} and its subdomains`
        : `future alarms for IP ${request.target.value}`;
  const where =
    request.scope.type === 'all'
      ? 'on every device on the box'
      : `for ${request.scope.type} ${request.scope.value}`;
  return `${what}, ${where}`;
}

function alarmWriteErrorResponse(
  tool: string,
  verb: 'archive' | 'mute' | 'delete',
  error: unknown,
  args: ToolArgs
): ToolResponse {
  const message =
    error instanceof Error ? error.message : 'Unknown error occurred';
  if (error instanceof BoxSelectionError) {
    return createErrorResponse(
      tool,
      `No single box to ${verb} the alarm on`,
      ErrorType.VALIDATION_ERROR,
      { alarm_id: args?.alarm_id },
      [message]
    );
  }
  if (error instanceof AlarmNotFoundError) {
    return createErrorResponse(tool, message, ErrorType.API_ERROR, {
      alarm_id: args?.alarm_id,
      gid: args?.gid,
      suggestion:
        'Use get_active_alarms or search_alarms for the alarm aid and its gid',
    });
  }
  return createErrorResponse(
    tool,
    `Failed to ${verb} alarm: ${message}`,
    ErrorType.API_ERROR,
    { alarm_id: args?.alarm_id, gid: args?.gid }
  );
}

/**
 * Handler for archiving an alarm (MSP 2.11.0+)
 */
export class ArchiveAlarmHandler extends BaseToolHandler {
  name = 'archive_alarm';
  description =
    "Archive an alarm (MSP 2.11.0 or later): it leaves the active alarms. It creates no silence exception, so future matching traffic can still raise new alarms (mute_alarm silences them). Alarm IDs are per box: pass gid (the alarm's gid field); without gid or FIREWALLA_BOX_ID each box is checked, and the tool refuses when several boxes have that aid and none is FIREWALLA_DEFAULT_BOX_ID.";
  category = 'security' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'alarm_operations',
        entity_type: 'alarm_archive',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const parsed = readAlarmWriteArgs(args);
    if (parsed.errors) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        parsed.errors
      );
    }

    try {
      // Not wrapped in withToolTimeout, which rewraps errors (hiding
      // BoxSelectionError and AlarmNotFoundError) and would report a write
      // it cut off as failed although it may have been applied. Each request
      // has the client's apiTimeout.
      const result = await firewalla.archiveAlarm(parsed.alarmId, parsed.gid);
      return this.createUnifiedResponse({
        archived: true,
        alarm_id: result.aid,
        gid: result.gid,
        alarm: summarizeAlarm(result.alarm),
        api_response: result.response ?? null,
        note: 'Archiving creates no silence exception: future matching traffic can still raise new alarms. mute_alarm silences them.',
      });
    } catch (error: unknown) {
      return alarmWriteErrorResponse(this.name, 'archive', error, args);
    }
  }
}

/**
 * Handler for muting an alarm (MSP 2.11.0+): archive it and create a lasting
 * silence exception on the box
 */
export class MuteAlarmHandler extends BaseToolHandler {
  name = 'mute_alarm';
  description =
    "Mute an alarm (MSP 2.11.0 or later): the API archives it and has the box create a lasting silence exception, so future alarms matching the target within the scope are no longer raised. target_type alarmType silences every future alarm of this alarm's type (for example all Security Activity alarms), domain a domain and its subdomains, ip one IP address. scope_type all covers every device on the box; device, group, user or network limit it to the one named by scope_value. This server has no tool to remove the exception. Box selection is the same as archive_alarm.";
  category = 'security' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'alarm_operations',
        entity_type: 'alarm_mute',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const parsed = readAlarmWriteArgs(args);
    const targetTypeValidation = ParameterValidator.validateEnum(
      args?.target_type,
      'target_type',
      [...MUTE_TARGET_TYPES],
      true
    );
    const targetValueValidation = ParameterValidator.validateOptionalString(
      args?.target_value,
      'target_value'
    );
    const scopeTypeValidation = ParameterValidator.validateEnum(
      args?.scope_type,
      'scope_type',
      [...MUTE_SCOPE_TYPES],
      true
    );
    const scopeValueValidation = ParameterValidator.validateOptionalString(
      args?.scope_value,
      'scope_value'
    );
    const errors = [
      ...(parsed.errors ?? []),
      ...targetTypeValidation.errors,
      ...targetValueValidation.errors,
      ...scopeTypeValidation.errors,
      ...scopeValueValidation.errors,
    ];
    if (parsed.errors || errors.length > 0) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        errors
      );
    }

    const body = {
      target: {
        type: targetTypeValidation.sanitizedValue,
        value: targetValueValidation.sanitizedValue,
      },
      scope: {
        type: scopeTypeValidation.sanitizedValue,
        value: scopeValueValidation.sanitizedValue,
      },
    };
    const checked = checkMuteRequest(body);
    if (!checked.ok) {
      return createErrorResponse(
        this.name,
        'Invalid mute request: nothing was sent',
        ErrorType.VALIDATION_ERROR,
        { target: body.target, scope: body.scope },
        checked.problems
      );
    }

    try {
      // Not wrapped in withToolTimeout; see ArchiveAlarmHandler
      const result = await firewalla.muteAlarm(
        parsed.alarmId,
        checked.request,
        parsed.gid
      );
      return this.createUnifiedResponse({
        muted: true,
        alarm_id: result.aid,
        gid: result.gid,
        alarm: summarizeAlarm(result.alarm),
        target: result.request.target,
        scope: result.request.scope,
        silences: describeMute(result.request, result.alarm),
        api_response: result.response ?? null,
        note: 'The silence exception lasts until it is removed, and this server has no tool to list or remove it.',
      });
    } catch (error: unknown) {
      return alarmWriteErrorResponse(this.name, 'mute', error, args);
    }
  }
}

/**
 * Handler for deleting an alarm permanently. Measured 2026-09-26: the DELETE
 * removed an archived alarm (a GET of it then answered 404, and the account's
 * archived alarms counted one fewer); in July 2025 the same request answered
 * success without deleting.
 */
export class DeleteAlarmHandler extends BaseToolHandler {
  name = 'delete_alarm';
  description =
    "Delete an alarm permanently (DELETE /v2/alarms/{gid}/{aid}); it cannot be undone. archive_alarm is the reversible option: it keeps the alarm, among the archived alarms (status:2). The alarm is read first, and an alarm that is not there sends no DELETE. Alarm IDs are per box: pass gid (the alarm's gid field); box selection is the same as archive_alarm.";
  category = 'security' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'alarm_operations',
        entity_type: 'alarm_deletion',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    const parsed = readAlarmWriteArgs(args);
    if (parsed.errors) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        parsed.errors
      );
    }

    try {
      // Not wrapped in withToolTimeout; see ArchiveAlarmHandler
      const result = await firewalla.deleteAlarm(parsed.alarmId, parsed.gid);
      return this.createUnifiedResponse({
        deleted: true,
        alarm_id: result.aid,
        gid: result.gid,
        alarm: summarizeAlarm(result.alarm),
        api_response: result.response ?? null,
      });
    } catch (error: unknown) {
      return alarmWriteErrorResponse(this.name, 'delete', error, args);
    }
  }
}
