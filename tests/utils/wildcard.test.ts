/**
 * matchesWildcard replaces the regular expressions the client-side searches
 * built from `*` wildcards, which backtrack: 9 wildcards against a
 * 40-character value took about 2 s and 11 about 18 s on the server's one
 * thread. It must give the answers those gave, in linear-bounded time.
 */

import { matchesWildcard } from '../../src/utils/wildcard.js';

/** The regular expression the rule, device and target list matchers built */
function oldMatch(text: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(text);
}

/** The one the search filters built: ? is any character, and the i flag */
function oldFilterMatch(text: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

describe('matchesWildcard', () => {
  it.each([
    ['nas', 'nas', true],
    ['nas', 'na', false],
    ['nas-box', 'nas*', true],
    ['my nas', '*nas', true],
    ['my nas box', '*nas*', true],
    ['', '*', true],
    ['', '', true],
    ['a', '', false],
    ['192.168.1.20', '192.168.*', true],
    ['192.168.1.20', '192.168.*.20', true],
    ['192x168.1.20', '192.168.*', false],
    ['disney+ box', '*disney+*', true],
    ['c++', 'c+*', true],
    ['at&t', '*&*', true],
    ['[kids] tablet', '[kids]*', true],
    ['kids tablet', '[kids]*', false],
    ['a?c', 'a?c', true],
    ['abc', 'a?c', false],
    ['a*c', 'a*c', true],
    ['abbbc', 'a*b*c', true],
    ['acb', 'a*b*c', false],
    ['ab', 'a**b', true],
    ['wohnzimmer-fernseher', '*zimmer*', true],
    ['café', 'caf*', true],
  ])('%j against %j is %s', (text, pattern, expected) => {
    expect(matchesWildcard(text, pattern)).toBe(expected);
    expect(oldMatch(text, pattern)).toBe(expected);
  });

  it('reads ? as any character only when asked', () => {
    expect(matchesWildcard('abc', 'a?c')).toBe(false);
    expect(matchesWildcard('abc', 'a?c', { anyChar: true })).toBe(true);
    expect(matchesWildcard('ac', 'a?c', { anyChar: true })).toBe(false);
  });

  it('folds case as the i flag does', () => {
    const options = { ignoreCase: true };
    expect(matchesWildcard('NAS-Box', 'nas*', options)).toBe(true);
    expect(matchesWildcard('Café', 'CAFÉ', options)).toBe(true);
    // The i flag keeps a non-ASCII character that would fold to ASCII
    expect(matchesWildcard('s', 'ſ', options)).toBe(/^ſ$/i.test('s'));
    expect(matchesWildcard('ß', 'SS', options)).toBe(/^SS$/i.test('ß'));
  });

  it('lets * match a line break, which . did not', () => {
    expect(matchesWildcard('first\nsecond', 'first*')).toBe(true);
    expect(oldMatch('first\nsecond', 'first*')).toBe(false);
  });

  it('finishes 10 wildcards against 1,000 characters in under 50 ms', () => {
    const pattern = `${'*a'.repeat(9)}*b`;
    expect(pattern.split('*')).toHaveLength(11);
    const text = 'a'.repeat(1000);
    const started = performance.now();
    expect(matchesWildcard(text, pattern)).toBe(false);
    expect(matchesWildcard(`${text}b`, pattern)).toBe(true);
    expect(
      matchesWildcard(text.toUpperCase(), pattern, { ignoreCase: true })
    ).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  describe('fuzz: the same answers as the regular expressions', () => {
    // mulberry32, so every run tries the same inputs
    function random(seed: number): () => number {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // Regex syntax, case pairs, non-ASCII letters and folds, a space; no
    // line breaks, where * and . differ (tested above)
    const ALPHABET = [
      'a',
      'b',
      'A',
      'B',
      '.',
      '+',
      '?',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '\\',
      '^',
      '$',
      '|',
      '&',
      ' ',
      'é',
      'É',
      'ß',
      'ſ',
      's',
      'S',
      'İ',
      'i',
      '😀',
    ];

    const next = random(0x91ab);
    const pick = () => ALPHABET[Math.floor(next() * ALPHABET.length)];
    const word = (max: number) =>
      Array.from({ length: Math.floor(next() * (max + 1)) }, pick).join('');
    const cases: Array<[string, string]> = [];
    for (let i = 0; i < 3000; i++) {
      // At most four wildcards and 12 characters: the regular expressions
      // answer those at once
      const parts = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
        word(3)
      );
      const pattern = parts.join('*');
      const text =
        next() < 0.5 ? word(12) : parts.map(part => part + word(2)).join('');
      cases.push([text, pattern]);
    }

    it('3,000 cases, some of which match', () => {
      const matched = cases.filter(([text, pattern]) =>
        oldMatch(text, pattern)
      ).length;
      expect(matched).toBeGreaterThan(300);
      expect(matched).toBeLessThan(2700);
    });

    it('exact, as the rule, device and target list matchers compared', () => {
      for (const [text, pattern] of cases) {
        expect([text, pattern, matchesWildcard(text, pattern)]).toEqual([
          text,
          pattern,
          oldMatch(text, pattern),
        ]);
      }
    });

    it('with ? and the i flag, as the search filters compared', () => {
      for (const [text, pattern] of cases) {
        expect([
          text,
          pattern,
          matchesWildcard(text, pattern, { ignoreCase: true, anyChar: true }),
        ]).toEqual([text, pattern, oldFilterMatch(text, pattern)]);
      }
    });
  });
});
