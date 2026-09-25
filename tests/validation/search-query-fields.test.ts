/**
 * Search query field handling (issue #35): dotted MSP qualifiers, `ts`
 * comparisons and ranges, and the search_devices `ip:` filter.
 * Issue #42: values containing colons (MACs, IPv6), and AND/OR/NOT in the
 * search_devices client-side filter.
 */

import { QuerySanitizer } from '../../src/validation/error-handler.js';
import { validateFirewallaQuerySyntax } from '../../src/utils/query-validator.js';
import { FirewallaClient } from '../../src/firewalla/client.js';
import { queryParser } from '../../src/search/parser.js';
import { EnhancedQueryValidator } from '../../src/validation/enhanced-query-validator.js';
import { SearchDevicesHandler } from '../../src/tools/handlers/search.js';

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

describe('values containing colons', () => {
  it.each([
    ['mac:AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF'],
    ['mac:"aa:bb:cc:00:00:01"', 'aa:bb:cc:00:00:01'],
    ['ip:fe80::1', 'fe80::1'],
    ['ip:::1', '::1'],
    ['ip:2001:db8::5 AND online:true', '2001:db8::5'],
  ])('%s is field-and-value %s at every validation layer', (query, value) => {
    const syntax = validateFirewallaQuerySyntax(query);
    expect(syntax.errors).toEqual([]);

    const fields = QuerySanitizer.validateQueryFields(query, 'devices');
    expect(fields.errors).toEqual([]);

    const enhanced = EnhancedQueryValidator.validateQuery(query, 'devices');
    expect(enhanced.errors).toEqual([]);

    const parsed = queryParser.parse(query, 'devices');
    expect(parsed.errors).toEqual([]);
    const ast: any = parsed.ast;
    const term = ast.type === 'logical' ? ast.left : ast;
    expect(term).toMatchObject({ type: 'field', value });
  });

  it('keeps a wildcard after colons as one pattern', () => {
    const parsed = queryParser.parse('mac:AA:BB:* OR name:*phone*', 'devices');
    expect(parsed.errors).toEqual([]);
    expect(parsed.ast).toMatchObject({
      type: 'logical',
      operator: 'OR',
      left: { type: 'wildcard', field: 'mac', pattern: 'AA:BB:*' },
      right: { type: 'wildcard', field: 'name', pattern: '*phone*' },
    });
  });

  it('does not read a quoted value as a field name', () => {
    const result = QuerySanitizer.validateQueryFields(
      'domain:"alert from:host at:noon"',
      'flows'
    );
    expect(result.errors).toEqual([]);
  });
});

describe('searchDevices boolean filter', () => {
  // Shaped like the documented /v2/devices response: the MAC is in `id`
  const devices = [
    { id: 'mac:AA:BB:CC:00:00:01', gid: 'box-a', name: 'nas', ip: '172.16.2.25', macVendor: 'Synology', online: true, network: { id: 'n1', name: 'Home' }, group: { id: 'g1', name: 'Servers' } },
    { id: 'mac:AA:BB:CC:00:00:02', gid: 'box-a', name: 'laptop', ip: '172.16.2.30', macVendor: 'Apple Inc.', online: false, network: { id: 'n1', name: 'Home' }, group: { id: 'g2', name: 'Kids' } },
    { id: 'mac:DD:EE:FF:00:00:03', gid: 'box-b', name: 'tv', ip: '192.168.1.9', macVendor: 'Samsung', online: true, network: { id: 'n2', name: 'Guest Network' } },
    { id: 'mac:DD:EE:FF:00:00:04', gid: 'box-b', name: 'phone', ip: 'fe80::1', macVendor: 'Apple Inc.', online: true, network: { id: 'n2', name: 'Guest Network' }, group: { id: 'g2', name: 'Kids' } },
  ];

  const newClient = (): FirewallaClient => {
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
    return client;
  };

  const search = async (query: string): Promise<string[]> => {
    const result = await newClient().searchDevices({ query, limit: 50 });
    return result.results.map((d: any) => d.name);
  };

  it.each([
    // OR is evaluated with the same per-field matching as AND
    ['name:nas OR name:tv', ['nas', 'tv']],
    ['ip:172.16.2.* OR ip:192.168.1.9', ['nas', 'laptop', 'tv']],
    ['ip:172.16.2.* AND name:*lap*', ['laptop']],
    ['name:laptop AND online:true', []],
    ['online:true AND (name:nas OR name:laptop)', ['nas']],
    // AND binds tighter than OR: offline OR (tv AND nas)
    ['online:false OR name:tv AND name:nas', ['laptop']],
    ['NOT online:true', ['laptop']],
    // MAC addresses match the `mac:` device id, case-insensitively
    ['mac:AA:BB:CC:00:00:01', ['nas']],
    ['mac:"aa:bb:cc:00:00:02"', ['laptop']],
    ['mac:AA:BB:CC:* OR name:*phone*', ['nas', 'laptop', 'phone']],
    ['ip:fe80::1', ['phone']],
    ['mac_vendor:apple AND online:false', ['laptop']],
    ['gid:box-b', ['tv', 'phone']],
    ['network.name:"Guest Network"', ['tv', 'phone']],
    ['group.name:*kids*', ['laptop', 'phone']],
  ])('%s -> %j', async (query, expected) => {
    expect(await search(query)).toEqual(expected);
  });

  it.each([
    ['name:nas OR name:tv', ['nas', 'tv']],
    ['ip:172.16.2.* OR ip:192.168.1.9', ['nas', 'laptop', 'tv']],
    ['ip:192.168.1.9 OR name:laptop', ['laptop', 'tv']],
  ])('search_devices %s -> %j', async (query, expected) => {
    const response = await new SearchDevicesHandler().execute(
      { query, limit: 50 },
      newClient()
    );
    expect(response.isError).toBeFalsy();
    const body = JSON.parse(response.content[0].text);
    const names = body.data.devices.map((d: any) => d.name).sort();
    expect(names).toEqual([...expected].sort());
  });
});
