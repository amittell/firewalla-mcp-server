/**
 * Advanced search utilities for Firewalla MCP Server
 * Implements complex query parsing and search optimization
 */

import { SearchFilter, SearchOptions } from '../types.js';

/**
 * Splits a string by commas while preserving quoted substrings as single segments.
 *
 * Commas inside single or double quotes are ignored as split points. Leading and trailing whitespace is trimmed from each resulting segment.
 *
 * @param value - The input string to split
 * @returns An array of substrings split by commas, with quoted sections kept intact
 */
function smartSplitCommas(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const prevChar = i > 0 ? value[i - 1] : '';
    
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result;
}

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
 * Splits a string by logical operators while respecting quoted substrings.
 * 
 * Logical operators (AND, OR, NOT) inside single or double quotes are ignored as split points.
 * Returns an array of tokens with logical operators preserved as separate elements.
 *
 * @param query - The input string to split
 * @returns An array of tokens split by logical operators, with quoted sections kept intact
 */
function smartSplitLogicalOperators(query: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;
  
  while (i < query.length) {
    const char = query[i];
    const prevChar = i > 0 ? query[i - 1] : '';
    
    // Handle quote state
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
      current += char;
      i++;
      continue;
    }
    
    // If we're inside quotes, just add the character
    if (inQuotes) {
      current += char;
      i++;
      continue;
    }
    
    // Check for logical operators outside quotes
    const remaining = query.slice(i);
    const logicalMatch = remaining.match(/^\s+(AND|OR|NOT)\s+/i);
    
    if (logicalMatch) {
      // Add current token if not empty
      if (current.trim()) {
        result.push(current.trim());
        current = '';
      }
      
      // Add the logical operator
      result.push(logicalMatch[1].toUpperCase());
      
      // Skip past the matched logical operator and whitespace
      i += logicalMatch[0].length;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add remaining token if not empty
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result;
}

/**
 * Parses a raw search query string into structured query components and filters.
 *
 * Supports advanced syntax including logical operators (AND, OR, NOT), field comparisons, ranges, wildcards, arrays, and free-text search. Returns an object containing parsed components, filters for backend search, an optimized query string, and a complexity score.
 *
 * @param query - The raw search query string to parse
 * @returns An object with parsed query components, filters, optimized query string, and complexity score
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const components: QueryComponent[] = [];
  const filters: SearchFilter[] = [];
  let complexity = 1;

  // Remove extra whitespace and normalize
  const normalized = query.trim().replace(/\s+/g, ' ');
  
  // Split by logical operators while preserving them and respecting quotes
  const tokens = smartSplitLogicalOperators(normalized);
  
  let currentLogical: 'AND' | 'OR' | 'NOT' | undefined;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]?.trim();
    if (!token) {
      continue;
    }
    
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
 * Parses a single field expression from a search query into a structured QueryComponent.
 *
 * Supports range queries (e.g., `field:[min TO max]`), comparison operators (e.g., `field:>=value`), wildcards (converted to regex), arrays (comma-separated values with quoted value support), standard equality, and free-text search when no field is specified.
 *
 * @param expression - The field expression string to parse
 * @returns The parsed QueryComponent, or null if parsing fails
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
    
    // Detect array values (comma-separated), but handle commas within quotes
    if (value.includes(',')) {
      const arrayValues = smartSplitCommas(value);
      return {
        field,
        operator: 'in',
        value: arrayValues.map(v => parseValue(v.trim())).filter(v => v !== null) as Array<string | number | boolean>
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
 * Recognizes and parses boolean literals, numeric values, and quoted strings with support for escaped characters.
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
  
  // Remove quotes if present and handle escaped quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const unquoted = trimmed.slice(1, -1);
    // Handle escaped quotes within the string
    return unquoted.replace(/\\(.)/g, '$1');
  }
  
  return trimmed;
}

/**
 * Maps a comparison operator symbol to its corresponding internal operator string.
 *
 * @param op - The comparison operator symbol (e.g., '>=', '<=', '!=', '=')
 * @returns The internal operator string used for query parsing (e.g., 'gte', 'lte', 'neq', 'eq')
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
 * Converts a wildcard pattern containing `*` and `?` into an equivalent regular expression string.
 *
 * Escapes all regex special characters except `*` and `?`, then replaces `*` with `.*` and `?` with `.`.
 *
 * @param pattern - The wildcard pattern to convert
 * @returns The corresponding regular expression string
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
 * @param operator - The operator whose complexity is to be evaluated
 * @returns A numeric score representing the relative complexity of the operator
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
 * Reorders query components by operator complexity and reconstructs an optimized query string.
 *
 * Components with simpler operators are placed first to improve search performance. Logical operators and field-value formatting are preserved in the output string.
 *
 * @param components - The array of query components to optimize
 * @returns The optimized query string with components ordered by ascending complexity
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
      ? component.operator === 'range' 
        ? `[${component.value.join(' TO ')}]`
        : component.value.join(',')
      : component.value;
    
    return `${logical}${field}${value}`;
  }).join(' ').trim();
}

const DEFAULT_MAX_COMPLEXITY = 10;

/**
 * Validates the syntax and complexity of a search query.
 *
 * Checks for empty queries, enforces a maximum complexity threshold, and validates regex patterns within the query. Returns an object indicating whether the query is valid and an array of error messages if any issues are found.
 *
 * @param query - The search query string to validate
 * @param maxComplexity - The maximum allowed complexity score for the query (default is 10)
 * @returns An object with a boolean `valid` flag and an array of `errors` describing any validation failures
 */
export function validateSearchQuery(
  query: string, 
  maxComplexity: number = DEFAULT_MAX_COMPLEXITY
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const parsed = parseSearchQuery(query);
    
    // Check for empty query
    if (!query.trim()) {
      errors.push('Query cannot be empty');
    }
    
    // Check complexity limit
    if (parsed.complexity > maxComplexity) {
      errors.push(`Query too complex (${parsed.complexity}). Maximum complexity is ${maxComplexity}.`);
    }
    
    // Check for unsupported operators
    for (const component of parsed.components) {
      if (component.operator === 'regex' && typeof component.value === 'string') {
        try {
          const regex = new RegExp(component.value);
          // Test if the regex is valid by using it
          regex.test('');
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
 * Constructs a `SearchOptions` object by combining filters from a parsed query with any additional options provided.
 *
 * @param parsedQuery - The parsed query containing filters to apply
 * @param additionalOptions - Optional additional search options to merge
 * @returns The combined search options object
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
 * Parses the input query and generates an optimized query string; if optimization is not possible, returns the original query.
 *
 * @param query - The raw search query string to format
 * @returns The optimized query string suitable for API consumption
 */
export function formatQueryForAPI(query: string): string {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return '';
  }
  
  const validation = validateSearchQuery(query);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }
  
  const parsed = parseSearchQuery(query);
  return parsed.optimized || query;
}