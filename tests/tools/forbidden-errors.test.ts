/**
 * The MSP API answers a box gid the token cannot access (wrong, malformed or
 * another account's) with 403 {"error":{"title":"Forbidden","message":"You
 * are not allowed to access this resource"}} (measured 2026-09-25 on
 * /v2/devices?box= and /v2/alarms/{gid}/{aid}). The client reported every
 * 403 as "Insufficient permissions. Please check your MSP subscription.",
 * and get_specific_alarm reported it as the alarm not being found. The HTTP
 * layer (axios) is stubbed; its errors pass through the client's own
 * response interceptor, as they do in production.
 */

import {
  FirewallaClient,
  forbiddenMessage,
} from '../../src/firewalla/client.js';
import { GetDeviceStatusHandler } from '../../src/tools/handlers/device.js';
import { GetSpecificAlarmHandler } from '../../src/tools/handlers/security.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: (error: any) => Boolean(error?.isAxiosError),
  };
});

const OWN_BOX = '11111111-2222-3333-4444-555555555555';
const OTHER_BOX = '66666666-7777-8888-9999-000000000000';

const FORBIDDEN_BODY = {
  error: {
    title: 'Forbidden',
    message: 'You are not allowed to access this resource',
    type: 'FORBIDDEN',
  },
};

/** An axios error for a response with `status` to a GET */
function axiosError(
  status: number,
  url: string,
  params: unknown,
  data: unknown
) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    config: { url, params },
    response: { status, statusText: '', data },
  };
}

/**
 * A client whose GETs fail like the live API: 403 for a box other than
 * OWN_BOX, 404 for an alarm OWN_BOX does not have. Failures go through the
 * response interceptor the client registered, unless `interceptor` is false.
 */
function makeClient(interceptor = true) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const api = (client as any).api;
  const use = api.interceptors.response.use as jest.Mock;
  const onRejected = use.mock.calls[use.mock.calls.length - 1][1];
  const get = api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (url: string, config: any) => {
    const params = config?.params ?? {};
    const alarmPath = /^\/v2\/alarms\/([^/]+)\//.exec(url);
    const box = alarmPath ? alarmPath[1] : params.box;
    let error;
    if (box && box !== OWN_BOX) {
      error = axiosError(403, url, params, FORBIDDEN_BODY);
    } else if (alarmPath) {
      error = axiosError(404, url, params, '');
    } else {
      return { status: 200, data: [], config: { url } };
    }
    return interceptor ? onRejected(error) : Promise.reject(error);
  });
  return client;
}

/** The error text of a tool response */
const errorText = (response: any) => response.content[0].text as string;

describe('403 on a box the token cannot access', () => {
  it('get_device_status says the box is not accessible, not the subscription', async () => {
    const response = await new GetDeviceStatusHandler().execute(
      { box: OTHER_BOX, limit: 10 },
      makeClient()
    );
    expect(response.isError).toBe(true);
    const text = errorText(response);
    expect(text).toContain(
      'Forbidden (HTTP 403): You are not allowed to access this resource'
    );
    expect(text).toContain('names a box this token cannot access');
    expect(text).toContain('get_boxes');
    expect(text).not.toMatch(/subscription/i);
  });

  it('search_devices says the same', async () => {
    const response = await new SearchDevicesHandler().execute(
      { query: 'online:true', box: OTHER_BOX, limit: 10 },
      makeClient()
    );
    expect(response.isError).toBe(true);
    expect(errorText(response)).toContain('Forbidden (HTTP 403)');
    expect(errorText(response)).not.toMatch(/subscription/i);
  });

  it('get_specific_alarm reports the refused box, not a missing alarm', async () => {
    const response = await new GetSpecificAlarmHandler().execute(
      { alarm_id: '1', gid: OTHER_BOX },
      makeClient()
    );
    expect(response.isError).toBe(true);
    const text = errorText(response);
    expect(text).toContain('Forbidden (HTTP 403)');
    expect(text).toContain('get_boxes');
    expect(text).not.toMatch(/not found/i);
  });

  it('get_specific_alarm still reports a missing alarm on an accessible box', async () => {
    const response = await new GetSpecificAlarmHandler().execute(
      { alarm_id: '1', gid: OWN_BOX },
      makeClient()
    );
    expect(response.isError).toBe(true);
    expect(errorText(response)).toMatch(/Alarm not found/);
  });

  it('request() gives the same message without the interceptor', async () => {
    await expect(
      makeClient(false).getDeviceStatus(
        undefined,
        true,
        10,
        undefined,
        OTHER_BOX
      )
    ).rejects.toThrow(/Forbidden \(HTTP 403\).*names a box/);
  });
});

describe('forbiddenMessage', () => {
  const forbidden = (config: Record<string, unknown>, data = FORBIDDEN_BODY) =>
    forbiddenMessage({ config, response: { data } });

  it.each([
    ['a box parameter', { url: '/v2/devices', params: { box: OTHER_BOX } }],
    ['a gid in the path', { url: `/v2/alarms/${OTHER_BOX}/1` }],
    [
      'a box in the body',
      {
        url: '/v2/rules/R1/pause',
        data: JSON.stringify({ duration: 60, box: OTHER_BOX }),
      },
    ],
  ])('says the request names a box for %s', (_what, config) => {
    const message = forbidden(config);
    expect(message).toContain('this request names one');
    // The gid is not quoted: handlers match "404" and "not found"
    expect(message).not.toContain(OTHER_BOX);
  });

  it('describes a 403 on a request that names no box without blaming a gid', () => {
    const message = forbidden({ url: '/v2/rules', params: { limit: 5 } });
    expect(message).toContain(
      'This MSP token cannot access the requested resource'
    );
    expect(message).not.toContain('this request names one');
    expect(message).toContain('get_boxes');
  });

  it('works without an API error body', () => {
    expect(
      forbiddenMessage({ config: { url: '/v2/rules' }, response: { data: '' } })
    ).toMatch(/^Forbidden \(HTTP 403\)\. /);
  });
});
