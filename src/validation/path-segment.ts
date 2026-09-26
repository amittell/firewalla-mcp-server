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
export class InvalidPathSegmentError extends Error {
  constructor(
    readonly argument: string,
    readonly problem: string
  ) {
    super(`Invalid ${argument}: ${problem}`);
    this.name = 'InvalidPathSegmentError';
  }
}

/** A C0 or C1 control character, or DEL */
function isControl(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** Characters an ID never holds, each with how a message names it */
const FORBIDDEN: Array<[(value: string) => boolean, string]> = [
  [value => value.includes('/'), '"/"'],
  [value => value.includes('\\'), 'a backslash'],
  [value => value.includes('?'), '"?"'],
  [value => value.includes('#'), '"#"'],
  [value => value.includes('%'), '"%"'],
  // Before whitespace, so a tab or newline is named as a control character
  [value => [...value].some(isControl), 'a control character'],
  [value => /\s/.test(value), 'whitespace'],
];

/**
 * Why `value` cannot be sent as one path segment, or undefined when it can.
 * A non-negative integer (an alarm aid) counts as its decimal string.
 */
export function pathSegmentProblem(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return `must be a string, got ${value === null ? 'null' : typeof value}`;
  }
  if (value === '') {
    return 'cannot be empty';
  }
  if (value === '.' || value === '..') {
    return `cannot be "${value}"`;
  }
  for (const [holds, name] of FORBIDDEN) {
    if (holds(value)) {
      return `cannot contain ${name}; it is sent as one segment of the request path`;
    }
  }
  try {
    encodeURIComponent(value);
  } catch {
    // A lone UTF-16 surrogate has no UTF-8 encoding
    return 'is not valid text';
  }
  return undefined;
}

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
export function pathSegment(
  value: unknown,
  argument: string,
  { encodeColons = false }: { encodeColons?: boolean } = {}
): string {
  const problem = pathSegmentProblem(value);
  if (problem) {
    throw new InvalidPathSegmentError(argument, problem);
  }
  const encoded = encodeURIComponent(String(value));
  return encodeColons ? encoded : encoded.replace(/%3A/g, ':');
}
