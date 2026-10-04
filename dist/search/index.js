/**
 * Advanced search utilities for Firewalla MCP Server
 * Implements complex query parsing and search optimization
 */
import { followsWordCharacter } from '../utils/word-characters.js';
/**
 * Whether the character at `i` of `text` opens or closes a quote: a double
 * quote, or a single quote that does not follow a letter, digit, combining
 * mark or underscore (in Nora's it is an apostrophe, as the search parser
 * reads it), unless escaped; inside a quote, only the quote that opened it
 * closes it
 */
function opensOrClosesQuote(text, i, inQuotes, quoteChar) {
    const char = text[i];
    if (i > 0 && text[i - 1] === '\\') {
        return false;
    }
    if (inQuotes) {
        return char === quoteChar;
    }
    return char === '"' || (char === "'" && !followsWordCharacter(text, i));
}
/**
 * Splits a string by commas while preserving quoted substrings as single segments.
 *
 * Commas inside single or double quotes are ignored as split points. Leading and trailing whitespace is trimmed from each resulting segment.
 *
 * @param value - The input string to split
 * @returns An array of substrings split by commas, with quoted sections kept intact
 */
function smartSplitCommas(value) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (opensOrClosesQuote(value, i, inQuotes, quoteChar)) {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else {
                inQuotes = false;
                quoteChar = '';
            }
        }
        if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim()) {
        result.push(current.trim());
    }
    return result;
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
function smartSplitLogicalOperators(query) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let i = 0;
    while (i < query.length) {
        const char = query[i];
        // Handle quote state
        if (opensOrClosesQuote(query, i, inQuotes, quoteChar)) {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else {
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
        // Uppercase only, as toMspQuery and the search parser read them: and,
        // or and not are words (a or b or c or d was read as four terms)
        const logicalMatch = remaining.match(/^\s+(AND|OR|NOT)\s+/);
        if (logicalMatch) {
            // Add current token if not empty
            if (current.trim()) {
                result.push(current.trim());
                current = '';
            }
            // Add the logical operator
            result.push(logicalMatch[1]);
            // Skip past the matched logical operator and whitespace
            i += logicalMatch[0].length;
        }
        else {
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
export function parseSearchQuery(query) {
    const components = [];
    const filters = [];
    // Complexity scoring system:
    // - Base complexity: 1
    // - Logical operators (AND, OR, NOT): +0.5 each
    // - Field operators: +1 to +3 based on computational cost
    //   * Simple equality/inequality: +1
    //   * Comparisons: +1.2
    //   * Array membership: +1.5
    //   * Pattern matching (wildcards): +2
    //   * Range queries: +2.5
    //   * Full-text search: +3
    // - Final score used to optimize query execution order and resource allocation
    let complexity = 1;
    // Remove extra whitespace and normalize
    const normalized = query.trim().replace(/\s+/g, ' ');
    // Split by logical operators while preserving them and respecting quotes
    const tokens = smartSplitLogicalOperators(normalized);
    let currentLogical;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]?.trim();
        if (!token) {
            continue;
        }
        // Check if token is a logical operator
        if (/^(AND|OR|NOT)$/.test(token)) {
            currentLogical = token;
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
                    value: component.value,
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
        complexity: Math.round(complexity * 100) / 100,
    };
}
/**
 * Parses a single field expression from a search query into a structured QueryComponent.
 *
 * Supports range queries (e.g., `field:[min TO max]`), comparison operators (e.g., `field:>=value`), wildcards (kept as written), arrays (comma-separated values with quoted value support), standard equality, and free-text search when no field is specified.
 *
 * @param expression - The field expression string to parse
 * @returns The parsed QueryComponent, or null if parsing fails
 */
function parseFieldExpression(expression) {
    // Handle parentheses (basic support)
    const cleaned = expression.replace(/[()]/g, '').trim();
    // Range syntax: field:[min TO max]
    const rangeMatch = cleaned.match(/^(\w+):\[(.+?)\s+TO\s+(.+?)\]$/i);
    if (rangeMatch) {
        const [, field, min, max] = rangeMatch;
        return {
            field,
            operator: 'range',
            value: [parseValue(min), parseValue(max)],
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
            value: parseValue(value),
        };
    }
    // Standard field:value syntax
    const fieldMatch = cleaned.match(/^(\w+):(.+)$/);
    if (fieldMatch) {
        const [, field, value] = fieldMatch;
        // Detect wildcards. The pattern is kept as written: the searches
        // match it with matchesWildcard (src/utils/wildcard.ts), and it was
        // turned into a regular expression only to be checked here, which
        // refused four or more wildcards and a + beside a *.
        if (value.includes('*') || value.includes('?')) {
            // A comma list of wildcards (name:*nas*,*cam*) is any of its values
            const listValues = smartSplitCommas(value).filter(Boolean);
            if (listValues.length > 1) {
                return { field, operator: 'in', value: listValues };
            }
            return { field, operator: 'wildcard', value };
        }
        // Detect array values (comma-separated), but handle commas within quotes
        if (value.includes(',')) {
            const arrayValues = smartSplitCommas(value);
            return {
                field,
                operator: 'in',
                value: arrayValues
                    .map(v => parseValue(v.trim()))
                    .filter(v => v !== null),
            };
        }
        return {
            field,
            operator: 'eq',
            value: parseValue(value),
        };
    }
    // Free-text search (no field specified)
    return {
        operator: 'contains',
        value: cleaned,
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
function parseValue(value) {
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
function mapComparisonOperator(op) {
    switch (op) {
        case '>=':
            return 'gte';
        case '<=':
            return 'lte';
        case '>':
            return 'gt';
        case '<':
            return 'lt';
        case '!=':
            return 'neq';
        case '=':
            return 'eq';
        default:
            return 'eq';
    }
}
/**
 * Returns the complexity score associated with a given query operator.
 *
 * The complexity scoring system helps optimize query execution and resource allocation:
 *
 * **Score Ranges:**
 * - 1.0-1.2: Simple operations (equality, comparison)
 * - 1.3-1.9: Moderate operations (array membership, basic filters)
 * - 2.0-2.9: Complex operations (pattern matching, wildcards, ranges)
 * - 3.0+: Very complex operations (full-text search, advanced algorithms)
 *
 * **Usage:**
 * - Scores are summed across all query components
 * - Higher complexity queries may be subject to additional validation
 * - Query optimization reorders components by ascending complexity
 * - Resource allocation is adjusted based on total complexity score
 *
 * @param operator - The operator whose complexity is to be evaluated
 * @returns A numeric score representing the relative complexity of the operator
 */
function getOperatorComplexity(operator) {
    switch (operator) {
        case 'eq':
        case 'neq':
            return 1;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return 1.2;
        case 'in':
        case 'nin':
            return 1.5;
        case 'contains':
        case 'startswith':
        case 'endswith':
            return 2;
        case 'wildcard':
            return 3;
        case 'range':
            return 2.5;
        default:
            return 1;
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
function optimizeQuery(components) {
    // Sort components by complexity (simpler first)
    const sorted = [...components].sort((a, b) => {
        const aComplexity = getOperatorComplexity(a.operator);
        const bComplexity = getOperatorComplexity(b.operator);
        return aComplexity - bComplexity;
    });
    // Rebuild optimized query string
    return sorted
        .map(component => {
        const logical = component.logical ? `${component.logical} ` : '';
        const field = component.field ? `${component.field}:` : '';
        const value = Array.isArray(component.value)
            ? component.operator === 'range'
                ? `[${component.value.join(' TO ')}]`
                : component.value.join(',')
            : component.value;
        return `${logical}${field}${value}`;
    })
        .join(' ')
        .trim();
}
/**
 * Returns an optimized version of the search query string for API use.
 *
 * Parses the input query and generates an optimized query string; if optimization is not possible, returns the original query.
 *
 * @param query - The raw search query string to format
 * @returns The optimized query string suitable for API consumption
 */
export function formatQueryForAPI(query) {
    if (!query || typeof query !== 'string' || !query.trim()) {
        return '';
    }
    // No complexity score check here: the search tools hold every query to
    // the same limits first (queryComplexityErrors). This one, a score over
    // 10, ran for search_devices alone, so it refused name:a OR name:b ...
    // OR name:g as "Query too complex (11)" where the other tools took it.
    const parsed = parseSearchQuery(query);
    return parsed.optimized || query;
}
//# sourceMappingURL=index.js.map