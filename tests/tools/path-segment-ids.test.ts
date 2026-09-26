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
  DeleteAlarmHandler,
  MuteAlarmHandler,
} from '../../src/tools/handlers/alarm-actions.js';
import type { ToolHandler } from '../../src/tools/handlers/base.js';
import {
  InvalidPathSegmentError,
  pathSegment,
  pathSegmentProblem,
} from '../../src/validation/path-segment.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';
import { ParameterValidator } from '../../src/validation/error-handler.js';

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
    [
      'delete_target_list',
      new DeleteTargetListHandler(),
      { id: TRAVERSAL },
      'id',
    ],
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
      'delete_alarm (gid)',
      new DeleteAlarmHandler(),
      { alarm_id: '12', gid: `x/../../rules/${RULE}` },
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

/**
 * Ways to put a refused character into an otherwise valid ID. Before this
 * was fixed, the client's sanitizeInput removed a NUL and trimmed
 * whitespace (tab, newline and carriage return included), and the handlers
 * and the alarm code trimmed too, so the request went out for a rewritten
 * ID, which can name a different object, instead of being refused.
 */
const variants = (id: string): Array<[string, string]> => [
  ['a NUL inside', `${id}\u0000x`],
  ['a trailing NUL', `${id}\u0000`],
  ['a leading NUL', `\u0000${id}`],
  ['a leading tab', `\t${id}`],
  ['a trailing newline', `${id}\n`],
  ['a trailing CR LF', `${id}\r\n`],
  ['a leading space', ` ${id}`],
  ['a trailing space', `${id} `],
  ['a DEL', `${id}\u007f`],
];

const MUTE = {
  target: { type: 'alarmType' as const },
  scope: { type: 'all' as const },
};

describe('a refused character is refused, not removed or trimmed, by the client', () => {
  const calls: Array<
    [
      string,
      string,
      string,
      (client: FirewallaClient, id: string) => Promise<unknown>,
    ]
  > = [
    [
      'getSpecificTargetList',
      LIST,
      'id',
      (c, id) => c.getSpecificTargetList(id),
    ],
    [
      'updateTargetList',
      LIST,
      'id',
      (c, id) => c.updateTargetList(id, { name: 'x' }),
    ],
    ['deleteTargetList', LIST, 'id', (c, id) => c.deleteTargetList(id)],
    ['deleteRule', RULE, 'rule_id', (c, id) => c.deleteRule(id)],
    ['pauseRule', RULE, 'rule_id', (c, id) => c.pauseRule(id)],
    ['resumeRule', RULE, 'rule_id', (c, id) => c.resumeRule(id)],
    [
      'renameDevice (device id)',
      MAC,
      'device_id',
      (c, id) => c.renameDevice(id, 'nas', BOX),
    ],
    [
      'renameDevice (gid)',
      BOX,
      'gid',
      (c, id) => c.renameDevice(MAC, 'nas', id),
    ],
    [
      'getSpecificAlarm (aid)',
      '12',
      'alarm_id',
      (c, id) => c.getSpecificAlarm(id, BOX),
    ],
    [
      'getSpecificAlarm (gid)',
      BOX,
      'gid',
      (c, id) => c.getSpecificAlarm('12', id),
    ],
    [
      'archiveAlarm (aid)',
      '12',
      'alarm_id',
      (c, id) => c.archiveAlarm(id, BOX),
    ],
    ['archiveAlarm (gid)', BOX, 'gid', (c, id) => c.archiveAlarm('12', id)],
    [
      'muteAlarm (aid)',
      '12',
      'alarm_id',
      (c, id) => c.muteAlarm(id, MUTE, BOX),
    ],
    ['muteAlarm (gid)', BOX, 'gid', (c, id) => c.muteAlarm('12', MUTE, id)],
    ['deleteAlarm (aid)', '12', 'alarm_id', (c, id) => c.deleteAlarm(id, BOX)],
    ['deleteAlarm (gid)', BOX, 'gid', (c, id) => c.deleteAlarm('12', id)],
  ];

  it.each(calls)(
    '%s refuses each variant of %s and sends nothing',
    async (_name, valid, argument, call) => {
      const outcomes: string[] = [];
      for (const [what, id] of variants(valid)) {
        const { client, sent } = makeClient();
        const error = await call(client, id).then(
          () => undefined,
          (e: unknown) => e
        );
        const message = error instanceof Error ? error.message : 'resolved';
        const refused = message.includes(`Invalid ${argument}`);
        outcomes.push(
          `${what}: ${refused ? 'refused' : message}; sent ${JSON.stringify(sent)}`
        );
      }
      expect(outcomes).toEqual(
        variants(valid).map(([what]) => `${what}: refused; sent []`)
      );
    }
  );

  it.each(calls)(
    '%s still sends the valid %s',
    async (_name, valid, _argument, call) => {
      const { client, sent } = makeClient();
      await call(client, valid);
      expect(
        sent.filter(line => !line.startsWith('GET /v2/rules'))
      ).not.toEqual([]);
    }
  );

  it('characters the path may hold are percent-encoded, not removed', async () => {
    const { client, sent } = makeClient();
    await client.deleteRule('a"b<c>d');
    await client.deleteTargetList("a'b");
    await client.renameDevice('a"b', 'nas', BOX);
    expect(sent).toEqual([
      'DELETE /v2/rules/a%22b%3Cc%3Ed',
      "DELETE /v2/target-lists/a'b",
      `PATCH /v2/boxes/${BOX}/devices/a%22b`,
    ]);
  });
});

