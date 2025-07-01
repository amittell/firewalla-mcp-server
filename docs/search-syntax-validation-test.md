# Search Syntax Validation Test Plan

## Overview

This document outlines systematic testing of all documented search syntaxes to verify they work correctly with the live Firewalla API. Each documented field and operator will be tested to ensure accuracy.

## Test Categories

### 1. search_flows Field Syntax Tests

#### Device Fields
```json
// Test: device.ip exact match
{
  "query": "device.ip:192.168.1.100",
  "limit": 10
}

// Test: device.ip wildcard
{
  "query": "device.ip:192.168.1.*",
  "limit": 10
}

// Test: device.name wildcard
{
  "query": "device.name:*William*",
  "limit": 10
}

// Test: device.id MAC format
{
  "query": "device.id:mac:AA:BB:CC:DD:EE:FF",
  "limit": 10
}
```

#### Protocol and Direction Fields
```json
// Test: protocol filtering
{
  "query": "protocol:tcp",
  "limit": 10
}

// Test: direction filtering
{
  "query": "direction:outbound",
  "limit": 10
}

// Test: block status
{
  "query": "block:true",
  "limit": 10
}
```

#### Volume and Category Fields
```json
// Test: bytes comparison
{
  "query": "bytes:>1000000",
  "limit": 10
}

// Test: category filtering
{
  "query": "category:video",
  "limit": 10
}

// Test: region filtering
{
  "query": "region:US",
  "limit": 10
}
```

#### Complex Queries
```json
// Test: AND operator
{
  "query": "protocol:tcp AND bytes:>1000000",
  "limit": 10
}

// Test: OR operator
{
  "query": "category:video OR category:games",
  "limit": 10
}

// Test: Parentheses grouping
{
  "query": "(protocol:tcp OR protocol:udp) AND device.name:*William*",
  "limit": 10
}
```

### 2. search_alarms Field Syntax Tests

#### Alarm Classification
```json
// Test: type filtering
{
  "query": "type:1",
  "limit": 10
}

// Test: status filtering
{
  "query": "status:1",
  "limit": 10
}

// Test: severity filtering
{
  "query": "severity:high",
  "limit": 10
}
```

#### Device and Network Context
```json
// Test: device.ip in alarms
{
  "query": "device.ip:192.168.1.*",
  "limit": 10
}

// Test: device.name in alarms
{
  "query": "device.name:*William*",
  "limit": 10
}

// Test: protocol in alarms
{
  "query": "protocol:tcp",
  "limit": 10
}

// Test: region in alarms
{
  "query": "region:CN",
  "limit": 10
}
```

#### Complex Alarm Queries
```json
// Test: Security threats
{
  "query": "status:1 AND (type:1 OR type:2)",
  "limit": 10
}

// Test: High severity active alarms
{
  "query": "severity:high AND status:1",
  "limit": 10
}
```

### 3. search_devices Field Syntax Tests

#### Device Identity
```json
// Test: name wildcard
{
  "query": "name:*William*",
  "limit": 10
}

// Test: ip address
{
  "query": "ip:192.168.1.*",
  "limit": 10
}

// Test: macVendor (camelCase)
{
  "query": "macVendor:Apple",
  "limit": 10
}

// Test: mac address
{
  "query": "mac:AA:BB:CC:DD:EE:FF",
  "limit": 10
}
```

#### Status and Network
```json
// Test: online status
{
  "query": "online:true",
  "limit": 10
}

// Test: ipReserved status
{
  "query": "ipReserved:true",
  "limit": 10
}

// Test: network.name (dot notation)
{
  "query": "network.name:*main*",
  "limit": 10
}
```

#### Bandwidth Fields
```json
// Test: totalDownload comparison
{
  "query": "totalDownload:>1000000000",
  "limit": 10
}

// Test: totalUpload comparison
{
  "query": "totalUpload:>500000000",
  "limit": 10
}
```

#### Complex Device Queries
```json
// Test: Apple devices that are online
{
  "query": "macVendor:Apple AND online:true",
  "limit": 10
}

// Test: High bandwidth offline devices
{
  "query": "online:false AND totalDownload:>1000000000",
  "limit": 10
}
```

### 4. search_rules Field Syntax Tests

#### Rule Actions and Status
```json
// Test: action filtering
{
  "query": "action:block",
  "limit": 10
}

// Test: status filtering
{
  "query": "status:active",
  "limit": 10
}
```

#### Target Configuration
```json
// Test: target.type (dot notation)
{
  "query": "target.type:domain",
  "limit": 10
}

// Test: target.value wildcard
{
  "query": "target.value:*facebook*",
  "limit": 10
}
```

#### Scope Configuration
```json
// Test: scope.type (dot notation)
{
  "query": "scope.type:device",
  "limit": 10
}

// Test: scope.value wildcard
{
  "query": "scope.value:*William*",
  "limit": 10
}
```

