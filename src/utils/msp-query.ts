/**
 * Translates the query language the tools accept into the grammar of the
 * MSP API's `query` parameter on /v2/alarms, /v2/flows and /v2/rules.
 *
 * The API grammar, measured 2026-09-26 (docs/firewalla-api-reference.md,
 * "Measured Query Behavior"): terms are separated by spaces; terms on
 * different fields must all match; the same field repeated, or a comma list
 * `field:a,b`, matches either value; `-field:value` excludes; a word without
 * a qualifier is free text. `AND`, `OR` and `NOT` are not operators: the API
 * searches them as words (`status:blocked AND region:US` matched 0 flows and
 * `status:blocked region:US` 6,318). Parentheses match nothing. The API has
 * no OR between different fields.
 *
 * The tools accept uppercase `AND`, `OR` and `NOT` (NOT binds tightest, then
 * AND, then OR; terms with no operator between them are ANDed), parentheses,
 * and the API's own forms. toMspQuery rewrites a query into one conjunction
 * the API can run:
 * - AND, or no operator, between terms: a space
 * - OR between values of one field: a comma list (`region:US OR region:CN`
 *   is sent as `region:US,CN`), also where AND distributes over it
 * - NOT of a term: the `-` prefix; NOT of a comparison: the opposite
 *   comparison (`NOT total:>1MB` is sent as `total:<=1MB`, since the API
 *   cannot exclude numeric terms); NOT of an OR: each term excluded
 * - a lower and an upper bound on one field: one range (`ts:>=a ts:<=b` is
 *   sent as `ts:a-b`; a range includes its ends)
 * A query that needs an OR between different fields, NOT over an AND, the
 * exclusion of free text, a wildcard or a range, or two other conditions on
 * one field (the API would read them as OR) has no API form: MspQueryError
 * names the part and says what to send instead. Lowercase `and`, `or` and
 * `not` are words, as the API reads them. A query already in API form
 * comes back unchanged.
 */

/** A query, or part of one, that the MSP API cannot run */
export class MspQueryError extends Error {
  /** The query as the caller gave it */
  readonly query: string;
  /** The part of the query that has no API form */
  readonly part?: string;
  /** Queries the API can run instead, when there are some */
  readonly suggestions: string[];

  constructor(
    message: string,
    query: string,
    part?: string,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'MspQueryError';
    this.query = query;
    this.part = part;
    this.suggestions = suggestions;
  }
}

/**
 * The MspQueryError behind an error, through the wrappers that keep the
 * original as `cause` (withToolTimeout) or `retryContext.originalError`
 * (withRetryAndTimeout)
 */
export function findMspQueryError(error: unknown): MspQueryError | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof MspQueryError) {
      return current;
    }
    const wrapper = current as {
      cause?: unknown;
      retryContext?: { originalError?: unknown };
    };
    current = wrapper.cause ?? wrapper.retryContext?.originalError;
  }
  return undefined;
}

type Kind = 'exact' | 'wildcard' | 'comparison' | 'range' | 'text';

/** One term of a query in API form */
export interface MspTerm {
  readonly negated: boolean;
  /** The qualifier as written; empty for free text */
  readonly field: string;
  /**
   * exact and wildcard: the values of the comma list, as written (quotes
   * kept); comparison: one value with its operator (`>=10MB`); range: one
   * `low-high`; text: the word
   */
  readonly values: readonly string[];
  readonly kind: Kind;
}

interface Literal {
  negated: boolean;
  /** The qualifier as written; empty for free text */
  field: string;
  /**
   * exact and wildcard: the values of the comma list, as written (quotes
   * kept); comparison: one value with its operator (`>=10MB`); range: one
   * `low-high`; text: the word
   */
  values: string[];
  kind: Kind;
}

type Node =
  | { type: 'term'; literal: Literal }
  | { type: 'and' | 'or'; items: Node[] }
  | { type: 'not'; item: Node };

interface Token {
  kind: 'open' | 'close' | 'word';
  text: string;
}

/** A disjunction of literals; a query becomes a conjunction of clauses */
type Clause = Literal[];

/** OR terms a query may expand to before it is refused as too complex */
const MAX_CLAUSES = 64;

