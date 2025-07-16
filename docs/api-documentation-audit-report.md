# Firewalla API Documentation Audit Report

**Date**: 2025-07-14
**Purpose**: Comprehensive comparison between official Firewalla API documentation and local API reference

## Executive Summary

This report documents all discrepancies found between the official Firewalla API documentation (docs.firewalla.net) and our local API reference (`/docs/firewalla-api-reference.md`). While most endpoints match, several critical differences were identified that could impact API functionality.

## Critical Discrepancies

### 1. Rule Management Endpoints

**Issue**: Request body parameters for pause/resume operations differ significantly

**Official Documentation**:
- `POST /v2/rules/:id/pause` - No request body documented
- `POST /v2/rules/:id/resume` - No request body documented

**Local Documentation & Implementation**:
- `POST /v2/rules/{id}/pause` - Includes request body:
  ```json
  {
    "duration": 60,
    "box": "box_gid_here"
  }
  ```
- `POST /v2/rules/{id}/resume` - Includes request body:
  ```json
  {
    "box": "box_gid_here"
  }
  ```

**Third-Party Research Findings**:
- Alternative approach suggests using `PATCH /v2/rules/{rule_id}` with:
  ```json
  {
    "status": "paused",
    "resumeTs": 1730447709  // Unix timestamp for auto-resume
  }
  ```
- This would align with the Rule data model which includes `status` and `resumeTs` fields

**Current Implementation Analysis**:
- Our `FirewallaClient.pauseRule()` sends `duration` and `box` as POST body parameters
- The `duration` parameter (1-1440 minutes) is validated in the implementation
- The `box` parameter uses the configured `boxId` from environment

**Impact**: Critical - Three different approaches documented:
1. Official docs: No parameters
2. Our implementation: `duration` and `box` in request body
3. Research suggests: `status` and `resumeTs` via PATCH

This discrepancy requires immediate testing to verify actual API behavior

### 2. Endpoint Path Notation

**Issue**: Inconsistent parameter notation

**Official Documentation**: Uses `:parameter` notation (e.g., `/v2/alarms/:gid/:aid`)
**Local Documentation**: Uses `{parameter}` notation (e.g., `/v2/alarms/{gid}/{aid}`)

**Impact**: Low - Both notations are understood, but consistency would be better

## Missing in Official Documentation

### 1. Comprehensive Data Models

The official documentation provides partial data models. Our local documentation includes:
- Complete TypeScript interfaces for all models
- Enum definitions for alarm types and statuses
- Detailed field descriptions and conditional logic
- Nested object structures

### 2. Error Response Formats

Official documentation lacks error response structures. Our local documentation provides:
- Standard error response format
- HTTP status code meanings
- Error handling best practices
- Retry strategies with exponential backoff

### 3. Query Syntax Guide

While official docs reference "Query basics", they don't provide:
- Complete query syntax examples
- Supported operators and wildcards
- Unit specifications (B, KB, MB, GB, TB)
- Complex query examples with AND/OR logic

### 4. Code Examples

Our local documentation provides more comprehensive examples:
- Node.js/Axios implementation patterns
- Error handling implementations
- Pagination handling
- Environment configuration

## Additional Endpoints in Local Documentation

Our local documentation includes endpoints that may not be officially documented:
- Detailed pagination patterns
- Rate limiting information
- Best practices for API usage

## Data Model Discrepancies

### Alarm Model
- Official: Basic structure provided
- Local: Complete TypeScript interface with all 16 alarm types enumerated

### Flow Model
- Official: Basic structure provided
- Local: Includes Host, Category, and Network nested interfaces

### Rule Model
- Official: Basic structure provided
- Local: Includes Target, Scope, Schedule, and Hit interfaces

## Complete API Endpoint Comparison

### Verified Endpoints (Match Official Docs)

| Resource | Endpoint | Method | Status |
|----------|----------|--------|--------|
| Alarms | `/v2/alarms` | GET | ✅ Match |
| Alarms | `/v2/alarms/:gid/:aid` | GET | ✅ Match |
| Alarms | `/v2/alarms/:gid/:aid` | DELETE | ✅ Match |
| Boxes | `/v2/boxes` | GET | ✅ Match |
| Devices | `/v2/devices` | GET | ✅ Match |
| Flows | `/v2/flows` | GET | ✅ Match |
| Rules | `/v2/rules` | GET | ✅ Match |
| Statistics | `/v2/stats/:type` | GET | ✅ Match |
| Statistics | `/v2/stats/simple` | GET | ✅ Match |
| Target Lists | `/v2/target-lists` | GET, POST | ✅ Match |
| Target Lists | `/v2/target-lists/:id` | GET, PATCH, DELETE | ✅ Match |
| Trends | `/v2/trends/:type` | GET | ✅ Match |

