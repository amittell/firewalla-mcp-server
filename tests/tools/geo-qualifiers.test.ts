/**
 * Geographic qualifiers in a query. The flow and alarm field lists accepted
 * `country:`, `continent:`, `city:`, `asn:` and similar names, and the query
 * was sent, but the MSP API documents one geographic qualifier, `region`
 * (an ISO 3166 country code; `remote.region`, alias Region, on alarms), and
 * answers a qualifier it does not know with no results. They are refused
 * before a request now, with `region:` as the suggestion for country codes.
 *
 * Country codes are checked against the 249 assigned ISO 3166-1 alpha-2
 * codes; the table used before had 187, and refused CY, MT, MC, LI and AD.
 * The HTTP layer is stubbed at axios.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchFlowsHandler,
} from '../../src/tools/handlers/search.js';
import { GetFlowDataHandler } from '../../src/tools/handlers/network.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';
import {
  isValidCountryCode,
  validateCountryCodes,
} from '../../src/utils/geographic.js';
import {
  geographicFiltersToMspQuery,
  refuseUndocumentedGeoQualifiers,
} from '../../src/utils/geographic-filters.js';
import { MspQueryError } from '../../src/utils/msp-query.js';
import { logger } from '../../src/monitoring/logger.js';

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

const body = (res: any) => JSON.parse(res.content[0].text);

function refusal(query: string): MspQueryError {
  try {
    refuseUndocumentedGeoQualifiers(query);
  } catch (error) {
    return error as MspQueryError;
  }
  throw new Error(`${query} was not refused`);
}

describe('refuseUndocumentedGeoQualifiers', () => {
  it.each([
    ['country:US', ['region:US']],
    ['country:us,cn', ['region:US,CN']],
    ['protocol:tcp AND country:CN', ['protocol:tcp region:CN']],
    ['-country:CN', ['-region:CN']],
    ['country_code:GB', ['region:GB']],
    ['remote_country:DE', ['region:DE']],
    ['country:China', []],
    ['continent:Asia', []],
    ['city:Paris', []],
    ['asn:AS4134', []],
    ['isp:comcast', []],
    ['is_vpn:true', []],
    ['hosting_provider:amazon', []],
    ['geographic_risk_score:>=7', []],
  ])('refuses %s, suggesting %j', (query, suggestions) => {
    const error = refusal(query);
    expect(error).toBeInstanceOf(MspQueryError);
    expect(error.message).toContain('region');
    expect(error.suggestions).toEqual(suggestions);
  });

  it('names every refused qualifier', () => {
    const error = refusal('continent:Asia city:Paris protocol:tcp');
    expect(error.message).toContain('continent, city');
    expect(error.part).toBe('continent:Asia city:Paris');
  });

  it.each(['region:US', 'region:US,CN', 'protocol:tcp -region:CN', 'porn', ''])(
    'lets %s through',
    query => {
      expect(() => refuseUndocumentedGeoQualifiers(query)).not.toThrow();
    }
  );
});

describe('geographic qualifiers typed in a query', () => {
  it.each([
    ['search_flows', 'country:US', () => new SearchFlowsHandler()],
    ['search_flows', 'status:blocked AND continent:Asia', () => new SearchFlowsHandler()],
    ['search_flows', 'asn:AS4134', () => new SearchFlowsHandler()],
    ['search_alarms', 'type:1 AND country:CN', () => new SearchAlarmsHandler()],
    ['get_flow_data', 'city:Paris', () => new GetFlowDataHandler()],
  ])('%s refuses %s before a request', async (_tool, query, handler) => {
    const { client, get } = makeClient();
    const warn = jest.spyOn(logger, 'warn');
    const res = await handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBe(true);
    const error = body(res);
    expect(error.errorType).toBe('validation_error');
    expect(error.message).toContain('region');
    expect(get).not.toHaveBeenCalled();
    // not retried: a refusal fails the same way every time
    expect(
      warn.mock.calls.filter(([message]) => /retrying/.test(String(message)))
    ).toEqual([]);
    warn.mockRestore();
  });

  it('suggests region: for a country code', async () => {
    const { client } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'status:blocked AND country:CN', limit: 10 },
      client
    );
    expect(body(res).details.suggested_queries).toEqual([
      'status:blocked region:CN',
    ]);
  });

  it('sends region: as before', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'status:blocked AND region:CN', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(get.mock.calls[0][1].params.query).toBe('status:blocked region:CN');
  });
});

describe('country codes', () => {
  it.each(['CY', 'MT', 'MC', 'LI', 'AD', 'AQ', 'BV', 'SS', 'CW', 'us', 'gb'])(
    '%s is an ISO 3166-1 alpha-2 code',
    code => {
      expect(isValidCountryCode(code)).toBe(true);
    }
  );

  it.each(['XK', 'UK', 'EU', 'UN', 'SU', 'XX', 'USA', 'U', ''])(
    '%s is not an assigned code',
    code => {
      expect(isValidCountryCode(code)).toBe(false);
    }
  );

  it('geographic_filters takes the codes the old table lacked', () => {
    expect(
      geographicFiltersToMspQuery({ countries: ['CY', 'MT', 'MC', 'LI', 'AD'] })
    ).toBe('region:CY,MT,MC,LI,AD');
    expect(validateCountryCodes(['cy', 'XK'])).toEqual({
      valid: ['CY'],
      invalid: ['XK'],
    });
  });

  it('search_flows sends them', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'protocol:tcp', limit: 10, geographic_filters: { countries: ['MT', 'CY'] } },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(get.mock.calls[0][1].params.query).toBe('protocol:tcp region:MT,CY');
  });
});

describe('dotted geographic qualifiers', () => {
  // The check matched whole names only, and dotted names go to the API
  // unchecked, so remote.country:CN and destination.country:CN were sent
  // and found nothing. The documented dotted qualifier, remote.region on
  // alarms, is kept.
  function refusalOn(query: string, endpoint: string): MspQueryError {
    try {
      refuseUndocumentedGeoQualifiers(query, endpoint);
    } catch (error) {
      return error as MspQueryError;
    }
    throw new Error(`${query} was not refused on ${endpoint}`);
  }

  it.each([
    ['remote.country:CN', '/v2/alarms', ['region:CN']],
    ['Remote.Country:CN', '/v2/alarms', ['region:CN']],
    ['remote.geo.country:CN', '/v2/alarms', ['region:CN']],
    ['device.country:US', '/v2/alarms', ['region:US']],
    ['remote.continent:Asia', '/v2/alarms', []],
    ['remote.asn:AS4134', '/v2/alarms', []],
    ['destination.country:CN', '/v2/flows', ['region:CN']],
    ['source.city:Paris', '/v2/flows', []],
    ['destination.region:CN', '/v2/flows', ['region:CN']],
    ['remote.region:CN', '/v2/flows', ['region:CN']],
    ['device.region:CN', '/v2/alarms', ['region:CN']],
  ])('refuses %s on %s, suggesting %j', (query, endpoint, suggestions) => {
    const error = refusalOn(query, endpoint);
    expect(error).toBeInstanceOf(MspQueryError);
    expect(error.suggestions).toEqual(suggestions);
  });

  it.each([
    ['remote.region:CN', '/v2/alarms'],
    ['remote.region:CN,RU type:1', '/v2/alarms'],
    ['region:CN', '/v2/flows'],
    ['region:CN', '/v2/alarms'],
    ['device.network.name:Guest', '/v2/alarms'],
    ['network.name:Guest', '/v2/flows'],
    ['remote.domain:example.com', '/v2/alarms'],
  ])('lets %s through on %s', (query, endpoint) => {
    expect(() => refuseUndocumentedGeoQualifiers(query, endpoint)).not.toThrow();
  });

  it.each([
    ['search_alarms', 'type:1 AND remote.country:CN', () => new SearchAlarmsHandler()],
    ['get_active_alarms', 'remote.country:CN', () => new GetActiveAlarmsHandler()],
    ['search_flows', 'destination.country:CN', () => new SearchFlowsHandler()],
    ['search_flows', 'remote.region:CN', () => new SearchFlowsHandler()],
    ['get_flow_data', 'status:blocked destination.region:CN', () => new GetFlowDataHandler()],
  ])('%s refuses %s before a request', async (_tool, query, handler) => {
    const { client, get } = makeClient();
    const res = await handler().execute({ query, limit: 10 }, client);
    expect(res.isError).toBe(true);
    expect(body(res).errorType).toBe('validation_error');
    expect(get).not.toHaveBeenCalled();
  });

  it('search_alarms sends remote.region, which alarms document', async () => {
    const { client, get } = makeClient();
    const res = await new SearchAlarmsHandler().execute(
      { query: 'type:1 AND remote.region:CN', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(get.mock.calls[0][1].params.query).toBe('type:1 remote.region:CN');
  });
});
