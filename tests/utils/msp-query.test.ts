/**
 * toMspQuery translates the tools' query language into the MSP API grammar.
 * Measured 2026-09-26 on a live account: the API has no AND, OR, NOT or
 * parentheses (`status:blocked AND region:US` matched 0 flows where
 * `status:blocked region:US` matched 6,318, and bare `AND` matched 417
 * alarms as a word); a space ANDs terms on different fields, and a comma
 * list, or the same field repeated, ORs values of one field.
 */

import {
  MspQueryError,
  findMspQueryError,
  mspAnd,
  toMspQuery,
  withNotForMinus,
} from '../../src/utils/msp-query.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';

function refusal(query: string): MspQueryError {
  try {
    toMspQuery(query);
  } catch (error) {
    if (error instanceof MspQueryError) {
      return error;
    }
    throw error;
  }
  throw new Error(`toMspQuery accepted ${query}`);
}

describe('toMspQuery', () => {
  it.each([
    // AND, or no operator, is a space
    ['type:1 AND status:1', 'type:1 status:1'],
    [
      'status:blocked AND region:US AND protocol:tcp',
      'status:blocked region:US protocol:tcp',
    ],
    // OR between values of one field is a comma list
    ['region:US OR region:CN', 'region:US,CN'],
    ['type:1 OR type:10 OR type:1', 'type:1,10'],
    ['category:social OR category:games', 'category:social,games'],
    ['region:US,CN OR region:GB', 'region:US,CN,GB'],
    [
      'domain:*.facebook.com OR domain:*.instagram.com',
      'domain:*.facebook.com,*.instagram.com',
    ],
    // Parentheses group; AND distributes over a same-field OR
    [
      'status:blocked AND (region:US OR region:CN)',
      'status:blocked region:US,CN',
    ],
    ['(type:1 OR type:10) box.id:gid-1', 'type:1,10 box.id:gid-1'],
    [
      '(status:blocked AND region:US) OR (status:blocked AND region:CN)',
      'status:blocked region:US,CN',
    ],
    ['ts:1-2 AND ((type:1 OR type:10))', 'ts:1-2 type:1,10'],
    ['(region:US OR region:CN) AND region:US', 'region:US'],
    // NOT is the - prefix
    ['NOT protocol:tcp', '-protocol:tcp'],
    ['region:US AND NOT protocol:tcp', 'region:US -protocol:tcp'],
    ['NOT NOT protocol:tcp', 'protocol:tcp'],
    ['NOT -protocol:tcp', 'protocol:tcp'],
    ['action:block AND NOT status:paused', 'action:block -status:paused'],
    // De Morgan: NOT of an OR excludes each term
    ['NOT (region:US OR region:CN)', '-region:US -region:CN'],
    [
      'status:blocked NOT (region:US OR category:ad)',
      'status:blocked -region:US -category:ad',
    ],
    ['-(region:US OR region:CN)', '-region:US -region:CN'],
    // The API cannot exclude a numeric term: the comparison flips
    ['NOT total:>1MB', 'total:<=1MB'],
    ['-ts:>=1700000000', 'ts:<1700000000'],
    // A lower and an upper bound on one field are one range
    ['ts:>=1700000000 AND ts:<=1700086400', 'ts:1700000000-1700086400'],
    ['total:<=50MB total:>=1MB', 'total:1MB-50MB'],
    // Quoted values, wildcards, ranges and comparisons are left alone
    ['name:"living room" AND status:1', 'name:"living room" status:1'],
    ['box.name:"Gold Plus",Purple', 'box.name:"Gold Plus",Purple'],
    [
      'box.name:"Firewalla,GSE" OR box.name:Purple',
      'box.name:"Firewalla,GSE",Purple',
    ],
    ['device.name:"a AND (b)"', 'device.name:"a AND (b)"'],
    [
      'ts:1695196894.395-1695604487.633 AND total:1MB-50MB',
      'ts:1695196894.395-1695604487.633 total:1MB-50MB',
    ],
    ['total:>1MB AND ts:>=2026-09-01', 'total:>1MB ts:>=2026-09-01'],
    [
      'mac:AA:BB:CC:DD:EE:FF AND device.ip:fe80::1',
      'mac:AA:BB:CC:DD:EE:FF device.ip:fe80::1',
    ],
    // Lowercase and/or/not are words, as the API reads them
    ['type:1 and status:1', 'type:1 and status:1'],
    ['region:US or protocol:tcp', 'region:US or protocol:tcp'],
    ['not porn', 'not porn'],
    // Free text passes through
    ['porn', 'porn'],
    ['porn AND status:1', 'porn status:1'],
    ['"exact phrase" type:1', '"exact phrase" type:1'],
    // Whitespace
    ['  type:1\tAND\nstatus:1  ', 'type:1 status:1'],
    ['', ''],
    ['   ', ''],
  ])('%s -> %s', (query, expected) => {
    expect(toMspQuery(query)).toBe(expected);
  });

  it.each([
    'status:blocked region:US',
    'type:1,10 status:1 box.id:00000000-0000-0000-0000-000000000000',
    'region:US -protocol:tcp',
    '-region:US,CN category:social',
    'ts:1700000000-1700086400 status:blocked',
    'total:>1MB -status:blocked',
    'box.name:"Gold Plus",Purple mac:"AA:BB:CC:DD:EE:FF" Total:>50MB',
    'porn',
    'type:1 or',
  ])('leaves the API form %s unchanged', query => {
    expect(toMspQuery(query)).toBe(query);
  });

  it.each([
    'status:blocked AND (region:US OR region:CN)',
    'NOT (region:US OR region:CN) AND type:1',
    '(status:blocked AND region:US) OR (status:blocked AND region:CN)',
    'ts:>=1 AND ts:<=2 AND NOT total:>1MB',
  ])('is idempotent on %s', query => {
    const once = toMspQuery(query);
    expect(toMspQuery(once)).toBe(once);
  });

  describe('refuses what the API cannot express', () => {
    it('an OR between different fields, with a search per field', () => {
      const error = refusal(
        'status:blocked AND (region:US OR category:social)'
      );
      expect(error.part).toBe('region:US OR category:social');
      expect(error.message).toContain('OR between different fields');
      expect(error.message).toContain('region:US,CN');
      expect(error.suggestions).toEqual([
        'status:blocked region:US',
        'status:blocked category:social',
      ]);
    });

    it('an OR between different fields left after distributing', () => {
      const error = refusal('(type:1 AND status:1) OR (type:10 AND status:2)');
      expect(error.message).toContain('OR between different fields');
    });

    it('NOT over an AND', () => {
      const error = refusal('NOT (action:block AND status:paused)');
      expect(error.part).toBe('NOT (action:block AND status:paused)');
      expect(error.message).toContain('single field values');
    });

    it('an OR with an excluded term', () => {
      expect(refusal('region:US OR NOT protocol:tcp').message).toContain(
        'excluded term'
      );
    });

    it('an OR with free text', () => {
      expect(refusal('porn OR type:10').message).toContain('free text');
    });

    it('an OR between comparisons', () => {
      expect(refusal('total:>1MB OR total:<1KB').message).toContain(
        'comparisons or ranges'
      );
    });

    it('two values of one field that must both hold', () => {
      const error = refusal('type:1 AND type:10');
      expect(error.message).toContain('reads a field that appears twice as OR');
      expect(error.suggestions).toEqual(['type:1,10']);
      expect(refusal('type:1 type:10').part).toBe('type:1 AND type:10');
      // lowercase or is a word, so this repeats type as well
      expect(refusal('type:1 or type:10').suggestions).toEqual(['type:1,10']);
    });

    it('two lower bounds on one field', () => {
      expect(refusal('ts:>=1 ts:>=2').message).toContain('one range');
      // A range includes both ends, so strict bounds are not merged into one
      for (const strict of [
        'ts:>1 AND ts:<2',
        'ts:>=1 AND ts:<2',
        'ts:>1 AND ts:<=2',
      ]) {
        const error = refusal(strict);
        expect(error.message).toContain('strict bound');
        expect(error.suggestions).toEqual(['ts:1-2']);
      }
    });

    it.each([
      ['NOT porn', 'free text'],
      ['-porn', 'free text'],
      ['NOT domain:*ads*', 'wildcard'],
      ['-domain:*ads*', 'wildcard'],
      ['NOT total:1MB-5MB', 'range'],
    ])('the exclusion %s', (query, what) => {
      expect(refusal(query).message).toContain(what);
    });

    it.each([
      ['type:1 AND', 'ends with an operator'],
      ['OR type:1', 'no term before it'],
      ['(type:1 OR type:10', 'no ")"'],
      ['type:1)', 'no "("'],
      ['()', 'empty parentheses'],
      ['type:', 'no value'],
      ['type:1,', 'empty value'],
      ['total:>', 'no value'],
      ['name:"open', 'never closed'],
    ])('the malformed query %s', (query, detail) => {
      const error = refusal(query);
      expect(error.message).toContain('is malformed');
      expect(error.message).toContain(detail);
    });

    it('a query with too many OR combinations', () => {
      const query = Array.from(
        { length: 8 },
        (_v, i) => `(a${i}:1 AND b${i}:1)`
      ).join(' OR ');
      expect(refusal(query).message).toContain('combinations');
    });
  });
});

