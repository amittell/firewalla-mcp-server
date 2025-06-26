#!/usr/bin/env node

/**
 * Test script for search_flows MCP tool
 * This script communicates with the MCP server via stdio to test the search_flows functionality
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

class MCPTestClient {
  constructor() {
    this.requestId = 1;
    this.testResults = [];
  }

  async runTests() {
    console.log('=== Testing search_flows MCP Tool ===\n');

    // Start MCP server process
    const serverProcess = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    let serverReady = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill();
        reject(new Error('Test timeout after 30 seconds'));
      }, 30000);

      serverProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete JSON-RPC messages
        let lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleResponse(response);
            } catch (error) {
              console.log('Raw response:', line);
            }
          }
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server stderr:', data.toString());
      });

      serverProcess.on('close', (code) => {
        clearTimeout(timeout);
        console.log(`\nServer process exited with code ${code}`);
        this.generateReport();
        resolve();
      });

      // Wait a moment for server to initialize
      setTimeout(() => {
        this.runTestSequence(serverProcess);
      }, 1000);
    });
  }

  async runTestSequence(serverProcess) {
    console.log('Starting test sequence...\n');

    // Test 1: List available tools
    await this.testListTools(serverProcess);
    
    // Wait between tests
    await this.sleep(500);
    
    // Test 2: Test search_flows with required parameters
    await this.testSearchFlowsBasic(serverProcess);
    
    // Wait between tests
    await this.sleep(500);
    
    // Test 3: Test parameter validation - missing query
    await this.testSearchFlowsMissingQuery(serverProcess);
    
    // Wait between tests
    await this.sleep(500);
    
    // Test 4: Test parameter validation - missing limit
    await this.testSearchFlowsMissingLimit(serverProcess);
    
    // Wait between tests
    await this.sleep(500);
    
    // Test 5: Test complex query syntax
    await this.testSearchFlowsComplexQuery(serverProcess);
    
    // Wait between tests
    await this.sleep(500);
    
    // Test 6: Test with optional parameters
    await this.testSearchFlowsWithOptionalParams(serverProcess);
    
    // Wait for all responses
    setTimeout(() => {
      serverProcess.kill();
    }, 2000);
  }

  async testListTools(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/list',
      params: {}
    };
    
    console.log('Test 1: Listing available tools');
    this.sendRequest(serverProcess, request, 'LIST_TOOLS');
  }

  async testSearchFlowsBasic(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: 'search_flows',
        arguments: {
          query: 'protocol:tcp',
          limit: 10
        }
      }
    };
    
    console.log('Test 2: Basic search_flows with required parameters');
    this.sendRequest(serverProcess, request, 'BASIC_SEARCH');
  }

  async testSearchFlowsMissingQuery(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: 'search_flows',
        arguments: {
          limit: 10
        }
      }
    };
    
    console.log('Test 3: search_flows with missing query parameter');
    this.sendRequest(serverProcess, request, 'MISSING_QUERY');
  }

  async testSearchFlowsMissingLimit(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: 'search_flows',
        arguments: {
          query: 'protocol:tcp'
        }
      }
    };
    
    console.log('Test 4: search_flows with missing limit parameter');
    this.sendRequest(serverProcess, request, 'MISSING_LIMIT');
  }

  async testSearchFlowsComplexQuery(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: 'search_flows',
        arguments: {
          query: 'protocol:tcp AND bytes:>=1000 AND source_ip:192.168.*',
          limit: 5
        }
      }
    };
    
    console.log('Test 5: search_flows with complex query syntax');
    this.sendRequest(serverProcess, request, 'COMPLEX_QUERY');
  }

  async testSearchFlowsWithOptionalParams(serverProcess) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: 'search_flows',
        arguments: {
          query: 'protocol:tcp',
          limit: 5,
          aggregate: true,
          group_by: 'protocol',
          include_blocked: true,
          time_range: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-12-31T23:59:59Z'
          }
        }
      }
    };
    
    console.log('Test 6: search_flows with optional parameters');
    this.sendRequest(serverProcess, request, 'WITH_OPTIONAL_PARAMS');
  }

  sendRequest(serverProcess, request, testType) {
    const requestStr = JSON.stringify(request) + '\n';
    console.log(`Sending ${testType} request:`, JSON.stringify(request, null, 2));
    serverProcess.stdin.write(requestStr);
    
    // Store test metadata
    this.testResults.push({
      id: request.id,
      testType,
      request,
      timestamp: new Date().toISOString(),
      response: null,
      status: 'PENDING'
    });
  }

  handleResponse(response) {
    console.log('\n--- Response Received ---');
    console.log(JSON.stringify(response, null, 2));
    console.log('------------------------\n');

    // Find matching test result
    const testResult = this.testResults.find(t => t.id === response.id);
    if (testResult) {
      testResult.response = response;
      testResult.status = response.error ? 'ERROR' : 'SUCCESS';
      
      // Analyze response
      this.analyzeResponse(testResult);
    }
  }

  analyzeResponse(testResult) {
    const { testType, response } = testResult;
    
    console.log(`Analysis for ${testType}:`);
    
    if (response.error) {
      console.log(`❌ Error: ${response.error.message || response.error}`);
      testResult.analysis = `Error: ${response.error.message || response.error}`;
    } else if (response.result) {
      switch (testType) {
        case 'LIST_TOOLS':
          const tools = response.result.tools || [];
          const searchFlowsTool = tools.find(t => t.name === 'search_flows');
          if (searchFlowsTool) {
            console.log('✅ search_flows tool found in tools list');
            console.log('Tool schema:', JSON.stringify(searchFlowsTool.inputSchema, null, 2));
            testResult.analysis = 'search_flows tool is available';
          } else {
            console.log('❌ search_flows tool not found in tools list');
            testResult.analysis = 'search_flows tool not available';
          }
          break;
          
        case 'BASIC_SEARCH':
        case 'COMPLEX_QUERY':
        case 'WITH_OPTIONAL_PARAMS':
          if (response.result.content) {
            const content = response.result.content[0];
            if (content && content.text) {
              try {
                const data = JSON.parse(content.text);
                console.log('✅ Search executed successfully');
                console.log(`Result count: ${data.count || 0}`);
                console.log(`Execution time: ${data.execution_time_ms || 0}ms`);
                if (data.aggregations) {
                  console.log('✅ Aggregations included');
                }
                testResult.analysis = `Success: ${data.count || 0} results, ${data.execution_time_ms || 0}ms`;
              } catch (e) {
                console.log('❌ Invalid JSON response');
                testResult.analysis = 'Invalid JSON response';
              }
            }
          } else {
            console.log('❌ No content in response');
            testResult.analysis = 'No content in response';
          }
          break;
          
        case 'MISSING_QUERY':
        case 'MISSING_LIMIT':
          // These should return errors
          console.log('❌ Expected validation error but got success');
          testResult.analysis = 'Expected validation error but got success';
          break;
          
        default:
          console.log('✅ Response received');
          testResult.analysis = 'Response received';
      }
    }
    
    console.log('---\n');
  }

  generateReport() {
    console.log('\n=== TEST RESULTS SUMMARY ===\n');
    
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.length,
      successful: 0,
      failed: 0,
      pending: 0,
      tests: []
    };

    this.testResults.forEach(test => {
      const testSummary = {
        testType: test.testType,
        status: test.status,
        analysis: test.analysis || 'No analysis',
        hasError: !!test.response?.error,
        responseTime: test.response ? 'Received' : 'No response'
      };

      report.tests.push(testSummary);
      
      if (test.status === 'SUCCESS') {
        report.successful++;
        console.log(`✅ ${test.testType}: ${test.analysis}`);
      } else if (test.status === 'ERROR') {
        report.failed++;
        console.log(`❌ ${test.testType}: ${test.analysis}`);
      } else {
        report.pending++;
        console.log(`⏳ ${test.testType}: ${test.analysis}`);
      }
    });

    console.log(`\nTotal: ${report.totalTests} | Success: ${report.successful} | Failed: ${report.failed} | Pending: ${report.pending}\n`);

    // Write detailed report to file
    writeFileSync('search_flows_test_results.json', JSON.stringify({
      ...report,
      detailed_results: this.testResults
    }, null, 2));
    
    console.log('Detailed results written to search_flows_test_results.json');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests
const client = new MCPTestClient();
client.runTests().catch(console.error);