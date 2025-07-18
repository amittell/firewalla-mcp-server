#!/usr/bin/env node

/**
 * Comprehensive test script to investigate Firewalla rule pause/resume API behavior
 * Tests three different documented approaches to determine what actually works
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

if (!MSP_TOKEN || !MSP_DOMAIN || !BOX_ID) {
  console.error('❌ Missing required environment variables');
  console.error('Required: FIREWALLA_MSP_TOKEN, FIREWALLA_MSP_ID, FIREWALLA_BOX_ID');
  process.exit(1);
}

const BASE_URL = `https://${MSP_DOMAIN}/v2`;

// Configure axios instance with same headers as production client
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${MSP_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  }
});

// Add request/response logging
api.interceptors.request.use(config => {
  console.log(`\n📤 ${config.method?.toUpperCase()} ${config.url}`);
  if (config.data) {
    console.log('Request Body:', JSON.stringify(config.data, null, 2));
  }
  return config;
});

api.interceptors.response.use(
  response => {
    console.log(`✅ Status: ${response.status}`);
    
    // Check if response is HTML instead of JSON
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      console.log('⚠️  WARNING: Received HTML response instead of JSON!');
      console.log('Content-Type:', contentType);
      console.log('Response preview:', response.data.substring(0, 200) + '...');
      
      // Check for common redirect/auth issues
      if (response.data.includes('login') || response.data.includes('sign-in')) {
        console.log('🔐 Appears to be a login page - authentication may have failed');
      }
    } else {
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
    return response;
  },
  error => {
    console.log(`❌ Error: ${error.response?.status || 'Network Error'}`);
    if (error.response?.data) {
      const contentType = error.response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        console.log('⚠️  HTML Error Response - Preview:', error.response.data.substring(0, 200) + '...');
      } else {
        console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
      }
    } else {
      console.log('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Test approaches
const TestApproaches = {
  // Approach 1: Official documentation - POST with no body
  OFFICIAL: {
    name: 'Official Docs Approach',
    pause: {
      method: 'POST',
      url: (ruleId) => `/rules/${ruleId}/pause`,
      data: null
    },
    resume: {
      method: 'POST',
      url: (ruleId) => `/rules/${ruleId}/resume`,
      data: null
    }
  },

  // Approach 2: Our implementation - POST with duration and box
  OUR_IMPLEMENTATION: {
    name: 'Our Implementation',
    pause: {
      method: 'POST',
      url: (ruleId) => `/rules/${ruleId}/pause`,
      data: { duration: 60, box: BOX_ID }
    },
    resume: {
      method: 'POST',
      url: (ruleId) => `/rules/${ruleId}/resume`,
      data: { box: BOX_ID }
    }
  },

  // Approach 3: Third-party research - PATCH with status
  THIRD_PARTY: {
    name: 'Third Party PATCH Approach',
    pause: {
      method: 'PATCH',
      url: (ruleId) => `/rules/${ruleId}`,
      data: {
        status: 'paused',
        resumeTs: Date.now() + (60 * 60 * 1000) // 1 hour from now
      }
    },
    resume: {
      method: 'PATCH',
      url: (ruleId) => `/rules/${ruleId}`,
      data: { status: 'active' }
    }
  },

  // Additional variations to test
  VARIATIONS: [
    {
      name: 'POST with box only (no duration)',
      pause: {
        method: 'POST',
        url: (ruleId) => `/rules/${ruleId}/pause`,
        data: { box: BOX_ID }
      }
    },
    {
      name: 'POST with duration only (no box)',
      pause: {
        method: 'POST',
        url: (ruleId) => `/rules/${ruleId}/pause`,
        data: { duration: 60 }
      }
    },
    {
      name: 'Box-specific endpoint with POST',
      pause: {
        method: 'POST',
        url: (ruleId) => `/boxes/${BOX_ID}/rules/${ruleId}/pause`,
        data: null
      }
    },
    {
      name: 'Box-specific endpoint with duration',
      pause: {
        method: 'POST',
        url: (ruleId) => `/boxes/${BOX_ID}/rules/${ruleId}/pause`,
        data: { duration: 60 }
      }
    }
  ]
};

// Helper functions
async function getExistingRules() {
  console.log('\n🔍 Fetching existing rules...');
  try {
    const response = await api.get(`/boxes/${BOX_ID}/rules`, {
      params: { limit: 10 }
    });
    return response.data.results || [];
  } catch (error) {
    console.error('Failed to fetch rules:', error.message);
    return [];
  }
}

async function getRuleDetails(ruleId) {
  try {
    const response = await api.get(`/boxes/${BOX_ID}/rules/${ruleId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to get rule details for ${ruleId}:`, error.message);
    return null;
  }
}

async function createTestRule() {
  console.log('\n🔨 Creating test rule...');
  try {
    const response = await api.post(`/boxes/${BOX_ID}/rules`, {
      action: 'block',
      target: 'domain',
      target_value: 'test-pause-resume.example.com',
      name: 'Test Rule for Pause/Resume API Investigation',
      enabled: true
    });
    
    // Check if we got JSON response
    if (typeof response.data === 'object' && response.data.id) {
      console.log('✅ Created test rule:', response.data.id);
      return response.data;
    } else {
      console.error('❌ Failed to create rule - unexpected response format');
      console.log('Response type:', typeof response.data);
      return null;
    }
  } catch (error) {
    console.error('Failed to create test rule:', error.message);
    return null;
  }
}

async function deleteTestRule(ruleId) {
  try {
    await api.delete(`/boxes/${BOX_ID}/rules/${ruleId}`);
    console.log('🗑️  Deleted test rule:', ruleId);
  } catch (error) {
    console.error('Failed to delete test rule:', error.message);
  }
}

async function testApproach(approach, ruleId, operation = 'pause') {
  console.log(`\n🧪 Testing ${approach.name} - ${operation.toUpperCase()}`);
  console.log('━'.repeat(60));

  const config = approach[operation];
  if (!config) {
    console.log('⚠️  No configuration for this operation');
    return { success: false, error: 'No configuration' };
  }

  try {
    const url = typeof config.url === 'function' ? config.url(ruleId) : config.url;
    const response = await api({
      method: config.method,
      url: url,
      data: config.data
    });

    // Check if the operation actually worked
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
    const ruleDetails = await getRuleDetails(ruleId);
    
    return {
      success: true,
      response: response.data,
      status: response.status,
      ruleState: ruleDetails?.status || ruleDetails?.state || 'unknown',
      actuallyPaused: ruleDetails?.status === 'paused' || ruleDetails?.state === 'paused'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      errorData: error.response?.data
    };
  }
}

async function runComprehensiveTests() {
  console.log('🚀 Starting Comprehensive Rule Pause/Resume API Tests');
  console.log('═'.repeat(60));
  console.log(`MSP Domain: ${MSP_DOMAIN}`);
  console.log(`Box ID: ${BOX_ID}`);
  console.log('═'.repeat(60));

  // Get or create a test rule
  let testRule = null;
  const existingRules = await getExistingRules();
  
  // Look for an existing test rule
  const existingTestRule = existingRules.find(r => 
    r.name?.includes('Test Rule for Pause/Resume') || 
    r.target_value === 'test-pause-resume.example.com'
  );

  if (existingTestRule) {
    console.log('✅ Found existing test rule:', existingTestRule.id);
    testRule = existingTestRule;
    // Ensure it's resumed before testing
    await testApproach(TestApproaches.OUR_IMPLEMENTATION, testRule.id, 'resume');
  } else {
    testRule = await createTestRule();
    if (!testRule) {
      console.error('❌ Failed to create test rule. Exiting.');
      return;
    }
  }

  const results = {
    pause: {},
    resume: {},
    variations: []
  };

  // Test main approaches - PAUSE
  console.log('\n\n📋 TESTING PAUSE OPERATIONS');
  console.log('═'.repeat(60));

  for (const [key, approach] of Object.entries(TestApproaches)) {
    if (key === 'VARIATIONS') continue;
    results.pause[key] = await testApproach(approach, testRule.id, 'pause');
    
    // If pause was successful, test resume
    if (results.pause[key].success && results.pause[key].actuallyPaused) {
      console.log('\n🔄 Rule was paused, testing resume...');
      results.resume[key] = await testApproach(approach, testRule.id, 'resume');
    }
    
    // Ensure rule is active for next test
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Test variations
  console.log('\n\n📋 TESTING VARIATIONS');
  console.log('═'.repeat(60));

  for (const variation of TestApproaches.VARIATIONS) {
    const result = await testApproach(variation, testRule.id, 'pause');
    results.variations.push({
      name: variation.name,
      result
    });
    
    // Ensure rule is active for next test
    if (result.success && result.actuallyPaused) {
      await testApproach(TestApproaches.OUR_IMPLEMENTATION, testRule.id, 'resume');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary Report
  console.log('\n\n📊 TEST RESULTS SUMMARY');
  console.log('═'.repeat(60));

  console.log('\n🔸 PAUSE OPERATIONS:');
  for (const [key, result] of Object.entries(results.pause)) {
    const approach = TestApproaches[key];
    console.log(`\n${approach.name}:`);
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  Actually Paused: ${result.actuallyPaused ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.response) {
      console.log(`  Response preview:`, JSON.stringify(result.response).substring(0, 100));
    }
  }

  console.log('\n\n🔸 RESUME OPERATIONS:');
  for (const [key, result] of Object.entries(results.resume)) {
    const approach = TestApproaches[key];
    console.log(`\n${approach.name}:`);
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log('\n\n🔸 VARIATIONS:');
  for (const variation of results.variations) {
    console.log(`\n${variation.name}:`);
    console.log(`  Success: ${variation.result.success ? '✅' : '❌'}`);
    console.log(`  Actually Paused: ${variation.result.actuallyPaused ? '✅' : '❌'}`);
    if (variation.result.error) {
      console.log(`  Error: ${variation.result.error}`);
    }
  }

  // Analysis
  console.log('\n\n🔍 ANALYSIS:');
  console.log('━'.repeat(60));

  // Find what worked
  const workingPauseApproaches = Object.entries(results.pause)
    .filter(([_, result]) => result.success && result.actuallyPaused)
    .map(([key, _]) => TestApproaches[key].name);

  const workingVariations = results.variations
    .filter(v => v.result.success && v.result.actuallyPaused)
    .map(v => v.name);

  console.log('\n✅ Working Pause Approaches:');
  if (workingPauseApproaches.length > 0) {
    workingPauseApproaches.forEach(name => console.log(`  - ${name}`));
  } else {
    console.log('  None of the main approaches worked!');
  }

  if (workingVariations.length > 0) {
    console.log('\n✅ Working Variations:');
    workingVariations.forEach(name => console.log(`  - ${name}`));
  }

  // Clean up
  if (testRule && !existingTestRule) {
    console.log('\n\n🧹 Cleaning up...');
    await deleteTestRule(testRule.id);
  }

  console.log('\n\n✅ Test complete!');
}

// Run the tests
runComprehensiveTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});