describe('mspAnd', () => {
  it('ANDs parts without letting an OR in one bind to another', () => {
    expect(mspAnd('type:1 OR type:10', 'status:1')).toBe('type:1,10 status:1');
    expect(mspAnd(undefined, '', 'status:blocked')).toBe('status:blocked');
    expect(mspAnd()).toBe('');
  });

  it('merges bounds and refuses a field repeated across parts', () => {
    expect(mspAnd('ts:>=1', 'ts:<=2')).toBe('ts:1-2');
    expect(() => mspAnd('ts:1-2', 'ts:3-4')).toThrow(MspQueryError);
  });
});

describe('withNotForMinus', () => {
  it.each([
    ['action:block -status:paused', 'action:block NOT status:paused'],
    ['-(region:US OR region:CN)', 'NOT (region:US OR region:CN)'],
    ['name:"a -b:c" -x:1', 'name:"a -b:c" NOT x:1'],
    ['ts:1-2 total:1MB-5MB', 'ts:1-2 total:1MB-5MB'],
  ])('%s -> %s', (query, expected) => {
    expect(withNotForMinus(query)).toBe(expected);
  });
});

describe('findMspQueryError', () => {
  it('finds the error behind cause and retry wrappers', () => {
    const original = new MspQueryError('x', 'q');
    const timeout = Object.assign(new Error('wrapped'), { cause: original });
    const retry = Object.assign(new Error('retried'), {
      retryContext: { originalError: timeout },
    });
    expect(findMspQueryError(retry)).toBe(original);
    expect(findMspQueryError(new Error('other'))).toBeUndefined();
  });
});

describe('validateFirewallaQuerySyntax accepts the API forms', () => {
  it.each([
    'status:blocked region:US',
    'region:US -protocol:tcp',
    '-(region:US OR region:CN) status:blocked',
    'NOT protocol:tcp',
    'porn',
    'porn video',
    '"exact phrase" type:1',
    'type:1 and status:1',
  ])('%s', query => {
    expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
  });

  it.each(['type:1 AND', 'OR type:1', '(type:1', '-1bad:1'])(
    'still refuses %s',
    query => {
      expect(validateFirewallaQuerySyntax(query).isValid).toBe(false);
    }
  );
});