#### Usage Statistics
```json
// Test: hit.count (dot notation)
{
  "query": "hit.count:>100",
  "limit": 10
}

// Test: hit.count zero (unused rules)
{
  "query": "hit.count:0",
  "limit": 10
}
```

#### Complex Rule Queries
```json
// Test: Active blocking rules with hits
{
  "query": "action:block AND status:active AND hit.count:>0",
  "limit": 10
}

// Test: Social media rules
{
  "query": "(target.value:*facebook* OR target.value:*twitter*) AND action:block",
  "limit": 10
}
```

## Comparison Operators Testing

### Greater Than and Less Than
```json
// Test in search_flows
{
  "query": "bytes:>1000000",
  "limit": 5
}

// Test in search_devices
{
  "query": "totalDownload:>=5000000000",
  "limit": 5
}

// Test in search_rules
{
  "query": "hit.count:<10",
  "limit": 5
}
```

### Range Operators
```json
// Test range in search_flows
{
  "query": "bytes:[1000000 TO 10000000]",
  "limit": 5
}

// Test range in search_devices
{
  "query": "totalDownload:[1000000 TO 1000000000]",
  "limit": 5
}

// Test range in search_rules
{
  "query": "hit.count:[10 TO 1000]",
  "limit": 5
}
```

## Time Range Testing

### With time_range Parameter
```json
// Test time_range in search_flows
{
  "query": "protocol:tcp",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T23:59:59Z"
  },
  "limit": 10
}

// Test time_range in search_alarms
{
  "query": "severity:high",
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-07T23:59:59Z"
  },
  "limit": 10
}
```

## Sort Options Testing

### Different Sort Fields
```json
// Test sort by timestamp
{
  "query": "protocol:tcp",
  "limit": 10,
  "sort_by": "ts:desc"
}

// Test sort by bytes in flows
{
  "query": "bytes:>1000000",
  "limit": 10,
  "sort_by": "bytes:desc"
}

// Test sort by hit count in rules
{
  "query": "action:block",
  "limit": 10,
  "sort_by": "hit.count:desc"
}

// Test sort by name in devices
{
  "query": "online:true",
  "limit": 10,
  "sort_by": "name:asc"
}
```

## Error Case Testing

### Invalid Field Names (Should Fail)
```json
// Test wrong field name in flows
{
  "query": "source_ip:192.168.1.100",  // Should fail
  "limit": 10
}

// Test wrong field name in devices
{
  "query": "mac_vendor:Apple",  // Should fail
  "limit": 10
}

// Test wrong field name in rules
{
  "query": "rule_action:block",  // Should fail
  "limit": 10
}
```

### Missing Required Parameters (Should Fail)
```json
// Test missing limit parameter
{
  "query": "protocol:tcp"
  // Missing limit - should fail
}

// Test invalid time range
{
  "query": "protocol:tcp",
  "time_range": {
    "start": "2024-01-02T00:00:00Z",
    "end": "2024-01-01T00:00:00Z"  // End before start - should fail
  },
  "limit": 10
}
```

## Test Execution Plan

### Phase 1: Basic Field Testing
1. Test each documented field individually
2. Verify field names are correctly recognized
3. Ensure data types are properly handled
4. Validate wildcard patterns work

### Phase 2: Operator Testing
1. Test all comparison operators (>, >=, <, <=, :)
2. Verify range operators work correctly
3. Test logical operators (AND, OR, NOT)
4. Validate parentheses grouping

### Phase 3: Complex Query Testing
1. Test multi-field combinations
2. Verify nested logical operations
3. Test real-world usage scenarios
4. Validate performance with complex queries

### Phase 4: Error Validation
1. Test documented error cases
2. Verify error messages are helpful
3. Ensure graceful failure handling
4. Test parameter validation

### Phase 5: Performance Testing
1. Test with various limit values
2. Verify sort performance
3. Test time range filtering efficiency
4. Validate caching behavior

## Expected Results

### Success Criteria
- All documented field names work correctly
- Comparison operators function as expected
- Logical operators combine properly
- Time ranges filter accurately
- Sort options work correctly
- Error cases fail gracefully with helpful messages

### Documentation Updates
Based on test results:
1. Fix any incorrect field names
2. Update examples that don't work
3. Add notes about field limitations
4. Enhance error prevention sections
5. Update performance recommendations

## Test Automation

### Test Script Structure
```javascript
// Example test case structure
const testCases = [
  {
    tool: 'search_flows',
    name: 'device.ip exact match',
    params: {
      query: 'device.ip:192.168.1.100',
      limit: 10
    },
    expectedSuccess: true
  },
  {
    tool: 'search_flows', 
    name: 'invalid field name',
    params: {
      query: 'source_ip:192.168.1.100',
      limit: 10
    },
    expectedSuccess: false,
    expectedError: /Unknown field.*source_ip/
  }
];
```

This comprehensive test plan will validate all documented search syntaxes and ensure the documentation accuracy before models start using these examples.