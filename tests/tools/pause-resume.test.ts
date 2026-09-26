/**
 * pause_rule and resume_rule send what the MSP API documents:
 * POST /v2/rules/{id}/pause and POST /v2/rules/{id}/resume, no body.
 *
 * Measured live on 2026-09-25 against a disposable rule: both answer 200 with
 * the JSON string "ok"; the paused rule shows `status: "paused"` and no
 * `resumeTs`; a `duration` in the body ({duration, box}, {duration}) or the
 * query string is accepted and ignored, and the rule stays paused until
 * resumed. The axios instance is stubbed below `request()`, so the client's
 * cache is real and nothing leaves the process.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  PauseRuleHandler,
  ResumeRuleHandler,
} from '../../src/tools/handlers/rules.js';
import { ResourceValidator } from '../../src/validation/resource-validator.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: (error: any) => Boolean(error?.isAxiosError),
  };
});

/** The stubbed axios instance every client shares */
let mockApi: { get: jest.Mock; post: jest.Mock };

const BOX = '11111111-2222-3333-4444-555555555555';
const RULE = `${BOX}:101`;
const DECOY = `${BOX}:102`;

/**
 * A box with one disposable rule. GET /v2/rules ignores the query and returns
 * a paused decoy rule first; pause and resume flip the rule's status.
 */
function makeClient(boxId?: string) {
  let status = 'active';
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    boxId,
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  mockApi = (client as any).api;
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.get.mockImplementation(async (endpoint: string) => {
    if (endpoint !== '/v2/rules') {
      throw new Error(`unexpected GET ${endpoint}`);
    }
    return {
      status: 200,
      data: {
        count: 2,
        results: [
          { id: DECOY, action: 'allow', gid: BOX, status: 'paused' },
          { id: RULE, action: 'block', gid: BOX, status },
        ],
      },
    };
  });
  mockApi.post.mockImplementation(async (endpoint: string) => {
    if (endpoint === `/v2/rules/${RULE}/pause`) {
      status = 'paused';
    } else if (endpoint === `/v2/rules/${RULE}/resume`) {
      status = 'active';
    } else {
      throw new Error(`unexpected POST ${endpoint}`);
    }
    return { status: 200, data: 'ok' };
  });
  return { client, ruleStatus: () => status };
}

/** The POSTs sent, as [endpoint, body, config] */
const posts = () =>
  mockApi.post.mock.calls.map(([endpoint, body, config]) => ({
    endpoint,
    body,
    params: config?.params,
  }));

const parse = (res: any) => JSON.parse(res.content[0].text);

beforeEach(() => ResourceValidator.clearCache());

describe('FirewallaClient pauseRule / resumeRule', () => {
  it('pauseRule POSTs /v2/rules/{id}/pause with no body and no query', async () => {
    const { client } = makeClient(BOX);
    const result = await client.pauseRule(RULE);
    expect(posts()).toEqual([
      { endpoint: `/v2/rules/${RULE}/pause`, body: undefined, params: {} },
    ]);
    expect(result).toEqual({
      success: true,
      message: `Rule ${RULE} paused until resumed`,
    });
  });

  it('resumeRule POSTs /v2/rules/{id}/resume with no body and no query', async () => {
    const { client } = makeClient(BOX);
    const result = await client.resumeRule(RULE);
    expect(posts()).toEqual([
      { endpoint: `/v2/rules/${RULE}/resume`, body: undefined, params: {} },
    ]);
    expect(result.success).toBe(true);
  });

  it('a rule read after pauseRule is not served from the cache', async () => {
    const { client } = makeClient(BOX);
    const before = await client.getNetworkRules(`id:${RULE}`, 1);
    expect(before.results.find(r => r.id === RULE)?.status).toBe('active');
    await client.pauseRule(RULE);
    const after = await client.getNetworkRules(`id:${RULE}`, 1);
    expect(after.results.find(r => r.id === RULE)?.status).toBe('paused');
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });
});

