/**
 * A write tool that gives up says what became of its write. A write still
 * waiting for the rate limiter is not sent: nothing was changed. A write
 * sent and not answered may have reached Firewalla, and cancelling it does
 * not undo it: the outcome is unknown, and the caller is told which read
 * shows whether it was applied. All the tools said was that they timed out,
 * with advice for slow reads, so a caller could send the write again and
 * pause or create a rule twice.
 *
 * The HTTP layer is stubbed, and the tools give up after TOOL_MS instead of
 * 30 s. A write is answered only when it is cancelled, or after 1 s.
 */

import {
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import {
  FirewallaClient,
  checkingReadTool,
} from '../../src/firewalla/client.js';
import {
  CreateRuleHandler,
  CreateTargetListHandler,
  DeleteRuleHandler,
  DeleteTargetListHandler,
  PauseRuleHandler,
  ResumeRuleHandler,
  UpdateTargetListHandler,
} from '../../src/tools/handlers/rules.js';
import { RenameDeviceHandler } from '../../src/tools/handlers/device.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';
import {
  TimeoutManager,
  withToolTimeout,
} from '../../src/utils/timeout-manager.js';

const TOOL_MS = 200;
const GID = '00000000-0000-0000-0000-000000000000';

function makeClient({
  rateLimit = 100,
  ruleStatus = 'active',
}: { rateLimit?: number; ruleStatus?: string } = {}) {
  let time = Date.UTC(2026, 8, 27, 12);
  const clock = {
    now: () => time,
    // A wait for the rate limiter takes at most 500 ms here
    sleep: async (ms: number) => {
      await delay(Math.min(ms, 500));
      time += ms;
    },
  };
  const client = new FirewallaClient(
    {
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      apiTimeout: 30000,
      rateLimit,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    } as any,
    clock
  );
  /** Each write that reached the adapter, and whether it was cancelled */
  const writes: Array<{ request: string; cancelled: boolean }> = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown) =>
      ({
        status: 200,
        statusText: 'OK',
        headers: {},
        data,
        config,
        request: {},
      }) as AxiosResponse;
    if (config.method?.toUpperCase() === 'GET') {
      // The rule tools read the rule's status before they write
      return reply(
        config.url === '/v2/rules'
          ? {
              count: 1,
              results: [{ id: 'r-1', status: ruleStatus, action: 'block' }],
            }
          : []
      );
    }
    const write = {
      request: `${config.method?.toUpperCase()} ${config.url}`,
      cancelled: false,
    };
    writes.push(write);
    const signal = config.signal as AbortSignal | undefined;
    await Promise.race([
      delay(1000),
      new Promise(resolve => signal?.addEventListener('abort', resolve)),
    ]);
    if (signal?.aborted) {
      write.cancelled = true;
      throw new CanceledError('canceled', undefined, config);
    }
    return reply({ success: true });
  };
  (client as any).api.defaults.adapter = adapter;
  return {
    client,
    writes,
    /** Moves the client's clock on */
    advance: (ms: number) => {
      time += ms;
    },
  };
}

async function run(
  handler: ToolHandler,
  args: Record<string, unknown>,
  client: FirewallaClient
) {
  const response = await handler.execute(args, client);
  const body = JSON.parse(response.content[0].text);
  return {
    isError: response.isError,
    message: body.message as string,
    write: body.details?.write,
  };
}

const realWithTimeout = TimeoutManager.prototype.withTimeout;

