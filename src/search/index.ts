/**
 * Advanced search utilities for Firewalla MCP Server
 * Implements complex query parsing and search optimization
 */

import { SearchFilter, SearchOptions } from '../types.js';

/**
 * Smart comma splitting that respects quoted values
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
 * Parse complex search query into structured components
 * Supports syntax like: severity:high AND source_ip:192.168.* NOT resolved:true
 * 
 * @param query - Raw query string
 * @returns Parsed query components and filters
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
 * Parse individual field expression (e.g., severity:high, ip:192.168.*, bytes:[1000 TO 5000])
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
 * Parse string value to appropriate type
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
 * Map comparison operator symbols to internal operators
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
 * Convert wildcard pattern to regex
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
 * Get complexity score for operator
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
 * Optimize query by reordering components for performance
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
      ? (component.value.length === 2 ? `[${component.value.join(' TO ')}]` : `[${component.value.filter(v => v !== null).join(' TO ')}]`)
      : component.value;
    
    return `${logical}${field}${value}`;
  }).join(' ').trim();
}

const DEFAULT_MAX_COMPLEXITY = 10;

/**
 * Validate search query syntax
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
 * Build search options from parsed query and additional parameters
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
 * Format search query for API consumption
 */
export function formatQueryForAPI(query: string): string {
  const parsed = parseSearchQuery(query);
  return parsed.optimized || query;
}