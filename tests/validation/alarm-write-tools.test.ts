/**
 * archive_alarm and mute_alarm: the requests they send, how they pick the box
 * (alarm IDs are per box), the mute body checks that refuse before anything is
 * sent, their schemas, and the FIREWALLA_ENABLE_WRITE_TOOLS opt-in. The HTTP
 * layer is stubbed; nothing leaves the process.
 *
 * Measured on a live MSP account on 2026-09-25 (error paths only, no real
 * alarm touched): POST /v2/alarms/{gid}/999999999/mute with
 * {"target":{"type":"domain"},"scope":{"type":"all"}} answered 400
 * "target.value is required for domain target"; every 404 (a missing alarm, a
 * missing route) is the same empty CloudFront error page.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import {
  AlarmNotFoundError,
  BoxSelectionError,
  FirewallaClient,
} from '../../src/firewalla/client.js';
import {
  ArchiveAlarmHandler,
  MuteAlarmHandler,
} from '../../src/tools/handlers/alarm-actions.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { isWriteTool } from '../../src/config/write-tools.js';
import {
  checkMuteRequest,
  MUTE_SCOPE_TYPES,
  MUTE_TARGET_TYPES,
} from '../../src/validation/alarm-mute.js';

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

const FLUME = '11111111-2222-3333-4444-555555555555';
const PINEWOOD = '66666666-7777-8888-9999-000000000000';
const MAC = 'AA:BB:CC:DD:EE:FF';

const BOXES = [
  { gid: FLUME, name: 'Flume', online: true },
  { gid: PINEWOOD, name: 'Pinewood', online: false },
];

function makeClient({
  boxId,
  defaultBoxId,
  alarms = {},
  failingBoxes = [],
  post,
}: {
  boxId?: string;
  defaultBoxId?: string;
  /** aids present on each box */
  alarms?: Record<string, string[]>;
  /** boxes whose alarm GET fails with a server error */
  failingBoxes?: string[];
  /** replaces the POST answer */
  post?: () => Promise<unknown>;
} = {}) {
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
    async (method: string, endpoint: string, _params?: unknown, _body?: any) => {
      if (method === 'GET' && endpoint === '/v2/boxes') {
        return BOXES.map(box => ({ ...box, model: 'goldpro' }));
      }
      const alarm = endpoint.match(/^\/v2\/alarms\/([^/]+)\/([^/]+)$/);
      if (method === 'GET' && alarm) {
        const [, gid, aid] = alarm;
        if (failingBoxes.includes(gid)) {
          throw new Error('Server error: Firewalla API is experiencing issues');
        }
        if ((alarms[gid] || []).includes(aid)) {
          return {
            gid,
            aid: Number(aid),
            type: 8,
            status: 1,
            message: `video on ${gid.slice(0, 4)}`,
            device: { id: MAC, name: 'Living Room', ip: '192.168.1.20' },
            remote: { domain: 'twitch.tv', ip: '151.101.2.167' },
          };
        }
        throw new Error(
          `Resource not found: /v2/alarms/${gid}/${aid} does not exist`
        );
      }
      if (method === 'POST') {
        return post ? post() : {};
      }
      throw new Error(`unexpected ${method} ${endpoint}`);
    }
  );
  (client as any).request = request;
  return { client, request };
}

const calls = (request: jest.Mock) =>
  request.mock.calls.map(([method, endpoint]) => `${method} ${endpoint}`);

const posts = (request: jest.Mock) =>
  request.mock.calls
    .filter(([method]) => method === 'POST')
    .map(([method, endpoint, params, body, cacheable]) => ({
      method,
      endpoint,
      params,
      body,
      cacheable,
    }));

const parse = (res: any) => JSON.parse(res.content[0].text);

