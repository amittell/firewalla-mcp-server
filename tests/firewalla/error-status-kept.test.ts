/**
 * A 401 or a 404 keeps its HTTP status. The response interceptor threw
 * both as plain Errors, which request() wrapped again as "Request failed:
 * ...", so neither carried `status`, and the alarm write tools, which took
 * "Request failed:" to mean no HTTP status came, reported a write the API
 * refused with 401 as one that "may or may not have been archived". An
 * alarm write the API answered with `success: false` was reported the
 * same way.
 */

import { ApiRequestError } from '../../src/firewalla/client.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import {
  BOX,
  json,
  makeClient,
  readAnswer,
  requestError,
  startLocalApi,
} from './local-api.js';

/** The answer to a read (0: the ordinary one) and to a write */
let readStatus = 0;
let writeAnswer: (response: any) => void;

let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((request, response, path) => {
    if (request.method !== 'GET') {
      writeAnswer(response);
    } else if (readStatus) {
      json(response, readStatus, { error: { message: 'refused' } });
    } else {
      readAnswer(response, path);
    }
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  readStatus = 0;
  writeAnswer = response => json(response, 200, {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const client = () => makeClient(`http://127.0.0.1:${api.port}`);

async function archive() {
  const handler = new ToolRegistry({ enableWriteTools: true }).getHandler(
    'archive_alarm'
  )!;
  const response = await handler.execute({ alarm_id: '1', gid: BOX }, client());
  return JSON.parse(response.content[0].text);
}

describe('the HTTP status of a 401 or a 404', () => {
  it('a 401 is an ApiRequestError with status 401', async () => {
    readStatus = 401;
    const error = await requestError(client(), 'GET', '/v2/boxes');

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 401, attempts: 1 });
    expect(error.message).toBe(
      'Authentication failed. Please check your MSP token.'
    );
  });

  it('a 404 is an ApiRequestError with status 404', async () => {
    readStatus = 404;
    const error = await requestError(client(), 'GET', '/v2/boxes');

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, attempts: 1 });
    expect(error.message).toBe('Resource not found. Please check your Box ID.');
  });
});

describe('an alarm write the API answered', () => {
  it('refused with 401 says it failed, not that it may have been archived', async () => {
    writeAnswer = response => json(response, 401, { error: 'unauthorized' });
    const body = await archive();

    expect(api.received).toContain(`POST /v2/alarms/${BOX}/1/archive`);
    expect(body.message).toBe(
      'Failed to archive alarm: Authentication failed. Please check your MSP token.'
    );
    expect(body.details?.write).toBeUndefined();
  });

  it('with success: false says it failed', async () => {
    writeAnswer = response =>
      json(response, 200, { success: false, error: 'alarm is locked' });
    const body = await archive();

    expect(body.message).toBe(
      'Failed to archive alarm: Request failed: alarm is locked'
    );
    expect(body.details?.write).toBeUndefined();
  });
});