describe('a refused character is refused, not trimmed, by the tools', () => {
  const tools: Array<
    [
      string,
      string,
      ToolHandler,
      string,
      (id: string) => Record<string, unknown>,
    ]
  > = [
    [
      'get_specific_target_list',
      'id',
      new GetSpecificTargetListHandler(),
      LIST,
      id => ({ id }),
    ],
    [
      'update_target_list',
      'id',
      new UpdateTargetListHandler(),
      LIST,
      id => ({ id, name: 'x' }),
    ],
    [
      'delete_target_list',
      'id',
      new DeleteTargetListHandler(),
      LIST,
      id => ({ id }),
    ],
    [
      'pause_rule',
      'rule_id',
      new PauseRuleHandler(),
      RULE,
      id => ({ rule_id: id }),
    ],
    [
      'resume_rule',
      'rule_id',
      new ResumeRuleHandler(),
      RULE,
      id => ({ rule_id: id }),
    ],
    [
      'delete_rule',
      'rule_id',
      new DeleteRuleHandler(),
      RULE,
      id => ({ rule_id: id }),
    ],
    [
      'rename_device (device_id)',
      'device_id',
      new RenameDeviceHandler(),
      MAC,
      id => ({ device_id: id, name: 'nas', gid: BOX }),
    ],
    [
      'rename_device (gid)',
      'gid',
      new RenameDeviceHandler(),
      BOX,
      id => ({ device_id: MAC, name: 'nas', gid: id }),
    ],
    [
      'get_specific_alarm (alarm_id)',
      'alarm_id',
      new GetSpecificAlarmHandler(),
      '12',
      id => ({ alarm_id: id, gid: BOX }),
    ],
    [
      'get_specific_alarm (gid)',
      'gid',
      new GetSpecificAlarmHandler(),
      BOX,
      id => ({ alarm_id: '12', gid: id }),
    ],
    [
      'archive_alarm (alarm_id)',
      'alarm_id',
      new ArchiveAlarmHandler(),
      '12',
      id => ({ alarm_id: id, gid: BOX }),
    ],
    [
      'archive_alarm (gid)',
      'gid',
      new ArchiveAlarmHandler(),
      BOX,
      id => ({ alarm_id: '12', gid: id }),
    ],
    [
      'mute_alarm (alarm_id)',
      'alarm_id',
      new MuteAlarmHandler(),
      '12',
      id => ({
        alarm_id: id,
        gid: BOX,
        target_type: 'alarmType',
        scope_type: 'all',
      }),
    ],
    [
      'mute_alarm (gid)',
      'gid',
      new MuteAlarmHandler(),
      BOX,
      id => ({
        alarm_id: '12',
        gid: id,
        target_type: 'alarmType',
        scope_type: 'all',
      }),
    ],
    [
      'delete_alarm (alarm_id)',
      'alarm_id',
      new DeleteAlarmHandler(),
      '12',
      id => ({ alarm_id: id, gid: BOX }),
    ],
    [
      'delete_alarm (gid)',
      'gid',
      new DeleteAlarmHandler(),
      BOX,
      id => ({ alarm_id: '12', gid: id }),
    ],
  ];

  it.each(tools)(
    '%s: each variant of %s is a validation error naming it, and nothing is sent',
    async (_name, argument, handler, valid, args) => {
      const outcomes: string[] = [];
      for (const [what, id] of variants(valid)) {
        const { client, sent } = makeClient();
        const body = parse(await handler.execute(args(id), client));
        const named = JSON.stringify(body.validation_errors ?? []).includes(
          argument
        );
        outcomes.push(
          `${what}: ${body.errorType === 'validation_error' && named ? 'refused' : `${body.errorType} ${body.message}`}; sent ${JSON.stringify(sent)}`
        );
      }
      expect(outcomes).toEqual(
        variants(valid).map(([what]) => `${what}: refused; sent []`)
      );
    }
  );

  it.each(tools)(
    '%s still accepts a valid %s',
    async (_name, _argument, handler, valid, args) => {
      const { client, sent } = makeClient();
      const res = await handler.execute(args(valid), client);
      // resume_rule answers that the stubbed rule is already active
      if (res.isError) {
        expect(parse(res).errorType).not.toBe('validation_error');
      }
      expect(sent).not.toEqual([]);
    }
  );
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
    const res = await new DeleteRuleHandler().execute(
      { rule_id: RULE },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual(['GET /v2/rules', `DELETE /v2/rules/${RULE}`]);
  });

  it.each([
    [MAC, 'AA%3ABB%3ACC%3ADD%3AEE%3AFF'],
    [
      'ovpn:00000000-0000-0000-0000-000000000000',
      'ovpn%3A00000000-0000-0000-0000-000000000000',
    ],
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
    await new DeleteAlarmHandler().execute({ alarm_id: 12, gid: BOX }, client);
    expect(sent).toEqual([
      `DELETE /v2/target-lists/${LIST}`,
      `GET /v2/alarms/${BOX}/12`,
      `GET /v2/alarms/${BOX}/12`,
      `DELETE /v2/alarms/${BOX}/12`,
    ]);
  });
});

