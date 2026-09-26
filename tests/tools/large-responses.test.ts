/**
 * Large responses keep their fields. Up to 1.4.1 the client rewrote any
 * result over 100,000 characters into a compact form with other field names
 * (alarm `aid` became `alarm_id`, `ts` an ISO `timestamp`, a flow's
 * `source.ip` a `source_ip`, a device's `network` a `network_name`, ...)
 * before the handlers saw it. The handlers read the API's names, so they
 * returned every record with aid "unknown", the current time or an
 * "unknown" source IP (measured live on 2026-09-25 at limit 500). These
 * tests stub responses well over that size and check that the fields
 * survive. The HTTP layer (axios) is stubbed; all values are invented.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import {
  GetNetworkRulesHandler,
  GetTargetListsHandler,
} from '../../src/tools/handlers/rules.js';
import { SearchAlarmsHandler } from '../../src/tools/handlers/search.js';

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

/** The size above which the client used to compact a response */
const OLD_THRESHOLD = 100_000;
const BOX = '11111111-2222-3333-4444-555555555555';
const START = 1790000000;

const mac = (i: number) =>
  `AA:BB:CC:00:${String(Math.floor(i / 256) % 256).padStart(2, '0')}:${(i % 256).toString(16).padStart(2, '0')}`;
const localIp = (i: number) =>
  `192.168.${Math.floor(i / 250)}.${(i % 250) + 1}`;
const remoteIp = (i: number) => `203.0.113.${(i % 250) + 1}`;

/** A flow shaped like the live API's, with its own ts and addresses */
function flow(i: number) {
  return {
    ts: START + i * 7 + 0.25,
    gid: BOX,
    protocol: i % 3 ? 'tcp' : 'udp',
    direction: 'outbound',
    block: false,
    blockType: '',
    blockedby: '',
    category: 'social',
    count: 2,
    country: 'US',
    region: 'US',
    domain: 'example.com',
    download: 5000 + i,
    upload: 100,
    total: 5100 + i,
    duration: 12.5,
    device: {
      id: mac(i),
      ip: localIp(i),
      name: `device-${i}`,
      macVendor: 'Vendor',
      type: 'device',
      deviceType: 'desktop',
    },
    source: { id: mac(i), ip: localIp(i), name: `device-${i}`, type: 'device' },
    destination: {
      id: 'www.example.com',
      ip: remoteIp(i),
      name: 'www.example.com',
      type: 'dns',
      portInfo: { port: 443, protocol: 'tcp' },
    },
    network: { gid: BOX, id: 'net-1', name: 'LAN', type: 'lan' },
  };
}

/** An alarm shaped like the live API's, with its own aid and ts */
function alarm(i: number) {
  return {
    ts: START + i * 60 + 0.5,
    gid: BOX,
    aid: 1000 + i,
    type: i % 2 ? 8 : 1,
    status: 1,
    message: `Device device-${i} watched video on example.com for a while`,
    direction: 'outbound',
    protocol: 'tcp',
    device: {
      id: mac(i),
      ip: localIp(i),
      name: `device-${i}`,
      network: { id: 'net-1', name: 'LAN' },
    },
    remote: {
      ip: remoteIp(i),
      name: 'www.example.com',
      domain: 'example.com',
      category: 'video',
      region: 'US',
    },
  };
}

/** A device as GET /v2/devices returns it, with a name over 30 characters */
function device(i: number) {
  return {
    id: mac(i),
    gid: BOX,
    name: `Media streamer number ${i}`,
    ip: localIp(i),
    mac: mac(i),
    macVendor: 'A vendor with a long company name',
    online: i % 2 === 0,
    ipReserved: false,
    lastSeen: START + i,
    network: { id: `net-${i % 3}`, name: `Network ${i % 3}` },
    group: { id: `grp-${i % 2}`, name: `Group ${i % 2}` },
    totalDownload: 1_000_000 + i,
    totalUpload: 50_000 + i,
  };
}

/** A rule as GET /v2/rules returns it */
function rule(i: number) {
  return {
    id: `rule-${i}`,
    gid: BOX,
    action: 'block',
    target: {
      type: 'domain',
      value: `blocked-${i}.example.com`,
      dnsOnly: true,
    },
    direction: 'bidirection',
    status: 'active',
    notes: `A note that explains why rule ${i} exists. `.repeat(4),
    hit: { count: i, lastHitTs: START + i },
    ts: START + i,
    updateTs: START + i + 1,
  };
}

const FLOWS = Array.from({ length: 500 }, (_, i) => flow(i));
const ALARMS = Array.from({ length: 500 }, (_, i) => alarm(i));
const DEVICES = Array.from({ length: 400 }, (_, i) => device(i));
const RULES = Array.from({ length: 400 }, (_, i) => rule(i));
const TARGET_LISTS = [
  {
    id: 'tl-1',
    name: 'A large user list',
    owner: 'global',
    category: 'ad',
    notes: 'Blocked hosts',
    targets: Array.from({ length: 20_000 }, (_, i) => `host-${i}.example.org`),
    lastUpdated: START,
  },
];

const BODIES: Record<string, unknown> = {
  '/v2/flows': { count: FLOWS.length, results: FLOWS },
  '/v2/alarms': { count: ALARMS.length, results: ALARMS },
  '/v2/devices': DEVICES,
  '/v2/rules': { count: RULES.length, results: RULES },
  '/v2/target-lists': TARGET_LISTS,
};

