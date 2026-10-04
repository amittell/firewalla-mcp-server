/**
 * Firewalla-specific query syntax validation
 * Validates query syntax and provides helpful error messages
 *
 * Accepts the boolean operators (AND, OR, NOT, parentheses) and the MSP
 * API's own forms: terms separated by spaces, `-field:value` exclusions and
 * free-text words. src/utils/msp-query.ts translates the operators into the
 * API's grammar before a query is sent.
 */
import type { ValidationResult } from '../types.js';
/**
 * Validate Firewalla query syntax
 */
export declare function validateFirewallaQuerySyntax(query: string): ValidationResult;
/**
 * Get example queries for a specific entity type
 */
export declare function getExampleQueries(entityType: string): string[];
//# sourceMappingURL=query-validator.d.ts.map