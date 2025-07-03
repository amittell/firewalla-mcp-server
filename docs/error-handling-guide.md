# Firewalla MCP Server - Error Handling Guide

This guide provides comprehensive documentation for error handling patterns, response formats, and troubleshooting techniques used throughout the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Error Response Format](#error-response-format)
- [Error Types](#error-types)
- [HTTP Status Codes](#http-status-codes)
- [Validation Errors](#validation-errors)
- [Common Error Scenarios](#common-error-scenarios)
- [Error Recovery Strategies](#error-recovery-strategies)
- [Best Practices](#best-practices)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Tool-Specific Errors](#tool-specific-errors)
- [Debugging Techniques](#debugging-techniques)

## Overview

The Firewalla MCP Server implements a comprehensive error handling system designed to provide clear, actionable error messages while maintaining security. All errors follow a standardized format to ensure consistent handling across all tools and integrations.

### Error Handling Philosophy

1. **Clarity**: Error messages are descriptive and actionable
2. **Security**: Sensitive information is not exposed in error messages
3. **Consistency**: All tools use the same error format and patterns
4. **Context**: Errors include relevant context for debugging
5. **Recovery**: Errors suggest recovery strategies when possible

## Error Response Format

### Standard Error Response

All error responses follow this standardized format:

```typescript
interface StandardError {
  error: true;                          // Always true for error responses
  message: string;                      // Human-readable error description
  tool: string;                         // Name of the tool that generated the error
  errorType: ErrorType;                 // Specific error category
  details?: Record<string, unknown>;    // Additional error context
  validation_errors?: string[];         // Array of validation error messages
  timestamp?: string;                   // ISO timestamp when error occurred
  context?: {                          // Optional request context
    endpoint?: string;                  // API endpoint that failed
    parameters?: Record<string, unknown>; // Request parameters (sanitized)
    userAgent?: string;                 // User agent string
    requestId?: string;                 // Unique request identifier
  };
}
```

### Example Error Response

```json
{
  "error": true,
  "message": "Query contains potentially dangerous content",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Query contains potentially dangerous content"
  ],
  "timestamp": "2024-01-15T10:30:45.123Z",
  "context": {
    "endpoint": "/v2/boxes/abc123/flows",
    "parameters": {
      "query": "severity:high",
      "limit": 100
    },
    "requestId": "req_7f8a9b2c"
  }
}
```

### MCP Protocol Wrapper

Error responses are wrapped in the MCP protocol format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...error object...}"
    }
  ],
  "isError": true
}
```

## Error Types

The server categorizes errors into specific types for better handling:

### ErrorType Enumeration

```typescript
enum ErrorType {
  VALIDATION_ERROR = 'validation_error',      // Parameter validation failures
  AUTHENTICATION_ERROR = 'authentication_error', // Auth/credentials issues
  API_ERROR = 'api_error',                    // Firewalla API errors
  NETWORK_ERROR = 'network_error',            // Network connectivity issues
  TIMEOUT_ERROR = 'timeout_error',            // Request timeout errors
  RATE_LIMIT_ERROR = 'rate_limit_error',      // API rate limiting
  CACHE_ERROR = 'cache_error',                // Cache operation failures
  CORRELATION_ERROR = 'correlation_error',    // Cross-reference failures
  SEARCH_ERROR = 'search_error',              // Search operation failures
  UNKNOWN_ERROR = 'unknown_error'             // Unexpected errors
}
```

### Error Type Examples

#### Validation Error
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "get_active_alarms",
  "errorType": "validation_error",
  "validation_errors": ["limit is required"],
  "timestamp": "2024-01-15T10:30:45Z"
}
```

#### Authentication Error
```json
{
  "error": true,
  "message": "Authentication failed. Please check your MSP token.",
  "tool": "search_flows",
  "errorType": "authentication_error",
  "context": {
    "endpoint": "/v2/boxes/abc123/flows"
  },
  "timestamp": "2024-01-15T10:30:45Z"
}
```

#### API Error
```json
{
  "error": true,
  "message": "Firewalla API returned an error: Box not found",
  "tool": "get_device_status",
  "errorType": "api_error",
  "details": {
    "apiStatusCode": 404,
    "apiResponse": "Box with ID 'invalid123' not found"
  },
  "timestamp": "2024-01-15T10:30:45Z"
}
```

#### Rate Limit Error
```json
{
  "error": true,
  "message": "API rate limit exceeded. Please wait before making additional requests.",
  "tool": "search_alarms",
  "errorType": "rate_limit_error",
  "details": {
    "retryAfter": 60,
    "rateLimit": "100 requests per minute"
  },
  "timestamp": "2024-01-15T10:30:45Z"
}
```

## HTTP Status Codes

The server maps HTTP status codes to appropriate error types and messages:

### Status Code Mapping

| HTTP Code | Error Type | Description | Common Causes |
|-----------|------------|-------------|---------------|
| 400 | validation_error | Bad Request | Invalid parameters, malformed queries |
| 401 | authentication_error | Unauthorized | Invalid or expired MSP token |
| 403 | authentication_error | Forbidden | Insufficient permissions |
| 404 | api_error | Not Found | Invalid box ID, non-existent resource |
| 409 | api_error | Conflict | Resource state conflict |
| 429 | rate_limit_error | Too Many Requests | API rate limit exceeded |
| 500 | api_error | Internal Server Error | Firewalla API issues |
| 502 | network_error | Bad Gateway | MSP service unavailable |
| 503 | network_error | Service Unavailable | Temporary service outage |
| 504 | timeout_error | Gateway Timeout | Request timeout |

### Status Code Examples

#### 400 Bad Request
```json
{
  "error": true,
  "message": "Invalid query syntax: unmatched parentheses",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Unmatched parentheses in query"
  ]
}
```

#### 401 Unauthorized
```json
{
  "error": true,
  "message": "Authentication failed. Please check your MSP token.",
  "tool": "get_active_alarms",
  "errorType": "authentication_error",
  "details": {
    "hint": "Verify FIREWALLA_MSP_TOKEN environment variable is set correctly"
  }
}
```

#### 404 Not Found
```json
{
  "error": true,
  "message": "Box not found: invalid-box-id",
  "tool": "get_device_status",
  "errorType": "api_error",
  "details": {
    "boxId": "invalid-box-id",
    "hint": "Verify FIREWALLA_BOX_ID environment variable is correct"
  }
}
```

## Validation Errors

The server performs extensive parameter validation to ensure data integrity and security.

### Parameter Validation

#### Required Parameter Missing
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": ["limit is required"]
}
```

#### Invalid Parameter Type
```json
{
  "error": true,
  "message": "limit must be a number, got string",
  "tool": "get_active_alarms",
  "errorType": "validation_error",
  "validation_errors": [
    "limit must be a number, got string"
  ]
}
```

#### Parameter Out of Range
```json
{
  "error": true,
  "message": "limit is too large (got 50000, maximum: 10000 for performance reasons)",
  "tool": "search_devices",
  "errorType": "validation_error",
  "validation_errors": [
    "limit exceeds system limits to control result set size and prevent memory issues (got 50000, maximum: 10000)"
  ]
}
```

### Query Validation

#### Invalid Query Syntax
```json
{
  "error": true,
  "message": "Invalid query syntax",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Unmatched parentheses in query",
    "Unmatched double quotes in query"
  ]
}
```

#### Dangerous Query Content
```json
{
  "error": true,
  "message": "Query contains potentially dangerous content",
  "tool": "search_alarms",
  "errorType": "validation_error",
  "validation_errors": [
    "Query contains potentially dangerous content"
  ]
}
```

#### Invalid Field Name
```json
{
  "error": true,
  "message": "Field 'invalid_field' is not allowed. Valid fields: source_ip, destination_ip, protocol, severity",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Field 'invalid_field' is not allowed"
  ]
}
```

### Cursor Validation

#### Invalid Cursor Format
```json
{
  "error": true,
  "message": "Failed to decode cursor: Invalid cursor format",
  "tool": "get_device_status",
  "errorType": "validation_error",
  "validation_errors": [
    "Failed to decode cursor: Invalid cursor format"
  ]
}
```

#### Corrupted Cursor Data
```json
{
  "error": true,
  "message": "Failed to decode cursor: Invalid cursor offset",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Invalid cursor offset"
  ]
}
```

## Common Error Scenarios

### Configuration Errors

#### Missing Environment Variables
```json
{
  "error": true,
  "message": "Missing required configuration: FIREWALLA_MSP_TOKEN",
  "tool": "firewalla_client",
  "errorType": "authentication_error",
  "details": {
    "requiredVars": ["FIREWALLA_MSP_TOKEN", "FIREWALLA_MSP_ID", "FIREWALLA_BOX_ID"]
  }
}
```

#### Invalid Box Configuration
```json
{
  "error": true,
  "message": "Invalid box configuration: Box ID format is invalid",
  "tool": "get_active_alarms",
  "errorType": "authentication_error",
  "details": {
    "hint": "Box ID should be a UUID format like '1eb71e38-3a95-4371-8903-ace24c83ab49'"
  }
}
```

### Network and Connectivity

#### Connection Timeout
```json
{
  "error": true,
  "message": "Request timeout: Failed to connect to Firewalla MSP API",
  "tool": "search_flows",
  "errorType": "timeout_error",
  "details": {
    "timeout": 30000,
    "endpoint": "https://yourdomain.firewalla.net/v2/boxes/abc123/flows"
  }
}
```

#### Network Unavailable
```json
{
  "error": true,
  "message": "Network error: Unable to reach Firewalla MSP API",
  "tool": "get_device_status",
  "errorType": "network_error",
  "details": {
    "networkError": "ENOTFOUND",
    "host": "yourdomain.firewalla.net"
  }
}
```

### Data Processing Errors

#### Large Dataset Timeout
```json
{
  "error": true,
  "message": "Query timeout: Dataset too large for processing",
  "tool": "search_flows",
  "errorType": "timeout_error",
  "details": {
    "suggestion": "Use more specific filters or smaller limit values"
  }
}
```

#### Memory Limit Exceeded
```json
{
  "error": true,
  "message": "Memory limit exceeded during data processing",
  "tool": "get_bandwidth_usage",
  "errorType": "api_error",
  "details": {
    "suggestion": "Reduce the time range or limit parameter"
  }
}
```

## Error Recovery Strategies

### Automatic Retry Logic

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry validation errors
      if (error.errorType === 'validation_error') {
        throw error;
      }
      
      // Don't retry authentication errors
      if (error.errorType === 'authentication_error') {
        throw error;
      }
      
      // Retry network and timeout errors
      if (attempt < maxRetries && 
          (error.errorType === 'network_error' || 
           error.errorType === 'timeout_error' ||
           error.errorType === 'rate_limit_error')) {
        
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError!;
}
```

