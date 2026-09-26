/**
 * search_flows' geographic_filters reach the API only as the documented
 * flow qualifier `region` (an ISO 3166 country code). Reproduced 2026-09-26
 * with GET /v2/flows stubbed: `{countries: ["US","CN"]}` was sent as
 * `country:US,CN`, `{continents: ["Asia"]}` as `continent:Asia` and
 * `{cities: ["Paris"]}` as `city:Paris`, none of them documented; the API
 * answers a qualifier it does not know with HTTP 200 and no results, so each
 * search found nothing. An unknown country code was reported as a search
 * error after a retry. The HTTP layer is stubbed at axios.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';
import { SearchEngine } from '../../src/tools/search.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import {
  GeographicFilterError,
  geographicFiltersToMspQuery,
} from '../../src/utils/geographic-filters.js';

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
  get.mockResolvedValue({ status: 200, data: { count: 0, results: [] } });
  return { client, get };
}

/** The query of every GET that went out */
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

const body = (res: any) => JSON.parse(res.content[0].text);

async function searchFlows(geographic_filters: unknown, query = 'protocol:tcp') {
  const { client, get } = makeClient();
  const res = await new SearchFlowsHandler().execute(
    { query, limit: 10, geographic_filters },
    client
  );
  return { res, get };
}

describe('geographicFiltersToMspQuery', () => {
  it.each([
    [{ countries: ['US', 'CN'] }, 'region:US,CN'],
    [{ countries: ['us'] }, 'region:US'],
    // regions holding country codes are the same qualifier
    [{ regions: ['GB'] }, 'region:GB'],
    [{ countries: ['US'], regions: ['US', 'CN'] }, 'region:US,CN'],
    // filters that ask for nothing
    [{ countries: [], exclude_vpn: false, exclude_cloud: false }, undefined],
    [{}, undefined],
    [undefined, undefined],
  ])('%j -> %s', (filters, expected) => {
    expect(geographicFiltersToMspQuery(filters)).toBe(expected);
  });

  it.each([
    [{ continents: ['Asia'] }, ['continents']],
    [{ cities: ['Paris'] }, ['cities']],
    [{ asns: ['AS15169'] }, ['asns']],
    [{ hosting_providers: ['amazon'] }, ['hosting_providers']],
    [{ exclude_vpn: true }, ['exclude_vpn']],
    [{ exclude_cloud: true }, ['exclude_cloud']],
    [{ min_risk_score: 5 }, ['min_risk_score']],
    [{ high_risk_countries: true }, ['high_risk_countries']],
    [{ country: 'US' }, ['country']],
    [
      { countries: ['US'], continents: ['Asia'], exclude_vpn: true },
      ['continents', 'exclude_vpn'],
    ],
  ])('refuses %j, naming %j', (filters, unsupported) => {
    let error: unknown;
    try {
      geographicFiltersToMspQuery(filters);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GeographicFilterError);
    expect((error as GeographicFilterError).unsupported).toEqual(unsupported);
    for (const name of unsupported) {
      expect((error as Error).message).toContain(`geographic_filters.${name}`);
    }
  });

  it.each([
    [{ countries: ['XX'] }, { countries: ['XX'] }],
    [{ regions: ['Eastern Europe'] }, { regions: ['Eastern Europe'] }],
    [{ countries: 'US' }, { countries: ['"US"'] }],
  ])('refuses the values of %j', (filters, invalid) => {
    expect(() => geographicFiltersToMspQuery(filters)).toThrow(
      GeographicFilterError
    );
    try {
      geographicFiltersToMspQuery(filters);
    } catch (error) {
      expect((error as GeographicFilterError).invalid).toEqual(invalid);
    }
  });
});

describe('search_flows geographic_filters', () => {
  it('sends countries as region:, a comma list the API reads as either', async () => {
    const { res, get } = await searchFlows({ countries: ['US', 'CN'] });
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual(['protocol:tcp region:US,CN']);
  });

  it.each([
    [{ continents: ['Asia'] }, 'continents'],
    [{ cities: ['Paris'] }, 'cities'],
    [{ asns: ['AS4134'] }, 'asns'],
    [{ hosting_providers: ['amazon'] }, 'hosting_providers'],
    [{ exclude_vpn: true }, 'exclude_vpn'],
    [{ exclude_cloud: true }, 'exclude_cloud'],
    [{ min_risk_score: 7 }, 'min_risk_score'],
  ])(
    'refuses %j as a validation error naming it, before a request',
    async (filters, name) => {
      const { res, get } = await searchFlows(filters);
      expect(res.isError).toBe(true);
      const error = body(res);
      expect(error.errorType).toBe('validation_error');
      expect(error.message).toContain(`geographic_filters.${name}`);
      expect(error.details.unsupported_filters).toEqual([name]);
      expect(get).not.toHaveBeenCalled();
    }
  );

  it('refuses an unknown country code as a validation error, with no request', async () => {
    const started = Date.now();
    const { res, get } = await searchFlows({ countries: ['XX'] });
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.errorType).toBe('validation_error');
    expect(error.details.invalid_values).toEqual({ countries: ['XX'] });
    expect(get).not.toHaveBeenCalled();
    // it used to be retried after a delay of about two seconds
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuses a country the query already limits to another, as the API would read both as either', async () => {
    const { res, get } = await searchFlows({ countries: ['CN'] }, 'region:US');
    expect(res.isError).toBe(true);
    expect(body(res).errorType).toBe('validation_error');
    expect(get).not.toHaveBeenCalled();
  });

  it('the search engine throws the same error for a direct call', async () => {
    const { client, get } = makeClient();
    await expect(
      new SearchEngine(client).searchFlows({
        query: 'protocol:tcp',
        limit: 10,
        geographic_filters: { continents: ['Asia'] },
      })
    ).rejects.toThrow(GeographicFilterError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('geographic alarm search and statistics', () => {
  // searchAlarmsByGeography sends the query `*` and getGeographicStatistics
  // `*` when no time range is given; neither handler is registered, so no
  // tool reaches them
  it.each(['search_alarms_by_geography', 'get_geographic_statistics'])(
    '%s is not a registered tool',
    name => {
      const registry = new ToolRegistry({ enableWriteTools: true });
      expect(registry.getHandler(name)).toBeUndefined();
      expect(registry.getToolNames()).not.toContain(name);
    }
  );
});
