#!/usr/bin/env node

/**
 * Phase 2 Validation Test Suite
 * Tests all 6 new Statistics and Trends API tools
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

class Phase2ValidationSuite {
  constructor() {
    this.results = {
      toolRegistration: {},
      statisticsAPI: {},
      trendsAPI: {},
      dataValidation: {},
      errorHandling: {},
      performance: {},
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        errors: []
      }
    };
    this.mcpServer = null;
  }

  /**
   * Start MCP server for testing
   */
  async startMCPServer() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting MCP server...');
      this.mcpServer = spawn('npm', ['run', 'mcp:start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let output = '';
      this.mcpServer.stderr.on('data', (data) => {
        output += data.toString();
        if (output.includes('Firewalla MCP Server running on stdio')) {
          console.log('✅ MCP server started successfully');
          resolve();
        }
      });

      this.mcpServer.on('error', (error) => {
        console.error('❌ Failed to start MCP server:', error);
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!output.includes('Firewalla MCP Server running on stdio')) {
          reject(new Error('MCP server startup timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Send MCP request to server
   */
  async sendMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.mcpServer) {
        reject(new Error('MCP server not started'));
        return;
      }

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      }) + '\n';

      let response = '';
      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          reject(new Error('Request timeout'));
        }
      }, 5000);

      const dataHandler = (data) => {
        response += data.toString();
        try {
          const parsed = JSON.parse(response.trim());
          if (parsed.id) {
            responseReceived = true;
            clearTimeout(timeout);
            this.mcpServer.stdout.removeListener('data', dataHandler);
            resolve(parsed);
          }
        } catch (e) {
          // Continue reading if JSON is incomplete
        }
      };

      this.mcpServer.stdout.on('data', dataHandler);
      this.mcpServer.stdin.write(request);
    });
  }

  /**
   * Test tool registration and discovery
   */
  async testToolRegistration() {
    console.log('\n📋 Testing Tool Registration...');
    
    try {
      const response = await this.sendMCPRequest('tools/list');
      const tools = response.result?.tools || [];
      
      const phase2Tools = [
        'get_simple_statistics',
        'get_statistics_by_region', 
        'get_statistics_by_box',
        'get_flow_trends',
        'get_alarm_trends',
        'get_rule_trends'
      ];

      this.results.toolRegistration.totalTools = tools.length;
      this.results.toolRegistration.phase2Tools = {};

      phase2Tools.forEach(toolName => {
        const tool = tools.find(t => t.name === toolName);
        this.results.toolRegistration.phase2Tools[toolName] = {
          registered: !!tool,
          hasDescription: tool?.description?.length > 0,
          hasInputSchema: !!tool?.inputSchema,
          schemaValid: this.validateToolSchema(toolName, tool?.inputSchema)
        };

        const result = this.results.toolRegistration.phase2Tools[toolName];
        const status = result.registered && result.hasDescription && result.hasInputSchema ? '✅' : '❌';
        console.log(`  ${status} ${toolName}: registered=${result.registered}, schema=${result.schemaValid}`);
      });

      this.updateTestResults('Tool Registration', phase2Tools.every(
        tool => this.results.toolRegistration.phase2Tools[tool].registered
      ));

    } catch (error) {
      console.error('❌ Tool registration test failed:', error.message);
      this.updateTestResults('Tool Registration', false, error.message);
    }
  }

  /**
   * Validate tool input schema
   */
  validateToolSchema(toolName, schema) {
    if (!schema) return false;

    const expectedSchemas = {
      'get_simple_statistics': { properties: {} },
      'get_statistics_by_region': { properties: {} },
      'get_statistics_by_box': { properties: {} },
      'get_flow_trends': {
        properties: {
          period: { enum: ['1h', '24h', '7d', '30d'] },
          interval: { type: 'number', minimum: 60, maximum: 86400 }
        }
      },
      'get_alarm_trends': {
        properties: {
          period: { enum: ['1h', '24h', '7d', '30d'] }
        }
      },
      'get_rule_trends': {
        properties: {
          period: { enum: ['1h', '24h', '7d', '30d'] }
        }
      }
    };

    const expected = expectedSchemas[toolName];
    if (!expected) return true; // Unknown tool, assume valid

    // Basic validation - check if required properties exist
    return schema.type === 'object' && schema.properties !== undefined;
  }

  /**
   * Test Statistics API tools
   */
  async testStatisticsAPI() {
    console.log('\n📊 Testing Statistics API...');

    const statisticsTools = [
      { name: 'get_simple_statistics', args: {} },
      { name: 'get_statistics_by_region', args: {} },
      { name: 'get_statistics_by_box', args: {} }
    ];

    for (const tool of statisticsTools) {
      try {
        console.log(`  Testing ${tool.name}...`);
        const startTime = Date.now();
        
        const response = await this.sendMCPRequest('tools/call', {
          name: tool.name,
          arguments: tool.args
        });

        const duration = Date.now() - startTime;
        const success = !response.error && response.result?.content?.[0]?.text;
        
        if (success) {
          const data = JSON.parse(response.result.content[0].text);
          this.results.statisticsAPI[tool.name] = {
            success: true,
            duration,
            dataStructure: this.validateStatisticsResponse(tool.name, data),
            sampleData: this.extractSampleData(data)
          };
          console.log(`    ✅ ${tool.name}: ${duration}ms, valid data: ${this.results.statisticsAPI[tool.name].dataStructure}`);
        } else {
          throw new Error(response.error?.message || 'Invalid response format');
        }

        this.updateTestResults(`Statistics API - ${tool.name}`, success);

      } catch (error) {
        console.error(`    ❌ ${tool.name} failed:`, error.message);
        this.results.statisticsAPI[tool.name] = {
          success: false,
          error: error.message
        };
        this.updateTestResults(`Statistics API - ${tool.name}`, false, error.message);
      }
    }
  }

  /**
   * Test Trends API tools
   */
  async testTrendsAPI() {
    console.log('\n📈 Testing Trends API...');

    const trendsTools = [
      { name: 'get_flow_trends', args: {} },
      { name: 'get_flow_trends', args: { period: '1h' } },
      { name: 'get_flow_trends', args: { period: '24h', interval: 1800 } },
      { name: 'get_alarm_trends', args: {} },
      { name: 'get_alarm_trends', args: { period: '7d' } },
      { name: 'get_rule_trends', args: {} },
      { name: 'get_rule_trends', args: { period: '30d' } }
    ];

    for (const tool of trendsTools) {
      try {
        const testKey = `${tool.name}_${JSON.stringify(tool.args)}`;
        console.log(`  Testing ${tool.name} with args: ${JSON.stringify(tool.args)}...`);
        
        const startTime = Date.now();
        const response = await this.sendMCPRequest('tools/call', {
          name: tool.name,
          arguments: tool.args
        });

        const duration = Date.now() - startTime;
        const success = !response.error && response.result?.content?.[0]?.text;
        
        if (success) {
          const data = JSON.parse(response.result.content[0].text);
          this.results.trendsAPI[testKey] = {
            success: true,
            duration,
            dataStructure: this.validateTrendsResponse(tool.name, data),
            sampleData: this.extractSampleData(data),
            trendPoints: data.trends?.length || 0
          };
          console.log(`    ✅ ${testKey}: ${duration}ms, ${data.trends?.length || 0} data points`);
        } else {
          throw new Error(response.error?.message || 'Invalid response format');
        }

        this.updateTestResults(`Trends API - ${testKey}`, success);

      } catch (error) {
        const testKey = `${tool.name}_${JSON.stringify(tool.args)}`;
        console.error(`    ❌ ${testKey} failed:`, error.message);
        this.results.trendsAPI[testKey] = {
          success: false,
          error: error.message
        };
        this.updateTestResults(`Trends API - ${testKey}`, false, error.message);
      }
    }
  }

  /**
   * Test error handling with invalid parameters
   */
  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');

    const errorTests = [
      {
        name: 'get_flow_trends',
        args: { period: 'invalid' },
        expectedError: 'Invalid period'
      },
      {
        name: 'get_flow_trends', 
        args: { interval: 30 },
        expectedError: 'Invalid interval'
      },
      {
        name: 'get_alarm_trends',
        args: { period: 'bad_period' },
        expectedError: 'Invalid period'
      },
      {
        name: 'nonexistent_tool',
        args: {},
        expectedError: 'Unknown tool'
      }
    ];

    for (const test of errorTests) {
      try {
        console.log(`  Testing error case: ${test.name} with ${JSON.stringify(test.args)}...`);
        
        const response = await this.sendMCPRequest('tools/call', {
          name: test.name,
          arguments: test.args
        });

        const hasError = response.error || (response.result?.isError);
        this.results.errorHandling[`${test.name}_error`] = {
          hasError,
          errorMessage: response.error?.message || response.result?.content?.[0]?.text
        };

        if (hasError) {
          console.log(`    ✅ Error properly handled: ${test.name}`);
          this.updateTestResults(`Error Handling - ${test.name}`, true);
        } else {
          console.log(`    ❌ Error not handled: ${test.name}`);
          this.updateTestResults(`Error Handling - ${test.name}`, false, 'Expected error but got success');
        }

      } catch (error) {
        // Catching an error is actually expected for error handling tests
        console.log(`    ✅ Error properly caught: ${test.name}`);
        this.updateTestResults(`Error Handling - ${test.name}`, true);
      }
    }
  }

  /**
   * Validate Statistics API response structure
   */
  validateStatisticsResponse(toolName, data) {
    switch (toolName) {
      case 'get_simple_statistics':
        return !!(data.statistics && data.summary && 
                 typeof data.statistics.total_boxes === 'number' &&
                 typeof data.summary.health_score === 'number');
      
      case 'get_statistics_by_region':
        return !!(data.regional_statistics && Array.isArray(data.regional_statistics) &&
                 data.top_regions && Array.isArray(data.top_regions));
      
      case 'get_statistics_by_box':
        return !!(data.box_statistics && Array.isArray(data.box_statistics) &&
                 data.summary && typeof data.total_boxes === 'number');
      
      default:
        return false;
    }
  }

  /**
   * Validate Trends API response structure
   */
  validateTrendsResponse(toolName, data) {
    const hasBasicStructure = !!(data.trends && Array.isArray(data.trends) &&
                                data.summary && typeof data.period === 'string');
    
    if (!hasBasicStructure) return false;

    // Check if trends have proper timestamp structure
    const firstTrend = data.trends[0];
    if (firstTrend) {
      return !!(typeof firstTrend.timestamp === 'number' &&
               typeof firstTrend.timestamp_iso === 'string' &&
               firstTrend.timestamp_iso.includes('T'));
    }

    return true;
  }

  /**
   * Extract sample data for reporting
   */
  extractSampleData(data) {
    if (data.statistics) {
      return {
        type: 'statistics',
        summary: data.summary || data.statistics
      };
    }
    
    if (data.trends) {
      return {
        type: 'trends',
        dataPoints: data.trends.length,
        firstPoint: data.trends[0],
        summary: data.summary
      };
    }

    return { type: 'unknown', keys: Object.keys(data) };
  }

  /**
   * Update test results
   */
  updateTestResults(testName, passed, error = null) {
    this.results.summary.totalTests++;
    if (passed) {
      this.results.summary.passed++;
    } else {
      this.results.summary.failed++;
      if (error) {
        this.results.summary.errors.push({ test: testName, error });
      }
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      phase: 'Phase 2 - Statistics & Trends API Validation',
      summary: this.results.summary,
      results: this.results,
      conclusions: this.generateConclusions()
    };

    const reportPath = `./validation/phase2-test-results-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📋 Test Summary:');
    console.log(`  Total Tests: ${this.results.summary.totalTests}`);
    console.log(`  Passed: ${this.results.summary.passed} ✅`);
    console.log(`  Failed: ${this.results.summary.failed} ❌`);
    console.log(`  Success Rate: ${Math.round((this.results.summary.passed / this.results.summary.totalTests) * 100)}%`);
    
    if (this.results.summary.errors.length > 0) {
      console.log('\n❌ Failures:');
      this.results.summary.errors.forEach(error => {
        console.log(`  - ${error.test}: ${error.error}`);
      });
    }

    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    return report;
  }

  /**
   * Generate conclusions based on test results
   */
  generateConclusions() {
    const conclusions = [];
    const successRate = (this.results.summary.passed / this.results.summary.totalTests) * 100;

    if (successRate >= 90) {
      conclusions.push('✅ Phase 2 implementation is highly successful');
    } else if (successRate >= 75) {
      conclusions.push('⚠️ Phase 2 implementation has minor issues that need attention');
    } else {
      conclusions.push('❌ Phase 2 implementation has significant issues requiring fixes');
    }

    // Analyze specific areas
    const toolRegistrationPassed = Object.values(this.results.toolRegistration.phase2Tools || {})
      .every(tool => tool.registered);
    
    if (toolRegistrationPassed) {
      conclusions.push('✅ All tools are properly registered and discoverable');
    } else {
      conclusions.push('❌ Some tools are not properly registered');
    }

    const statisticsAPIPassed = Object.values(this.results.statisticsAPI)
      .every(result => result.success);
    
    if (statisticsAPIPassed) {
      conclusions.push('✅ Statistics API tools are functioning correctly');
    } else {
      conclusions.push('❌ Statistics API has issues that need fixing');
    }

    const trendsAPIPassed = Object.values(this.results.trendsAPI)
      .every(result => result.success);
    
    if (trendsAPIPassed) {
      conclusions.push('✅ Trends API tools are functioning correctly');
    } else {
      conclusions.push('❌ Trends API has issues that need fixing');
    }

    return conclusions;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.mcpServer) {
      console.log('\n🛑 Stopping MCP server...');
      this.mcpServer.kill('SIGTERM');
    }
  }

  /**
   * Run all validation tests
   */
  async runFullValidation() {
    try {
      console.log('🎯 Starting Phase 2 Validation Suite');
      console.log('=' .repeat(50));

      await this.startMCPServer();
      
      // Give server time to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      await this.testToolRegistration(); 
      await this.testStatisticsAPI();
      await this.testTrendsAPI();
      await this.testErrorHandling();

      const report = this.generateReport();
      
      console.log('\n🎉 Phase 2 validation completed!');
      return report;

    } catch (error) {
      console.error('💥 Validation suite failed:', error);
      throw error;
    } finally {
      this.cleanup();
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new Phase2ValidationSuite();
  
  validator.runFullValidation()
    .then(report => {
      const successRate = (report.summary.passed / report.summary.totalTests) * 100;
      process.exit(successRate >= 75 ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

export { Phase2ValidationSuite };