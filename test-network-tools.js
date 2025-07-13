#!/usr/bin/env node

/**
 * Direct Network Tools Testing Script
 * Tests the 3 Network MCP tools: GetFlowDataHandler, GetBandwidthUsageHandler, GetOfflineDevicesHandler
 */

import { 
  GetFlowDataHandler, 
  GetBandwidthUsageHandler, 
  GetOfflineDevicesHandler 
} from './dist/tools/handlers/network.js';

// Mock FirewallaClient for testing
class MockFirewallaClient {
  constructor() {
    this.mockEnabled = true;
  }

  async getFlowData(query, groupBy, sortBy, limit, cursor) {
    console.log(`[MOCK] getFlowData called with:`, { query, groupBy, sortBy, limit, cursor });
    return {
      results: [
        {
          ts: 1640995200,
          source: { ip: '192.168.1.100' },
          destination: { ip: '8.8.8.8' },
          protocol: 'tcp',
          download: 1024000,
          upload: 512000,
          count: 10,
          duration: 300,
          direction: 'outbound',
          block: false,
          device: { ip: '192.168.1.100', name: 'MacBook' },
          region: 'US',
          category: 'web'
        },
        {
          ts: 1640995300,
          source: { ip: '192.168.1.101' },
          destination: { ip: '1.1.1.1' },
          protocol: 'udp',
          download: 2048000,
          upload: 1024000,
          count: 5,
          duration: 150,
          direction: 'outbound',
          block: true,
          device: { ip: '192.168.1.101', name: 'iPhone' },
          region: 'US',
          category: 'dns'
        }
      ],
      next_cursor: 'next_page_123',
      total_count: 150
    };
  }

  async getBandwidthUsage(period, limit) {
    console.log(`[MOCK] getBandwidthUsage called with:`, { period, limit });
    return {
      results: [
        {
          device_id: 'device-123',
          device_name: 'MacBook Pro',
          ip: '192.168.1.100',
          bytes_uploaded: 1024000000,    // 1GB
          bytes_downloaded: 2048000000,  // 2GB
          total_bytes: 3072000000        // 3GB
        },
        {
          device_id: 'device-456',
          device_name: 'iPhone',
          ip: '192.168.1.101',
          bytes_uploaded: 512000000,     // 512MB
          bytes_downloaded: 1024000000,  // 1GB
          total_bytes: 1536000000        // 1.5GB
        }
      ]
    };
  }

  async getDeviceStatus(deviceId, includeOffline, limit, cursor) {
    console.log(`[MOCK] getDeviceStatus called with:`, { deviceId, includeOffline, limit, cursor });
    return {
      results: [
        {
          id: 'device-123',
          gid: 'gid-123',
          name: 'MacBook Pro',
          ip: '192.168.1.100',
          macVendor: 'Apple',
          online: true,
          lastSeen: 1640995200,
          ipReserved: true,
          network: { name: 'Main Network' },
          group: { name: 'Work Devices' },
          totalDownload: 5000000000,
          totalUpload: 2000000000
        },
        {
          id: 'device-456',
          gid: 'gid-456',
          name: 'Old Laptop',
          ip: '192.168.1.150',
          macVendor: 'Dell',
          online: false,
          lastSeen: 1640980000,
          ipReserved: false,
          network: { name: 'Guest Network' },
          group: { name: 'Legacy Devices' },
          totalDownload: 1000000000,
          totalUpload: 500000000
        },
        {
          id: 'device-789',
          gid: 'gid-789',
          name: 'Disconnected Phone',
          ip: '192.168.1.200',
          macVendor: 'Samsung',
          online: false,
          lastSeen: 1640970000,
          ipReserved: false,
          network: { name: 'Main Network' },
          group: { name: 'Mobile Devices' },
          totalDownload: 800000000,
          totalUpload: 200000000
        }
      ],
      total_count: 3
    };
  }
}