### Discrepant Endpoints

| Resource | Endpoint | Issue |
|----------|----------|-------|
| Rules | `/v2/rules/:id/pause` | POST body parameters undocumented |
| Rules | `/v2/rules/:id/resume` | POST body parameters undocumented |

## Recommendations

### 1. Immediate Action: Test Rule Pause/Resume
**Priority**: CRITICAL
- Create test script to verify actual API behavior:
  1. Test with no body parameters (as per official docs)
  2. Test with `duration` and `box` parameters (as per our implementation)
  3. Test PATCH with `status` and `resumeTs` (as per research)
- Document actual working approach
- Update implementation if necessary

### 2. Verify Required Parameters
**Priority**: HIGH
- Test if `box` parameter is actually required for pause/resume
- Confirm if omitting parameters causes failures
- Check if duration defaults to 60 minutes when not specified

### 3. Standardize Documentation
**Priority**: MEDIUM
- Update path parameter notation for consistency (prefer `{param}`)
- Add missing examples from GitHub repository
- Document actual vs documented behavior clearly

### 4. Preserve Local Enhancements
**Priority**: HIGH
- Keep TypeScript interfaces as they provide valuable type safety
- Maintain comprehensive error handling documentation
- Preserve detailed query syntax guide
- Keep pagination and rate limiting documentation

### 5. Contributing Back
**Priority**: LOW
- Consider submitting documentation improvements to Firewalla
- Share discovered undocumented features
- Propose TypeScript type definitions

## Action Items

1. **Immediate**: Test rule pause/resume endpoints to verify parameter requirements
2. **Short-term**: Update path parameter notation for consistency
3. **Long-term**: Consider contributing comprehensive documentation back to Firewalla

## Test Script for Verification

To resolve the pause/resume endpoint discrepancy, use this test script:

```javascript
// test-pause-resume.js
const axios = require('axios');

const config = {
  mspDomain: process.env.FIREWALLA_MSP_DOMAIN,
  token: process.env.FIREWALLA_MSP_TOKEN,
  boxId: process.env.FIREWALLA_BOX_ID,
  testRuleId: 'YOUR_TEST_RULE_ID' // Replace with actual rule ID
};

const api = axios.create({
  baseURL: `https://${config.mspDomain}/v2`,
  headers: {
    'Authorization': `Token ${config.token}`,
    'Content-Type': 'application/json'
  }
});

async function testPauseResume() {
  console.log('Testing pause/resume endpoints...\n');

  // Test 1: No body (as per official docs)
  try {
    console.log('Test 1: POST with no body');
    const res1 = await api.post(`/rules/${config.testRuleId}/pause`);
    console.log('✅ Success:', res1.data);
  } catch (err) {
    console.log('❌ Failed:', err.response?.status, err.response?.data);
  }

  // Test 2: With duration and box (as per our implementation)
  try {
    console.log('\nTest 2: POST with duration and box');
    const res2 = await api.post(`/rules/${config.testRuleId}/pause`, {
      duration: 30,
      box: config.boxId
    });
    console.log('✅ Success:', res2.data);
  } catch (err) {
    console.log('❌ Failed:', err.response?.status, err.response?.data);
  }

  // Test 3: PATCH with status/resumeTs (as per research)
  try {
    console.log('\nTest 3: PATCH with status and resumeTs');
    const resumeTs = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
    const res3 = await api.patch(`/rules/${config.testRuleId}`, {
      status: 'paused',
      resumeTs: resumeTs
    });
    console.log('✅ Success:', res3.data);
  } catch (err) {
    console.log('❌ Failed:', err.response?.status, err.response?.data);
  }

  // Test resume
  try {
    console.log('\nTest 4: Resume with box parameter');
    const res4 = await api.post(`/rules/${config.testRuleId}/resume`, {
      box: config.boxId
    });
    console.log('✅ Success:', res4.data);
  } catch (err) {
    console.log('❌ Failed:', err.response?.status, err.response?.data);
  }
}

testPauseResume().catch(console.error);
```text

Run with: `node test-pause-resume.js`

## Conclusion

While the official Firewalla documentation provides the authoritative API specification, our local documentation adds significant value through:
- More detailed data models with TypeScript interfaces
- Comprehensive error handling patterns
- Practical code examples with real-world use cases
- Detailed query syntax guides
- Rate limiting and pagination documentation

The most critical discrepancy is the rule management endpoints' request parameters. Our implementation includes `duration` and `box` parameters that aren't documented officially, which requires immediate verification through testing to ensure API compatibility and prevent potential failures in production.