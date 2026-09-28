/**
 * search_flows declares geographic_filters in its listed schema, as its
 * handler takes them: countries and regions (country codes, sent as one
 * region: comma list) and the yes-or-no filters that ask for nothing when
 * false. The schema did not list the argument at all, so a client that
 * builds calls from the schema could not use it. The tools are listed and
 * called through the server's ListTools and CallTool handlers over an
 * in-memory MCP connection; axios is mocked and records every request.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FirewallaMCPServer } from '../../src/server.js';

/** GET requests the mocked axios instance received: path and query */
const requests: Array<{ url: string; query: unknown }> = [];

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: async (url: string, config?: { params?: { query?: unknown } }) => {
      requests.push({ url, query: config?.params?.query });
      return { status: 200, data: { count: 0, results: [] }, config: { url } };
    },
  };
  return { create: jest.fn(() => instance), isAxiosError: () => false };
});

async function connect(): Promise<Client> {
  const server = (new FirewallaMCPServer() as any).server as Server;
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'search-flows-schema', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

let client: Client;
let tools: Tool[];

beforeAll(async () => {
  client = await connect();
  tools = (await client.listTools()).tools;
});

afterAll(async () => {
  await client.close();
});

beforeEach(() => {
  requests.length = 0;
});

const schemaOf = (name: string) =>
  tools.find(tool => tool.name === name)?.inputSchema as any;

describe('search_flows lists geographic_filters', () => {
  it('with countries, regions and the yes-or-no filters', () => {
    const geographic = schemaOf('search_flows').properties.geographic_filters;
    expect(geographic.type).toBe('object');
    expect(Object.keys(geographic.properties).sort()).toEqual(
      [
        'countries',
        'exclude_cloud',
        'exclude_known_providers',
        'exclude_vpn',
        'high_risk_countries',
        'regions',
        'threat_analysis',
      ].sort()
    );
    for (const list of ['countries', 'regions']) {
      expect(geographic.properties[list]).toMatchObject({
        type: 'array',
        items: { type: 'string' },
      });
    }
    for (const flag of [
      'exclude_vpn',
      'exclude_cloud',
      'high_risk_countries',
      'exclude_known_providers',
      'threat_analysis',
    ]) {
      // false is the one value the handler takes
      expect(geographic.properties[flag]).toMatchObject({
        type: 'boolean',
        enum: [false],
      });
    }
    expect(geographic.description).toContain('region:US,CN');
    expect(geographic.description).toContain('refused');
    // the argument is optional, as the handler has it
    expect(schemaOf('search_flows').required).toEqual(['query']);
  });

  it('get_flow_data, which takes no geographic_filters, does not list them', () => {
    expect(
      schemaOf('get_flow_data').properties.geographic_filters
    ).toBeUndefined();
  });

  it("search_alarms lists them as the remote end's remote.region", () => {
    const geographic = schemaOf('search_alarms').properties.geographic_filters;
    expect(Object.keys(geographic.properties)).toEqual([
      'countries',
      'regions',
    ]);
    expect(geographic.description).toContain('remote.region:US,CN');
    expect(schemaOf('search_alarms').required).toEqual(['query']);
  });
});

describe('a call shaped by the schema', () => {
  it('sends the countries and regions as one region: list', async () => {
    const result = await client.callTool({
      name: 'search_flows',
      arguments: {
        query: 'protocol:tcp',
        limit: 10,
        geographic_filters: {
          countries: ['US', 'CN'],
          regions: ['GB'],
          exclude_vpn: false,
          exclude_cloud: false,
          high_risk_countries: false,
          exclude_known_providers: false,
          threat_analysis: false,
        },
      },
    });
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/v2/flows');
    // with the box scope the test setup's FIREWALLA_BOX_ID adds
    expect(requests[0].query).toMatch(
      /^protocol:tcp region:US,CN,GB( box\.id:\S+)?$/
    );
  });

  it('refuses a yes-or-no filter set to true, before a request', async () => {
    const result = await client.callTool({
      name: 'search_flows',
      arguments: {
        query: 'protocol:tcp',
        limit: 10,
        geographic_filters: { countries: ['US'], exclude_vpn: true },
      },
    });
    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content as any)[0].text);
    expect(error.errorType).toBe('validation_error');
    expect(error.details.unsupported_filters).toEqual(['exclude_vpn']);
    expect(requests).toEqual([]);
  });
});
