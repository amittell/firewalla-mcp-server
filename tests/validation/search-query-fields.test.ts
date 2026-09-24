/**
 * Search query field handling (issue #35): dotted MSP qualifiers, `ts`
 * comparisons and ranges, and the search_devices `ip:` filter.
 */

import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';
import { FirewallaClient } from '../../src/firewalla/client.js';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
  };
  return { create: jest.fn(() => instance), interceptors: instance.interceptors };
});

describe('search query fields', () => {
  it.each([
    ['flows', 'source.ip:172.16.2.22'],
    ['flows', 'destination.ip:192.168.2.254'],
    ['flows', 'device.ip:192.168.*'],
    ['rules', 'target.type:intranet'],
    ['rules', 'target.type:domain AND action:block'],
  ])('accepts the dotted MSP qualifier in %s query %s', (entity, query) => {
    expect(validateFirewallaQuerySyntax(query).isValid).toBe(true);
    expect(QuerySanitizer.validateQueryFields(query, entity).isValid).toBe(true);
  });

  it.each([
    'ts:>=1735689600',
    'ts:<1735689600.5',
    'ts:1735689600-1735693200',
    'download:>10MB',
  ])('accepts the MSP numeric search %s', query => {
    expect(validateFirewallaQuerySyntax(query).isValid).toBe(true);
    expect(QuerySanitizer.validateQueryFields(query, 'flows').isValid).toBe(true);
  });

  it('still rejects an unknown flat field', () => {
    const result = QuerySanitizer.validateQueryFields('bogus_field:1', 'flows');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('bogus_field');
  });
});

describe('searchDevices ip filter', () => {
  const devices = [
    { id: 'aa:bb:cc:00:00:01', mac: 'aa:bb:cc:00:00:01', name: 'nas', ip: '172.16.2.25', online: true },
    { id: 'aa:bb:cc:00:00:02', mac: 'aa:bb:cc:00:00:02', name: 'laptop', ip: '172.16.2.30', online: false },
    { id: 'aa:bb:cc:00:00:03', mac: 'aa:bb:cc:00:00:03', name: 'tv', ip: '192.168.1.9', online: true },
  ];

  const search = async (query: string): Promise<string[]> => {
    const client = new FirewallaClient({
      mspToken: 'test-token',
      mspId: 'test.firewalla.net',
      apiTimeout: 30000,
      rateLimit: 100,
      cacheTtl: 300,
      defaultPageSize: 100,
      maxPageSize: 10000,
    } as any);
    (client as any).request = jest.fn().mockResolvedValue(devices);
    const result = await client.searchDevices({ query, limit: 50 });
    return result.results.map((d: any) => d.name);
  };

  it.each([
    ['ip:172.16.2.25', ['nas']],
    ['ip:172.16.2.*', ['nas', 'laptop']],
    ['ip:172.16.2.25 AND online:true', ['nas']],
    ['ip:172.16.2.30 AND online:true', []],
    ['ip:10.0.0.1', []],
  ])('%s -> %j', async (query, expected) => {
    expect(await search(query)).toEqual(expected);
  });
});
