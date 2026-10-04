import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export declare function initializeHttpSession({ sessionId, transport, transports, servers, createServerInstance, }: {
    sessionId: string;
    transport: StreamableHTTPServerTransport;
    transports: Map<string, StreamableHTTPServerTransport>;
    servers: Map<string, Server>;
    createServerInstance: () => Server;
}): Promise<void>;
//# sourceMappingURL=http-session.d.ts.map