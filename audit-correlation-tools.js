#!/usr/bin/env node

/**
 * Correlation Tools Schema Audit
 * Audit search_cross_reference and enhanced correlation tools
 */

import fs from 'fs';

const CORRELATION_TOOLS = [
  'search_cross_reference'
];

// Enhanced correlation tools from advanced search handlers
const ENHANCED_CORRELATION_TOOLS = [
  'search_enhanced_cross_reference',
  'get_correlation_suggestions', 
  'search_flows_by_geography',
  'search_alarms_by_geography',
  'get_geographic_statistics'
];

const CORRELATION_FIELD_MAPPINGS = {
  common_correlation_fields: [
    'source_ip', 'destination_ip', 'device_ip', 'protocol', 'port', 
    'country', 'region', 'asn', 'user_agent', 'application', 'domain'
  ],
  geographic_fields: [
    'country', 'continent', 'region', 'city', 'asn', 'hosting_provider',
    'is_cloud', 'is_vpn', 'risk_score'
  ],
  correlation_parameters: [
    'correlationFields', 'correlationType', 'temporalWindow', 'networkScope',
    'enableScoring', 'enableFuzzyMatching', 'minimumScore', 'customWeights'
  ]
};

async function auditCorrelationTools() {
  console.log('🔍 PHASE 2 BATCH 2: Auditing Correlation Tools\n');
  
  const serverPath = '/Users/alex/git/firewalla-mcp-server/src/server.ts';
  const handlersPath = '/Users/alex/git/firewalla-mcp-server/src/tools/handlers/search.ts';
  
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  const handlersContent = fs.readFileSync(handlersPath, 'utf8');
  
  const results = [];
  
  // Audit basic correlation tool from server.ts
  for (const toolName of CORRELATION_TOOLS) {
    console.log(`📋 Auditing ${toolName} (server schema)...`);
    const result = auditBasicCorrelationTool(serverContent, toolName);
    results.push(result);
    console.log(`   Status: ${result.status}`);
  }
  
  // Audit enhanced correlation tools from handlers
  for (const toolName of ENHANCED_CORRELATION_TOOLS) {
    console.log(`📋 Auditing ${toolName} (handler implementation)...`);
    const result = auditEnhancedCorrelationTool(handlersContent, toolName);
    results.push(result);
    console.log(`   Status: ${result.status}`);
  }
  
  generateCorrelationAuditReport(results);
  return results;
}

