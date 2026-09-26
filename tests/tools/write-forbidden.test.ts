/**
 * A 403 to a write may come from a read-only token. Firewalla said on
 * 2026-09-08 that MSP 2.12 adds read-only API tokens; what the API answers a
 * read-only token's write has not been measured. A write tool that gets 403
 * says the token may be read-only and that the write tools need a token with
 * write access, and still gives the other cause of a 403 (a box the token
 * cannot access, measured 2026-09-25). A 403 to a read says nothing about
 * read-only tokens, which can read.
 *
 * axios is real; only its adapter is stubbed, so the 403 passes through the
 * client's response interceptor as in production. Nothing leaves the process.
 */

import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  CreateTargetListHandler,
  GetSpecificTargetListHandler,
  PauseRuleHandler,
} from '../../src/tools/handlers/rules.js';
import { RenameDeviceHandler } from '../../src/tools/handlers/device.js';
import { ArchiveAlarmHandler } from '../../src/tools/handlers/alarm-actions.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';

const BOX = '00000000-0000-0000-0000-000000000000';
const RULE = `${BOX}:1`;
const MAC = 'AA:BB:CC:DD:EE:FF';
const LIST = 'TL-00000000-0000-0000-0000-000000000000';

const FORBIDDEN_BODY = {
  error: {
    title: 'Forbidden',
    message: 'You are not allowed to access this resource',
    type: 'FORBIDDEN',
  },
};

/** A client whose reads succeed and whose writes (anything else) get 403 */
function makeClient({ forbidReads = false } = {}) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const sent: string[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const method = String(config.method).toUpperCase();
    const { pathname } = new URL(axios.getUri(config));
    sent.push(`${method} ${pathname}`);
    let data: unknown = {};
    if (pathname === '/v2/rules') {
      data = {
        count: 1,
        results: [{ id: RULE, gid: BOX, action: 'block', status: 'active' }],
      };
    } else if (pathname.startsWith('/v2/alarms/')) {
      data = { aid: 12, gid: BOX, type: 1, status: 1, message: 'alarm' };
    }
    const forbidden = method !== 'GET' || forbidReads;
    const response = {
      status: forbidden ? 403 : 200,
      statusText: forbidden ? 'Forbidden' : 'OK',
      headers: {},
      data: forbidden ? FORBIDDEN_BODY : data,
      config,
      request: {},
    } as AxiosResponse;
    if (forbidden) {
      throw new AxiosError(
        'Request failed with status code 403',
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response
      );
    }
    return response;
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, sent };
}

/** The error text of a tool response */
const errorText = (response: any) => response.content[0].text as string;

beforeEach(() => {
  ResourceValidator.clearCache();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a write tool that gets HTTP 403', () => {
  const cases: Array<[string, ToolHandler, Record<string, unknown>, string]> = [
    [
      'create_target_list',
      new CreateTargetListHandler(),
      { name: 'Blocked', owner: 'global', targets: ['example.com'] },
      'POST /v2/target-lists',
    ],
    ['pause_rule', new PauseRuleHandler(), { rule_id: RULE }, `POST /v2/rules/${RULE}/pause`],
    [
      'rename_device',
      new RenameDeviceHandler(),
      { device_id: MAC, name: 'nas', gid: BOX },
      `PATCH /v2/boxes/${BOX}/devices/AA%3ABB%3ACC%3ADD%3AEE%3AFF`,
    ],
    [
      'archive_alarm',
      new ArchiveAlarmHandler(),
      { alarm_id: '12', gid: BOX },
      `POST /v2/alarms/${BOX}/12/archive`,
    ],
  ];

  it.each(cases)(
    '%s says the token may be read-only and needs write access',
    async (_name, handler, args, write) => {
      const { client, sent } = makeClient();
      const res = await handler.execute(args, client);
      expect(res.isError).toBe(true);
      expect(sent).toContain(write);
      const text = errorText(res);
      expect(text).toContain('Forbidden (HTTP 403)');
      expect(text).toContain('the token may be read-only');
      expect(text).toContain('MSP 2.12 adds read-only API tokens');
      expect(text).toContain('The write tools need a token with write access');
      // It may be read-only; the message does not say that it is
      expect(text).not.toMatch(/token is read-only/i);
      // The other cause of a 403 is still given
      expect(text).toContain('names a box');
      expect(text).toContain('get_boxes');
    }
  );

  it('a 403 on a read says nothing about read-only tokens', async () => {
    const { client } = makeClient({ forbidReads: true });
    const res = await new GetSpecificTargetListHandler().execute(
      { id: LIST },
      client
    );
    expect(res.isError).toBe(true);
    const text = errorText(res);
    expect(text).toContain('Forbidden (HTTP 403)');
    expect(text).not.toMatch(/read-only/i);
  });
});