describe('checkMuteRequest', () => {
  it.each([
    [{ target: { type: 'alarmType' }, scope: { type: 'all' } }],
    [{ target: { type: 'domain', value: 'example.com' }, scope: { type: 'all' } }],
    [
      {
        target: { type: 'domain', value: 'example.com' },
        scope: { type: 'device', value: MAC },
      },
    ],
    [{ target: { type: 'ip', value: '1.2.3.4' }, scope: { type: 'group', value: '1' } }],
    [{ target: { type: 'ip', value: '2001:db8::1' }, scope: { type: 'user', value: 'u1' } }],
    [
      {
        target: { type: 'alarmType' },
        scope: { type: 'network', value: 'd13619f4-164d-4430-8796-c086448df9e9' },
      },
    ],
  ])('accepts the documented body %j', body => {
    expect(checkMuteRequest(body)).toEqual({ ok: true, request: body });
  });

  it('trims values and keeps only the documented fields', () => {
    expect(
      checkMuteRequest({
        target: { type: 'domain', value: ' example.com ', dnsOnly: true },
        scope: { type: 'device', value: ` ${MAC}` },
        extra: 1,
      })
    ).toEqual({
      ok: true,
      request: {
        target: { type: 'domain', value: 'example.com' },
        scope: { type: 'device', value: MAC },
      },
    });
  });

  it.each([
    [{ target: { type: 'domain' }, scope: { type: 'all' } }, 'target.value is required when target.type is domain'],
    [{ target: { type: 'ip' }, scope: { type: 'all' } }, 'target.value is required when target.type is ip'],
    [{ target: { type: 'domain', value: '  ' }, scope: { type: 'all' } }, 'target.value is required'],
    [{ target: { type: 'alarmType', value: '8' }, scope: { type: 'all' } }, 'not used when target.type is alarmType'],
    [{ target: { type: 'domain', value: '*.example.com' }, scope: { type: 'all' } }, 'wildcard matching itself'],
    [{ target: { type: 'domain', value: '1.2.3.4' }, scope: { type: 'all' } }, 'use target.type ip'],
    [{ target: { type: 'domain', value: 'https://example.com/x' }, scope: { type: 'all' } }, 'must be a domain name'],
    [{ target: { type: 'ip', value: '10.0.0.0/8' }, scope: { type: 'all' } }, 'one IP address'],
    [{ target: { type: 'ip', value: 'example.com' }, scope: { type: 'all' } }, 'one IP address'],
    [{ target: { type: 'ip', value: 1234 }, scope: { type: 'all' } }, 'target.value must be a string'],
    [{ target: { type: 'alarmType' }, scope: { type: 'device' } }, 'scope.value is required when scope.type is device'],
    [{ target: { type: 'alarmType' }, scope: { type: 'group' } }, 'scope.value is required when scope.type is group'],
    [{ target: { type: 'alarmType' }, scope: { type: 'all', value: MAC } }, 'scope.value is not used when scope.type is all'],
    [{ target: { type: 'app', value: 'tiktok' }, scope: { type: 'all' } }, 'target.type must be one of alarmType, domain, ip'],
    [{ target: { type: 'alarmType' }, scope: { type: 'box' } }, 'scope.type must be one of device, group, user, network, all'],
    [{ target: { type: 'AlarmType' }, scope: { type: 'all' } }, 'target.type must be one of'],
    [{ scope: { type: 'all' } }, 'target is required'],
    [{ target: { type: 'alarmType' } }, 'scope is required'],
    [null, 'must be an object'],
  ])('refuses %j', (body, problem) => {
    const checked = checkMuteRequest(body);
    expect(checked.ok).toBe(false);
    expect(checked.ok ? [] : checked.problems.join(' | ')).toContain(problem);
  });

  it('lists every problem at once', () => {
    const checked = checkMuteRequest({
      target: { type: 'domain' },
      scope: { type: 'device' },
    });
    expect(checked.ok ? [] : checked.problems).toHaveLength(2);
  });
});

