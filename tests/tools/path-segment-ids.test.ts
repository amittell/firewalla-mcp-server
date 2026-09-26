/**
 * IDs that go into a request path are checked before anything is sent. The
 * client put target-list ids, rule ids, alarm ids, box gids and device ids
 * into paths unencoded, and the URL is resolved before it is sent, so an ID
 * holding "/" and ".." sent the request to a different endpoint: a
 * delete_target_list reached a rule. Every such ID is now refused unless it
 * is one path segment, and ":" is still allowed (rule ids are
 * `<box gid>:<n>`, device ids MAC addresses or `ovpn:` ids).
 *
 * axios is real; only its adapter is stubbed, so requests pass through the
 * client's interceptors and URL building as in production, and the adapter
 * records the path the request would have gone to. Nothing leaves the
 * process.
 */

import axios, {
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  DeleteTargetListHandler,
  GetSpecificTargetListHandler,
  UpdateTargetListHandler,
  PauseRuleHandler,
  ResumeRuleHandler,
  DeleteRuleHandler,
} from '../../src/tools/handlers/rules.js';
import { RenameDeviceHandler } from '../../src/tools/handlers/device.js';
import { GetSpecificAlarmHandler } from '../../src/tools/handlers/security.js';
import {
  ArchiveAlarmHandler,
  MuteAlarmHandler,
} from '../../src/tools/handlers/alarm-actions.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';
import {
  InvalidPathSegmentError,
  pathSegment,
  pathSegmentProblem,
} from '../../src/validation/path-segment.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';

const BOX = '00000000-0000-0000-0000-000000000000';
const RULE = `${BOX}:1`;
const MAC = 'AA:BB:CC:DD:EE:FF';
const LIST = 'TL-00000000-0000-0000-0000-000000000000';
/** Resolves from /v2/target-lists/ to /v2/rules/<gid>:1 */
const TRAVERSAL = `x/../../rules/${RULE}`;

/**
 * A client whose HTTP layer answers like the MSP API for the resources these
 * tools touch. `sent` records each request that reached the network, with
 * the path it resolved to.
 */
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
  const sent: string[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const method = String(config.method).toUpperCase();
    const { pathname } = new URL(axios.getUri(config));
    sent.push(`${method} ${pathname}`);
    let data: unknown = { success: true, message: 'ok' };
    if (method === 'GET' && pathname === '/v2/rules') {
      data = {
        count: 1,
        results: [{ id: RULE, gid: BOX, action: 'block', status: 'active' }],
      };
    } else if (method === 'GET' && pathname.startsWith('/v2/alarms/')) {
      data = { aid: 12, gid: BOX, type: 1, status: 1, message: 'alarm' };
    } else if (method === 'GET' && pathname.startsWith('/v2/target-lists/')) {
      data = { id: LIST, name: 'List', owner: 'global', targets: [] };
    }
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      data,
      config,
      request: {},
    } as AxiosResponse;
  };
  (client as any).api.defaults.adapter = adapter;
  return { client, sent };
}

const parse = (res: any) => JSON.parse(res.content[0].text);

