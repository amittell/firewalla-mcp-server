#!/usr/bin/env node

/**
 * Comprehensive Firewalla MCP Tools Testing Script
 * 
 * Tests all tools defined in the server schema to verify they work correctly
 * and identify any discrepancies between schema and implementation.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';

// Tools from the registry (34 tools that should work)
const registryTools = [
  // Security (3)
  'get_active_alarms',
  'get_specific_alarm', 
  'delete_alarm',
  
  // Network (3)
  'get_flow_data',
  'get_bandwidth_usage',
  'get_offline_devices',
  
  // Device (1)
  'get_device_status',
  
  // Rule (7)
  'get_network_rules',
  'pause_rule',
  'resume_rule', 
  'get_target_lists',
  'get_network_rules_summary',
  'get_most_active_rules',
  'get_recent_rules',
  
  // Analytics (7)
  'get_boxes',
  'get_simple_statistics',
  'get_statistics_by_region',
  'get_statistics_by_box',
  'get_flow_trends',
  'get_alarm_trends',
  'get_rule_trends',
  
  // Search (10)
  'search_flows',
  'search_alarms',
  'search_rules',
  'search_devices',
  'search_target_lists',
  'search_cross_reference',
  'search_enhanced_cross_reference',
  'get_correlation_suggestions',
  'search_alarms_by_geography',
  'get_geographic_statistics',
  
  // Bulk (3)
  'bulk_delete_alarms',
  'bulk_pause_rules',
  'bulk_resume_rules'
];

// Tools from server.ts schema (additional tools that might not be implemented)
const schemaOnlyTools = [
  'search_flows_by_geography', // Not in registry but in schema
  // Add other schema-only tools here as we discover them
];

const allTools = [...registryTools, ...schemaOnlyTools];

// Test parameters for different tool types
const testParams = {
  // Tools requiring limit parameter
  get_active_alarms: { limit: 5 },
  get_flow_data: { limit: 5 },
  get_device_status: { limit: 5 },
  get_offline_devices: { limit: 5 },
  get_bandwidth_usage: { period: '1h', limit: 5 },
  get_network_rules: { limit: 5 },
  get_target_lists: { limit: 5 },
  get_network_rules_summary: { limit: 5 },
  get_most_active_rules: { limit: 5 },
  get_recent_rules: { limit: 5 },
  
  // Search tools
  search_flows: { query: 'protocol:tcp', limit: 5 },
  search_alarms: { query: 'severity:high', limit: 5 },
  search_rules: { query: 'action:block', limit: 5 },
  search_devices: { query: 'online:true', limit: 5 },
  search_target_lists: { query: 'category:ad', limit: 5 },
  search_cross_reference: { 
    primary_query: 'protocol:tcp', 
    secondary_queries: ['severity:high'], 
    correlation_field: 'source_ip',
    limit: 5 
  },
  search_enhanced_cross_reference: {
    primary_query: 'protocol:tcp',
    secondary_queries: ['severity:high'],
    correlation_params: {
      correlationFields: ['source_ip'],
      correlationType: 'AND'
    },
    limit: 5
  },
  get_correlation_suggestions: {
    primary_query: 'blocked:true',
    secondary_queries: ['severity:high']
  },
  search_alarms_by_geography: { limit: 5 },
  get_geographic_statistics: { entity_type: 'flows' },
  search_flows_by_geography: { 
    query: 'protocol:tcp', 
    geographic_filters: { countries: ['China'] },
    limit: 5 
  },
  
  // Bulk operations - test with dry run or minimal data
  bulk_delete_alarms: { 
    query: 'resolved:true AND created:<2020-01-01', 
    limit: 1
  },
  bulk_pause_rules: { 
    query: 'hit_count:0 AND created:<2020-01-01', 
    duration: 1,
    limit: 1 
  },
  bulk_resume_rules: { 
    query: 'status:paused AND created:<2020-01-01',
    limit: 1 
  },
  
  // Tools requiring specific IDs (will test with dummy data)
  get_specific_alarm: { alarm_id: 'test-alarm-id' },
  delete_alarm: { alarm_id: 'test-alarm-id' },
  pause_rule: { rule_id: 'test-rule-id' },
  resume_rule: { rule_id: 'test-rule-id' },
  
  // Tools with no parameters
  get_boxes: {},
  get_simple_statistics: {},
  get_statistics_by_region: {},
  get_statistics_by_box: {},
  get_flow_trends: {},
  get_alarm_trends: {},
  get_rule_trends: {}
};

class ToolTester {
  constructor() {
    this.results = {
      successful: [],
      failed: [],
      notImplemented: [],
      total: 0
    };
  }

  async testTool(toolName) {
    console.log(`Testing tool: ${toolName}`);
    
    const params = testParams[toolName] || {};
    const testPayload = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params
        }
      })
    };

    try {
      // Start MCP server
      const server = spawn('node', ['dist/server.js'], {
        env: {
          ...process.env,
          FIREWALLA_MSP_TOKEN: 'e47fe7dc6fc9c23da036790c82d9718c',
          FIREWALLA_MSP_ID: 'dn-k7evgj.firewalla.net',
          FIREWALLA_BOX_ID: '1eb71e38-3a95-4371-8903-ace24c83ab49'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send test request
      server.stdin.write(JSON.stringify(testPayload) + '\n');
      
      let responseData = '';
      const timeout = setTimeout(() => {
        server.kill();
      }, 10000);

      return new Promise((resolve) => {
        server.stdout.on('data', (data) => {
          responseData += data.toString();
        });

        server.on('close', (code) => {
          clearTimeout(timeout);
          try {
            if (responseData.includes('error')) {
              if (responseData.includes('Unknown tool')) {
                resolve({ status: 'not_implemented', error: 'Tool not found in registry' });
              } else {
                resolve({ status: 'failed', error: responseData });
              }
            } else if (responseData.includes('content') || responseData.includes('result')) {
              resolve({ status: 'success', response: responseData });
            } else {
              resolve({ status: 'failed', error: 'No valid response received' });
            }
          } catch (error) {
            resolve({ status: 'failed', error: error.message });
          }
        });

        server.on('error', (error) => {
          clearTimeout(timeout);
          resolve({ status: 'failed', error: error.message });
        });
      });

    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async runTests() {
    console.log(`Starting comprehensive test of ${allTools.length} MCP tools...\n`);
    
    for (const tool of allTools) {
      this.results.total++;
      const result = await this.testTool(tool);
      
      switch (result.status) {
        case 'success':
          this.results.successful.push(tool);
          console.log(`✅ ${tool}: SUCCESS`);
          break;
        case 'failed':
          this.results.failed.push({ tool, error: result.error });
          console.log(`❌ ${tool}: FAILED - ${result.error?.substring(0, 100)}...`);
          break;
        case 'not_implemented':
          this.results.notImplemented.push(tool);
          console.log(`⚠️  ${tool}: NOT IMPLEMENTED`);
          break;
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('COMPREHENSIVE MCP TOOLS TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\nTotal tools tested: ${this.results.total}`);
    console.log(`✅ Successful: ${this.results.successful.length}`);
    console.log(`❌ Failed: ${this.results.failed.length}`);
    console.log(`⚠️  Not implemented: ${this.results.notImplemented.length}`);
    
    if (this.results.successful.length > 0) {
      console.log('\n✅ WORKING TOOLS:');
      this.results.successful.forEach(tool => console.log(`  - ${tool}`));
    }
    
    if (this.results.notImplemented.length > 0) {
      console.log('\n⚠️  NOT IMPLEMENTED (Schema vs Registry discrepancy):');
      this.results.notImplemented.forEach(tool => console.log(`  - ${tool}`));
    }
    
    if (this.results.failed.length > 0) {
      console.log('\n❌ FAILED TOOLS:');
      this.results.failed.forEach(({ tool, error }) => {
        console.log(`  - ${tool}: ${error?.substring(0, 100)}...`);
      });
    }
    
    const successRate = ((this.results.successful.length / this.results.total) * 100).toFixed(1);
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.notImplemented.length > 0) {
      console.log('\n🔧 RECOMMENDATIONS:');
      console.log('1. Remove unimplemented tools from server.ts schema OR implement missing handlers');
      console.log('2. Verify tool registration in ToolRegistry');
      console.log('3. Check for naming discrepancies between schema and handlers');
    }
  }
}

// Run the comprehensive test
const tester = new ToolTester();
tester.runTests().catch(console.error);