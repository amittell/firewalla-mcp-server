/**
 * Translates the query language the tools accept into the grammar of the
 * MSP API's `query` parameter on /v2/alarms, /v2/flows and /v2/rules.
 *
 * The API grammar, measured 2026-09-26 (docs/firewalla-api-reference.md,
 * "Measured Query Behavior"): terms are separated by spaces; terms on
 * different fields must all match; the same field repeated, or a comma list
 * `field:a,b`, matches either value; `-field:value` excludes; a word without
 * a qualifier is free text. `AND`, `OR` and `NOT` are not operators: the API
 * searches them as words (`status:blocked AND region:US` matched 0 flows and
 * `status:blocked region:US` 6,318). Parentheses match nothing. The API has
 * no OR between different fields.
 *
 * The tools accept uppercase `AND`, `OR` and `NOT` (NOT binds tightest, then
 * AND, then OR; terms with no operator between them are ANDed), parentheses,
 * and the API's own forms. toMspQuery rewrites a query into one conjunction
 * the API can run:
 * - AND, or no operator, between terms: a space
 * - OR between values of one field: a comma list (`region:US OR region:CN`
 *   is sent as `region:US,CN`), also where AND distributes over it
 * - NOT of a term: the `-` prefix; NOT of a comparison: the opposite
 *   comparison (`NOT total:>1MB` is sent as `total:<=1MB`; measured
 *   2026-09-26, both that and `-total:>1MB` matched the same 735,778
 *   flows); NOT of an OR: each term excluded
 * - a lower and an upper bound on one field: one range (`ts:>=a ts:<=b` is
 *   sent as `ts:a-b`; a range includes its ends, so a strict bound is refused)
 * - a relative time (`ts:>1h`, `ts:<=7d`): Unix seconds
 * A query that needs an OR between different fields, NOT over an AND, the
 * exclusion of free text, a wildcard or a range, two other conditions on one
 * field (the API would read them as OR), or `[low TO high]` range syntax has
 * no API form: MspQueryError names the part and says what to send instead,
 * where there is something: for an OR, one query per disjunct of the
 * query's disjunctive normal form, whose results together are the query's.
 * Lowercase `and`, `or` and `not` are words, as the API reads them. A query
 * already in API form comes back unchanged.
 */
/** A query, or part of one, that the MSP API cannot run */
export declare class MspQueryError extends Error {
    /** The query as the caller gave it */
    readonly query: string;
    /** The part of the query that has no API form */
    readonly part?: string;
    /** Queries the API can run instead, when there are some */
    readonly suggestions: string[];
    constructor(message: string, query: string, part?: string, suggestions?: string[]);
}
/**
 * The MspQueryError behind an error: the error itself, or one found by
 * following, up to five levels down, the error that each wrapper kept as
 * `cause`, else as `retryContext.originalError`. withToolTimeout throws a
 * failure as it came, so the error itself is the usual case, and nothing
 * sets `retryContext` since RetryManager was removed.
 */
export declare function findMspQueryError(error: unknown): MspQueryError | undefined;
type Kind = 'exact' | 'wildcard' | 'comparison' | 'range' | 'text';
/** One term of a query in API form */
export interface MspTerm {
    readonly negated: boolean;
    /** The qualifier as written; empty for free text */
    readonly field: string;
    /**
     * exact and wildcard: the values of the comma list, as written (quotes
     * kept); comparison: one value with its operator (`>=10MB`); range: one
     * `low-high`; text: the word
     */
    readonly values: readonly string[];
    readonly kind: Kind;
}
/** A `[low TO high]` range in a query, and the query with it in API form */
export interface BracketRange {
    /** The range as written: `bytes:[1000000 TO 50000000]` */
    part: string;
    /**
     * The same condition in the API's grammar (`bytes:1000000-50000000`,
     * `bytes:>=1000` for `[1000 TO *]`); empty when both ends are `*`
     */
    replacement: string;
    /** Whether a brace (an excluded end) became an end the range includes */
    widened: boolean;
    /** The whole query with the range replaced */
    query: string;
}
/**
 * A quoted value: in double quotes, or in single quotes that open where a
 * word could start (a single quote after a letter, digit or underscore is
 * an apostrophe, as in Nora's), backslash escapes included. Split on it,
 * a query's unquoted text is at the even indexes and its quoted values at
 * the odd ones.
 */
export declare const QUOTED_TEXT: RegExp;
/**
 * `rewrite` applied to the text of `query` outside its quoted values
 * (QUOTED_TEXT), which are left as they are: "blocked:true" is a phrase,
 * not a term to translate
 */
export declare function outsideQuotes(query: string, rewrite: (text: string) => string): string;
/** The text of `query` outside its quoted values, a space for each one */
export declare function unquotedText(query: string): string;
/**
 * The first Lucene-style range in a query (`field:[low TO high]`, or with
 * braces), outside quotes. The API's grammar has none: its ranges are
 * `field:low-high`, which include both ends. Single-quoted text is quoted
 * too: toMspQuery sends 'show ts:[1 TO 2]' as one phrase, and it was
 * refused here as a range.
 *
 * @param query - A query as the caller wrote it
 * @returns The range and its API form, or undefined when there is none
 */
