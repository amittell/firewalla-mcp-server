/**
 * The search parser returns for every input, with an AST or errors[].
 * search_devices, search_target_lists and search_rules check every query
 * with it on the server's one thread, so a parse loop that never ends would
 * hang every client. A loop that stopped only because a failed term breaks
 * it was one grammar change from that, so each loop now stops when it reads
 * no token, and an implicit AND starts only on a token that can begin a
 * term.
 *
 * The parser runs in a vm context with a timeout, so a loop fails the test
 * with "Script execution timed out" instead of hanging jest.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';
import { queryParser } from '../../src/search/parser.js';

const TIMEOUT_MS = 2000;

/** src/search/parser.ts and its types, as CommonJS in a fresh vm context */
function parserInVm(): vm.Context {
  const compile = (file: string): string =>
    ts.transpileModule(
      readFileSync(path.join(process.cwd(), 'src', 'search', file), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      }
    ).outputText;
  const sources = {
    './types.js': compile('types.ts'),
    './parser.js': compile('parser.ts'),
  };
  const context = vm.createContext({});
  vm.runInContext(
    `const sources = ${JSON.stringify(sources)};
     const cache = {};
     function require(name) {
       if (cache[name]) return cache[name].exports;
       if (!(name in sources)) throw new Error('not in the vm: ' + name);
       const module = { exports: {} };
       cache[name] = module;
       new Function('require', 'module', 'exports', sources[name])(
         require, module, module.exports
       );
       return module.exports;
     }
     globalThis.parser = require('./parser.js').queryParser;`,
    context
  );
  return context;
}

const context = parserInVm();

/** The parse of `query`, or a thrown "Script execution timed out" */
function parseWithTimeout(query: string): {
  isValid: boolean;
  errors: string[];
  hasAst: boolean;
} {
  return JSON.parse(
    vm.runInContext(
      `(() => {
         const r = parser.parse(${JSON.stringify(query)}, 'devices');
         return JSON.stringify({ isValid: r.isValid, errors: r.errors, hasAst: !!r.ast });
       })()`,
      context,
      { timeout: TIMEOUT_MS }
    )
  );
}

/** A valid parse has an AST and no errors; an invalid one has errors */
function expectAnswered(query: string): void {
  const result = parseWithTimeout(query);
  if (result.isValid) {
    expect(result.errors).toEqual([]);
    expect(result.hasAst).toBe(true);
  } else {
    expect(result.errors.length).toBeGreaterThan(0);
  }
}

describe('the search parser always returns', () => {
  it.each([
    'nas :',
    'nas AND',
    'nas AND AND x',
    'name:nas :x',
    'nas )',
    'nas (',
    'a , b',
    ':',
    'AND',
    'OR',
    'NOT',
    'nas NOT',
    '-',
    'nas : :',
    '( :',
    'NOT :',
    ':: nas',
    'nas TO x',
    'nas [',
    'nas ]',
    '((((',
    '))))',
    'name:',
    'name:>',
    'ts:[1 TO',
  ])('%s', query => {
    expectAnswered(query);
  });

  it('refuses a token that cannot start a term instead of ANDing it', () => {
    expect(queryParser.parse('name:nas :x', 'devices').errors).toEqual([
      "Unexpected token ':' at position 9",
    ]);
    expect(queryParser.parse('nas ] x', 'devices').errors).toEqual([
      "Unexpected token ']' at position 4",
    ]);
  });

  it('reads TO outside [low TO high] as a word, not a stray keyword', () => {
    // go to school was refused: "Unexpected token 'TO' at position 3"
    for (const query of ['go to school', 'nas TO x']) {
      const parsed = queryParser.parse(query, 'devices');
      expect([query, parsed.errors]).toEqual([query, []]);
    }
  });

  it('still ANDs terms side by side, NOT included', () => {
    const parsed = queryParser.parse('nas NOT online:true', 'devices');
    expect(parsed.errors).toEqual([]);
    expect(parsed.ast).toEqual({
      type: 'logical',
      operator: 'AND',
      left: { type: 'text', value: 'nas' },
      right: {
        type: 'logical',
        operator: 'NOT',
        operand: {
          type: 'field',
          field: 'online',
          value: 'true',
          operator: '=',
        },
      },
    });
  });
});

describe('fuzz: short token sequences from the grammar', () => {
  // mulberry32, so every run tries the same sequences
  function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PIECES = [
    'nas',
    'name:nas',
    'online:true',
    'ip:10.*',
    'ip:192.168.1.0/24',
    'name:*lap*',
    'mac:aa:bb:cc:dd:ee:01',
    'target_count:>100',
    'ts:[1 TO 2]',
    'name:"a b"',
    '"quoted phrase"',
    'name:a,"b c"',
    'name:"open',
    '192.168',
    '*',
    ':',
    '>',
    '>=',
    '!=',
    ',',
    '[',
    ']',
    '(',
    ')',
    'AND',
    'OR',
    'NOT',
    'TO',
    'and',
    'or',
    'not',
    'to',
    "Alex's",
    "name:Alex's",
    "'single quoted'",
    "'open",
    '""',
    "5's",
    "1990's",
    "name:3d's",
    'bytes:100-200',
    'x',
  ];

  const next = random(0x5eed);
  const queries: string[] = [];
  for (let i = 0; i < 400; i++) {
    const length = 1 + Math.floor(next() * 6);
    const parts: string[] = [];
    for (let j = 0; j < length; j++) {
      parts.push(PIECES[Math.floor(next() * PIECES.length)]);
    }
    // Some pieces joined with no space, as a user may type them
    queries.push(parts.join(next() < 0.2 ? '' : ' '));
  }

  it('the seed gives 400 queries', () => {
    expect(queries).toHaveLength(400);
    expect(new Set(queries).size).toBeGreaterThan(350);
  });

  it('every one returns within the timeout, with an AST or errors', () => {
    for (const query of queries) {
      try {
        expectAnswered(query);
      } catch (error) {
        throw new Error(
          `${JSON.stringify(query)}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  });
});
