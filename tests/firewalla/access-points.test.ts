import { describe, it, expect } from '@jest/globals';
import { BOX, startLocalApi, json, makeClient } from './local-api.js';

describe('Wi-Fi and Access Point Features', () => {
  it('preserves deviceType, isFirewalla, isRouter, and monitoring in getDeviceStatus', async () => {
    const rawDevices = [
      {
        id: '00:11:22:33:44:01',
        mac: '00:11:22:33:44:01',
        name: 'Office Access Point',
        ip: '192.0.2.100',
        online: true,
        deviceType: 'fwap-D',
        isFirewalla: false,
        isRouter: false,
        monitoring: true,
        network: { id: 'net1', name: 'Primary LAN' },
      },
      {
        id: '00:11:22:33:44:02',
        mac: '00:11:22:33:44:02',
        name: 'Core Gateway',
        ip: '192.0.2.1',
        online: true,
        deviceType: 'gse',
        isFirewalla: true,
        isRouter: true,
        monitoring: true,
        network: { id: 'net1', name: 'Primary LAN' },
      },
    ];

    const { port, close } = await startLocalApi((_req, res, path) => {
      if (path === '/v2/boxes') {
        json(res, 200, [{ gid: BOX, name: 'home', online: true }]);
      } else if (path === '/v2/devices') {
        json(res, 200, rawDevices);
      } else {
        json(res, 404, {});
      }
    });

    const client = makeClient(`http://127.0.0.1:${port}`);

    try {
      const response = await client.getDeviceStatus();
      expect(response.results).toHaveLength(2);

      const ap = response.results.find(d => d.id === '00:11:22:33:44:01');
      expect(ap).toBeDefined();
      expect(ap?.deviceType).toBe('fwap-D');
      expect(ap?.isFirewalla).toBe(false);
      expect(ap?.isRouter).toBe(false);
      expect(ap?.monitoring).toBe(true);

      const router = response.results.find(d => d.id === '00:11:22:33:44:02');
      expect(router).toBeDefined();
      expect(router?.deviceType).toBe('gse');
      expect(router?.isFirewalla).toBe(true);
      expect(router?.isRouter).toBe(true);
      expect(router?.monitoring).toBe(true);
    } finally {
      await close();
    }
  });

  it('retrieves access points via getAccessPoints', async () => {
    const mockAps = [
      {
        id: '00:11:22:33:44:01',
        name: 'Office Access Point',
        ip: '192.0.2.100',
        online: true,
        model: 'fwap-D',
        powerType: 'POE 802.3at',
        backhaulState: 'ethernet',
        version: '1.16.85',
        uplink: {
          mac: '00:11:22:33:44:02',
          type: 'box',
          port: 'eth2',
          localPort: 'eth1',
          connectionType: 'ethernet',
        },
        bss: [
          { ssid: 'CorpWifi', bssid: '00:11:22:33:44:03', intf: 'ath21' },
          { ssid: 'CorpWifi', bssid: '00:11:22:33:44:04', intf: 'ath1' },
          { ssid: 'CorpWifi', bssid: '00:11:22:33:44:05', intf: 'ath0' },
        ],
        eths: [
          { intf: 'eth1', connected: true, linkSpeed: 1000 },
          { intf: 'eth0', connected: false },
        ],
      },
    ];

    const { port, received, close } = await startLocalApi((_req, res, path) => {
      if (path === '/v2/boxes') {
        json(res, 200, [{ gid: BOX, name: 'home', online: true }]);
      } else if (path === `/v2/boxes/${BOX}/wifi/access-points`) {
        json(res, 200, mockAps);
      } else {
        json(res, 404, {});
      }
    });

    const client = makeClient(`http://127.0.0.1:${port}`);

    try {
      const aps = await client.getAccessPoints(BOX);
      expect(aps).toHaveLength(1);
      expect(aps[0].model).toBe('fwap-D');
      expect(aps[0].powerType).toBe('POE 802.3at');
      expect(aps[0].uplink?.port).toBe('eth2');
      expect(aps[0].eths).toHaveLength(2);
      expect(aps[0].eths?.[0].connected).toBe(true);
      expect(aps[0].eths?.[0].linkSpeed).toBe(1000);
      expect(aps[0].bss).toHaveLength(3);
      expect(received).toContain(`GET /v2/boxes/${BOX}/wifi/access-points`);
    } finally {
      await close();
    }
  });

  it('retrieves channels via getAccessPointChannels', async () => {
    const mockChannels = {
      '2g': [{ channel: 1, dfsState: 'NON_DFS' }, { channel: 6, dfsState: 'NON_DFS' }],
      '5g': [{ channel: 36, dfsState: 'NON_DFS' }, { channel: 100, dfsState: 'DFS_CAC_COMPLETED' }],
      '6g': [{ channel: 1, dfsState: 'NON_DFS' }, { channel: 37, dfsState: 'NON_DFS' }],
    };

    const apId = '00:11:22:33:44:01';
    const { port, received, close } = await startLocalApi((_req, res, path) => {
      if (path === '/v2/boxes') {
        json(res, 200, [{ gid: BOX, name: 'home', online: true }]);
      } else if (path === `/v2/boxes/${BOX}/wifi/access-points/${encodeURIComponent(apId)}/channels`) {
        json(res, 200, mockChannels);
      } else {
        json(res, 404, {});
      }
    });

    const client = makeClient(`http://127.0.0.1:${port}`);

    try {
      const channels = await client.getAccessPointChannels(apId, BOX);
      expect(channels['2g']).toHaveLength(2);
      expect(channels['5g']).toHaveLength(2);
      expect(channels['6g']).toHaveLength(2);
      expect(channels['5g']?.[1].dfsState).toBe('DFS_CAC_COMPLETED');
      expect(received).toContain(`GET /v2/boxes/${BOX}/wifi/access-points/${encodeURIComponent(apId)}/channels`);
    } finally {
      await close();
    }
  });

  it('retrieves wifi networks and settings', async () => {
    const mockNetworks = [
      {
        id: 'net-123',
        ssid: 'CorpWifi',
        encryption: 'psk2+ccmp',
        wpa3: false,
        bands: ['2.4g', '5g', '6g'],
        intf: 'br0',
      },
    ];

    const mockSettings = {
      autoSteer: true,
      maxComp: true,
      stormControl: false,
      useDfsChannels: true,
      apcVersion: '0.16.49',
    };

    const { port, close } = await startLocalApi((_req, res, path) => {
      if (path === '/v2/boxes') {
        json(res, 200, [{ gid: BOX, name: 'home', online: true }]);
      } else if (path === `/v2/boxes/${BOX}/wifi/networks`) {
        json(res, 200, mockNetworks);
      } else if (path === `/v2/boxes/${BOX}/wifi/settings`) {
        json(res, 200, mockSettings);
      } else {
        json(res, 404, {});
      }
    });

    const client = makeClient(`http://127.0.0.1:${port}`);

    try {
      const networks = await client.getWifiNetworks(BOX);
      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe('CorpWifi');
      expect(networks[0].bands).toEqual(['2.4g', '5g', '6g']);

      const settings = await client.getWifiSettings(BOX);
      expect(settings.autoSteer).toBe(true);
      expect(settings.apcVersion).toBe('0.16.49');
    } finally {
      await close();
    }
  });
});