export declare function findBracketRange(query: string): BracketRange | undefined;
/**
 * The refusal of a `[low TO high]` range
 *
 * @param query - The query as the caller wrote it
 * @param range - The range findBracketRange found in it
 * @param suggestion - The query to send instead; the query with the range
 *   in API form unless given (a caller may rename qualifiers in it)
 */
export declare function bracketRangeError(query: string, range: BracketRange, suggestion?: string): MspQueryError;
/**
 * Translates a query into the MSP API's grammar (see the file comment)
 *
 * @param query - Query in the tools' language or already in API form
 * @returns The query as one space-separated conjunction the API can run;
 *   empty for an empty query
 * @throws {MspQueryError} When the query is malformed or has no API form
 */
export declare function toMspQuery(query: string): string;
/**
 * Refuses a query for /v2/flows or /v2/alarms with a quoted free-text
 * phrase that holds a colon. The API answers one with HTTP 400, while it
 * takes a quoted colon in a field value (measured 2026-09-27, GET with
 * limit 1: "a:b", 'a:b' and "show ts:[1 TO 2]" on flows and "a:b" on
 * alarms answered 400; domain:"a:b" on flows and device.name:"x:y" on
 * flows and alarms 200; "show ts 1 TO 2" and "a[b]" on flows 200). The
 * search tools match free text themselves for rules, devices and target
 * lists, so a colon there is fine and this is not called for them.
 *
 * @param query - The query, in the tools' language or the API's
 * @throws {MspQueryError} Naming the phrase, with the query without its
 *   colons as the suggestion
 */
export declare function refuseColonInQuotedText(query: string): void;
/**
 * The terms of the query toMspQuery sends, every one of which must hold:
 * for checking a result against the whole query on the client
 *
 * @param query - Query in the tools' language or already in API form
 * @returns One term per space-separated part of toMspQuery(query)
 * @throws {MspQueryError} When the query is malformed or has no API form
 */
export declare function mspTerms(query: string): MspTerm[];
/**
 * One term as toMspQuery sends it: `-region:US,CN`, `total:>1MB`, a word
 */
export declare function mspTermText(term: MspTerm): string;
/**
 * A query split into its free-text words and its other terms, for an
 * endpoint whose free-text search the client does itself: GET /v2/rules
 * matched no free text (measured 2026-09-26: a word in one of 98 rules'
 * target value returned no rules)
 *
 * @param query - Query in the tools' language or already in API form
 * @returns fields: the other terms in API form, as toMspQuery sends them
 *   (empty when there are none); text: the free-text words as written,
 *   every one of which must match
 * @throws {MspQueryError} When the query has no API form, such as an OR
 *   with free text or the exclusion of free text
 */
export declare function mspSplitText(query: string): {
    fields: string;
    text: string[];
};
/**
 * The conjunction of several queries in API form: each part is translated,
 * so an OR in one part cannot bind to a term of another
 *
 * @param parts - Queries to AND together; empty and undefined parts are
 *   skipped
 * @returns The combined query in API form; empty when every part is empty
 * @throws {MspQueryError} When a part, or the combination, has no API form
 */
export declare function mspAnd(...parts: Array<string | undefined>): string;
/**
 * A query scoped to one box: the query in API form with `box.id:<gid>`.
 * The API reads two box.id terms as either box, so a query that names
 * another box (or a box.id wildcard) would widen the scope instead of
 * narrowing it, and is refused; naming the same box is allowed.
 *
 * @param query - Query in the tools' language or already in API form
 * @param gid - The box to scope to, already checked to be a gid
 * @returns The scoped query in API form
 * @throws {MspQueryError} When the query has no API form or names another box
 */
export declare function mspBoxScope(query: string | undefined, gid: string): string;
/**
 * A literal value for a `field:value` term, quoted when the API grammar
 * needs it: for whitespace, a comma, an asterisk or a colon (and here also
 * parentheses, quotes, backslashes and a leading comparison sign), with
 * quotes, backslashes and asterisks escaped inside the quotes
 *
 * @param value - The value to match literally
 * @returns The value as it goes after `field:`
 */
export declare function mspValue(value: string): string;
/**
 * The API's `-field:value` and `-(...)` exclusions, and a `-` before free
 * text (`-laptop`, `-"a b"`, `-*phone*`), written as NOT, for the validators
 * and parsers that know only the boolean operators, outside quoted values.
 * The query sent to the API is not rewritten this way. A `-` before free
 * text was left as it was, and the search parser refused it as an
 * "Unexpected character '-'" while it took NOT before the same text.
 */
export declare function withNotForMinus(query: string): string;
export {};
//# sourceMappingURL=msp-query.d.ts.map