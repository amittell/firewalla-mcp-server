#!/usr/bin/env node

// Direct stdio test for Firewalla MCP Server
// This shows the raw JSON-RPC communication

const { spawn } = require('child_process');

// Set environment variables if not already set
const env = {
  ...process.env,
  FIREWALLA_MSP_TOKEN: process.env.FIREWALLA_MSP_TOKEN || 'your_token_here',
  FIREWALLA_MSP_ID: process.env.FIREWALLA_MSP_ID || 'yourdomain.firewalla.net',
  FIREWALLA_BOX_ID: process.env.FIREWALLA_BOX_ID || 'your-box-id-here'
};

// Check if credentials are set
if (env.FIREWALLA_MSP_TOKEN === 'your_token_here') {
  console.error('Please set your Firewalla credentials in environment variables:');
  console.error('  export FIREWALLA_MSP_TOKEN="your_actual_token"');
  console.error('  export FIREWALLA_MSP_ID="yourdomain.firewalla.net"');
  console.error('  export FIREWALLA_BOX_ID="your-box-id"');
  process.exit(1);
}

// Start the MCP server
const server = spawn('node', ['dist/server.js'], { env });

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer
  
  lines.forEach(line => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('Raw output:', line);
      }
    }
  });
});

server.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

// Send initialization request
setTimeout(() => {
  const initRequest = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    },
    id: 1
  };
  
  console.log('Sending initialize request...');
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Send tool list request
setTimeout(() => {
  const listToolsRequest = {
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
    id: 2
  };
  
  console.log('\nSending tools/list request...');
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 2000);

// Call a tool
setTimeout(() => {
  const callToolRequest = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "get_active_alarms",
      arguments: {
        limit: 5
      }
    },
    id: 3
  };
  
  console.log('\nCalling get_active_alarms tool...');
  server.stdin.write(JSON.stringify(callToolRequest) + '\n');
}, 3000);

// Exit after 5 seconds
setTimeout(() => {
  console.log('\nTest completed!');
  server.kill();
  process.exit(0);
}, 5000);