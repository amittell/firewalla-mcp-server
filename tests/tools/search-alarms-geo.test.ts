/**
 * search_alarms gives an alarm's remote end and its geography, as
 * get_active_alarms gives the remote end and search_flows the geography
 * of a flow's ends. It returned the remote IP alone, as source_ip, and
 * dropped the rest of the alarm's remote object: the country the API
 * sends as remote.region, and the domain and category. The country is
 * the API's where it sends one; the client's geoip-lite lookup fills in
 * only what the API does not send. The API is stubbed; the lookup is the
 * real one, which places 8.8.8.8 in the US.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';

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

function makeClient(results: unknown[]) {
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
  get.mockImplementation(async () => ({
    status: 200,
    data: { count: results.length, results },
  }));
  return client;
}

const body = (res: any) => JSON.parse(res.content[0].text);

const alarm = (remote?: Record<string, unknown>) => ({
  aid: 1,
  gid: 'box-a',
  type: 1,
  ts: 1700000000,
  status: 1,
  message: 'Security activity',
  direction: 'outbound',
  protocol: 'tcp',
  device: { id: 'aa:bb:cc:dd:ee:ff', ip: '192.168.1.2', name: 'laptop' },
  ...(remote && { remote }),
});

async function searchAlarms(results: unknown[]) {
  const res = await new SearchAlarmsHandler().execute(
    { query: 'type:1', limit: 10 },
    makeClient(results)
  );
  expect(res.isError).toBeFalsy();
  return body(res);
}

describe('search_alarms gives the remote end', () => {
  it('as the API sent it, with its country', async () => {
    const remote = {
      ip: '8.8.8.8',
      domain: 'dns.google',
      region: 'US',
      category: 'search',
    };
    const { data, meta } = await searchAlarms([alarm(remote)]);
    const [found] = data.alarms;
    expect(found.remote).toEqual(remote);
    expect(found.remote_country).toBe('US');
    expect(found.remote_continent).toBe('North America');
    expect(meta.geo_enriched).toBe(true);
  });

  it("keeps the API's country where the lookup disagrees", async () => {
    const [found] = (
      await searchAlarms([alarm({ ip: '8.8.8.8', region: 'DE' })])
    ).data.alarms;
    expect(found.remote_country).toBe('DE');
    expect(found.remote_continent).toBe('Europe');
    // The lookup's city is for another country, so none is given
    expect(found.remote_city).toBeNull();
  });

  it('takes the country from the lookup when the API sends none', async () => {
    const [found] = (await searchAlarms([alarm({ ip: '8.8.8.8' })])).data
      .alarms;
    expect(found.remote_country).toBe('US');
    expect(found.remote_continent).toBe('North America');
  });

  it('gives no remote and no country for an alarm without one', async () => {
    const { data, meta } = await searchAlarms([alarm()]);
    const [found] = data.alarms;
    expect(found).not.toHaveProperty('remote');
    expect([
      found.remote_country,
      found.remote_city,
      found.remote_continent,
    ]).toEqual([null, null, null]);
    expect(meta.geo_enriched).toBe(false);
  });
});

describe('geo_enriched counts the flat country fields search_flows gives', () => {
  const flow = (destination: string) => ({
    ts: 1700000000,
    gid: 'box-a',
    protocol: 'tcp',
    direction: 'outbound',
    block: false,
    count: 1,
    device: { id: 'aa:bb:cc:dd:ee:ff', ip: '192.168.1.2', name: 'laptop' },
    source: { ip: '192.168.1.2' },
    destination: { ip: destination },
  });

  it.each([
    ['8.8.8.8', true],
    ['192.168.1.9', false],
  ])('search_flows to %s: %s', async (destination, enriched) => {
    const res = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 10 },
      makeClient([flow(destination)])
    );
    const { data, meta } = body(res);
    expect(data.flows[0].destination_country).toBe(enriched ? 'US' : 'unknown');
    expect(meta.geo_enriched).toBe(enriched);
  });
});
