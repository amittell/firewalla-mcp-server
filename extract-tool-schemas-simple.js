#!/usr/bin/env node

/**
 * Simplified Schema Extraction Tool
 * Extract tool names and descriptions from server.ts
 */

import fs from 'fs';

async function extractToolSchemas() {
  console.log('🔍 PHASE 1: Extracting Tool Schemas\n');
  
  const serverPath = '/Users/alex/git/firewalla-mcp-server/src/server.ts';
  const content = fs.readFileSync(serverPath, 'utf8');
  
  // Simple regex to find tool objects with name and description
  const toolPattern = /{\s*name:\s*['"]([^'"]+)['"],[\s\S]*?description:\s*['"]([^'"]*(?:\n[^'"]*)*?)['"][\s\S]*?}/g;
  
  const tools = [];
  let match;
  
  while ((match = toolPattern.exec(content)) !== null) {
    tools.push({
      name: match[1],
      description: match[2].replace(/\n\s*/g, ' ').trim(),
      complexity: determineComplexity(match[1], match[0]),
      riskLevel: determineRiskLevel(match[1], match[0])
    });
  }
  
  console.log(`📊 Found ${tools.length} tool schemas\n`);
  
  // Categorize tools
  const categorized = categorizeTools(tools);
  
  // Generate report
  generateReport(categorized);
  
  return categorized;
}

function determineComplexity(name, schema) {
  if (name.startsWith('search_') && schema.includes('query')) {
    return 'HIGH';
  }
  if (schema.includes('query') || schema.includes('time_range')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function determineRiskLevel(name, schema) {
  if (schema.includes('e.g.,') || schema.includes('example:')) {
    return 'HIGH';
  }
  if (schema.includes('query')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function categorizeTools(tools) {
  const categories = {
    critical: [],
    important: [],
    moderate: [],
    simple: []
  };
  
  for (const tool of tools) {
    if (tool.complexity === 'HIGH' && tool.riskLevel === 'HIGH') {
      categories.critical.push(tool);
    } else if (
      (tool.complexity === 'HIGH' && tool.riskLevel === 'MEDIUM') ||
      (tool.complexity === 'MEDIUM' && tool.riskLevel === 'HIGH')
    ) {
      categories.important.push(tool);
    } else if (
      (tool.complexity === 'MEDIUM' && tool.riskLevel === 'MEDIUM') ||
      (tool.complexity === 'LOW' && tool.riskLevel === 'HIGH')
    ) {
      categories.moderate.push(tool);
    } else {
      categories.simple.push(tool);
    }
  }
  
  return categories;
}

function generateReport(categorized) {
  const reportPath = '/Users/alex/git/firewalla-mcp-server/docs/tool-schema-analysis.md';
  
  let report = `# Tool Schema Analysis Report

## Overview

Total Tools Analyzed: ${Object.values(categorized).flat().length}

## Priority Categories

### 🚨 CRITICAL (${categorized.critical.length} tools)
High complexity tools with high-risk field syntax examples. **Immediate attention required**.

`;

  // Add tools by category
  for (const [category, tools] of Object.entries(categorized)) {
    const emoji = category === 'critical' ? '🚨' : 
                  category === 'important' ? '⚠️' : 
                  category === 'moderate' ? '📋' : '✅';
    const title = category.toUpperCase();
    
    if (category !== 'critical') {
      report += `\n### ${emoji} ${title} (${tools.length} tools)\n\n`;
    }
    
    for (const tool of tools) {
      report += `#### ${tool.name}\n`;
      report += `- **Risk**: ${tool.riskLevel} | **Complexity**: ${tool.complexity}\n`;
      report += `- **Description**: ${tool.description}\n\n`;
    }
  }
  
  report += `\n## Next Steps

1. **Phase 2 Batch 1**: Audit CRITICAL tools immediately
2. **Phase 2 Batch 2**: Validate IMPORTANT tools  
3. **Phase 2 Batch 3**: Review MODERATE tools
4. **Phase 3**: Apply corrections and validate

Generated: ${new Date().toISOString()}
`;

  fs.writeFileSync(reportPath, report);
  console.log(`📝 Schema analysis report generated: ${reportPath}\n`);
  
  // Print summary
  console.log('📊 SUMMARY:');
  console.log(`🚨 Critical: ${categorized.critical.length} tools`);
  console.log(`⚠️  Important: ${categorized.important.length} tools`);
  console.log(`📋 Moderate: ${categorized.moderate.length} tools`);
  console.log(`✅ Simple: ${categorized.simple.length} tools`);
  console.log(`📝 Total: ${Object.values(categorized).flat().length} tools\n`);
  
  // Show critical tools
  if (categorized.critical.length > 0) {
    console.log('🚨 CRITICAL TOOLS (Immediate Attention):');
    for (const tool of categorized.critical) {
      console.log(`   - ${tool.name}`);
    }
    console.log('');
  }
}

// Run extraction
extractToolSchemas().catch(error => {
  console.error('💥 Extraction failed:', error);
  process.exit(1);
});