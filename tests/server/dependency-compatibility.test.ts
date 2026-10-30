import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { UntrustedTextServer } from '../../src/untrusted-text-server.js';

describe('Zod collection size limits', () => {
  it('rejects an oversized array before parsing its elements', () => {
    const parseElement = jest.fn(() => true);
    const schema = z.array(z.string().refine(parseElement)).max(1);
    const result = schema.safeParse(['first', 'second']);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.code)).toEqual(['too_big']);
    expect(parseElement).not.toHaveBeenCalled();
  });

  it('rejects an oversized set before parsing its elements', () => {
    const parseElement = jest.fn(() => true);
    const schema = z.set(z.string().refine(parseElement)).max(1);
    const result = schema.safeParse(new Set(['first', 'second']));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.code)).toEqual(['too_big']);
    expect(parseElement).not.toHaveBeenCalled();
  });

  it('rejects an oversized map before parsing its keys or values', () => {
    const parseKey = jest.fn(() => true);
    const parseValue = jest.fn(() => true);
    const schema = z
      .map(z.string().refine(parseKey), z.string().refine(parseValue))
      .max(1);
    const result = schema.safeParse(
      new Map([
        ['first', 'one'],
        ['second', 'two'],
      ])
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.code)).toEqual(['too_big']);
    expect(parseKey).not.toHaveBeenCalled();
    expect(parseValue).not.toHaveBeenCalled();
  });
});

it('validates a Zod 4 request before dispatching an MCP handler', async () => {
  const server = new UntrustedTextServer(
    { name: 'zod4-migration-test', version: '0.0.0' },
    { capabilities: {} }
  );
  const client = new Client({ name: 'zod4-client', version: '0.0.0' });
  const requestSchema = z.object({
    method: z.literal('test/zod4'),
    params: z.object({ values: z.array(z.string()).max(1) }),
  });
  const resultSchema = z.object({ values: z.array(z.string()) });
  let calls = 0;
  server.setRequestHandler(requestSchema, async request => {
    calls++;
    return { values: request.params.values };
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    await expect(
      client.request(
        { method: 'test/zod4', params: { values: ['accepted'] } },
        resultSchema
      )
    ).resolves.toEqual({ values: ['accepted'] });
    expect(calls).toBe(1);

    await expect(
      client.request(
        { method: 'test/zod4', params: { values: ['first', 'second'] } },
        resultSchema
      )
    ).rejects.toThrow(/too_big/);
    expect(calls).toBe(1);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