### Rate Limit Handling

```typescript
async function handleRateLimit<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error.errorType === 'rate_limit_error') {
      const retryAfter = error.details?.retryAfter || 60;
      
      console.log(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      
      // Retry the operation
      return await operation();
    }
    throw error;
  }
}
```

### Cursor Reset Strategy

```typescript
async function paginateWithCursorRecovery<T>(
  searchFunction: (params: any) => Promise<any>,
  query: string,
  limit: number
): Promise<T[]> {
  let cursor: string | undefined;
  let allResults: T[] = [];
  
  while (true) {
    try {
      const response = await searchFunction({ query, limit, cursor });
      allResults.push(...response.results);
      
      if (!response.next_cursor) break;
      cursor = response.next_cursor;
      
    } catch (error) {
      if (error.errorType === 'validation_error' && 
          error.message.includes('cursor')) {
        
        console.log('Invalid cursor detected, restarting pagination...');
        cursor = undefined; // Reset to beginning
        continue;
      }
      throw error;
    }
  }
  
  return allResults;
}
```

## Best Practices

### Error Handling in Client Code

```typescript
// Good: Comprehensive error handling
async function robustSearch(query: string, limit: number) {
  try {
    const response = await searchFlows({ query, limit });
    return response;
    
  } catch (error) {
    // Log the full error for debugging
    console.error('Search failed:', error);
    
    // Handle specific error types
    switch (error.errorType) {
      case 'validation_error':
        throw new Error(`Invalid search parameters: ${error.message}`);
        
      case 'authentication_error':
        throw new Error('Authentication failed. Please check your credentials.');
        
      case 'rate_limit_error':
        throw new Error(`Rate limit exceeded. Please wait ${error.details?.retryAfter || 60} seconds.`);
        
      case 'network_error':
        throw new Error('Network error. Please check your connection.');
        
      default:
        throw new Error(`Search failed: ${error.message}`);
    }
  }
}
```