// A number with an optional data unit, as the API grammar gives them
const NUMBER = /^\d+(?:\.\d+)?(?:[KMGT]?B)?$/i;
const RANGE = /^\d+(?:\.\d+)?(?:[KMGT]?B)?-\d+(?:\.\d+)?(?:[KMGT]?B)?$/i;
const COMPARISON = /^(>=|<=|>|<)(.*)$/s;
const FIELD_TERM = /^([A-Za-z_][\w.]*):(.*)$/s;

const OPPOSITE: Record<string, string> = {
  '>': '<=',
  '>=': '<',
  '<': '>=',
  '<=': '>',
};

function cannotSend(query: string, reason: string): string {
  return `Query "${query}" cannot be sent to the MSP API: ${reason}`;
}

function malformed(query: string, detail: string): MspQueryError {
  return new MspQueryError(`Query "${query}" is malformed: ${detail}.`, query);
}

/**
 * Splits a query into parentheses and words. A word runs to the next space
 * or parenthesis outside double quotes, so `name:"living room"` and the
 * colons of `mac:AA:BB:CC:DD:EE:FF` stay in one word.
 */
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    const c = query[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ kind: c === '(' ? 'open' : 'close', text: c });
      i++;
      continue;
    }
    const start = i;
    while (i < query.length && !/[\s()]/.test(query[i])) {
      if (query[i] === '"') {
        let close = i + 1;
        while (close < query.length && query[close] !== '"') {
          close += query[close] === '\\' ? 2 : 1;
        }
        if (close >= query.length) {
          throw malformed(
            query,
            `${query.slice(start)} opens a quote that is never closed`
          );
        }
        i = close + 1;
      } else {
        i++;
      }
    }
    tokens.push({ kind: 'word', text: query.slice(start, i) });
  }
  return tokens;
}

