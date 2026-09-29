/**
 * A write answered 504 may have been applied: a gateway stopped waiting
 * for the Firewalla API, which had the request and may still carry it out.
 * The write tools reported it as an ordinary failure ("Failed to create
 * rule: Firewalla API answered 504 Gateway Timeout ..."), as a caller
 * could send it again. They now say the outcome is unknown, as for a write
 * sent and not answered. A 502 or 503 on a write, and a 504 on a read,
 * keep their errors.
 */

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

let writeStatus = 504;
let readStatus = 0;
let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((request, response, path) => {
    const status = request.method === 'GET' ? readStatus : writeStatus;
    if (status) {
      json(response, status, { error: { message: 'gateway' } });
    } else {
      readAnswer(response, path);
    }
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  api.received.length = 0;
  writeStatus = 504;
  readStatus = 0;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const client = () => makeClient(`http://127.0.0.1:${api.port}`);
const registry = new ToolRegistry({ enableWriteTools: true });

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await registry.getHandler(name)!.execute(args, client());
  return JSON.parse(response.content[0].text);
}

describe('a write answered 504', () => {
  it('create_rule says the rule may have been created', async () => {
    const body = await callTool('create_rule', {
      action: 'block',
      target_type: 'internet',
      gid: BOX,
    });

    expect(api.received).toEqual(['POST /v2/rules']);
    expect(body.message).toBe(
      'POST /v2/rules got 504 Gateway Timeout: a gateway stopped waiting for the Firewalla API, which may still carry it out. The outcome is unknown: Firewalla may have applied the change. Check with get_network_rules before trying again.'
    );
    expect(body.details).toMatchObject({ write: 'unknown' });
  });

  it('archive_alarm says the alarm may or may not have been archived', async () => {
    const body = await callTool('archive_alarm', { alarm_id: '1', gid: BOX });

    expect(body.message).toBe(
      `POST /v2/alarms/${BOX}/1/archive got 504 Gateway Timeout (Firewalla API answered 504 Gateway Timeout: a gateway timed out waiting for the Firewalla API). The alarm may or may not have been archived: check its status with get_specific_alarm (2 is archived) before retrying`
    );
    expect(body.details).toMatchObject({ write: 'unknown' });
  });
});

describe('what keeps its error', () => {
  it.each([502, 503])('a write answered %i says it failed', async status => {
    writeStatus = status;
    const body = await callTool('create_rule', {
      action: 'block',
      target_type: 'internet',
      gid: BOX,
    });

    expect(body.message).toMatch(
      new RegExp(`^Failed to create rule: Firewalla API answered ${status} `)
    );
    expect(body.details?.write).toBeUndefined();
  });

  // Waits 1 to 2 s before the GET is sent again
  it('a read answered 504 twice is sent again once, then fails with the 504', async () => {
    readStatus = 504;
    const error = await requestError(client(), 'GET', '/v2/boxes');

    expect(api.received).toEqual(['GET /v2/boxes', 'GET /v2/boxes']);
    expect(error).toMatchObject({ status: 504, attempts: 2 });
    expect(error.constructor.name).toBe('ApiRequestError');
  });
});
