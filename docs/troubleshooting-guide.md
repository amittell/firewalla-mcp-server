# Firewalla MCP Server - Comprehensive Troubleshooting Guide

This guide provides step-by-step troubleshooting procedures for common issues encountered with the Firewalla MCP Server. Each section includes symptom identification, root cause analysis, and actionable solutions.

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
   curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
        "https://$FIREWALLA_MSP_ID/v2/boxes/$FIREWALLA_BOX_ID/alarms?limit=1"
   ```

3. **MCP Server Status**
   ```bash
   npm run mcp:test
   ```

4. **Recent Error Logs**
   ```bash
   tail -n 50 logs/error.log
   ```

### Quick Error Identification

| Error Pattern | Likely Cause | Quick Fix |
|---------------|--------------|-----------|
| "parameter is required" | Missing parameter | Add the required parameter |
| "Authentication failed" | Invalid credentials | Check environment variables |
| "timed out after" | Performance issue | Reduce scope or use filters |
| "Query is too long" | Query exceeds limits | Shorten or simplify query |
| "Field 'X' is not allowed" | Invalid field name | Check valid field names |
| "Network error" | Connectivity issue | Check network and retry |

## Common Error Categories

### Understanding Error Types

The MCP server categorizes errors into specific types to help with troubleshooting:

#### 1. Validation Errors (`validation_error`)
- **Cause**: Parameter format, type, or value issues
- **Response Time**: < 500ms (immediate)
- **Recovery**: Fix parameters and retry immediately
- **Examples**: Missing required parameters, invalid types, out-of-range values

#### 2. Timeout Errors (`timeout_error`)
- **Cause**: Operations exceeding time limits
- **Response Time**: > 10 seconds
- **Recovery**: Optimize query or reduce scope
- **Examples**: Large dataset processing, complex correlations

#### 3. Authentication Errors (`authentication_error`)
- **Cause**: Invalid or expired credentials
- **Response Time**: 200ms - 2 seconds
- **Recovery**: Fix authentication configuration
- **Examples**: Invalid MSP token, insufficient permissions

#### 4. Network Errors (`network_error`)
- **Cause**: Connectivity or infrastructure issues
- **Response Time**: Variable (5-30 seconds)
- **Recovery**: Check network and retry
- **Examples**: DNS failures, connection timeouts

## Parameter Validation Issues

### Missing Required Parameters

**Symptom**: `"parameter is required"` error

**Common Cases**:
```json
{
  "error": true,
  "message": "limit parameter is required",
  "tool": "search_flows",
  "errorType": "validation_error"
}
```text

**Solution Steps**:
1. **Identify Missing Parameter**: Check the error message for the specific parameter name
2. **Add Required Parameter**: Include the parameter with a valid value
3. **Verify Parameter Type**: Ensure the parameter is the correct type (number, string, etc.)

**Examples**:
```javascript
// ❌ Incorrect - missing limit parameter
{ query: "severity:high" }

// ✅ Correct - includes required limit
{ query: "severity:high", limit: 100 }
```text

### Invalid Parameter Types

**Symptom**: `"must be a [type], got [other_type]"` error

**Common Cases**:
```json
{
  "error": true,
  "message": "limit must be a number, got string",
  "errorType": "validation_error"
}
```text

**Solution Steps**:
1. **Check Parameter Type**: Verify you're passing the correct data type
2. **Convert If Needed**: Use proper type conversion
3. **Validate Range**: Ensure numeric parameters are within valid ranges

**Examples**:
```javascript
// ❌ Incorrect - string instead of number
{ query: "severity:high", limit: "100" }

// ✅ Correct - proper number type
{ query: "severity:high", limit: 100 }
```text

### Parameter Range Violations

**Symptom**: `"exceeds system limits"` or `"out of range"` error

**Common Limits**:
- `limit`: 1 - 10,000
- `duration`: 1 - 1,440 minutes
- `query`: Maximum 2,000 characters

**Solution Steps**:
1. **Check Current Limits**: Review the error message for specific limits
2. **Adjust Parameter**: Use a value within the valid range
3. **Use Pagination**: For large datasets, use pagination instead of large limits

**Examples**:
```javascript
// ❌ Incorrect - exceeds maximum limit
{ query: "severity:high", limit: 50000 }

// ✅ Correct - within valid range
{ query: "severity:high", limit: 1000 }

// ✅ Alternative - use pagination
{ query: "severity:high", limit: 1000, cursor: "page_token" }
```text

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
{ query: "severity:high", limit: 100 }
// cursor omitted since it's optional
```text

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
```text

**Solutions**:
1. **Regenerate Token**: Create new token in Firewalla MSP portal
2. **Update Environment**: Set new token in environment variables
3. **Verify Permissions**: Ensure token has read/write permissions as needed

### Invalid Box ID

**Symptom**: `"Box not found"` error

**Diagnostic Steps**:
1. **Check Box ID Format**: Should be UUID format (e.g., `1eb71e38-3a95-4371-8903-ace24c83ab49`)
2. **Verify Box Exists**: Check in MSP portal
3. **Test Box Access**: Try accessing box directly

```bash
# Test box access
curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
     "https://$FIREWALLA_MSP_ID/v2/boxes/$FIREWALLA_BOX_ID" \
     -w "HTTP Status: %{http_code}\n"
