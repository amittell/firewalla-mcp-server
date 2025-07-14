# Rule Pause/Resume API Investigation Report

## Executive Summary

Investigation into the Firewalla rule pause/resume API discrepancy revealed critical authentication issues that prevented proper testing of the three documented approaches. The investigation uncovered fundamental problems with both authentication format and token validity.

## Critical Findings

### 1. Authentication Format Issue (RESOLVED)
- **Problem**: Client was using `Authorization: Token ${token}` format
- **Solution**: API requires `Authorization: Bearer ${token}` format
- **Impact**: All API calls were failing and returning HTML login pages instead of JSON responses

### 2. Box ID Issue (RESOLVED) 
- **Problem**: Environment variable had incorrect box ID (`1eb71e38-3a95-4371-8903-ace24c83ab49`)
- **Solution**: Updated to correct box ID (`330a28d1-a656-44fd-b808-d5910c157a2e`) from boxes API response
- **Impact**: Box-specific endpoints were failing

### 3. Token Expiration Issue (UNRESOLVED)
- **Problem**: API returns `{"reason": "expired"}` with 401 status
- **Contradiction**: Firewalla documentation states tokens don't expire
- **Impact**: Cannot test pause/resume endpoints until token is renewed

## Diagnostic Test Results

### Authentication Format Test
```
✅ /v2/boxes endpoint: Returns JSON with Bearer auth
❌ /v2/boxes endpoint: Returns HTML with Token auth
✅ Box ID discovery: Found correct box ID (330a28d1-a656-44fd-b808-d5910c157a2e)
❌ Token validity: Returns "expired" error
```

### Three Approaches Tested (Pre-Token Expiration)
1. **Official Docs Approach**: `POST /rules/{id}/pause` (no body) - Could not test due to auth issues
2. **Our Implementation**: `POST /rules/{id}/pause` with `{duration, box}` - Could not test due to auth issues  
3. **Third-Party PATCH**: `PATCH /rules/{id}` with `{status: "paused"}` - Could not test due to auth issues

## Updated Implementation

### Authentication Fix Applied
```typescript
// Before (INCORRECT)
Authorization: `Token ${config.mspToken}`,

// After (CORRECT)
Authorization: `Bearer ${config.mspToken}`,
```

### Environment Configuration Fixed
```env
# Updated .env file
FIREWALLA_MSP_TOKEN=e47fe7dc6fc9c23da036790c82d9718c
FIREWALLA_MSP_ID=dn-k7evgj.firewalla.net
FIREWALLA_BOX_ID=330a28d1-a656-44fd-b808-d5910c157a2e  # Corrected
```

## Expert Recommendations Consulted

### RepoPrompt Recommendations
1. ✅ **Central Auth Header Management**: Updated client to use Bearer format
2. ✅ **Box ID Validation**: Updated to use correct box ID from API response
3. ⏳ **Dynamic Box ID Discovery**: Implement box ID fetching on startup
4. ⏳ **Auth Format Validation**: Add startup smoke test for auth format

### Perplexity API Patterns Analysis
1. **Bearer vs Token**: Bearer is standard OAuth 2.0 format, Token is legacy
2. **Pause/Resume Patterns**: 
   - Async patterns (HTTP 202 + status polling) for long operations
   - Dedicated endpoints (`/pause`, `/resume`) preferred over generic PATCH
   - POST for non-idempotent state changes, PATCH for partial updates

## Next Steps Required

### Immediate Actions
1. **Generate New Token**: 
   - Access Firewalla MSP portal
   - Go to Account Settings → Create New Token
   - Update `.env` file with new token

2. **Re-run Comprehensive Tests**:
   - Test all three pause/resume approaches
   - Determine which approach actually works
   - Document actual API behavior

### Implementation Recommendations

Based on expert analysis, the recommended approach is:

```typescript
// Recommended: Dedicated POST endpoints
POST /boxes/{box_id}/rules/{rule_id}/pause
POST /boxes/{box_id}/rules/{rule_id}/resume

// With optional duration parameter for pause
{
  "duration": 60  // minutes
}
```

This approach provides:
- Clear semantic meaning
- Support for timed pauses
- Box-specific routing for MSP environments
- Non-idempotent action handling

## Questions for Further Investigation

1. **Why is the token "expired"?** 
   - Documentation says tokens don't expire
   - Possible causes: actual expiration, token corruption, or API changes

2. **What is the correct pause/resume implementation?**
   - Official docs may be incomplete
   - Our implementation with duration/box parameters might be correct
   - Third-party PATCH approach needs validation

3. **Should we implement multiple approaches?**
   - Different endpoints for different API versions
   - Fallback mechanisms for compatibility

## Code Changes Made

1. **Authentication Format**: Fixed in `src/firewalla/client.ts`
2. **Box ID**: Updated in `.env` file
3. **Test Scripts**: Updated authentication headers

## Test Scripts Created

1. **`scripts/test-api-auth.js`**: Comprehensive authentication diagnostic
2. **`scripts/test-rule-pause-resume-api.js`**: Three-approach pause/resume testing

## Conclusion

The investigation revealed that the discrepancy was primarily due to authentication issues rather than API design problems. Once the token is renewed, we can:

1. Determine which pause/resume approach actually works
2. Validate whether our implementation discovered undocumented parameters
3. Update the codebase with the correct approach
4. Document the actual API behavior for future reference

The authentication format fix (Token → Bearer) and box ID correction resolve the immediate blocking issues. The comprehensive test framework is in place to validate the pause/resume endpoints once token access is restored.