describe('archiveAlarm', () => {
  it('reads the alarm on the given box, then posts archive with no body', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const result = await client.archiveAlarm('42', PINEWOOD);
    expect(result.gid).toBe(PINEWOOD);
    expect(result.aid).toBe('42');
    expect(calls(request)).toEqual([
      `GET /v2/alarms/${PINEWOOD}/42`,
      `POST /v2/alarms/${PINEWOOD}/42/archive`,
    ]);
    expect(posts(request)).toEqual([
      {
        method: 'POST',
        endpoint: `/v2/alarms/${PINEWOOD}/42/archive`,
        params: undefined,
        body: undefined,
        cacheable: false,
      },
    ]);
    // the existence check bypasses the 15 s alarm cache
    expect(request.mock.calls[0][4]).toBe(false);
  });

  it('accepts the numeric aid that get_active_alarms returns', async () => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['65257'] } });
    await client.archiveAlarm(65257, FLUME);
    expect(calls(request)).toEqual([
      `GET /v2/alarms/${FLUME}/65257`,
      `POST /v2/alarms/${FLUME}/65257/archive`,
    ]);
  });

  it('uses FIREWALLA_BOX_ID without listing boxes', async () => {
    const { client, request } = makeClient({
      boxId: FLUME,
      alarms: { [FLUME]: ['42'] },
    });
    await client.archiveAlarm('42');
    expect(calls(request)).toEqual([
      `GET /v2/alarms/${FLUME}/42`,
      `POST /v2/alarms/${FLUME}/42/archive`,
    ]);
  });

  it('prefers the explicit gid over FIREWALLA_BOX_ID', async () => {
    const { client, request } = makeClient({
      boxId: FLUME,
      alarms: { [PINEWOOD]: ['42'] },
    });
    await client.archiveAlarm('42', PINEWOOD);
    expect(posts(request)[0].endpoint).toBe(`/v2/alarms/${PINEWOOD}/42/archive`);
  });

  it('without a box configured, archives on the one box that has the alarm', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const result = await client.archiveAlarm('42');
    expect(result.gid).toBe(PINEWOOD);
    expect(calls(request)).toEqual([
      'GET /v2/boxes',
      `GET /v2/alarms/${FLUME}/42`,
      `GET /v2/alarms/${PINEWOOD}/42`,
      `POST /v2/alarms/${PINEWOOD}/42/archive`,
    ]);
  });

  it('refuses when several boxes have the aid and none is the default box', async () => {
    const { client, request } = makeClient({
      alarms: { [FLUME]: ['42'], [PINEWOOD]: ['42'] },
    });
    const error = await client.archiveAlarm('42').catch(e => e);
    expect(error).toBeInstanceOf(BoxSelectionError);
    expect(error.message).toContain(`Flume (${FLUME})`);
    expect(error.message).toContain(`Pinewood (${PINEWOOD})`);
    expect(posts(request)).toEqual([]);
  });

  it('uses FIREWALLA_DEFAULT_BOX_ID when it has the alarm, without checking other boxes', async () => {
    const { client, request } = makeClient({
      defaultBoxId: PINEWOOD,
      alarms: { [FLUME]: ['42'], [PINEWOOD]: ['42'] },
    });
    await client.archiveAlarm('42');
    expect(calls(request)).toEqual([
      'GET /v2/boxes',
      `GET /v2/alarms/${PINEWOOD}/42`,
      `POST /v2/alarms/${PINEWOOD}/42/archive`,
    ]);
  });

  it('checks the other boxes when the default box lacks the alarm', async () => {
    const { client, request } = makeClient({
      defaultBoxId: PINEWOOD,
      alarms: { [FLUME]: ['42'] },
    });
    await client.archiveAlarm('42');
    expect(posts(request)[0].endpoint).toBe(`/v2/alarms/${FLUME}/42/archive`);
  });

  it('refuses when a box could not be checked, since it may hold the same aid', async () => {
    const { client, request } = makeClient({
      alarms: { [FLUME]: ['42'] },
      failingBoxes: [PINEWOOD],
    });
    const error = await client.archiveAlarm('42').catch(e => e);
    expect(error).toBeInstanceOf(BoxSelectionError);
    expect(error.message).toContain('Could not check every box');
    expect(error.message).toContain('Server error');
    expect(posts(request)).toEqual([]);
  });

  it('reports a missing alarm without posting', async () => {
    const { client, request } = makeClient();
    await expect(client.archiveAlarm('42', FLUME)).rejects.toBeInstanceOf(
      AlarmNotFoundError
    );
    const error = await client.archiveAlarm('42').catch(e => e);
    expect(error).toBeInstanceOf(AlarmNotFoundError);
    expect(error.message).toContain('any of the 2 boxes');
    expect(posts(request)).toEqual([]);
  });

  it('passes on errors other than 404 from the existence check', async () => {
    const { client, request } = makeClient({ failingBoxes: [FLUME] });
    await expect(client.archiveAlarm('42', FLUME)).rejects.toThrow(
      'Server error'
    );
    expect(posts(request)).toEqual([]);
  });

  it.each([['abc'], ['alarm_1'], ['0'], [''], ['1 OR 2']])(
    'refuses the aid %j without sending anything',
    async aid => {
      const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
      await expect(client.archiveAlarm(aid, FLUME)).rejects.toThrow(
        /Invalid alarm ID/
      );
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('explains a 404 on the POST when the alarm exists', async () => {
    const { client } = makeClient({
      alarms: { [FLUME]: ['42'] },
      post: async () => {
        throw new Error('Resource not found: /v2/alarms/x/42/archive does not exist');
      },
    });
    await expect(client.archiveAlarm('42', FLUME)).rejects.toThrow(
      /404 although the alarm exists.*MSP 2\.11\.0/
    );
  });

  it('says the outcome is unknown when the POST gets no HTTP status, and does not retry', async () => {
    const { client, request } = makeClient({
      alarms: { [FLUME]: ['42'] },
      post: async () => {
        throw new Error('API Error (unknown): timeout of 30000ms exceeded');
      },
    });
    await expect(client.archiveAlarm('42', FLUME)).rejects.toThrow(
      /may or may not have been archived/
    );
    expect(posts(request)).toHaveLength(1);
  });

  it('drops cached alarm reads after archiving, and nothing else', async () => {
    const { client } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const cache: Map<string, unknown> = (client as any).cache;
    const expires = Date.now() + 60000;
    cache.set('fw:all-boxes:GET:_v2_alarms:abc', { data: {}, expires });
    cache.set(`fw:all-boxes:GET:_v2_alarms_${FLUME}_42:def`, { data: {}, expires });
    cache.set('fw:all-boxes:GET:_v2_rules:ghi', { data: {}, expires });
    await client.archiveAlarm('42', FLUME);
    expect([...cache.keys()]).toEqual(['fw:all-boxes:GET:_v2_rules:ghi']);
  });
});

