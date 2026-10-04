/**
 * IDs that go into a request path: target-list ids (/v2/target-lists/{id}),
 * rule ids (/v2/rules/{id} and /v2/rules/{id}/pause), alarm gids and aids
 * (/v2/alarms/{gid}/{aid}) and box gids and device ids
 * (/v2/boxes/{gid}/devices/{id}). The client builds each path by putting the
 * ID between slashes, and the URL is resolved before it is sent, so an ID
 * holding a slash and a dot segment named a different endpoint than the tool
 * meant. Each such ID is checked here first, and refused unless it is one
 * whole path segment: no `/`, `\` (URL parsers read it as `/`), `?`, `#`,
 * `%` (a percent-encoded `.` is still a dot segment), whitespace or control
 * characters, and not `.` or `..`. A `:` is allowed: rule ids are
 * `<box gid>:<n>`, and device ids are MAC addresses (`AA:BB:CC:DD:EE:FF`) or
 * `ovpn:` / `wg_peer:` prefixed ids.
 */
/** An ID that cannot be sent as one path segment. Nothing was sent. */
export declare class InvalidPathSegmentError extends Error {
    readonly argument: string;
    readonly problem: string;
    constructor(argument: string, problem: string);
}
/**
 * Why `value` cannot be sent as one path segment, or undefined when it can.
 * A non-negative integer (an alarm aid) counts as its decimal string.
 */
export declare function pathSegmentProblem(value: unknown): string | undefined;
/**
 * `value` as one path segment of a request: checked by pathSegmentProblem,
 * then percent-encoded. A `:` is sent as it is unless `encodeColons` is set:
 * rule ids such as `<box gid>:<n>` were sent unencoded when the pause and
 * resume endpoints were measured (2026-09-25).
 *
 * @param argument - The tool argument or setting the value came from, for
 *   the error message
 * @throws {InvalidPathSegmentError} When the value cannot be one segment
 */
export declare function pathSegment(value: unknown, argument: string, { encodeColons }?: {
    encodeColons?: boolean;
}): string;
//# sourceMappingURL=path-segment.d.ts.map