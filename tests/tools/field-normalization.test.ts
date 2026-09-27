/**
 * The field normalizer (toSnakeCaseDeep, applied by createUnifiedResponse)
 * renames field names to snake_case. It used to rename every key, so two
 * keys that read the same once renamed (fooBar and foo_bar) became one and
 * a value was dropped, and keys that are data were rewritten: the rule
 * target type remotePort was counted as remote_port, and text such as
 * <U+200B> in a key became <_u+200_b>. The API is stubbed; nothing leaves
 * the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetNetworkRulesSummaryHandler } from '../../src/tools/handlers/rules.js';
import { GetSpecificAlarmHandler } from '../../src/tools/handlers/security.js';

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

/** A client whose GET /v2/rules returns `rules`, and GET of alarm 1 `alarm` */
function stubClient(rules: unknown[], alarm?: unknown): FirewallaClient {
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
    data:
      url === `/v2/alarms/${BOX}/1`
        ? alarm
        : { count: rules.length, results: rules },
  }));
  return client;
}

const clientWithRules = (rules: unknown[]) => stubClient(rules);

const body = (res: any) => JSON.parse(res.content[0].text);

function rule(id: string, fields: Record<string, unknown>) {
  return {
    id,
    action: 'block',
    status: 'active',
    direction: 'bidirection',
    target: { type: 'domain', value: 'example.com' },
    ts: 1735689600,
    updateTs: 1735689600,
    ...fields,
  };
}

describe('get_network_rules_summary counts by value, and a value is data', () => {
  it('keeps the target type remotePort as the API names it', async () => {
    const res = await new GetNetworkRulesSummaryHandler().execute(
      { limit: 100 },
      clientWithRules([
        rule('r1', { target: { type: 'remotePort', value: '443' } }),
        rule('r2', { target: { type: 'remotePort', value: '8443' } }),
        rule('r3', { target: { type: 'domain', value: 'example.com' } }),
      ])
    );
    expect(res.isError).toBeFalsy();
    const { breakdown } = body(res).data;
    expect(breakdown.by_target_type).toEqual({ remotePort: 2, domain: 1 });
  });

  it('keeps a count for each value, even two that snake_case would merge', async () => {
    const res = await new GetNetworkRulesSummaryHandler().execute(
      { limit: 100 },
      clientWithRules([
        rule('r1', { target: { type: 'remotePort', value: '443' } }),
        rule('r2', { target: { type: 'remote_port', value: '443' } }),
        rule('r3', { target: { type: 'remote_port', value: '80' } }),
      ])
    );
    const { data } = body(res);
    expect(data.breakdown.by_target_type).toEqual({
      remotePort: 1,
      remote_port: 2,
    });
    const counted = Object.values(
      data.breakdown.by_target_type as Record<string, number>
    ).reduce((sum, count) => sum + count, 0);
    expect(counted).toBe(data.total_rules);
  });

  it('keeps marker text in a value as it is', async () => {
    const res = await new GetNetworkRulesSummaryHandler().execute(
      { limit: 100 },
      clientWithRules([rule('r1', { action: 'x<U+200B>' })])
    );
    expect(body(res).data.breakdown.by_action).toEqual({ 'x<U+200B>': 1 });
  });
});

describe('get_specific_alarm keeps every field of an API object', () => {
  // The official Remote model names rootDomain; alarms measured on a live
  // account had root_domain (docs/firewalla-api-reference.md). An alarm
  // with both, holding different values, must keep both.
  it.each([
    ['camelCase first', { rootDomain: 'a.example', root_domain: 'b.example' }],
    ['snake_case first', { root_domain: 'b.example', rootDomain: 'a.example' }],
  ])(
    'names a field that snake_case would merge with a <duplicate N> suffix, %s',
    async (_order, domains) => {
      const alarm = {
        aid: 1,
        gid: BOX,
        type: 1,
        status: 1,
        ts: 1735689600,
        message: 'Security activity',
        remote: { ip: '192.0.2.10', ...domains },
      };
      const res = await new GetSpecificAlarmHandler().execute(
        { alarm_id: '1', gid: BOX },
        stubClient([], alarm)
      );
      expect(res.isError).toBeFalsy();
      const { remote } = body(res).data.alarm.results[0];
      // The key the API sent in snake_case keeps its name; the renamed one
      // gets the first free suffix, whatever the order of the keys
      expect(remote).toEqual({
        ip: '192.0.2.10',
        root_domain: 'b.example',
        'root_domain <duplicate 2>': 'a.example',
      });
    }
  );
});
