/**
 * The request body of POST /v2/alarms/{gid}/{aid}/mute (MSP 2.11.0 or later),
 * checked against the Mute Target and Mute Scope models in the official docs
 * (https://docs.firewalla.net/data-models/alarm/) before anything is sent.
 *
 * - target.type `alarmType` silences every future alarm of the alarm's own
 *   type and takes no value; `domain` takes a domain name, and the API applies
 *   wildcard matching itself (example.com also matches sub.example.com); `ip`
 *   takes one IP address.
 * - scope.type `all` covers every device on the box and takes no value;
 *   `device`, `group`, `user` and `network` take that device, group, user or
 *   network ID.
 */

import { isIP } from 'node:net';

export const MUTE_TARGET_TYPES = ['alarmType', 'domain', 'ip'] as const;
export const MUTE_SCOPE_TYPES = [
  'device',
  'group',
  'user',
  'network',
  'all',
] as const;

export type MuteTargetType = (typeof MUTE_TARGET_TYPES)[number];
export type MuteScopeType = (typeof MUTE_SCOPE_TYPES)[number];

export interface AlarmMuteRequest {
  target: { type: MuteTargetType; value?: string };
  scope: { type: MuteScopeType; value?: string };
}

export type MuteRequestCheck =
  | { ok: true; request: AlarmMuteRequest }
  | { ok: false; problems: string[] };

/** One DNS label: letters, digits, hyphens and underscores, 1 to 63 long */
const DOMAIN_PATTERN = /^[A-Za-z0-9_-]{1,63}(\.[A-Za-z0-9_-]{1,63})*\.?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A value field: undefined when absent or blank, the trimmed string when
 * given, or a problem when it is not a string
 */
function readValue(
  part: Record<string, unknown>,
  path: string,
  problems: string[]
): string | undefined {
  const { value } = part;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    problems.push(`${path} must be a string, got ${typeof value}`);
    return undefined;
  }
  return value.trim() || undefined;
}

function checkTargetValue(
  type: MuteTargetType,
  value: string | undefined,
  problems: string[]
): void {
  if (type === 'alarmType') {
    if (value !== undefined) {
      problems.push(
        `target.value is not used when target.type is alarmType: the mute silences the alarm's own type (got '${value}')`
      );
    }
    return;
  }
  if (value === undefined) {
    problems.push(
      type === 'domain'
        ? 'target.value is required when target.type is domain: a domain name such as example.com'
        : 'target.value is required when target.type is ip: an IP address such as 1.2.3.4'
    );
    return;
  }
  if (type === 'domain') {
    if (value.includes('*')) {
      problems.push(
        `target.value must be a plain domain name, got '${value}': the API applies wildcard matching itself, so example.com also matches sub.example.com`
      );
    } else if (isIP(value) !== 0) {
      problems.push(
        `target.value '${value}' is an IP address: use target.type ip for it`
      );
    } else if (value.length > 253 || !DOMAIN_PATTERN.test(value)) {
      problems.push(
        `target.value must be a domain name such as example.com, got '${value}'`
      );
    }
    return;
  }
  if (isIP(value) === 0) {
    problems.push(
      `target.value must be one IP address such as 1.2.3.4 when target.type is ip, got '${value}'`
    );
  }
}

function checkScopeValue(
  type: MuteScopeType,
  value: string | undefined,
  problems: string[]
): void {
  if (type === 'all') {
    if (value !== undefined) {
      problems.push(
        `scope.value is not used when scope.type is all (got '${value}'): pick device, group, user or network to limit the mute`
      );
    }
    return;
  }
  if (value === undefined) {
    problems.push(
      `scope.value is required when scope.type is ${type}: the ${type} ID${type === 'device' ? ' (its MAC address)' : ''}`
    );
  }
}

/**
 * Check a mute request body against the documented model. On success the
 * request holds only the documented fields, with values trimmed; on failure
 * every problem found is listed, and nothing should be sent.
 */
export function checkMuteRequest(body: unknown): MuteRequestCheck {
  const problems: string[] = [];
  if (!isRecord(body)) {
    return { ok: false, problems: ['the mute request must be an object'] };
  }

  let target: AlarmMuteRequest['target'] | undefined;
  if (!isRecord(body.target)) {
    problems.push('target is required: { type, value? }');
  } else if (
    !MUTE_TARGET_TYPES.includes(body.target.type as MuteTargetType)
  ) {
    problems.push(
      `target.type must be one of ${MUTE_TARGET_TYPES.join(', ')}, got ${JSON.stringify(body.target.type)}`
    );
  } else {
    const type = body.target.type as MuteTargetType;
    const value = readValue(body.target, 'target.value', problems);
    checkTargetValue(type, value, problems);
    target = value === undefined ? { type } : { type, value };
  }

  let scope: AlarmMuteRequest['scope'] | undefined;
  if (!isRecord(body.scope)) {
    problems.push('scope is required: { type, value? }');
  } else if (!MUTE_SCOPE_TYPES.includes(body.scope.type as MuteScopeType)) {
    problems.push(
      `scope.type must be one of ${MUTE_SCOPE_TYPES.join(', ')}, got ${JSON.stringify(body.scope.type)}`
    );
  } else {
    const type = body.scope.type as MuteScopeType;
    const value = readValue(body.scope, 'scope.value', problems);
    checkScopeValue(type, value, problems);
    scope = value === undefined ? { type } : { type, value };
  }

  if (problems.length > 0 || !target || !scope) {
    return { ok: false, problems };
  }
  return { ok: true, request: { target, scope } };
}
