/**
 * The read tools' optional `response_format` argument: `json` (the default)
 * returns a tool's compact JSON response unchanged, and `markdown` returns a
 * rendering of the same response for reading rather than parsing.
 *
 * It is handled once for every tool: src/server.ts adds the property to the
 * schema of each tool it lists with `readOnlyHint: true`, and the CallTool
 * dispatcher in src/tools/index.ts takes it out of the arguments before the
 * tool sees them and renders the tool's response afterwards. Error responses
 * stay JSON, whatever was asked for.
 *
 * The markdown is generic and deterministic. It has a heading with the tool
 * name and the number of records in each list, the response's fields as a
 * bullet list (nested objects as nested bullets), and a table for each list
 * of records: at most `maxRows` rows and MAX_COLUMNS columns, fields that
 * have one value in every row stated once above the table, and the fields
 * that are not columns named below it. A list with one record is shown as a
 * bullet list of its fields instead. A closing line says what the view
 * leaves out; `response_format: json` returns all of it.
 */

/** The values response_format takes */
export const RESPONSE_FORMATS = ['json', 'markdown'] as const;

export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** The schema property the read tools advertise */
export const RESPONSE_FORMAT_PROPERTY = {
  type: 'string',
  enum: [...RESPONSE_FORMATS],
  default: 'json',
  description:
    "Response format. 'json' (default): the compact JSON response. 'markdown': the same response as readable markdown, its fields as bullet lists and each list of records as a table of up to 8 columns and DEFAULT_PAGE_SIZE rows (default 100), ending with a line that says what the view leaves out. Errors are JSON either way.",
};

/** The fields of a listed tool this module reads */
interface ListedTool {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, unknown> };
}

/** Whether a listed tool takes response_format: every read-only tool does */
export function acceptsResponseFormat(tool: ListedTool): boolean {
  return tool.annotations?.readOnlyHint === true;
}

/**
 * The tool with response_format added to its input schema when it is a
 * read-only tool; any other tool is returned as it is.
 */
export function withResponseFormatProperty<T extends ListedTool>(tool: T): T {
  if (!acceptsResponseFormat(tool)) {
    return tool;
  }
  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...tool.inputSchema.properties,
        response_format: RESPONSE_FORMAT_PROPERTY,
      },
    },
  };
}

/**
 * The format a call asks for, and its arguments without response_format.
 * Arguments without the property come back as the same object. A value
 * other than json or markdown (in any case) is an error; null is the
 * default.
 */
export function takeResponseFormat(
  args: Record<string, unknown> | undefined
):
  | { format: ResponseFormat; args: Record<string, unknown> | undefined }
  | { error: string } {
  if (!args || !Object.prototype.hasOwnProperty.call(args, 'response_format')) {
    return { format: 'json', args };
  }
  const { response_format: value, ...rest } = args;
  if (value === undefined || value === null) {
    return { format: 'json', args: rest };
  }
  const format = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (format !== 'json' && format !== 'markdown') {
    return {
      error: `response_format must be 'json' or 'markdown', not ${JSON.stringify(value)}`,
    };
  }
  return { format, args: rest };
}

/** Options for the markdown rendering */
export interface MarkdownOptions {
  /** Most rows a table shows, and most items a bullet list shows */
  maxRows?: number;
}

/** Rows a table shows when no maxRows is given (DEFAULT_PAGE_SIZE's default) */
export const DEFAULT_MARKDOWN_ROWS = 100;
/** Most columns a table shows */
export const MAX_COLUMNS = 8;
/** Longest table cell, in characters, before it is cut */
export const MAX_CELL_CHARS = 120;
/** Items of a list shown in one table cell */
export const MAX_CELL_ITEMS = 3;
/** A list of scalars this short, of short items, stays on one bullet line */
const INLINE_LIST_ITEMS = 10;
const INLINE_ITEM_CHARS = 40;

/**
 * Columns placed first when present, in this order: what a record is, when,
 * where from, what happened, how much. Other columns follow in the order
 * the records first have them.
 */
