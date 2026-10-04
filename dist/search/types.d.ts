/**
 * Search API type definitions for Firewalla MCP Server
 * Defines query AST nodes, search parameters, and result structures
 */
import type { AlarmGroup, FlowGroup, RulesTextCoverage } from '../types.js';
import type { PagingCoverage } from '../utils/paging-coverage.js';
import type { FlowGeographicFilters } from '../utils/geographic-filters.js';
/**
 * Query AST node types for complex search parsing
 */
export type QueryNode = FieldQuery | LogicalQuery | GroupQuery | WildcardQuery | RangeQuery | ComparisonQuery | TextQuery;
/**
 * Free text: a word, number or quoted phrase with no field. Which fields it
 * searches is up to the entity's matcher (or, for queries sent to the MSP
 * API, the API).
 */
export interface TextQuery {
    type: 'text';
    value: string;
}
/**
 * Basic field-value query node
 */
export interface FieldQuery {
    type: 'field';
    field: string;
    value: string;
    operator?: '=' | '!=' | '~';
}
/**
 * Logical operator query node (AND, OR, NOT)
 */
export interface LogicalQuery {
    type: 'logical';
    operator: 'AND' | 'OR' | 'NOT';
    left?: QueryNode;
    right?: QueryNode;
    operand?: QueryNode;
}
/**
 * Grouped query node (parentheses)
 */
export interface GroupQuery {
    type: 'group';
    query: QueryNode;
}
/**
 * Wildcard query node (* and ? patterns)
 */
export interface WildcardQuery {
    type: 'wildcard';
    field: string;
    pattern: string;
}
/**
 * Range query node ([min TO max])
 */
export interface RangeQuery {
    type: 'range';
    field: string;
    min?: string | number;
    max?: string | number;
    inclusive?: boolean;
}
/**
 * Comparison query node (>=, <=, >, <)
 */
export interface ComparisonQuery {
    type: 'comparison';
    field: string;
    operator: '>=' | '<=' | '>' | '<';
    value: string | number;
}
/**
 * Search parameters for API calls
 */
export interface SearchParams {
    query: string;
    limit?: number;
    offset?: number;
    cursor?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    aggregate?: boolean;
    time_range?: {
        start?: string;
        end?: string;
    };
    force_refresh?: boolean;
    geographic_filters?: FlowGeographicFilters;
    box?: string;
    owner?: string;
}
/**
 * Search result structure
 */
export interface SearchResult<T = any> {
    results: T[];
    count: number;
    total?: number;
    limit: number;
    offset: number;
    next_cursor?: string;
    coverage?: PagingCoverage;
    free_text_coverage?: RulesTextCoverage;
    groups?: FlowGroup[] | AlarmGroup[];
    group_by?: string;
    query: string;
    execution_time_ms: number;
    aggregations?: Record<string, {
        count: number;
        sum?: number;
        avg?: number;
        min?: number;
        max?: number;
    }>;
}
/**
 * Token types for lexical analysis
 */
export interface Token {
    type: TokenTypeValue;
    value: string;
    position: number;
    length: number;
}
export declare const TokenType: {
    readonly FIELD: "FIELD";
    readonly VALUE: "VALUE";
    readonly QUOTED_VALUE: "QUOTED_VALUE";
    readonly OPERATOR: "OPERATOR";
    readonly LOGICAL: "LOGICAL";
    readonly LPAREN: "LPAREN";
    readonly RPAREN: "RPAREN";
    readonly LBRACKET: "LBRACKET";
    readonly RBRACKET: "RBRACKET";
    readonly COLON: "COLON";
    readonly WILDCARD: "WILDCARD";
    readonly TO: "TO";
    readonly EOF: "EOF";
};
export type TokenTypeValue = (typeof TokenType)[keyof typeof TokenType];
/**
 * Supported search fields by entity type
 */
export declare const SEARCH_FIELDS: {
    flows: string[];
    alarms: string[];
    rules: string[];
    devices: string[];
    target_lists: string[];
};
/**
 * Query validation result
 */
export interface QueryValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
    ast?: QueryNode;
}
//# sourceMappingURL=types.d.ts.map