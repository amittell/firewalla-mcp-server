#!/usr/bin/env node

/**
 * Schema Extraction and Analysis Tool
 * Part of fractal management approach to fix all MCP server tool schemas
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract all tool schemas from server.ts and analyze field syntax examples
 */
async function extractToolSchemas() {
  console.log('🔍 PHASE 1: Extracting All Tool Schemas\n');
  
  const serverPath = '/Users/alex/git/firewalla-mcp-server/src/server.ts';
  const content = fs.readFileSync(serverPath, 'utf8');
  
  // Extract the tools array using regex pattern matching
  const toolsMatch = content.match(/tools:\s*\[([\s\S]*?)\]/);
  if (!toolsMatch) {
    throw new Error('Could not find tools array in server.ts');
  }
  
  const toolsContent = toolsMatch[1];
  
  // Split into individual tool objects
  const toolObjects = [];
  let depth = 0;
  let currentTool = '';
  let inTool = false;
  
  const lines = toolsContent.split('\n');
  
  for (const line of lines) {
    if (line.includes('name:') && line.includes("'") && depth === 0) {
      if (currentTool && inTool) {
        toolObjects.push(currentTool.trim());
        currentTool = '';
      }
      inTool = true;
      currentTool = line + '\n';
    } else if (inTool) {
      currentTool += line + '\n';
    }
    
    // Track object depth with braces
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    
    // End of tool object
    if (inTool && depth === 0 && line.includes('},')) {
      toolObjects.push(currentTool.trim());
      currentTool = '';
      inTool = false;
    }
  }
  
  // Add the last tool if not already added
  if (currentTool && inTool) {
    toolObjects.push(currentTool.trim());
  }
  
  console.log(`📊 Found ${toolObjects.length} tool schemas\n`);
  
  // Parse and categorize tools
  const analyzedTools = [];
  
  for (const toolStr of toolObjects) {
    const tool = parseToolFromString(toolStr);
    if (tool) {
      analyzedTools.push(tool);
    }
  }
  
  // Categorize by complexity and field syntax risk
  const categorized = categorizeTools(analyzedTools);
  
  // Generate comprehensive report
  generateSchemaReport(categorized);
  
  return categorized;
}

/**
 * Parse tool object from string representation
 */
function parseToolFromString(toolStr) {
  try {
    // Extract tool name
    const nameMatch = toolStr.match(/name:\s*['"]([^'"]+)['"]/);
    if (!nameMatch) return null;
    
    const name = nameMatch[1];
    
    // Extract description
    const descMatch = toolStr.match(/description:\s*['"]([^'"]+)['"]/);
    const description = descMatch ? descMatch[1] : '';
    
    // Extract query examples from descriptions
    const queryExamples = extractQueryExamples(toolStr);
    
    // Extract schema properties
    const hasQueryParam = toolStr.includes("query:");
    const hasLimitParam = toolStr.includes("limit:");
    const hasTimeRange = toolStr.includes("time_range:") || toolStr.includes("start_time:") || toolStr.includes("end_time:");
    
    // Determine complexity level
    const complexity = determineComplexity(name, hasQueryParam, queryExamples.length, toolStr);
    
    return {
      name,
      description,
      queryExamples,
      hasQueryParam,
      hasLimitParam,
      hasTimeRange,
      complexity,
      riskLevel: determineRiskLevel(name, queryExamples),
      rawSchema: toolStr
    };
  } catch (error) {
    console.error(`Error parsing tool: ${error.message}`);
    return null;
  }
}

/**
 * Extract query examples from tool description strings
 */
function extractQueryExamples(toolStr) {
  const examples = [];
  
  // Look for examples in description strings
  const examplePatterns = [
    /\(e\.g\.,\s*"([^"]+)"/g,
    /\(e\.g\.\s*"([^"]+)"/g,
    /example:\s*"([^"]+)"/gi,
    /"([^"]*:.*?)"/g  // General field:value patterns
  ];
  
  for (const pattern of examplePatterns) {
    let match;
    while ((match = pattern.exec(toolStr)) !== null) {
      const example = match[1];
      if (example.includes(':') && !examples.includes(example)) {
        examples.push(example);
      }
    }
  }
  
  return examples;
}

/**
 * Determine tool complexity level
 */
function determineComplexity(name, hasQueryParam, exampleCount, rawSchema) {
  // High complexity: Advanced search tools with complex query syntax
  if (name.startsWith('search_') && hasQueryParam && exampleCount > 0) {
    return 'HIGH';
  }
  
  // Medium complexity: Basic query tools or tools with time ranges
  if (hasQueryParam || rawSchema.includes('time_range') || rawSchema.includes('period:')) {
    return 'MEDIUM';
  }
  
  // Low complexity: Simple parameter tools
  return 'LOW';
}

/**
 * Determine field syntax risk level for schema examples
 */
function determineRiskLevel(name, examples) {
  // High risk: Tools with complex field syntax examples
  if (examples.some(ex => ex.includes('.') || ex.includes('_') || ex.includes('AND') || ex.includes('OR'))) {
    return 'HIGH';
  }
  
  // Medium risk: Tools with simple field examples
  if (examples.length > 0) {
    return 'MEDIUM';
  }
  
  // Low risk: No field examples
  return 'LOW';
}

