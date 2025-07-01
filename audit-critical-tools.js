#!/usr/bin/env node

/**
 * Critical Tool Schema Audit
 * Systematic audit of the 5 critical search tools with field syntax validation
 */

import fs from 'fs';

const CRITICAL_TOOLS = [
  'search_flows',
  'search_alarms', 
  'search_rules',
  'search_devices',
  'search_target_lists'
];

const API_FIELD_MAPPINGS = {
  flows: {
    // Correct field names from API documentation
    fields: ['protocol', 'direction', 'block', 'bytes', 'device_ip', 'source_ip', 'destination_ip', 'region', 'category'],
    examplePatterns: [
      'protocol:tcp',
      'direction:outbound', 
      'block:true',
      'bytes:>1000000',
      'device_ip:192.168.*',
      'source_ip:192.168.1.100',
      'destination_ip:93.184.216.34',
      'region:US',
      'category:social'
    ]
  },
  alarms: {
    fields: ['type', 'status', 'severity', 'device_ip', 'source_ip', 'direction', 'protocol'],
    examplePatterns: [
      'type:1',
      'status:1', 
      'severity:high',
      'device_ip:192.168.*',
      'source_ip:192.168.1.100',
      'direction:inbound',
      'protocol:tcp'
    ]
  },
  rules: {
    fields: ['action', 'target_type', 'target_value', 'direction', 'status'],
    examplePatterns: [
      'action:block',
      'target_type:domain',
      'target_value:*.facebook.com',
      'direction:bidirection', 
      'status:active'
    ]
  },
  devices: {
    fields: ['name', 'ip', 'online', 'mac_vendor', 'last_seen'],
    examplePatterns: [
      'name:*iPhone*',
      'ip:192.168.*',
      'online:true',
      'mac_vendor:Apple',
      'last_seen:>86400'
    ]
  },
  target_lists: {
    fields: ['name', 'category', 'owner'],
    examplePatterns: [
      'name:*social*',
      'category:social',
      'owner:global'
    ]
  }
};

async function auditCriticalTools() {
  console.log('🔍 PHASE 2 BATCH 1: Auditing Critical Search Tools\n');
  
  const serverPath = '/Users/alex/git/firewalla-mcp-server/src/server.ts';
  const content = fs.readFileSync(serverPath, 'utf8');
  
  const results = [];
  
  for (const toolName of CRITICAL_TOOLS) {
    console.log(`📋 Auditing ${toolName}...`);
    
    const auditResult = auditTool(content, toolName);
    results.push(auditResult);
    
    console.log(`   Status: ${auditResult.status}`);
    if (auditResult.issues.length > 0) {
      console.log(`   Issues: ${auditResult.issues.length}`);
    }
  }
  
  // Generate audit report
  generateAuditReport(results);
  
  return results;
}

function auditTool(content, toolName) {
  const result = {
    toolName,
    status: 'UNKNOWN',
    issues: [],
    examples: [],
    fieldSyntax: [],
    recommendations: []
  };
  
  // Extract the tool schema
  const toolPattern = new RegExp(`name:\\s*['"]${toolName}['"],[\\s\\S]*?},\\s*{`, 'g');
  const match = toolPattern.exec(content);
  
  if (!match) {
    result.status = 'NOT_FOUND';
    result.issues.push('Tool schema not found in server.ts');
    return result;
  }
  
  const toolSchema = match[0];
  
  // Extract examples from description
  const examplePattern = /e\.g\.,\s*"([^"]+)"/g;
  let exampleMatch;
  
  while ((exampleMatch = examplePattern.exec(toolSchema)) !== null) {
    result.examples.push(exampleMatch[1]);
  }
  
  // Determine the entity type for field mapping
  const entityType = toolName.replace('search_', '');
  const fieldMapping = API_FIELD_MAPPINGS[entityType];
  
  if (!fieldMapping) {
    result.status = 'NO_MAPPING';
    result.issues.push(`No field mapping found for ${entityType}`);
    return result;
  }
  
  // Validate field syntax in examples
  let validExamples = 0;
  let totalExamples = result.examples.length;
  
  for (const example of result.examples) {
    const fields = extractFieldsFromExample(example);
    let validFields = 0;
    
    for (const field of fields) {
      if (fieldMapping.fields.includes(field)) {
        validFields++;
        result.fieldSyntax.push({ field, status: 'VALID', example });
      } else {
        result.fieldSyntax.push({ field, status: 'INVALID', example });
        result.issues.push(`Invalid field '${field}' in example: "${example}"`);
      }
    }
    
    if (validFields === fields.length && fields.length > 0) {
      validExamples++;
    }
  }
  
  // Determine overall status
  if (totalExamples === 0) {
    result.status = 'NO_EXAMPLES';
    result.issues.push('No field syntax examples found');
  } else if (validExamples === totalExamples) {
    result.status = 'VALID';
  } else if (validExamples > 0) {
    result.status = 'PARTIAL';
  } else {
    result.status = 'INVALID';
  }
  
  // Generate recommendations
  if (result.status !== 'VALID') {
    result.recommendations.push(`Add examples using valid fields: ${fieldMapping.fields.join(', ')}`);
    result.recommendations.push(`Example patterns: ${fieldMapping.examplePatterns.slice(0, 3).join(', ')}`);
  }
  
  return result;
}

