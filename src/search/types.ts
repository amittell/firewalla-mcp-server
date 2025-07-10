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
  force_refresh?: boolean; // Bypass cache for real-time data
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
  aggregations?: Record<
    string,
    {
      count: number;
      sum?: number;
      avg?: number;
      min?: number;
      max?: number;
    }
  >;
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
  EOF: 'EOF',
} as const;

export type TokenTypeValue = (typeof TokenType)[keyof typeof TokenType];

/**
 * Filter application result
 */
export interface FilterResult {
  apiParams: Record<string, any>;
  postProcessing: Array<(items: any[]) => any[]>;
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
    'source_ip',
    'destination_ip',
    'protocol',
    'port',
    'direction',
    'blocked',
    'bytes',
    'download',
    'upload',
    'duration',
    'timestamp',
    'device_ip',
    'device_id',
    'region',
    'category',
    // Enhanced geographic fields
    'country',
    'country_code',
    'continent',
    'city',
    'timezone',
    'isp',
    'organization',
    'hosting_provider',
    'asn',
    'is_cloud_provider',
    'is_cloud',
    'is_proxy',
    'is_vpn',
    'geographic_risk_score',
    'geo_location',
    // Application-level fields
    'user_agent',
    'application',
    'application_category',
    'domain_category',
    'ssl_subject',
    'ssl_issuer',
    // Behavioral pattern fields
    'session_duration',
    'frequency_score',
    'bytes_per_session',
    'connection_pattern',
    'activity_level',
  ],
  alarms: [
    'severity',
    'type',
    'source_ip',
    'destination_ip',
    'remote_ip',
    'device_ip',
    'protocol',
    'port',
    'timestamp',
    'status',
    'direction',
    'description',
    'message',
    // Enhanced geographic fields
    'country',
    'country_code',
    'continent',
    'city',
    'remote_country',
    'remote_continent',
    'timezone',
    'isp',
    'organization',
    'hosting_provider',
    'asn',
    'is_cloud_provider',
    'is_proxy',
    'is_vpn',
    'geographic_risk_score',
    'geo_risk_score',
    'geo_location',
    // Application-level fields
    'user_agent',
    'application',
    'application_category',
    'domain_category',
    'ssl_subject',
    'ssl_issuer',
    // Behavioral pattern fields
    'session_duration',
    'frequency_score',
    'bytes_per_session',
    'connection_pattern',
    'activity_level',
  ],
  rules: [
    'id',
    'name',
    'description',
    'action',
    'target_type',
    'target_value',
    'direction',
    'status',
    'category',
    'hit_count',
    'last_hit',
    'enabled',
    'created_at',
    'updated_at',
  ],
  devices: [
    'id',
    'name',
    'ip',
    'mac',
    'mac_vendor',
    'online',
    'device_type',
    'os',
    'network_name',
    'group_name',
    'last_seen',
    'bandwidth_usage',
    'connection_count',
    'total_download',
    'total_upload',
  ],
  target_lists: ['name', 'owner', 'category', 'target_count', 'last_updated'],
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