/**
 * Categorize tools by complexity and risk
 */
function categorizeTools(tools) {
  const categories = {
    critical: [],      // High complexity + High risk
    important: [],     // High complexity + Medium risk, OR Medium complexity + High risk
    moderate: [],      // Medium complexity + Medium risk, OR Low complexity + High risk
    simple: []         // Low complexity + Low/Medium risk
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

/**
 * Generate comprehensive schema analysis report
 */
function generateSchemaReport(categorized) {
  const reportPath = '/Users/alex/git/firewalla-mcp-server/docs/tool-schema-analysis.md';
  
  let report = `# Tool Schema Analysis Report

## Overview

Comprehensive analysis of all MCP server tool schemas to identify field syntax risks and prioritize corrections.

**Total Tools Analyzed**: ${Object.values(categorized).flat().length}

## Priority Categories

### 🚨 CRITICAL (${categorized.critical.length} tools)
High complexity tools with high-risk field syntax examples. **Immediate attention required**.

`;

  // Add critical tools
  for (const tool of categorized.critical) {
    report += `#### ${tool.name}
- **Risk**: ${tool.riskLevel} | **Complexity**: ${tool.complexity}
- **Description**: ${tool.description}
- **Field Examples**: ${tool.queryExamples.join(', ')}
- **Query Param**: ${tool.hasQueryParam ? '✅' : '❌'}

`;
  }

  report += `### ⚠️ IMPORTANT (${categorized.important.length} tools)
High/medium complexity tools requiring validation.

`;

  // Add important tools
  for (const tool of categorized.important) {
    report += `#### ${tool.name}
- **Risk**: ${tool.riskLevel} | **Complexity**: ${tool.complexity}  
- **Field Examples**: ${tool.queryExamples.join(', ')}

`;
  }

  report += `### 📋 MODERATE (${categorized.moderate.length} tools)
Medium priority tools for systematic review.

`;

  // Add moderate tools
  for (const tool of categorized.moderate) {
    report += `#### ${tool.name}
- **Risk**: ${tool.riskLevel} | **Complexity**: ${tool.complexity}
- **Field Examples**: ${tool.queryExamples.join(', ')}

`;
  }

  report += `### ✅ SIMPLE (${categorized.simple.length} tools)
Low-risk tools requiring minimal validation.

`;

  // Add simple tools
  for (const tool of categorized.simple) {
    report += `#### ${tool.name}
- **Risk**: ${tool.riskLevel} | **Complexity**: ${tool.complexity}

`;
  }

  report += `
## Field Syntax Analysis

### High-Risk Examples Found
`;

  const allTools = Object.values(categorized).flat();
  const riskExamples = [];
  
  for (const tool of allTools) {
    for (const example of tool.queryExamples) {
      if (example.includes('.') || example.includes('_') || example.includes('AND')) {
        riskExamples.push(`- **${tool.name}**: "${example}"`);
      }
    }
  }
  
  report += riskExamples.join('\n');

  report += `

## Next Steps

1. **Phase 2 Batch 1**: Audit CRITICAL tools immediately
2. **Phase 2 Batch 2**: Validate IMPORTANT tools  
3. **Phase 2 Batch 3**: Review MODERATE tools
4. **Phase 3**: Apply corrections and validate

## Batch Execution Plan

### Batch 1 (Critical - Immediate)
${categorized.critical.map(t => `- ${t.name}`).join('\n')}

### Batch 2 (Important - High Priority)  
${categorized.important.map(t => `- ${t.name}`).join('\n')}

### Batch 3 (Moderate - Medium Priority)
${categorized.moderate.map(t => `- ${t.name}`).join('\n')}

### Batch 4 (Simple - Low Priority)
${categorized.simple.map(t => `- ${t.name}`).join('\n')}

Generated: ${new Date().toISOString()}
`;

  fs.writeFileSync(reportPath, report);
  console.log(`📝 Schema analysis report generated: ${reportPath}\n`);
  
  // Print summary to console
  console.log('📊 SUMMARY:');
  console.log(`🚨 Critical: ${categorized.critical.length} tools`);
  console.log(`⚠️  Important: ${categorized.important.length} tools`);
  console.log(`📋 Moderate: ${categorized.moderate.length} tools`);
  console.log(`✅ Simple: ${categorized.simple.length} tools`);
  console.log(`📝 Total: ${Object.values(categorized).flat().length} tools\n`);
  
  // Show critical tools for immediate attention
  if (categorized.critical.length > 0) {
    console.log('🚨 CRITICAL TOOLS (Immediate Attention):');
    for (const tool of categorized.critical) {
      console.log(`   - ${tool.name}: ${tool.queryExamples.join(', ')}`);
    }
    console.log('');
  }
}

// Run extraction
extractToolSchemas().catch(error => {
  console.error('💥 Extraction failed:', error);
  process.exit(1);
});