function extractFieldsFromExample(example) {
  const fieldPattern = /(\w+):/g;
  const fields = [];
  let match;
  
  while ((match = fieldPattern.exec(example)) !== null) {
    fields.push(match[1]);
  }
  
  return fields;
}

function generateAuditReport(results) {
  const reportPath = '/Users/alex/git/firewalla-mcp-server/docs/critical-tools-audit.md';
  
  let report = `# Critical Tools Schema Audit Report

## Summary

Audit of 5 critical search tools for field syntax compliance with Firewalla API documentation.

**Audit Date**: ${new Date().toISOString()}
**Tools Audited**: ${CRITICAL_TOOLS.length}

`;

  // Overall status summary
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  
  report += `### Status Overview\n`;
  for (const [status, count] of Object.entries(statusCounts)) {
    const emoji = status === 'VALID' ? '✅' : 
                  status === 'PARTIAL' ? '⚠️' : 
                  status === 'INVALID' ? '❌' : '❓';
    report += `- ${emoji} **${status}**: ${count} tools\n`;
  }
  report += '\n';
  
  // Detailed audit results
  report += `## Detailed Audit Results\n\n`;
  
  for (const result of results) {
    const statusEmoji = result.status === 'VALID' ? '✅' : 
                       result.status === 'PARTIAL' ? '⚠️' : 
                       result.status === 'INVALID' ? '❌' : '❓';
    
    report += `### ${statusEmoji} ${result.toolName}\n\n`;
    report += `**Status**: ${result.status}\n\n`;
    
    if (result.examples.length > 0) {
      report += `**Current Examples**:\n`;
      for (const example of result.examples) {
        report += `- \`"${example}"\`\n`;
      }
      report += '\n';
    }
    
    if (result.fieldSyntax.length > 0) {
      report += `**Field Syntax Analysis**:\n`;
      for (const field of result.fieldSyntax) {
        const fieldEmoji = field.status === 'VALID' ? '✅' : '❌';
        report += `- ${fieldEmoji} \`${field.field}\` in "${field.example}"\n`;
      }
      report += '\n';
    }
    
    if (result.issues.length > 0) {
      report += `**Issues Found**:\n`;
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
  
  // Next steps
  const needsWork = results.filter(r => r.status !== 'VALID');
  if (needsWork.length > 0) {
    report += `## Action Items\n\n`;
    report += `### Tools Requiring Updates (${needsWork.length})\n\n`;
    
    for (const tool of needsWork) {
      report += `#### ${tool.toolName}\n`;
      report += `- Priority: ${tool.status === 'INVALID' ? 'HIGH' : 'MEDIUM'}\n`;
      report += `- Issues: ${tool.issues.length}\n`;
      report += `- Action: Update schema examples with valid field syntax\n\n`;
    }
  }
  
  report += `## Next Steps\n\n`;
  report += `1. **Fix Invalid Schemas**: Update tools with invalid field syntax\n`;
  report += `2. **Add Missing Examples**: Add field syntax examples to tools without them\n`;
  report += `3. **Validate Changes**: Test updated schemas with live API\n`;
  report += `4. **Proceed to Batch 2**: Audit correlation tools once critical tools are fixed\n\n`;
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📝 Critical tools audit report generated: ${reportPath}\n`);
}

// Run audit
auditCriticalTools().catch(error => {
  console.error('💥 Audit failed:', error);
  process.exit(1);
});