```text

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
```text

**Solutions**:
1. **Verify Domain**: Check correct MSP domain in portal
2. **Update Environment**: Set correct `FIREWALLA_MSP_ID`
3. **Check Firewall**: Ensure outbound HTTPS access is allowed

## Timeout and Performance Issues

### Large Dataset Timeouts

**Symptom**: `"Query timeout: Dataset too large"` error

**Common Causes**:
- Query returns > 10,000 potential results
- Complex correlation analysis on > 5,000 entities
- Geographic enrichment on > 2,000 flows
- Long time ranges (> 7 days)

**Solution Strategies**:

#### 1. Add Time Filters
```javascript
// ❌ Too broad - likely to timeout
{ query: "protocol:tcp", limit: 2000 }

// ✅ Add time filter
{ query: "protocol:tcp AND timestamp:>NOW-1h", limit: 2000 }
```text

#### 2. Use More Specific Filters
```javascript
// ❌ Too general
{ query: "severity:>=low", limit: 1000 }

// ✅ More specific
{ query: "severity:high AND source_ip:192.168.*", limit: 1000 }
```text

#### 3. Reduce Limit and Use Pagination
```javascript
// ❌ Large limit - may timeout
{ query: "severity:high", limit: 5000 }

// ✅ Smaller limit with pagination
{ query: "severity:high", limit: 500, cursor: null }
// Then use returned cursor for next page
```text

#### 4. Split Complex Queries
```javascript
// ❌ Complex correlation - may timeout
search_enhanced_cross_reference({
  primary_query: "protocol:tcp",
  secondary_queries: ["severity:high", "online:false"],
  correlation_params: {
    correlationFields: ["source_ip", "destination_ip", "country", "asn"],
    correlationType: "AND"
  },
  limit: 5000
})

// ✅ Simplified correlation
search_enhanced_cross_reference({
  primary_query: "protocol:tcp AND timestamp:>NOW-1h",
  secondary_queries: ["severity:high"],
  correlation_params: {
    correlationFields: ["source_ip"],
    correlationType: "AND"
  },
  limit: 1000
})
```text

### Network Timeouts

**Symptom**: `"Network timeout"` or `"ETIMEDOUT"` error

**Diagnostic Steps**:
1. **Test Basic Connectivity**: Use curl to test API access
2. **Check Network Latency**: Measure response times
3. **Verify DNS Resolution**: Ensure domain resolves correctly

```bash
# Test network connectivity with timing
time curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
          "https://$FIREWALLA_MSP_ID/v2/boxes/$FIREWALLA_BOX_ID/alarms?limit=1"
```text

**Solutions**:
1. **Retry with Backoff**: Implement exponential backoff retry logic
2. **Check Network Path**: Verify routing and firewall rules
3. **Use Smaller Requests**: Reduce request complexity temporarily

### Processing Timeouts

**Symptom**: Operations exceed 10-second processing limit

**Common Scenarios**:
- Bandwidth analysis on > 1,000 devices
- Complex geographic searches
- Large-scale cross-reference operations

**Optimization Strategies**:

#### 1. Bandwidth Analysis Optimization
```javascript
// ❌ May timeout with large networks
get_bandwidth_usage({ period: "30d", limit: 1000 })

// ✅ Optimized approach
get_bandwidth_usage({ period: "24h", limit: 100 })
```text

#### 2. Geographic Search Optimization
```javascript
// ❌ Too broad geographic search
search_flows_by_geography({
  query: "bytes:>1000000",
  geographic_filters: {
    continents: ["Asia", "Europe", "Africa", "North America"]
  },
  limit: 2000
})

// ✅ More focused geographic search
search_flows_by_geography({
  query: "bytes:>1000000 AND timestamp:>NOW-6h",
  geographic_filters: {
    countries: ["China", "Russia"]
  },
  limit: 500
})
```text

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
const countries = ["China", null, "", undefined, "Russia"];

// ✅ Clean filter array
const countries = ["China", "Russia"].filter(c => c && c.trim().length > 0);
```text

#### 2. Use Proper Country Codes
```javascript
// ❌ Inconsistent formats
{ countries: ["USA", "cn", "RUSSIA"] }

// ✅ Consistent ISO codes or names
{ countries: ["United States", "China", "Russia"] }
// OR
{ countries: ["US", "CN", "RU"] }
```text

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
```text

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
```text

#### 2. Normalize Geographic Data
```javascript
function normalizeGeoFilters(filters) {
  const normalized = {};

  if (filters.countries) {
    normalized.countries = filters.countries
      .filter(c => c && typeof c === 'string' && c.trim().length > 0)
      .map(c => c.trim());
  }

  if (filters.continents) {
    normalized.continents = filters.continents
      .filter(c => c && typeof c === 'string' && c.trim().length > 0)
      .map(c => c.trim());
  }

  return normalized;
}
```text

### Geographic Query Construction Issues

**Symptom**: Complex geographic queries not working correctly

**Common Problems**:
- Incorrect OR logic construction
- Missing quotes for multi-word locations
- Conflicting geographic hierarchies

**Solutions**:

#### 1. Proper OR Logic Construction
```javascript
// ❌ Incorrect query construction
const countries = ["China", "Russia"];
const query = `country:${countries.join(",")}`; // Wrong!

