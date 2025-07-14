# Rule Pause/Resume Investigation - Action Plan

## Immediate Actions Required

### 1. Generate New Firewalla MSP Token
The current token is expired. To generate a new one:

1. **Access Firewalla MSP Portal**:
   - Navigate to: https://dn-k7evgj.firewalla.net
   - Login with your MSP credentials

2. **Create New Token**:
   - Go to Account Settings
   - Click "Create New Token"
   - Give it a descriptive name (e.g., "MCP Server API Token")
   - Copy the generated token immediately (you won't see it again)

3. **Update Environment File**:
   ```bash
   # Update .env file with new token
   FIREWALLA_MSP_TOKEN=your_new_token_here
   FIREWALLA_MSP_ID=dn-k7evgj.firewalla.net
   FIREWALLA_BOX_ID=330a28d1-a656-44fd-b808-d5910c157a2e
   ```

### 2. Complete Pause/Resume Testing
Once token is renewed, run:

```bash
# Test authentication
node scripts/test-api-auth.js

# Run comprehensive pause/resume tests
node scripts/test-rule-pause-resume-api.js
```

### 3. Analyze Results and Update Implementation
Based on test results, determine:
- Which approach actually works
- Whether our implementation discovered undocumented parameters
- If multiple approaches should be supported

## Implementation Improvements

### 1. Add Dynamic Box ID Discovery
```typescript
// In client initialization
async init() {
  const boxes = await this.getBoxes();
  const configuredBox = boxes.find(b => b.gid === this.config.boxId);
  if (!configuredBox) {
    throw new Error(`Box ${this.config.boxId} not found. Available: ${boxes.map(b => b.gid).join(', ')}`);
  }
  return configuredBox;
}
```

### 2. Add Authentication Validation
```typescript
// Add startup smoke test
async validateAuthentication() {
  try {
    const response = await this.api.head('/v2/boxes');
    if (response.status !== 200) {
      throw new Error('Authentication failed');
    }
  } catch (error) {
    throw new Error('Invalid auth format: expected Bearer token');
  }
}
```

### 3. Implement Robust Error Handling
```typescript
// Handle token expiration gracefully
interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && error.response?.data?.reason === 'expired') {
      throw new Error('API token expired. Please generate a new token in MSP portal.');
    }
    return Promise.reject(error);
  }
);
```

## Future Considerations

### 1. Token Management
- Implement token rotation workflow
- Add token expiration monitoring
- Consider automated token refresh if API supports it

### 2. API Documentation
- Update documentation with correct authentication format
- Document actual working pause/resume endpoints
- Add troubleshooting guide for common auth issues

### 3. Testing Framework
- Add integration tests for authentication
- Create mock server for testing without live API
- Add validation for API response formats

## Testing Validation Plan

After token renewal, validate:

1. **Authentication Works**: All endpoints return JSON, not HTML
2. **Box Operations**: CRUD operations on rules work correctly
3. **Pause/Resume**: Determine which of the three approaches works:
   - Official: `POST /rules/{id}/pause` (no body)
   - Our Implementation: `POST /rules/{id}/pause` with duration/box
   - Third-Party: `PATCH /rules/{id}` with status field

4. **Edge Cases**: Test with invalid rule IDs, duration limits, etc.

## Success Criteria

- [ ] New token generated and working
- [ ] Authentication format confirmed (Bearer vs Token)
- [ ] Box ID resolution working
- [ ] Pause/resume endpoints tested and documented
- [ ] Implementation updated with working approach
- [ ] Error handling improved for token issues
- [ ] Documentation updated with findings

## Risk Mitigation

1. **Token Security**: Store tokens securely, don't commit to git
2. **API Changes**: Monitor for API version changes affecting auth
3. **Rate Limiting**: Implement proper rate limiting to avoid token restrictions
4. **Fallback**: Consider multiple authentication methods if supported

## Timeline

- **Phase 1** (Immediate): Generate new token, test authentication
- **Phase 2** (Same day): Complete pause/resume endpoint testing
- **Phase 3** (Next day): Implement findings and improve error handling
- **Phase 4** (Following day): Update documentation and add safeguards

This systematic approach ensures we resolve the authentication issues and properly document the actual API behavior for rule pause/resume operations.