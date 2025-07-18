#!/usr/bin/env node

/**
 * Simple API Authentication Test
 * Diagnose why we're getting HTML responses instead of JSON
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MSP_TOKEN = process.env.FIREWALLA_MSP_TOKEN;
const MSP_DOMAIN = process.env.FIREWALLA_MSP_ID;
const BOX_ID = process.env.FIREWALLA_BOX_ID;

console.log('🔍 API Authentication Test');
console.log('═'.repeat(50));
console.log(`MSP Domain: ${MSP_DOMAIN}`);
console.log(`Box ID: ${BOX_ID}`);
console.log(`Token: ${MSP_TOKEN ? MSP_TOKEN.substring(0, 8) + '...' : 'MISSING'}`);
console.log('═'.repeat(50));

async function testEndpoint(name, url, options = {}) {
  console.log(`\n📋 Testing: ${name}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await axios({
      method: options.method || 'GET',
      url,
      headers: {
        'Authorization': `Token ${MSP_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Firewalla-MCP-Test/1.0'
      },
      data: options.data,
      validateStatus: () => true // Accept any status code
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers['content-type']}`);
    
    if (response.headers['content-type']?.includes('text/html')) {
      console.log('❌ Got HTML response - checking content...');
      
      const html = response.data;
      if (html.includes('login') || html.includes('sign-in')) {
        console.log('🔐 Appears to be a login page - authentication failed');
      } else if (html.includes('<!DOCTYPE html>')) {
        console.log('📄 Got web UI page instead of API response');
      }
      
      // Check for specific patterns
      if (html.includes('Token')) {
        console.log('💡 Page mentions "Token" - might be auth related');
      }
      if (html.includes('401') || html.includes('403')) {
        console.log('🚫 Page contains auth error codes');
      }
      
    } else if (response.headers['content-type']?.includes('application/json')) {
      console.log('✅ Got JSON response');
      console.log('Data:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    } else {
      console.log('⚠️  Unknown content type');
      console.log('Data preview:', String(response.data).substring(0, 200) + '...');
    }
    
    return response;
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    if (error.code === 'ENOTFOUND') {
      console.log('🌐 DNS resolution failed - check MSP domain');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('🔌 Connection refused - server may be down');
    }
    return null;
  }
}

async function runTests() {
  // Test different endpoint variations
  const endpoints = [
    // Basic API endpoints
    {
      name: 'Base API (v2)',
      url: `https://${MSP_DOMAIN}/v2/`
    },
    {
      name: 'API Status',
      url: `https://${MSP_DOMAIN}/v2/status`
    },
    {
      name: 'Boxes List',
      url: `https://${MSP_DOMAIN}/v2/boxes`
    },
    {
      name: 'Specific Box',
      url: `https://${MSP_DOMAIN}/v2/boxes/${BOX_ID}`
    },
    {
      name: 'Box Rules',
      url: `https://${MSP_DOMAIN}/v2/boxes/${BOX_ID}/rules?limit=1`
    },
    // Test without /v2
    {
      name: 'Without v2 prefix',
      url: `https://${MSP_DOMAIN}/boxes/${BOX_ID}/rules?limit=1`
    },
    // Test API prefix
    {
      name: 'With api prefix',
      url: `https://${MSP_DOMAIN}/api/v2/boxes/${BOX_ID}/rules?limit=1`
    }
  ];
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.name, endpoint.url);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  // Test different auth formats
  console.log('\n\n🔐 Testing Authentication Formats:');
  
  const authFormats = [
    { name: 'Token (current)', header: `Token ${MSP_TOKEN}` },
    { name: 'Bearer', header: `Bearer ${MSP_TOKEN}` },
    { name: 'X-API-Key', headerName: 'X-API-Key', header: MSP_TOKEN }
  ];
  
  for (const auth of authFormats) {
    console.log(`\n📋 Testing: ${auth.name}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    if (auth.headerName) {
      headers[auth.headerName] = auth.header;
    } else {
      headers['Authorization'] = auth.header;
    }
    
    try {
      const response = await axios({
        method: 'GET',
        url: `https://${MSP_DOMAIN}/v2/boxes/${BOX_ID}/rules?limit=1`,
        headers,
        validateStatus: () => true
      });
      
      console.log(`Status: ${response.status}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      
      if (response.headers['content-type']?.includes('application/json')) {
        console.log('✅ Success with this auth format!');
        break;
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n\n💡 Diagnostics Summary:');
  console.log('1. Check if MSP domain is correct');
  console.log('2. Verify token is not expired');
  console.log('3. Ensure you\'re using the right API version');
  console.log('4. Check if API requires specific headers');
  console.log('5. Verify box ID belongs to your MSP account');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});