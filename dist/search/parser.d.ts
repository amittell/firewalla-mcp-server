/**
 * Advanced Query Parser for Firewalla Search API
 * Implements recursive descent parser for complex search queries
 */
import { SEARCH_FIELDS, type QueryValidation } from './types.js';
export declare class QueryParser {
    private tokens;
    private current;
    private errors;
    /**
     * Parse a search query string into an AST
     */
    parse(query: string, entityType?: keyof typeof SEARCH_FIELDS): QueryValidation;
    private reset;
    /**
     * Tokenize the input query string
     */
    private tokenize;
    /**
     * Parse expression with logical operators (lowest precedence)
     */
    private parseExpression;
    /**
     * Parse AND expressions (higher precedence than OR)
     */
    private parseAndExpression;
    /**
     * Parse NOT expressions (highest precedence)
     */
    private parseNotExpression;
    /**
     * Parse primary expressions (field queries, groups, etc.)
     */
    private parsePrimary;
    /**
     * Parse field-based queries (field:value, field:>value, etc.)
     */
    private parseFieldQuery;
    /**
     * Parse range queries [min TO max]
     */
    private parseRangeQuery;
    /**
     * Parse and convert values to appropriate types
     */
    private parseValue;
    /**
     * Validate fields against entity schema
     */
    private validateFields;
    /**
     * Generate helpful suggestions for invalid queries
     */
    private generateSuggestions;
    /**
     * Whether the next token starts another term ANDed without an operator:
     * one that can begin a term (a word, value, quoted value, wildcard, `(`
     * or NOT). Anything else (`:`, an operator, a bracket, TO, AND, OR, `)`)
     * ends the AND, and parse() reports a token it did not read.
     */
    private startsImplicitAnd;
    /**
     * Whether parsing moved past `before`. A parse loop that read a term
     * without consuming a token would read it again forever, so it stops
     * and the query is refused.
     */
    private madeProgress;
    /**
     * Consume the next token only if it is the given logical operator.
     * match(LOGICAL) would also consume an OR while looking for AND, which
     * dropped the right-hand side of every OR query.
     */
    private matchLogical;
    private match;
    private check;
    private advance;
    private isAtEnd;
    private peek;
    private previous;
}
export declare const queryParser: QueryParser;
//# sourceMappingURL=parser.d.ts.map