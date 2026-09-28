# Firewalla MCP Server - Limits and Performance Guide

This guide provides comprehensive documentation on limit configurations, performance rationale, and optimization strategies for the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Limit Configuration Philosophy](#limit-configuration-philosophy)
- [Limits by tool](#limits-by-tool)
- [History](#history)
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

## Limits by tool

Each tool's handler takes up to the maximum below (`getToolLimit` in
`src/config/limits.ts`), and over it answers
`limit is too large ... (got N, maximum: M)`. From 2.0.0 each tool's schema
lists the same default and maximum. Up to 1.5.0 the schemas list 500 for
`get_flow_data`, `search_flows`, `search_alarms`, `get_offline_devices`,
`search_devices` and `search_target_lists`, no maximum for `search_rules`
and no `limit` for `get_network_rules_summary`, and an MCP client that
checks arguments against the schema refuses more than it lists.

| Tool | Default | Maximum |
|---|---|---|
| `get_active_alarms` | 200 | 500, the API's documented maximum for `/v2/alarms` |
| `get_flow_data`, `search_flows`, `search_alarms` | 200 | 1000 |
| `get_device_status`, `get_network_rules`, `get_target_lists` | required | 1000 |
| `search_rules` | 200 | 1000 |
| `search_devices` | 50 | 1000 |
| `search_target_lists`, `get_offline_devices` | 100 | 1000 |
| `get_bandwidth_usage` | 10 | 500 |
| `get_network_rules_summary` | 200 | 2000 |
| `get_statistics_by_region`, `get_statistics_by_box` | 5 | none; at least 1 |

`get_network_rules_summary` sends its `limit` to `GET /v2/rules`, and the
API documents no limit for rules. `get_simple_statistics`,
`get_flow_insights` and the trend tools take no `limit`.

`/v2/alarms` and `/v2/flows` return at most 500 records per request, so
`get_flow_data`, `search_flows` and `search_alarms` read a larger limit in
pages of 500 (a limit of 700 sends `limit=500` first). Each page is a
request against the rate limit and the 30 s tool timeout.

## History

`src/config/limits.ts` records earlier caps: 5000 for `search_alarms`, 3000
for `search_rules`, 2000 for `search_devices` and 10000 for
`get_network_rules_summary`. They are now 1000, and 2000 for the summary.
Earlier versions of this guide gave response times, memory use and percentage
gains for that change; nothing in the repository measured them, so they are
gone, as are the per-tool response time and memory figures.

## Performance Optimization Strategies

### Request Optimization

1. **Use Specific Queries**: Narrow queries reduce processing time
   ```bash
   # Good: Specific query
   search_flows query:"protocol:tcp AND region:CN" limit:100

   # Avoid: Broad query with high limit
   search_flows query:"protocol:tcp" limit:500
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

   # For detailed analysis; 500 is the most a single call returns
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