### Validation Before API Calls

```typescript
// Good: Validate parameters before making API calls
function validateSearchParams(params: SearchParams): string[] {
  const errors: string[] = [];
  
  if (!params.query || typeof params.query !== 'string') {
    errors.push('Query is required and must be a string');
  }
  
  if (!params.limit || typeof params.limit !== 'number') {
    errors.push('Limit is required and must be a number');
  } else if (params.limit < 1 || params.limit > 10000) {
    errors.push('Limit must be between 1 and 10000');
  }
  
  if (params.sort_order && !['asc', 'desc'].includes(params.sort_order)) {
    errors.push('Sort order must be either "asc" or "desc"');
  }
  
  return errors;
}

async function safeSearch(params: SearchParams) {
  const validationErrors = validateSearchParams(params);
  if (validationErrors.length > 0) {
    throw {
      error: true,
      message: 'Validation failed',
      errorType: 'validation_error',
      validation_errors: validationErrors
    };
  }
  
  return await searchFlows(params);
}
```

### Graceful Degradation

```typescript
// Good: Provide fallback behavior
async function getDeviceListWithFallback(limit: number = 100) {
  try {
    // Try to get devices with detailed information
    return await getDeviceStatus({ limit });
    
  } catch (error) {
    if (error.errorType === 'timeout_error' || error.errorType === 'rate_limit_error') {
      console.warn('Full device list unavailable, trying simplified approach...');
      
      // Fallback to smaller request
      try {
        return await getDeviceStatus({ limit: Math.min(limit, 50) });
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        // Return empty result rather than crashing
        return { results: [], count: 0, total_count: 0, has_more: false };
      }
    }
    throw error;
  }
}
```

