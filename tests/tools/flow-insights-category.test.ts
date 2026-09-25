/**
 * The MSP API sends a flow's category as a string ("games", "social", or ""),
 * not as the { name } object the older data model described. get_flow_insights
 * read category.name and put every flow under "uncategorized".
 */

import { FirewallaClient } from '../../src/firewalla/client.js';

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

it('groups flows by the category string the API sends', async () => {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const now = Math.floor(Date.now() / 1000);
  const flows = [
    { category: 'games', domain: 'roblox.com', total: 3000 },
    { category: 'games', domain: 'roblox.com', total: 1000 },
    { category: 'social', domain: 'instagram.com', total: 2000 },
    { category: '', domain: 'example.com', total: 500 },
  ].map((flow, i) => ({
    ...flow,
    ts: now - 60 - i,
    download: flow.total,
    upload: 0,
    device: { id: 'AA:BB:CC:DD:EE:FF', name: 'laptop', ip: '192.168.1.10' },
  }));
  (client as any).request = jest.fn(async () => ({
    count: flows.length,
    results: flows,
  }));

  const insights = await client.getFlowInsights('1h');
  const categories = insights.categoryBreakdown.map(entry => entry.category);
  expect(categories).toEqual(
    expect.arrayContaining(['games', 'social', 'uncategorized'])
  );
  expect(
    insights.categoryBreakdown.find(entry => entry.category === 'games')?.count
  ).toBe(2);
});

it('treats an empty categories list as all categories', async () => {
  const client = new FirewallaClient({
    mspToken: 'test-token',
    mspId: 'test.firewalla.net',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
  } as any);
  const request = jest.fn(async () => ({ count: 0, results: [] }));
  (client as any).request = request;
  await client.getFlowInsights('1h', { categories: [] });
  const queries = request.mock.calls.map(([, , params]: any[]) => params.query);
  expect(queries.some(query => query.includes('()'))).toBe(false);
});
