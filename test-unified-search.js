#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config();

import { getConfig } from './dist/config/config.js';
import { FirewallaClient } from './dist/firewalla/client.js';
import { createSearchTools } from './dist/tools/search.js';

async function testUnifiedSearchFlows() {
  console.log('=== Testing Unified search_flows Tool ===\n');
  
  try {
    const config = getConfig();
    const client = new FirewallaClient(config);
    const searchTools = createSearchTools(client);
    
    // Test 1: Basic search_flows (should now include geographic data)
    console.log('1. Testing basic search_flows with geographic data...');
    try {
      const flowResult = await searchTools.search_flows({
        query: 'protocol:tcp',
        limit: 2
      });
      console.log('✅ Basic search_flows succeeded!');
      console.log('   Results:', flowResult.results.length);
      if (flowResult.results.length > 0) {
        const first = flowResult.results[0];
        console.log('   First flow structure:', Object.keys(first));
        console.log('   Source IP:', first.source_ip);
        console.log('   Source Country:', first.source_country || 'NOT PRESENT');
        console.log('   Source City:', first.source_city || 'NOT PRESENT');
        console.log('   Destination Country:', first.destination_country || 'NOT PRESENT');
      }
    } catch (error) {
      console.error('❌ Basic search_flows failed:', error.message);
    }
    
    // Test 2: search_flows with geographic filters
    console.log('\n2. Testing search_flows with geographic filters...');
    try {
      const geoResult = await searchTools.search_flows({
        query: 'protocol:tcp',
        geographic_filters: {
          countries: ['US', 'CN'],
          exclude_vpn: true
        },
        limit: 5
      });
      console.log('✅ Geographic filtered search succeeded!');
      console.log('   Results:', geoResult.results.length);
      console.log('   Geographic filters applied:', geoResult.geographic_filters_applied);
      console.log('   Has geographic analysis:', !!geoResult.geographic_analysis);
    } catch (error) {
      console.error('❌ Geographic filtered search failed:', error.message);
    }
    
    // Test 3: search_flows with analytics
    console.log('\n3. Testing search_flows with analytics enabled...');
    try {
      const analyticsResult = await searchTools.search_flows({
        query: 'protocol:tcp',
        include_analytics: true,
        limit: 10
      });
      console.log('✅ Analytics search succeeded!');
      console.log('   Results:', analyticsResult.results.length);
      if (analyticsResult.geographic_analysis) {
        console.log('   Geographic Analysis:');
        console.log('     Total flows:', analyticsResult.geographic_analysis.total_flows);
        console.log('     Unique countries:', analyticsResult.geographic_analysis.unique_countries);
        console.log('     Cloud provider flows:', analyticsResult.geographic_analysis.cloud_provider_flows);
        console.log('     VPN flows:', analyticsResult.geographic_analysis.vpn_flows);
        console.log('     High risk flows:', analyticsResult.geographic_analysis.high_risk_flows);
      } else {
        console.log('   ⚠️  No geographic analysis in response');
      }
    } catch (error) {
      console.error('❌ Analytics search failed:', error.message);
    }
    
    // Test 4: Verify search_flows_by_geography no longer exists
    console.log('\n4. Verifying search_flows_by_geography is removed...');
    if (typeof searchTools.search_flows_by_geography === 'undefined') {
      console.log('✅ search_flows_by_geography correctly removed');
    } else {
      console.error('❌ search_flows_by_geography still exists!');
    }
    
  } catch (error) {
    console.error('Setup error:', error.message);
  }
}

// Run tests
testUnifiedSearchFlows().then(() => {
  console.log('\n=== Unified Search Tests Complete ===');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});