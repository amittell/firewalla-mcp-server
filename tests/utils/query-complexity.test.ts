/**
 * queryComplexityErrors: which complexity limit a query goes over, each
 * message naming the limit, the count and the maximum, counted outside
 * quoted values. There is no wildcard limit.
 */

import { queryComplexityErrors } from '../../src/utils/query-structure.js';

const OVER = {
  operators: `x${' OR x'.repeat(21)}`,
  terms: Array.from({ length: 16 }, (_, i) => `x${i}:1`).join(' '),
  ranges: Array.from({ length: 6 }, () => 'ts:[1 TO 2]').join(' '),
};

describe('queryComplexityErrors', () => {
  it.each([
    [OVER.operators, ['Too many logical operators: 21 (at most 20)']],
    [OVER.terms, ['Too many field terms: 16 (at most 15)']],
    [OVER.ranges, ['Too many ranges: 6 (at most 5)']],
    // An operator right after a quoted value counts
    [
      `"a"${'OR "b"'.repeat(21)}`,
      ['Too many logical operators: 21 (at most 20)'],
    ],
    // Every operator the syntax check takes after a field makes a term
    [
      Array.from({ length: 16 }, () => 'blocked=true').join(' '),
      ['Too many field terms: 16 (at most 15)'],
    ],
    [
      Array.from(
        { length: 16 },
        (_, i) =>
          ['x!=1', 'x>=1', 'x<=1', 'x>1', 'x<1', '-x=1', 'x:>1', 'x:1'][i % 8]
      ).join(' '),
      ['Too many field terms: 16 (at most 15)'],
    ],
  ])('names the limit %s goes over', (query, errors) => {
    expect(queryComplexityErrors(query)).toEqual(errors);
  });

  it.each([
    // At the limits
    `x${' OR x'.repeat(20)}`,
    Array.from({ length: 15 }, (_, i) => `x${i}:1`).join(' '),
    Array.from({ length: 5 }, () => 'ts:[1 TO 2]').join(' '),
    // Operators in quotes are a phrase; lowercase and and or are words
    `"x${' OR x'.repeat(30)}"`,
    `x${' or x and x'.repeat(15)}`,
    // A MAC value is one term: it was counted as three
    Array.from({ length: 15 }, () => 'mac:AA:BB:CC:DD:EE:FF').join(' '),
    Array.from({ length: 15 }, () => 'blocked=true').join(' '),
    `"a"${'OR "b"'.repeat(20)}`,
    // An exclamation mark alone is not an operator
    Array.from({ length: 16 }, () => 'hello!').join(' '),
    // No wildcard limit
    `name:${'*a'.repeat(900)}*`,
  ])('takes %s', query => {
    expect(queryComplexityErrors(query)).toEqual([]);
  });
});