const PREFERRED_COLUMNS = [
  'name',
  'device.name',
  'device_name',
  'id',
  'aid',
  'rule_id',
  'device_id',
  'box_id',
  'ts',
  'timestamp',
  'timestamp_iso',
  'last_seen',
  'created_at',
  'updated_at',
  'ip',
  'device.ip',
  'source_ip',
  'destination_ip',
  'mac',
  'online',
  'status',
  'action',
  'type',
  'target.type',
  'target.value',
  'target_type',
  'target_value',
  'message',
  'category',
  'domain',
  'protocol',
  'direction',
  'blocked',
  'country_code',
  'region',
  'count',
  'flow_count',
  'value',
  'total_bytes',
  'bytes',
];

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordList(value: unknown): value is JsonObject[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

/** A list of records found in the response, rendered as its own section */
interface Section {
  path: string;
  records: JsonObject[];
}

/** State of one rendering */
interface RenderState {
  maxRows: number;
  sections: Section[];
  /** "<path>: <n>" for each list of records, and each empty top-level list */
  counts: string[];
  /** Sections that show fewer rows than they have */
  cutRows: string[];
  /** Lists in bullets that show fewer items than they have */
  cutLists: string[];
  hiddenColumns: boolean;
  cutCells: boolean;
  cellLists: boolean;
}

/** Newlines as <br>, so a value stays on its bullet or table line */
function oneLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '<br>');
}

/** A value as bullet text */
function bulletText(value: unknown): string {
  if (value === '') {
    return '""';
  }
  if (typeof value === 'string') {
    return oneLine(value);
  }
  if (value === undefined) {
    return 'null';
  }
  if (typeof value === 'object' && value !== null) {
    return oneLine(JSON.stringify(value));
  }
  return String(value);
}

/** A value as table-cell text: one line, pipes escaped, long text cut */
function cellText(value: unknown, state: RenderState): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      text = '';
    } else if (value.some(item => typeof item === 'object' && item !== null)) {
      text = `${value.length} ${value.length === 1 ? 'record' : 'records'}`;
      state.cellLists = true;
    } else {
      text = value
        .slice(0, MAX_CELL_ITEMS)
        .map(item => String(item))
        .join(', ');
      if (value.length > MAX_CELL_ITEMS) {
        text += ` (+${value.length - MAX_CELL_ITEMS} more)`;
        state.cellLists = true;
      }
    }
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  const chars = Array.from(text);
  if (chars.length > MAX_CELL_CHARS) {
    text = `${chars.slice(0, MAX_CELL_CHARS - 1).join('')}…`;
    state.cutCells = true;
  }
  return escapeCell(text);
}

/** Table-cell text with pipes escaped and newlines as <br> */
export function escapeCell(text: string): string {
  return oneLine(text.replace(/\|/g, '\\|'));
}

/** A record's fields, nested objects flattened to dotted names */
function flatten(
  record: JsonObject,
  prefix = '',
  out: Map<string, unknown> = new Map()
): Map<string, unknown> {
  for (const [key, value] of Object.entries(record)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      flatten(value, name, out);
    } else {
      out.set(name, value);
    }
  }
  return out;
}

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Bullet lines for an object's fields; lists of records become sections */
function objectLines(
  object: JsonObject,
  depth: number,
  path: string[],
  state: RenderState
): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(object)) {
    const label = `${indent}- **${oneLine(key)}:**`;
    const here = [...path, key];
    if (isRecordList(value)) {
      const sectionPath = here.join('.');
      state.sections.push({ path: sectionPath, records: value });
      state.counts.push(`${sectionPath}: ${value.length}`);
      lines.push(
        `${label} ${plural(value.length, 'record', 'records')}, under ${sectionPath} below`
      );
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        if (path.length === 0) {
          state.counts.push(`${key}: 0`);
        }
        lines.push(`${label} none`);
      } else {
        lines.push(...listLines(label, value, depth, here.join('.'), state));
      }
    } else if (isPlainObject(value)) {
      const inner = objectLines(value, depth + 1, here, state);
      lines.push(inner.length > 0 ? label : `${label} none`, ...inner);
    } else {
      lines.push(`${label} ${bulletText(value)}`);
    }
  }
  return lines;
}

