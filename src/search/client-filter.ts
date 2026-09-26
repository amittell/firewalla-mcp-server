/**
 * Client-side evaluation of search queries, for endpoints the MSP API does
 * not search (such as /v2/devices).
 *
 * `matchesQuery` evaluates AND, OR, NOT and parentheses; the caller decides
 * what each `field:value` term matches. NOT binds tightest, then AND, then OR,
 * and terms with no operator between them are ANDed, as in the MSP syntax.
 * The MSP API's exclusion prefix works too: `-field:value` and `-(...)` are
 * NOT.
 */

// A term runs to the next space or parenthesis outside quotes, so colons in a
// value (mac:AA:BB:CC:DD:EE:FF) and spaces in a quoted value stay in the term
const TOKEN_PATTERN =
  /[()]|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s()"'])+/g;

/**
 * Evaluates a search query against one item
 *
 * @param query - Query such as `name:nas OR (ip:10.0.0.* AND online:true)`
 * @param matchesTerm - Whether the item matches one term, such as `name:nas`
 * @returns True when the item satisfies the whole query
 */
export function matchesQuery(
  query: string,
  matchesTerm: (term: string) => boolean
): boolean {
  const tokens = query.match(TOKEN_PATTERN) || [];
  let position = 0;

  const peek = (): string | undefined => tokens[position]?.toUpperCase();

  // Both sides of AND/OR are always evaluated so the whole query is consumed
  const parseOr = (): boolean => {
    let result = parseAnd();
    while (peek() === 'OR') {
      position++;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };

  const parseAnd = (): boolean => {
    let result = parseNot();
    while (position < tokens.length && peek() !== 'OR' && peek() !== ')') {
      if (peek() === 'AND') {
        position++;
      }
      const right = parseNot();
      result = result && right;
    }
    return result;
  };

  const parseNot = (): boolean => {
    if (
      peek() === 'NOT' ||
      (tokens[position] === '-' && tokens[position + 1] === '(')
    ) {
      position++;
      return !parseNot();
    }
    return parsePrimary();
  };

  const parsePrimary = (): boolean => {
    const token = tokens[position++];
    if (token === undefined) {
      return true; // A trailing operator has nothing left to constrain
    }
    if (token === '(') {
      const result = parseOr();
      if (peek() === ')') {
        position++;
      }
      return result;
    }
    if (/^-[\w.]+:/.test(token)) {
      return !matchesTerm(token.slice(1));
    }
    return matchesTerm(token);
  };

  return tokens.length === 0 || parseOr();
}

/**
 * Removes the quotes around a quoted query value: `"Home Office"` -> `Home Office`
 */
export function unquoteQueryValue(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2].replace(/\\(.)/g, '$1') : value;
}