## Troubleshooting Guide

### Step-by-Step Debugging

#### 1. Check Configuration
```bash
# Verify environment variables
echo $FIREWALLA_MSP_TOKEN
echo $FIREWALLA_MSP_ID  
echo $FIREWALLA_BOX_ID

# Test basic connectivity
curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
     "https://$FIREWALLA_MSP_ID/v2/boxes/$FIREWALLA_BOX_ID/alarms?limit=1"
```

#### 2. Validate Parameters
```typescript
// Test parameter validation
const testParams = {
  query: "severity:high",
  limit: 50,
  sort_by: "timestamp",
  sort_order: "desc"
};

console.log('Testing parameters:', JSON.stringify(testParams, null, 2));
```

#### 3. Test Simple Queries
```typescript
// Start with the simplest possible query
try {
  const response = await searchFlows({
    query: "protocol:tcp",
    limit: 10
  });
  console.log('Simple query succeeded:', response.count);
} catch (error) {
  console.error('Simple query failed:', error);
}
```

#### 4. Check Network Connectivity
```typescript
// Test network connectivity
async function testConnectivity() {
  try {
    const response = await fetch(`https://${process.env.FIREWALLA_MSP_ID}/health`);
    console.log('MSP API reachable:', response.status);
  } catch (error) {
    console.error('MSP API unreachable:', error.message);
  }
}
```

### Common Debugging Scenarios

#### Authentication Issues
```typescript
// Debug authentication
async function debugAuth() {
  const token = process.env.FIREWALLA_MSP_TOKEN;
  const mspId = process.env.FIREWALLA_MSP_ID;
  
  if (!token) {
    console.error('FIREWALLA_MSP_TOKEN not set');
    return;
  }
  
  if (!mspId) {
    console.error('FIREWALLA_MSP_ID not set');
    return;
  }
  
  // Test token format
  if (token.length < 20) {
    console.warn('Token seems too short, check if complete');
  }
  
  // Test MSP domain format
  if (!mspId.includes('.firewalla.net')) {
    console.warn('MSP ID should end with .firewalla.net');
  }
}
```

#### Query Syntax Issues
```typescript
// Debug query syntax
function debugQuery(query: string) {
  // Check basic structure
  const openParens = (query.match(/\(/g) || []).length;
  const closeParens = (query.match(/\)/g) || []).length;
  
  if (openParens !== closeParens) {
    console.error('Unmatched parentheses:', { openParens, closeParens });
  }
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /[<>]/,  // Potential injection
    /javascript:/i,
    /script/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      console.warn('Query contains potentially dangerous pattern:', pattern);
    }
  }
  
  console.log('Query structure check passed');
}
```

## Tool-Specific Errors

### Search Tool Errors

#### Flow Search Errors
```json
{
  "error": true,
  "message": "Flow search failed: Invalid time range",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Start time must be before end time"
  ],
  "details": {
    "timeRange": {
      "start": "2024-01-31T00:00:00Z",
      "end": "2024-01-01T00:00:00Z"
    }
  }
}
```

#### Device Search Errors
```json
{
  "error": true,
  "message": "Device search failed: Network ID not found",
  "tool": "search_devices",
  "errorType": "api_error",
  "details": {
    "networkId": "invalid-network-123"
  }
}
```

### Rule Management Errors

#### Rule Pause Errors
```json
{
  "error": true,
  "message": "Failed to pause rule: Rule not found",
  "tool": "pause_rule",
  "errorType": "api_error",
  "details": {
    "ruleId": "nonexistent-rule-123"
  }
}
```

#### Rule Resume Errors
```json
{
  "error": true,
  "message": "Failed to resume rule: Rule is not currently paused",
  "tool": "resume_rule",
  "errorType": "api_error",
  "details": {
    "ruleId": "active-rule-456",
    "currentStatus": "active"
  }
}
```

## Debugging Techniques

### Error Logging

```typescript
// Comprehensive error logging
function logError(error: any, context: string) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context,
    error: {
      message: error.message,
      type: error.errorType || 'unknown',
      tool: error.tool || 'unknown',
      stack: error.stack,
      details: error.details || {}
    }
  };
  
  console.error('ERROR:', JSON.stringify(errorLog, null, 2));
}
```

### Error Monitoring

```typescript
// Track error patterns
class ErrorMonitor {
  private errorCounts = new Map<string, number>();
  