async function testNetworkTools() {
  console.log('='.repeat(60));
  console.log('TESTING 3 NETWORK MCP TOOLS');
  console.log('='.repeat(60));

  const mockFirewalla = new MockFirewallaClient();
  const flowHandler = new GetFlowDataHandler();
  const bandwidthHandler = new GetBandwidthUsageHandler();
  const offlineDevicesHandler = new GetOfflineDevicesHandler();

  console.log('\n1. TESTING GetFlowDataHandler');
  console.log('-'.repeat(40));

  // Test valid parameters
  try {
    console.log('\n✓ Testing with valid parameters...');
    const flowResult = await flowHandler.execute({
      query: 'protocol:tcp',
      limit: 100,
      sortBy: 'ts:desc'
    }, mockFirewalla);

    console.log('Response:', {
      isError: flowResult.isError,
      contentLength: flowResult.content?.[0]?.text?.length,
      hasContent: !!flowResult.content?.[0]?.text
    });

    if (flowResult.content?.[0]?.text) {
      const parsed = JSON.parse(flowResult.content[0].text);
      console.log('Parsed response keys:', Object.keys(parsed));
      console.log('Data count:', parsed.data?.length || 0);
    }
  } catch (error) {
    console.error('❌ Error in flow data test:', error.message);
  }

  // Test missing required parameter
  try {
    console.log('\n✓ Testing missing limit parameter...');
    const flowErrorResult = await flowHandler.execute({
      query: 'protocol:tcp'
      // Missing limit parameter
    }, mockFirewalla);

    console.log('Error response:', {
      isError: flowErrorResult.isError,
      shouldBeError: true
    });
  } catch (error) {
    console.error('❌ Error in parameter validation test:', error.message);
  }

  console.log('\n2. TESTING GetBandwidthUsageHandler');
  console.log('-'.repeat(40));

  // Test valid parameters
  try {
    console.log('\n✓ Testing with valid parameters...');
    const bandwidthResult = await bandwidthHandler.execute({
      period: '24h',
      limit: 10
    }, mockFirewalla);

    console.log('Response:', {
      isError: bandwidthResult.isError,
      contentLength: bandwidthResult.content?.[0]?.text?.length,
      hasContent: !!bandwidthResult.content?.[0]?.text
    });

    if (bandwidthResult.content?.[0]?.text) {
      const parsed = JSON.parse(bandwidthResult.content[0].text);
      console.log('Parsed response keys:', Object.keys(parsed));
      
      // Check if it's a unified response format
      if (parsed.success && parsed.data) {
        console.log('Unified response detected');
        console.log('Bandwidth usage devices:', parsed.data.bandwidth_usage?.length || 0);
        
        // Test bandwidth calculations
        if (parsed.data.bandwidth_usage && parsed.data.bandwidth_usage.length > 0) {
          const firstDevice = parsed.data.bandwidth_usage[0];
          console.log('First device bandwidth:', {
            name: firstDevice.device_name,
            total_bytes: firstDevice.total_bytes,
            total_mb: firstDevice.total_mb,
            total_gb: firstDevice.total_gb
          });
          
          // Verify calculations
          const expectedMB = Math.round((firstDevice.total_bytes / (1024 * 1024)) * 100) / 100;
          const expectedGB = Math.round((firstDevice.total_bytes / (1024 * 1024 * 1024)) * 100) / 100;
          console.log('Calculation verification:', {
            mb_correct: firstDevice.total_mb === expectedMB,
            gb_correct: firstDevice.total_gb === expectedGB
          });
        }
      } else {
        // Legacy format
        console.log('Bandwidth usage devices:', parsed.bandwidth_usage?.length || 0);
        
        // Test bandwidth calculations
        if (parsed.bandwidth_usage && parsed.bandwidth_usage.length > 0) {
          const firstDevice = parsed.bandwidth_usage[0];
          console.log('First device bandwidth:', {
            name: firstDevice.device_name,
            total_bytes: firstDevice.total_bytes,
            total_mb: firstDevice.total_mb,
            total_gb: firstDevice.total_gb
          });
          
          // Verify calculations
          const expectedMB = Math.round((firstDevice.total_bytes / (1024 * 1024)) * 100) / 100;
          const expectedGB = Math.round((firstDevice.total_bytes / (1024 * 1024 * 1024)) * 100) / 100;
          console.log('Calculation verification:', {
            mb_correct: firstDevice.total_mb === expectedMB,
            gb_correct: firstDevice.total_gb === expectedGB
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in bandwidth usage test:', error.message);
  }

  // Test invalid period
  try {
    console.log('\n✓ Testing invalid period parameter...');
    const bandwidthErrorResult = await bandwidthHandler.execute({
      period: 'invalid_period',
      limit: 10
    }, mockFirewalla);

    console.log('Error response for invalid period:', {
      isError: bandwidthErrorResult.isError,
      shouldBeError: true
    });
  } catch (error) {
    console.error('❌ Error in period validation test:', error.message);
  }

  console.log('\n3. TESTING GetOfflineDevicesHandler');
  console.log('-'.repeat(40));

  // Test valid parameters
  try {
    console.log('\n✓ Testing with valid parameters...');
    const offlineResult = await offlineDevicesHandler.execute({
      limit: 50,
      sort_by_last_seen: true
    }, mockFirewalla);

    console.log('Response:', {
      isError: offlineResult.isError,
      contentLength: offlineResult.content?.[0]?.text?.length,
      hasContent: !!offlineResult.content?.[0]?.text
    });

    if (offlineResult.content?.[0]?.text) {
      const parsed = JSON.parse(offlineResult.content[0].text);
      console.log('Parsed response keys:', Object.keys(parsed));
      
      // Check if it's a unified response format
      if (parsed.success && parsed.data) {
        console.log('Unified response detected');
        console.log('Offline devices found:', parsed.data.devices?.length || 0);
        console.log('Total offline count:', parsed.data.total_offline_devices);
        
        // Test filtering logic
        if (parsed.data.devices && parsed.data.devices.length > 0) {
          console.log('Device details:');
          parsed.data.devices.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.name} (${device.ip}) - online: ${device.online}`);
          });
          
          // Verify all returned devices are offline
          const allOffline = parsed.data.devices.every(device => device.online === false);
          console.log('All devices are offline:', allOffline);
        }
      } else {
        // Legacy format
        console.log('Offline devices found:', parsed.devices?.length || 0);
        console.log('Total offline count:', parsed.total_offline_devices);
        
        // Test filtering logic
        if (parsed.devices && parsed.devices.length > 0) {
          console.log('Device details:');
          parsed.devices.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.name} (${device.ip}) - online: ${device.online}`);
          });
          
          // Verify all returned devices are offline
          const allOffline = parsed.devices.every(device => device.online === false);
          console.log('All devices are offline:', allOffline);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in offline devices test:', error.message);
  }

  // Test missing required parameter
  try {
    console.log('\n✓ Testing missing limit parameter...');
    const offlineErrorResult = await offlineDevicesHandler.execute({
      sort_by_last_seen: true
      // Missing limit parameter
    }, mockFirewalla);

    console.log('Error response for missing limit:', {
      isError: offlineErrorResult.isError,
      shouldBeError: true
    });
  } catch (error) {
    console.error('❌ Error in limit validation test:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('NETWORK TOOLS TESTING COMPLETED');
  console.log('='.repeat(60));
}

// Handle ES module execution
if (import.meta.url === `file://${process.argv[1]}`) {
  testNetworkTools().catch(console.error);
}

export { testNetworkTools };