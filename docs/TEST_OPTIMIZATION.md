# Test Optimization Guide

This guide explains how to use the test optimization infrastructure to reduce API calls and improve test performance.

## Overview

The test optimization system provides utilities to share data across test cases, reducing redundant API calls while maintaining comprehensive test coverage and isolation.

## Key Benefits

- 🎯 **60%+ API Call Reduction**: Eliminate redundant API requests across test cases
- ⚡ **Faster Execution**: Reduce test execution time by 40%+ 
- 📊 **Performance Monitoring**: Track API usage and test performance
- ✅ **Maintained Coverage**: Full test coverage with optimized patterns

## Quick Start

### 1. Run the Demonstration

```bash
npm run demo:optimization
```

This shows the optimized test approach in action with performance metrics.

### 2. Compare Traditional vs Optimized

```bash
# Traditional approach (multiple API calls per test)
npm test -- tests/firewalla/client-device-traditional.test.ts

# Optimized approach (shared data across tests)  
npm test -- tests/firewalla/client-device-optimized.test.ts
```

## Implementation Pattern

### Traditional Approach (Inefficient)
```typescript
describe('Traditional Tests', () => {
  it('test scenario 1', async () => {
    const result = await client.getDeviceStatus(); // API CALL 1
    expect(result.results).toBeDefined();
  });
  
  it('test scenario 2', async () => {
    const result = await client.getDeviceStatus(); // API CALL 2 (DUPLICATE)
    const filtered = result.results.filter(d => d.online);
    expect(filtered.length).toBeGreaterThan(0);
  });
  
  it('test scenario 3', async () => {
    const result = await client.getDeviceStatus(); // API CALL 3 (DUPLICATE)
    const byId = result.results.filter(d => d.id === 'device-1');
    expect(byId).toHaveLength(1);
  });
});
```

### Optimized Approach (Efficient)
```typescript
import { TestDataCacheManager, TestDataUtils } from '../utils/test-data-cache';
import { ApiPerformanceMonitor } from '../utils/performance-monitor';

describe('Optimized Tests', () => {
  let sharedDeviceData: any[] = [];
  
  beforeAll(async () => {
    ApiPerformanceMonitor.startMonitoring();
    
    // SINGLE API CALL - shared across all tests
    const cache = await TestDataCacheManager.loadSharedTestData(client, {
      includeDevices: true,
      limits: { devices: 100 }
    });
    
    sharedDeviceData = cache.devices || [];
  });
  
  afterAll(() => {
    const metrics = ApiPerformanceMonitor.stopMonitoring();
    console.log(ApiPerformanceMonitor.generateReport());
  });
  
  it('test scenario 1', () => {
    // Use cached data - NO additional API call
    expect(sharedDeviceData).toBeDefined();
    expect(sharedDeviceData.length).toBeGreaterThan(0);
  });
  
  it('test scenario 2', () => {
    // Filter cached data - NO additional API call
    const onlineDevices = TestDataUtils.filterDevices(sharedDeviceData, { 
      online: true 
    });
    expect(onlineDevices.length).toBeGreaterThan(0);
  });
  
  it('test scenario 3', () => {
    // Query cached data - NO additional API call
    const deviceById = TestDataUtils.filterDevices(sharedDeviceData, { 
      deviceId: 'device-1' 
    });
    expect(deviceById).toHaveLength(1);
  });
});
```

## Key Utilities

### TestDataCacheManager
Centralized data loading and caching:
```typescript
// Load shared data once for entire test suite
const cache = await TestDataCacheManager.loadSharedTestData(client, {
  includeDevices: true,
  includeAlarms: true,
  includeFlows: false,
  limits: { devices: 100, alarms: 50 }
});

// Access cached data
const devices = TestDataCacheManager.getCachedData('devices');
```

### TestDataUtils
Utilities for filtering and analyzing cached data:
```typescript
// Filter devices by various criteria
const onlineDevices = TestDataUtils.filterDevices(devices, { online: true });
const appleDevices = TestDataUtils.filterDevices(devices, { nameContains: 'iPhone' });

// Get device statistics
const typeStats = TestDataUtils.getDeviceTypeStats(devices);
const statusCounts = TestDataUtils.getDeviceStatusCounts(devices);
```

### ApiPerformanceMonitor
Track API calls and performance:
```typescript
// Start monitoring
ApiPerformanceMonitor.startMonitoring();

// Stop and get metrics
const metrics = ApiPerformanceMonitor.stopMonitoring();

// Generate detailed report
console.log(ApiPerformanceMonitor.generateReport());

// Check against thresholds
const { passed, violations } = ApiPerformanceMonitor.checkThresholds(
  DEFAULT_THRESHOLDS.optimized
);
```

## Environment Configuration

### Enable Optimization
```bash
export OPTIMIZE_TESTS=true
npm test
```

### Integration Testing
```bash
export INTEGRATION_TESTS=true
export FIREWALLA_MSP_TOKEN=your_token
npm test
```

## Performance Thresholds

The system includes predefined performance thresholds:

```typescript
const thresholds = {
  optimized: {
    maxApiCalls: 10,      // Maximum API calls per test suite
    maxTestDuration: 5000, // Maximum execution time (ms)
    maxAvgCallTime: 100,   // Maximum average call time (ms)
    maxSlowCalls: 1        // Maximum slow calls allowed
  },
  traditional: {
    maxApiCalls: 25,       // Higher limits for traditional tests
    maxTestDuration: 15000,
    maxAvgCallTime: 250,
    maxSlowCalls: 5
  }
};
```

## Migration Guide

### Step 1: Identify Optimization Opportunities
Look for test suites with:
- Multiple similar API calls
- Repeated data fetching
- Independent test scenarios using same data

### Step 2: Convert to Shared Data Pattern
1. Move API calls from individual tests to `beforeAll()`
2. Store data in shared variables
3. Use `TestDataUtils` for filtering and analysis
4. Add performance monitoring

### Step 3: Validate Optimization
1. Ensure all tests still pass
2. Verify performance improvements
3. Check API call reduction
4. Maintain test isolation

## Examples

See the example implementations:
- `tests/firewalla/client-device-optimized.test.ts` - Optimized pattern
- `tests/firewalla/client-device-traditional.test.ts` - Traditional pattern
- `scripts/demo-optimization.cjs` - Live demonstration

## Best Practices

1. **Load Data Once**: Use `beforeAll()` for shared data loading
2. **Filter, Don't Fetch**: Use cached data with filtering utilities
3. **Monitor Performance**: Track API calls and execution time
4. **Maintain Isolation**: Tests should remain independent despite sharing data
5. **Validate Coverage**: Ensure optimization doesn't reduce test quality

## Troubleshooting

### High API Call Count
- Check if data is being loaded multiple times
- Verify `beforeAll()` vs `beforeEach()` usage
- Use `ApiPerformanceMonitor` to identify duplicate calls

### Test Failures After Optimization
- Ensure cached data structure matches expected format
- Verify filtering logic produces correct results
- Check for timing-dependent test assumptions

### Performance Not Improved
- Verify shared data is actually being used
- Check for hidden API calls in utility functions
- Monitor network overhead vs computation time

## Contributing

When adding new optimized tests:

1. Follow the established patterns
2. Add performance monitoring
3. Document any new utilities
4. Update thresholds if needed
5. Test both optimized and traditional approaches