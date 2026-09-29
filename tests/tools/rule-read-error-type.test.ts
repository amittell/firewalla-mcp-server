/**
 * get_network_rules and get_network_rules_summary answer an API failure as
 * api_error, as the other non-search read tools do. Both called
 * createErrorResponse without a type, so a 401 or an unreachable API came
 * back as unknown_error.
 */

import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  closedPort,
  json,
  makeClient,
  startLocalApi,
} from '../firewalla/local-api.js';

let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((_request, response) =>
    json(response, 401, { error: 'unauthorized' })
  );
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const TOOLS: Array<[string, Record<string, unknown>]> = [
  ['get_network_rules', { limit: 5 }],
  ['get_network_rules_summary', {}],
];

async function errorType(
  name: string,
  args: Record<string, unknown>,
  client: any
) {
  const handler = new ToolRegistry().getHandler(name)!;
  const response = await handler.execute(args, client);
  return JSON.parse(response.content[0].text).errorType;
}

describe('a rule read that fails', () => {
  it.each(TOOLS)('%s answers a 401 as api_error', async (name, args) => {
    expect(
      await errorType(name, args, makeClient(`http://127.0.0.1:${api.port}`))
    ).toBe('api_error');
  });

  it.each(TOOLS)(
    '%s answers an API it cannot reach as api_error',
    async (name, args) => {
      const client = makeClient(`http://127.0.0.1:${await closedPort()}`);
      expect(await errorType(name, args, client)).toBe('api_error');
    }
  );
});
