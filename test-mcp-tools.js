#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config();

import { getConfig } from './dist/config/config.js';
import { FirewallaClient } from './dist/firewalla/client.js';
import { createSearchTools } from './dist/tools/search.js';

async function testSearchTools() {
  console.log('=== Testing MCP Search Tools ===\n');
  
  try {
    const config = getConfig();
    const client = new FirewallaClient(config);
    const searchTools = createSearchTools(client);
    
    // Test 1: search_flows
    console.log('1. Testing search_flows...');
    try {
      const flowResult = await searchTools.search_flows({
        query: 'protocol:tcp',
        limit: 2
      });
      console.log('✅ search_flows succeeded!');
      console.log('   Results:', flowResult.results.length);
      if (flowResult.results.length > 0) {
        const first = flowResult.results[0];
        console.log('   First flow structure:', Object.keys(first));
        console.log('   Source IP:', first.source_ip);
        console.log('   Country:', first.country || 'NOT PRESENT IN RESPONSE');
        console.log('   Source geo:', first.source_geo || 'NOT PRESENT');
      }
    } catch (error) {
      console.error('❌ search_flows failed:', error.message);
    }
    
    // Test 2: search_alarms  
    console.log('\n2. Testing search_alarms...');
    try {
      const alarmResult = await searchTools.search_alarms({
        query: 'type:>=5',  // Using numeric type instead of severity
        limit: 2
      });
      console.log('✅ search_alarms succeeded!');
      console.log('   Results:', alarmResult.results.length);
    } catch (error) {
      console.error('❌ search_alarms failed:', error.message);
    }
    
    // Test 3: search_cross_reference
    console.log('\n3. Testing search_cross_reference...');
    try {
      const crossResult = await searchTools.search_cross_reference({
        primary_query: 'protocol:tcp',
        secondary_queries: ['type:>=5'],  // Using numeric type
        correlation_field: 'source_ip',
        limit: 5
      });
      console.log('✅ search_cross_reference succeeded!');
      console.log('   Primary results:', crossResult.primary.count);
      console.log('   Correlations:', crossResult.correlations.length);
      if (crossResult.correlations.length > 0) {
        console.log('   First correlation count:', crossResult.correlations[0].count);
      }
    } catch (error) {
      console.error('❌ search_cross_reference failed:', error.message);
      console.error('   Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('Setup error:', error.message);
  }
}

// Run tests
testSearchTools().then(() => {
  console.log('\n=== Tests Complete ===');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});