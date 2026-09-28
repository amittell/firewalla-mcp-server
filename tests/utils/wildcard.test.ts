/**
 * matchesWildcard replaces the regular expressions the client-side searches
 * built from `*` wildcards, which backtrack: 9 wildcards against a
 * 40-character value took about 2 s and 11 about 18 s on the server's one
 * thread. It must give the answers those gave, in linear-bounded time.
 * The time is checked as steps (options.steps), not on the clock, so a
 * loaded machine cannot fail it: fewer than (n + 1)(m + 1) for a text of n
 * and a pattern of m characters.
 */

import {
  matchesWildcard,
  type WildcardOptions,
} from '../../src/utils/wildcard.js';

/** The answer, and the steps it took with their bound, (n + 1)(m + 1) */
function counted(text: string, pattern: string, options: WildcardOptions = {}) {
  const steps = { count: 0 };
  const matched = matchesWildcard(text, pattern, { ...options, steps });
  return {
    matched,
    steps: steps.count,
    bound: (text.length + 1) * (pattern.length + 1),
  };
}

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

  it('takes 10 wildcards against 1,000 to 4,000 characters in linear steps', () => {
    // The regular expression's worst case: 9 of these took it 2 s at 40
    const pattern = `${'*a'.repeat(9)}*b`;
    expect(pattern.split('*')).toHaveLength(11);
    const runs = [1000, 2000, 4000].map(length => {
      const text = 'a'.repeat(length);
      const miss = counted(text, pattern);
      const hit = counted(`${text}b`, pattern);
      const folded = counted(text.toUpperCase(), pattern, { ignoreCase: true });
      expect([miss.matched, hit.matched, folded.matched]).toEqual([
        false,
        true,
        false,
      ]);
      for (const run of [miss, hit, folded]) {
        expect(run.steps).toBeGreaterThanOrEqual(length);
        expect(run.steps).toBeLessThan(run.bound);
      }
      return miss.steps;
    });
    // Twice the text, twice the steps (and a little)
    expect(runs[1]).toBeLessThanOrEqual(2 * runs[0] + pattern.length);
    expect(runs[2]).toBeLessThanOrEqual(2 * runs[1] + pattern.length);
  });

  it('stays under (n + 1)(m + 1) steps where it goes back most', () => {
    // Each start in the text reads up to 10 a's before the b fails, so the
    // steps come near the bound; they must not reach it
    for (const length of [100, 1000, 4000]) {
      const run = counted('a'.repeat(length), `*${'a'.repeat(10)}b`);
      expect(run.matched).toBe(false);
      expect(run.steps).toBeGreaterThan(run.bound / 2);
      expect(run.steps).toBeLessThan(run.bound);
    }
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

    it('each in fewer than (n + 1)(m + 1) steps, with and without flags', () => {
      const over = cases.flatMap(([text, pattern]) =>
        [
          counted(text, pattern),
          counted(text, pattern, { ignoreCase: true, anyChar: true }),
        ]
          .filter(run => run.steps >= run.bound)
          .map(run => ({ text, pattern, ...run }))
      );
      expect(over).toEqual([]);
    });
  });
});
