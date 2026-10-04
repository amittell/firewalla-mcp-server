/**
 * @fileoverview The MCP server class, with invisible characters marked in
 * every result
 *
 * Tool results (whichever response builder made them, streamed flow pages
 * included), resources and prompts are all the results of request
 * handlers. Wrapping each handler where it is registered covers every
 * response in one place, and a handler added later too.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AnyObjectSchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Notification, Request, Result, ServerNotification, ServerRequest, ServerResult } from '@modelcontextprotocol/sdk/types.js';
/**
 * The MCP server, with each request handler's result passed through
 * markInvisibleCharactersIn before it is sent
 */
export declare class UntrustedTextServer extends Server {
    setRequestHandler<T extends AnyObjectSchema>(requestSchema: T, handler: (request: SchemaOutput<T>, extra: RequestHandlerExtra<ServerRequest | Request, ServerNotification | Notification>) => ServerResult | Result | Promise<ServerResult | Result>): void;
}
//# sourceMappingURL=untrusted-text-server.d.ts.map