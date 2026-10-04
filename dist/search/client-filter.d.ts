/**
 * Client-side evaluation of search queries, for endpoints the MSP API does
 * not search (such as /v2/devices).
 *
 * `matchesQuery` evaluates AND, OR, NOT and parentheses; the caller decides
 * what each `field:value` term matches. NOT binds tightest, then AND, then OR,
 * and terms with no operator between them are ANDed, as in the MSP syntax.
 * The MSP API's exclusion prefix works too: `-field:value`, `-(...)` and a
 * `-` before free text (`-laptop`) are NOT. Operators are uppercase, as
 * toMspQuery reads them: `and`, `or` and `not` are words to match, as the
 * API reads them.
 */
/**
 * Evaluates a search query against one item
 *
 * @param query - Query such as `name:nas OR (ip:10.0.0.* AND online:true)`
 * @param matchesTerm - Whether the item matches one term, such as `name:nas`
 * @returns True when the item satisfies the whole query
 */
export declare function matchesQuery(query: string, matchesTerm: (term: string) => boolean): boolean;
/**
 * Removes the quotes around a quoted query value: `"Home Office"` -> `Home Office`
 */
export declare function unquoteQueryValue(value: string): string;
/**
 * The values of a comma list, unquoted, as the MSP API grammar reads
 * `field:a,b` (either value): `social,games` -> [social, games] and
 * `"Block, Social",games` -> [Block, Social, games]
 */
export declare function commaListValues(value: string): string[];
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
export declare function ipv4InCidr(ip: string, cidr: string): boolean | undefined;
//# sourceMappingURL=client-filter.d.ts.map