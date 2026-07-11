import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './monitoring/logger.js';

export async function initializeHttpSession({
  sessionId,
  transport,
  transports,
  servers,
  createServerInstance,
}: {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  transports: Map<string, StreamableHTTPServerTransport>;
  servers: Map<string, Server>;
  createServerInstance: () => Server;
}): Promise<void> {
  transports.set(sessionId, transport);

  transport.onclose = () => {
    logger.info(`HTTP session closed: ${sessionId}`);
    transports.delete(sessionId);
    servers.delete(sessionId);
  };

  const sessionServer = createServerInstance();

  try {
    await sessionServer.connect(transport);
    servers.set(sessionId, sessionServer);
  } catch (error) {
    transports.delete(sessionId);
    servers.delete(sessionId);
    throw error;
  }
}
