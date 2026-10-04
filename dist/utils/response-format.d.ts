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
 *
 * Every value and field name is data from the API, and device names,
 * domains and alarm messages come from the network, so each is escaped
 * before it is placed: the characters that can open markdown or HTML get a
 * backslash (escapeMarkdown), which every CommonMark renderer shows as the
 * character itself. IP addresses, MACs, gids and timestamps have none of
 * them and read as they are. The one HTML the view writes is the <br> it
 * puts in place of a newline, after the value is escaped.
 */
/** The values response_format takes */
export declare const RESPONSE_FORMATS: readonly ["json", "markdown"];
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];
/** The schema property the read tools advertise */
export declare const RESPONSE_FORMAT_PROPERTY: {
    type: string[];
    enum: ("json" | "markdown" | null)[];
    default: string;
    description: string;
};
/** The fields of a listed tool this module reads */
interface ListedTool {
    name: string;
    annotations?: {
        readOnlyHint?: boolean;
    };
    inputSchema: {
        properties?: Record<string, unknown>;
    };
}
/** Whether a listed tool takes response_format: every read-only tool does */
export declare function acceptsResponseFormat(tool: ListedTool): boolean;
/**
 * The tool with response_format added to its input schema when it is a
 * read-only tool; any other tool is returned as it is.
 */
export declare function withResponseFormatProperty<T extends ListedTool>(tool: T): T;
/**
 * The format a call asks for, and its arguments without response_format.
 * Arguments without the property come back as the same object. Only the
 * schema's values are taken, exactly: json, markdown, or null, which is not
 * given (as the tools' validators treat null for every optional argument)
 * and so json. Anything else, another case or spaces included, is an error.
 */
export declare function takeResponseFormat(args: Record<string, unknown> | undefined): {
    format: ResponseFormat;
    args: Record<string, unknown> | undefined;
} | {
    error: string;
};
/** Options for the markdown rendering */
export interface MarkdownOptions {
    /** Most rows a table shows, and most items a bullet list shows */
    maxRows?: number;
}
/** Rows a table shows when no maxRows is given (DEFAULT_PAGE_SIZE's default) */
export declare const DEFAULT_MARKDOWN_ROWS = 100;
/** Most columns a table shows */
export declare const MAX_COLUMNS = 8;
/** Longest table cell, in characters, before it is cut */
export declare const MAX_CELL_CHARS = 120;
/** Items of a list shown in one table cell */
export declare const MAX_CELL_ITEMS = 3;
/**
 * Text with a backslash before each character that could open markdown or
 * HTML. All are ASCII punctuation, which CommonMark lets a backslash escape,
 * so a renderer shows the text as it is: `<img src=x>` stays text and
 * `[a](b)` is not a link. Newlines are left for oneLine.
 */
export declare function escapeMarkdown(text: string): string;
/**
 * Table-cell text: escaped as escapeMarkdown does, pipes escaped, and
 * newlines as <br>. Backslashes are escaped before pipes: a value holding
 * `\|` would otherwise become `\\|`, which some renderers split into two
 * cells and others show without the backslash
 */
export declare function escapeCell(text: string): string;
/**
 * A tool's success response, parsed from its JSON text, as markdown
 *
 * @param toolName - The tool that answered
 * @param response - The parsed response
 * @param options - Rendering limits
 */
export declare function renderMarkdown(toolName: string, response: unknown, options?: MarkdownOptions): string;
/** The part of a tool response this module reads and writes */
interface TextToolResponse {
    content: Array<{
        type: string;
        text?: string;
    }>;
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
export declare function toMarkdownResponse<T extends TextToolResponse>(toolName: string, response: T, options?: MarkdownOptions): T;
export {};
//# sourceMappingURL=response-format.d.ts.map