describe("the handlers' ID validators check the value as given", () => {
  it.each([
    [
      'validatePathSegment',
      (v: unknown) => ParameterValidator.validatePathSegment(v, 'id'),
    ],
    [
      'validateRuleId',
      (v: unknown) => ParameterValidator.validateRuleId(v, 'id'),
    ],
    [
      'validateAlarmId',
      (v: unknown) => ParameterValidator.validateAlarmId(v, 'id'),
    ],
  ])(
    '%s refuses surrounding whitespace and control characters, never trims',
    (_name, validate) => {
      for (const value of [
        ' 12',
        '12 ',
        '\t12',
        '12\n',
        '12\u0000',
        '1\u00002',
      ]) {
        expect([JSON.stringify(value), validate(value).isValid]).toEqual([
          JSON.stringify(value),
          false,
        ]);
      }
      expect(validate('12')).toMatchObject({
        isValid: true,
        sanitizedValue: '12',
      });
    }
  );

  it('validatePathSegment treats a missing or empty optional ID as not given', () => {
    for (const value of [undefined, null, '']) {
      expect(
        ParameterValidator.validatePathSegment(value, 'gid', {
          required: false,
        })
      ).toMatchObject({ isValid: true, sanitizedValue: undefined });
    }
    expect(
      ParameterValidator.validatePathSegment('  ', 'gid', { required: false })
        .isValid
    ).toBe(false);
    expect(ParameterValidator.validatePathSegment('', 'id').errors).toEqual([
      'id cannot be empty',
    ]);
    expect(ParameterValidator.validatePathSegment(7, 'id').isValid).toBe(false);
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
