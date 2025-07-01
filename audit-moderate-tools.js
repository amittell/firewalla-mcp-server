#!/usr/bin/env node

/**
 * Moderate Complexity Tools Schema Audit
 * Audit tools with medium complexity and medium risk ratings
 */

import fs from 'fs';

// From the original schema analysis, these are the moderate complexity tools
const MODERATE_TOOLS = [
  'get_flow_data',
  'get_active_alarms' // This was marked as firewalla-mcp-server in extraction but should be get_active_alarms
];

const MODERATE_FIELD_MAPPINGS = {
  get_flow_data: {
    parameters: ['start_time', 'end_time', 'limit', 'cursor'],
    timeFormats: ['ISO 8601', 'Unix timestamp'],
    examplePatterns: [
      'start_time: "2024-01-01T00:00:00Z"',
      'end_time: "2024-01-01T23:59:59Z"',
      'limit: 1000'
    ]
  },
  get_active_alarms: {
    parameters: ['query', 'groupBy', 'sortBy', 'severity', 'limit', 'cursor'],
    queryFields: ['severity', 'type', 'status', 'device_ip', 'source_ip'],
    examplePatterns: [
      'query: "severity:high"',
      'groupBy: "type,box"',
      'sortBy: "ts:desc"',
      'severity: "high"'
    ]
  }
};

async function auditModerateTools() {
  console.log('🔍 PHASE 2 BATCH 3: Auditing Moderate Complexity Tools\n');
  
  const serverPath = '/Users/alex/git/firewalla-mcp-server/src/server.ts';
  const content = fs.readFileSync(serverPath, 'utf8');
  
  const results = [];
  
  for (const toolName of MODERATE_TOOLS) {
    console.log(`📋 Auditing ${toolName}...`);
    
    const auditResult = auditModerateTool(content, toolName);
    results.push(auditResult);
    
    console.log(`   Status: ${auditResult.status}`);
    if (auditResult.issues.length > 0) {
      console.log(`   Issues: ${auditResult.issues.length}`);
    }
  }
  
  generateModerateAuditReport(results);
  return results;
}

