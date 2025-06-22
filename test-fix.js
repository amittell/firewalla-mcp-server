#!/usr/bin/env node

// Simple test script to verify the MCP server fix
const { spawn } = require('child_process');

console.log('Testing Firewalla MCP Server fix...\n');

// Create a test MCP request
const testRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "get_device_status",
    arguments: {}
  }
};

console.log('Test request:', JSON.stringify(testRequest, null, 2));
console.log('\nStarting MCP server...\n');

// Start the MCP server
const server = spawn('npm', ['run', 'mcp:start'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send the test request
server.stdin.write(JSON.stringify(testRequest) + '\n');

let output = '';
let errorOutput = '';

server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  errorOutput += data.toString();
  process.stderr.write(data);
});

// Wait a bit for the response
setTimeout(() => {
  console.log('\n--- Server Output ---');
  console.log(output);
  
  console.log('\n--- Analysis ---');
  if (output.includes('"error": true')) {
    console.log('❌ Error still present in response');
  } else if (output.includes('"devices"') || output.includes('"total_devices"')) {
    console.log('✅ Response looks good - contains device data');
  } else if (output.includes('API request failed')) {
    console.log('⚠️  API request failed - check credentials and configuration');
  } else {
    console.log('⚠️  Unexpected response format');
  }
  
  server.kill();
}, 5000);

server.on('close', (code) => {
  console.log(`\nServer process exited with code ${code}`);
  process.exit(0);
});