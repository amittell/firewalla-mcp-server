/**
 * Tool responses are compact JSON. Up to 1.5.0 every tool response was
 * JSON.stringify(x, null, 2), and the indentation made a large answer about
 * half as long again (get_device_status with 400 devices: 237,373 bytes
 * indented, 157,229 compact). These tests call the handlers with the HTTP
 * layer (axios) stubbed and check that the text of a unified, a streamed and
 * an error response has no newlines, is exactly the compact serialization of
 * what it parses to, and still carries the data. All values are invented.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';

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

const BOX = '11111111-2222-3333-4444-555555555555';
const START = 1790000000;

const DEVICES = Array.from({ length: 5 }, (_, i) => ({
  id: `AA:BB:CC:00:00:0${i}`,
  gid: BOX,
  name: `device-${i}`,
  ip: `192.168.1.${i + 1}`,
  mac: `AA:BB:CC:00:00:0${i}`,
  macVendor: 'Vendor',
  online: i % 2 === 0,
  lastSeen: START + i,
  network: { id: 'net-1', name: 'LAN' },
  group: { id: 'grp-1', name: 'Group 1' },
}));

const FLOWS = Array.from({ length: 5 }, (_, i) => ({
  ts: START + i,
  gid: BOX,
  protocol: 'tcp',
  direction: 'outbound',
  block: false,
  domain: 'example.com',
  download: 5000,
  upload: 100,
  total: 5100,
  device: { id: DEVICES[i].id, ip: DEVICES[i].ip, name: DEVICES[i].name },
  source: { id: DEVICES[i].id, ip: DEVICES[i].ip, name: DEVICES[i].name },
  destination: { id: 'www.example.com', ip: `203.0.113.${i + 1}` },
}));

const BODIES: Record<string, unknown> = {
  '/v2/devices': DEVICES,
  '/v2/flows': { count: FLOWS.length, results: FLOWS },
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

/** The parsed text of a response, after checking that it is compact */
function compactBody(response: any): any {
  expect(response.content).toHaveLength(1);
  const { text } = response.content[0];
  const parsed = JSON.parse(text);
  expect(text).not.toContain('\n');
  expect(text).toBe(JSON.stringify(parsed));
  return parsed;
}

describe('tool responses are compact JSON', () => {
  it('a unified response (get_device_status)', async () => {
    const response = await new GetDeviceStatusHandler().execute(
      { limit: 10 },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const body = compactBody(response);
    expect(body.success).toBe(true);
    expect(body.data.total_devices).toBe(DEVICES.length);
    const byId = new Map(DEVICES.map(d => [d.id, d]));
    expect(body.data.devices).toHaveLength(DEVICES.length);
    for (const got of body.data.devices) {
      const sent = byId.get(got.id)!;
      expect(got.name).toBe(sent.name);
      expect(got.mac_vendor).toBe(sent.macVendor);
      expect(got.network).toEqual(sent.network);
      expect(got.group).toEqual(sent.group);
    }
  });

  it('a streamed response (get_flow_data with stream)', async () => {
    const response = await new GetFlowDataHandler().execute(
      { limit: 5, stream: true },
      makeClient()
    );
    expect(response.isError).toBeFalsy();
    const body = compactBody(response);
    expect(body.streaming).toBe(true);
    expect(body.data).toHaveLength(FLOWS.length);
    body.data.forEach((got: any, i: number) => {
      expect(got.source_ip).toBe(FLOWS[i].source.ip);
      expect(got.destination_ip).toBe(FLOWS[i].destination.ip);
    });
  });

  it('an error response (get_device_status with a bad limit)', async () => {
    const response = await new GetDeviceStatusHandler().execute(
      { limit: -1 },
      makeClient()
    );
    expect(response.isError).toBe(true);
    const body = compactBody(response);
    expect(body.error).toBe(true);
    expect(body.tool).toBe('get_device_status');
    expect(body.message).toBe('Parameter validation failed');
    expect(body.validation_errors.length).toBeGreaterThan(0);
  });
});
