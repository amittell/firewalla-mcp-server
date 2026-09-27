/**
 * @fileoverview Wildcard matching for the searches the client runs itself
 *
 * The search tools matched a `*` wildcard by building a regular expression
 * (`name:a*b*c` as /^a.*b.*c$/). Those backtrack: measured 2026-09-27 on
 * Node 24, /^.*a.*a.*a.*a.*a.*a.*a.*a.*b$/ (9 wildcards) took 1,969 ms
 * against 40 a's and 11 wildcards took 17,799 ms, and the server has one
 * thread, so one such search stalled every client. matchesWildcard gives
 * the same answers without a regular expression, in time proportional to
 * the text times the pattern at worst.
 */

export interface WildcardOptions {
  /**
   * Compare as a regular expression with the i flag does: each character
   * folded with toUpperCase, except where that gives more than one
   * character or turns a non-ASCII character into an ASCII one
   */
  ignoreCase?: boolean;
  /** Read `?` as any one character, as well as `*` as any run */
  anyChar?: boolean;
}

/**
 * A character as a regular expression with the i flag (and no u flag)
 * compares it: the Canonicalize operation of ECMA-262
 */
function canonicalize(character: string): string {
  const upper = character.toUpperCase();
  if (upper.length !== 1) {
    return character;
  }
  if (character.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128) {
    return character;
  }
  return upper;
}

function fold(text: string): string {
  let folded = '';
  for (let i = 0; i < text.length; i++) {
    folded += canonicalize(text[i]);
  }
  return folded;
}

/**
 * Whether all of `text` matches `pattern`, where `*` matches any run of
 * characters, none included, and every other character matches itself
 * (`?` too, unless `anyChar`). Characters are UTF-16 code units, as in a
 * regular expression without the u flag.
 *
 * The two-pointer match with one backtrack point: on a mismatch it goes
 * back to the latest `*` and lets it take one more character. An earlier
 * `*` never needs to take more, since the latest one can take anything it
 * could, so the work is at most the text's length times the pattern's.
 * Unlike /^a.*b$/, a `*` also matches line breaks: `.` did not.
 *
 * @param text - The value to test
 * @param pattern - The wildcard pattern
 * @param options - Case folding, and `?` as a wildcard
 */
export function matchesWildcard(
  text: string,
  pattern: string,
  options: WildcardOptions = {}
): boolean {
  const t = options.ignoreCase ? fold(text) : text;
  const p = options.ignoreCase ? fold(pattern) : pattern;
  let ti = 0;
  let pi = 0;
  // The latest `*` in the pattern, and where in the text it now ends
  let star = -1;
  let starEnd = 0;
  while (ti < t.length) {
    if (
      pi < p.length &&
      p[pi] !== '*' &&
      (p[pi] === t[ti] || (options.anyChar === true && p[pi] === '?'))
    ) {
      ti++;
      pi++;
    } else if (pi < p.length && p[pi] === '*') {
      star = pi;
      pi++;
      starEnd = ti;
    } else if (star >= 0) {
      starEnd++;
      ti = starEnd;
      pi = star + 1;
    } else {
      return false;
    }
  }
  while (pi < p.length && p[pi] === '*') {
    pi++;
  }
  return pi === p.length;
}
