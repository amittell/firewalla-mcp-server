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

// C0 control characters other than tab, line feed and carriage return, and
// DEL: the grammar has no use for them, the API gets the value decoded,
// where a NUL can end a string, and the query is quoted back in results
// and errors
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

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
