/**
 * Advanced search utilities for Firewalla MCP Server
 * Implements complex query parsing and search optimization
 */

import { SearchFilter, SearchOptions } from '../types.js';

/**
 * Parsed query component interface
 */
interface QueryComponent {
  field?: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startswith' | 'endswith' | 'regex' | 'range';
  value: string | number | boolean | Array<string | number | boolean>;
  logical?: 'AND' | 'OR' | 'NOT';
}

/**
 * Query parsing result interface
 */
interface ParsedQuery {
  components: QueryComponent[];
  filters: SearchFilter[];
  optimized: string;
  complexity: number;
}

/**
 * Parses a raw search query string into structured components and filters.
 *
 * Supports advanced syntax including logical operators (AND, OR, NOT), field:value pairs, comparison operators, wildcards, ranges, and arrays. Returns parsed query components, corresponding filters, an optimized query string, and a computed complexity score.
 *
 * @param query - The raw search query string to parse
 * @returns An object containing parsed components, filters, an optimized query string, and the query's complexity score
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const components: QueryComponent[] = [];
  const filters: SearchFilter[] = [];
  let complexity = 1;

  // Remove extra whitespace and normalize
  const normalized = query.trim().replace(/\s+/g, ' ');
  
  // Split by logical operators while preserving them
  const tokens = normalized.split(/\s+(AND|OR|NOT)\s+/i);
  
  let currentLogical: 'AND' | 'OR' | 'NOT' | undefined;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]?.trim();
    if (!token) continue;
    
    // Check if token is a logical operator
    if (/^(AND|OR|NOT)$/i.test(token)) {
      currentLogical = token.toUpperCase() as 'AND' | 'OR' | 'NOT';
      complexity += 0.5;
      continue;
    }
    
    // Parse field:value expressions
    const component = parseFieldExpression(token);
    if (component) {
      component.logical = currentLogical;
      components.push(component);
      
      // Convert to SearchFilter format
      if (component.field) {
        filters.push({
          field: component.field,
          operator: component.operator,
          value: component.value
        });
      }
      
      complexity += getOperatorComplexity(component.operator);
    }
    
    currentLogical = undefined;
  }
  
  // Generate optimized query string
  const optimized = optimizeQuery(components);
  
  return {
    components,
    filters,
    optimized,
    complexity: Math.round(complexity * 100) / 100
  };
}

/**
 * Parses a single field expression from a search query into a structured query component.
 *
 * Supports range queries (e.g., `field:[min TO max]`), comparison operators (e.g., `field:>=value`), wildcards (converted to regex), array values (comma-separated), standard equality, and free-text search.
 *
 * @param expression - The field expression string to parse
 * @returns A `QueryComponent` representing the parsed expression, or `null` if parsing fails
 */
function parseFieldExpression(expression: string): QueryComponent | null {
  // Handle parentheses (basic support)
  const cleaned = expression.replace(/[()]/g, '').trim();
  
  // Range syntax: field:[min TO max]
  const rangeMatch = cleaned.match(/^(\w+):\[(.+?)\s+TO\s+(.+?)\]$/i);
  if (rangeMatch) {
    const [, field, min, max] = rangeMatch;
    return {
      field,
      operator: 'range',
      value: [parseValue(min), parseValue(max)] as Array<string | number | boolean>
    };
  }
  
  // Comparison operators: field:>=value, field:>value, etc.
  const comparisonMatch = cleaned.match(/^(\w+):(>=|<=|>|<|!=|=)(.+)$/);
  if (comparisonMatch) {
    const [, field, op, value] = comparisonMatch;
    const operator = mapComparisonOperator(op);
    return {
      field,
      operator,
      value: parseValue(value)
    };
  }
  
  // Standard field:value syntax
  const fieldMatch = cleaned.match(/^(\w+):(.+)$/);
  if (fieldMatch) {
    const [, field, value] = fieldMatch;
    
    // Detect wildcards
    if (value.includes('*') || value.includes('?')) {
      return {
        field,
        operator: 'regex',
        value: convertWildcardToRegex(value)
      };
    }
    
    // Detect array values (comma-separated)
    if (value.includes(',')) {
      return {
        field,
        operator: 'in',
        value: value.split(',').map(v => parseValue(v.trim())) as Array<string | number | boolean>
      };
    }
    
    return {
      field,
      operator: 'eq',
      value: parseValue(value)
    };
  }
  
  // Free-text search (no field specified)
  return {
    operator: 'contains',
    value: cleaned
  };
}

/**
 * Converts a string value to its appropriate type: boolean, number, or unquoted string.
 *
 * Removes surrounding quotes if present and parses the value as a boolean or number when possible.
 *
 * @param value - The input string to parse
 * @returns The parsed value as a boolean, number, or string
 */
function parseValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  
  // Boolean values
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }
  
  // Numeric values
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  
  // Remove quotes if present
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  
  return trimmed;
}

/**
 * Maps a comparison operator symbol to its corresponding internal operator string.
 *
 * @param op - The comparison operator symbol (e.g., '>=', '<=', '>', '<', '!=', '=')
 * @returns The internal operator string representing the comparison (e.g., 'gte', 'lte', 'gt', 'lt', 'neq', 'eq')
 */
function mapComparisonOperator(op: string): QueryComponent['operator'] {
  switch (op) {
    case '>=': return 'gte';
    case '<=': return 'lte';
    case '>': return 'gt';
    case '<': return 'lt';
    case '!=': return 'neq';
    case '=': return 'eq';
    default: return 'eq';
  }
}

/**
 * Converts a wildcard pattern containing `*` and `?` into a regular expression string.
 *
 * Escapes all regex special characters except `*` and `?`, then replaces `*` with `.*` and `?` with `.` to form a valid regex pattern.
 *
 * @param pattern - The wildcard pattern to convert
 * @returns The equivalent regular expression string
 */
function convertWildcardToRegex(pattern: string): string {
  // Escape special regex characters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  // Convert wildcards to regex
  return escaped
    .replace(/\*/g, '.*')     // * becomes .*
    .replace(/\?/g, '.');     // ? becomes .
}

/**
 * Returns the complexity score associated with a given query operator.
 *
 * Complexity scores are used to estimate the cost of evaluating different types of search operators.
 *
 * @param operator - The query operator whose complexity is being evaluated
 * @returns The numeric complexity score for the specified operator
 */
function getOperatorComplexity(operator: QueryComponent['operator']): number {
  switch (operator) {
    case 'eq':
    case 'neq': return 1;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': return 1.2;
    case 'in':
    case 'nin': return 1.5;
    case 'contains':
    case 'startswith':
    case 'endswith': return 2;
    case 'regex': return 3;
    case 'range': return 2.5;
    default: return 1;
  }
}

/**
 * Returns an optimized query string by reordering components based on operator complexity.
 *
 * Components with simpler operators are placed earlier in the query to improve performance.
 *
 * @param components - The parsed query components to optimize
 * @returns The optimized query string with reordered components
 */
function optimizeQuery(components: QueryComponent[]): string {
  // Sort components by complexity (simpler first)
  const sorted = [...components].sort((a, b) => {
    const aComplexity = getOperatorComplexity(a.operator);
    const bComplexity = getOperatorComplexity(b.operator);
    return aComplexity - bComplexity;
  });
  
  // Rebuild optimized query string
  return sorted.map(component => {
    const logical = component.logical ? `${component.logical} ` : '';
    const field = component.field ? `${component.field}:` : '';
    const value = Array.isArray(component.value) 
      ? `[${component.value.join(' TO ')}]`
      : component.value;
    
    return `${logical}${field}${value}`;
  }).join(' ').trim();
}

/**
 * Validates the syntax and complexity of a search query.
 *
 * Checks for empty queries, enforces a maximum complexity threshold, and validates regex patterns within the query. Returns an object indicating whether the query is valid and an array of error messages if any issues are found.
 *
 * @param query - The raw search query string to validate
 * @returns An object with a boolean `valid` flag and an array of error messages in `errors`
 */
export function validateSearchQuery(query: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const parsed = parseSearchQuery(query);
    
    // Check for empty query
    if (!query.trim()) {
      errors.push('Query cannot be empty');
    }
    
    // Check complexity limit
    if (parsed.complexity > 10) {
      errors.push(`Query too complex (${parsed.complexity}). Maximum complexity is 10.`);
    }
    
    // Check for unsupported operators
    for (const component of parsed.components) {
      if (component.operator === 'regex' && typeof component.value === 'string') {
        try {
          new RegExp(component.value);
        } catch {
          errors.push(`Invalid regex pattern: ${component.value}`);
        }
      }
    }
    
  } catch (error) {
    errors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Combines filters from a parsed query with additional search options to create a complete SearchOptions object.
 *
 * @param parsedQuery - The parsed query containing filters to apply
 * @param additionalOptions - Optional additional search options to merge with the filters
 * @returns The combined search options for executing a search
 */
export function buildSearchOptions(
  parsedQuery: ParsedQuery,
  additionalOptions: Partial<SearchOptions> = {}
): SearchOptions {
  return {
    filters: parsedQuery.filters,
    ...additionalOptions
  };
}

/**
 * Returns an optimized version of the search query string for API use.
 *
 * If the query can be optimized, the optimized string is returned; otherwise, the original query is returned.
 *
 * @param query - The raw search query string to format
 * @returns The optimized query string suitable for API consumption
 */
export function formatQueryForAPI(query: string): string {
  const parsed = parseSearchQuery(query);
  return parsed.optimized || query;
}