beforeEach(() => {
  // The client logs each request and response to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // Tools give up after TOOL_MS
  jest
    .spyOn(TimeoutManager.prototype, 'withTimeout')
    .mockImplementation(function (
      this: TimeoutManager,
      operation: () => Promise<unknown>,
      config = {}
    ) {
      return realWithTimeout.call(this, operation, {
        ...config,
        timeoutMs: TOOL_MS,
      });
    } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const WRITE_TOOLS: Array<{
  handler: ToolHandler;
  args: Record<string, unknown>;
  request: string;
  check: string;
  ruleStatus?: string;
}> = [
  {
    handler: new PauseRuleHandler(),
    args: { rule_id: 'r-1' },
    request: 'POST /v2/rules/r-1/pause',
    check: 'get_network_rules',
  },
  {
    handler: new ResumeRuleHandler(),
    args: { rule_id: 'r-1' },
    request: 'POST /v2/rules/r-1/resume',
    check: 'get_network_rules',
    ruleStatus: 'paused',
  },
  {
    handler: new CreateRuleHandler(),
    args: {
      action: 'block',
      target_type: 'domain',
      target_value: 'example.com',
      gid: GID,
    },
    request: 'POST /v2/rules',
    check: 'get_network_rules',
  },
  {
    handler: new DeleteRuleHandler(),
    args: { rule_id: 'r-1' },
    request: 'DELETE /v2/rules/r-1',
    check: 'get_network_rules',
  },
  {
    handler: new CreateTargetListHandler(),
    args: { name: 'blocked', owner: 'global', targets: ['example.com'] },
    request: 'POST /v2/target-lists',
    check: 'get_target_lists',
  },
  {
    handler: new UpdateTargetListHandler(),
    args: { id: 't-1', targets: ['example.com'] },
    request: 'PATCH /v2/target-lists/t-1',
    check: 'get_target_lists',
  },
  {
    handler: new DeleteTargetListHandler(),
    args: { id: 't-1' },
    request: 'DELETE /v2/target-lists/t-1',
    check: 'get_target_lists',
  },
  {
    handler: new RenameDeviceHandler(),
    args: { device_id: 'aa:bb:cc:dd:ee:ff', name: 'laptop', gid: GID },
    request: `PATCH /v2/boxes/${GID}/devices/${encodeURIComponent('aa:bb:cc:dd:ee:ff')}`,
    check: 'get_device_status',
  },
];

describe('a write sent and not answered when the tool gives up', () => {
  it.each(WRITE_TOOLS)(
    '$handler.name: the outcome is unknown; check with $check',
    async ({ handler, args, request, check, ruleStatus }) => {
      const { client, writes } = makeClient({ ruleStatus });
      const result = await run(handler, args, client);
      expect(result.isError).toBe(true);
      expect(result.message).toMatch(
        new RegExp(
          `^${handler.name} gave up after \\d+ ms with ${request.replace(/[/.]/g, '\\$&')} sent and not answered\\. The outcome is unknown: Firewalla may have applied the change\\. Check with ${check} before trying again\\.$`
        )
      );
      expect(result.write).toBe('unknown');
      // The request was cancelled, not sent again
      expect(writes).toEqual([{ request, cancelled: true }]);
    }
  );
});

describe('a write still waiting for the rate limiter when the tool gives up', () => {
  it('create_target_list: it is not sent, and says so', async () => {
    // One request per 5 minutes: the first one is 290 s old, so the write
    // waits 10 s for the next slot, within its 20 s
    const { client, writes, advance } = makeClient({ rateLimit: 1 });
    await (client as any).api.get('/v2/boxes');
    advance(290_000);
    const result = await run(
      new CreateTargetListHandler(),
      { name: 'blocked', owner: 'global', targets: ['example.com'] },
      client
    );
    expect(result.message).toMatch(
      /^create_target_list gave up after \d+ ms while POST \/v2\/target-lists waited for the rate limit\. It was not sent, so nothing was changed\.$/
    );
    expect(result.write).toBe('not_sent');
    // The rate limiter's wait ends later; the write is still not sent
    await delay(700);
    expect(writes).toEqual([]);
  });
});

describe('a write answered before the tool gave up', () => {
  it('says the change was made', async () => {
    const { client } = makeClient();
    (client as any).api.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ) =>
      ({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: 'ok',
        config,
        request: {},
      }) as AxiosResponse;
    const failure = await withToolTimeout(async () => {
      await client.pauseRule('r-1');
      await delay(1000);
    }, 'pause_rule').catch(error => error);
    expect(failure.writeState).toBe('applied');
    expect(failure.writeOutcome).toMatch(
      /^pause_rule gave up after \d+ ms, after POST \/v2\/rules\/r-1\/pause was answered HTTP 200: the change was made\. Check with get_network_rules before trying again\.$/
    );
  });
});

describe('checkingReadTool', () => {
  it('names the read that shows each write', () => {
    expect(checkingReadTool('/v2/rules/r-1/pause')).toBe('get_network_rules');
    expect(checkingReadTool('/v2/target-lists/t-1')).toBe('get_target_lists');
    expect(checkingReadTool(`/v2/boxes/${GID}/devices/aa`)).toBe(
      'get_device_status'
    );
    expect(checkingReadTool(`/v2/alarms/${GID}/7/archive`)).toBe(
      'get_specific_alarm'
    );
    expect(checkingReadTool('/v2/boxes')).toBeUndefined();
  });
});