function makeClient() {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (endpoint: string) => ({
    status: 200,
    data: BODIES[endpoint] ?? { count: 0, results: [] },
    config: { url: endpoint },
  }));
  return client;
}

/** The parsed text of a tool response */
const body = (response: any) => JSON.parse(response.content[0].text);
const second = (text: string) => Math.floor(Date.parse(text) / 1000);
const iso = (ts: number) => new Date(ts * 1000).toISOString();

it('the stubbed responses are over the old compaction threshold', () => {
  for (const data of Object.values(BODIES)) {
    expect(JSON.stringify(data).length).toBeGreaterThan(OLD_THRESHOLD);
  }
});

describe('a large flow response', () => {
  it('getFlowData returns the flows as the API sent them', async () => {
    const result = await makeClient().getFlowData(
      undefined,
      undefined,
      'ts:desc',
      500
    );
    expect(result.results).toHaveLength(500);
    result.results.forEach((got, i) => {
      expect(got.ts).toBe(FLOWS[i].ts);
      expect(got.source?.ip).toBe(FLOWS[i].source.ip);
      expect(got.destination?.ip).toBe(FLOWS[i].destination.ip);
      expect(got.device.id).toBe(FLOWS[i].device.id);
      expect(got.domain).toBe('example.com');
    });
  });

  it('get_flow_data keeps each flow ts, addresses and device', async () => {
    const response = await new GetFlowDataHandler().execute(
      { limit: 500 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    // limit 500 is served as the first chunk of a stream
    const flows = body(response).data;
    expect(flows).toHaveLength(500);
    flows.forEach((got: any, i: number) => {
      expect(second(got.timestamp)).toBe(Math.floor(FLOWS[i].ts));
      expect(got.source_ip).toBe(FLOWS[i].source.ip);
      expect(got.destination_ip).toBe(FLOWS[i].destination.ip);
      expect(got.device.id).toBe(FLOWS[i].device.id);
      expect(got.domain).toBe('example.com');
    });
  });
});

describe('a large alarm response', () => {
  it('getActiveAlarms returns the alarms as the API sent them', async () => {
    const result = await makeClient().getActiveAlarms(
      undefined,
      undefined,
      'ts:desc',
      500
    );
    expect(result.results).toHaveLength(500);
    result.results.forEach((got, i) => {
      expect(got.aid).toBe(ALARMS[i].aid);
      // The client turns ts into an ISO string
      expect(got.ts).toBe(iso(ALARMS[i].ts));
      expect(got.device?.ip).toBe(ALARMS[i].device.ip);
    });
  });

  it('get_active_alarms keeps each alarm aid, ts, type and IPs', async () => {
    const response = await new GetActiveAlarmsHandler().execute(
      { limit: 500 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const { alarms } = body(response).data;
    expect(alarms).toHaveLength(500);
    alarms.forEach((got: any, i: number) => {
      expect(got.aid).toBe(ALARMS[i].aid);
      expect(got.ts).toBe(iso(ALARMS[i].ts));
      expect(got.type).toBe(ALARMS[i].type);
      expect(got.message).toBe(ALARMS[i].message);
      expect(got.device.ip).toBe(ALARMS[i].device.ip);
      expect(got.remote.ip).toBe(ALARMS[i].remote.ip);
    });
  });

  it('search_alarms keeps each alarm aid and ts', async () => {
    const response = await new SearchAlarmsHandler().execute(
      { query: 'status:1', limit: 500 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const { alarms } = body(response).data;
    expect(alarms).toHaveLength(500);
    alarms.forEach((got: any, i: number) => {
      expect(Number(got.aid)).toBe(ALARMS[i].aid);
      expect(got.ts).toBe(iso(ALARMS[i].ts));
    });
  });
});

describe('a large device, rule or target list response', () => {
  it('get_device_status keeps names, networks, groups and the total', async () => {
    const response = await new GetDeviceStatusHandler().execute(
      { limit: 1000 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const data = body(response).data;
    expect(data.total_devices).toBe(DEVICES.length);
    expect(data.devices).toHaveLength(DEVICES.length);
    const byId = new Map(DEVICES.map(d => [d.id, d]));
    for (const got of data.devices) {
      const sent = byId.get(got.id)!;
      expect(got.name).toBe(sent.name);
      expect(got.mac_vendor).toBe(sent.macVendor);
      expect(got.network).toEqual(sent.network);
      expect(got.group).toEqual(sent.group);
    }
  });

  it('get_network_rules keeps targets, hits, notes and times', async () => {
    const response = await new GetNetworkRulesHandler().execute(
      { limit: 1000 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const { rules } = body(response).data;
    expect(rules).toHaveLength(RULES.length);
    rules.forEach((got: any, i: number) => {
      // Field names are snake_cased on the way out
      expect(got.target).toEqual({
        type: 'domain',
        value: RULES[i].target.value,
        dns_only: true,
      });
      expect(got.hit).toEqual({
        count: RULES[i].hit.count,
        last_hit_ts: RULES[i].hit.lastHitTs,
      });
      expect(got.notes).toBe(RULES[i].notes);
      expect(second(got.created_at)).toBe(RULES[i].ts);
    });
  });

  it('get_target_lists counts every entry and returns its first 500', async () => {
    const response = await new GetTargetListsHandler().execute(
      { limit: 10 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const [list] = body(response).data.target_lists;
    expect(list.entry_count).toBe(20_000);
    expect(list.targets).toEqual(TARGET_LISTS[0].targets.slice(0, 500));
    expect(list.notes).toBe('Blocked hosts');
  });
});
