#!/usr/bin/env node

const { ToolRegistry } = require('./dist/tools/registry');

async function testAllTools() {
  console.log('=== COMPREHENSIVE FIREWALLA MCP TOOLS VERIFICATION ===\n');
  
  const registry = new ToolRegistry();
  const allTools = registry.getAllTools();
  
  console.log(`Total tools registered: ${allTools.length}\n`);
  
  // Categorize tools
  const categories = {
    'Security Tools': [],
    'Network Tools': [],
    'Device Tools': [],
    'Rule Tools': [],
    'Analytics Tools': [],
    'Search Tools': [],
    'Bulk Operations': []
  };
  
  // Group tools by category
  allTools.forEach(tool => {
    const handler = registry.getHandler(tool.name);
    if (handler) {
      const category = handler.category;
      switch(category) {
        case 'security':
          categories['Security Tools'].push(tool.name);
          break;
        case 'network':
          categories['Network Tools'].push(tool.name);
          break;
        case 'device':
          categories['Device Tools'].push(tool.name);
          break;
        case 'rules':
          categories['Rule Tools'].push(tool.name);
          break;
        case 'analytics':
          categories['Analytics Tools'].push(tool.name);
          break;
        case 'search':
          categories['Search Tools'].push(tool.name);
          break;
        case 'bulk':
          categories['Bulk Operations'].push(tool.name);
          break;
      }
    }
  });
  
  // Display results
  let totalCount = 0;
  Object.entries(categories).forEach(([category, tools]) => {
    console.log(`${category} (${tools.length}):`);
    tools.forEach(tool => console.log(`  - ${tool}`));
    console.log('');
    totalCount += tools.length;
  });
  
  console.log(`\nTotal tools verified: ${totalCount}`);
  
  // Verify specific fixes mentioned
  console.log('\n=== VERIFICATION OF SPECIFIC FIXES ===\n');
  
  const criticalTools = [
    'pause_rule',
    'resume_rule',
    'get_active_alarms',
    'get_bandwidth_usage',
    'search_enhanced_cross_reference',
    'bulk_delete_alarms',
    'bulk_pause_rules',
    'bulk_resume_rules'
  ];
  
  criticalTools.forEach(toolName => {
    const handler = registry.getHandler(toolName);
    if (handler) {
      console.log(`✅ ${toolName}: Registered and available`);
    } else {
      console.log(`❌ ${toolName}: NOT FOUND`);
    }
  });
}

testAllTools().catch(console.error);