function auditModerateTool(content, toolName) {
  const result = {
    toolName,
    status: 'UNKNOWN',
    issues: [],
    parameters: [],
    examples: [],
    requiredParams: [],
    optionalParams: [],
    recommendations: []
  };
  
  // Extract tool schema
  const toolPattern = new RegExp(`name:\\s*['"]${toolName}['"],[\\s\\S]*?},\\s*{`, 'g');
  const match = toolPattern.exec(content);
  
  if (!match) {
    result.status = 'NOT_FOUND';
    result.issues.push('Tool schema not found in server.ts');
    return result;
  }
  
  const toolSchema = match[0];
  
  // Extract parameters from properties section
  const propertiesMatch = toolSchema.match(/properties:\s*{([^}]+(?:}[^}]*)*?)},?\s*required/s);
  if (propertiesMatch) {
    const propertiesSection = propertiesMatch[1];
    
    // Extract parameter names
    const paramPattern = /(\w+):\s*{/g;
    let paramMatch;
    
    while ((paramMatch = paramPattern.exec(propertiesSection)) !== null) {
      result.parameters.push(paramMatch[1]);
    }
  }
  
  // Extract required parameters
  const requiredMatch = toolSchema.match(/required:\s*\[([^\]]+)\]/);
  if (requiredMatch) {
    const requiredStr = requiredMatch[1];
    const requiredParams = requiredStr.split(',').map(p => p.trim().replace(/['"]/g, ''));
    result.requiredParams = requiredParams;
  }
  
  // Determine optional parameters
  result.optionalParams = result.parameters.filter(p => !result.requiredParams.includes(p));
  
  // Extract examples from descriptions
  const examplePattern = /\(e\.g\.,?\s*([^)]+)\)/g;
  let exampleMatch;
  
  while ((exampleMatch = examplePattern.exec(toolSchema)) !== null) {
    result.examples.push(exampleMatch[1].trim());
  }
  
  // Validate against expected mappings
  const expectedMapping = MODERATE_FIELD_MAPPINGS[toolName];
  if (expectedMapping) {
    // Check if all expected parameters are present
    for (const expectedParam of expectedMapping.parameters) {
      if (!result.parameters.includes(expectedParam)) {
        result.issues.push(`Missing expected parameter: ${expectedParam}`);
      }
    }
    
    // Check for unexpected parameters
    const unexpectedParams = result.parameters.filter(p => !expectedMapping.parameters.includes(p));
    if (unexpectedParams.length > 0) {
      result.recommendations.push(`Review unexpected parameters: ${unexpectedParams.join(', ')}`);
    }
    
    // Validate mandatory limit parameter (from v1.0.0 requirements)
    if (!result.requiredParams.includes('limit')) {
      result.issues.push('Missing mandatory limit parameter (v1.0.0 requirement)');
    }
  }
  
  // Determine overall status
  if (result.issues.length === 0) {
    if (result.examples.length > 0 && result.requiredParams.length > 0) {
      result.status = 'VALID';
    } else {
      result.status = 'BASIC';
    }
  } else if (result.parameters.length > 0) {
    result.status = 'PARTIAL';
  } else {
    result.status = 'INVALID';
  }
  
  return result;
}

function generateModerateAuditReport(results) {
  const reportPath = '/Users/alex/git/firewalla-mcp-server/docs/moderate-tools-audit.md';
  
  let report = `# Moderate Complexity Tools Audit Report

## Summary

Audit of moderate complexity tools focusing on parameter consistency, mandatory requirements, and schema completeness.

**Audit Date**: ${new Date().toISOString()}
**Tools Audited**: ${results.length}

`;

  // Status overview
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  
  report += `### Status Overview\n`;
  for (const [status, count] of Object.entries(statusCounts)) {
    const emoji = status === 'VALID' ? '✅' : 
                  status === 'BASIC' ? '🔵' :
                  status === 'PARTIAL' ? '⚠️' : '❌';
    report += `- ${emoji} **${status}**: ${count} tools\n`;
  }
  report += '\n';
  
  // Detailed results
  report += `## Detailed Audit Results\n\n`;
  
  for (const result of results) {
    const statusEmoji = result.status === 'VALID' ? '✅' : 
                       result.status === 'BASIC' ? '🔵' :
                       result.status === 'PARTIAL' ? '⚠️' : '❌';
    
    report += `### ${statusEmoji} ${result.toolName}\n\n`;
    report += `**Status**: ${result.status}\n\n`;
    
    if (result.parameters.length > 0) {
      report += `**Parameters** (${result.parameters.length}):\n`;
      for (const param of result.parameters) {
        const isRequired = result.requiredParams.includes(param);
        const marker = isRequired ? '🔴 Required' : '🔵 Optional';
        report += `- ${marker}: \`${param}\`\n`;
      }
      report += '\n';
    }
    
    if (result.examples.length > 0) {
      report += `**Examples Found**:\n`;
      for (const example of result.examples) {
        report += `- \`${example}\`\n`;
      }
      report += '\n';
    }
    
    if (result.issues.length > 0) {
      report += `**Issues**:\n`;
      for (const issue of result.issues) {
        report += `- ❌ ${issue}\n`;
      }
      report += '\n';
    }
    
    if (result.recommendations.length > 0) {
      report += `**Recommendations**:\n`;
      for (const rec of result.recommendations) {
        report += `- 💡 ${rec}\n`;
      }
      report += '\n';
    }
  }
  
  // Parameter consistency analysis
  report += `## Parameter Consistency Analysis\n\n`;
  
  const allParams = [...new Set(results.flatMap(r => r.parameters))];
  const commonParams = allParams.filter(param => 
    results.filter(r => r.parameters.includes(param)).length > 1
  );
  
  if (commonParams.length > 0) {
    report += `### Common Parameters\n`;
    for (const param of commonParams) {
      const toolsWithParam = results.filter(r => r.parameters.includes(param));
      report += `- \`${param}\`: Used in ${toolsWithParam.length} tools (${toolsWithParam.map(t => t.toolName).join(', ')})\n`;
    }
    report += '\n';
  }
  
  // v1.0.0 Compliance check
  const limitCompliant = results.filter(r => r.requiredParams.includes('limit'));
  report += `### v1.0.0 Compliance\n`;
  report += `**Mandatory Limit Parameter**: ${limitCompliant.length}/${results.length} tools compliant\n\n`;
  
  if (limitCompliant.length < results.length) {
    const nonCompliant = results.filter(r => !r.requiredParams.includes('limit'));
    report += `**Non-Compliant Tools**:\n`;
    for (const tool of nonCompliant) {
      report += `- ❌ \`${tool.toolName}\`: Missing required limit parameter\n`;
    }
    report += '\n';
  }
  
  // Action items
  const needsWork = results.filter(r => r.status === 'PARTIAL' || r.issues.length > 0);
  if (needsWork.length > 0) {
    report += `## Action Items\n\n`;
    
    for (const tool of needsWork) {
      report += `### ${tool.toolName}\n`;
      report += `- **Priority**: ${tool.issues.length > 2 ? 'HIGH' : 'MEDIUM'}\n`;
      report += `- **Issues**: ${tool.issues.length}\n`;
      
      if (tool.issues.includes('Missing mandatory limit parameter (v1.0.0 requirement)')) {
        report += `- **Action**: Add limit as required parameter\n`;
      }
      if (tool.issues.some(i => i.includes('Missing expected parameter'))) {
        report += `- **Action**: Add missing expected parameters\n`;
      }
      
      report += '\n';
    }
  }
  
  report += `## Next Steps\n\n`;
  report += `1. **Fix Parameter Issues**: Update tools with missing required parameters\n`;
  report += `2. **Ensure v1.0.0 Compliance**: Add mandatory limit parameters where missing\n`;
  report += `3. **Validate Changes**: Test updated schemas with live API\n`;
  report += `4. **Proceed to Batch 4**: Audit remaining simple tools\n\n`;
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📝 Moderate tools audit report generated: ${reportPath}\n`);
  
  // Summary
  console.log('📊 MODERATE TOOLS AUDIT SUMMARY:');
  console.log(`✅ Valid: ${statusCounts.VALID || 0} tools`);
  console.log(`🔵 Basic: ${statusCounts.BASIC || 0} tools`);
  console.log(`⚠️  Partial: ${statusCounts.PARTIAL || 0} tools`);
  console.log(`❌ Issues: ${statusCounts.INVALID || 0} tools`);
  console.log(`📝 Total: ${results.length} tools\n`);
}

// Run moderate tools audit
auditModerateTools().catch(error => {
  console.error('💥 Moderate tools audit failed:', error);
  process.exit(1);
});