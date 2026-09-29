/**
 * Boolean translation, which writes blocked:true as blocked:1, leaves quoted
 * text alone, as Copilot's review of #74 at 56d50fc asked. The translator
 * rewrote inside quotes: "blocked:true" became "blocked:1", so search_flows
 * sent domain:"blocked:true" as domain:"blocked:1".
 * The API is stubbed; nothing leaves the process.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { SearchFlowsHandler } from '../../src/tools/handlers/search.js';
import { translateBooleanQuery } from '../../src/utils/simple-boolean-translator.js';

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
  get.mockImplementation(async () => ({
    status: 200,
    data: { count: 0, results: [] },
  }));
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);
const sentQueries = (get: jest.Mock): unknown[] =>
  get.mock.calls.map(([, config]) => config?.params?.query);

describe('boolean translation leaves quoted text alone', () => {
  const translators = [
    { name: 'translateBooleanQuery', translate: translateBooleanQuery },
  ];

  it.each(
    translators.flatMap(({ name, translate }) =>
      [
        { query: '"blocked:true"', entity: 'flows' },
        { query: "'blocked:true'", entity: 'flows' },
        { query: '"not blocked:true"', entity: 'flows' },
        { query: 'domain:"blocked:true"', entity: 'flows' },
        { query: "'online:true'", entity: 'devices' },
        { query: '"online=false"', entity: 'devices' },
      ].map(row => ({ ...row, name, translate }))
    )
  )('$name leaves $query as written', ({ query, entity, translate }) => {
    expect(translate(query, entity)).toBe(query);
  });

  it.each(translators)(
    '$name translates outside the quotes',
    ({ translate }) => {
      expect(translate('domain:"blocked:true" blocked:true', 'flows')).toBe(
        'domain:"blocked:true" blocked:1'
      );
      // An apostrophe after a letter opens no quote
      expect(translate("Alex's blocked:true", 'flows')).toBe(
        "Alex's blocked:1"
      );
      expect(translate("'a b' online:false", 'devices')).toBe("'a b' online:0");
    }
  );

  it('search_flows sends a quoted value as written', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'domain:"blocked:true"', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual(['domain:"blocked:true"']);
    const { data } = body(res);
    expect(data.metadata.query).toBe('domain:"blocked:true"');
    expect(data.query_info.final_query).toBe('domain:"blocked:true"');
  });

  it('search_flows translates blocked:true outside the quotes', async () => {
    const { client, get } = makeClient();
    const res = await new SearchFlowsHandler().execute(
      { query: 'domain:"blocked:true" blocked:true', limit: 10 },
      client
    );
    expect(res.isError).toBeFalsy();
    expect(sentQueries(get)).toEqual(['domain:"blocked:true" status:blocked']);
  });
});
