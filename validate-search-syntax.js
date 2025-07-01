#!/usr/bin/env node

/**
 * Search Syntax Validation Script
 * Tests documented field syntax examples to ensure they work correctly
 */

import { createSearchTools } from './dist/tools/search.js';
import { FirewallaClient } from './dist/firewalla/client.js';
import { config } from './dist/config/config.js';

// Test cases from documentation
const testCases = [
  // search_flows tests
  {
    tool: 'search_flows',
    name: 'device_ip wildcard (CORRECTED)',
    params: {
      query: 'device_ip:192.168.*',
      limit: 5
    }
  },
  {
    tool: 'search_flows', 
    name: 'protocol filtering',
    params: {
      query: 'protocol:tcp',
      limit: 5
    }
  },
  {
    tool: 'search_flows',
    name: 'complex AND query',
    params: {
      query: 'protocol:tcp AND bytes:>1000000',
      limit: 5
    }
  },
  
  // search_alarms tests
  {
    tool: 'search_alarms',
    name: 'type filtering',
    params: {
      query: 'type:1',
      limit: 5
    }
  },
  {
    tool: 'search_alarms',
    name: 'severity filtering', 
    params: {
      query: 'severity:high',
      limit: 5
    }
  },
  {
    tool: 'search_alarms',
    name: 'status and type combination',
    params: {
      query: 'status:1 AND type:1',
      limit: 5
    }
  },
  
  // search_devices tests
  {
    tool: 'search_devices',
    name: 'online status',
    params: {
      query: 'online:true',
      limit: 5
    }
  },
  {
    tool: 'search_devices',
    name: 'mac_vendor filtering (CORRECTED)',
    params: {
      query: 'mac_vendor:Apple',
      limit: 5
    }
  },
  {
    tool: 'search_devices',
    name: 'name wildcard',
    params: {
      query: 'name:*iPhone*',
      limit: 5
    }
  },
  
  // search_rules tests
  {
    tool: 'search_rules',
    name: 'action filtering',
    params: {
      query: 'action:block',
      limit: 5
    }
  },
  {
    tool: 'search_rules',
    name: 'target_value wildcard (CORRECTED)',
    params: {
      query: 'target_value:*facebook*',
      limit: 5
    }
  },
  {
    tool: 'search_rules',
    name: 'hit_count comparison (CORRECTED)',
    params: {
      query: 'hit_count:>0',
      limit: 5
    }
  },
  
  // Error cases (should fail)
  {
    tool: 'search_flows',
    name: 'INVALID: device.ip field (dot notation)',
    params: {
      query: 'device.ip:192.168.1.100',
      limit: 5
    },
    shouldFail: true
  },
  {
    tool: 'search_devices',
    name: 'INVALID: macVendor field (camelCase)',
    params: {
      query: 'macVendor:Apple',
      limit: 5
    },
    shouldFail: true
  },
  {
    tool: 'search_rules',
    name: 'INVALID: rule_action field',
    params: {
      query: 'rule_action:block',
      limit: 5
    },
    shouldFail: true
  }
];

async function validateSearchSyntax() {
  console.log('🔍 Starting Search Syntax Validation\n');
  
  try {
    // Use configuration
    console.log('✅ Configuration loaded successfully');
    
    // Create client and tools
    const client = new FirewallaClient(config);
    const searchTools = createSearchTools(client);
    console.log('✅ Search tools initialized\n');
    
    let passCount = 0;
    let failCount = 0;
    let unexpectedFailures = [];
    
    // Run test cases
    for (const testCase of testCases) {
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`   Tool: ${testCase.tool}`);
      console.log(`   Query: ${testCase.params.query}`);
      
      try {
        const result = await searchTools[testCase.tool](testCase.params);
        
        if (testCase.shouldFail) {
          console.log('❌ UNEXPECTED SUCCESS - This should have failed');
          failCount++;
          unexpectedFailures.push({
            test: testCase.name,
            reason: 'Expected failure but got success'
          });
        } else {
          console.log(`✅ SUCCESS - Returned ${result.count || result.results?.length || 0} results`);
          passCount++;
        }
        
      } catch (error) {
        if (testCase.shouldFail) {
          console.log(`✅ EXPECTED FAILURE - ${error.message}`);
          passCount++;
        } else {
          console.log(`❌ UNEXPECTED FAILURE - ${error.message}`);
          failCount++;
          unexpectedFailures.push({
            test: testCase.name,
            reason: error.message
          });
        }
      }
      
      console.log(''); // Empty line for readability
    }
    
    // Summary
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📝 Total Tests: ${testCases.length}`);
    console.log(`📈 Success Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
    
    if (unexpectedFailures.length > 0) {
      console.log('\n❌ UNEXPECTED FAILURES:');
      unexpectedFailures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.test}`);
        console.log(`   Reason: ${failure.reason}`);
      });
    }
    
    if (failCount === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Documentation syntax is validated.');
    } else {
      console.log('\n⚠️  Some tests failed. Documentation may need updates.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    process.exit(1);
  }
}

// Run validation
validateSearchSyntax().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});