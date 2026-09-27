/**
 * The MSP API answers a quoted free-text phrase that holds a colon with
 * HTTP 400, and takes a quoted colon in a field value. Measured 2026-09-27
 * (GET, limit 1): "a:b", 'a:b' and "show ts:[1 TO 2]" on /v2/flows and
 * "a:b" on /v2/alarms answered 400; domain:"a:b" on flows and
 * device.name:"x:y" on flows and alarms answered 200. So a phrase like
 * that is refused before any request for flows and alarms, and a field
 * value with a colon is still sent. Rules, devices and target lists match
 * free text on the client, where a colon is fine. The API is stubbed;
 * nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
} from '../../src/tools/handlers/search.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

function makeClient() {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/v2/devices') {
      return {
        status: 200,
        data: [
          {
            id: 'aa:bb:cc:dd:ee:01',
            gid: 'g',
            name: 'port a:b',
            ip: '10.0.0.2',
          },
          { id: 'aa:bb:cc:dd:ee:02', gid: 'g', name: 'other', ip: '10.0.0.3' },
        ],
      };
    }
    if (url === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: 2,
          results: [
            {
              id: 'r1',
              action: 'block',
              status: 'active',
              direction: 'bidirection',
              target: { type: 'domain', value: 'example.com' },
              notes: 'port a:b',
            },
            {
              id: 'r2',
              action: 'block',
              status: 'active',
              direction: 'bidirection',
              target: { type: 'domain', value: 'example.org' },
            },
          ],
        },
      };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

const API_TOOLS = [
  ['search_flows', SearchFlowsHandler, {}],
  ['search_alarms', SearchAlarmsHandler, {}],
  ['get_flow_data', GetFlowDataHandler, {}],
  ['get_flow_data streamed', GetFlowDataHandler, { limit: 100 }],
  ['get_active_alarms', GetActiveAlarmsHandler, {}],
] as const;

describe('a quoted free-text phrase with a colon', () => {
  it.each(
    API_TOOLS.flatMap(([name, Handler, args]) =>
      ['"a:b"', "'a:b'", "'show ts:[1 TO 2]'"].map(
        query => [name, query, Handler, args] as const
      )
    )
  )('%s refuses %s with no request', async (_name, query, Handler, args) => {
    const { client, get } = makeClient();
    const res = await new Handler().execute(
      { query, limit: 10, ...args },
      client
    );
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.errorType).toBe('validation_error');
    expect(error.message).toContain('is a quoted phrase with a colon');
    expect(error.message).toContain('HTTP 400');
    expect(error.message).toContain('domain:"a:b"');
    expect(error.details.suggested_queries).toHaveLength(1);
    expect(error.details.suggested_queries[0]).not.toContain(':[');
    expect(get).not.toHaveBeenCalled();
  });

  it('suggests the query with the phrase without its colon', async () => {
    const { client } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp "port a:b"', limit: 10 },
      client
    );
    const error = body(res);
    expect(error.details.unsupported_part).toBe('"port a:b"');
    expect(error.details.suggested_queries).toEqual([
      'protocol:tcp "port a b"',
    ]);
  });
});

describe('a quoted colon in a field value', () => {
  it.each([
    ['search_flows', SearchFlowsHandler, 'domain:"a:b"'],
    ['get_flow_data', GetFlowDataHandler, 'domain:"a:b"'],
    ['search_alarms', SearchAlarmsHandler, 'device.name:"x:y"'],
  ] as const)('%s sends %s', async (_name, Handler, query) => {
    const { client, get } = makeClient();
    const res = await new Handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual([query]);
  });

  it('get_active_alarms sends device.name:"x:y"', async () => {
    const { client, get } = makeClient();
    const res = await new GetActiveAlarmsHandler().execute(
      { query: 'device.name:"x:y"', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual(['status:1 device.name:"x:y"']);
  });
});

describe('free text matched on the client may hold a colon', () => {
  it('search_rules finds the rule with "port a:b"', async () => {
    const { client, get } = makeClient();
    const res = await new SearchRulesHandler().execute(
      { query: '"port a:b"', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.rules.map((rule: any) => rule.id)).toEqual(['r1']);
    expect(sentQueries(get)).toEqual([undefined]);
  });

  it('search_devices finds the device with "port a:b"', async () => {
    const { client } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query: '"port a:b"', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(body(res).data.devices.map((device: any) => device.name)).toEqual([
      'port a:b',
    ]);
  });
});
