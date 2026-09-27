/**
 * The tools whose query goes to the API report the query they sent, as
 * search_flows does (search-flows-query-report.test.ts). Measured live:
 * search_alarms with 'MacBook Air' sent "MacBook Air" box.id:<gid> and
 * reported the caller's 'MacBook Air' as metadata.query. get_active_alarms
 * reported no query, and get_flow_data reported the query before the
 * client's renames and box scope. search_rules reports the terms it sent;
 * its free text is not sent (GET /v2/rules matches none) but matched on
 * the client. The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
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

const BOX = '00000000-0000-0000-0000-000000000000';

const RULES = [
  {
    id: 'r1',
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'nas.example' },
  },
  {
    id: 'r2',
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'other.example' },
  },
];

function makeClient(boxId?: string) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
    boxId,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data:
      url === '/v2/rules'
        ? { count: RULES.length, results: RULES }
        : { count: 0, results: [] },
  }));
  return { client, get };
}

type Handler = {
  execute: (args: any, client: FirewallaClient) => Promise<any>;
};

async function run(
  handler: Handler,
  args: Record<string, unknown>,
  boxId?: string
) {
  const { client, get } = makeClient(boxId);
  const res = await handler.execute(args, client);
  expect(res.isError).toBeFalsy();
  const sent: unknown[] = get.mock.calls.map(
    ([, config]) => config?.params?.query
  );
  expect(sent).toHaveLength(1);
  return { data: JSON.parse(res.content[0].text).data, sent: sent[0] };
}

describe('search_alarms reports the query it sent', () => {
  it('a phrase, with the box scope', async () => {
    const { data, sent } = await run(
      new SearchAlarmsHandler(),
      { query: "'MacBook Air'", limit: 10 },
      BOX
    );
    expect(sent).toBe(`"MacBook Air" box.id:${BOX}`);
    expect(data.metadata.query).toBe(sent);
    expect(data.query_info.original_query).toBe("'MacBook Air'");
    expect(data.query_info.final_query).toBe(sent);
  });

  it('as query_executed for groups', async () => {
    const { data, sent } = await run(
      new SearchAlarmsHandler(),
      { query: 'type:1 AND status:1', limit: 10, groupBy: 'type' },
      BOX
    );
    expect(sent).toBe(`type:1 status:1 box.id:${BOX}`);
    expect(data.query_executed).toBe(sent);
  });
});

describe('get_active_alarms reports the query it sent', () => {
  it('with the status:1 it adds and the box scope', async () => {
    const { data, sent } = await run(
      new GetActiveAlarmsHandler(),
      { query: 'type:1', limit: 10 },
      BOX
    );
    expect(sent).toBe(`status:1 type:1 box.id:${BOX}`);
    expect(data.query_executed).toBe(sent);
  });

  it('as query_executed for groups', async () => {
    const { data, sent } = await run(new GetActiveAlarmsHandler(), {
      query: 'type:1',
      limit: 10,
      groupBy: 'type',
    });
    expect(sent).toBe('status:1 type:1');
    expect(data.query_executed).toBe(sent);
  });
});

describe('get_flow_data reports the query it sent', () => {
  it('with the qualifier renames and the box scope', async () => {
    const { data, sent } = await run(
      new GetFlowDataHandler(),
      { query: 'bytes:>1MB AND protocol:tcp', limit: 10 },
      BOX
    );
    expect(sent).toBe(`total:>1MB protocol:tcp box.id:${BOX}`);
    expect(data.query_parameters.query).toBe(sent);
  });

  it('with the time range', async () => {
    const { data, sent } = await run(new GetFlowDataHandler(), {
      query: 'protocol:tcp',
      limit: 10,
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-02T00:00:00Z',
    });
    expect(sent).toBe('protocol:tcp ts:1735689600-1735776000');
    expect(data.query_parameters.query).toBe(sent);
  });

  it('as query_executed for groups', async () => {
    const { data, sent } = await run(new GetFlowDataHandler(), {
      query: 'bytes:>1MB',
      limit: 10,
      groupBy: 'domain',
    });
    expect(sent).toBe('total:>1MB');
    expect(data.query_executed).toBe(sent);
  });
});

describe('search_rules reports the terms it sent; free text is matched here', () => {
  it('sends the field terms and matches the word on the client', async () => {
    const { data, sent } = await run(
      new SearchRulesHandler(),
      { query: 'action:block AND nas', limit: 10 },
      BOX
    );
    expect(sent).toBe(`action:block box.id:${BOX}`);
    expect(data.metadata.query).toBe(sent);
    expect(data.query_info.final_query).toBe(sent);
    expect(data.rules.map((rule: any) => rule.id)).toEqual(['r1']);
    expect(data.free_text_coverage).toEqual({
      rules_checked: 2,
      rules_matched: 1,
      complete: true,
    });
  });

  it('reports an empty query when only free text was given', async () => {
    const { client, get } = makeClient();
    const res = await new SearchRulesHandler().execute(
      { query: 'nas', limit: 10 },
      client
    );
    const { data } = JSON.parse(res.content[0].text);
    expect(get.mock.calls.map(([, config]) => config?.params?.query)).toEqual([
      undefined,
    ]);
    expect(data.metadata.query).toBe('');
    expect(data.query_info.final_query).toBe('');
    expect(data.rules.map((rule: any) => rule.id)).toEqual(['r1']);
  });
});
