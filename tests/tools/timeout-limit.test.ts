/**
 * A tool that times out reports the limit it was held to. The search,
 * rules, device, network and security handlers passed a fixed 10000 ms into
 * their timeout response, so a tool stopped at 30 s
 * (PERFORMANCE_THRESHOLDS.TIMEOUT_MS) said "limit: 10000ms". Each tool
 * here is called with an API client whose requests never answer, except
 * the reads a write tool makes before its timeout starts (the rule's
 * status, the box's gid).
 */

import { ToolRegistry } from '../../src/tools/registry.js';
import type { FirewallaClient } from '../../src/firewalla/client.js';
import { TimeoutManager } from '../../src/utils/timeout-manager.js';
import { PERFORMANCE_THRESHOLDS } from '../../src/config/limits.js';
import { logger } from '../../src/monitoring/logger.js';

const BOX = '11111111-2222-3333-4444-555555555555';
const MAC = 'AA:BB:CC:DD:EE:FF';

/** Each tool with its own timeout response, and arguments that validate */
const TOOLS: Record<string, Record<string, unknown>> = {
  get_device_status: {},
  rename_device: { device_id: MAC, name: 'nas', gid: BOX },
  get_flow_data: {},
  get_bandwidth_usage: { period: '24h' },
  get_offline_devices: {},
  get_network_rules: {},
  pause_rule: { rule_id: 'rule-1' },
  resume_rule: { rule_id: 'rule-1' },
  get_network_rules_summary: {},
  get_specific_target_list: { id: 'TL-1' },
  create_target_list: {
    name: 'Blocked',
    owner: 'global',
    targets: ['example.com'],
  },
  update_target_list: { id: 'TL-1', name: 'Renamed' },
  delete_target_list: { id: 'TL-1' },
  create_rule: { action: 'block', target_type: 'internet', gid: BOX },
  delete_rule: { rule_id: 'rule-1' },
  search_flows: { query: 'protocol:tcp' },
  search_alarms: { query: 'type:1' },
  search_rules: { query: 'action:block' },
  search_devices: { query: 'online:false' },
  search_target_lists: { query: 'category:social' },
  get_active_alarms: {},
  get_specific_alarm: { alarm_id: '1', gid: BOX },
};

/** The status of the rule a rule write reads first */
let ruleStatus = 'active';

/**
 * An API client whose methods return a promise that never settles, but
 * for the rule-status read and the box lookup that write tools make before
 * their timeout starts
 */
const silentClient = new Proxy(
  {},
  {
    get: (_target, method) => (query?: unknown) => {
      if (method === 'resolveBoxGid') {
        return Promise.resolve(BOX);
      }
      if (
        method === 'getNetworkRules' &&
        typeof query === 'string' &&
        query.startsWith('id:')
      ) {
        const id = query.slice(3);
        return Promise.resolve({
          count: 1,
          results: [{ id, action: 'block', status: ruleStatus }],
        });
      }
      return new Promise(() => undefined);
    },
  }
) as unknown as FirewallaClient;

const registry = new ToolRegistry({ enableWriteTools: true });

async function callTool(name: string) {
  const handler = registry.getHandler(name);
  if (!handler) {
    throw new Error(`${name} is not registered`);
  }
  ruleStatus = name === 'resume_rule' ? 'paused' : 'active';
  return handler.execute(TOOLS[name], silentClient);
}

beforeEach(() => {
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('a timed-out tool reports its limit', () => {
  it.each(Object.keys(TOOLS))(
    '%s says the limit it was stopped at',
    async name => {
      // The tool is stopped at 150 ms, so a fixed number cannot pass. The
      // clock is fake, so the 150 ms pass without waiting for them.
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
      const realWithTimeout = TimeoutManager.prototype.withTimeout;
      jest
        .spyOn(TimeoutManager.prototype, 'withTimeout')
        .mockImplementation(function (this: TimeoutManager, operation, config) {
          return realWithTimeout.call(this, operation, {
            ...config,
            timeoutMs: 150,
          });
        });
      const answer = callTool(name);
      await jest.advanceTimersByTimeAsync(150);
      const response = await answer;
      const text = response.content.map(part => part.text).join('\n');

      expect(response.isError).toBe(true);
      expect(text).toContain('limit: 150ms');
      expect(JSON.parse(response.content[0].text)).toMatchObject({
        errorType: 'timeout_error',
        details: { timeoutMs: 150 },
      });
      expect(text).not.toContain('10000');
    }
  );

  it('with the defaults, the limit is PERFORMANCE_THRESHOLDS.TIMEOUT_MS', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    const answer = callTool('search_flows');
    await jest.advanceTimersByTimeAsync(PERFORMANCE_THRESHOLDS.TIMEOUT_MS);
    const response = await answer;

    expect(PERFORMANCE_THRESHOLDS.TIMEOUT_MS).toBe(30000);
    expect(response.content[0].text).toContain('limit: 30000ms');
    expect(JSON.parse(response.content[0].text)).toMatchObject({
      details: { timeoutMs: 30000 },
    });
  });
});
