/**
 * Write tools (create_rule, delete_rule, rename_device): box scoping, MSP rule
 * model checks, the requests they send, and the FIREWALLA_ENABLE_WRITE_TOOLS
 * opt-in. The HTTP layer is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  CreateRuleHandler,
  DeleteRuleHandler,
} from '../../src/tools/handlers/rules.js';
import { RenameDeviceHandler } from '../../src/tools/handlers/device.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';
import { writeToolsEnabled } from '../../src/config/write-tools.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return { create: jest.fn(() => instance), interceptors: instance.interceptors };
});

const BOX = '11111111-2222-3333-4444-555555555555';
const OTHER_BOX = '66666666-7777-8888-9999-000000000000';
const MAC = 'AA:BB:CC:DD:EE:FF';

function makeClient(
  boxId?: string,
  { defaultBoxId, boxes = [BOX, OTHER_BOX] }: { defaultBoxId?: string; boxes?: string[] } = {}
) {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId,
    defaultBoxId,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const request = jest.fn(
    async (method: string, endpoint: string, _params?: unknown, body?: any) => {
      if (method === 'GET' && endpoint === '/v2/boxes') {
        return boxes.map(gid => ({ gid, name: `box-${gid.slice(0, 4)}`, online: true }));
      }
      if (method === 'GET' && endpoint === '/v2/rules') {
        return { count: 1, results: [{ id: 'rule-0001', action: 'block', status: 'active' }] };
      }
      if (method === 'POST') return { id: 'rule-0002', ...body };
      if (method === 'DELETE') return { success: true, message: 'deleted' };
      if (method === 'PATCH') return { id: MAC, name: body?.name };
      return {};
    }
  );
  (client as any).request = request;
  return { client, request };
}

const writes = (request: jest.Mock) =>
  request.mock.calls
    .filter(([method]) => method !== 'GET')
    .map(([method, endpoint, , body]) => ({ method, endpoint, body }));

const parse = (res: any) => JSON.parse(res.content[0].text);

beforeEach(() => ResourceValidator.clearCache());

describe('create_rule', () => {
  it('refuses on a multi-box account without gid or a default box, and writes nothing', async () => {
    const { client, request } = makeClient(undefined);
    const res = await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'internet' },
      client
    );
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(body.message).toBe('No box to apply the rule to');
    expect(JSON.stringify(body)).toContain(BOX);
    expect(JSON.stringify(body)).toContain(OTHER_BOX);
    expect(writes(request)).toEqual([]);
  });

  it("uses the account's only box when no gid or default box is set", async () => {
    const { client, request } = makeClient(undefined, { boxes: [BOX] });
    const res = await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'internet' },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(writes(request)[0].body.gid).toBe(BOX);
  });

  it('falls back to FIREWALLA_DEFAULT_BOX_ID without listing boxes', async () => {
    const { client, request } = makeClient(undefined, { defaultBoxId: OTHER_BOX });
    await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'internet' },
      client
    );
    expect(writes(request)[0].body.gid).toBe(OTHER_BOX);
    expect(request.mock.calls.some(([, endpoint]) => endpoint === '/v2/boxes')).toBe(false);
  });

  it('posts to /v2/rules with the gid argument', async () => {
    const { client, request } = makeClient(BOX);
    const res = await new CreateRuleHandler().execute(
      {
        action: 'block',
        target_type: 'domain',
        target_value: 'tiktok.com',
        scope_type: 'device',
        scope_value: MAC,
        gid: OTHER_BOX,
      },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(writes(request)).toEqual([
      {
        method: 'POST',
        endpoint: '/v2/rules',
        body: {
          action: 'block',
          target: { type: 'domain', value: 'tiktok.com' },
          gid: OTHER_BOX,
          scope: { type: 'device', value: MAC },
        },
      },
    ]);
  });

  it('falls back to FIREWALLA_BOX_ID', async () => {
    const { client, request } = makeClient(BOX);
    await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'internet' },
      client
    );
    expect(writes(request)[0].body).toEqual({
      action: 'block',
      target: { type: 'internet' },
      gid: BOX,
    });
  });

  it('accepts intranet without a value', async () => {
    const { client, request } = makeClient(BOX);
    const res = await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'intranet' },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(writes(request)[0].body.target).toEqual({ type: 'intranet' });
  });

  it.each([
    [{ action: 'block', target_type: 'internet', target_value: 'x' }, 'target_value must be omitted'],
    [{ action: 'block', target_type: 'domain' }, 'Parameter validation failed'],
    [{ action: 'block', target_type: 'internet', cron_time: '0 21 * * *' }, 'duration is required'],
    [{ action: 'block', target_type: 'internet', scope_type: 'device' }, 'scope_type and scope_value'],
  ])('rejects %j locally', async (args, message) => {
    const { client, request } = makeClient(BOX);
    const res = await new CreateRuleHandler().execute(args, client);
    expect(res.isError).toBe(true);
    expect(parse(res).message).toContain(message);
    expect(writes(request)).toEqual([]);
  });

  it('sends cron_time with duration as a schedule', async () => {
    const { client, request } = makeClient(BOX);
    await new CreateRuleHandler().execute(
      { action: 'block', target_type: 'internet', cron_time: '0 21 * * *', duration: 36000 },
      client
    );
    expect(writes(request)[0].body.schedule).toEqual({
      duration: 36000,
      cronTime: '0 21 * * *',
    });
  });
});

describe('delete_rule', () => {
  it('deletes an existing rule', async () => {
    const { client, request } = makeClient(BOX);
    const res = await new DeleteRuleHandler().execute({ rule_id: 'rule-0001' }, client);
    expect(res.isError).toBeFalsy();
    expect(writes(request)).toEqual([
      { method: 'DELETE', endpoint: '/v2/rules/rule-0001', body: undefined },
    ]);
  });

  it('sends no DELETE for an unknown rule id', async () => {
    const { client, request } = makeClient(BOX);
    const res = await new DeleteRuleHandler().execute({ rule_id: 'rule-9999' }, client);
    expect(res.isError).toBe(true);
    expect(writes(request)).toEqual([]);
  });
});

describe('rename_device', () => {
  it('refuses on a multi-box account without gid or a default box, and writes nothing', async () => {
    const { client, request } = makeClient(undefined);
    const res = await new RenameDeviceHandler().execute(
      { device_id: MAC, name: 'nas' },
      client
    );
    expect(res.isError).toBe(true);
    expect(parse(res).message).toBe('No box to rename the device on');
    expect(writes(request)).toEqual([]);
  });

  it("renames on the account's only box when no gid or default box is set", async () => {
    const { client, request } = makeClient(undefined, { boxes: [BOX] });
    await new RenameDeviceHandler().execute({ device_id: MAC, name: 'nas' }, client);
    expect(writes(request)).toEqual([
      {
        method: 'PATCH',
        endpoint: `/v2/boxes/${BOX}/devices/AA%3ABB%3ACC%3ADD%3AEE%3AFF`,
        body: { name: 'nas' },
      },
    ]);
  });

  it('patches the device on the given box', async () => {
    const { client, request } = makeClient(undefined);
    await new RenameDeviceHandler().execute(
      { device_id: MAC, name: 'nas', gid: BOX },
      client
    );
    expect(writes(request)).toEqual([
      {
        method: 'PATCH',
        endpoint: `/v2/boxes/${BOX}/devices/AA%3ABB%3ACC%3ADD%3AEE%3AFF`,
        body: { name: 'nas' },
      },
    ]);
  });

  it('rejects names over 32 characters', async () => {
    const { client, request } = makeClient(BOX);
    const res = await new RenameDeviceHandler().execute(
      { device_id: MAC, name: 'x'.repeat(33) },
      client
    );
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('FIREWALLA_ENABLE_WRITE_TOOLS', () => {
  const WRITE_TOOLS = ['create_rule', 'delete_rule', 'rename_device'];

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['1', false],
    ['true', true],
    [' TRUE ', true],
  ])('%j -> enabled=%s', (value, expected) => {
    expect(writeToolsEnabled({ FIREWALLA_ENABLE_WRITE_TOOLS: value })).toBe(expected);
  });

  it('registers the write tools only when enabled', () => {
    const off = new ToolRegistry({ enableWriteTools: false }).getToolNames();
    const on = new ToolRegistry({ enableWriteTools: true }).getToolNames();
    expect(off.filter(name => WRITE_TOOLS.includes(name))).toEqual([]);
    expect(on.filter(name => WRITE_TOOLS.includes(name)).sort()).toEqual(
      [...WRITE_TOOLS].sort()
    );
    expect(on.length - off.length).toBe(3);
  });
});
