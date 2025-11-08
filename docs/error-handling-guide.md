# Firewalla MCP Server - Error Handling Guide

This guide provides comprehensive documentation for error handling patterns, response formats, and troubleshooting techniques used throughout the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Error Response Format](#error-response-format)
- [Error Types](#error-types)
- [HTTP Status Codes](#http-status-codes)
- [Validation Errors](#validation-errors)
- [Timeout vs Validation Error Patterns](#timeout-vs-validation-error-patterns)
- [Common Error Scenarios](#common-error-scenarios)
- [Error Recovery Strategies](#error-recovery-strategies)
- [Best Practices](#best-practices)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Tool-Specific Errors](#tool-specific-errors)
- [Debugging Techniques](#debugging-techniques)
- [Specific Fix Scenarios](#specific-fix-scenarios)

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

## Timeout vs Validation Error Patterns

Understanding when different error types occur is crucial for proper error handling and user experience. This section documents the specific patterns and triggers for timeout versus validation errors.

### Error Type Decision Matrix

| Condition | Error Type | Response Time | User Action |
|-----------|------------|---------------|-------------|
| Invalid parameter format | validation_error | Immediate (<50ms) | Fix parameter syntax |
| Parameter out of range | validation_error | Immediate (<50ms) | Adjust parameter value |
| Query syntax error | validation_error | Fast (50-200ms) | Fix query syntax |
| Large dataset processing | timeout_error | Slow (>10s) | Reduce scope or use pagination |
| Network connectivity | timeout_error | Variable (5-30s) | Check network/retry |
| API rate limiting | rate_limit_error | Fast (100-500ms) | Wait and retry |
| Invalid credentials | authentication_error | Fast (200-1000ms) | Fix authentication |

### Timeout Error Patterns

#### 1. Large Dataset Timeout Errors

**Trigger Conditions**:
- Query returns >10,000 potential results before filtering
- Complex correlation analysis on >5,000 entities
- Geographic enrichment on >2,000 flows
- Bandwidth analysis on >1,000 devices

**Example Scenarios**:
```json
{
  "error": true,
  "message": "Query timeout: Dataset too large for processing within 10 second limit",
  "tool": "search_flows",
  "errorType": "timeout_error",
  "details": {
    "timeout": 10000,
    "estimated_results": 25000,
    "suggestion": "Use more specific filters: add time range (timestamp:>NOW-1h), protocol filter, or reduce limit to 500"
  },
  "context": {
    "query": "severity:high",
    "limit": 2000,
    "processing_time": 10001
  }
}
```

**Prevention Patterns**:
```bash
// High-risk queries (likely to timeout)
search_flows query:"protocol:tcp" limit:2000                    // Too broad
search_alarms query:"severity:>=low" limit:1000                 // Includes low-severity
get_bandwidth_usage period:"30d" limit:1000                     // Long time period

// Optimized alternatives
search_flows query:"protocol:tcp AND timestamp:>NOW-1h" limit:500
search_alarms query:"severity:>=medium" limit:500
get_bandwidth_usage period:"24h" limit:500
```

#### 2. Network Timeout Patterns

**Trigger Conditions**:
- MSP API unavailable or slow
- Network connectivity issues
- DNS resolution failures
- Firewall blocking connections

**Example Error Response**:
```json
{
  "error": true,
  "message": "Network timeout: Failed to connect to Firewalla MSP API within 30 seconds",
  "tool": "get_device_status",
  "errorType": "timeout_error",
  "details": {
    "endpoint": "https://yourdomain.firewalla.net/v2/boxes/abc123/devices",
    "timeout": 30000,
    "network_error": "ETIMEDOUT",
    "retry_suggested": true
  },
  "context": {
    "attempt": 1,
    "max_retries": 3
  }
}
```

**Network Timeout Detection**:
```typescript
// Timeout patterns by response time
const timeoutPatterns = {
  immediate_failure: '0-100ms',     // Connection refused, DNS failure
  connection_timeout: '5-30s',      // Network connectivity issues
  read_timeout: '30s+',            // API processing issues
  processing_timeout: '10s',        // Server-side timeout (our limit)
}
```

#### 3. Processing Timeout Patterns

**Trigger Conditions**:
- Complex cross-reference correlation
- Large geographic dataset enrichment
- Statistical analysis on massive datasets
- Multiple concurrent heavy operations

**Example Error Response**:
```json
{
  "error": true,
  "message": "Processing timeout: Cross-reference correlation exceeded 10 second processing limit",
  "tool": "search_enhanced_cross_reference",
  "errorType": "timeout_error",
  "details": {
    "correlation_fields": ["source_ip", "destination_ip", "country"],
    "primary_results": 5000,
    "secondary_results": 8000,
    "processing_stage": "fuzzy_matching",
    "suggestion": "Reduce result sets or use simpler correlation fields"
  }
}
```

### Validation Error Patterns

#### 1. Immediate Validation Errors (Parameter Format)

**Trigger Conditions**:
- Invalid parameter types
- Missing required parameters
- Malformed parameter values
- Invalid enum values

**Response Characteristics**:
- **Response Time**: <50ms (immediate)
- **Error Location**: Client-side validation
- **Recovery**: Fix parameter and retry

**Example Errors**:
```json
{
  "error": true,
  "message": "limit must be a number between 1 and 1000, got string 'abc'",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "limit parameter must be a number",
    "limit must be between 1 and 1000"
  ],
  "details": {
    "parameter": "limit",
    "received_value": "abc",
    "expected_type": "number",
    "valid_range": "1-1000"
  }
}
```

#### 2. Query Syntax Validation Errors

**Trigger Conditions**:
- Unmatched parentheses or quotes
- Invalid field names
- Malformed operators
- Dangerous query content

**Response Characteristics**:
- **Response Time**: 50-200ms (query parsing)
- **Error Location**: Query validation layer
- **Recovery**: Fix query syntax and retry

**Common Query Syntax Errors**:
```typescript
const querySyntaxErrors = {
  unmatched_parentheses: {
    query: "severity:high AND (protocol:tcp",
    error: "Unmatched parentheses in query"
  },
  unmatched_quotes: {
    query: 'severity:"high AND protocol:tcp',
    error: "Unmatched double quotes in query"
  },
  invalid_field: {
    query: "invalid_field:value",
    error: "Field 'invalid_field' is not allowed. Valid fields: source_ip, destination_ip, protocol, severity"
  },
  dangerous_content: {
    query: "severity:<script>alert('xss')</script>",
    error: "Query contains potentially dangerous content"
  }
}
```

#### 3. Business Logic Validation Errors

**Trigger Conditions**:
- Invalid time ranges (start > end)
- Incompatible parameter combinations
- Resource not found
- Invalid cursor values

**Response Characteristics**:
- **Response Time**: 100-500ms (business logic validation)
- **Error Location**: Business logic layer
- **Recovery**: Adjust parameters to valid combinations

**Example Business Logic Errors**:
```json
{
  "error": true,
  "message": "Invalid time range: start time must be before end time",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Start time (2024-01-31T00:00:00Z) must be before end time (2024-01-01T00:00:00Z)"
  ],
  "details": {
    "start_time": "2024-01-31T00:00:00Z",
    "end_time": "2024-01-01T00:00:00Z",
    "time_diff": "-30 days"
  }
}
```

### Error Type Determination Flow

```typescript
// Error classification logic
function classifyError(error: any, context: any): ErrorType {
  // Immediate validation (no API call made)
  if (context.stage === 'parameter_validation') {
    return ErrorType.VALIDATION_ERROR;
  }

  // Network-related timeouts
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    return ErrorType.TIMEOUT_ERROR;
  }

  // API processing timeouts
  if (context.processing_time > 10000) {
    return ErrorType.TIMEOUT_ERROR;
  }

  // Query syntax issues
  if (context.stage === 'query_parsing' && error.message.includes('syntax')) {
    return ErrorType.VALIDATION_ERROR;
  }

  // Rate limiting
  if (error.status === 429) {
    return ErrorType.RATE_LIMIT_ERROR;
  }

  // Authentication issues
  if (error.status === 401 || error.status === 403) {
    return ErrorType.AUTHENTICATION_ERROR;
  }

  // Default to API error for other cases
  return ErrorType.API_ERROR;
}
```

### When Timeout Errors Occur

#### High-Risk Operations for Timeouts

1. **Large Search Operations**:
   ```bash
   // These queries frequently timeout
   search_flows query:"timestamp:>NOW-7d" limit:2000
   search_alarms query:"severity:>=low" limit:1000
   search_devices query:"online:true" limit:2000
   ```

2. **Complex Correlation Queries**:
   ```bash
   // Cross-reference operations with large datasets
   search_enhanced_cross_reference primary_query:"protocol:tcp" secondary_queries:["severity:high"] limit:5000
   ```

3. **Bandwidth Analysis on Large Networks**:
   ```bash
   // Heavy processing operations
   get_bandwidth_usage period:"30d" limit:1000
   ```

#### Timeout Prevention Strategies

```typescript
// Progressive query refinement to avoid timeouts
const timeoutPrevention = {
  start_small: {
    initial_query: "severity:high",
    initial_limit: 100,
    if_successful: "increase limit gradually"
  },
  add_filters: {
    time_filter: "timestamp:>NOW-1h",
    protocol_filter: "protocol:tcp",
    geographic_filter: "country:China"
  },
  use_pagination: {
    first_request: { limit: 500, cursor: undefined },
    subsequent_requests: { limit: 500, cursor: "from_previous_response" }
  }
}
```

### When Validation Errors Occur

#### Immediate Validation (No API Call)

1. **Parameter Type Errors**:
   ```bash
   // These cause immediate validation errors
   search_flows query:"severity:high" limit:"invalid"     // Non-numeric limit
   get_device_status limit:-1                             // Negative limit
   search_alarms query:123                                // Non-string query
   ```

2. **Parameter Range Errors**:
   ```bash
   // Out of range parameters
   search_flows limit:50000                               // Exceeds maximum
   get_bandwidth_usage limit:0                            // Below minimum
   ```

#### Query Validation (Quick Processing)

1. **Syntax Errors**:
   ```bash
   // Malformed queries
   search_flows query:"severity:high AND (protocol:tcp"   // Unmatched parentheses
   search_alarms query:"severity:\"high"                  // Unmatched quotes
   ```

2. **Field Validation**:
   ```bash
   // Invalid field names
   search_flows query:"invalid_field:value"              // Unknown field
   search_devices query:"non_existent:data"              // Field doesn't exist
   ```

### Error Response Time Patterns

```typescript
const errorResponseTimes = {
  validation_error: {
    parameter_validation: '10-50ms',      // Immediate client-side checks
    query_syntax: '50-200ms',             // Query parsing and validation
    business_logic: '100-500ms',          // Complex validation rules
  },
  timeout_error: {
    network_timeout: '5000-30000ms',      // Network connectivity issues
    processing_timeout: '10000ms+',       // Server processing limits
    api_timeout: '30000ms+',              // External API timeouts
  },
  rate_limit_error: {
    detection: '100-500ms',               // Quick API response
    recovery: '60000ms+',                 // Wait time before retry
  }
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
    "requiredVars": ["FIREWALLA_MSP_TOKEN", "FIREWALLA_MSP_ID"]
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
// Verify environment variables
echo $FIREWALLA_MSP_TOKEN
echo $FIREWALLA_MSP_ID
echo $FIREWALLA_BOX_ID

// Test basic connectivity
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

## Specific Fix Scenarios

The following section documents specific fix scenarios that have been implemented to resolve common issues and prevent regressions. These scenarios provide examples of real-world problems and their solutions.

### Fix Scenario 1: Null/Undefined Parameter Handling

**Issue**: Tools were accepting null/undefined values for required parameters, causing unpredictable behavior and poor error messages.

**Before Fix**:
```json
{
  "query": null,
  "limit": undefined
}
// Result: Unpredictable behavior or unclear errors
```

**After Fix**:
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "query is required",
    "limit is required"
  ]
}
```

**Prevention Strategy**:
- All required parameters are validated before processing
- Clear error messages specify which parameters are missing
- Null/undefined values are properly detected and rejected

### Fix Scenario 2: Geographic Filter Multi-Value Support

**Issue**: Geographic filters only accepted single values instead of arrays, limiting query flexibility.

**Before Fix**:
```javascript
// Only single country supported
{ countries: "China" }  // Limited functionality
```

**After Fix**:
```javascript
// Multiple countries with OR logic
{ countries: ["China", "Russia", "Iran"] }
// Generates: (country:China OR country:Russia OR country:Iran)
```

**Error Prevention**:
```json
{
  "error": true,
  "message": "Invalid geographic filter: countries must be an array of strings",
  "tool": "search_flows_by_geography",
  "errorType": "validation_error",
  "details": {
    "received_type": "string",
    "expected_type": "array",
    "suggestion": "Use array format: { countries: [\"China\", \"Russia\"] }"
  }
}
```

### Fix Scenario 3: Timeout vs Validation Error Classification

**Issue**: Some parameter validation errors were incorrectly classified as timeout errors, causing user confusion.

**Before Fix**:
```json
{
  "error": true,
  "message": "Operation timed out",
  "errorType": "timeout_error"
}
// When the real issue was a missing required parameter
```

**After Fix**:
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "search_flows",
  "errorType": "validation_error",
  "details": {
    "stage": "parameter_validation",
    "response_time": "5ms",
    "recovery_type": "immediate",
    "fix_required": true
  }
}
```

**Classification Logic**:
- Parameters validated in < 100ms → `validation_error`
- Network operations > 10s → `timeout_error`
- Processing operations > 10s → `timeout_error`
- Authentication issues → `authentication_error`

### Fix Scenario 4: Country Code Validation Edge Cases

**Issue**: Invalid country codes were accepted or caused errors instead of being normalized to safe defaults.

**Before Fix**:
```javascript
// These inputs caused various issues:
{ country_code: "USA" }      // Too long, should be 2 chars
{ country_code: null }       // Caused null reference errors
{ country_code: "" }         // Empty string accepted as valid
{ country_code: 123 }        // Number treated as valid
```

**After Fix**:
```javascript
// All invalid inputs normalize to 'UN' (Unknown)
ensureConsistentGeoData({ country_code: "USA" });     // → { country_code: "UN" }
ensureConsistentGeoData({ country_code: null });      // → { country_code: "UN" }
ensureConsistentGeoData({ country_code: "" });        // → { country_code: "UN" }
ensureConsistentGeoData({ country_code: 123 });       // → { country_code: "UN" }

// Valid codes are normalized to uppercase
ensureConsistentGeoData({ country_code: "us" });      // → { country_code: "US" }
```

**Error Response for Invalid Codes**:
```json
{
  "error": false,
  "message": "Country code normalized",
  "details": {
    "original_value": "USA",
    "normalized_value": "UN",
    "reason": "Invalid length (must be 2 characters)",
    "valid_examples": ["US", "CN", "RU", "GB"]
  }
}
```

### Fix Scenario 5: Data Normalization Consistency

**Issue**: Inconsistent field naming and null handling across different data sources.

**Before Fix**:
```javascript
// Inconsistent field names from different APIs
{
  "deviceName": "Router1",     // camelCase
  "device_id": "123",          // snake_case
  "MacAddress": "aa:bb:cc",    // PascalCase
  "ip": null,                  // null value
  "Status": undefined          // undefined value
}
```

**After Fix**:
```javascript
// Consistent snake_case naming with safe defaults
{
  "device_name": "Router1",
  "device_id": "123",
  "mac_address": "aa:bb:cc",
  "ip_address": "unknown",     // null → "unknown"
  "status": "unknown"          // undefined → "unknown"
}
```

**Normalization Error Handling**:
```json
{
  "data": { ... },
  "normalization_report": {
    "modifications": [
      {
        "field": "ip_address",
        "original_value": null,
        "normalized_value": "unknown",
        "reason": "null_value_replacement"
      },
      {
        "field": "device_name",
        "original_value": "deviceName",
        "normalized_value": "device_name",
        "reason": "field_name_standardization"
      }
    ],
    "errors": [],
    "warnings": []
  }
}
```

### Fix Scenario 6: Performance Threshold Enforcement

**Issue**: Large queries could exceed memory limits or cause system instability.

**Before Fix**:
```javascript
// No limits - could cause system issues
{ query: "protocol:tcp", limit: 100000 }  // Too large
```

**After Fix**:
```json
{
  "error": true,
  "message": "limit is too large (got 100000, maximum: 10000 for performance reasons)",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "limit exceeds system limits to control result set size and prevent memory issues (got 100000, maximum: 10000)"
  ],
  "details": {
    "parameter": "limit",
    "received_value": 100000,
    "maximum_allowed": 10000,
    "suggested_alternatives": [
      "Use limit: 1000 and pagination",
      "Add time filters to reduce dataset size",
      "Use more specific query filters"
    ]
  }
}
```

### Fix Scenario 7: Query Syntax Error Recovery

**Issue**: Complex query syntax errors provided poor guidance for fixing the issue.

**Before Fix**:
```json
{
  "error": true,
  "message": "Query syntax error",
  "errorType": "validation_error"
}
```

**After Fix**:
```json
{
  "error": true,
  "message": "Query syntax error: Unmatched parentheses in query",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": [
    "Unmatched parentheses in query",
    "Missing closing parenthesis after position 25"
  ],
  "details": {
    "query": "severity:high AND (protocol:tcp",
    "error_position": 29,
    "error_context": "...(protocol:tcp<HERE>",
    "suggestions": [
      "Add closing parenthesis: severity:high AND (protocol:tcp)",
      "Remove opening parenthesis: severity:high AND protocol:tcp",
      "Check parentheses balance throughout query"
    ],
    "corrected_examples": [
      "severity:high AND (protocol:tcp OR protocol:udp)",
      "severity:high AND protocol:tcp"
    ]
  }
}
```

### Common Error Pattern Prevention

#### 1. Parameter Validation Pipeline
```typescript
// Standardized validation pipeline prevents common issues
async function validateAndExecute(tool: string, params: any) {
  // Stage 1: Type validation (< 50ms)
  const typeValidation = validateParameterTypes(params);
  if (!typeValidation.isValid) {
    return createValidationError(tool, typeValidation.errors);
  }

  // Stage 2: Range validation (< 100ms)
  const rangeValidation = validateParameterRanges(params);
  if (!rangeValidation.isValid) {
    return createValidationError(tool, rangeValidation.errors);
  }

  // Stage 3: Business logic validation (< 500ms)
  const businessValidation = validateBusinessLogic(params);
  if (!businessValidation.isValid) {
    return createValidationError(tool, businessValidation.errors);
  }

  // Stage 4: Execute with timeout protection
  return await executeWithTimeout(tool, params, 10000);
}
```

#### 2. Error Classification Decision Tree
```typescript
function classifyError(error: any, context: any): ErrorType {
  // Immediate validation errors (always validation_error)
  if (context.stage === 'parameter_validation' ||
      context.stage === 'query_parsing' ||
      context.response_time < 100) {
    return ErrorType.VALIDATION_ERROR;
  }

  // Network-related errors
  if (error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND') {
    return context.response_time > 10000 ?
      ErrorType.TIMEOUT_ERROR :
      ErrorType.NETWORK_ERROR;
  }

  // Processing timeouts
  if (context.response_time > 10000 ||
      context.processing_time > 10000) {
    return ErrorType.TIMEOUT_ERROR;
  }

  // Authentication issues
  if (error.status === 401 || error.status === 403) {
    return ErrorType.AUTHENTICATION_ERROR;
  }

  // Rate limiting
  if (error.status === 429) {
    return ErrorType.RATE_LIMIT_ERROR;
  }

  // Default to API error
  return ErrorType.API_ERROR;
}
```

#### 3. Progressive Error Recovery
```typescript
async function executeWithRecovery(operation: () => Promise<any>) {
  try {
    return await operation();
  } catch (error) {
    // Try recovery strategies based on error type
    if (error.errorType === 'timeout_error') {
      console.warn('Operation timed out, trying with reduced scope...');
      return await executeWithReducedScope(operation);
    }

    if (error.errorType === 'rate_limit_error') {
      console.warn('Rate limited, waiting and retrying...');
      await delay(error.details?.retry_after || 60000);
      return await operation();
    }

    if (error.errorType === 'network_error') {
      console.warn('Network error, retrying with backoff...');
      return await retryWithBackoff(operation, 3);
    }

    // No recovery possible for validation or auth errors
    throw error;
  }
}
```

This comprehensive error handling guide provides everything you need to understand, handle, and debug errors in the Firewalla MCP Server. The specific fix scenarios document real-world issues and their solutions, helping prevent regressions and improve error handling consistency. Always check error types and validation messages to understand the root cause and implement appropriate recovery strategies.