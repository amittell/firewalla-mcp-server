/**
 * What reaches the MSP API. Its query grammar has no AND, OR, NOT or
 * parentheses (measured 2026-09-26: `status:blocked AND region:US` matched 0
 * flows where `status:blocked region:US` matched 6,318, and
 * `region:US AND protocol:tcp` 2,924 where `region:US protocol:tcp` matched
 * 465,213), so every GET to /v2/alarms, /v2/flows and /v2/rules sends its
 * query through toMspQuery. The HTTP layer is stubbed at axios: these tests
 * read the query as it would go on the wire.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchFlowsHandler,
  SearchAlarmsHandler,
  SearchRulesHandler,
} from '../../src/tools/handlers/search.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetNetworkRulesHandler } from '../../src/tools/handlers/rules.js';

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

const BOX = '00000000-0000-0000-0000-000000000000';

function makeClient(results: unknown[] = [], boxId?: string) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockResolvedValue({ status: 200, data: { count: results.length, results } });
  return { client, get };
}

/** The endpoint and query of every GET that went out */
const sent = (get: jest.Mock): Array<[string, unknown]> =>
  get.mock.calls.map(([endpoint, config]) => [endpoint, config?.params?.query]);

const errorOf = (response: any) => JSON.parse(response.content[0].text);

describe('queries reach the API in its grammar', () => {
  it('search_alarms sends type:1 AND status:1 as type:1 status:1', async () => {
    const { client, get } = makeClient();
    const res = await new SearchAlarmsHandler().execute(
      { query: 'type:1 AND status:1', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent(get)).toEqual([['/v2/alarms', 'type:1 status:1']]);
  });

  it('search_flows sends a same-field OR in parentheses as a comma list', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'status:blocked AND (region:US OR region:CN)', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent(get)).toEqual([['/v2/flows', 'status:blocked region:US,CN']]);
  });

  it('search_flows accepts the API forms: a space and the - prefix', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'region:US -protocol:tcp', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent(get)).toEqual([['/v2/flows', 'region:US -protocol:tcp']]);
  });

  it('search_flows sends NOT as the - prefix', async () => {
    const { client, get } = makeClient();
    await new SearchFlowsHandler().execute(
      { query: 'region:US AND NOT protocol:tcp', limit: 10 },
      client
    );
    expect(sent(get)).toEqual([['/v2/flows', 'region:US -protocol:tcp']]);
  });

  it('search_flows sends time_range as a ts range, with no parentheses', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      {
        query: 'protocol:tcp OR protocol:udp',
        limit: 10,
        time_range: {
          start: '2026-09-24T00:00:00Z',
          end: '2026-09-25T00:00:00Z',
        },
      },
      client
    );
    expect(res.isError).toBeFalsy();
    const start = Date.parse('2026-09-24T00:00:00Z') / 1000;
    const end = Date.parse('2026-09-25T00:00:00Z') / 1000;
    expect(sent(get)).toEqual([
      ['/v2/flows', `ts:${start}-${end} protocol:tcp,udp`],
    ]);
  });

  it('search_alarms sends time_range as a ts range', async () => {
    const { client, get } = makeClient();
    const res = await new SearchAlarmsHandler().execute(
      {
        query: 'type:10',
        limit: 10,
        time_range: {
          start: '2026-09-24T00:00:00Z',
          end: '2026-09-25T00:00:00Z',
        },
      },
      client
    );
    expect(res.isError).toBeFalsy();
    const start = Date.parse('2026-09-24T00:00:00Z') / 1000;
    const end = Date.parse('2026-09-25T00:00:00Z') / 1000;
    expect(sent(get)).toEqual([['/v2/alarms', `ts:${start}-${end} type:10`]]);
  });

  it('get_flow_data sends start_time and end_time as a ts range', async () => {
    const { client, get } = makeClient();
    const res = await new GetFlowDataHandler().execute(
      {
        query: 'region:US OR region:CN',
        start_time: '2026-09-24T00:00:00Z',
        end_time: '2026-09-25T00:00:00Z',
        limit: 10,
      },
      client
    );
    expect(res.isError).toBeFalsy();
    const start = Date.parse('2026-09-24T00:00:00Z') / 1000;
    const end = Date.parse('2026-09-25T00:00:00Z') / 1000;
    expect(sent(get)).toEqual([['/v2/flows', `region:US,CN ts:${start}-${end}`]]);
  });

  it('get_active_alarms ANDs its status:1 with the whole query', async () => {
    const { client, get } = makeClient();
    await new GetActiveAlarmsHandler().execute(
      { query: 'type:1 OR type:10', limit: 10 },
      client
    );
    expect(sent(get)).toEqual([['/v2/alarms', 'status:1 type:1,10']]);
  });

  it('get_network_rules sends its query in the API grammar', async () => {
    const { client, get } = makeClient();
    await new GetNetworkRulesHandler().execute(
      { query: 'action:block AND NOT status:paused', limit: 10 },
      client
    );
    expect(sent(get)).toEqual([['/v2/rules', 'action:block -status:paused']]);
  });

  it('scopes an OR to the configured box as a whole', async () => {
    const { client, get } = makeClient([], BOX);
    await client.getActiveAlarms('type:1 OR type:10');
    expect(sent(get)).toEqual([['/v2/alarms', `type:1,10 box.id:${BOX}`]]);
  });

  it('get_flow_insights queries categories as a comma list', async () => {
    const { client, get } = makeClient();
    await client.getFlowInsights('24h', {
      categories: ['social', 'games'],
      includeBlocked: true,
    });
    const queries = sent(get).map(([, query]) => String(query));
    expect(queries).toHaveLength(3);
    expect(queries[0]).toMatch(/^ts:\d+-\d+ category:social,games$/);
    expect(queries[2]).toMatch(/^ts:\d+-\d+ status:blocked$/);
    for (const query of queries) {
      expect(query).not.toMatch(/\bAND\b|\bOR\b|[()]/);
    }
  });

  it('getRecentThreats asks for blocked flows without AND', async () => {
    const { client, get } = makeClient();
    await client.getRecentThreats(1);
    const flows = sent(get).find(([endpoint]) => endpoint === '/v2/flows');
    expect(flows?.[1]).toMatch(/^status:blocked ts:>=\d+$/);
  });

  it('makeApiCall translates a query in the URL', async () => {
    const { client, get } = makeClient();
    await client.makeApiCall(
      'get',
      '/v2/alarms?query=type%3A1+AND+status%3A1&limit=5'
    );
    expect(get.mock.calls[0][0]).toBe(
      '/v2/alarms?query=type%3A1+status%3A1&limit=5'
    );
  });

  it('makeApiCall leaves other endpoints alone', async () => {
    const { client, get } = makeClient();
    await client.makeApiCall('get', '/v2/devices?query=a+AND+b');
    expect(get.mock.calls[0][0]).toBe('/v2/devices?query=a+AND+b');
  });
});

