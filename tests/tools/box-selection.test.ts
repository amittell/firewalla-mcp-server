/**
 * FIREWALLA_BOX_ID is optional: which box single-box operations use, how
 * get_specific_alarm finds an alarm across boxes, and the firewall summary
 * the prompts and the summary resource read. The HTTP layer is stubbed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BoxSelectionError,
  FirewallaClient,
} from '../../src/firewalla/client.js';
import { GetSpecificAlarmHandler } from '../../src/tools/handlers/security.js';
import { setupPrompts } from '../../src/prompts/index.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
  };
});

const FLUME = '11111111-2222-3333-4444-555555555555';
const PINEWOOD = '66666666-7777-8888-9999-000000000000';

interface FakeBox {
  gid: string;
  name: string;
  online: boolean;
}

const TWO_BOXES: FakeBox[] = [
  { gid: FLUME, name: 'Flume', online: true },
  { gid: PINEWOOD, name: 'Pinewood', online: false },
];

function makeClient({
  boxId,
  defaultBoxId,
  boxes = TWO_BOXES,
  alarms = {},
}: {
  boxId?: string;
  defaultBoxId?: string;
  boxes?: FakeBox[];
  alarms?: Record<string, string[]>;
} = {}) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId,
    defaultBoxId,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const request = jest.fn(async (method: string, endpoint: string) => {
    if (method === 'GET' && endpoint === '/v2/boxes') {
      return boxes.map(box => ({
        ...box,
        model: 'goldpro',
        lastSeen: 1758800000,
        deviceCount: 10,
        alarmCount: 2,
        ruleCount: 5,
      }));
    }
    const alarm = endpoint.match(/^\/v2\/alarms\/([^/]+)\/([^/]+)$/);
    if (method === 'GET' && alarm) {
      const [, gid, aid] = alarm;
      if ((alarms[gid] || []).includes(aid)) {
        return { aid: Number(aid), type: 1, status: 1, message: 'alarm' };
      }
      throw new Error('Request failed with status code 404');
    }
    if (method === 'GET' && endpoint === '/v2/flows') {
      return {
        count: 3,
        results: [{ block: true }, { block: false }, { block: true }],
      };
    }
    return {};
  });
  (client as any).request = request;
  return { client, request };
}

const calls = (request: jest.Mock) =>
  request.mock.calls.map(([method, endpoint]) => `${method} ${endpoint}`);

describe('resolveBoxGid', () => {
  it('prefers the explicit gid, then FIREWALLA_BOX_ID, then FIREWALLA_DEFAULT_BOX_ID', async () => {
    expect(
      await makeClient({ boxId: FLUME }).client.resolveBoxGid(PINEWOOD)
    ).toBe(PINEWOOD);
    expect(
      await makeClient({
        boxId: FLUME,
        defaultBoxId: PINEWOOD,
      }).client.resolveBoxGid()
    ).toBe(FLUME);
    const { client, request } = makeClient({ defaultBoxId: PINEWOOD });
    expect(await client.resolveBoxGid()).toBe(PINEWOOD);
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the account's only box", async () => {
    const { client } = makeClient({ boxes: [TWO_BOXES[0]] });
    expect(await client.resolveBoxGid()).toBe(FLUME);
  });

  it('refuses on a multi-box account, naming the boxes', async () => {
    const { client } = makeClient();
    const error = await client.resolveBoxGid().catch(e => e);
    expect(error).toBeInstanceOf(BoxSelectionError);
    expect(error.message).toContain(`Flume (${FLUME})`);
    expect(error.message).toContain(`Pinewood (${PINEWOOD})`);
  });

  it('refuses when the token sees no boxes', async () => {
    const { client } = makeClient({ boxes: [] });
    await expect(client.resolveBoxGid()).rejects.toThrow(
      'No boxes are visible to this MSP token'
    );
  });
});

describe('getSpecificAlarm', () => {
  it('asks only the gid it is given', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const res = await client.getSpecificAlarm('42', PINEWOOD);
    expect(res.results[0].gid).toBe(PINEWOOD);
    expect(calls(request)).toEqual([`GET /v2/alarms/${PINEWOOD}/42`]);
  });

  it('asks only the FIREWALLA_BOX_ID box when set', async () => {
    const { client, request } = makeClient({
      boxId: FLUME,
      alarms: { [PINEWOOD]: ['42'] },
    });
    await expect(client.getSpecificAlarm('42')).rejects.toThrow(/not found/);
    expect(calls(request)).toEqual([`GET /v2/alarms/${FLUME}/42`]);
  });

  it('without a box configured, checks each box until one has the alarm', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const res = await client.getSpecificAlarm('42');
    expect(res.results[0].gid).toBe(PINEWOOD);
    expect(calls(request)).toEqual([
      'GET /v2/boxes',
      `GET /v2/alarms/${FLUME}/42`,
      `GET /v2/alarms/${PINEWOOD}/42`,
    ]);
  });

  it('checks FIREWALLA_DEFAULT_BOX_ID first', async () => {
    const { client, request } = makeClient({
      defaultBoxId: PINEWOOD,
      alarms: { [PINEWOOD]: ['42'] },
    });
    await client.getSpecificAlarm('42');
    expect(calls(request)).toEqual([
      'GET /v2/boxes',
      `GET /v2/alarms/${PINEWOOD}/42`,
    ]);
  });

  it('reports not found after checking every box', async () => {
    const { client } = makeClient();
    await expect(client.getSpecificAlarm('42')).rejects.toThrow(/not found/);
  });
});

describe('get_specific_alarm tool', () => {
  it('reports "no boxes visible" as a validation error with its own message', async () => {
    const { client } = makeClient({ boxes: [] });
    const res = await new GetSpecificAlarmHandler().execute(
      { alarm_id: '42' },
      client
    );
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.errorType).toBe('validation_error');
    expect(body.message).toBe('No boxes are visible to this MSP token');
  });

  it('advertises alarm_id as a string or a number', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src', 'server.ts'),
      'utf8'
    );
    const start = source.indexOf("name: 'get_specific_alarm'");
    const block = source.slice(start, source.indexOf("name: '", start + 10));
    expect(block).toMatch(/alarm_id: \{\s*type: \['string', 'number'\]/);
  });

  it('accepts the numeric aid that get_active_alarms returns', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const res = await new GetSpecificAlarmHandler().execute(
      { alarm_id: 42, gid: PINEWOOD },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(calls(request)).toEqual([`GET /v2/alarms/${PINEWOOD}/42`]);
  });

  it('passes gid through to the client', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const res = await new GetSpecificAlarmHandler().execute(
      { alarm_id: '42', gid: PINEWOOD },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(calls(request)).toEqual([`GET /v2/alarms/${PINEWOOD}/42`]);
  });
});

describe('getFirewallSummary', () => {
  it('reports each box from /v2/boxes and no CPU, memory or uptime', async () => {
    const { client } = makeClient();
    const summary = await client.getFirewallSummary();
    expect(summary.status).toBe('partial');
    expect(summary.boxes_online).toBe(1);
    expect(summary.boxes_total).toBe(2);
    expect(summary.boxes.map(box => box.name)).toEqual(['Flume', 'Pinewood']);
    expect(summary.boxes[0]).toMatchObject({
      gid: FLUME,
      device_count: 10,
      alarm_count: 2,
      rule_count: 5,
    });
    expect(summary.recent_flows_sampled).toBe(3);
    expect(summary.blocked_in_sample).toBe(2);
    expect(summary).not.toHaveProperty('cpu_usage');
    expect(summary).not.toHaveProperty('memory_usage');
    expect(summary).not.toHaveProperty('uptime');
  });

  it('covers only the FIREWALLA_BOX_ID box when set', async () => {
    const { client } = makeClient({ boxId: PINEWOOD });
    const summary = await client.getFirewallSummary();
    expect(summary.status).toBe('offline');
    expect(summary.boxes.map(box => box.gid)).toEqual([PINEWOOD]);
  });

  it('is online when every box is, and unknown with no boxes', async () => {
    expect(
      (await makeClient({ boxes: [TWO_BOXES[0]] }).client.getFirewallSummary())
        .status
    ).toBe('online');
    expect(
      (await makeClient({ boxes: [] }).client.getFirewallSummary()).status
    ).toBe('unknown');
  });
});

describe('security_report prompt', () => {
  it('lists real box status on separate lines', async () => {
    const { client } = makeClient();
    const setRequestHandler = jest.fn();
    const fake = {
      getActiveAlarms: async () => ({
        count: 2,
        results: [
          { type: 1, message: 'first', ts: 1758800000 },
          { type: 2, message: 'second', ts: 1758800100 },
        ],
      }),
      getFirewallSummary: () => client.getFirewallSummary(),
      getSecurityMetrics: async () => ({
        total_alarms: 2,
        active_alarms: 2,
        blocked_connections: 0,
        suspicious_activities: 0,
        threat_level: 'low',
        last_threat_detected: '',
      }),
      getRecentThreats: async () => [],
    };
    setupPrompts({ setRequestHandler } as any, fake as any);
    const getPrompt = setRequestHandler.mock.calls[1][1];
    const res = await getPrompt({
      params: { name: 'security_report', arguments: { period: '24h' } },
    });
    const text: string = res.messages[0].content.text;
    expect(text).toContain(
      '**Firewall Status:** partial (1 of 2 boxes online)'
    );
    expect(text).toContain(`- Flume (goldpro, ${FLUME}): online;`);
    expect(text).toContain(
      `- Pinewood (goldpro, ${PINEWOOD}): offline, last seen`
    );
    expect(text).toContain('- Blocked in the 3 most recent flows: 2');
    expect(text).not.toContain('CPU Usage');
    expect(text).not.toContain('\\n');
    expect(text).toMatch(/- 1: first \(.*\)\n- 2: second/);
  });
});

describe('getRuleTrends', () => {
  it('adds no random variation to the counts', async () => {
    const { client } = makeClient();
    const now = Math.floor(Date.now() / 1000);
    (client as any).request = jest.fn(
      async (_method: string, endpoint: string) => {
        if (endpoint === '/v2/trends/rules') {
          throw new Error(
            'Bad Request: Invalid parameters sent to /v2/trends/rules'
          );
        }
        return {
          count: 2,
          results: [
            {
              id: 'r1',
              ts: now - 3600,
              updateTs: now - 3600,
              status: 'active',
            },
            {
              id: 'r2',
              ts: now - 7200,
              updateTs: now - 7200,
              status: 'active',
            },
          ],
        };
      }
    );
    const random = jest.spyOn(Math, 'random');
    const first = await client.getRuleTrends('24h');
    const second = await client.getRuleTrends('24h');
    expect(first.results.length).toBeGreaterThan(0);
    expect(second.results.map(point => point.value)).toEqual(
      first.results.map(point => point.value)
    );
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
