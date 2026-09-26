/**
 * @fileoverview Text from the Firewalla API, as the model sees it
 *
 * Device names come from DHCP and mDNS hostnames, which anyone on the LAN
 * can set. Domains come from DNS, and alarm messages quote both. That text
 * reaches the model in tool results, resources and prompts, and a model can
 * read it as instructions. With the write tools enabled, text that passes
 * for instructions could pause or delete rules or delete alarms.
 *
 * - Every result the server returns goes through markInvisibleCharactersIn
 *   (see UntrustedTextServer), so characters that do not display are shown
 *   as markers such as <U+E0041> instead of reaching the model unseen.
 */

/**
 * Characters that change nothing on screen and still reach the model:
 * Unicode tag characters (U+E0000-U+E007F, "ASCII smuggling"), bidi
 * embeddings, overrides and isolates (U+202A-U+202E, U+2066-U+2069), the
 * zero-width space, non-joiner and joiner (U+200B-U+200D), the word joiner
 * (U+2060) and the byte order mark (U+FEFF)
 */
const INVISIBLE =
  /[\u{200B}-\u{200D}\u{2060}\u{FEFF}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{E0000}-\u{E007F}]/u;

/**
 * An invisible character, or one of the two emoji sequences that need one,
 * which are captured so they can be kept:
 * 1. the subdivision flags of England, Scotland and Wales: U+1F3F4, the tag
 *    letters gbeng, gbsct or gbwls, then U+E007F. They are the only
 *    recommended (RGI) emoji tag sequences. Other tags after U+1F3F4 are
 *    marked, so a flag cannot carry hidden text.
 * 2. a zero-width joiner between two emoji, as in the family and profession
 *    emoji: after a pictograph, a skin tone modifier or U+FE0F, and before
 *    a pictograph.
 */
const INVISIBLE_OR_EMOJI_SEQUENCE =
  /(\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F})|((?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}])\u{200D}(?=\p{Extended_Pictographic}))|[\u{200B}-\u{200D}\u{2060}\u{FEFF}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{E0000}-\u{E007F}]/gu;

/** A visible marker for a character: <U+200B>, <U+E0041> */
function marker(character: string): string {
  const hex = (character.codePointAt(0) ?? 0).toString(16).toUpperCase();
  return `<U+${hex.padStart(4, '0')}>`;
}

/**
 * Replaces each invisible character in `text` with a visible marker such as
 * <U+E0041>, so hidden text is shown rather than dropped. The emoji that
 * need such characters (joiner sequences, the three subdivision flags) are
 * kept. Text without any is returned as it is.
 */
export function markInvisibleCharacters(text: string): string {
  if (!INVISIBLE.test(text)) {
    return text;
  }
  return text.replace(
    INVISIBLE_OR_EMOJI_SEQUENCE,
    (match: string, flag?: string, joiner?: string) =>
      flag || joiner ? match : marker(match)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * markInvisibleCharacters applied to every string in `value`, keys and
 * values, through arrays and plain objects. A part with nothing to mark is
 * returned as it is, so a result without such characters is the same
 * object and serializes to the same bytes.
 */
export function markInvisibleCharactersIn<T>(value: T): T {
  if (typeof value === 'string') {
    return markInvisibleCharacters(value) as T;
  }
  if (Array.isArray(value)) {
    const marked = value.map(item => markInvisibleCharactersIn(item));
    return marked.some((item, index) => item !== value[index])
      ? (marked as T)
      : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const markedKey = markInvisibleCharacters(key);
      const markedItem = markInvisibleCharactersIn(item);
      changed = changed || markedKey !== key || markedItem !== item;
      return [markedKey, markedItem] as const;
    });
    return changed ? (Object.fromEntries(entries) as T) : value;
  }
  return value;
}
