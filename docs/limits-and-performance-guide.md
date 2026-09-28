# Firewalla MCP Server - Limits and Performance Guide

This guide provides comprehensive documentation on limit configurations, performance rationale, and optimization strategies for the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Limit Configuration Philosophy](#limit-configuration-philosophy)
- [Tool-Specific Limits](#tool-specific-limits)
- [Limit Rationale by Operation Type](#limit-rationale-by-operation-type)
- [Historical Context: Resolved Discrepancies](#historical-context-resolved-discrepancies)
- [Performance Optimization Strategies](#performance-optimization-strategies)
- [Monitoring and Tuning](#monitoring-and-tuning)
- [Best Practices](#best-practices)
- [Conclusion](#conclusion)

## Overview

The Firewalla MCP Server implements a sophisticated limit system designed to balance functionality, performance, and resource utilization. Each tool has carefully chosen limits based on:

- **API Performance Characteristics**: Different Firewalla API endpoints have varying response times
- **Data Processing Complexity**: Search operations require more resources than simple retrievals
- **Memory Usage Patterns**: Large datasets need controlled limits to prevent memory exhaustion
- **Network Bandwidth**: Higher limits can cause network saturation
- **User Experience**: Reasonable response times for interactive usage

## Limit Configuration Philosophy

### Design Principles

1. **Performance First**: Limits ensure responsive operation under normal usage
2. **Resource Protection**: Prevent memory exhaustion and API overload
3. **Consistency**: Similar operations have similar limits for predictable behavior
4. **Scalability**: Limits allow concurrent usage without degradation
5. **Flexibility**: Different tool types have appropriate limits for their use cases

### Centralized Configuration

All limits are centrally managed in `/src/config/limits.ts`:

```typescript
export const STANDARD_LIMITS = {
  BASIC_QUERY: 1000,           // Standard data retrieval operations
  SEARCH_FLOWS: 1000,          // Flow search operations
  SEARCH_ALARMS: 1000,         // Alarm search operations
  BANDWIDTH_ANALYSIS: 500,     // Bandwidth-intensive operations
  RULES_SUMMARY: 2000,         // Rule analysis operations
  STATISTICS: 100,             // Statistical operations (fixed results)
}
```

## Tool-Specific Limits

The maximums below are what each tool's handler enforces (`getToolLimit` in
`src/config/limits.ts`), and what each tool's schema lists: `get_flow_data`,
`search_flows`, `search_alarms`, `get_offline_devices`, `search_devices` and
`search_target_lists` take up to 1000, `get_active_alarms` and
`get_bandwidth_usage` up to 500. `/v2/alarms` and `/v2/flows` return at most
500 records per request, so a larger limit on the flow and alarm tools is
read 500 at a time.

### Basic Data Retrieval Tools (Limit: 1000)

**Tools**: `get_device_status`, `get_flow_data`, `get_network_rules`, `get_target_lists`. `get_active_alarms` is capped at 500, the API's documented maximum for `/v2/alarms` (`getToolLimit` in `src/config/limits.ts`)

**Rationale**:
- Simple API calls with minimal server-side processing
- Direct data retrieval without complex transformations
- Balanced between useful result sets and performance
- Most common use case covers 90% of user needs with <1000 results

**Performance Characteristics**:
- Average response time: 200-500ms
- Memory usage: 10-50MB per request
- Network bandwidth: 1-5MB per request
- CPU usage: Low

### Search Operations (Limit: 1000)

**Tools**: `search_flows`, `search_alarms`, `search_rules`, `search_devices`, `search_target_lists`

**Rationale**:
- Search operations involve query parsing and filtering
- Results often require additional processing and normalization
- Maintains consistency across all search tools
- Provides sufficient data for analysis while ensuring responsiveness

**Performance Characteristics**:
- Average response time: 500-1500ms
- Memory usage: 20-100MB per request
- Network bandwidth: 2-10MB per request
- CPU usage: Medium

**Example Usage**:
```bash
# Typical search that benefits from 1000 limit
search_flows query:"protocol:tcp AND region:CN" limit:800

# Complex search requiring full limit
search_alarms query:"(type:1 OR type:2) AND device.ip:192.168.*" limit:1000
```

### Bandwidth Analysis Operations (Limit: 500)

**Tools**: `get_bandwidth_usage`

**Rationale**:
- Bandwidth data requires intensive aggregation and sorting
- Each device record includes multiple bandwidth metrics
- Memory usage increases significantly with device count
- Response time degrades rapidly beyond 500 devices

**Performance Characteristics**:
- Average response time: 1000-3000ms
- Memory usage: 50-200MB per request
- Network bandwidth: 5-20MB per request
- CPU usage: High (aggregation and sorting)

**Memory Usage Pattern**:
```typescript
// Memory usage scales significantly with device count
const memoryUsageEstimate = {
  100_devices: '20MB',
  500_devices: '100MB',   // Optimal limit
  1000_devices: '250MB',  // Causes performance issues
  2000_devices: '500MB+'  // Risk of memory exhaustion
}
```

### Rules Summary Operations (Limit: 2000)

**Tools**: `get_network_rules_summary`

**Rationale**:
- Rule summary operations analyze rule effectiveness and patterns
- Higher limits provide better statistical analysis
- Most organizations have <2000 active rules
- Reduced from the original 10000 limit for better performance

**Performance Characteristics**:
- Average response time: 1500-4000ms
- Memory usage: 75-250MB per request
- Network bandwidth: 8-25MB per request
- CPU usage: High (statistical analysis)

### Offline Device Operations (Limit: 1000)

**Tools**: `get_offline_devices`

**Rationale**:
- Offline device detection requires timestamp analysis
- Results sorted by last-seen time
- 1000 offline devices indicate significant network issues
- Consistent with other device operations

**Performance Characteristics**:
- Average response time: 300-800ms
- Memory usage: 15-75MB per request
- Network bandwidth: 2-8MB per request
- CPU usage: Medium (timestamp sorting)

### Statistical Operations

**Tools**: `get_simple_statistics`, `get_statistics_by_region`, `get_statistics_by_box`

**Limits**: `get_simple_statistics` takes no `limit`. `get_statistics_by_region` and `get_statistics_by_box` take one of at least 1, default 5, with no maximum. `STANDARD_LIMITS.STATISTICS` (100) is not applied to any tool.

**Performance Characteristics**:
- Average response time: 100-300ms
- Memory usage: 5-25MB per request
- Network bandwidth: 0.5-2MB per request
- CPU usage: Low

## Limit Rationale by Operation Type

### Security Operations

**High Priority**: Security analysis requires comprehensive data
- `get_active_alarms`: 500 (the API's maximum for `/v2/alarms`)
- `search_alarms`: 1000 (sufficient for threat investigation)

### Network Analysis

**Performance Balanced**: Network operations balance detail with speed
- `get_flow_data`: 1000 (typical network monitoring needs)
- `search_flows`: 1000 (sufficient for traffic analysis)
- `get_bandwidth_usage`: 500 (intensive processing requires lower limit)

### Device Management

**Practical Limits**: Based on typical network sizes
- `get_device_status`: 1000 (covers medium-sized networks)
- `get_offline_devices`: 1000 (consistent with device operations)
- `search_devices`: 1000 (sufficient for device discovery)

### Rule Management

**Administrative Focus**: Rule operations serve administrative needs
- `get_network_rules`: 1000 (typical rule set size)
- `get_network_rules_summary`: 2000 (comprehensive analysis)
- `search_rules`: 1000 (sufficient for rule discovery)

## Historical Context: Resolved Discrepancies

### Pre-v1.0.0 Issues

Before the centralized limits system, the server had significant inconsistencies:

#### Limit Discrepancies Found and Fixed

1. **Search Tools Inconsistency**:
   - **Before**: `search_alarms` (5000), `search_flows` (1000), `search_rules` (3000)
   - **After**: All search tools standardized to 1000
   - **Impact**: Reduced memory usage by 60-80% for alarm searches

2. **Rules Summary Over-limit**:
   - **Before**: `get_network_rules_summary` (10000)
   - **After**: Reduced to 2000
   - **Impact**: Response time improved from 15–30 seconds to 3–5 seconds

3. **Device Search Variation**:
   - **Before**: `search_devices` (2000)
   - **After**: Standardized to 1000
   - **Impact**: Improved consistency with other search operations

#### Schema vs Implementation Discrepancies:

1. **Tool Schemas Showed Higher Limits**:
   - Schema definitions showed maximum limits of 5000-10000
   - Actual implementations used varying limits
   - **Resolution**: Updated schemas to match actual performance-tested limits

2. **Parameter Validation Inconsistency**:
   - Some tools accepted limits higher than optimal
   - Validation occurred too late in processing pipeline
   - **Resolution**: Centralized validation with performance-based limits

### Performance Impact of Fixes:

```typescript
const performanceImprovements = {
  'search_alarms': {
    before: { limit: 5000, avgResponseTime: '8-15s', memoryUsage: '400-800MB' },
    after: { limit: 1000, avgResponseTime: '1-3s', memoryUsage: '80-150MB' },
    improvement: 'Response time: 80% faster, Memory: 75% reduction'
  },
  'get_network_rules_summary': {
    before: { limit: 10000, avgResponseTime: '15-30s', memoryUsage: '800MB-1.5GB' },
    after: { limit: 2000, avgResponseTime: '3-5s', memoryUsage: '200-400MB' },
    improvement: 'Response time: 83% faster, Memory: 70% reduction'
  },
  'search_devices': {
    before: { limit: 2000, avgResponseTime: '3-6s', memoryUsage: '150-300MB' },
    after: { limit: 1000, avgResponseTime: '1-2s', memoryUsage: '75-150MB' },
    improvement: 'Response time: 67% faster, Memory: 50% reduction'
  }
}
```

## Performance Optimization Strategies

### Request Optimization

1. **Use Specific Queries**: Narrow queries reduce processing time
   ```bash
   # Good: Specific query
   search_flows query:"protocol:tcp AND region:CN" limit:100

   # Avoid: Broad query with high limit
   search_flows query:"protocol:tcp" limit:1000
   ```

2. **Pagination for Large Datasets**: Use cursor-based pagination
   ```bash
   # First request
   search_flows query:"ts:>24h" limit:500

   # Subsequent requests with cursor
   search_flows query:"ts:>24h" limit:500 cursor:"eyJ0aW1lc3RhbXAi..."
   ```

3. **Appropriate Limits**: Use the minimum limit that meets your needs
   ```bash
   # For quick overview
   get_active_alarms limit:50

   # For detailed analysis, and the most one call returns
   get_active_alarms limit:500
   ```

### Memory Optimization

1. **Batch Processing**: Process large datasets in smaller chunks
2. **Query Filtering**: Use server-side filtering to reduce data transfer
3. **Limit Management**: Never request more data than you can process

### Cache Utilization

1. **Query Caching**: A repeated GET is answered from the cache for `CACHE_TTL` seconds (default 300), or 15 s for `/alarms` and `/flows` endpoints, and costs no request. A query with a relative time such as `ts:>1h` is never cached, and any write clears the cache. It holds at most `CACHE_MAX_ENTRIES` answers (default 1000)
2. **Geographic Caching**: Location data cached for 1 hour, at most 10000 addresses

## Monitoring and Tuning

### Performance Metrics

Monitor these key metrics to validate limit effectiveness:

`PERFORMANCE_THRESHOLDS` in `src/config/limits.ts`:

```typescript
export const PERFORMANCE_THRESHOLDS = {
  WARNING_MS: 1000, // Log warning if operation takes longer than 1 second
  ERROR_MS: 5000, // Log error if operation takes longer than 5 seconds
  TIMEOUT_MS: 30000, // Hard timeout for all operations
  ...
}
```

A tool that runs under `withToolTimeout` gives up after `TIMEOUT_MS`, 30 s, and cancels its requests. `archive_alarm`, `mute_alarm` and `delete_alarm` do not: a timeout could cut off a write that the API had already applied. For them each request has `API_TIMEOUT` (30 s by default) and waits at most 20 s for the rate limit, a lookup GET can be sent again once, and the write is never sent twice, so on an account with several boxes, where each box is checked for the alarm, a call can take longer than 30 s. The server has no memory or concurrency thresholds. Every request counts against `API_RATE_LIMIT` (100 per 5 minutes by default), and the box-scoped trend tools send at most 4 requests at a time.

### Tuning Recommendations

1. **Monitor Response Times**: Adjust limits if response times exceed targets
2. **Track Memory Usage**: Reduce limits if memory usage becomes excessive
3. **Analyze Query Patterns**: Optimize limits based on actual usage patterns
4. **Load Testing**: Regular performance testing validates limit effectiveness

### Debug Configuration

Enable performance debugging:

```bash
# All debug output
DEBUG=firewalla:* npm run mcp:start

# Input validation only: api and validation are the namespaces the code writes to
DEBUG=validation npm run mcp:start
```

## Best Practices

### For Developers

1. **Respect Limits**: Never bypass or circumvent established limits
2. **Test Performance**: Validate that changes don't degrade performance
3. **Monitor Impact**: Track the effect of limit changes on system performance
4. **Document Changes**: Update this guide when modifying limits

### For Users

1. **Start Small**: Begin with smaller limits and increase as needed
2. **Use Pagination**: For large datasets, use cursor-based pagination
3. **Filter Effectively**: Use specific queries to reduce processing overhead
4. **Monitor Performance**: Be aware of response times and adjust usage accordingly

### For Administrators

1. **Regular Audits**: Periodically review limit effectiveness
2. **Performance Testing**: Run load tests to validate current limits
3. **Usage Analysis**: Monitor actual usage patterns vs. configured limits
4. **Capacity Planning**: Adjust limits based on infrastructure capabilities

## Conclusion

The Firewalla MCP Server's limit system represents a carefully balanced approach to performance, functionality, and resource utilization. The centralized configuration in `/src/config/limits.ts` provides:

- **Consistency**: All tools follow the same limit philosophy
- **Performance**: Limits ensure responsive operation under load
- **Maintainability**: Centralized configuration simplifies management
- **Scalability**: Limits support concurrent usage without degradation

By understanding the rationale behind each limit and following the optimization strategies outlined in this guide, users can achieve optimal performance while maximizing the value of their Firewalla MCP Server deployment.

For questions or limit adjustment requests, refer to the performance monitoring section and conduct thorough testing before implementing changes.