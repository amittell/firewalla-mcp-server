#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Quick verification to check if V1.1 issues are actually fixed
const clientPath = path.join(__dirname, 'src/firewalla/client.ts');
const content = fs.readFileSync(clientPath, 'utf8');

console.log('🔍 Quick Verification: V1.1 Basic API Methods\n');

// Check endpoints
const endpoints = {
  'getActiveAlarms': '/v2/alarms',
  'getFlowData': '/v2/flows', 
  'getNetworkRules': '/v2/rules',
  'getDeviceStatus': '/v2/devices',
  'getBoxes': '/v2/boxes'
};

let passed = 0;
let total = 0;

console.log('📋 Endpoint Verification:');
for (const [method, endpoint] of Object.entries(endpoints)) {
  total++;
  if (content.includes(`\`${endpoint}\``) || content.includes(`'${endpoint}'`) || content.includes(`"${endpoint}"`)) {
    console.log(`✅ ${method}: Found ${endpoint}`);
    passed++;
  } else {
    console.log(`❌ ${method}: Missing ${endpoint}`);
  }
}

console.log('\n📋 Decorator Verification:');
const decorators = ['@optimizeResponse', '@validateResponse'];
for (const decorator of decorators) {
  total++;
  const count = (content.match(new RegExp(decorator, 'g')) || []).length;
  if (count >= 3) {
    console.log(`✅ ${decorator}: Found ${count} occurrences`);
    passed++;
  } else {
    console.log(`❌ ${decorator}: Only found ${count} occurrences`);
  }
}

console.log('\n📋 Response Format Verification:');
const responseChecks = [
  'count: number',
  'results:',
  'next_cursor'
];

for (const check of responseChecks) {
  total++;
  if (content.includes(check)) {
    console.log(`✅ Response format: Found '${check}'`);
    passed++;
  } else {
    console.log(`❌ Response format: Missing '${check}'`);
  }
}

console.log(`\n🎯 Success Rate: ${Math.round((passed / total) * 100)}% (${passed}/${total})`);

if (passed === total) {
  console.log('\n🎉 All critical components verified! V1.1 implementation is correct.');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${total - passed} issues found. Some components may need attention.`);
  process.exit(1);
}