/** The values of a comma list, split outside double quotes */
function splitList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted && c === '\\' && i + 1 < value.length) {
      current += c + value[++i];
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
    } else if (c === ',' && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

/** Whether a value has a `*` that is not escaped */
function hasWildcard(value: string): boolean {
  return /(^|[^\\])\*/.test(value);
}

function renderLiteral(literal: Literal): string {
  if (literal.kind === 'text') {
    return literal.values[0];
  }
  return `${literal.negated ? '-' : ''}${literal.field}:${literal.values.join(',')}`;
}

function render(node: Node): string {
  switch (node.type) {
    case 'term':
      return renderLiteral(node.literal);
    case 'not':
      return `NOT ${node.item.type === 'term' || node.item.type === 'not' ? render(node.item) : `(${render(node.item)})`}`;
    case 'and':
      return node.items
        .map(item => (item.type === 'or' ? `(${render(item)})` : render(item)))
        .join(' AND ');
    case 'or':
      return node.items.map(render).join(' OR ');
  }
}

/**
 * The literal that excludes what `literal` matches. The API's `-` prefix
 * applies to literal values only: its grammar has no exclusion of free
 * text, wildcards or numeric terms, so a comparison is flipped instead.
 */
function negateLiteral(literal: Literal, part: string, query: string): Literal {
  switch (literal.kind) {
    case 'text':
      throw new MspQueryError(
        cannotSend(
          query,
          `"${part}" excludes free text, and the API's - prefix excludes field values only (for example -status:blocked). Search without the exclusion, or exclude a field value.`
        ),
        query,
        part
      );
    case 'wildcard':
      throw new MspQueryError(
        cannotSend(
          query,
          `"${part}" excludes a wildcard match, and the API can exclude exact values only (for example -domain:ads.example.com). Exclude exact values, or search without the exclusion.`
        ),
        query,
        part
      );
    case 'range': {
      const [low, high] = literal.values[0].split('-');
      throw new MspQueryError(
        cannotSend(
          query,
          `"${part}" excludes a range, and the API cannot exclude one. Run two searches instead, one with ${literal.field}:<${low} and one with ${literal.field}:>${high}.`
        ),
        query,
        part,
        [`${literal.field}:<${low}`, `${literal.field}:>${high}`]
      );
    }
    case 'comparison': {
      const [, operator, value] = COMPARISON.exec(literal.values[0])!;
      return { ...literal, values: [`${OPPOSITE[operator]}${value}`] };
    }
    case 'exact':
      return { ...literal, negated: !literal.negated };
  }
}

/** One word of a query as a literal: `[-]field:value`, or free text */
function parseTerm(text: string, query: string): Literal {
  const negated = text.startsWith('-');
  const body = negated ? text.slice(1) : text;
  const match = FIELD_TERM.exec(body);
  if (!match) {
    const literal: Literal = {
      negated: false,
      field: '',
      values: [text],
      kind: 'text',
    };
    return negated ? negateLiteral(literal, text, query) : literal;
  }

  const [, field, value] = match;
  if (value === '') {
    throw malformed(query, `"${text}" has no value after the colon`);
  }
  let literal: Literal;
  const comparison = COMPARISON.exec(value);
  if (comparison) {
    if (comparison[2] === '') {
      throw malformed(query, `"${text}" has no value after ${comparison[1]}`);
    }
    literal = { negated: false, field, values: [value], kind: 'comparison' };
  } else if (RANGE.test(value)) {
    literal = { negated: false, field, values: [value], kind: 'range' };
  } else {
    const values = splitList(value);
    if (values.some(v => v === '')) {
      throw malformed(query, `"${text}" has an empty value in its list`);
    }
    literal = {
      negated: false,
      field,
      values,
      kind: values.some(hasWildcard) ? 'wildcard' : 'exact',
    };
  }
  return negated ? negateLiteral(literal, text, query) : literal;
}

/** Recursive descent over the tokens: OR, then AND, then NOT, then terms */
class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly query: string
  ) {}

  parse(): Node | undefined {
    if (this.tokens.length === 0) {
      return undefined;
    }
    const node = this.parseOr();
    if (this.position < this.tokens.length) {
      throw malformed(this.query, 'it has a ")" with no "(" before it');
    }
    return node;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private isOperator(token: Token | undefined, name: string): boolean {
    return token?.kind === 'word' && token.text === name;
  }

  private parseOr(): Node {
    const items = [this.parseAnd()];
    while (this.isOperator(this.peek(), 'OR')) {
      this.position++;
      items.push(this.parseAnd());
    }
    return items.length === 1 ? items[0] : { type: 'or', items };
  }

  private parseAnd(): Node {
    const items = [this.parseUnary()];
    for (;;) {
      const token = this.peek();
      if (!token || token.kind === 'close' || this.isOperator(token, 'OR')) {
        break;
      }
      if (this.isOperator(token, 'AND')) {
        this.position++;
      }
      items.push(this.parseUnary());
    }
    return items.length === 1 ? items[0] : { type: 'and', items };
  }

  private parseUnary(): Node {
    const token = this.peek();
    // `-(...)` excludes a group, like NOT
    const minusGroup =
      token?.kind === 'word' &&
      token.text === '-' &&
      this.peek(1)?.kind === 'open';
    if (this.isOperator(token, 'NOT') || minusGroup) {
      this.position++;
      return { type: 'not', item: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.peek();
    if (!token) {
      throw malformed(this.query, 'it ends with an operator and no term');
    }
    if (token.kind === 'close') {
      throw malformed(this.query, 'a term is missing before ")"');
    }
    if (token.kind === 'open') {
      this.position++;
      if (this.peek()?.kind === 'close') {
        throw malformed(this.query, 'it has empty parentheses');
      }
      const node = this.parseOr();
      if (this.peek()?.kind !== 'close') {
        throw malformed(this.query, 'it has a "(" with no ")" after it');
      }
      this.position++;
      return node;
    }
    if (this.isOperator(token, 'AND') || this.isOperator(token, 'OR')) {
      throw malformed(this.query, `${token.text} has no term before it`);
    }
    this.position++;
    return { type: 'term', literal: parseTerm(token.text, this.query) };
  }
}

/** Pushes NOT down to the terms (negation normal form) */
function toNnf(node: Node, negate: boolean, query: string): Node {
  switch (node.type) {
    case 'term':
      return negate
        ? {
            type: 'term',
            literal: negateLiteral(node.literal, `NOT ${render(node)}`, query),
          }
        : node;
    case 'not':
      return toNnf(node.item, !negate, query);
    case 'and':
      if (negate) {
        const part = `NOT (${render(node)})`;
        throw new MspQueryError(
          cannotSend(
            query,
            `"${part}" excludes a combination of conditions, and the API can exclude single field values only (-field:value, each of which must hold). Exclude single values instead, or search without the exclusion.`
          ),
          query,
          part
        );
      }
      return {
        type: 'and',
        items: node.items.map(i => toNnf(i, false, query)),
      };
    case 'or':
      return {
        type: negate ? 'and' : 'or',
        items: node.items.map(i => toNnf(i, negate, query)),
      };
  }
}

function literalKey(literal: Literal): string {
  return [
    literal.negated ? '-' : '',
    literal.field.toLowerCase(),
    literal.kind,
    literal.values.join(','),
  ].join('\u0000');
}

/**
 * Drops repeated literals within a clause, and clauses another clause
 * implies: (a OR b) AND a is a.
 */
function simplify(clauses: Clause[]): Clause[] {
  const unique = clauses.map(clause => {
    const seen = new Set<string>();
    return clause.filter(literal => {
      const key = literalKey(literal);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });
  const keys = unique.map(clause => new Set(clause.map(literalKey)));
  return unique.filter((_clause, i) =>
    keys.every((other, j) => {
      if (j === i || other.size > keys[i].size) {
        return true;
      }
      const subset = [...other].every(key => keys[i].has(key));
      // Of two equal clauses, the first is kept
      return !subset || (other.size === keys[i].size && j > i);
    })
  );
}

/** The query as a conjunction of clauses (conjunctive normal form) */
function toCnf(node: Node, query: string): Clause[] {
  switch (node.type) {
    case 'term': {
      const { literal } = node;
      // A comma list is an OR of its values
      if (
        !literal.negated &&
        (literal.kind === 'exact' || literal.kind === 'wildcard') &&
        literal.values.length > 1
      ) {
        return [
          literal.values.map(value => ({
            ...literal,
            values: [value],
            kind: hasWildcard(value) ? 'wildcard' : 'exact',
          })),
        ];
      }
      return [[literal]];
    }
    case 'and':
      return simplify(node.items.flatMap(item => toCnf(item, query)));
    case 'or': {
      let result = toCnf(node.items[0], query);
      for (const item of node.items.slice(1)) {
        const right = toCnf(item, query);
        const product: Clause[] = [];
        for (const left of result) {
          for (const other of right) {
            product.push([...left, ...other]);
          }
        }
        result = simplify(product);
        if (result.length > MAX_CLAUSES) {
          throw new MspQueryError(
            `Query "${query}" expands to more than ${MAX_CLAUSES} combinations of its OR terms; simplify it or split it into several searches.`,
            query
          );
        }
      }
      return result;
    }
    case 'not':
      // toNnf leaves no NOT above a term
      throw new Error('toCnf: NOT left in the query tree');
  }
}

function sameField(literals: Literal[]): boolean {
  const field = literals[0].field.toLowerCase();
  return literals.every(literal => literal.field.toLowerCase() === field);
}

/** One comma-list literal for an OR of exact or wildcard values of a field */
function mergeClause(clause: Clause): Literal {
  const values = [...new Set(clause.flatMap(literal => literal.values))];
  return {
    negated: false,
    field: clause[0].field,
    values,
    kind: values.some(hasWildcard) ? 'wildcard' : 'exact',
  };
}

/** Why an OR clause has no API form, or undefined when it has one */
function clauseProblem(
  clause: Clause
): 'exclusion' | 'text' | 'fields' | 'numeric' | undefined {
  if (clause.length === 1) {
    return undefined;
  }
  if (clause.some(literal => literal.negated)) {
    return 'exclusion';
  }
  if (clause.some(literal => literal.kind === 'text')) {
    return 'text';
  }
  if (!sameField(clause)) {
    return 'fields';
  }
  if (
    clause.some(
      literal => literal.kind === 'comparison' || literal.kind === 'range'
    )
  ) {
    return 'numeric';
  }
  return undefined;
}

function renderClause(clause: Clause): string {
  return clause.length === 1 || clauseProblem(clause)
    ? clause.map(renderLiteral).join(' OR ')
    : renderLiteral(mergeClause(clause));
}

function clauseError(
  clauses: Clause[],
  index: number,
  problem: NonNullable<ReturnType<typeof clauseProblem>>,
  query: string
): MspQueryError {
  const clause = clauses[index];
  const part = clause.map(renderLiteral).join(' OR ');
  switch (problem) {
    case 'fields': {
      // One search per field, each with the rest of the query
      const rest = clauses
        .filter((other, j) => j !== index && !clauseProblem(other))
        .map(renderClause);
      const groups = new Map<string, Clause>();
      for (const literal of clause) {
        const key = literal.field.toLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), literal]);
      }
      const suggestions = [...groups.values()].map(group =>
        [...rest, renderClause(group)].join(' ')
      );
      const fields = [...groups.values()].map(group => group[0].field);
      return new MspQueryError(
        cannotSend(
          query,
          `"${part}" is an OR between different fields (${fields.join(', ')}), and the API has no OR between fields: terms on different fields must all match, and OR works only between values of one field (region:US OR region:CN is sent as region:US,CN). Run one search per field instead: ${suggestions.map(s => `"${s}"`).join(', ')}.`
        ),
        query,
        part,
        suggestions
      );
    }
    case 'exclusion':
      return new MspQueryError(
        cannotSend(
          query,
          `"${part}" is an OR that includes an excluded term, and the API cannot express it: OR works only between values of one field, and every exclusion (-field:value) must hold. Run one search per side of the OR.`
        ),
        query,
        part
      );
    case 'text':
      return new MspQueryError(
        cannotSend(
          query,
          `"${part}" is an OR with free text, and the API cannot express it: every free-text word and every field term must match. Run one search per side of the OR.`
        ),
        query,
        part
      );
    case 'numeric':
      return new MspQueryError(
        cannotSend(
          query,
          `"${part}" is an OR between comparisons or ranges, and the API's comma list takes exact or wildcard values only. Run one search per condition.`
        ),
        query,
        part
      );
  }
}

/** A lower and an upper bound on one field as one range, when they are */
function boundsToRange(a: Literal, b: Literal): Literal | undefined {
  if (a.kind !== 'comparison' || b.kind !== 'comparison') {
    return undefined;
  }
  const [, opA, valueA] = COMPARISON.exec(a.values[0])!;
  const [, opB, valueB] = COMPARISON.exec(b.values[0])!;
  if (!NUMBER.test(valueA) || !NUMBER.test(valueB)) {
    return undefined;
  }
  const lowerA = opA.startsWith('>');
  if (lowerA === opB.startsWith('>')) {
    return undefined;
  }
  const [low, high] = lowerA ? [valueA, valueB] : [valueB, valueA];
  return {
    negated: false,
    field: a.field,
    values: [`${low}-${high}`],
    kind: 'range',
  };
}

/**
 * The API reads a field that appears twice as OR, so two conditions on one
 * field become one range, or are refused
 */
function mergeRepeatedFields(conjuncts: Literal[], query: string): Literal[] {
  const result = [...conjuncts];
  const byField = new Map<string, number[]>();
  result.forEach((literal, i) => {
    if (!literal.negated && literal.kind !== 'text') {
      const key = literal.field.toLowerCase();
      byField.set(key, [...(byField.get(key) ?? []), i]);
    }
  });
  const dropped = new Set<number>();
  for (const indexes of byField.values()) {
    if (indexes.length < 2) {
      continue;
    }
    const [first, second] = indexes;
    const range =
      indexes.length === 2
        ? boundsToRange(result[first], result[second])
        : undefined;
    if (range) {
      result[first] = range;
      dropped.add(second);
      continue;
    }
    const a = result[first];
    const b = result[second];
    const part = `${renderLiteral(a)} AND ${renderLiteral(b)}`;
    const exact = [a, b].every(
      literal => literal.kind === 'exact' || literal.kind === 'wildcard'
    );
    const hint = exact
      ? `For either value, send ${renderLiteral(mergeClause([a, b]))}.`
      : `For a span, send one range, ${a.field}:low-high.`;
    throw new MspQueryError(
      cannotSend(
        query,
        `"${part}" puts two conditions on ${a.field}, and the API reads a field that appears twice as OR (type:1 type:10 matches either type), so it cannot require both. ${hint}`
      ),
      query,
      part,
      exact ? [renderLiteral(mergeClause([a, b]))] : []
    );
  }
  return result.filter((_literal, i) => !dropped.has(i));
}

/** The terms of the conjunction a query translates to */
function translate(query: string): Literal[] {
  const trimmed = query.trim();
  const tree = new Parser(tokenize(trimmed), trimmed).parse();
  if (!tree) {
    return [];
  }
  const clauses = toCnf(toNnf(tree, false, trimmed), trimmed);
  const conjuncts = clauses.map((clause, index) => {
    const problem = clauseProblem(clause);
    if (problem) {
      throw clauseError(clauses, index, problem, trimmed);
    }
    return clause.length === 1 ? clause[0] : mergeClause(clause);
  });
  return mergeRepeatedFields(conjuncts, trimmed);
}

/**
 * Translates a query into the MSP API's grammar (see the file comment)
 *
 * @param query - Query in the tools' language or already in API form
 * @returns The query as one space-separated conjunction the API can run;
 *   empty for an empty query
 * @throws {MspQueryError} When the query is malformed or has no API form
 */
export function toMspQuery(query: string): string {
  if (typeof query !== 'string') {
    return query;
  }
  return translate(query).map(renderLiteral).join(' ');
}

/**
 * The terms of the query toMspQuery sends, every one of which must hold:
 * for checking a result against the whole query on the client
 *
 * @param query - Query in the tools' language or already in API form
 * @returns One term per space-separated part of toMspQuery(query)
 * @throws {MspQueryError} When the query is malformed or has no API form
 */
export function mspTerms(query: string): MspTerm[] {
  return typeof query === 'string' ? translate(query) : [];
}

/**
 * The conjunction of several queries in API form: each part is translated,
 * so an OR in one part cannot bind to a term of another
 *
 * @param parts - Queries to AND together; empty and undefined parts are
 *   skipped
 * @returns The combined query in API form; empty when every part is empty
 * @throws {MspQueryError} When a part, or the combination, has no API form
 */
export function mspAnd(...parts: Array<string | undefined>): string {
  return toMspQuery(
    parts
      .map(part => (typeof part === 'string' ? toMspQuery(part) : ''))
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * A query scoped to one box: the query in API form with `box.id:<gid>`.
 * The API reads two box.id terms as either box, so a query that names
 * another box (or a box.id wildcard) would widen the scope instead of
 * narrowing it, and is refused; naming the same box is allowed.
 *
 * @param query - Query in the tools' language or already in API form
 * @param gid - The box to scope to, already checked to be a gid
 * @returns The scoped query in API form
 * @throws {MspQueryError} When the query has no API form or names another box
 */
export function mspBoxScope(query: string | undefined, gid: string): string {
  const terms = translate(query ?? '');
  const scope: Literal = {
    negated: false,
    field: 'box.id',
    values: [gid],
    kind: 'exact',
  };
  // translate leaves at most one positive term per field
  const named = terms.find(
    term => !term.negated && term.field.toLowerCase() === 'box.id'
  );
  if (!named) {
    return [...terms, scope].map(renderLiteral).join(' ');
  }
  const names = named.values.map(value => value.replace(/^"(.*)"$/s, '$1'));
  if (named.kind === 'exact' && names.includes(gid)) {
    return [...terms.filter(term => term !== named), scope]
      .map(renderLiteral)
      .join(' ');
  }
  const trimmed = (query ?? '').trim();
  throw new MspQueryError(
    cannotSend(
      trimmed,
      `it names ${renderLiteral(named)}, but this request is scoped to box.id:${gid} (the box argument, else FIREWALLA_BOX_ID), and the API reads two box.id terms as either box. Leave box.id out of the query to search box ${gid}; searching another box needs a server without FIREWALLA_BOX_ID.`
    ),
    trimmed,
    renderLiteral(named),
    [
      terms
        .filter(term => term !== named)
        .map(renderLiteral)
        .join(' '),
    ].filter(Boolean)
  );
}

/**
 * A literal value for a `field:value` term, quoted when the API grammar
 * needs it: for whitespace, a comma, an asterisk or a colon (and here also
 * parentheses, quotes, backslashes and a leading comparison sign), with
 * quotes, backslashes and asterisks escaped inside the quotes
 *
 * @param value - The value to match literally
 * @returns The value as it goes after `field:`
 */
export function mspValue(value: string): string {
  const text = String(value);
  if (/^[^\s",*:()\\<>]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/["\\*]/g, '\\$&')}"`;
}

/**
 * The API's `-field:value` and `-(...)` exclusions written as NOT, for the
 * validators and parsers that know only the boolean operators. The query
 * sent to the API is not rewritten this way.
 */
export function withNotForMinus(query: string): string {
  if (!query || typeof query !== 'string') {
    return query;
  }
  return query
    .split(/("(?:[^"\\]|\\.)*")/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/(^|[\s(])-(?=[A-Za-z_][\w.]*:|\()/g, '$1NOT ')
    )
    .join('');
}
