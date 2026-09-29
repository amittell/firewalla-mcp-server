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

function answer(url: string): unknown {
  const now = Math.floor(Date.now() / 1000);
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
          ts: now,
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
      ['Security activity', null],
      ['Device offline', null],
      ['Porn activity', null],
      ['Abnormal upload', 'high'],
      ['Blocked Connection', null],
    ]);
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
        ['Security activity', null, false],
        ['Device offline', null, false],
        ['Porn activity', null, false],
        ['Abnormal upload', 'high', true],
        ['Blocked Connection', null, false],
      ]);
    } finally {
      await client.close();
    }
  });
});
