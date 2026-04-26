import { initializeHttpSession } from '../../src/http-session';

describe('initializeHttpSession', () => {
  it('creates independent server instances for each HTTP session and cleans them up on close', async () => {
    const transports = new Map();
    const servers = new Map();

    const serverA = { connect: jest.fn().mockResolvedValue(undefined) };
    const serverB = { connect: jest.fn().mockResolvedValue(undefined) };
    const createServerInstance = jest
      .fn()
      .mockReturnValueOnce(serverA)
      .mockReturnValueOnce(serverB);

    const transportA: any = {};
    const transportB: any = {};

    await initializeHttpSession({
      sessionId: '11111111-1111-4111-8111-111111111111',
      transport: transportA,
      transports,
      servers,
      createServerInstance,
    });

    await initializeHttpSession({
      sessionId: '22222222-2222-4222-8222-222222222222',
      transport: transportB,
      transports,
      servers,
      createServerInstance,
    });

    expect(createServerInstance).toHaveBeenCalledTimes(2);
    expect(serverA.connect).toHaveBeenCalledWith(transportA);
    expect(serverB.connect).toHaveBeenCalledWith(transportB);
    expect(transports.size).toBe(2);
    expect(servers.size).toBe(2);

    transportA.onclose();

    expect(transports.has('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(servers.has('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(transports.has('22222222-2222-4222-8222-222222222222')).toBe(true);
    expect(servers.has('22222222-2222-4222-8222-222222222222')).toBe(true);
  });

  it('cleans up partially initialized sessions when connect fails', async () => {
    const transports = new Map();
    const servers = new Map();
    const connectError = new Error('connect failed');
    const createServerInstance = jest
      .fn()
      .mockReturnValue({ connect: jest.fn().mockRejectedValue(connectError) });
    const transport: any = {};

    await expect(
      initializeHttpSession({
        sessionId: '33333333-3333-4333-8333-333333333333',
        transport,
        transports,
        servers,
        createServerInstance,
      })
    ).rejects.toThrow('connect failed');

    expect(transports.size).toBe(0);
    expect(servers.size).toBe(0);
  });
});
