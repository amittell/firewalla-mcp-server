/**
 * get_network_rules_summary filters by active_only and rule_type. The docs
 * audit found both validated and echoed in filters_applied, and neither
 * applied: the summary counted every rule read. The API is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetNetworkRulesSummaryHandler } from '../../src/tools/handlers/rules.js';

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

/** A client whose GETs answer `answer(url)` */
function makeClient(answer: (url: string) => unknown) {
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
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data: answer(url),
  }));
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentParams = (get: jest.Mock) =>
  get.mock.calls.map(([, config]) => config?.params ?? {});

const RULES = [
  {
    id: 'b:1',
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'a.example' },
  },
  {
    id: 'b:2',
    action: 'block',
    status: 'paused',
    direction: 'bidirection',
    target: { type: 'domain', value: 'b.example' },
  },
  {
    id: 'b:3',
    action: 'allow',
    status: 'active',
    direction: 'outbound',
    target: { type: 'ip', value: '10.0.0.1' },
  },
  {
    id: 'b:4',
    action: 'timelimit',
    direction: 'bidirection',
    target: { type: 'app', value: 'youtube' },
  },
];

describe('get_network_rules_summary filters by active_only and rule_type', () => {
  const summary = async (args: Record<string, unknown>) => {
    const { client, get } = makeClient(() => ({
      count: RULES.length,
      results: RULES,
    }));
    const res = await new GetNetworkRulesSummaryHandler().execute(args, client);
    expect(res.isError).toBeFalsy();
    return { data: body(res).data, params: sentParams(get) };
  };

  it('leaves paused rules out by default, as the schema says', async () => {
    const { data, params } = await summary({});
    expect(params).toEqual([{ query: '-status:paused', limit: 200 }]);
    expect(data.total_rules).toBe(3);
    expect(data.breakdown.by_status).toEqual({ active: 3 });
    expect(data.filters_applied).toEqual({
      rule_type: 'all',
      active_only: true,
      query: '-status:paused',
    });
  });

  it('counts only the rules of rule_type, even those the API sends besides', async () => {
    const { data, params } = await summary({ rule_type: 'block' });
    expect(params).toEqual([
      { query: 'action:block -status:paused', limit: 200 },
    ]);
    // The stub answers with every rule; only the active block rule counts
    expect(data.total_rules).toBe(1);
    expect(data.breakdown.by_action).toEqual({ block: 1 });
  });

  it('counts paused rules too with active_only: false', async () => {
    const { data, params } = await summary({ active_only: false, limit: 7 });
    expect(params).toEqual([{ limit: 7 }]);
    expect(data.total_rules).toBe(4);
    expect(data.breakdown.by_status).toEqual({ active: 3, paused: 1 });
    expect(data.limit_applied).toBe(7);
  });

  it('takes a rule with no status as active', async () => {
    const { data } = await summary({ rule_type: 'timelimit' });
    expect(data.total_rules).toBe(1);
  });

  it('refuses a rule_type that is not an action', async () => {
    const { client, get } = makeClient(() => ({ count: 0, results: [] }));
    const res = await new GetNetworkRulesSummaryHandler().execute(
      { rule_type: 'domain' },
      client
    );
    expect(res.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
