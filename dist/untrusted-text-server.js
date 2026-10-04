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
import { markInvisibleCharactersIn } from './utils/untrusted-text.js';
/**
 * The MCP server, with each request handler's result passed through
 * markInvisibleCharactersIn before it is sent
 */
export class UntrustedTextServer extends Server {
    setRequestHandler(requestSchema, handler) {
        super.setRequestHandler(requestSchema, async (request, extra) => markInvisibleCharactersIn(await handler(request, extra)));
    }
}
//# sourceMappingURL=untrusted-text-server.js.map