describe('muteAlarm', () => {
  it('posts exactly the documented body', async () => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const result = await client.muteAlarm(
      '42',
      {
        target: { type: 'domain', value: 'example.com' },
        scope: { type: 'device', value: MAC },
      },
      FLUME
    );
    expect(result.gid).toBe(FLUME);
    expect(posts(request)).toEqual([
      {
        method: 'POST',
        endpoint: `/v2/alarms/${FLUME}/42/mute`,
        params: undefined,
        body: {
          target: { type: 'domain', value: 'example.com' },
          scope: { type: 'device', value: MAC },
        },
        cacheable: false,
      },
    ]);
  });

  it('refuses an invalid body before any request, even the box lookup', async () => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    await expect(
      client.muteAlarm('42', {
        target: { type: 'domain' },
        scope: { type: 'all' },
      })
    ).rejects.toThrow('target.value is required when target.type is domain');
    expect(request).not.toHaveBeenCalled();
  });

  it('finds the box the same way archiveAlarm does', async () => {
    const { client, request } = makeClient({
      alarms: { [FLUME]: ['42'], [PINEWOOD]: ['42'] },
    });
    await expect(
      client.muteAlarm('42', {
        target: { type: 'alarmType' },
        scope: { type: 'all' },
      })
    ).rejects.toBeInstanceOf(BoxSelectionError);
    expect(posts(request)).toEqual([]);
  });
});

