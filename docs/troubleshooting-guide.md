# Firewalla MCP Server - Comprehensive Troubleshooting Guide

This guide provides step-by-step troubleshooting procedures for common issues encountered with the Firewalla MCP Server. Each section includes symptom identification, root cause analysis, and actionable solutions.

> **⚠️ Security Warning**: When debugging authentication issues, be careful not to expose your full API token in logs, terminal output, or support tickets. Always use partial token display (e.g., `${FIREWALLA_MSP_TOKEN:0:10}...`) when sharing debug information.

## Table of Contents

- [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
- [Common Error Categories](#common-error-categories)
- [Parameter Validation Issues](#parameter-validation-issues)
- [Authentication and Connection Issues](#authentication-and-connection-issues)
- [Timeout and Performance Issues](#timeout-and-performance-issues)
- [Geographic Filtering Issues](#geographic-filtering-issues)
- [Data Processing and Normalization Issues](#data-processing-and-normalization-issues)
- [Network and Connectivity Issues](#network-and-connectivity-issues)
- [Advanced Troubleshooting](#advanced-troubleshooting)
- [Performance Optimization](#performance-optimization)

## Quick Diagnostic Checklist

### Before Deep Troubleshooting

Run through this checklist to identify the most common issues:

1. **Environment Variables Check**
   ```bash
   echo "MSP Token: ${FIREWALLA_MSP_TOKEN:0:10}..."
   echo "MSP ID: $FIREWALLA_MSP_ID"
   echo "Box ID: $FIREWALLA_BOX_ID"
   ```

2. **Basic Connectivity Test**
   ```bash
   curl -H "Authorization: Token ${FIREWALLA_MSP_TOKEN}" \
        "https://${FIREWALLA_MSP_ID}/v2/boxes"
   ```

3. **MCP Server Status**
   ```bash
   npm run mcp:test
   ```

4. **Recent Error Logs**: the server writes its log to stderr (stdout carries
   the MCP protocol), and nothing writes a log file. Your MCP client keeps the
   server's stderr in its own log; from a shell, capture it:
   ```bash
   npm run mcp:start 2> server.log
   ```

### Quick Error Identification

| Error Pattern | Likely Cause | Quick Fix |
|---------------|--------------|-----------|
| "parameter is required" | Missing parameter | Add the required parameter |
| "Authentication failed" | Invalid credentials | Check environment variables |
| "timed out after" | The tool passed its 30 s | Reduce scope or use filters |
| "Query is too long" | Query exceeds limits | Shorten or simplify query |
| "Query contains invalid field names" | Invalid field name | Check valid field names |
| "Firewalla API sent no answer" | Connectivity issue | Check network. After `ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET` or `EPIPE` a read was already sent again once when time allowed; `ENOTFOUND` (DNS) and `ECONNREFUSED` are not retried |
| "Rate limit exceeded" | This process started `API_RATE_LIMIT` requests in 5 minutes, or the API answered 429 | Wait until the time the message gives; see [rate-limiting-guide.md](rate-limiting-guide.md) |

## Common Error Categories

### Understanding Error Types

The MCP server categorizes errors into specific types to help with troubleshooting:

#### 1. Validation Errors (`validation_error`)
- **Cause**: Parameter format, type, or value issues
- **Response Time**: < 500ms (immediate)
- **Recovery**: Fix parameters and retry immediately
- **Examples**: Missing required parameters, invalid types, out-of-range values

#### 2. Timeout Errors (`timeout_error`)
- **Cause**: The tool passed its time limit, 30 s (`PERFORMANCE_THRESHOLDS.TIMEOUT_MS`); its requests still in flight are cancelled, and those not yet sent are not sent
- **Response Time**: 30 seconds
- **Recovery**: Optimize query or reduce scope. A write tool says whether its write was sent: one not sent changed nothing; one sent and not answered may have been applied, so check with the read it names before trying again
- **Examples**: Large dataset processing, many pages of flows

#### 3. Authentication Errors (`authentication_error`)
- **Cause**: Invalid or expired credentials
- **Response Time**: 200ms - 2 seconds
- **Recovery**: Fix authentication configuration
- **Examples**: Invalid MSP token, insufficient permissions

#### 4. Network and API Failures
- **Cause**: Connectivity or infrastructure issues, or an error answer from the API
- **Type**: `api_error` (`search_error` for the search tools); nothing sets `network_error`
- **Message**: `Firewalla API sent no answer (ECONNABORTED: timeout of 30000ms exceeded)` or `Firewalla API answered 503 Service Unavailable after 2 attempts: ...`, after the tool's own prefix
- **Recovery**: The client already sends a failed GET again once, 1 to 2 s later, after a timeout, a dropped connection or a 502, 503 or 504, when the answer could still come before the tool gives up; it never sends a write again. Check the network before trying the tool again
- **Examples**: DNS failures (`ENOTFOUND`, not retried), connection timeouts

## Parameter Validation Issues

### Missing Required Parameters

**Symptom**: `"<parameter> is required but was not provided"` in `validation_errors`

**Common Cases**:
```json
{
  "error": true,
  "message": "Query parameter validation failed",
  "tool": "search_flows",
  "errorType": "validation_error",
  "timestamp": "2026-09-27T12:00:00.000Z",
  "validation_errors": [
    "query is required but was not provided",
    "Please provide a valid string value for query"
  ]
}
```

**Solution Steps**:
1. **Identify Missing Parameter**: Check `validation_errors` for the parameter name
2. **Add Required Parameter**: Include the parameter with a valid value
3. **Verify Parameter Type**: Ensure the parameter is the correct type (number, string, etc.)

**Examples**:
```javascript
// ❌ Incorrect - search_flows needs a query
{ limit: 100 }

// ✅ Correct - limit is optional (default 200)
{ query: "protocol:tcp", limit: 100 }
```

### Invalid Parameter Types

**Symptom**: `"limit must be a valid number"` or `"limit must be a number, got boolean"` in `validation_errors`, under the message `"Parameter validation failed"`

A numeric string such as `"100"` is converted and accepted.

**Solution Steps**:
1. **Check Parameter Type**: Verify you're passing the correct data type
2. **Convert If Needed**: Use proper type conversion
3. **Validate Range**: Ensure numeric parameters are within valid ranges

**Examples**:
```javascript
// ❌ Incorrect - not a number
{ query: "protocol:tcp", limit: "a hundred" }

// ✅ Correct - proper number type
{ query: "protocol:tcp", limit: 100 }
```

### Parameter Range Violations

**Symptom**: `"limit is too large ... (got 50000, maximum: 1000)"` or `"limit must be a positive number ..."`

**Common Limits**:
- `limit`: the tool schemas give at most 500 for `get_active_alarms`, `get_flow_data`, `search_flows`, `search_alarms`, `get_bandwidth_usage`, `get_offline_devices`, `search_devices` and `search_target_lists`, and at most 1000 for `get_device_status`, `get_network_rules` and `get_target_lists`. The server itself refuses what is over `getToolLimit` in `src/config/limits.ts`: 500 for `get_active_alarms` and `get_bandwidth_usage`, 2000 for `get_network_rules_summary`, 1000 for the others
- `duration` (`create_rule`): 60 to 31,536,000 seconds
- `query`: Maximum 2,000 characters

**Solution Steps**:
1. **Check Current Limits**: Review the error message for specific limits
2. **Adjust Parameter**: Use a value within the valid range
3. **Use Pagination**: For large datasets, use pagination instead of large limits

**Examples**:
```javascript
// ❌ Incorrect - exceeds maximum limit
{ query: "protocol:tcp", limit: 50000 }

// ✅ Correct - within valid range
{ query: "protocol:tcp", limit: 500 }

// ✅ Alternative - use pagination
{ query: "protocol:tcp", limit: 500, cursor: "page_token" }
```

### Null/Undefined Parameter Handling

**Symptom**: Unexpected behavior with null or undefined values

**Common Issues**:
- Passing `null` where a value is required
- Using `undefined` in optional parameters
- Empty strings treated as invalid

**Solution Steps**:
1. **Check for Null Values**: Ensure required parameters are not null/undefined
2. **Use Proper Defaults**: Omit optional parameters rather than setting to null
3. **Validate Before Calling**: Pre-validate parameters in your code

**Examples**:
```javascript
// ❌ Incorrect - null/undefined values
{ query: null, limit: undefined, cursor: "" }

// ✅ Correct - valid values or omitted
{ query: "protocol:tcp", limit: 100 }
// cursor omitted since it's optional
```

## Authentication and Connection Issues

### Invalid MSP Token

**Symptom**: `"Authentication failed"` error

**Diagnostic Steps**:
1. **Check Token Format**: MSP tokens should be long alphanumeric strings
2. **Verify Token Validity**: Test with curl command
3. **Check Token Permissions**: Ensure token has required permissions

```bash
# Test token validity
curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
     "https://$FIREWALLA_MSP_ID/v2/boxes" \
     -w "HTTP Status: %{http_code}\n"
```

**Solutions**:
1. **Regenerate Token**: Create new token in Firewalla MSP portal
2. **Update Environment**: Set new token in environment variables
3. **Verify Permissions**: Ensure token has read/write permissions as needed

### Invalid Box ID

**Symptom**: `"Resource not found. Please check your Box ID."` (HTTP 404), or `Forbidden (HTTP 403)` naming a box the token cannot access

**Diagnostic Steps**:
1. **Check Box ID Format**: Should be UUID format (e.g., `00000000-0000-0000-0000-000000000000`)
2. **Verify Box Exists**: Check in MSP portal
3. **Test Box Access**: Try accessing box directly

```bash
# Test box access: the gid should be in the list of boxes the token can access
curl -s -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
     "https://$FIREWALLA_MSP_ID/v2/boxes" | grep -c "$FIREWALLA_BOX_ID"
```

**Solutions**:
1. **Get Correct Box ID**: Find the correct box ID from MSP portal
2. **Update Environment**: Set correct `FIREWALLA_BOX_ID`
3. **Verify Box Status**: Ensure box is online and accessible

### MSP Domain Issues

**Symptom**: DNS resolution or connection errors

**Diagnostic Steps**:
1. **Check Domain Format**: Should end with `.firewalla.net`
2. **Test DNS Resolution**: Verify domain resolves correctly
3. **Check Network Access**: Ensure no firewall blocking

```bash
# Test DNS resolution
nslookup $FIREWALLA_MSP_ID

# Test HTTPS connectivity
curl -I "https://$FIREWALLA_MSP_ID" \
     -w "HTTP Status: %{http_code}\n"
```

**Solutions**:
1. **Verify Domain**: Check correct MSP domain in portal
2. **Update Environment**: Set correct `FIREWALLA_MSP_ID`
3. **Check Firewall**: Ensure outbound HTTPS access is allowed

## Timeout and Performance Issues

### Large Dataset Timeouts

**Symptom**: `timeout_error`: `Operation timed out after <n>ms ...`

**Common Causes**:
- Many pages to read: every page is a request, and each counts against the rate limit
- Geographic enrichment on > 2,000 flows
- Long time ranges (> 7 days)

**Solution Strategies**:

#### 1. Add Time Filters
```javascript
// ❌ Too broad - likely to timeout
{ query: "protocol:tcp", limit: 2000 }

// ✅ Add time filter
{ query: "protocol:tcp AND ts:>1h", limit: 500 }
```

#### 2. Use More Specific Filters
```javascript
// ❌ Too general
{ query: "protocol:tcp", limit: 500 }

// ✅ More specific
{ query: "protocol:tcp AND device.ip:192.168.*", limit: 500 }
```

#### 3. Reduce Limit and Use Pagination
```javascript
// ❌ Refused before any request - over the maximum
{ query: "type:1", limit: 5000 }

// ✅ Smaller limit with pagination
{ query: "type:1", limit: 500 }
// Then pass the returned cursor for the next page
```

### Network Timeouts

**Symptom**: `Firewalla API sent no answer (ECONNABORTED: timeout of 30000ms exceeded)`, or the same with `ETIMEDOUT`

**Diagnostic Steps**:
1. **Test Basic Connectivity**: Use curl to test API access
2. **Check Network Latency**: Measure response times
3. **Verify DNS Resolution**: Ensure domain resolves correctly

```bash
# Test network connectivity with timing
time curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
          "https://$FIREWALLA_MSP_ID/v2/alarms?limit=1"
```

**Solutions**:
1. **Know what was retried**: the client sends a GET again once when the answer could still come before the tool gives up. With the defaults (`API_TIMEOUT` and the tool timeout both 30 s) a GET that ran out its timeout is not sent again. A retry of your own also counts against the rate limit
2. **Check Network Path**: Verify routing and firewall rules
3. **Use Smaller Requests**: Reduce request complexity temporarily

### Processing Timeouts

**Symptom**: Operations exceed the 30-second tool limit

**Common Scenarios**:
- Bandwidth analysis on > 1,000 devices
- Complex geographic searches

**Optimization Strategies**:

#### 1. Bandwidth Analysis Optimization
```javascript
// ❌ Refused: the limit is at most 500
get_bandwidth_usage({ period: "30d", limit: 1000 })

// ✅ Optimized approach
get_bandwidth_usage({ period: "24h", limit: 100 })
```

#### 2. Geographic Search Optimization

`search_flows` takes `geographic_filters.countries` as ISO 3166-1 alpha-2
codes and sends them as the API's `region:` qualifier. Continents, cities and
country names are refused before any request.

```javascript
// ❌ Broad: every flow over 1 MB from four countries, at the maximum limit
search_flows({
  query: "total:>1MB",
  geographic_filters: {
    countries: ["CN", "RU", "IR", "KP"]
  },
  limit: 500
})

// ✅ Narrower: the last 6 hours, two countries, a smaller page
search_flows({
  query: "total:>1MB ts:>6h",
  geographic_filters: {
    countries: ["CN", "RU"]
  },
  limit: 100
})
```

## Geographic Filtering Issues

### Multi-Value Filter Problems

**Symptom**: Geographic filters not working as expected

**Common Issues**:
- Empty arrays not handled correctly
- Null values in filter arrays
- Inconsistent country code formats

**Solution Steps**:

#### 1. Clean Filter Arrays
```javascript
// ❌ Contains invalid values
const countries = ["CN", null, "", undefined, "RU"];

// ✅ Clean filter array
const countries = ["CN", "RU"].filter(c => c && c.trim().length > 0);
```

#### 2. Use Proper Country Codes
```javascript
// ❌ Inconsistent formats
{ countries: ["USA", "cn", "RUSSIA"] }

// ✅ ISO 3166-1 alpha-2 codes; names are refused
{ countries: ["US", "CN", "RU"] }
```

#### 3. Handle Empty Filters
```javascript
// ❌ May cause issues with empty arrays
function buildGeoFilters(userSelection) {
  return {
    countries: userSelection.countries,
    regions: userSelection.regions
  };
}

// ✅ Handle empty/null arrays
function buildGeoFilters(userSelection) {
  const filters = {};

  if (userSelection.countries && userSelection.countries.length > 0) {
    filters.countries = userSelection.countries.filter(c => c && c.trim());
  }

  if (userSelection.regions && userSelection.regions.length > 0) {
    filters.regions = userSelection.regions.filter(r => r && r.trim());
  }

  return filters;
}
```

### Country Code Validation Issues

**Symptom**: Invalid country codes causing errors

**Common Problems**:
- Using 3-letter codes instead of 2-letter ISO codes
- Mixed case country codes
- Invalid or non-existent country codes

**Solutions**:

#### 1. Validate Country Codes
```javascript
const validCountryCodes = ['US', 'CN', 'RU', 'GB', 'DE', 'FR', 'JP'];

function validateCountryCode(code) {
  if (!code || typeof code !== 'string') return 'UN';
  const normalized = code.toUpperCase().trim();
  return normalized.length === 2 && /^[A-Z]{2}$/.test(normalized) ? normalized : 'UN';
}

// Usage
const countryCode = validateCountryCode(userInput); // Ensures valid format
```

#### 2. Normalize Geographic Data
```javascript
function normalizeGeoFilters(filters) {
  const normalized = {};

  if (filters.countries) {
    normalized.countries = filters.countries
      .filter(c => c && typeof c === 'string' && c.trim().length > 0)
      .map(c => c.trim());
  }

  // continents, cities and asns are refused: the API has no such qualifier

  return normalized;
}
```

### Geographic Query Construction Issues

**Symptom**: Complex geographic queries not working correctly

**Common Problems**:
- Incorrect OR logic construction
- Missing quotes for multi-word locations
- Conflicting geographic hierarchies

**Solutions**:

#### 1. Proper OR Logic Construction
```javascript
// ❌ Refused before any request: the API has no country: qualifier
const query = "country:CN OR country:RU";

// ✅ The API's region: qualifier, with a comma list for OR
function buildCountryQuery(codes) {
  if (!codes || codes.length === 0) return '';
  return `region:${codes.join(',')}`; // region:CN,RU
}
```

On alarms the qualifier is `remote.region:`. `city:`, `continent:` and
`asn:` are refused the same way, since the API answers a qualifier it does not
know with no results.

## Data Processing and Normalization Issues

### Null/Undefined Data Handling

**Symptom**: Inconsistent data fields or missing values

**Common Issues**:
- API returns null for some fields
- Inconsistent field naming (camelCase vs snake_case)
- Missing geographic data

**Solutions**:

#### 1. Safe Data Access
```javascript
// ❌ Unsafe access - may throw errors
function getDeviceName(device) {
  return device.name.toUpperCase();
}

// ✅ Safe access with defaults
function getDeviceName(device) {
  return (device?.name || 'unknown').toString().toUpperCase();
}
```

#### 2. Consistent Field Normalization
```javascript
function normalizeDeviceData(device) {
  return {
    device_id: device?.deviceId || device?.device_id || 'unknown',
    device_name: device?.deviceName || device?.device_name || device?.name || 'unknown',
    mac_address: device?.macAddress || device?.mac_address || device?.mac || 'unknown',
    ip_address: device?.ipAddress || device?.ip_address || device?.ip || 'unknown',
    status: device?.status || 'unknown',
    last_seen: device?.lastSeen || device?.last_seen || null
  };
}
```

#### 3. Handle Geographic Data Inconsistencies
```javascript
function normalizeGeoData(geoData) {
  if (!geoData || typeof geoData !== 'object') {
    return {
      country: 'unknown',
      country_code: 'UN',
      continent: 'unknown',
      city: 'unknown',
      region: 'unknown'
    };
  }

  return {
    country: normalizeString(geoData.country || geoData.Country),
    country_code: normalizeCountryCode(geoData.country_code || geoData.countryCode),
    continent: normalizeString(geoData.continent || geoData.Continent),
    city: normalizeString(geoData.city || geoData.City),
    region: normalizeString(geoData.region || geoData.Region)
  };
}

function normalizeString(value) {
  if (!value || typeof value !== 'string') return 'unknown';
  const trimmed = value.trim();
  return trimmed.length === 0 ? 'unknown' : trimmed;
}

function normalizeCountryCode(code) {
  if (!code || typeof code !== 'string') return 'UN';
  const normalized = code.toUpperCase().trim();
  return normalized.length === 2 && /^[A-Z]{2}$/.test(normalized) ? normalized : 'UN';
}
```

### Performance Issues with Large Datasets

**Symptom**: Slow data processing or memory issues

**Solutions**:

#### 1. Batch Processing
```javascript
async function processLargeDataset(data, batchSize = 1000) {
  const results = [];

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const processedBatch = batch.map(item => normalizeData(item));
    results.push(...processedBatch);

    // Allow event loop to process other tasks
    if (i % (batchSize * 10) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}
```

#### 2. Memory-Efficient Processing
```javascript
function* processDataStream(data) {
  for (const item of data) {
    yield normalizeData(item);
  }
}

// Usage
const results = [];
for (const processedItem of processDataStream(largeDataset)) {
  results.push(processedItem);

  // Process in chunks to avoid memory issues
  if (results.length >= 1000) {
    // Handle batch
    handleBatch(results);
    results.length = 0; // Clear array
  }
}
```

## Network and Connectivity Issues

### DNS Resolution Problems

**Symptom**: `ENOTFOUND` errors

**Diagnostic Steps**:
```bash
# Test DNS resolution
nslookup $FIREWALLA_MSP_ID

# Test with different DNS servers
nslookup $FIREWALLA_MSP_ID 8.8.8.8
nslookup $FIREWALLA_MSP_ID 1.1.1.1
```

**Solutions**:
1. **Update DNS Settings**: Use reliable DNS servers (8.8.8.8, 1.1.1.1)
2. **Check Network Configuration**: Verify local network settings
3. **Try Alternative Resolution**: Use IP address if domain resolution fails

### SSL/TLS Certificate Issues

**Symptom**: Certificate verification errors

**Diagnostic Steps**:
```bash
# Test SSL certificate
openssl s_client -connect $FIREWALLA_MSP_ID:443 -servername $FIREWALLA_MSP_ID

# Check certificate validity
curl -vI "https://$FIREWALLA_MSP_ID"
```

**Solutions**:
1. **Update System Time**: Ensure system clock is accurate
2. **Update CA Certificates**: Refresh certificate authorities
3. **Check Certificate Chain**: Verify complete certificate chain

### Firewall and Proxy Issues

**Symptom**: Connection refused or hanging connections

**Diagnostic Steps**:
```bash
# Test direct connection
nc -zv $FIREWALLA_MSP_ID 443

# Check for proxy interference
curl -v "https://$FIREWALLA_MSP_ID" --proxy ""

# Test with proxy if required
curl -v "https://$FIREWALLA_MSP_ID" --proxy "http://proxy:port"
```

**Solutions**:
1. **Configure Proxy**: Set proxy environment variables if needed
2. **Allow Outbound HTTPS**: Ensure port 443 is accessible
3. **Whitelist Domain**: Add Firewalla domains to firewall whitelist

## Advanced Troubleshooting

### Debug Mode Configuration

Enable comprehensive debugging for detailed error analysis:

```bash
# Enable all debugging
DEBUG=firewalla:* npm run mcp:start

# Enable specific debug namespaces: api and validation are the ones the code writes to
DEBUG=api npm run mcp:start
DEBUG=validation npm run mcp:start
```

### Error Log Analysis

The server writes its log to stderr, and stderr is not JSON lines: the
logger writes one JSON object per line, debug output included, and the API
client writes plain text lines beside them, such as `API Request: ...`,
`API Request queued for the rate limit: ...`,
`API Request failed: 503 GET <path>; retrying in <n> s (retry 1 of 1)`,
`API Rate Limited: 429 ...` and `API Response Error: <status> ...`. A JSON
lines parser has to skip lines that are not JSON. Nothing writes a log file.
Capture stderr, then search it:

```bash
npm run mcp:start 2> server.log

# Check specific tool errors
grep "search_flows" server.log | tail -20

# Check authentication errors
grep "Authentication failed" server.log | tail -10

# Check timeout errors
grep "timed out" server.log | tail -10
```

### Performance Monitoring

Monitor performance metrics to identify bottlenecks:

```javascript
// Enable performance monitoring
const startTime = Date.now();

try {
  const result = await searchFlows({ query: "test", limit: 100 });
  const endTime = Date.now();
  console.log(`Operation completed in ${endTime - startTime}ms`);
} catch (error) {
  const endTime = Date.now();
  console.log(`Operation failed after ${endTime - startTime}ms:`, error.message);
}
```

### Memory Usage Monitoring

Track memory usage for large operations:

```javascript
function checkMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(`${label} - Memory usage:`, {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`
  });
}

// Usage
checkMemoryUsage('Before operation');
await largeDataOperation();
checkMemoryUsage('After operation');
```

## Performance Optimization

### Query Optimization Strategies

#### 1. Use Specific Time Ranges
```javascript
// ❌ No time filter
{ query: "type:1", limit: 500 }

// ✅ Recent data only
{ query: "type:1 AND ts:>1h", limit: 500 }
```

#### 2. Use Appropriate Limits
```javascript
// ❌ Refused - over the maximum
{ query: "type:1", limit: 10000 }

// ✅ Reasonable limit with pagination
{ query: "type:1", limit: 100 }
```

### Caching Optimization

#### 1. Know What Is Cached
The client caches GET answers for `CACHE_TTL` seconds (default 300), and
answers from `/alarms` and `/flows` endpoints for 15 s. It holds at most
`CACHE_MAX_ENTRIES` (default 1000), and any write clears it. A query with a
relative time such as `ts:>1h` is never cached: it is sent as Unix seconds, so
it would get a new key every second, and "the last hour" is read when it is
asked. A repeated query with fixed times, such as `ts:1790000000-1790003600`,
is answered from the cache within the TTL and costs no request.

#### 2. Batch Related Requests
```javascript
// ❌ Multiple individual requests
const devices = await getDeviceStatus({ limit: 100 });
const alarms = await getActiveAlarms({ limit: 100 });
const rules = await getNetworkRules({ limit: 100 });

// ✅ When counts are enough, one tool gives several
const dashboard = await getSimpleStatistics();
// Online and offline boxes, alarms and rules; no device data
```

### Error Prevention Strategies

#### 1. Input Validation
```javascript
function validateSearchParams(params) {
  const errors = [];

  // Required parameters
  if (!params.query || typeof params.query !== 'string') {
    errors.push('query parameter is required and must be a string');
  }

  if (!params.limit || typeof params.limit !== 'number') {
    errors.push('limit parameter is required and must be a number');
  }

  // Range validation
  if (params.limit < 1 || params.limit > 10000) {
    errors.push('limit must be between 1 and 10000');
  }

  // Query length validation
  if (params.query && params.query.length > 2000) {
    errors.push('query must be 2000 characters or less');
  }

  return errors;
}

// Usage
async function safeSearchFlows(params) {
  const validationErrors = validateSearchParams(params);
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }

  return await searchFlows(params);
}
```

#### 2. Graceful Error Handling
The server already sends a failed read again once when that can help (see
Network Timeouts above), and every retry, yours included, counts against the
100 requests per 5 minutes. This caller-side sketch retries only timeouts,
decided by `errorType`; nothing sets `network_error`, so a network failure
arrives as `api_error` with `Firewalla API sent no answer` in the message.
```javascript
async function resilientOperation(operation, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry validation errors
      if (error.errorType === 'validation_error') {
        throw error;
      }

      // Don't retry authentication errors
      if (error.errorType === 'authentication_error') {
        throw error;
      }

      // Retry timeouts with backoff
      if (attempt < maxRetries && error.errorType === 'timeout_error') {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
```

#### 3. Progressive Enhancement
```javascript
async function getDataWithFallback(primaryParams, fallbackParams) {
  try {
    // Try optimal query first
    return await searchFlows(primaryParams);
  } catch (error) {
    if (error.errorType === 'timeout_error') {
      console.warn('Primary query timed out, trying fallback...');
      // Use simpler/smaller fallback query
      return await searchFlows(fallbackParams);
    }
    throw error;
  }
}

// Usage
const results = await getDataWithFallback(
  { query: "protocol:tcp AND ts:>24h", limit: 500 }, // Optimal
  { query: "protocol:tcp AND ts:>1h", limit: 100 }   // Fallback
);
```

This comprehensive troubleshooting guide provides solutions for the most common issues encountered with the Firewalla MCP Server. Always start with the quick diagnostic checklist before proceeding to specific troubleshooting sections. For issues not covered in this guide, check the error handling documentation and enable debug mode for detailed error analysis.