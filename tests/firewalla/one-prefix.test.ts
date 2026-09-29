/**
 * A tool's error answer carries one prefix, its own, and the client's error
 * keeps its class and status. Measured live on 2026-09-29, get_boxes
 * answered "Failed to get boxes: Failed to get boxes: Authentication
 * failed..." and get_device_status "Failed to get device status: Failed to
 * get device status: Failed to create paginated response: Authentication
 * failed...": client methods, the pagination helper and the search engine
 * each wrapped the error in a new plain Error with their own prefix.
 */

import { ApiRequestError } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  closedPort,
  json,
  makeClient,
  startLocalApi,
} from './local-api.js';

let api: Awaited<ReturnType<typeof startLocalApi>>;
let unreachable: string;

beforeAll(async () => {
  // A bad token: every request is answered 401
  api = await startLocalApi((_request, response) =>
    json(response, 401, { error: 'unauthorized' })
  );
  unreachable = `http://127.0.0.1:${await closedPort()}`;
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

const badToken = () => makeClient(`http://127.0.0.1:${api.port}`);

const TOOLS: Array<[string, Record<string, unknown>]> = [
  ['get_boxes', {}],
  ['get_device_status', { box: BOX }],
  ['get_offline_devices', { box: BOX }],
  ['get_bandwidth_usage', { period: '24h' }],
  ['get_statistics_by_region', {}],
  ['get_flow_trends', {}],
  ['get_rule_trends', {}],
  ['search_flows', { query: 'protocol:tcp' }],
  ['search_alarms', { query: 'type:1' }],
  ['search_devices', { query: 'online:false' }],
  ['search_rules', { query: 'action:block' }],
  ['get_target_lists', { limit: 5 }],
];

async function answer(
  name: string,
  args: Record<string, unknown>,
  client: any
) {
  const handler = new ToolRegistry().getHandler(name)!;
  const response = await handler.execute(args, client);
  return JSON.parse(response.content[0].text);
}

/** "Failed to X:" and "... failed:" prefixes in a message */
const prefixes = (message: string) =>
  (message.match(/Failed to |failed:/gi) ?? []).length;

describe('one prefix', () => {
  it.each(TOOLS)('%s with a bad token', async (name, args) => {
    const body = await answer(name, args, badToken());

    expect(body.message).toMatch(
      /^Failed to [a-z ]+: Authentication failed\. Please check your MSP token\.$/
    );
    expect(prefixes(body.message)).toBe(1);
  });

  it.each(TOOLS)('%s with an API it cannot reach', async (name, args) => {
    const body = await answer(name, args, makeClient(unreachable));

    expect(body.message).toMatch(
      /^Failed to [a-z ]+: Could not reach the Firewalla API \(ECONNREFUSED: /
    );
    expect(prefixes(body.message)).toBe(1);
  });
});

describe("the client's error keeps its class and status", () => {
  it.each([
    ['getBoxes', (c: any) => c.getBoxes()],
    ['getDeviceStatus', (c: any) => c.getDeviceStatus(BOX)],
    ['getBandwidthUsage', (c: any) => c.getBandwidthUsage('24h')],
    ['getFlowTrends', (c: any) => c.getFlowTrends('30d')],
    ['getStatisticsByRegion', (c: any) => c.getStatisticsByRegion()],
    [
      'searchDevices',
      (c: any) => c.searchDevices({ query: 'online:false', limit: 10 }),
    ],
  ])('%s', async (_name, call) => {
    const error = await call(badToken()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 401,
      message: 'Authentication failed. Please check your MSP token.',
    });
  });
});