// ✅ Correct OR logic
function buildCountryQuery(countries) {
  if (!countries || countries.length === 0) return '';

  if (countries.length === 1) {
    return `country:${countries[0]}`;
  }

  const countryQueries = countries.map(country =>
    country.includes(' ') ? `country:"${country}"` : `country:${country}`
  );

  return `(${countryQueries.join(' OR ')})`;
}
```text

#### 2. Handle Special Characters
```javascript
function escapeGeoValue(value) {
  // Quote values with spaces or special characters
  if (/[\s&'().]/.test(value)) {
    return `"${value}"`;
  }
  return value;
}

// Usage
const cityQuery = `city:${escapeGeoValue("New York")}`;  // city:"New York"
const countryQuery = `country:${escapeGeoValue("China")}`;  // country:China
```text

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
```text

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
```text

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
```text

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
```text

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
```text

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
```text

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
```text

**Solutions**:
1. **Update System Time**: Ensure system clock is accurate
2. **Update CA Certificates**: Refresh certificate authorities
3. **Check Certificate Chain**: Verify complete certificate chain

### Firewall and Proxy Issues

**Symptom**: Connection refused or hanging connections

**Diagnostic Steps**:
```bash
# Test direct connection
telnet $FIREWALLA_MSP_ID 443

# Check for proxy interference
curl -v "https://$FIREWALLA_MSP_ID" --proxy ""

# Test with proxy if required
curl -v "https://$FIREWALLA_MSP_ID" --proxy "http://proxy:port"
```text

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

# Enable specific debug categories
DEBUG=cache,performance,api npm run mcp:start
DEBUG=validation,error-handler npm run mcp:start
DEBUG=query,optimization npm run mcp:start
```text

### Error Log Analysis

Check specific log files for detailed error information:

```bash
# Check recent errors
tail -f logs/error.log

# Check specific tool errors
grep "search_flows" logs/error.log | tail -20

# Check authentication errors
grep "authentication" logs/error.log | tail -10

# Check timeout errors
grep "timeout" logs/error.log | tail -10
```text

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
```text

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
```text

## Performance Optimization

### Query Optimization Strategies

#### 1. Use Specific Time Ranges
```javascript
// ❌ No time filter - processes all historical data
{ query: "severity:high", limit: 1000 }

// ✅ Recent data only
{ query: "severity:high AND timestamp:>NOW-1h", limit: 1000 }
```text

#### 2. Combine Related Filters
```javascript
// ❌ Multiple separate queries
const flows = await searchFlows({ query: "protocol:tcp", limit: 500 });
const alarms = await searchAlarms({ query: "severity:high", limit: 500 });

// ✅ Single correlated query
const results = await searchCrossReference({
  primary_query: "protocol:tcp",
  secondary_queries: ["severity:high"],
  correlation_field: "source_ip",
  limit: 500
});
```text

#### 3. Use Appropriate Limits
```javascript
// ❌ Unnecessarily large limit
{ query: "severity:high", limit: 10000 }

// ✅ Reasonable limit with pagination
{ query: "severity:high", limit: 100, cursor: null }
```text

### Caching Optimization

#### 1. Leverage Built-in Caching
```javascript
// Cache-friendly queries (avoid frequently changing parameters)
const baseQuery = "protocol:tcp AND severity:high";

// ❌ Cache-busting query
const query = `${baseQuery} AND timestamp:>${Date.now()}`;

// ✅ Cache-friendly query
const query = `${baseQuery} AND timestamp:>NOW-1h`;
```text

#### 2. Batch Related Requests
```javascript
// ❌ Multiple individual requests
const devices = await getDeviceStatus({ limit: 100 });
const alarms = await getActiveAlarms({ limit: 100 });
const rules = await getNetworkRules({ limit: 100 });

// ✅ Use tools that fetch related data together
const dashboard = await getSimpleStatistics();
// Includes summary data for devices, alarms, and rules
```text

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
```text

#### 2. Graceful Error Handling
```javascript
async function resilientOperation(operation, maxRetries = 3) {
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

      // Retry network and timeout errors with backoff
      if (attempt < maxRetries &&
          (error.errorType === 'network_error' || error.errorType === 'timeout_error')) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
```text

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
  { query: "protocol:tcp AND timestamp:>NOW-24h", limit: 1000 }, // Optimal
  { query: "protocol:tcp AND timestamp:>NOW-1h", limit: 100 }    // Fallback
);
```text

This comprehensive troubleshooting guide provides solutions for the most common issues encountered with the Firewalla MCP Server. Always start with the quick diagnostic checklist before proceeding to specific troubleshooting sections. For issues not covered in this guide, check the error handling documentation and enable debug mode for detailed error analysis.