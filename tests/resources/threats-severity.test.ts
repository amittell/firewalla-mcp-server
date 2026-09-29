/**
 * firewalla://threats/recent reports an alarm's severity only where the
 * API sends one. The API reference's alarm and flow models carry no
 * severity, and getRecentThreats derived one from the alarm type number
 * (5 and up high, 3 and 4 medium, else low) and gave every blocked flow
 * "medium", so a Security Activity alarm (type 1) was low and Device
 * Offline (type 7) high. The API is stubbed; nothing leaves the process.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { FirewallaMCPServer } from '../../src/server.js';

/** When set, the alarms the stub answers instead of the four below */
let alarmsOverride: unknown[] | undefined;

/** One clock for every answer: two reads a second apart put the flow first */
const NOW = Math.floor(Date.now() / 1000);

function answer(url: string): unknown {
  const now = NOW;
  if (url === '/v2/alarms' && alarmsOverride) {
    return { count: alarmsOverride.length, results: alarmsOverride };
  }
  if (url === '/v2/alarms') {
    return {
      count: 4,
      results: [
        {
          aid: 1,
          gid: 'box-a',
          type: 1,
          status: 1,
          ts: now,
          message: 'Security activity',
        },
        {
          aid: 2,
          gid: 'box-a',
          type: 7,
          status: 1,
          ts: now,
          message: 'Device offline',
        },
        {
          aid: 3,
          gid: 'box-a',
          type: 10,
          status: 1,
          ts: now,
          message: 'Porn activity',
        },
        {
          aid: 4,
          gid: 'box-a',
          type: 2,
          status: 1,
          ts: now,
          message: 'Abnormal upload',
          severity: 'high',
        },
      ],
    };
  }
  if (url === '/v2/flows') {
    return {
      count: 1,
      results: [
        {
          // A minute older than the alarms, so it sorts after them
          ts: now - 60,
          gid: 'box-a',
          protocol: 'tcp',
          direction: 'outbound',
          block: true,
          count: 1,
          device: {
            id: 'aa:bb:cc:dd:ee:ff',
            ip: '192.168.1.2',
            name: 'laptop',
          },
          destination: { ip: '10.0.0.9' },
        },
      ],
    };
  }
  if (url === '/v2/boxes') {
    return [];
  }
  return { count: 0, results: [] };
}

jest.mock('axios', () => {
  const verb = () => async (url: string) => ({
    status: 200,
    data: answer(url),
    config: { url },
  });
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: verb(),
    post: verb(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

function makeClient() {
  return new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
}

describe('getRecentThreats', () => {
  it('takes an alarm severity from the payload, and null where there is none', async () => {
    const threats = await makeClient().getRecentThreats(24);
    expect(threats.map(threat => [threat.type, threat.severity])).toEqual([
      ['Security Activity', null],
      ['Device Offline', null],
      ['Porn Activity', null],
      ['Abnormal Upload', 'high'],
      ['Blocked Connection', null],
    ]);
  });
});

describe('getRecentThreats, what each threat says', () => {
  afterEach(() => {
    alarmsOverride = undefined;
  });

  it('names the alarm type, keeps the message, and does not call an alarm blocked', async () => {
    const threats = await makeClient().getRecentThreats(24);
    const alarm = threats.find(threat => threat.type === 'Security Activity');
    expect(alarm).toMatchObject({
      message: 'Security activity',
      action_taken: 'alarm raised',
    });
    const flow = threats.find(threat => threat.type === 'Blocked Connection');
    expect(flow).toMatchObject({ message: null, action_taken: 'blocked' });
  });

  it('keeps a recent blocked flow when the window holds more than 100 older alarms', async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    alarmsOverride = Array.from({ length: 120 }, (_, i) => ({
      aid: i + 1,
      gid: 'box-a',
      type: 8,
      status: 1,
      ts: hourAgo - i,
      message: `Video ${i}`,
    }));
    const threats = await makeClient().getRecentThreats(24);
    expect(threats).toHaveLength(100);
    expect(threats[0].type).toBe('Blocked Connection');
    const times = threats.map(threat => Date.parse(threat.timestamp));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe('firewalla://threats/recent', () => {
  it('counts only the severities the API sent, and says it sends none', async () => {
    const server = (new FirewallaMCPServer() as any).server as Server;
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: 'threats-severity-test',
      version: '0.0.0',
    });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const { contents } = await client.readResource({
        uri: 'firewalla://threats/recent',
      });
      const [resource] = contents;
      const recent = JSON.parse(
        'text' in resource ? resource.text : ''
      ).recent_threats;
      expect(recent.statistics.total).toBe(5);
      expect(recent.statistics.by_severity).toEqual({ high: 1 });
      expect(recent.statistics.without_severity).toBe(4);
      expect(recent.severity_note).toContain('no severity');
      const bySeverity = recent.threats.map((threat: any) => [
        threat.type,
        threat.severity,
        'severity_emoji' in threat,
      ]);
      expect(bySeverity).toEqual([
        ['Security Activity', null, false],
        ['Device Offline', null, false],
        ['Porn Activity', null, false],
        ['Abnormal Upload', 'high', true],
        ['Blocked Connection', null, false],
      ]);
    } finally {
      await client.close();
    }
  });
});