beforeEach(() => {
  ResourceValidator.clearCache();
  // The client logs each request to stderr
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('an ID that would change the request path', () => {
  const cases: Array<[string, ToolHandler, Record<string, unknown>, string]> = [
    ['delete_target_list', new DeleteTargetListHandler(), { id: TRAVERSAL }, 'id'],
    [
      'update_target_list',
      new UpdateTargetListHandler(),
      { id: TRAVERSAL, name: 'Renamed' },
      'id',
    ],
    [
      'get_specific_target_list',
      new GetSpecificTargetListHandler(),
      { id: TRAVERSAL },
      'id',
    ],
    [
      'rename_device (device_id)',
      new RenameDeviceHandler(),
      { device_id: `../../../rules/${RULE}`, name: 'nas', gid: BOX },
      'device_id',
    ],
    [
      'rename_device (gid)',
      new RenameDeviceHandler(),
      { device_id: MAC, name: 'nas', gid: '..' },
      'gid',
    ],
    [
      'get_specific_alarm (gid)',
      new GetSpecificAlarmHandler(),
      { alarm_id: '12', gid: `${BOX}/../../rules/${RULE}` },
      'gid',
    ],
    [
      'archive_alarm (gid)',
      new ArchiveAlarmHandler(),
      { alarm_id: '12', gid: `x/../../rules/${RULE}/pause` },
      'gid',
    ],
    [
      'mute_alarm (gid)',
      new MuteAlarmHandler(),
      {
        alarm_id: '12',
        gid: '..',
        target_type: 'alarmType',
        scope_type: 'all',
      },
      'gid',
    ],
    [
      'pause_rule',
      new PauseRuleHandler(),
      { rule_id: `r1/../../target-lists/${LIST}` },
      'rule_id',
    ],
    ['resume_rule', new ResumeRuleHandler(), { rule_id: '..' }, 'rule_id'],
    [
      'delete_rule',
      new DeleteRuleHandler(),
      { rule_id: `${RULE}/../../target-lists/${LIST}` },
      'rule_id',
    ],
  ];

  it.each(cases)(
    '%s is a validation error naming the argument, and nothing is sent',
    async (_name, handler, args, argument) => {
      const { client, sent } = makeClient();
      const res = await handler.execute(args, client);
      expect(res.isError).toBe(true);
      const body = parse(res);
      expect(body.errorType).toBe('validation_error');
      expect(JSON.stringify(body.validation_errors)).toContain(argument);
      expect(sent).toEqual([]);
    }
  );

  it.each([
    ['?', 'a?b'],
    ['#', 'a#b'],
    ['%', '%2e%2e'],
    ['\\', 'a\\..\\b'],
    ['a space', 'a b'],
    ['a tab', 'a\tb'],
    ['a newline', 'a\nb'],
    ['a NUL', 'a\u0000b'],
    ['a C1 control', 'a\u0085b'],
    ['"."', '.'],
    ['".."', '..'],
  ])('delete_target_list refuses an id with %s', async (_what, id) => {
    const { client, sent } = makeClient();
    const res = await new DeleteTargetListHandler().execute({ id }, client);
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(body.errorType).toBe('validation_error');
    expect(body.validation_errors[0]).toMatch(/^id /);
    expect(sent).toEqual([]);
  });

  it('the client refuses one too, before any request, when a caller skips the handler', async () => {
    const { client, sent } = makeClient();
    await expect(client.deleteTargetList(TRAVERSAL)).rejects.toThrow(
      InvalidPathSegmentError
    );
    await expect(client.updateTargetList('..', { name: 'x' })).rejects.toThrow(
      'Invalid id: cannot be ".."'
    );
    await expect(client.getSpecificTargetList('a/b')).rejects.toThrow(
      'Invalid id'
    );
    await expect(client.deleteRule(`${RULE}/..`)).rejects.toThrow(
      'Invalid rule_id'
    );
    await expect(client.pauseRule('r1/..')).rejects.toThrow('Invalid rule_id');
    await expect(client.resumeRule('..')).rejects.toThrow('Invalid rule_id');
    await expect(client.renameDevice(MAC, 'nas', '..')).rejects.toThrow(
      'Invalid gid'
    );
    await expect(client.renameDevice('a/../b', 'nas', BOX)).rejects.toThrow(
      'Invalid device_id'
    );
    expect(sent).toEqual([]);
  });
});

describe('valid IDs are sent as before', () => {
  it('a <box gid>:<n> rule id keeps its colon (pause_rule)', async () => {
    const { client, sent } = makeClient();
    const res = await new PauseRuleHandler().execute({ rule_id: RULE }, client);
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual(['GET /v2/rules', `POST /v2/rules/${RULE}/pause`]);
  });

  it('delete_rule sends DELETE /v2/rules/<box gid>:<n>', async () => {
    const { client, sent } = makeClient();
    const res = await new DeleteRuleHandler().execute({ rule_id: RULE }, client);
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual(['GET /v2/rules', `DELETE /v2/rules/${RULE}`]);
  });

  it.each([
    [MAC, 'AA%3ABB%3ACC%3ADD%3AEE%3AFF'],
    ['ovpn:00000000-0000-0000-0000-000000000000', 'ovpn%3A00000000-0000-0000-0000-000000000000'],
    ['wg_peer:abc123', 'wg_peer%3Aabc123'],
  ])(
    'rename_device sends device id %s as it always did',
    async (deviceId, segment) => {
      const { client, sent } = makeClient();
      const res = await new RenameDeviceHandler().execute(
        { device_id: deviceId, name: 'nas', gid: BOX },
        client
      );
      expect(res.isError).toBeFalsy();
      expect(sent).toEqual([`PATCH /v2/boxes/${BOX}/devices/${segment}`]);
    }
  );

  it('target-list ids and alarm gids and aids go into the path unchanged', async () => {
    const { client, sent } = makeClient();
    await new DeleteTargetListHandler().execute({ id: LIST }, client);
    await new GetSpecificAlarmHandler().execute(
      { alarm_id: '12', gid: BOX },
      client
    );
    await new ArchiveAlarmHandler().execute({ alarm_id: 12, gid: BOX }, client);
    expect(sent).toEqual([
      `DELETE /v2/target-lists/${LIST}`,
      `GET /v2/alarms/${BOX}/12`,
      `GET /v2/alarms/${BOX}/12`,
      `POST /v2/alarms/${BOX}/12/archive`,
    ]);
  });
});

describe('pathSegment', () => {
  it.each([
    [BOX],
    [RULE],
    [MAC],
    ['ovpn:abc'],
    ['wg_peer:abc'],
    [LIST],
    ['rule_block_facebook'],
    ['a.b'],
    ['...'],
    [42],
  ])('accepts %j', value => {
    expect(pathSegmentProblem(value)).toBeUndefined();
  });

  it.each([
    ['', 'cannot be empty'],
    ['.', 'cannot be "."'],
    ['..', 'cannot be ".."'],
    ['a/b', 'cannot contain "/"'],
    ['a\\b', 'cannot contain a backslash'],
    ['a?b', 'cannot contain "?"'],
    ['a#b', 'cannot contain "#"'],
    ['%2e%2e', 'cannot contain "%"'],
    [' a', 'cannot contain whitespace'],
    ['a b', 'cannot contain whitespace'],
    ['a\rb', 'cannot contain a control character'],
    ['a\u007fb', 'cannot contain a control character'],
    ['\ud800', 'is not valid text'],
    [undefined, 'must be a string'],
    [-1, 'must be a string'],
    [1.5, 'must be a string'],
  ])('refuses %j: %s', (value, problem) => {
    expect(pathSegmentProblem(value)).toContain(problem);
    expect(() => pathSegment(value, 'id')).toThrow(`Invalid id: ${problem}`);
  });

  it('percent-encodes what a segment may not hold as it is, and keeps ":" unless asked', () => {
    expect(pathSegment(RULE, 'rule_id')).toBe(RULE);
    expect(pathSegment('a;b=c&d', 'id')).toBe('a%3Bb%3Dc%26d');
    expect(pathSegment('é', 'id')).toBe('%C3%A9');
    expect(pathSegment(MAC, 'device_id', { encodeColons: true })).toBe(
      'AA%3ABB%3ACC%3ADD%3AEE%3AFF'
    );
    expect(pathSegment(12, 'alarm_id')).toBe('12');
  });
});