describe('pause_rule', () => {
  it('pauses with no body and says the pause lasts until resume_rule', async () => {
    const { client, ruleStatus } = makeClient(undefined);
    const res = await new PauseRuleHandler().execute({ rule_id: RULE }, client);
    expect(res.isError).toBeFalsy();
    const body = parse(res);
    expect(body.data).toMatchObject({
      success: true,
      rule_id: RULE,
      action: 'pause_rule',
      paused_until: 'resumed',
    });
    expect(body.data).not.toHaveProperty('duration_minutes');
    expect(body.data).not.toHaveProperty('duration_ignored');
    expect(posts()).toEqual([
      { endpoint: `/v2/rules/${RULE}/pause`, body: undefined, params: {} },
    ]);
    expect(ruleStatus()).toBe('paused');
  });

  it.each([30, 1440, 99999, 'sixty'])(
    'ignores duration %j with a note and sends no body',
    async duration => {
      const { client } = makeClient(undefined);
      const res = await new PauseRuleHandler().execute(
        { rule_id: RULE, duration },
        client
      );
      expect(res.isError).toBeFalsy();
      const body = parse(res);
      expect(body.data.duration_ignored).toBe(true);
      expect(body.data.note).toContain('takes no duration');
      expect(body.data.note).toContain('resume_rule');
      expect(posts()).toEqual([
        { endpoint: `/v2/rules/${RULE}/pause`, body: undefined, params: {} },
      ]);
    }
  );

  it('ignores the box argument the 1.4.1 schema required', async () => {
    const { client } = makeClient(BOX);
    const res = await new PauseRuleHandler().execute(
      { rule_id: RULE, box: BOX },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(posts()).toEqual([
      { endpoint: `/v2/rules/${RULE}/pause`, body: undefined, params: {} },
    ]);
  });

  it('reads the status of the requested rule, not the first one returned', async () => {
    // The decoy listed first is paused; the requested rule is active
    const { client } = makeClient(BOX);
    const res = await new PauseRuleHandler().execute({ rule_id: RULE }, client);
    expect(res.isError).toBeFalsy();
    expect(posts()).toHaveLength(1);
  });

  it('sends nothing for a rule ID that does not exist', async () => {
    const { client } = makeClient(BOX);
    const res = await new PauseRuleHandler().execute(
      { rule_id: '00000000-0000-0000-0000-000000000000' },
      client
    );
    expect(res.isError).toBe(true);
    expect(posts()).toEqual([]);
  });
});

describe('resume_rule', () => {
  it('resumes a rule that pause_rule paused on the same client', async () => {
    const { client, ruleStatus } = makeClient(BOX);
    const paused = await new PauseRuleHandler().execute(
      { rule_id: RULE },
      client
    );
    expect(paused.isError).toBeFalsy();
    const resumed = await new ResumeRuleHandler().execute(
      { rule_id: RULE, box: BOX },
      client
    );
    expect(resumed.isError).toBeFalsy();
    expect(parse(resumed).data).toMatchObject({
      success: true,
      rule_id: RULE,
      action: 'resume_rule',
    });
    expect(posts()).toEqual([
      { endpoint: `/v2/rules/${RULE}/pause`, body: undefined, params: {} },
      { endpoint: `/v2/rules/${RULE}/resume`, body: undefined, params: {} },
    ]);
    expect(ruleStatus()).toBe('active');
  });

  it('sends nothing for a rule ID that does not exist', async () => {
    const { client } = makeClient(BOX);
    const res = await new ResumeRuleHandler().execute(
      { rule_id: '00000000-0000-0000-0000-000000000000' },
      client
    );
    expect(res.isError).toBe(true);
    expect(posts()).toEqual([]);
  });
});

/**
 * The inputSchema that src/server.ts advertises for a tool, read from the
 * ListTools handler: its property names and its required list
 */
function advertisedSchema(tool: string): {
  properties: string[];
  required: string[];
} {
  const file = path.join(process.cwd(), 'src', 'server.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const property = (
    object: ts.Expression | undefined,
    name: string
  ): ts.Expression | undefined => {
    if (!object || !ts.isObjectLiteralExpression(object)) {
      return undefined;
    }
    const found = object.properties.find(
      p => ts.isPropertyAssignment(p) && p.name.getText(source) === name
    ) as ts.PropertyAssignment | undefined;
    return found?.initializer;
  };

  const found: Array<{ properties: string[]; required: string[] }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const name = property(node, 'name');
      if (name && ts.isStringLiteral(name) && name.text === tool) {
        const schema = property(node, 'inputSchema');
        const properties = property(schema, 'properties');
        const required = property(schema, 'required');
        if (properties && ts.isObjectLiteralExpression(properties)) {
          found.push({
            properties: properties.properties.map(p =>
              (p.name as ts.Identifier).getText(source)
            ),
            required:
              required && ts.isArrayLiteralExpression(required)
                ? required.elements.map(e => (e as ts.StringLiteral).text)
                : [],
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (found.length !== 1) {
    throw new Error(
      `Expected one inputSchema for ${tool}, found ${found.length}`
    );
  }
  return found[0];
}

describe('advertised schemas', () => {
  it.each(['pause_rule', 'resume_rule'])('%s takes only rule_id', tool => {
    expect(advertisedSchema(tool)).toEqual({
      properties: ['rule_id'],
      required: ['rule_id'],
    });
  });
});
