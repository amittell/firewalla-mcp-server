/**
 * pause_rule and resume_rule classify a failure by the error's class and
 * status. pause_rule looked for "401" and "403" in the message, which since
 * the 401 kept its status reads "Authentication failed. Please check your
 * MSP token.", so a 401 answered errorType api_error; resume_rule and the
 * rule-status read both tools make first classified nothing (unknown_error
 * and api_error for every failure). A 401, or a 403 (ForbiddenError), is
 * now authentication_error in all three.
 */

import { ToolRegistry } from '../../src/tools/registry.js';
import { logger } from '../../src/monitoring/logger.js';
import { json, makeClient, startLocalApi } from '../firewalla/local-api.js';

/** How GET /v2/rules is answered: a status, or the rule with this status */
let read: number | 'active' | 'paused';
/** The status answering POST /v2/rules/<id>/pause and /resume */
let write: number;
let api: Awaited<ReturnType<typeof startLocalApi>>;

beforeAll(async () => {
  api = await startLocalApi((request, response, path) => {
    if (request.method === 'GET' && path === '/v2/rules') {
      if (typeof read === 'number') {
        json(response, read, { error: { message: 'refused' } });
      } else {
        const rule = { id: 'rule-1', action: 'block', status: read };
        json(response, 200, { count: 1, results: [rule] });
      }
      return;
    }
    json(response, write, write === 200 ? 'ok' : { error: 'refused' });
  });
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  read = 'active';
  write = 200;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function call(name: 'pause_rule' | 'resume_rule') {
  const handler = new ToolRegistry({ enableWriteTools: true }).getHandler(
    name
  )!;
  const response = await handler.execute(
    { rule_id: 'rule-1' },
    makeClient(`http://127.0.0.1:${api.port}`)
  );
  return JSON.parse(response.content[0].text);
}

describe('pause_rule', () => {
  beforeEach(() => {
    read = 'active';
  });

  it.each([
    [401, 'authentication_error'],
    [403, 'authentication_error'],
    [404, 'api_error'],
    [500, 'api_error'],
  ])('a pause answered %i is %s', async (status, kind) => {
    write = status;
    const body = await call('pause_rule');

    expect(body.message).toMatch(/^Failed to pause rule: /);
    expect(body.errorType).toBe(kind);
  });

  it('a 404 gets the advice to check the rule id', async () => {
    write = 404;
    const body = await call('pause_rule');

    expect(body.validation_errors[0]).toMatch(/^Verify the rule_id exists/);
  });

  it('a 401 gets the advice to check the credentials', async () => {
    write = 401;
    const body = await call('pause_rule');

    expect(body.validation_errors[0]).toBe(
      'Verify your Firewalla MSP API credentials are valid'
    );
  });
});

describe('resume_rule', () => {
  beforeEach(() => {
    read = 'paused';
  });

  it.each([
    [401, 'authentication_error'],
    [403, 'authentication_error'],
    [500, 'api_error'],
  ])('a resume answered %i is %s', async (status, kind) => {
    write = status;
    const body = await call('resume_rule');

    expect(body.message).toMatch(/^Failed to resume rule: /);
    expect(body.errorType).toBe(kind);
  });
});

describe('the rule-status read both make first', () => {
  it.each([
    ['pause_rule', 401, 'authentication_error'],
    ['resume_rule', 401, 'authentication_error'],
    ['pause_rule', 403, 'authentication_error'],
    ['pause_rule', 500, 'api_error'],
  ] as const)(
    '%s with the read answered %i is %s',
    async (name, status, kind) => {
      read = status;
      const body = await call(name);

      expect(body.message).toMatch(/^Failed to check rule status: /);
      expect(body.errorType).toBe(kind);
    }
  );
});