describe('queries the API cannot run', () => {
  it('search_flows refuses an OR across fields and sends nothing', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'region:US OR category:social', limit: 10 },
      client
    );
    expect(res.isError).toBe(true);
    const error = errorOf(res);
    expect(error.errorType).toBe('validation_error');
    expect(error.message).toContain('OR between different fields');
    expect(error.details.suggested_queries).toEqual([
      'region:US',
      'category:social',
    ]);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['search_alarms', 'type:8 AND NOT (status:1 AND region:US)'],
    ['search_rules', 'action:block OR status:paused'],
    ['get_flow_data', 'region:US OR protocol:tcp'],
    ['get_active_alarms', 'type:1 OR region:US'],
    ['get_network_rules', 'action:block OR status:paused'],
  ])('%s refuses %s as a validation error', async (tool, query) => {
    const handler = {
      search_alarms: () => new SearchAlarmsHandler(),
      search_rules: () => new SearchRulesHandler(),
      get_flow_data: () => new GetFlowDataHandler(),
      get_active_alarms: () => new GetActiveAlarmsHandler(),
      get_network_rules: () => new GetNetworkRulesHandler(),
    }[tool]!;
    const { client, get } = makeClient();
    const res = await handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBe(true);
    expect(errorOf(res).errorType).toBe('validation_error');
    expect(get).not.toHaveBeenCalled();
  });

  it('the client refuses a query before a request', async () => {
    const { client, get } = makeClient();
    await expect(
      client.getFlowData('region:US OR category:social')
    ).rejects.toThrow(/OR between different fields/);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('search_rules re-checks the API answer against the whole query', () => {
  const rules = [
    { id: 'r1', action: 'block', status: 'active', target: { type: 'domain', value: 'a.example' } },
    { id: 'r2', action: 'allow', status: 'active', target: { type: 'domain', value: 'b.example' } },
    { id: 'r3', action: 'block', status: 'paused', target: { type: 'domain', value: 'c.example' } },
  ];

  const ids = (res: any): string[] =>
    JSON.parse(res.content[0].text).data.rules.map((rule: any) => rule.id);

  it('keeps both kinds for action:block OR action:allow', async () => {
    const { client, get } = makeClient(rules);
    const res = await new SearchRulesHandler().execute(
      { query: 'action:block OR action:allow', limit: 10 },
      client
    );
    expect(sent(get)).toEqual([['/v2/rules', 'action:block,allow']]);
    expect(ids(res)).toEqual(['r1', 'r2', 'r3']);
  });

  it('drops paused rules for action:block AND NOT status:paused', async () => {
    const { client, get } = makeClient(rules);
    const res = await new SearchRulesHandler().execute(
      { query: 'action:block AND NOT status:paused', limit: 10 },
      client
    );
    expect(sent(get)).toEqual([['/v2/rules', 'action:block -status:paused']]);
    expect(ids(res)).toEqual(['r1']);
  });

  it('accepts the - prefix', async () => {
    const { client } = makeClient(rules);
    const res = await new SearchRulesHandler().execute(
      { query: 'action:block -status:paused', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(ids(res)).toEqual(['r1']);
  });

  it('leaves terms on fields it does not read to the API', async () => {
    const { client } = makeClient(rules);
    const res = await new SearchRulesHandler().execute(
      { query: 'action:block box.id:some-box', limit: 10 },
      client
    );
    expect(ids(res)).toEqual(['r1', 'r3']);
  });
});

describe('suggestions name every disjunct', () => {
  it('search_flows keeps both terms of an AND inside an OR', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'region:US OR (category:social AND status:blocked)', limit: 10 },
      client
    );
    expect(errorOf(res).details.suggested_queries).toEqual([
      'region:US',
      'category:social status:blocked',
    ]);
    expect(get).not.toHaveBeenCalled();
  });
});
