#!/usr/bin/env node

/**
 * Direct analysis of William's MacBook Air (192.168.210.116) network activity
 * Using the Firewalla client to gather comprehensive flow data and device information
 */

import { FirewallaClient } from './dist/firewalla/client.js';
import { getConfig } from './dist/config/config.js';

async function analyzeWilliamDevice() {
  try {
    console.log('🔍 Analyzing William\'s MacBook Air (192.168.210.116) activity...\n');
    
    // Initialize Firewalla client
    const config = getConfig();
    const client = new FirewallaClient(config);
    
    // 1. Get recent flows for William's device
    console.log('📊 Fetching recent network flows...');
    const flowData = await client.getFlowData(
      'source_ip:192.168.210.116 OR destination_ip:192.168.210.116',
      undefined, // no groupBy
      'ts:desc', // sort by timestamp descending
      100 // limit
    );
    
    console.log(`Found ${flowData.results.length} recent flows\n`);
    
    // 2. Search for specific flows with more details
    console.log('🔎 Searching for flows with enhanced details...');
    const searchResults = await client.searchFlows({
      query: 'source_ip:192.168.210.116 OR destination_ip:192.168.210.116',
      limit: 50,
      sort_by: 'ts:desc'
    });
    
    console.log(`Search found ${searchResults.results.length} flows\n`);
    
    // 3. Get device status
    console.log('📱 Fetching device status...');
    const deviceStatus = await client.getDeviceStatus(100);
    
    // Find William's device
    const williamDevice = deviceStatus.results.find(device => 
      device.ip === '192.168.210.116' || 
      device.name?.toLowerCase().includes('william') ||
      device.name?.toLowerCase().includes('macbook')
    );
    
    // 4. Check for any security alarms
    console.log('🚨 Checking for security alarms...');
    const alarms = await client.searchAlarms({
      query: '192.168.210.116',
      limit: 20
    });
    
    console.log(`Found ${alarms.results.length} security alarms\n`);
    
    // 5. Analyze the data
    console.log('=' * 80);
    console.log('📋 WILLIAM\'S MACBOOK AIR ACTIVITY ANALYSIS');
    console.log('=' * 80);
    
    // Device Information
    if (williamDevice) {
      console.log('\n🖥️  DEVICE INFORMATION:');
      console.log(`Name: ${williamDevice.name || 'Unknown'}`);
      console.log(`IP: ${williamDevice.ip}`);
      console.log(`MAC: ${williamDevice.mac || 'Unknown'}`);
      console.log(`Vendor: ${williamDevice.mac_vendor || 'Unknown'}`);
      console.log(`Online: ${williamDevice.online ? 'Yes' : 'No'}`);
      console.log(`Last Seen: ${williamDevice.last_seen || 'Unknown'}`);
    }
    
    // Network Activity Analysis
    console.log('\n📊 NETWORK ACTIVITY ANALYSIS:');
    
    // Analyze domains/websites visited
    const domains = new Map();
    const applications = new Map();
    const protocols = new Map();
    let totalDownload = 0;
    let totalUpload = 0;
    
    flowData.results.forEach(flow => {
      // Extract domain/destination
      if (flow.destination_domain) {
        domains.set(flow.destination_domain, (domains.get(flow.destination_domain) || 0) + 1);
      }
      
      // Extract application
      if (flow.application) {
        applications.set(flow.application, (applications.get(flow.application) || 0) + 1);
      }
      
      // Extract protocol
      if (flow.protocol) {
        protocols.set(flow.protocol, (protocols.get(flow.protocol) || 0) + 1);
      }
      
      // Sum data usage
      if (flow.download_bytes) totalDownload += flow.download_bytes;
      if (flow.upload_bytes) totalUpload += flow.upload_bytes;
    });
    
    // Top domains visited
    if (domains.size > 0) {
      console.log('\n🌐 TOP WEBSITES/DOMAINS VISITED:');
      Array.from(domains.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([domain, count]) => {
          console.log(`  ${domain}: ${count} connections`);
        });
    }
    
    // Top applications
    if (applications.size > 0) {
      console.log('\n📱 TOP APPLICATIONS:');
      Array.from(applications.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([app, count]) => {
          console.log(`  ${app}: ${count} connections`);
        });
    }
    
    // Protocol distribution
    if (protocols.size > 0) {
      console.log('\n🔗 PROTOCOL DISTRIBUTION:');
      Array.from(protocols.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([protocol, count]) => {
          console.log(`  ${protocol}: ${count} connections`);
        });
    }
    
    // Data usage
    console.log('\n📈 DATA USAGE:');
    console.log(`  Total Download: ${(totalDownload / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total Upload: ${(totalUpload / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total: ${((totalDownload + totalUpload) / 1024 / 1024).toFixed(2)} MB`);
    
    // Time patterns
    console.log('\n⏰ ACTIVITY TIME PATTERNS:');
    const timePatterns = new Map();
    flowData.results.forEach(flow => {
      if (flow.ts) {
        const hour = new Date(flow.ts * 1000).getHours();
        timePatterns.set(hour, (timePatterns.get(hour) || 0) + 1);
      }
    });
    
    Array.from(timePatterns.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([hour, count]) => {
        const timeStr = `${hour.toString().padStart(2, '0')}:00`;
        const bar = '█'.repeat(Math.min(count / 2, 20));
        console.log(`  ${timeStr}: ${bar} (${count} flows)`);
      });
    
    // Security Analysis
    if (alarms.results.length > 0) {
      console.log('\n🚨 SECURITY ALERTS:');
      alarms.results.forEach(alarm => {
        console.log(`  [${alarm.severity}] ${alarm.type}: ${alarm.message}`);
        console.log(`    Time: ${new Date(alarm.ts * 1000).toLocaleString()}`);
      });
    } else {
      console.log('\n✅ SECURITY STATUS: No security alerts found');
    }
    
    // Blocked traffic analysis
    const blockedFlows = flowData.results.filter(flow => flow.blocked);
    if (blockedFlows.length > 0) {
      console.log('\n🚫 BLOCKED TRAFFIC:');
      console.log(`  Total blocked connections: ${blockedFlows.length}`);
      
      const blockedDomains = new Map();
      blockedFlows.forEach(flow => {
        if (flow.destination_domain) {
          blockedDomains.set(flow.destination_domain, (blockedDomains.get(flow.destination_domain) || 0) + 1);
        }
      });
      
      if (blockedDomains.size > 0) {
        console.log('  Top blocked domains:');
        Array.from(blockedDomains.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([domain, count]) => {
            console.log(`    ${domain}: ${count} blocks`);
          });
      }
    }
    
    // Recent activity (last 10 flows)
    console.log('\n📝 RECENT ACTIVITY (Last 10 flows):');
    flowData.results.slice(0, 10).forEach((flow, index) => {
      const time = new Date(flow.ts * 1000).toLocaleString();
      const direction = flow.source_ip === '192.168.210.116' ? 'OUT' : 'IN';
      const destination = flow.destination_domain || flow.destination_ip || 'Unknown';
      const app = flow.application || 'Unknown';
      const bytes = ((flow.download_bytes || 0) + (flow.upload_bytes || 0)) / 1024;
      
      console.log(`  ${index + 1}. ${time} [${direction}] ${app} → ${destination} (${bytes.toFixed(1)} KB)`);
    });
    
    console.log('\n' + '=' * 80);
    console.log('✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error analyzing William\'s device:', error);
    process.exit(1);
  }
}

// Run the analysis
analyzeWilliamDevice();