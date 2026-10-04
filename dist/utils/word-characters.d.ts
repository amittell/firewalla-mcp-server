/**
 * @fileoverview Where a single quote is an apostrophe
 *
 * Every tokenizer of a query reads a ' as an apostrophe when it follows a
 * letter, digit, combining mark or underscore, in any script (Nora's,
 * Café's, 1990's), and as a quote anywhere else. The regular expressions
 * that do the same (the matchers' token and list patterns, QUOTED_TEXT)
 * use the class WORD_CHARACTER_CLASS gives, with the u flag, so that
 * their lookbehind reads a surrogate pair as one character.
 */
/**
 * The class of a character a ' after which is an apostrophe: a letter,
 * digit or combining mark in any script, or _. The combining marks count
 * because a letter can be written as a base and a mark: é as e and
 * U+0301.
 */
export declare const WORD_CHARACTER_CLASS: string;
/**
 * Whether the character just before index `i` of `text` is a letter, digit,
 * combining mark or underscore, in any script. A letter outside the Basic
 * Multilingual Plane (𝒜, 𐐀) is a surrogate pair, two code units: it is
 * read as one character, where text[i - 1] alone is the pair's low half
 * and no letter.
 *
 * @param text - The query
 * @param i - The index of the character after the one tested, such as a '
 */
export declare function followsWordCharacter(text: string, i: number): boolean;
//# sourceMappingURL=word-characters.d.ts.map