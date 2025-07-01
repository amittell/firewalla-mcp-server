# Intelligent Caching System - Firewalla MCP Server

## Overview

The Firewalla MCP Server now includes a comprehensive intelligent caching system that significantly improves performance through data-specific caching strategies, smart invalidation, and advanced monitoring.

## Architecture

### Core Components

1. **Data-Specific Cache Strategies** (`src/cache/cache-strategies.ts`)
   - Optimized TTL values based on data volatility
   - Entity-specific invalidation events
   - Background refresh configuration
   - Compression settings for large datasets

2. **Smart Cache Invalidation** (`src/cache/invalidation-manager.ts`)
   - Event-driven invalidation with pattern matching
   - Cross-entity cache invalidation
   - Performance monitoring and statistics
   - Error handling and graceful degradation

3. **Enhanced FirewallaClient** (`src/firewalla/client.ts`)
   - Strategy-aware cache management
   - CacheManagerInterface implementation
   - Enhanced cache statistics
   - Seamless integration with existing API calls

4. **Advanced Monitoring** (`src/monitoring/metrics.ts`)
   - Cache performance metrics
   - Strategy-specific statistics
   - Hit/miss ratio tracking
   - Invalidation event monitoring

## Cache Strategies by Entity Type

| Entity Type | TTL | Background Refresh | Volatility | Use Case |
|-------------|-----|-------------------|------------|----------|
| **Alarms** | 30s | No | High | Real-time security alerts |
| **Flows** | 30s | No | High | Real-time network traffic |
| **Devices** | 2min | Yes | Medium | Device status monitoring |
| **Rules** | 10min | Yes | Low | Firewall rule management |
| **Target Lists** | 1hr | Yes | Very Low | Static block/allow lists |
| **Search** | 5min | Yes | Medium | Complex query results |
| **Statistics** | 15min | Yes | Low | Aggregated analytics |
| **Trends** | 10min | Yes | Medium | Time-series data |

## Usage Examples

### Basic Cache Operations

```typescript
import { FirewallaClient } from './src/firewalla/client.js';
import { DataCacheStrategies } from './src/cache/cache-strategies.js';

const client = new FirewallaClient(config);

// Get detailed cache statistics
const stats = client.getDetailedCacheStats();
console.log(`Cache size: ${stats.size}`);
console.log(`Strategy breakdown:`, stats.strategySummary);
console.log(`Average TTL: ${stats.averageTTL}ms`);

// Get cache strategy summary
const strategies = client.getCacheStrategySummary();
console.log('Cache strategies:', strategies);
```

### Cache Invalidation

```typescript
// Trigger invalidation by event
await client.invalidateByEvent('rule_updated');

// Trigger invalidation by data change
await client.invalidateByDataChange('devices', 'update', 'device123');

// Get invalidation statistics
const invalidationStats = client.getInvalidationStats();
console.log('Total invalidation events:', invalidationStats.totalEvents);
console.log('Recent events:', invalidationStats.recentEvents);
```

### Custom Cache Strategy

```typescript
// Get specific strategy configuration
const alarmStrategy = DataCacheStrategies.getAlarmsStrategy();
console.log(`Alarm TTL: ${alarmStrategy.ttl}ms`);
console.log(`Background refresh: ${alarmStrategy.backgroundRefresh}`);
console.log(`Invalidation events:`, alarmStrategy.invalidationEvents);

// Generate cache key using strategy
const cacheKey = alarmStrategy.keyGenerator('severity:high', 100, 'recent');
console.log(`Generated key: ${cacheKey}`);
```

## Performance Benefits

### Expected Improvements

- **80%+ cache hit rate** for frequently accessed data
- **50%+ reduction** in API calls for static/semi-static data
- **30%+ improvement** in response times for cached operations
- **Intelligent invalidation** with minimal false positives

### Resource Optimization

- **Reduced API Load**: Fewer requests to Firewalla MSP API
- **Improved Responsiveness**: Faster response times for users
- **Better Scalability**: Cache enables handling more concurrent users
- **Network Efficiency**: Reduced bandwidth usage for repetitive data

## Monitoring and Analytics

### Cache Performance Metrics

```typescript
// Monitor cache operations
metrics.recordCacheHit('rules', 'fw:rules');
metrics.recordCacheMiss('alarms', 'fw:alarms');
metrics.recordCacheInvalidation('rule_updated', 5);

// Set strategy statistics
metrics.setCacheStrategyStats('devices', 150, 120000);
```

### Available Metrics

- `firewalla_cache_hits_total` - Cache hits by entity type and strategy
- `firewalla_cache_misses_total` - Cache misses by entity type and strategy  
- `firewalla_cache_invalidations_total` - Invalidation events by type
- `firewalla_cache_invalidation_keys` - Number of keys invalidated per event
- `firewalla_cache_ttl_ms` - TTL distribution by entity type
- `firewalla_cache_strategy_entries` - Active entries per strategy
- `firewalla_cache_strategy_avg_ttl_ms` - Average TTL per strategy

