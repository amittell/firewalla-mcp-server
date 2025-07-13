#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the registry file to count tools
const registryPath = path.join(__dirname, 'src/tools/registry.ts');
const content = fs.readFileSync(registryPath, 'utf8');

// Count handler registrations
const handlerMatches = content.match(/this\.register\(new \w+Handler\(\)\)/g) || [];
console.log(`Total tools registered: ${handlerMatches.length}`);

// Extract categories from comments
const categoryMatches = content.match(/\/\/ .+ tools \(\d+ handlers?\)/g) || [];
console.log('\nTools by category:');
categoryMatches.forEach(category => {
  console.log(`  ${category}`);
});

// List all handler names
console.log('\nAll registered handlers:');
handlerMatches.forEach((match, index) => {
  const handlerName = match.match(/new (\w+Handler)/)[1];
  console.log(`  ${index + 1}. ${handlerName}`);
});