function auditBasicCorrelationTool(content, toolName) {
  const result = {
    toolName,
    status: 'UNKNOWN',
    type: 'basic_correlation',
    issues: [],
    examples: [],
    correlationFields: [],
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
  
  // Extract correlation field examples
  const corrFieldPattern = /correlation.*?e\.g\.,\s*"([^"]+)"/g;
  let corrMatch;
  
  while ((corrMatch = corrFieldPattern.exec(toolSchema)) !== null) {
    const examples = corrMatch[1].split(',').map(ex => ex.trim().replace(/"/g, ''));
    result.examples.push(...examples);
  }
  
  // Validate correlation fields
  for (const example of result.examples) {
    const fields = example.split(',').map(f => f.trim().replace(/"/g, ''));
    for (const field of fields) {
      if (CORRELATION_FIELD_MAPPINGS.common_correlation_fields.includes(field)) {
        result.correlationFields.push({ field, status: 'VALID' });
      } else {
        result.correlationFields.push({ field, status: 'INVALID' });
        result.issues.push(`Invalid correlation field: ${field}`);
      }
    }
  }
  
  // Check for required parameters
  const hasRequiredParams = [
    'primary_query', 'secondary_queries', 'correlation_field', 'limit'
  ].every(param => toolSchema.includes(param));
  
  if (!hasRequiredParams) {
    result.issues.push('Missing required correlation parameters');
  }
  
  // Determine status
  if (result.issues.length === 0 && result.examples.length > 0) {
    result.status = 'VALID';
  } else if (result.examples.length > 0) {
    result.status = 'PARTIAL';
  } else {
    result.status = 'NO_EXAMPLES';
  }
  
  return result;
}

function auditEnhancedCorrelationTool(content, toolName) {
  const result = {
    toolName,
    status: 'UNKNOWN', 
    type: 'enhanced_correlation',
    issues: [],
    hasHandler: false,
    hasInterface: false,
    complexityFeatures: [],
    recommendations: []
  };
  
  // Check if handler class exists
  const handlerPattern = new RegExp(`class\\s+\\w*${toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}\\w*Handler`, 'i');
  result.hasHandler = handlerPattern.test(content);
  
  // Check if interface exists
  const interfacePattern = new RegExp(`interface\\s+\\w*${toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}\\w*Args`, 'i');
  result.hasInterface = interfacePattern.test(content);
  
  // Check for advanced correlation features
  const advancedFeatures = [
    'correlation_params', 'enableScoring', 'enableFuzzyMatching', 
    'temporalWindow', 'networkScope', 'geographic_filters'
  ];
  
  for (const feature of advancedFeatures) {
    if (content.includes(feature)) {
      result.complexityFeatures.push(feature);
    }
  }
  
  // Determine status based on implementation completeness
  if (result.hasHandler && result.hasInterface) {
    if (result.complexityFeatures.length >= 3) {
      result.status = 'ADVANCED';
    } else {
      result.status = 'BASIC';
    }
  } else if (result.hasHandler || result.hasInterface) {
    result.status = 'PARTIAL';
    result.issues.push('Incomplete implementation - missing handler or interface');
  } else {
    result.status = 'NOT_IMPLEMENTED';
    result.issues.push('No implementation found in handlers');
  }
  
  return result;
}

function generateCorrelationAuditReport(results) {
  const reportPath = '/Users/alex/git/firewalla-mcp-server/docs/correlation-tools-audit.md';
  
  let report = `# Correlation Tools Schema Audit Report

## Summary

Comprehensive audit of correlation and cross-reference search tools for multi-entity data correlation capabilities.

**Audit Date**: ${new Date().toISOString()}
**Tools Audited**: ${results.length}

`;

  // Status overview
  const basicTools = results.filter(r => r.type === 'basic_correlation');
  const enhancedTools = results.filter(r => r.type === 'enhanced_correlation');
  
  report += `### Tool Categories\n`;
  report += `- **Basic Correlation**: ${basicTools.length} tools\n`;
  report += `- **Enhanced Correlation**: ${enhancedTools.length} tools\n\n`;
  
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  
  report += `### Status Overview\n`;
  for (const [status, count] of Object.entries(statusCounts)) {
    const emoji = status === 'VALID' || status === 'ADVANCED' ? '✅' : 
                  status === 'BASIC' || status === 'PARTIAL' ? '⚠️' : 
                  status === 'NOT_IMPLEMENTED' ? '❌' : '❓';
    report += `- ${emoji} **${status}**: ${count} tools\n`;
  }
  report += '\n';
  
  // Basic correlation tools
  if (basicTools.length > 0) {
    report += `## Basic Correlation Tools\n\n`;
    
    for (const tool of basicTools) {
      const statusEmoji = tool.status === 'VALID' ? '✅' : 
                         tool.status === 'PARTIAL' ? '⚠️' : '❌';
      
      report += `### ${statusEmoji} ${tool.toolName}\n\n`;
      report += `**Status**: ${tool.status}\n`;
      report += `**Type**: Server Schema Definition\n\n`;
      
      if (tool.examples.length > 0) {
        report += `**Correlation Field Examples**:\n`;
        for (const example of tool.examples) {
          report += `- \`"${example}"\`\n`;
        }
        report += '\n';
      }
      
      if (tool.correlationFields.length > 0) {
        report += `**Field Validation**:\n`;
        for (const field of tool.correlationFields) {
          const fieldEmoji = field.status === 'VALID' ? '✅' : '❌';
          report += `- ${fieldEmoji} \`${field.field}\`\n`;
        }
        report += '\n';
      }
      
      if (tool.issues.length > 0) {
        report += `**Issues**:\n`;
        for (const issue of tool.issues) {
          report += `- ❌ ${issue}\n`;
        }
        report += '\n';
      }
    }
  }
  
  // Enhanced correlation tools
  if (enhancedTools.length > 0) {
    report += `## Enhanced Correlation Tools\n\n`;
    
    for (const tool of enhancedTools) {
      const statusEmoji = tool.status === 'ADVANCED' ? '✅' : 
                         tool.status === 'BASIC' ? '🔵' :
                         tool.status === 'PARTIAL' ? '⚠️' : '❌';
      
      report += `### ${statusEmoji} ${tool.toolName}\n\n`;
      report += `**Status**: ${tool.status}\n`;
      report += `**Type**: Handler Implementation\n`;
      report += `**Handler**: ${tool.hasHandler ? '✅' : '❌'}\n`;
      report += `**Interface**: ${tool.hasInterface ? '✅' : '❌'}\n\n`;
      
      if (tool.complexityFeatures.length > 0) {
        report += `**Advanced Features** (${tool.complexityFeatures.length}):\n`;
        for (const feature of tool.complexityFeatures) {
          report += `- ✅ \`${feature}\`\n`;
        }
        report += '\n';
      }
      
      if (tool.issues.length > 0) {
        report += `**Issues**:\n`;
        for (const issue of tool.issues) {
          report += `- ❌ ${issue}\n`;
        }
        report += '\n';
      }
    }
  }
  
  // Correlation field compatibility matrix
  report += `## Correlation Field Compatibility\n\n`;
  report += `### Supported Common Fields\n`;
  for (const field of CORRELATION_FIELD_MAPPINGS.common_correlation_fields) {
    report += `- \`${field}\`\n`;
  }
  
  report += `\n### Geographic Correlation Fields\n`;
  for (const field of CORRELATION_FIELD_MAPPINGS.geographic_fields) {
    report += `- \`${field}\`\n`;
  }
  
  report += `\n### Advanced Correlation Parameters\n`;
  for (const param of CORRELATION_FIELD_MAPPINGS.correlation_parameters) {
    report += `- \`${param}\`\n`;
  }
  
  // Recommendations
  const needsWork = results.filter(r => ['PARTIAL', 'NOT_IMPLEMENTED', 'NO_EXAMPLES'].includes(r.status));
  
  if (needsWork.length > 0) {
    report += `\n## Action Items\n\n`;
    
    for (const tool of needsWork) {
      report += `### ${tool.toolName}\n`;
      report += `- **Priority**: ${tool.status === 'NOT_IMPLEMENTED' ? 'HIGH' : 'MEDIUM'}\n`;
      report += `- **Type**: ${tool.type}\n`;
      
      if (tool.status === 'NO_EXAMPLES') {
        report += `- **Action**: Add correlation field examples to schema\n`;
      } else if (tool.status === 'NOT_IMPLEMENTED') {
        report += `- **Action**: Verify handler implementation exists\n`;
      } else {
        report += `- **Action**: Fix identified issues\n`;
      }
      report += '\n';
    }
  }
  
  report += `## Next Steps\n\n`;
  report += `1. **Complete Basic Correlation**: Ensure search_cross_reference has proper examples\n`;
  report += `2. **Validate Enhanced Tools**: Verify all handler implementations are accessible\n`;
  report += `3. **Test Correlation Logic**: Validate correlation field mappings work correctly\n`;
  report += `4. **Proceed to Batch 3**: Audit moderate complexity tools\n\n`;
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📝 Correlation tools audit report generated: ${reportPath}\n`);
  
  // Summary
  console.log('📊 CORRELATION AUDIT SUMMARY:');
  const advanced = results.filter(r => r.status === 'ADVANCED').length;
  const valid = results.filter(r => r.status === 'VALID').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const issues = results.filter(r => r.status === 'NOT_IMPLEMENTED').length;
  
  console.log(`✅ Advanced: ${advanced} tools`);
  console.log(`🔵 Valid: ${valid} tools`);
  console.log(`⚠️  Partial: ${partial} tools`);
  console.log(`❌ Issues: ${issues} tools`);
  console.log(`📝 Total: ${results.length} tools\n`);
}

// Run correlation audit
auditCorrelationTools().catch(error => {
  console.error('💥 Correlation audit failed:', error);
  process.exit(1);
});