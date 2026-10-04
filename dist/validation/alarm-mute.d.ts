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
export declare const MUTE_TARGET_TYPES: readonly ["alarmType", "domain", "ip"];
export declare const MUTE_SCOPE_TYPES: readonly ["device", "group", "user", "network", "all"];
export type MuteTargetType = (typeof MUTE_TARGET_TYPES)[number];
export type MuteScopeType = (typeof MUTE_SCOPE_TYPES)[number];
export interface AlarmMuteRequest {
    target: {
        type: MuteTargetType;
        value?: string;
    };
    scope: {
        type: MuteScopeType;
        value?: string;
    };
}
export type MuteRequestCheck = {
    ok: true;
    request: AlarmMuteRequest;
} | {
    ok: false;
    problems: string[];
};
/**
 * Check a mute request body against the documented model. On success the
 * request holds only the documented fields, with values trimmed; on failure
 * every problem found is listed, and nothing should be sent.
 */
export declare function checkMuteRequest(body: unknown): MuteRequestCheck;
//# sourceMappingURL=alarm-mute.d.ts.map