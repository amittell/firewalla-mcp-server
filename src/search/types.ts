/**
 * Search API type definitions for Firewalla MCP Server
 * Defines query AST nodes, search parameters, and result structures
 */

/**
 * Query AST node types for complex search parsing
 */
export type QueryNode = 
  | FieldQuery
  | LogicalQuery
  | GroupQuery
  | WildcardQuery
  | RangeQuery
  | ComparisonQuery;

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
  operand?: QueryNode; // For NOT operator
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
  offset?: number; // Deprecated: use cursor for new implementations
  cursor?: string; // Cursor-based pagination (preferred)
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  group_by?: string;
  aggregate?: boolean;
  time_range?: {
    start?: string;
    end?: string;
  };
}

/**
 * Search result structure
 */
export interface SearchResult<T = any> {
  results: T[];
  count: number; // Primary field for consistency across API
  total?: number; // Optional for backward compatibility
  limit: number;
  offset: number; // Deprecated: use next_cursor for new implementations
  next_cursor?: string; // Cursor-based pagination (preferred)
  query: string;
  execution_time_ms: number;
  aggregations?: {
    [key: string]: {
      count: number;
      sum?: number;
      avg?: number;
      min?: number;
      max?: number;
    };
  };
}

/**
 * Query parsing context
 */
export interface ParseContext {
  input: string;
  position: number;
  errors: string[];
  tokens: Token[];
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

export const TokenType = {
  FIELD: 'FIELD',
  VALUE: 'VALUE',
  QUOTED_VALUE: 'QUOTED_VALUE',
  OPERATOR: 'OPERATOR',
  LOGICAL: 'LOGICAL',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COLON: 'COLON',
  WILDCARD: 'WILDCARD',
  TO: 'TO',
  EOF: 'EOF'
} as const;

export type TokenTypeValue = typeof TokenType[keyof typeof TokenType];

/**
 * Filter application result
 */
export interface FilterResult {
  apiParams: Record<string, any>;
  // eslint-disable-next-line no-unused-vars
  postProcessing: ((items: any[]) => any[])[];
  metadata: {
    filtersApplied: string[];
    optimizations: string[];
    cacheKey?: string;
  };
}

/**
 * Supported search fields by entity type
 */
export const SEARCH_FIELDS = {
  flows: [
    'source_ip', 'destination_ip', 'protocol', 'direction', 'blocked', 
    'bytes', 'timestamp', 'device_ip', 'region', 'category'
  ],
  alarms: [
    'severity', 'type', 'source_ip', 'destination_ip', 'timestamp', 
    'status', 'description'
  ],
  rules: [
    'action', 'target_type', 'target_value', 'direction', 'status', 
    'hit_count', 'created_at', 'updated_at'
  ],
  devices: [
    'name', 'ip', 'mac_vendor', 'online', 'network_name', 'group_name',
    'total_download', 'total_upload'
  ],
  target_lists: [
    'name', 'owner', 'category', 'target_count', 'last_updated'
  ]
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