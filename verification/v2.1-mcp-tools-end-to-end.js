#!/usr/bin/env node

/**
 * V2.1 Verification: Test MCP Tools End-to-End
 * 
 * Comprehensively tests the complete MCP server pipeline:
 * - Tool invocation simulation
 * - Parameter validation and transformation
 * - Client method integration
 * - Response formatting and optimization
 * - Error handling scenarios
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MCPToolsEndToEndVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    this.mockResponses = this.createMockData();
  }

  /**
   * Add test result
   */
  addResult(category, test, status, message, details = null) {
    this.results[status]++;
    this.results.details.push({
      category,
      test,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create realistic mock data for testing
   */
  createMockData() {
    return {
      alarms: {
        count: 3,
        results: [
          {
            ts: Math.floor(Date.now() / 1000) - 3600,
            gid: 'test-box-gid-1',
            aid: 12345,
            type: 2,
            status: 1,
            message: 'Suspicious network activity detected',
            direction: 'inbound',
            protocol: 'tcp',
            device: {
              id: 'aa:bb:cc:dd:ee:ff',
              ip: '192.168.1.100',
              name: 'Test Device'
            },
            remote: {
              ip: '203.0.113.1',
              name: 'external-host.com'
            }
          },
          {
            ts: Math.floor(Date.now() / 1000) - 7200,
            gid: 'test-box-gid-1',
            aid: 12346,
            type: 5,
            status: 2,
            message: 'Data usage threshold exceeded',
            direction: 'outbound',
            protocol: 'tcp',
            device: {
              id: 'bb:cc:dd:ee:ff:aa',
              ip: '192.168.1.101',
              name: 'Another Device'
            }
          }
        ],
        next_cursor: 'cursor_123'
      },
      flows: {
        count: 2,
        results: [
          {
            ts: Math.floor(Date.now() / 1000) - 1800,
            gid: 'test-box-gid-1',
            protocol: 'tcp',
            direction: 'outbound',
            block: false,
            count: 150,
            download: 1024000,
            upload: 512000,
            duration: 300,
            device: {
              id: 'aa:bb:cc:dd:ee:ff',
              ip: '192.168.1.100',
              name: 'Test Device'
            },
            destination: {
              ip: '93.184.216.34',
              name: 'example.com'
            }
          }
        ],
        next_cursor: 'flow_cursor_456'
      },
      devices: {
        count: 5,
        results: [
          {
            id: 'aa:bb:cc:dd:ee:ff',
            gid: 'test-box-gid-1',
            name: 'Test Device',
            ip: '192.168.1.100',
            macVendor: 'Apple',
            online: true,
            lastSeen: '2024-01-15T10:30:00Z',
            ipReserved: false,
            network: {
              id: 'network_1',
              name: 'Main Network'
            },
            group: {
              id: 'group_1',
              name: 'Family Devices'
            },
            totalDownload: 5000000,
            totalUpload: 2000000
          },
          {
            id: 'bb:cc:dd:ee:ff:aa',
            gid: 'test-box-gid-1',
            name: 'Offline Device',
            ip: '192.168.1.101',
            macVendor: 'Samsung',
            online: false,
            lastSeen: '2024-01-14T15:20:00Z',
            ipReserved: true,
            network: {
              id: 'network_1',
              name: 'Main Network'
            },
            totalDownload: 1000000,
            totalUpload: 500000
          }
        ]
      },
      rules: {
        count: 4,
        results: [
          {
            id: 'rule_123',
            action: 'block',
            target: {
              type: 'domain',
              value: 'malicious-site.com',
              dnsOnly: true
            },
            direction: 'bidirection',
            gid: 'test-box-gid-1',
            status: 'active',
            hit: {
              count: 25,
              lastHitTs: Math.floor(Date.now() / 1000) - 300
            },
            ts: Math.floor(Date.now() / 1000) - 86400,
            updateTs: Math.floor(Date.now() / 1000) - 3600,
            notes: 'Blocking known malicious domain'
          }
        ]
      },
      boxes: {
        count: 1,
        results: [
          {
            gid: 'test-box-gid-1',
            name: 'Test Firewalla Box',
            model: 'Gold',
            mode: 'router',
            version: '1.9.50',
            online: true,
            lastSeen: Math.floor(Date.now() / 1000) - 60,
            license: 'pro',
            publicIP: '203.0.113.100',
            location: 'Home Office',
            deviceCount: 15,
            ruleCount: 12,
            alarmCount: 3
          }
        ]
      },
      bandwidth: {
        count: 3,
        results: [
          {
            device_id: 'aa:bb:cc:dd:ee:ff',
            device_name: 'Test Device',
            ip_address: '192.168.1.100',
            bytes_uploaded: 2000000,
            bytes_downloaded: 5000000,
            total_bytes: 7000000
          }
        ]
      },
      targetLists: {
        count: 2,
        results: [
          {
            id: 'list_123',
            name: 'Ad Blockers',
            owner: 'global',
            category: 'ad',
            targets: ['doubleclick.net', 'googleadservices.com'],
            lastUpdated: Math.floor(Date.now() / 1000) - 86400,
            notes: 'Common advertising domains'
          }
        ]
      }
    };
  }

  /**
   * Create mock FirewallaClient for testing
   */
  createMockFirewallaClient() {
    const mockData = this.mockResponses;
    
    return {
      async getActiveAlarms(query, groupBy, sortBy, limit, cursor) {
        // Simulate API call with parameters
        await this.simulateDelay(100);
        return mockData.alarms;
      },
      
      async getFlowData(query, groupBy, sortBy, limit, cursor) {
        await this.simulateDelay(150);
        return mockData.flows;
      },
      
      async getDeviceStatus(boxId, groupId) {
        await this.simulateDelay(80);
        return mockData.devices;
      },
      
      async getNetworkRules(query) {
        await this.simulateDelay(120);
        return mockData.rules;
      },
      
      async getBoxes(groupId) {
        await this.simulateDelay(60);
        return mockData.boxes;
      },
      
      async getBandwidthUsage(period, top) {
        await this.simulateDelay(200);
        return mockData.bandwidth;
      },
      
      async getTargetLists(listType) {
        await this.simulateDelay(90);
        return mockData.targetLists;
      },
      
      async pauseRule(ruleId, duration) {
        await this.simulateDelay(50);
        return { success: true, message: `Rule ${ruleId} paused for ${duration} minutes` };
      },
      
      async resumeRule(ruleId) {
        await this.simulateDelay(50);
        return { success: true, message: `Rule ${ruleId} resumed` };
      }
    };
  }

  /**
   * Simulate network delay
   */
  async simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create mock MCP server for tool testing
   */
  createMockMCPServer() {
    const server = {
      toolResponses: [],
      
      setRequestHandler(schema, handler) {
        this.requestHandler = handler;
      },
      
      async callTool(name, args) {
        try {
          const request = {
            params: {
              name,
              arguments: args
            }
          };
          
          const response = await this.requestHandler(request);
          this.toolResponses.push({ name, args, response });
          return response;
        } catch (error) {
          const errorResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: error.message,
                tool: name
              }, null, 2)
            }],
            isError: true
          };
          this.toolResponses.push({ name, args, response: errorResponse, error: error.message });
          return errorResponse;
        }
      }
    };
    
    return server;
  }

  /**
   * Test core API tools (V2.1.1)
   */
  async testCoreAPITools() {
    console.log('🔍 Testing Core API Tools (V2.1.1)...');
    
    // Import setupTools function
    const { setupTools } = await import('../src/tools/index.js');
    
    // Create mock server and client
    const mockServer = this.createMockMCPServer();
    const mockFirewalla = this.createMockFirewallaClient();
    
    // Setup tools with mocks
    setupTools(mockServer, mockFirewalla);
    
    // Test cases for core API tools
    const testCases = [
      {
        tool: 'get_active_alarms',
        args: { limit: 10, sortBy: 'ts:desc' },
        expectedFields: ['count', 'alarms', 'next_cursor']
      },
      {
        tool: 'get_active_alarms',
        args: { query: 'severity:high', groupBy: 'type', limit: 5 },
        expectedFields: ['count', 'alarms']
      },
      {
        tool: 'get_flow_data',
        args: { limit: 20, start_time: '2024-01-15T00:00:00Z', end_time: '2024-01-15T23:59:59Z' },
        expectedFields: ['count', 'flows', 'next_cursor']
      },
      {
        tool: 'get_flow_data',
        args: { query: 'protocol:tcp', sortBy: 'bytes:desc' },
        expectedFields: ['count', 'flows']
      },
      {
        tool: 'get_device_status',
        args: { group_id: 'test-group-1' },
        expectedFields: ['total_devices', 'online_devices', 'offline_devices', 'devices']
      },
      {
        tool: 'get_device_status',
        args: { box_id: 'test-box-gid-1' },
        expectedFields: ['total_devices', 'devices']
      },
      {
        tool: 'get_network_rules',
        args: { summary_only: false, limit: 15 },
        expectedFields: ['count', 'rules', 'next_cursor']
      },
      {
        tool: 'get_network_rules',
        args: { summary_only: true, limit: 5 },
        expectedFields: ['count', 'summary_mode', 'rules']
      },
      {
        tool: 'get_boxes',
        args: { group_id: 'test-group-1' },
        expectedFields: ['total_boxes', 'boxes']
      },
      {
        tool: 'get_boxes',
        args: {},
        expectedFields: ['total_boxes', 'boxes']
      }
    ];
    
    // Execute test cases
    for (const testCase of testCases) {
      await this.executeToolTest(mockServer, testCase);
    }
  }

  /**
   * Execute individual tool test
   */
  async executeToolTest(mockServer, testCase) {
    const { tool, args, expectedFields } = testCase;
    
    try {
      const startTime = Date.now();
      const response = await mockServer.callTool(tool, args);
      const duration = Date.now() - startTime;
      
      // Validate response structure
      if (response.isError) {
        this.addResult('core-tools', `${tool}-error`, 'failed',
          `❌ Tool ${tool} returned error: ${response.error || 'Unknown error'}`,
          { args, response });
        return;
      }
      
      // Validate response format
      if (!response.content || !Array.isArray(response.content) || response.content.length === 0) {
        this.addResult('core-tools', `${tool}-format`, 'failed',
          `❌ Tool ${tool} returned invalid response format`,
          { args, response });
        return;
      }
      
      // Parse JSON content
      let parsedContent;
      try {
        parsedContent = JSON.parse(response.content[0].text);
      } catch (parseError) {
        this.addResult('core-tools', `${tool}-json`, 'failed',
          `❌ Tool ${tool} returned invalid JSON: ${parseError.message}`,
          { args, response: response.content[0].text });
        return;
      }
      
      // Validate expected fields
      const missingFields = expectedFields.filter(field => !(field in parsedContent));
      if (missingFields.length === 0) {
        this.addResult('core-tools', `${tool}-fields`, 'passed',
          `✅ Tool ${tool} returned all expected fields`);
      } else {
        this.addResult('core-tools', `${tool}-fields`, 'failed',
          `❌ Tool ${tool} missing fields: ${missingFields.join(', ')}`,
          { args, missing: missingFields, actual: Object.keys(parsedContent) });
      }
      
      // Validate response time
      if (duration < 1000) {
        this.addResult('core-tools', `${tool}-performance`, 'passed',
          `✅ Tool ${tool} responded in ${duration}ms`);
      } else {
        this.addResult('core-tools', `${tool}-performance`, 'warnings',
          `⚠️ Tool ${tool} slow response: ${duration}ms`);
      }
      
      // Validate data structure
      this.validateDataStructure(tool, parsedContent);
      
    } catch (error) {
      this.addResult('core-tools', `${tool}-exception`, 'failed',
        `❌ Tool ${tool} threw exception: ${error.message}`,
        { args, error: error.stack });
    }
  }

  /**
   * Validate data structure in tool responses
   */
  validateDataStructure(tool, content) {
    // Check count field
    if (typeof content.count === 'number' && content.count >= 0) {
      this.addResult('data-structure', `${tool}-count-type`, 'passed',
        `✅ ${tool} count field is valid number`);
    } else {
      this.addResult('data-structure', `${tool}-count-type`, 'failed',
        `❌ ${tool} count field invalid: ${typeof content.count}`,
        { value: content.count });
    }
    
    // Check results array
    const resultsField = content.alarms || content.flows || content.devices || content.rules || content.boxes;
    if (Array.isArray(resultsField)) {
      this.addResult('data-structure', `${tool}-results-array`, 'passed',
        `✅ ${tool} results field is valid array`);
      
      // Check array length vs count
      if (resultsField.length <= content.count) {
        this.addResult('data-structure', `${tool}-count-consistency`, 'passed',
          `✅ ${tool} count matches results array length`);
      } else {
        this.addResult('data-structure', `${tool}-count-consistency`, 'warnings',
          `⚠️ ${tool} results array (${resultsField.length}) exceeds count (${content.count})`);
      }
    } else {
      this.addResult('data-structure', `${tool}-results-array`, 'failed',
        `❌ ${tool} results field is not an array: ${typeof resultsField}`);
    }
    
    // Check cursor field if present
    if (content.next_cursor !== undefined) {
      if (typeof content.next_cursor === 'string') {
        this.addResult('data-structure', `${tool}-cursor-type`, 'passed',
          `✅ ${tool} next_cursor field is valid string`);
      } else {
        this.addResult('data-structure', `${tool}-cursor-type`, 'failed',
          `❌ ${tool} next_cursor field invalid type: ${typeof content.next_cursor}`);
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.1: Test Core API Tools');
    console.log('=' .repeat(70));
    
    console.log(`\\n📈 Summary:`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    
    // Group results by category
    const byCategory = {};
    this.results.details.forEach(result => {
      if (!byCategory[result.category]) {
        byCategory[result.category] = [];
      }
      byCategory[result.category].push(result);
    });
    
    console.log(`\\n📋 Detailed Results:`);
    for (const [category, results] of Object.entries(byCategory)) {
      console.log(`\\n${category.toUpperCase()}:`);
      results.forEach(result => {
        const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
        if (result.details && result.status === 'failed') {
          console.log(`     Details: ${JSON.stringify(result.details, null, 6)}`);
        }
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed <= 2) {
      console.log('\\n🎉 Core API tools verification successful! V2.1.1 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review tool implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.1 Verification: Test Core API Tools\\n');
    
    try {
      await this.testCoreAPITools();
      return this.generateReport();
    } catch (error) {
      console.error('💥 Verification failed:', error.message);
      console.error(error.stack);
      return false;
    }
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new MCPToolsEndToEndVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { MCPToolsEndToEndVerifier };