  recordError(error: any) {
    const key = `${error.tool}:${error.errorType}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }
  
  getErrorStats() {
    return Object.fromEntries(this.errorCounts);
  }
  
  getMostCommonErrors(limit: number = 10) {
    return Array.from(this.errorCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit);
  }
}
```

### Testing Error Scenarios

```typescript
// Test different error scenarios
async function testErrorScenarios() {
  const testCases = [
    {
      name: 'Invalid limit',
      params: { query: 'severity:high', limit: -1 },
      expectedError: 'validation_error'
    },
    {
      name: 'Invalid query syntax',
      params: { query: 'severity:high AND (protocol:tcp', limit: 50 },
      expectedError: 'validation_error'
    },
    {
      name: 'Invalid cursor',
      params: { query: 'severity:high', limit: 50, cursor: 'invalid' },
      expectedError: 'validation_error'
    }
  ];
  
  for (const testCase of testCases) {
    try {
      await searchFlows(testCase.params);
      console.error(`Test '${testCase.name}' should have failed`);
    } catch (error) {
      if (error.errorType === testCase.expectedError) {
        console.log(`Test '${testCase.name}' passed`);
      } else {
        console.error(`Test '${testCase.name}' failed: expected ${testCase.expectedError}, got ${error.errorType}`);
      }
    }
  }
}
```

This comprehensive error handling guide provides everything you need to understand, handle, and debug errors in the Firewalla MCP Server. Always check error types and validation messages to understand the root cause and implement appropriate recovery strategies.