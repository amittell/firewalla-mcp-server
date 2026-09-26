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

// One value of a comma list: quoted values keep their commas
const LIST_VALUE = /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,"'])+/g;

/**
 * The values of a comma list, unquoted, as the MSP API grammar reads
 * `field:a,b` (either value): `social,games` -> [social, games] and
 * `"Block, Social",games` -> [Block, Social, games]
 */
export function commaListValues(value: string): string[] {
  const values = (value.match(LIST_VALUE) || []).map(unquoteQueryValue);
  return values.length > 0 ? values : [unquoteQueryValue(value)];
}

/** An IPv4 address as a 32-bit number, or undefined when it is not one */
function ipv4ToNumber(ip: string): number | undefined {
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!octets) {
    return undefined;
  }
  const parts = octets.slice(1).map(Number);
  if (parts.some(part => part > 255)) {
    return undefined;
  }
  return parts.reduce((sum, part) => sum * 256 + part, 0);
}

/**
 * Whether an IPv4 address is in an IPv4 CIDR block: 192.168.1.20 is in
 * 192.168.1.0/24 (host bits in the block are ignored, and /0 is every
 * address)
 *
 * @param ip - The address to test; one that is not IPv4 is in no block
 * @param cidr - The block, `a.b.c.d/n` with n from 0 to 32
 * @returns Whether ip is in the block, or undefined when cidr is not an
 *   IPv4 CIDR block
 */
export function ipv4InCidr(ip: string, cidr: string): boolean | undefined {
  const block = /^([\d.]+)\/(\d{1,2})$/.exec(cidr.trim());
  const network = block ? ipv4ToNumber(block[1]) : undefined;
  const prefix = block ? Number(block[2]) : NaN;
  if (network === undefined || !(prefix >= 0 && prefix <= 32)) {
    return undefined;
  }
  const address = ipv4ToNumber(ip.trim());
  if (address === undefined) {
    return false;
  }
  // Numbers rather than 32-bit shifts, which read /0 as /32
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) === Math.floor(network / size);
}
