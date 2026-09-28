/**
 * get_active_alarms reports a severity only where the API sends one. The
 * docs audit found every alarm's derived severity to be "medium". The API
 * is stubbed.
 */

import { FirewallaClient } from '../../src/firewalla/client.js';
import { GetActiveAlarmsHandler } from '../../src/tools/handlers/security.js';

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

/** A client whose GETs answer `answer(url)` */
function makeClient(answer: (url: string) => unknown) {
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
  get.mockImplementation(async (url: string) => ({
    status: 200,
    data: answer(url),
  }));
  return { client, get };
}

const body = (res: any) => JSON.parse(res.content[0].text);

const ALARM_PUBLIC = {
  aid: 1,
  gid: 'box-a',
  type: 1,
  ts: 1700000000,
  status: 1,
  message: 'Security activity',
  device: { ip: '192.168.1.2', name: 'laptop' },
  remote: { ip: '8.8.8.8', region: 'US' },
};
const ALARM_LOCAL = {
  aid: 2,
  gid: 'box-a',
  type: 5,
  ts: 1700000000,
  status: 1,
  message: 'New device',
  device: { ip: '192.168.1.3', name: 'phone' },
};

describe('get_active_alarms reports a severity only where the API sends one', () => {
  it('leaves severity out of alarms with none, of any type', async () => {
    const { client } = makeClient(() => ({
      count: 3,
      results: [
        ALARM_PUBLIC,
        ALARM_LOCAL,
        { ...ALARM_LOCAL, aid: 3, type: 10 },
      ],
    }));
    const res = await new GetActiveAlarmsHandler().execute(
      { limit: 10 },
      client
    );
    const alarms = body(res).data.alarms;
    expect(alarms).toHaveLength(3);
    for (const alarm of alarms) {
      expect(alarm).not.toHaveProperty('severity');
    }
  });

  it('keeps a severity the API sends', async () => {
    const { client } = makeClient(() => ({
      count: 1,
      results: [{ ...ALARM_PUBLIC, severity: 'high' }],
    }));
    const res = await new GetActiveAlarmsHandler().execute(
      { limit: 10 },
      client
    );
    expect(body(res).data.alarms[0].severity).toBe('high');
  });
});
