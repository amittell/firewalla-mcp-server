/**
 * @fileoverview The structural checks every search query gets before it is
 * translated or sent: balanced parentheses and brackets, closed quotes, a
 * nesting limit, a length limit, and no control characters.
 *
 * Parentheses and brackets are counted outside quoted values only, as the
 * search parser and toMspQuery read them: name:"a(b" is one value. A quote
 * is read as the parser reads it: a backslash escapes the next character
 * inside quotes, and a ' right after a letter, digit, combining mark or
 * underscore is an apostrophe (Alex's), not the start of a quote.
 */

import { followsWordCharacter } from './word-characters.js';

/** The longest query taken, in UTF-16 code units, trimmed */
export const MAX_QUERY_LENGTH = 2000;

/**
 * The deepest nesting of parentheses taken. The search tools' complexity
 * check refused more than 5 already; get_flow_data and get_active_alarms,
 * which ran no check, sent 11. A [low TO high] range does not nest and is
 * not counted.
 */
export const MAX_QUERY_NESTING = 5;

/**
 * Calls `visit` with each character of `query` outside quoted values, and
 * its index, and returns the quote left open at the end, if any, with the
 * index where it opened
 */
export function scanOutsideQuotes(
  query: string,
  visit: (character: string, index: number) => void
): { quote: '"' | "'"; index: number } | undefined {
  let open: { quote: '"' | "'"; index: number } | undefined;
  for (let i = 0; i < query.length; i++) {
    const character = query[i];
    if (open) {
      if (character === '\\') {
        i++;
      } else if (character === open.quote) {
        open = undefined;
      }
    } else if (
      character === '"' ||
      (character === "'" && !followsWordCharacter(query, i))
    ) {
      open = { quote: character, index: i };
    } else {
      visit(character, i);
    }
  }
  return open;
}

// The control characters (Unicode Cc: C0, DEL and C1) other than tab, line
// feed and carriage return: the grammar has no use for them, the API gets
// the value decoded, where a NUL can end a string, and the query is quoted
// back in results and errors. The wildcard check reads every Cc as
// non-text too.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;

/**
 * What is structurally wrong with a query, one message each; empty when
 * nothing is. The search tools refuse a query with any of these before
 * they translate or send it.
 *
 * @param query - The query as given
 */
export function queryStructureErrors(query: string): string[] {
  const errors: string[] = [];
  const trimmed = query.trim();

  if (trimmed.length > MAX_QUERY_LENGTH) {
    errors.push(
      `Query is too long (${trimmed.length} characters; maximum ${MAX_QUERY_LENGTH})`
    );
  }

  const control = CONTROL_CHARACTER.exec(query);
  if (control) {
    const code = control[0]
      .charCodeAt(0)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
    errors.push(
      `Query contains a control character (U+${code}) at position ${control.index}`
    );
  }

  // Each closer must close the latest opener of its kind, outside quotes
  const openers: Array<{ character: string; index: number }> = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[' };
  const names: Record<string, string> = {
    '(': 'parenthesis',
    ')': 'parenthesis',
    '[': 'bracket',
    ']': 'bracket',
  };
  let deepest = 0;
  const unclosedQuote = scanOutsideQuotes(query, (character, index) => {
    if (character === '(' || character === '[') {
      openers.push({ character, index });
      deepest = Math.max(
        deepest,
        openers.filter(opener => opener.character === '(').length
      );
    } else if (character === ')' || character === ']') {
      const latest = openers[openers.length - 1];
      if (latest?.character === pairs[character]) {
        openers.pop();
      } else {
        errors.push(
          `Query has a closing ${names[character]} '${character}' at position ${index} with no '${pairs[character]}' open before it`
        );
      }
    }
  });
  for (const opener of openers) {
    errors.push(
      `Query opens a ${names[opener.character]} '${opener.character}' at position ${opener.index} that is never closed`
    );
  }
  if (unclosedQuote) {
    errors.push(
      `Query opens a ${unclosedQuote.quote} quote at position ${unclosedQuote.index} that is never closed`
    );
  }
  if (deepest > MAX_QUERY_NESTING) {
    errors.push(
      `Query nesting is too deep (${deepest} levels; maximum ${MAX_QUERY_NESTING})`
    );
  }

  return errors;
}

/** The most AND and OR operators a query may hold */
export const MAX_QUERY_OPERATORS = 20;

/** The most field:value terms a query may hold */
export const MAX_QUERY_FIELD_TERMS = 15;

/** The most [low TO high] ranges a query may hold */
export const MAX_QUERY_RANGES = 5;

/**
 * Which complexity limit a query goes over, one message each naming the
 * limit, the count and the maximum; empty when it goes over none. Every
 * search tool refuses such a query before it translates or sends it.
 * Operators, terms and ranges are counted outside quoted values: "a AND b"
 * is a phrase. There is no wildcard limit: wildcards are matched in fewer
 * than (n + 1)(m + 1) steps (matchesWildcard), and the 2,000-character
 * limit bounds m.
 *
 * @param query - The query as given
 */
export function queryComplexityErrors(query: string): string[] {
  const errors: string[] = [];
  // Each quoted value becomes Q with a space after it: name:"a b" is one
  // term, name:Q, and "a"OR "b" holds an OR, as the parser reads it
  let outside = '';
  let last = -1;
  scanOutsideQuotes(query, (character, index) => {
    if (index !== last + 1) {
      outside += 'Q ';
    }
    outside += character;
    last = index;
  });
  if (last !== query.length - 1) {
    outside += 'Q ';
  }
  const words = outside.split(/[\s()]+/).filter(Boolean);

  const operators = words.filter(
    word => word === 'AND' || word === 'OR'
  ).length;
  if (operators > MAX_QUERY_OPERATORS) {
    errors.push(
      `Too many logical operators: ${operators} (at most ${MAX_QUERY_OPERATORS})`
    );
  }

  // A term is a field with any operator the syntax check takes after it:
  // blocked=true and total>1MB count as blocked:true and total:>1MB do
  const terms = words.filter(word =>
    /^-?[\w.]+(?::|!=|>=|<=|=|>|<)/.test(word)
  ).length;
  if (terms > MAX_QUERY_FIELD_TERMS) {
    errors.push(
      `Too many field terms: ${terms} (at most ${MAX_QUERY_FIELD_TERMS})`
    );
  }

  const ranges = (outside.match(/\[[^\]]*\bTO\b[^\]]*\]/gi) ?? []).length;
  if (ranges > MAX_QUERY_RANGES) {
    errors.push(`Too many ranges: ${ranges} (at most ${MAX_QUERY_RANGES})`);
  }

  return errors;
}