/** A list that is not a list of records: one line, or up to maxRows items */
function listLines(
  label: string,
  items: unknown[],
  depth: number,
  path: string,
  state: RenderState
): string[] {
  const texts = items.map(bulletText);
  if (
    texts.length <= INLINE_LIST_ITEMS &&
    texts.every(text => text.length <= INLINE_ITEM_CHARS)
  ) {
    return [`${label} ${texts.join(', ')}`];
  }
  const indent = '  '.repeat(depth + 1);
  const shown = texts.slice(0, state.maxRows).map(text => `${indent}- ${text}`);
  const more = texts.length - state.maxRows;
  if (more > 0) {
    shown.push(`${indent}- … and ${more} more`);
    state.cutLists.push(path);
  }
  return [`${label} ${plural(texts.length, 'item', 'items')}`, ...shown];
}

/** The lines of one section: a table, or the fields of its one record */
function sectionLines(section: Section, state: RenderState): string[] {
  const { path, records } = section;
  if (records.length === 1) {
    return [
      `### ${path} (1 record)`,
      '',
      ...objectLines(records[0], 0, [path], state),
    ];
  }

  const rows = records.map(record => flatten(record));
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const column of row.keys()) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  const empty: string[] = [];
  const same: string[] = [];
  const varying: string[] = [];
  for (const column of columns) {
    const values = rows.map(row => row.get(column));
    const first = JSON.stringify(values[0]);
    if (values.every(isBlank)) {
      empty.push(column);
    } else if (
      values.every(value => !isBlank(value) && JSON.stringify(value) === first)
    ) {
      same.push(column);
    } else {
      varying.push(column);
    }
  }

  const rank = (column: string, order: number): number => {
    const preferred = PREFERRED_COLUMNS.indexOf(column);
    return preferred >= 0 ? preferred : PREFERRED_COLUMNS.length + order;
  };
  const ranked = varying
    .map((column, order) => ({ column, rank: rank(column, order) }))
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.column);
  const shownColumns = ranked.slice(0, MAX_COLUMNS);
  const hiddenColumns = varying.filter(
    column => !shownColumns.includes(column)
  );
  const shownRows = rows.slice(0, state.maxRows);

  const count = plural(records.length, 'record', 'records');
  const lines = [
    shownRows.length < rows.length
      ? `### ${path} (${count}, first ${shownRows.length} shown)`
      : `### ${path} (${count})`,
    '',
  ];
  if (shownRows.length < rows.length) {
    state.cutRows.push(path);
  }
  if (same.length > 0) {
    const values = same.map(
      column => `${column} = ${bulletText(rows[0].get(column))}`
    );
    lines.push(`Same in every record: ${values.join('; ')}.`, '');
  }
  if (shownColumns.length > 0) {
    lines.push(
      `| ${shownColumns.map(escapeCell).join(' | ')} |`,
      `| ${shownColumns.map(() => '---').join(' | ')} |`,
      ...shownRows.map(
        row =>
          `| ${shownColumns.map(column => cellText(row.get(column), state)).join(' | ')} |`
      ),
      ''
    );
  }
  if (hiddenColumns.length > 0) {
    state.hiddenColumns = true;
    lines.push(`Fields not in the table: ${hiddenColumns.join(', ')}.`, '');
  }
  if (empty.length > 0) {
    lines.push(`Empty in every record: ${empty.join(', ')}.`, '');
  }
  while (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** What the markdown leaves out of the response, as the closing line */
function closingLine(state: RenderState, meta: JsonObject | undefined): string {
  const left: string[] = [];
  if (meta) {
    const requestId =
      typeof meta.request_id === 'string'
        ? ` (request_id ${meta.request_id})`
        : '';
    left.push(`the meta block${requestId}`);
  }
  if (state.cutRows.length > 0) {
    left.push(
      `records past the first ${state.maxRows} in ${state.cutRows.join(', ')}`
    );
  }
  if (state.cutLists.length > 0) {
    left.push(
      `items past the first ${state.maxRows} in ${state.cutLists.join(', ')}`
    );
  }
  if (state.hiddenColumns) {
    left.push('the fields named under their table');
  }
  if (state.cutCells) {
    left.push(
      `the rest of each table cell over ${MAX_CELL_CHARS} characters (cut with …)`
    );
  }
  if (state.cellLists) {
    left.push(
      `list items in a table cell past the first ${MAX_CELL_ITEMS}, and nested records (given as a count)`
    );
  }
  const what =
    left.length > 0
      ? `This view leaves out ${left.join('; ')}.`
      : 'This view has every field of the response.';
  return `_${what} Call again with \`response_format: json\` for the full JSON response._`;
}

/**
 * A tool's success response, parsed from its JSON text, as markdown
 *
 * @param toolName - The tool that answered
 * @param response - The parsed response
 * @param options - Rendering limits
 */
export function renderMarkdown(
  toolName: string,
  response: unknown,
  options: MarkdownOptions = {}
): string {
  const maxRows =
    Number.isInteger(options.maxRows) && (options.maxRows ?? 0) > 0
      ? (options.maxRows as number)
      : DEFAULT_MARKDOWN_ROWS;
  const state: RenderState = {
    maxRows,
    sections: [],
    counts: [],
    cutRows: [],
    cutLists: [],
    hiddenColumns: false,
    cutCells: false,
    cellLists: false,
  };

  // A unified response's fields are its data; its meta is left out
  let body: unknown = response;
  let meta: JsonObject | undefined;
  if (
    isPlainObject(response) &&
    response.success === true &&
    'data' in response
  ) {
    const { data, meta: responseMeta } = response;
    if (isPlainObject(responseMeta)) {
      body = data;
      meta = responseMeta;
    }
  }

  const lines: string[] = [];
  if (isRecordList(body)) {
    state.sections.push({ path: 'records', records: body });
    state.counts.push(`records: ${body.length}`);
  } else if (Array.isArray(body)) {
    state.counts.push(`records: ${body.length}`);
    lines.push(
      ...(body.length === 0
        ? ['- **records:** none']
        : listLines('- **records:**', body, 0, 'records', state))
    );
  } else if (isPlainObject(body)) {
    lines.push(...objectLines(body, 0, [], state));
  } else {
    lines.push(bulletText(body));
  }

  // Sections can add sections: a record shown as bullets may hold lists
  const sectionBlocks: string[] = [];
  for (let i = 0; i < state.sections.length; i++) {
    sectionBlocks.push(sectionLines(state.sections[i], state).join('\n'));
  }

  const heading =
    state.counts.length > 0
      ? `## ${toolName} (${state.counts.join(', ')})`
      : `## ${toolName}`;
  return [
    heading,
    ...(lines.length > 0 ? [lines.join('\n')] : []),
    ...sectionBlocks,
    closingLine(state, meta),
  ].join('\n\n');
}

/** The part of a tool response this module reads and writes */
interface TextToolResponse {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * A tool response with its JSON text rendered as markdown. An error
 * response, a response whose body says it failed, and one that is not a
 * single block of JSON text are returned as they are.
 *
 * @param toolName - The tool that answered
 * @param response - The tool's response
 * @param options - Rendering limits
 */
export function toMarkdownResponse<T extends TextToolResponse>(
  toolName: string,
  response: T,
  options: MarkdownOptions = {}
): T {
  if (response.isError === true || response.content.length !== 1) {
    return response;
  }
  const [block] = response.content;
  if (block.type !== 'text' || typeof block.text !== 'string') {
    return response;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return response;
  }
  if (
    isPlainObject(parsed) &&
    (parsed.success === false || parsed.error === true)
  ) {
    return response;
  }
  return {
    ...response,
    content: [
      { type: 'text', text: renderMarkdown(toolName, parsed, options) },
    ],
  };
}
