/**
 * Text from the Firewalla API is set by the devices and sites on the
 * network. Characters that do not display are shown as markers, and emoji
 * that need them are kept.
 */

import {
  markInvisibleCharacters,
  markInvisibleCharactersIn,
} from '../../src/utils/untrusted-text.js';

/** ASCII text as Unicode tag characters, which display as nothing */
function tags(text: string): string {
  return [...text]
    .map(character => String.fromCodePoint(0xe0000 + character.charCodeAt(0)))
    .join('');
}

describe('markInvisibleCharacters', () => {
  it('shows each tag character as a marker', () => {
    expect(markInvisibleCharacters(`printer${tags('Hi')}`)).toBe(
      'printer<U+E0048><U+E0069>'
    );
    expect(markInvisibleCharacters('\u{E0001}\u{E0020}\u{E007F}')).toBe(
      '<U+E0001><U+E0020><U+E007F>'
    );
  });

  it.each([
    ['U+202A', '\u{202A}'],
    ['U+202B', '\u{202B}'],
    ['U+202C', '\u{202C}'],
    ['U+202D', '\u{202D}'],
    ['U+202E', '\u{202E}'],
    ['U+2066', '\u{2066}'],
    ['U+2067', '\u{2067}'],
    ['U+2068', '\u{2068}'],
    ['U+2069', '\u{2069}'],
    ['U+200B', '\u{200B}'],
    ['U+200C', '\u{200C}'],
    ['U+200D', '\u{200D}'],
    ['U+2060', '\u{2060}'],
    ['U+FEFF', '\u{FEFF}'],
  ])('shows %s as a marker', (name, character) => {
    expect(markInvisibleCharacters(`a${character}b`)).toBe(`a<${name}>b`);
  });

  it('returns text without them as it is', () => {
    const text =
      'Living Room TV (192.168.1.20) caf\u{E9} \u{1F7E2} \u{26A0}\u{FE0F} <U+200B>';
    expect(markInvisibleCharacters(text)).toBe(text);
    expect(markInvisibleCharacters('')).toBe('');
  });

  it.each([
    ['family', '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'],
    ['technologist: medium skin tone', '\u{1F469}\u{1F3FD}\u{200D}\u{1F4BB}'],
    ['heart on fire', '\u{2764}\u{FE0F}\u{200D}\u{1F525}'],
    ['rainbow flag', '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}'],
    ['man: red hair', '\u{1F468}\u{200D}\u{1F9B0}'],
    [
      'people holding hands: light skin tone, dark skin tone',
      '\u{1F9D1}\u{1F3FB}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}\u{1F3FF}',
    ],
    ['pirate flag', '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}'],
    ['flag: England', `\u{1F3F4}${tags('gbeng')}\u{E007F}`],
    ['flag: Scotland', `\u{1F3F4}${tags('gbsct')}\u{E007F}`],
    ['flag: Wales', `\u{1F3F4}${tags('gbwls')}\u{E007F}`],
  ])('keeps the %s emoji', (_name, emoji) => {
    const text = `Sam's phone ${emoji}${emoji}`;
    expect(markInvisibleCharacters(text)).toBe(text);
  });

  it('marks tags after a black flag that are not a subdivision flag', () => {
    expect(markInvisibleCharacters(`\u{1F3F4}${tags('hello')}\u{E007F}`)).toBe(
      '\u{1F3F4}<U+E0068><U+E0065><U+E006C><U+E006C><U+E006F><U+E007F>'
    );
    // A valid subdivision code that is not one of the three flags
    expect(markInvisibleCharacters(`\u{1F3F4}${tags('usca')}\u{E007F}`)).toBe(
      '\u{1F3F4}<U+E0075><U+E0073><U+E0063><U+E0061><U+E007F>'
    );
    // A flag without its cancel tag
    expect(markInvisibleCharacters(`\u{1F3F4}${tags('gbeng')}`)).toBe(
      '\u{1F3F4}<U+E0067><U+E0062><U+E0065><U+E006E><U+E0067>'
    );
  });

  it('marks tags hidden after a subdivision flag', () => {
    const england = `\u{1F3F4}${tags('gbeng')}\u{E007F}`;
    expect(markInvisibleCharacters(`${england}${tags('ok')}`)).toBe(
      `${england}<U+E006F><U+E006B>`
    );
  });

  it('marks a joiner that is not between two emoji', () => {
    expect(markInvisibleCharacters('a\u{200D}b')).toBe('a<U+200D>b');
    expect(markInvisibleCharacters('\u{1F468}\u{200D}b')).toBe(
      '\u{1F468}<U+200D>b'
    );
    expect(markInvisibleCharacters('a\u{200D}\u{1F468}')).toBe(
      'a<U+200D>\u{1F468}'
    );
    expect(markInvisibleCharacters('\u{200D}\u{1F468}\u{200D}')).toBe(
      '<U+200D>\u{1F468}<U+200D>'
    );
    expect(markInvisibleCharacters('\u{1F468}\u{200D}\u{200D}\u{1F469}')).toBe(
      '\u{1F468}<U+200D><U+200D>\u{1F469}'
    );
  });

  it('marks the other zero-width characters between emoji', () => {
    expect(markInvisibleCharacters('\u{1F468}\u{200B}\u{1F469}')).toBe(
      '\u{1F468}<U+200B>\u{1F469}'
    );
    expect(markInvisibleCharacters('\u{1F468}\u{200C}\u{1F469}')).toBe(
      '\u{1F468}<U+200C>\u{1F469}'
    );
  });
});

describe('markInvisibleCharactersIn', () => {
  it('marks keys and values at any depth', () => {
    const value = {
      [`note${tags('x')}`]: [
        `tv\u{200B}`,
        { name: '\u{202E}txt.exe', count: 3, ok: true, none: null },
      ],
      plain: 'kept',
    };
    expect(markInvisibleCharactersIn(value)).toEqual({
      'note<U+E0078>': [
        'tv<U+200B>',
        { name: '<U+202E>txt.exe', count: 3, ok: true, none: null },
      ],
      plain: 'kept',
    });
  });

  it('keeps the order of keys', () => {
    const marked = markInvisibleCharactersIn({
      a: 1,
      'b\u{2060}': 2,
      c: 3,
    });
    expect(Object.keys(marked)).toEqual(['a', 'b<U+2060>', 'c']);
  });

  it('returns a value with nothing to mark as the same object', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: 'Kitchen \u{1F468}\u{200D}\u{1F373}',
            ip: '192.168.1.5',
          }),
        },
      ],
      isError: false,
    };
    const before = JSON.stringify(result);
    expect(markInvisibleCharactersIn(result)).toBe(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it('marks the text of a tool result and leaves it valid JSON', () => {
    const result = {
      content: [
        { type: 'text', text: JSON.stringify({ name: `tv${tags('a')}` }) },
      ],
    };
    const marked = markInvisibleCharactersIn(result);
    expect(marked).not.toBe(result);
    expect(JSON.parse(marked.content[0].text)).toEqual({
      name: 'tv<U+E0061>',
    });
    // The input is not changed
    expect(result.content[0].text).toContain(tags('a'));
  });
});
