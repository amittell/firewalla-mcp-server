# Phase 2 Validation Plan: Statistics & Trends API Testing

## Executive Summary
This document outlines a comprehensive validation plan for Phase 2 of the Firewalla MCP server implementation, which introduced 6 new tools: 3 Statistics API tools and 3 Trends API tools. The validation ensures proper tool registration, parameter validation, data transformation accuracy, and continued MCP protocol compliance.

## Phase 2 Implementation Overview

### Statistics API Tools (3 tools)
1. **get_simple_statistics** - Basic system health metrics
2. **get_statistics_by_region** - Geographic flow distribution analysis
3. **get_statistics_by_box** - Per-box activity metrics with scoring

### Trends API Tools (3 tools)
1. **get_flow_trends** - Historical flow data with configurable periods/intervals
2. **get_alarm_trends** - Alarm frequency analysis over time
3. **get_rule_trends** - Rule activity and stability tracking

## Validation Categories

### 1. Tool Registration Validation
**Objective**: Ensure all 6 new tools are properly registered and discoverable

**Test Commands**:
```bash
# Start MCP server and test tool listing
npm run mcp:start

# In separate terminal, test tool discovery
echo '{"method": "tools/list", "params": {}}' | node -e "
const stdin = process.stdin;
let data = '';
stdin.on('data', chunk => data += chunk);
stdin.on('end', () => {
  const tools = JSON.parse(data);
  const phase2Tools = ['get_simple_statistics', 'get_statistics_by_region', 'get_statistics_by_box', 'get_flow_trends', 'get_alarm_trends', 'get_rule_trends'];
  console.log('Phase 2 tools found:', phase2Tools.filter(t => tools.tools.find(tool => tool.name === t)));
});
"
```

**Expected Results**:
- All 6 tools should be listed in the tools response
- Each tool should have correct name, description, and inputSchema
- Verify tool descriptions match their functionality

### 2. Schema & Parameter Validation

#### 2.1 Statistics API Parameter Testing

**get_simple_statistics**:
```bash
# Test with no parameters (should work)
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_simple_statistics", "arguments": {}}}'

# Expected: Returns basic statistics without errors
```

**get_statistics_by_region**:
```bash
# Test with no parameters (should work)
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_statistics_by_region", "arguments": {}}}'

# Expected: Returns regional flow statistics
```

**get_statistics_by_box**:
```bash
# Test with no parameters (should work)
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_statistics_by_box", "arguments": {}}}'

# Expected: Returns per-box statistics with activity scores
```

#### 2.2 Trends API Parameter Testing

**get_flow_trends**:
```bash
# Test with default parameters
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {}}}'

# Test with valid period parameter
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"period": "1h"}}}'

# Test with valid interval parameter
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"period": "24h", "interval": 1800}}}'

# Test with invalid period (should fail gracefully)
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"period": "invalid"}}}'

# Test with invalid interval (should fail gracefully)
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"interval": 30}}}'
```

**get_alarm_trends**:
```bash
# Test with default parameters
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_alarm_trends", "arguments": {}}}'

# Test all valid periods
for period in "1h" "24h" "7d" "30d"; do
  curl -X POST http://localhost:3000/mcp \
    -d "{\"method\": \"tools/call\", \"params\": {\"name\": \"get_alarm_trends\", \"arguments\": {\"period\": \"$period\"}}}"
done
```

**get_rule_trends**:
```bash
# Test with default parameters
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_rule_trends", "arguments": {}}}'

# Test all valid periods
for period in "1h" "24h" "7d" "30d"; do
  curl -X POST http://localhost:3000/mcp \
    -d "{\"method\": \"tools/call\", \"params\": {\"name\": \"get_rule_trends\", \"arguments\": {\"period\": \"$period\"}}}"
done
```

### 3. Data Structure Validation

#### 3.1 Statistics API Response Validation

**get_simple_statistics Expected Schema**:
```json
{
  "statistics": {
    "online_boxes": number,
    "offline_boxes": number,
    "total_boxes": number,
    "total_alarms": number,
    "total_rules": number,
    "box_availability": number (0-100)
  },
  "summary": {
    "status": "operational" | "offline",
    "health_score": number (0-100),
    "active_monitoring": boolean
  }
}
```

**get_statistics_by_region Expected Schema**:
```json
{
  "total_regions": number,
  "regional_statistics": [
    {
      "country_code": string,
      "flow_count": number,
      "percentage": number
    }
  ],
  "top_regions": [
    {
      "country_code": string,
      "flow_count": number
    }
  ]
}
```

