/**
 * @fileoverview The structural checks every search query gets before it is
 * translated or sent: balanced parentheses and brackets, closed quotes, a
 * nesting limit, a length limit, and no control characters.
 *
 * Parentheses and brackets are counted outside quoted values only, as the
 * search parser and toMspQuery read them: name:"a(b" is one value. A quote
 * is read as the parser reads it: a backslash escapes the next character
 * inside quotes, and a ' right after a letter, digit, combining mark or
 * underscore is an apostrophe (Nora's), not the start of a quote.
 */
/** The longest query taken, in UTF-16 code units, trimmed */
export declare const MAX_QUERY_LENGTH = 2000;
/**
 * The deepest nesting of parentheses taken. The search tools' complexity
 * check refused more than 5 already; get_flow_data and get_active_alarms,
 * which ran no check, sent 11. A [low TO high] range does not nest and is
 * not counted.
 */
export declare const MAX_QUERY_NESTING = 5;
/**
 * Calls `visit` with each character of `query` outside quoted values, and
 * its index, and returns the quote left open at the end, if any, with the
 * index where it opened
 */
export declare function scanOutsideQuotes(query: string, visit: (character: string, index: number) => void): {
    quote: '"' | "'";
    index: number;
} | undefined;
/**
 * What is structurally wrong with a query, one message each; empty when
 * nothing is. The search tools refuse a query with any of these before
 * they translate or send it.
 *
 * @param query - The query as given
 */
export declare function queryStructureErrors(query: string): string[];
/** The most AND and OR operators a query may hold */
export declare const MAX_QUERY_OPERATORS = 20;
/** The most field:value terms a query may hold */
export declare const MAX_QUERY_FIELD_TERMS = 15;
/** The most [low TO high] ranges a query may hold */
export declare const MAX_QUERY_RANGES = 5;
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
export declare function queryComplexityErrors(query: string): string[];
//# sourceMappingURL=query-structure.d.ts.map