describe('archive_alarm tool', () => {
  it('archives and reports which alarm it acted on', async () => {
    const { client, request } = makeClient({ alarms: { [PINEWOOD]: ['42'] } });
    const res = await new ArchiveAlarmHandler().execute(
      { alarm_id: 42, gid: PINEWOOD },
      client
    );
    expect(res.isError).toBeFalsy();
    const { data } = parse(res);
    expect(data).toMatchObject({
      archived: true,
      alarm_id: '42',
      gid: PINEWOOD,
      alarm: {
        aid: 42,
        type: 8,
        status_before: 1,
        device: { id: MAC, name: 'Living Room' },
        remote: { domain: 'twitch.tv' },
      },
    });
    expect(posts(request).map(call => call.endpoint)).toEqual([
      `/v2/alarms/${PINEWOOD}/42/archive`,
    ]);
  });

  it('refuses on an ambiguous aid and writes nothing', async () => {
    const { client, request } = makeClient({
      alarms: { [FLUME]: ['42'], [PINEWOOD]: ['42'] },
    });
    const res = await new ArchiveAlarmHandler().execute({ alarm_id: '42' }, client);
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(body.message).toBe('No single box to archive the alarm on');
    expect(body.errorType).toBe('validation_error');
    expect(JSON.stringify(body)).toContain('alarm IDs are per box');
    expect(posts(request)).toEqual([]);
  });

  it('reports a missing alarm and writes nothing', async () => {
    const { client, request } = makeClient();
    const res = await new ArchiveAlarmHandler().execute(
      { alarm_id: '42', gid: FLUME },
      client
    );
    expect(res.isError).toBe(true);
    expect(parse(res).message).toBe(`Alarm 42 not found on box ${FLUME}`);
    expect(posts(request)).toEqual([]);
  });

  it.each([
    [{}],
    [{ alarm_id: 'abc' }],
    [{ alarm_id: 1.5 }],
    [{ alarm_id: -3 }],
    [{ alarm_id: '42', gid: 'not a gid' }],
    [{ alarm_id: '42', gid: 7 }],
  ])('rejects %j locally without any request', async args => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const res = await new ArchiveAlarmHandler().execute(args as any, client);
    expect(res.isError).toBe(true);
    expect(parse(res).message).toBe('Parameter validation failed');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('mute_alarm tool', () => {
  it('mutes a domain for one device', async () => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const res = await new MuteAlarmHandler().execute(
      {
        alarm_id: '42',
        gid: FLUME,
        target_type: 'domain',
        target_value: 'twitch.tv',
        scope_type: 'device',
        scope_value: MAC,
      },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(posts(request).map(({ endpoint, body }) => ({ endpoint, body }))).toEqual([
      {
        endpoint: `/v2/alarms/${FLUME}/42/mute`,
        body: {
          target: { type: 'domain', value: 'twitch.tv' },
          scope: { type: 'device', value: MAC },
        },
      },
    ]);
    const { data } = parse(res);
    expect(data.muted).toBe(true);
    expect(data.silences).toBe(
      `future alarms for twitch.tv and its subdomains, for device ${MAC}`
    );
  });

  it("says an alarmType mute silences the alarm's type on every device", async () => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const res = await new MuteAlarmHandler().execute(
      { alarm_id: 42, target_type: 'alarmType', scope_type: 'all', gid: FLUME },
      client
    );
    expect(posts(request)[0].body).toEqual({
      target: { type: 'alarmType' },
      scope: { type: 'all' },
    });
    expect(parse(res).data.silences).toBe(
      'every future type 8 alarm, whatever the destination, on every device on the box'
    );
  });

  it.each([
    [{ target_type: 'domain', scope_type: 'all' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'ip', scope_type: 'all' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'ip', target_value: '10.0.0.0/8', scope_type: 'all' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'domain', target_value: '*.example.com', scope_type: 'all' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'alarmType', target_value: '8', scope_type: 'all' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'alarmType', scope_type: 'device' }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'alarmType', scope_type: 'all', scope_value: MAC }, 'Invalid mute request: nothing was sent'],
    [{ target_type: 'app', target_value: 'tiktok', scope_type: 'all' }, 'Parameter validation failed'],
    [{ target_type: 'alarmType', scope_type: 'box' }, 'Parameter validation failed'],
    [{ target_type: 'alarmType' }, 'Parameter validation failed'],
    [{ scope_type: 'all' }, 'Parameter validation failed'],
    [{ target_type: 'domain', target_value: 5, scope_type: 'all' }, 'Parameter validation failed'],
  ])('refuses %j without any request', async (args, message) => {
    const { client, request } = makeClient({ alarms: { [FLUME]: ['42'] } });
    const res = await new MuteAlarmHandler().execute(
      { alarm_id: '42', ...args } as any,
      client
    );
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(body.message).toBe(message);
    expect(body.errorType).toBe('validation_error');
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a non-numeric alarm_id without any request', async () => {
    const { client, request } = makeClient();
    const res = await new MuteAlarmHandler().execute(
      { alarm_id: 'abc', target_type: 'alarmType', scope_type: 'all' },
      client
    );
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

/** The ListTools entry for a tool in src/server.ts, as plain data */
function toolSchema(tool: string): any {
  const file = path.join(process.cwd(), 'src', 'server.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const toValue = (node: ts.Expression): any => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(toValue);
    if (ts.isObjectLiteralExpression(node)) {
      const out: Record<string, any> = {};
      for (const p of node.properties) {
        if (ts.isPropertyAssignment(p)) {
          out[p.name.getText(source)] = toValue(p.initializer);
        }
      }
      return out;
    }
    return undefined;
  };
  let found: any;
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const value = toValue(node);
      if (value?.name === tool && value.inputSchema) {
        found = value;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('archive_alarm and mute_alarm schemas', () => {
  it('archive_alarm is a non-destructive, idempotent write', () => {
    const schema = toolSchema('archive_alarm');
    expect(schema.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(schema.inputSchema.properties.alarm_id.type).toEqual(['string', 'number']);
    expect(schema.inputSchema.required).toEqual(['alarm_id']);
  });

  it('mute_alarm is a write that is neither destructive nor idempotent, and says what it silences', () => {
    const schema = toolSchema('mute_alarm');
    expect(schema.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(schema.description).toContain('lasting silence exception');
    expect(schema.inputSchema.required).toEqual([
      'alarm_id',
      'target_type',
      'scope_type',
    ]);
  });

  it('mute_alarm advertises the enums the validator enforces', () => {
    const { properties } = toolSchema('mute_alarm').inputSchema;
    expect(properties.target_type.enum).toEqual([...MUTE_TARGET_TYPES]);
    expect(properties.scope_type.enum).toEqual([...MUTE_SCOPE_TYPES]);
  });
});

describe('FIREWALLA_ENABLE_WRITE_TOOLS gates archive_alarm and mute_alarm', () => {
  it('lists them as write tools, so ListTools hides them when disabled', () => {
    expect(isWriteTool('archive_alarm')).toBe(true);
    expect(isWriteTool('mute_alarm')).toBe(true);
  });

  it('registers them only when enabled', () => {
    const off = new ToolRegistry({ enableWriteTools: false }).getToolNames();
    const on = new ToolRegistry({ enableWriteTools: true }).getToolNames();
    expect(off).not.toContain('archive_alarm');
    expect(off).not.toContain('mute_alarm');
    expect(on).toContain('archive_alarm');
    expect(on).toContain('mute_alarm');
  });
});