**get_statistics_by_box Expected Schema**:
```json
{
  "total_boxes": number,
  "box_statistics": [
    {
      "box_id": string,
      "name": string,
      "model": string,
      "status": "online" | "offline",
      "version": string,
      "location": string,
      "device_count": number,
      "rule_count": number,
      "alarm_count": number,
      "activity_score": number,
      "last_seen": string (ISO 8601)
    }
  ],
  "summary": {
    "online_boxes": number,
    "total_devices": number,
    "total_rules": number,
    "total_alarms": number
  }
}
```

#### 3.2 Trends API Response Validation

**get_flow_trends Expected Schema**:
```json
{
  "period": string,
  "interval_seconds": number,
  "data_points": number,
  "trends": [
    {
      "timestamp": number,
      "timestamp_iso": string,
      "flow_count": number
    }
  ],
  "summary": {
    "total_flows": number,
    "avg_flows_per_interval": number,
    "peak_flow_count": number,
    "min_flow_count": number
  }
}
```

**get_alarm_trends Expected Schema**:
```json
{
  "period": string,
  "data_points": number,
  "trends": [
    {
      "timestamp": number,
      "timestamp_iso": string,
      "alarm_count": number
    }
  ],
  "summary": {
    "total_alarms": number,
    "avg_alarms_per_interval": number,
    "peak_alarm_count": number,
    "intervals_with_alarms": number,
    "alarm_frequency": number
  }
}
```

**get_rule_trends Expected Schema**:
```json
{
  "period": string,
  "data_points": number,
  "trends": [
    {
      "timestamp": number,
      "timestamp_iso": string,
      "active_rule_count": number
    }
  ],
  "summary": {
    "avg_active_rules": number,
    "max_active_rules": number,
    "min_active_rules": number,
    "rule_stability": number (0-100)
  }
}
```

### 4. Functional Testing

#### 4.1 Data Transformation Accuracy

**Health Score Calculation Testing**:
```javascript
// Test calculateHealthScore function with various inputs
const testCases = [
  { onlineBoxes: 3, offlineBoxes: 0, alarms: 0, rules: 50, expected: 105 }, // Capped at 100
  { onlineBoxes: 2, offlineBoxes: 1, alarms: 5, rules: 20, expected: 63 }, // Mixed scenario
  { onlineBoxes: 0, offlineBoxes: 2, alarms: 10, rules: 5, expected: 0 }, // All offline
];

// Verify each calculation manually
```

**Rule Stability Calculation Testing**:
```javascript
// Test calculateRuleStability function
const testTrends = [
  { ts: 1000, value: 10 },
  { ts: 2000, value: 12 },
  { ts: 3000, value: 11 },
  { ts: 4000, value: 13 }
];
// Expected stability should be calculated based on variation
```

#### 4.2 Aggregation Logic Testing

**Regional Statistics Aggregation**:
- Verify flows are properly grouped by region
- Test percentage calculations sum to 100%
- Confirm top regions are correctly sorted

**Box Statistics Aggregation**:
- Verify parallel data fetching (boxes, alarms, rules)
- Test activity score calculations
- Confirm proper sorting by activity score

### 5. Error Handling Testing

#### 5.1 Invalid Parameter Testing

```bash
# Test invalid period values
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"period": "invalid"}}}'

# Test invalid interval values
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"interval": 30}}}'

# Test interval exceeding maximum
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_flow_trends", "arguments": {"interval": 100000}}}'
```

#### 5.2 API Error Handling

**Test Network Errors**:
- Simulate network timeouts
- Test authentication failures
- Verify rate limiting responses

**Test Data Errors**:
- Handle empty responses
- Test malformed API responses
- Verify graceful degradation

### 6. Performance Testing

#### 6.1 Response Time Benchmarks

```bash
# Benchmark each tool's response time
for tool in "get_simple_statistics" "get_statistics_by_region" "get_statistics_by_box" "get_flow_trends" "get_alarm_trends" "get_rule_trends"; do
  echo "Testing $tool performance..."
  time curl -X POST http://localhost:3000/mcp \
    -d "{\"method\": \"tools/call\", \"params\": {\"name\": \"$tool\", \"arguments\": {}}}"
done
```

