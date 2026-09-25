# Firewalla API Documentation Audit Report

**Date**: 2025-07-14
**Purpose**: Comprehensive comparison between official Firewalla API documentation and local API reference

## Executive Summary

This report documents all discrepancies found between the official Firewalla API documentation (docs.firewalla.net) and our local API reference (`/docs/firewalla-api-reference.md`). While most endpoints match, several critical differences were identified that could impact API functionality.

## Critical Discrepancies

### 1. Rule Management Endpoints (resolved 2026-09-25)

**Issue**: Request body parameters for pause/resume operations differed

**Official Documentation**:
- `POST /v2/rules/:id/pause` - No request body documented
- `POST /v2/rules/:id/resume` - No request body documented

**Local Documentation & Implementation (before 1.5.0)**:
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

**Resolved 2026-09-25**: measured on disposable rules, the pause endpoint takes
no body and no duration. A `duration` in the body or the query string is
accepted and ignored, and the rule stays paused until resumed. `pauseRule` and
`resumeRule` now send no body. The undocumented `PATCH /v2/rules/{id}` was not
tested. See "Pause Rule" in `docs/firewalla-api-reference.md` for the
measurements.

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
| Rules | `/v2/rules/:id/pause` | Resolved 2026-09-25: no body, as the official docs say |
| Rules | `/v2/rules/:id/resume` | Resolved 2026-09-25: no body, as the official docs say |

## Recommendations

### 1. Test Rule Pause/Resume (done 2026-09-25)
Measured on disposable rules: pause and resume take no body. `box` is not
needed, and a `duration` is accepted and ignored. The client sends no body
since 1.5.0. `PATCH /v2/rules/{id}` with `status`/`resumeTs` was not tested.

### 2. Standardize Documentation
**Priority**: MEDIUM
- Update path parameter notation for consistency (prefer `{param}`)
- Add missing examples from GitHub repository
- Document actual vs documented behavior clearly

### 3. Preserve Local Enhancements
**Priority**: HIGH
- Keep TypeScript interfaces as they provide valuable type safety
- Maintain comprehensive error handling documentation
- Preserve detailed query syntax guide
- Keep pagination and rate limiting documentation

### 4. Contributing Back
**Priority**: LOW
- Consider submitting documentation improvements to Firewalla
- Share discovered undocumented features
- Propose TypeScript type definitions

## Action Items

1. **Done 2026-09-25**: Tested rule pause/resume; neither takes a body
2. **Short-term**: Update path parameter notation for consistency
3. **Long-term**: Consider contributing comprehensive documentation back to Firewalla

## Conclusion

While the official Firewalla documentation provides the authoritative API specification, our local documentation adds significant value through:
- More detailed data models with TypeScript interfaces
- Comprehensive error handling patterns
- Practical code examples with real-world use cases
- Detailed query syntax guides
- Rate limiting and pagination documentation

The most critical discrepancy was the rule pause/resume request body. Up to 1.4.1 the client sent `duration` and `box`, which the official docs do not list. Testing on 2026-09-25 found the API ignores both, so 1.5.0 sends no body.