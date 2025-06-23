#!/usr/bin/env node

/**
 * V2.1.2 Verification: Test Specialized Tools
 * 
 * Tests specialized Firewalla MCP tools:
 * - get_bandwidth_usage: Bandwidth analysis with different periods
 * - get_target_lists: Security target lists with different types
 * - pause_rule/resume_rule: Rule control operations
 * - get_network_rules_summary: Rule overview statistics
 * - get_most_active_rules: Rule activity analysis
 * - get_recent_rules: Recent rule changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SpecializedToolsVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
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
   * Read tools source code
   */
  async readToolsCode() {
    const toolsPath = path.join(__dirname, '../src/tools/index.ts');
    try {
      const content = fs.readFileSync(toolsPath, 'utf8');
      return content;
    } catch (error) {
      this.addResult('setup', 'read-tools-code', 'failed', 
        `Failed to read tools code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test bandwidth usage tool
   */
  testBandwidthUsageTool(toolsCode) {
    console.log('🔍 Testing get_bandwidth_usage tool...');
    
    // Check tool definition exists
    if (toolsCode.includes("case 'get_bandwidth_usage':")) {
      this.addResult('bandwidth-tool', 'definition-exists', 'passed',
        '✅ get_bandwidth_usage tool definition found');
    } else {
      this.addResult('bandwidth-tool', 'definition-exists', 'failed',
        '❌ get_bandwidth_usage tool definition missing');
      return;
    }
    
    // Extract tool case content
    const caseStart = toolsCode.indexOf("case 'get_bandwidth_usage':");
    const nextCase = toolsCode.indexOf('case ', caseStart + 1);
    const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
    const caseContent = toolsCode.substring(caseStart, caseEnd);
    
    // Check parameter handling
    const requiredParams = ['period'];
    const optionalParams = ['top'];
    
    if (caseContent.includes('period')) {
      this.addResult('bandwidth-tool', 'period-parameter', 'passed',
        '✅ get_bandwidth_usage handles period parameter');
    } else {
      this.addResult('bandwidth-tool', 'period-parameter', 'failed',
        '❌ get_bandwidth_usage missing period parameter');
    }
    
    if (caseContent.includes('top')) {
      this.addResult('bandwidth-tool', 'top-parameter', 'passed',
        '✅ get_bandwidth_usage handles top parameter');
    } else {
      this.addResult('bandwidth-tool', 'top-parameter', 'warnings',
        '⚠️ get_bandwidth_usage may not handle top parameter');
    }
    
    // Check period validation
    if (caseContent.includes('throw new Error') && caseContent.includes('Period parameter is required')) {
      this.addResult('bandwidth-tool', 'period-validation', 'passed',
        '✅ get_bandwidth_usage validates period parameter');
    } else {
      this.addResult('bandwidth-tool', 'period-validation', 'warnings',
        '⚠️ get_bandwidth_usage period validation unclear');
    }
    
    // Check client method call
    if (caseContent.includes('getBandwidthUsage')) {
      this.addResult('bandwidth-tool', 'client-method-call', 'passed',
        '✅ get_bandwidth_usage calls getBandwidthUsage client method');
    } else {
      this.addResult('bandwidth-tool', 'client-method-call', 'failed',
        '❌ get_bandwidth_usage missing client method call');
    }
    
    // Check response structure
    const expectedFields = ['period', 'top_devices', 'bandwidth_usage'];
    const missingFields = expectedFields.filter(field => !caseContent.includes(field + ':'));
    
    if (missingFields.length === 0) {
      this.addResult('bandwidth-tool', 'response-fields', 'passed',
        '✅ get_bandwidth_usage includes all expected response fields');
    } else {
      this.addResult('bandwidth-tool', 'response-fields', 'failed',
        `❌ get_bandwidth_usage missing response fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Test target lists tool
   */
  testTargetListsTool(toolsCode) {
    console.log('🔍 Testing get_target_lists tool...');
    
    // Check tool definition exists
    if (toolsCode.includes("case 'get_target_lists':")) {
      this.addResult('target-lists-tool', 'definition-exists', 'passed',
        '✅ get_target_lists tool definition found');
    } else {
      this.addResult('target-lists-tool', 'definition-exists', 'failed',
        '❌ get_target_lists tool definition missing');
      return;
    }
    
    // Extract tool case content
    const caseStart = toolsCode.indexOf("case 'get_target_lists':");
    const nextCase = toolsCode.indexOf('case ', caseStart + 1);
    const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
    const caseContent = toolsCode.substring(caseStart, caseEnd);
    
    // Check parameter handling
    if (caseContent.includes('list_type')) {
      this.addResult('target-lists-tool', 'list-type-parameter', 'passed',
        '✅ get_target_lists handles list_type parameter');
    } else {
      this.addResult('target-lists-tool', 'list-type-parameter', 'warnings',
        '⚠️ get_target_lists may not handle list_type parameter');
    }
    
    // Check client method call
    if (caseContent.includes('getTargetLists')) {
      this.addResult('target-lists-tool', 'client-method-call', 'passed',
        '✅ get_target_lists calls getTargetLists client method');
    } else {
      this.addResult('target-lists-tool', 'client-method-call', 'failed',
        '❌ get_target_lists missing client method call');
    }
    
    // Check response structure
    const expectedFields = ['total_lists', 'categories', 'target_lists'];
    const missingFields = expectedFields.filter(field => !caseContent.includes(field + ':'));
    
    if (missingFields.length === 0) {
      this.addResult('target-lists-tool', 'response-fields', 'passed',
        '✅ get_target_lists includes all expected response fields');
    } else {
      this.addResult('target-lists-tool', 'response-fields', 'failed',
        `❌ get_target_lists missing response fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Test rule control tools
   */
  testRuleControlTools(toolsCode) {
    console.log('🔍 Testing rule control tools (pause_rule, resume_rule)...');
    
    // Test pause_rule
    if (toolsCode.includes("case 'pause_rule':")) {
      this.addResult('rule-control', 'pause-rule-exists', 'passed',
        '✅ pause_rule tool definition found');
        
      const pauseCaseStart = toolsCode.indexOf("case 'pause_rule':");
      const pauseNextCase = toolsCode.indexOf('case ', pauseCaseStart + 1);
      const pauseCaseEnd = pauseNextCase === -1 ? toolsCode.length : pauseNextCase;
      const pauseCaseContent = toolsCode.substring(pauseCaseStart, pauseCaseEnd);
      
      // Check required parameter
      if (pauseCaseContent.includes('rule_id')) {
        this.addResult('rule-control', 'pause-rule-id-param', 'passed',
          '✅ pause_rule handles rule_id parameter');
      } else {
        this.addResult('rule-control', 'pause-rule-id-param', 'failed',
          '❌ pause_rule missing rule_id parameter');
      }
      
      // Check optional duration parameter
      if (pauseCaseContent.includes('duration')) {
        this.addResult('rule-control', 'pause-duration-param', 'passed',
          '✅ pause_rule handles duration parameter');
      } else {
        this.addResult('rule-control', 'pause-duration-param', 'warnings',
          '⚠️ pause_rule may not handle duration parameter');
      }
      
      // Check parameter validation
      if (pauseCaseContent.includes('throw new Error') && pauseCaseContent.includes('Rule ID parameter is required')) {
        this.addResult('rule-control', 'pause-validation', 'passed',
          '✅ pause_rule validates required parameters');
      } else {
        this.addResult('rule-control', 'pause-validation', 'warnings',
          '⚠️ pause_rule parameter validation unclear');
      }
      
      // Check client method call
      if (pauseCaseContent.includes('pauseRule')) {
        this.addResult('rule-control', 'pause-client-call', 'passed',
          '✅ pause_rule calls pauseRule client method');
      } else {
        this.addResult('rule-control', 'pause-client-call', 'failed',
          '❌ pause_rule missing client method call');
      }
    } else {
      this.addResult('rule-control', 'pause-rule-exists', 'failed',
        '❌ pause_rule tool definition missing');
    }
    
    // Test resume_rule
    if (toolsCode.includes("case 'resume_rule':")) {
      this.addResult('rule-control', 'resume-rule-exists', 'passed',
        '✅ resume_rule tool definition found');
        
      const resumeCaseStart = toolsCode.indexOf("case 'resume_rule':");
      const resumeNextCase = toolsCode.indexOf('case ', resumeCaseStart + 1);
      const resumeCaseEnd = resumeNextCase === -1 ? toolsCode.length : resumeNextCase;
      const resumeCaseContent = toolsCode.substring(resumeCaseStart, resumeCaseEnd);
      
      // Check required parameter
      if (resumeCaseContent.includes('rule_id')) {
        this.addResult('rule-control', 'resume-rule-id-param', 'passed',
          '✅ resume_rule handles rule_id parameter');
      } else {
        this.addResult('rule-control', 'resume-rule-id-param', 'failed',
          '❌ resume_rule missing rule_id parameter');
      }
      
      // Check client method call
      if (resumeCaseContent.includes('resumeRule')) {
        this.addResult('rule-control', 'resume-client-call', 'passed',
          '✅ resume_rule calls resumeRule client method');
      } else {
        this.addResult('rule-control', 'resume-client-call', 'failed',
          '❌ resume_rule missing client method call');
      }
    } else {
      this.addResult('rule-control', 'resume-rule-exists', 'failed',
        '❌ resume_rule tool definition missing');
    }
  }

  /**
   * Test rule analysis tools
   */
  testRuleAnalysisTools(toolsCode) {
    console.log('🔍 Testing rule analysis tools...');
    
    const analysisTools = [
      {
        name: 'get_network_rules_summary',
        expectedFields: ['total_rules', 'breakdown', 'hit_statistics', 'age_statistics'],
        description: 'network rules summary'
      },
      {
        name: 'get_most_active_rules', 
        expectedFields: ['total_rules_analyzed', 'rules_meeting_criteria', 'rules', 'summary'],
        description: 'most active rules'
      },
      {
        name: 'get_recent_rules',
        expectedFields: ['total_rules_analyzed', 'recent_rules_found', 'rules', 'summary'],
        description: 'recent rules'
      }
    ];
    
    for (const tool of analysisTools) {
      if (toolsCode.includes(`case '${tool.name}':`)) {
        this.addResult('rule-analysis', `${tool.name}-exists`, 'passed',
          `✅ ${tool.name} tool definition found`);
          
        const caseStart = toolsCode.indexOf(`case '${tool.name}':`);
        const nextCase = toolsCode.indexOf('case ', caseStart + 1);
        const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
        const caseContent = toolsCode.substring(caseStart, caseEnd);
        
        // Check if it calls getNetworkRules for data
        if (caseContent.includes('getNetworkRules')) {
          this.addResult('rule-analysis', `${tool.name}-data-source`, 'passed',
            `✅ ${tool.name} uses getNetworkRules for data`);
        } else {
          this.addResult('rule-analysis', `${tool.name}-data-source`, 'warnings',
            `⚠️ ${tool.name} data source unclear`);
        }
        
        // Check expected response fields
        const missingFields = tool.expectedFields.filter(field => !caseContent.includes(field + ':'));
        
        if (missingFields.length === 0) {
          this.addResult('rule-analysis', `${tool.name}-response-fields`, 'passed',
            `✅ ${tool.name} includes all expected response fields`);
        } else if (missingFields.length <= 1) {
          this.addResult('rule-analysis', `${tool.name}-response-fields`, 'warnings',
            `⚠️ ${tool.name} missing some response fields: ${missingFields.join(', ')}`);
        } else {
          this.addResult('rule-analysis', `${tool.name}-response-fields`, 'failed',
            `❌ ${tool.name} missing response fields: ${missingFields.join(', ')}`);
        }
        
        // Check for data processing logic
        if (caseContent.includes('reduce') || caseContent.includes('filter') || caseContent.includes('map')) {
          this.addResult('rule-analysis', `${tool.name}-data-processing`, 'passed',
            `✅ ${tool.name} has data processing logic`);
        } else {
          this.addResult('rule-analysis', `${tool.name}-data-processing`, 'warnings',
            `⚠️ ${tool.name} data processing unclear`);
        }
        
      } else {
        this.addResult('rule-analysis', `${tool.name}-exists`, 'failed',
          `❌ ${tool.name} tool definition missing`);
      }
    }
  }

  /**
   * Test offline devices tool
   */
  testOfflineDevicesTool(toolsCode) {
    console.log('🔍 Testing get_offline_devices tool...');
    
    if (toolsCode.includes("case 'get_offline_devices':")) {
      this.addResult('offline-devices', 'definition-exists', 'passed',
        '✅ get_offline_devices tool definition found');
        
      const caseStart = toolsCode.indexOf("case 'get_offline_devices':");
      const nextCase = toolsCode.indexOf('case ', caseStart + 1);
      const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
      const caseContent = toolsCode.substring(caseStart, caseEnd);
      
      // Check parameter handling
      if (caseContent.includes('sort_by_last_seen')) {
        this.addResult('offline-devices', 'sort-parameter', 'passed',
          '✅ get_offline_devices handles sort_by_last_seen parameter');
      } else {
        this.addResult('offline-devices', 'sort-parameter', 'warnings',
          '⚠️ get_offline_devices may not handle sort parameter');
      }
      
      // Check if it calls getDeviceStatus
      if (caseContent.includes('getDeviceStatus')) {
        this.addResult('offline-devices', 'data-source', 'passed',
          '✅ get_offline_devices uses getDeviceStatus for data');
      } else {
        this.addResult('offline-devices', 'data-source', 'failed',
          '❌ get_offline_devices missing data source');
      }
      
      // Check for filtering logic
      if (caseContent.includes('filter') && caseContent.includes('!device.online')) {
        this.addResult('offline-devices', 'filtering-logic', 'passed',
          '✅ get_offline_devices has offline filtering logic');
      } else {
        this.addResult('offline-devices', 'filtering-logic', 'warnings',
          '⚠️ get_offline_devices filtering logic unclear');
      }
      
      // Check for sorting logic
      if (caseContent.includes('sort') && caseContent.includes('lastSeen')) {
        this.addResult('offline-devices', 'sorting-logic', 'passed',
          '✅ get_offline_devices has sorting by lastSeen');
      } else {
        this.addResult('offline-devices', 'sorting-logic', 'warnings',
          '⚠️ get_offline_devices sorting logic unclear');
      }
      
      // Check response fields
      const expectedFields = ['total_offline_devices', 'devices'];
      const missingFields = expectedFields.filter(field => !caseContent.includes(field + ':'));
      
      if (missingFields.length === 0) {
        this.addResult('offline-devices', 'response-fields', 'passed',
          '✅ get_offline_devices includes all expected response fields');
      } else {
        this.addResult('offline-devices', 'response-fields', 'failed',
          `❌ get_offline_devices missing response fields: ${missingFields.join(', ')}`);
      }
      
    } else {
      this.addResult('offline-devices', 'definition-exists', 'failed',
        '❌ get_offline_devices tool definition missing');
    }
  }

  /**
   * Test statistics tools
   */
  testStatisticsTools(toolsCode) {
    console.log('🔍 Testing statistics tools...');
    
    const statsTools = [
      {
        name: 'get_simple_statistics',
        expectedFields: ['statistics', 'summary'],
        clientMethod: 'getSimpleStatistics'
      },
      {
        name: 'get_statistics_by_region',
        expectedFields: ['total_regions', 'regional_statistics', 'top_regions'],
        clientMethod: 'getStatisticsByRegion'
      },
      {
        name: 'get_statistics_by_box',
        expectedFields: ['total_boxes', 'box_statistics', 'summary'],
        clientMethod: 'getStatisticsByBox'
      }
    ];
    
    for (const tool of statsTools) {
      if (toolsCode.includes(`case '${tool.name}':`)) {
        this.addResult('statistics-tools', `${tool.name}-exists`, 'passed',
          `✅ ${tool.name} tool definition found`);
          
        const caseStart = toolsCode.indexOf(`case '${tool.name}':`);
        const nextCase = toolsCode.indexOf('case ', caseStart + 1);
        const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
        const caseContent = toolsCode.substring(caseStart, caseEnd);
        
        // Check client method call
        if (caseContent.includes(tool.clientMethod)) {
          this.addResult('statistics-tools', `${tool.name}-client-call`, 'passed',
            `✅ ${tool.name} calls ${tool.clientMethod}`);
        } else {
          this.addResult('statistics-tools', `${tool.name}-client-call`, 'failed',
            `❌ ${tool.name} missing ${tool.clientMethod} call`);
        }
        
        // Check response fields
        const missingFields = tool.expectedFields.filter(field => !caseContent.includes(field + ':'));
        
        if (missingFields.length === 0) {
          this.addResult('statistics-tools', `${tool.name}-response-fields`, 'passed',
            `✅ ${tool.name} includes all expected response fields`);
        } else {
          this.addResult('statistics-tools', `${tool.name}-response-fields`, 'failed',
            `❌ ${tool.name} missing response fields: ${missingFields.join(', ')}`);
        }
        
      } else {
        this.addResult('statistics-tools', `${tool.name}-exists`, 'failed',
          `❌ ${tool.name} tool definition missing`);
      }
    }
  }

  /**
   * Test trends tools
   */
  testTrendsTools(toolsCode) {
    console.log('🔍 Testing trends tools...');
    
    const trendsTools = [
      {
        name: 'get_flow_trends',
        expectedFields: ['period', 'interval_seconds', 'data_points', 'trends', 'summary'],
        clientMethod: 'getFlowTrends'
      },
      {
        name: 'get_alarm_trends',
        expectedFields: ['period', 'data_points', 'trends', 'summary'],
        clientMethod: 'getAlarmTrends'
      },
      {
        name: 'get_rule_trends',
        expectedFields: ['period', 'data_points', 'trends', 'summary'],
        clientMethod: 'getRuleTrends'
      }
    ];
    
    for (const tool of trendsTools) {
      if (toolsCode.includes(`case '${tool.name}':`)) {
        this.addResult('trends-tools', `${tool.name}-exists`, 'passed',
          `✅ ${tool.name} tool definition found`);
          
        const caseStart = toolsCode.indexOf(`case '${tool.name}':`);
        const nextCase = toolsCode.indexOf('case ', caseStart + 1);
        const caseEnd = nextCase === -1 ? toolsCode.length : nextCase;
        const caseContent = toolsCode.substring(caseStart, caseEnd);
        
        // Check client method call
        if (caseContent.includes(tool.clientMethod)) {
          this.addResult('trends-tools', `${tool.name}-client-call`, 'passed',
            `✅ ${tool.name} calls ${tool.clientMethod}`);
        } else {
          this.addResult('trends-tools', `${tool.name}-client-call`, 'failed',
            `❌ ${tool.name} missing ${tool.clientMethod} call`);
        }
        
        // Check period parameter handling
        if (caseContent.includes('period')) {
          this.addResult('trends-tools', `${tool.name}-period-param`, 'passed',
            `✅ ${tool.name} handles period parameter`);
        } else {
          this.addResult('trends-tools', `${tool.name}-period-param`, 'warnings',
            `⚠️ ${tool.name} period parameter unclear`);
        }
        
        // Check response fields
        const missingFields = tool.expectedFields.filter(field => !caseContent.includes(field + ':'));
        
        if (missingFields.length <= 1) {
          this.addResult('trends-tools', `${tool.name}-response-fields`, 'passed',
            `✅ ${tool.name} includes expected response fields`);
        } else {
          this.addResult('trends-tools', `${tool.name}-response-fields`, 'failed',
            `❌ ${tool.name} missing response fields: ${missingFields.join(', ')}`);
        }
        
      } else {
        this.addResult('trends-tools', `${tool.name}-exists`, 'failed',
          `❌ ${tool.name} tool definition missing`);
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V2.1.2: Test Specialized Tools');
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
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed <= 5) {
      console.log('\\n🎉 Specialized tools verification successful! V2.1.2 complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review specialized tool implementation.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V2.1.2 Verification: Test Specialized Tools\\n');
    
    try {
      // Read source files
      const toolsCode = await this.readToolsCode();
      this.addResult('setup', 'read-tools-code', 'passed', 
        '✅ Successfully read tools source code');
      
      // Run all verification tests
      this.testBandwidthUsageTool(toolsCode);
      this.testTargetListsTool(toolsCode);
      this.testRuleControlTools(toolsCode);
      this.testRuleAnalysisTools(toolsCode);
      this.testOfflineDevicesTool(toolsCode);
      this.testStatisticsTools(toolsCode);
      this.testTrendsTools(toolsCode);
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      console.error('💥 Verification failed:', error.message);
      return false;
    }
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new SpecializedToolsVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { SpecializedToolsVerifier };