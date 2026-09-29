/**
 * get_specific_alarm says "Alarm not found" only when every box it asked
 * answered 404. Measured live on 2026-09-29, it said "Alarm not found:
 * 999999999. The alarm may have been deleted or the ID may be incorrect."
 * with a bad token (401) and with an MSP host that does not resolve
 * (ENOTFOUND): getSpecificAlarm turned any failure into "Alarm not found:
 * tried N box(es) ...", and the handler matched "not found" in the text.
 * Any other failure now comes through as it was, with its class and status.
 */

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  AlarmNotFoundError,
  ApiRequestError,
} from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  closedPort,
  json,
  makeClient,
  startLocalApi,
} from './local-api.js';

const BOX_B = '66666666-7777-8888-9999-000000000000';

/** How each box answers GET /v2/alarms/<gid>/<aid>: a status, or 'found' */
let answers: Record<string, number | 'found'>;
let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((_request, response, path) => {
    if (path === '/v2/boxes') {
      json(response, 200, [
        { gid: BOX, name: 'home' },
        { gid: BOX_B, name: 'office' },
      ]);
      return;
    }
    const gid = path.split('/')[3];
    const answer = answers[gid] ?? 404;
    if (answer === 'found') {
      json(response, 200, { aid: 7, gid, type: 1, status: 1, message: 'x' });
    } else {
      json(response, answer, { error: { message: 'refused' } });
    }
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  answers = {};
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const local = () => makeClient(`http://127.0.0.1:${api.port}`);

async function getSpecificAlarm(
  args: Record<string, unknown>,
  client = local()
) {
  const handler = new ToolRegistry().getHandler('get_specific_alarm')!;
  const response = await handler.execute(args, client);
  return JSON.parse(response.content[0].text);
}

const NOT_FOUND =
  'Alarm not found: 999999999. The alarm may have been deleted or the ID may be incorrect.';

describe('a failure that is not a 404', () => {
  it('a bad token (401) says authentication failed, not that the alarm was not found', async () => {
    answers[BOX] = 401;
    const body = await getSpecificAlarm({ alarm_id: '999999999', gid: BOX });

    expect(body.message).toBe(
      'Failed to get specific alarm: Authentication failed. Please check your MSP token.'
    );
  });

  it('an API it could not reach says so', async () => {
    const client = makeClient(`http://127.0.0.1:${await closedPort()}`);
    const body = await getSpecificAlarm(
      { alarm_id: '999999999', gid: BOX },
      client
    );

    expect(body.message).toMatch(
      /^Failed to get specific alarm: Could not reach the Firewalla API \(ECONNREFUSED: /
    );
  });

  it('a host that does not resolve says so', async () => {
    const client = local();
    (client as any).api.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ) => {
      throw new AxiosError(
        'getaddrinfo ENOTFOUND no-such-msp.invalid',
        'ENOTFOUND',
        config
      );
    };
    const body = await getSpecificAlarm(
      { alarm_id: '999999999', gid: BOX },
      client
    );

    expect(body.message).toBe(
      'Failed to get specific alarm: Could not reach the Firewalla API (ENOTFOUND: getaddrinfo ENOTFOUND no-such-msp.invalid)'
    );
  });

  it('keeps its class and status through the client', async () => {
    answers[BOX] = 401;
    const error = await local()
      .getSpecificAlarm('999999999', BOX)
      .catch(e => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).not.toBeInstanceOf(AlarmNotFoundError);
    expect(error).toMatchObject({ status: 401 });
  });

  it('across boxes, a 404 on one and a 401 on the next is the 401', async () => {
    answers[BOX] = 404;
    answers[BOX_B] = 401;
    const body = await getSpecificAlarm({ alarm_id: '999999999' });

    expect(body.message).toBe(
      'Failed to get specific alarm: Authentication failed. Please check your MSP token.'
    );
  });
});

describe('what stays as it was', () => {
  it('every box answering 404 is not found', async () => {
    const body = await getSpecificAlarm({ alarm_id: '999999999' });

    expect(api.received).toEqual(
      expect.arrayContaining([
        `GET /v2/alarms/${BOX}/999999999`,
        `GET /v2/alarms/${BOX_B}/999999999`,
      ])
    );
    expect(body.message).toBe(NOT_FOUND);
  });

  it('not found is an AlarmNotFoundError with status 404', async () => {
    const error = await local()
      .getSpecificAlarm('999999999', BOX)
      .catch(e => e);

    expect(error).toBeInstanceOf(AlarmNotFoundError);
    expect(error).toMatchObject({ status: 404 });
  });

  it('an alarm on the second box is found', async () => {
    answers[BOX_B] = 'found';
    const body = await getSpecificAlarm({ alarm_id: '7' });

    expect(body.success).toBe(true);
    expect(body.data.alarm.results[0]).toMatchObject({ aid: 7, gid: BOX_B });
  });

  it('every box answering 403 is forbidden, not not found', async () => {
    answers[BOX] = 403;
    answers[BOX_B] = 403;
    const body = await getSpecificAlarm({ alarm_id: '999999999' });

    expect(body.message).toMatch(
      /^Failed to get specific alarm: Forbidden \(HTTP 403\)/
    );
  });
});
