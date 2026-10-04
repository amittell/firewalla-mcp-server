import { logger } from './monitoring/logger.js';
export async function initializeHttpSession({ sessionId, transport, transports, servers, createServerInstance, }) {
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
    }
    catch (error) {
        transports.delete(sessionId);
        servers.delete(sessionId);
        throw error;
    }
}
//# sourceMappingURL=http-session.js.map