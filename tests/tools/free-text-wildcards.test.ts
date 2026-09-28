/**
 * A * in free text is a wildcard in every layer, from the #74 overview:
 * "Unicode wildcard validation remains inconsistent with the parser."
 * name:*Alex’s*, with the U+2019 apostrophe device names carry, passes
 * every check and parses as one wildcard. Free text *Alex’s* passed every
 * check too, but the parser read it as the three terms *, Alex’s and *,
 * and search_devices, search_target_lists and search_rules compared the *
 * as a character and found nothing, while Alex’s found the device. The API
 * is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import {
  SearchAlarmsHandler,
  SearchDevicesHandler,
  SearchFlowsHandler,
  SearchRulesHandler,
  SearchTargetListsHandler,
} from '../../src/tools/handlers/search.js';
import { queryParser } from '../../src/search/parser.js';
import { queryStructureErrors } from '../../src/utils/query-structure.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';
import { EnhancedQueryValidator } from '../../src/validation/enhanced-query-validator.js';
import { QuerySanitizer } from '../../src/validation/error-handler.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    interceptors: instance.interceptors,
    isAxiosError: () => false,
  };
});

function makeClient() {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 0,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const get = (client as any).api.get as jest.Mock;
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/v2/devices') {
      return {
        status: 200,
        data: [
          {
            id: 'aa:bb:cc:dd:ee:00',
            gid: 'box-a',
            name: 'Alex’s MacBook Air',
            ip: '10.0.0.2',
          },
          {
            id: 'aa:bb:cc:dd:ee:01',
            gid: 'box-a',
            name: 'nas',
            ip: '10.0.0.3',
          },
          {
            id: 'aa:bb:cc:dd:ee:02',
            gid: 'box-a',
            name: 'star*box',
            ip: '10.0.0.4',
          },
        ],
      };
    }
    if (url === '/v2/target-lists') {
      return {
        status: 200,
        data: [
          {
            id: 'l1',
            name: 'Alex’s list',
            owner: 'global',
            targets: ['a.com'],
          },
          { id: 'l2', name: 'ads', owner: 'global', targets: ['b.com'] },
        ],
      };
    }
    if (url === '/v2/rules') {
      return {
        status: 200,
        data: {
          count: 2,
          results: [
            {
              id: 'r1',
              action: 'block',
              status: 'active',
              target: { type: 'domain', value: 'x.example' },
              notes: 'Alex’s rule',
            },
            {
              id: 'r2',
              action: 'block',
              status: 'active',
              target: { type: 'domain', value: 'b.example' },
            },
          ],
        },
      };
    }
    return { status: 200, data: { count: 0, results: [] } };
  });
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

describe('*Alex’s* is read alike by every check, the parser and the matchers', () => {
  it.each(['devices', 'target_lists', 'rules'] as const)(
    'name:*Alex’s* passes every check and parses as one wildcard for %s',
    entity => {
      const query = 'name:*Alex’s*';
      expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
      expect(queryStructureErrors(query)).toEqual([]);
      expect(QuerySanitizer.sanitizeSearchQuery(query).errors).toEqual([]);
      expect(QuerySanitizer.validateQueryFields(query, entity).errors).toEqual(
        []
      );
      expect(
        EnhancedQueryValidator.validateQuery(query, entity).errors
      ).toEqual([]);
      const parsed = queryParser.parse(query, entity);
      expect(parsed.errors).toEqual([]);
      expect(parsed.ast).toEqual({
        type: 'wildcard',
        field: 'name',
        pattern: '*Alex’s*',
      });
    }
  );

  it.each([
    ['*Alex’s*', '*Alex’s*'],
    ['*MacBook*', '*MacBook*'],
    ['Mac*Air', 'Mac*Air'],
    ['5*', '5*'],
  ])('free text %s parses as one term', (query, value) => {
    const parsed = queryParser.parse(query, 'devices');
    expect(parsed.errors).toEqual([]);
    expect(parsed.ast).toEqual({ type: 'text', value });
    expect(validateFirewallaQuerySyntax(query).errors).toEqual([]);
  });

  it('a lone * is still the match-all node', () => {
    expect(queryParser.parse('*', 'devices').ast).toEqual({
      type: 'field',
      field: '*',
      value: '*',
    });
  });

  const names = (res: any): string[] => {
    const data = body(res).data;
    return (data.devices ?? data.target_lists ?? data.rules).map(
      (item: any) => item.name ?? item.id
    );
  };

  it.each([
    ['name:*Alex’s*', ['Alex’s MacBook Air']],
    ['*Alex’s*', ['Alex’s MacBook Air']],
    ['*MacBook*', ['Alex’s MacBook Air']],
    ['Mac*Air', ['Alex’s MacBook Air']],
    ['Air*Mac', []],
    ["*Alex's*", []],
    ['"*MacBook*"', []],
    ['"star*box"', ['star*box']],
    ['NOT *MacBook*', ['nas', 'star*box']],
    ['-*MacBook*', ['nas', 'star*box']],
  ])('search_devices %s', async (query, expected) => {
    const { client } = makeClient();
    const res = await new SearchDevicesHandler().execute(
      { query, limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(names(res)).toEqual(expected);
  });

  it.each([
    ['search_target_lists', SearchTargetListsHandler, ['Alex’s list']],
    ['search_rules', SearchRulesHandler, ['r1']],
  ] as const)(
    '%s finds *Alex’s* as it finds Alex’s',
    async (_name, Handler, expected) => {
      for (const query of ['*Alex’s*', 'Alex’s']) {
        const { client } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect(res.isError).toBeFalsy();
        expect(names(res)).toEqual(expected);
      }
    }
  );

  it.each([
    ['search_flows', SearchFlowsHandler],
    ['search_alarms', SearchAlarmsHandler],
  ] as const)(
    '%s sends device.name:*Alex’s* and *Alex’s* as written',
    async (_name, Handler) => {
      for (const query of ['device.name:*Alex’s*', '*Alex’s*']) {
        const { client, get } = makeClient();
        const res = await new Handler().execute({ query, limit: 10 }, client);
        expect(res.isError).toBeFalsy();
        expect(
          get.mock.calls.map(([, config]) => config?.params?.query)
        ).toEqual([expect.stringContaining(query)]);
      }
    }
  );
});