## Configuration

### Environment Variables

```bash
# Basic cache configuration (existing)
CACHE_TTL=300  # Default TTL in seconds (used as fallback)

# The intelligent caching system uses strategy-specific TTLs
# No additional configuration required
```

### Strategy Customization

```typescript
// Example: Create custom strategy for new entity type
const customStrategy: CacheStrategy = {
  ttl: 5 * 60 * 1000, // 5 minutes
  keyGenerator: (id: string) => `custom:${id}`,
  invalidationEvents: ['custom_updated'],
  refreshThreshold: 0.7,
  backgroundRefresh: true,
  keyPrefix: 'fw:custom'
};
```

## Testing

### Run Cache Tests

```bash
# Run all cache tests
npm test -- tests/cache

# Run specific test suites
npm test -- tests/cache/cache-strategies.test.ts
npm test -- tests/cache/invalidation-manager.test.ts
npm test -- tests/cache/firewalla-client-cache.test.ts
```

### Test Coverage

- **Cache Strategies**: TTL validation, key generation, strategy selection
- **Invalidation Manager**: Pattern matching, event handling, error recovery
- **Client Integration**: Cache operations, statistics, TTL management
- **Performance**: Large-scale operations, timing validation

## Advanced Features

### Smart Invalidation Patterns

```typescript
// Wildcard pattern matching
await invalidationManager.invalidateByEvent('rule_updated', cacheManager);
// Invalidates: fw:rules:*, fw:search:rules:*, fw:statistics:*

// Cross-entity invalidation
await invalidationManager.invalidateByDataChange('devices', 'update', cacheManager);
// Invalidates: fw:devices:*, fw:search:devices:*
```

### Cache Key Generation

```typescript
// Consistent key generation regardless of parameter order
const key1 = getCacheKey('/v2/alarms', { limit: 100, query: 'test' });
const key2 = getCacheKey('/v2/alarms', { query: 'test', limit: 100 });
// key1 === key2 (true)

// Box-specific cache isolation
// Keys include box ID to prevent cross-contamination
const key = getCacheKey('/v2/rules', { limit: 50 });
// Result: "fw:box-123:GET:v2_rules:eyJsaW1pdCI6NTB9"
```

### Error Handling

```typescript
// Graceful degradation on cache failures
try {
  const data = await client.getActiveAlarms();
  // Cache hit/miss handled transparently
} catch (error) {
  // API errors don't affect cache operations
  // Cache errors don't affect API operations
}
```

## Future Enhancements

### Planned Features

1. **Background Refresh Manager**
   - Proactive cache updates for frequently accessed data
   - Configurable refresh schedules
   - Load balancing for refresh operations

2. **Multi-Layer Cache Architecture**
   - Redis cache for shared state across instances
   - Disk cache for persistent storage
   - Memory cache for fastest access

3. **Advanced Query Caching**
   - Semantic query analysis
   - Query result composition
   - Smart cache warming

4. **Cache Analytics Dashboard**
   - Real-time cache performance visualization
   - Optimization recommendations
   - Trend analysis and forecasting

## Troubleshooting

### Common Issues

1. **Low Hit Rate**
   ```typescript
   const stats = client.getDetailedCacheStats();
   if (stats.averageTTL < 30000) {
     console.log('TTL may be too short for your use case');
   }
   ```

2. **High Memory Usage**
   ```typescript
   if (stats.size > 10000) {
     console.log('Consider implementing cache size limits');
     client.clear(); // Emergency cache clear
   }
   ```

3. **Invalidation Issues**
   ```typescript
   const invalidationStats = client.getInvalidationStats();
   console.log('Recent invalidation events:', invalidationStats.recentEvents);
   ```

### Debug Logging

```bash
# Enable cache debugging
DEBUG=cache,invalidation npm run mcp:start

# Enable comprehensive debugging
DEBUG=firewalla:* npm run mcp:start
```

## Best Practices

1. **Use Appropriate TTLs**: Match TTL to data volatility
2. **Monitor Cache Performance**: Regular review of hit rates and metrics
3. **Handle Cache Failures Gracefully**: Don't rely on cache for critical operations
4. **Invalidate Appropriately**: Use specific events rather than broad invalidation
5. **Test Cache Behavior**: Include cache scenarios in your test suite

## Contributing

When adding new features that affect caching:

1. **Add appropriate cache strategy** for new entity types
2. **Register invalidation events** for data changes
3. **Add tests** for new cache behavior
4. **Update monitoring** metrics as needed
5. **Document** performance implications