**Expected Performance Targets**:
- Statistics API tools: < 2 seconds
- Trends API tools: < 3 seconds
- All tools should respect caching when appropriate

#### 6.2 Caching Behavior Testing

```bash
# Test caching behavior
echo "First call (should hit API):"
time curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_simple_statistics", "arguments": {}}}'

echo "Second call (should use cache):"
time curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_simple_statistics", "arguments": {}}}'
```

### 7. Integration Testing

#### 7.1 MCP Protocol Compliance

**Test MCP Message Format**:
```bash
# Verify all responses follow MCP content format
curl -X POST http://localhost:3000/mcp \
  -d '{"method": "tools/call", "params": {"name": "get_simple_statistics", "arguments": {}}}' | \
  jq '.content[0].type == "text" and (.content[0].text | fromjson | type) == "object"'
```

#### 7.2 Backwards Compatibility

**Test Existing Tools Still Work**:
```bash
# Verify Phase 1 tools still function
for tool in "get_active_alarms" "get_flow_data" "get_device_status" "get_bandwidth_usage"; do
  echo "Testing existing tool: $tool"
  curl -X POST http://localhost:3000/mcp \
    -d "{\"method\": \"tools/call\", \"params\": {\"name\": \"$tool\", \"arguments\": {}}}"
done
```

### 8. Validation Checklist

#### 8.1 Tool Registration ✓
- [ ] All 6 new tools appear in tools/list response
- [ ] Tool descriptions are accurate and helpful
- [ ] Input schemas match implementation
- [ ] Parameter validation works correctly

#### 8.2 Statistics API Validation ✓
- [ ] get_simple_statistics returns proper health metrics
- [ ] get_statistics_by_region aggregates flows correctly
- [ ] get_statistics_by_box calculates activity scores properly
- [ ] All statistics include proper summaries

#### 8.3 Trends API Validation ✓
- [ ] get_flow_trends supports all periods and intervals
- [ ] get_alarm_trends provides meaningful frequency analysis
- [ ] get_rule_trends calculates stability scores correctly
- [ ] All trends include proper summary statistics

#### 8.4 Data Quality ✓
- [ ] Response schemas match specifications
- [ ] Timestamps are properly formatted (Unix + ISO 8601)
- [ ] Calculations are mathematically correct
- [ ] Percentages and scores are within expected ranges

#### 8.5 Error Handling ✓
- [ ] Invalid parameters return helpful error messages
- [ ] Network errors are handled gracefully
- [ ] API errors don't crash the server
- [ ] All errors follow MCP error format

#### 8.6 Performance ✓
- [ ] Response times meet performance targets
- [ ] Caching reduces subsequent request times
- [ ] Memory usage remains stable
- [ ] No resource leaks detected

#### 8.7 Integration ✓
- [ ] MCP protocol compliance maintained
- [ ] Existing tools continue to work
- [ ] Server startup/shutdown works correctly
- [ ] Claude Code integration functions properly

## Test Execution Schedule

### Phase 1: Basic Validation (Day 1)
1. Tool registration verification
2. Parameter validation testing
3. Basic functionality testing

### Phase 2: Deep Validation (Day 2)
1. Data structure validation
2. Calculation accuracy testing
3. Error handling validation

### Phase 3: Performance & Integration (Day 3)
1. Performance benchmarking
2. Integration testing
3. Regression testing

### Phase 4: Documentation & Sign-off (Day 4)
1. Results documentation
2. Issue tracking and resolution
3. Validation sign-off

## Success Criteria

✅ **Tool Registration**: All 6 tools discoverable and properly documented
✅ **Functionality**: Each tool returns expected data structures
✅ **Accuracy**: Calculations match expected results
✅ **Performance**: Response times meet targets
✅ **Reliability**: Error handling works gracefully
✅ **Integration**: MCP protocol compliance maintained
✅ **Backwards Compatibility**: Existing functionality preserved

## Phase 3 Preparation Notes

**Planned Phase 3 Implementation**:
- **Search API** with advanced querying capabilities
- **Complex search syntax** for flows, alarms, and rules
- **Query builders** and filtering capabilities
- **Enhanced pagination** and sorting options

**Validation Considerations for Phase 3**:
- Test complex query parsing and validation
- Verify advanced filtering accuracy
- Benchmark performance with large datasets
- Validate query builder functionality

---

This validation plan ensures comprehensive testing of Phase 2 implementation while preparing for Phase 3 development. Execute tests systematically and document all results for quality assurance.