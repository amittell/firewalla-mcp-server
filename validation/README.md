# Phase 2 Validation Suite

This directory contains comprehensive validation tools for Phase 2 of the Firewalla MCP server implementation, which introduced 6 new tools for Statistics and Trends APIs.

## Quick Start

### Automated Testing
```bash
# Run full automated validation suite
node validation/test-phase2-tools.js

# With debug output
DEBUG=* node validation/test-phase2-tools.js
```

### Manual Testing
```bash
# Make sure MCP server is running
npm run mcp:start

# In another terminal, run manual tests
./validation/manual-test-commands.sh
```

## Files Overview

### Core Validation Files

| File | Purpose |
|------|---------|
| `phase2-validation-plan.md` | Comprehensive validation plan and strategy |
| `test-phase2-tools.js` | Automated test suite for all 6 new tools |
| `manual-test-commands.sh` | Manual testing commands and procedures |
| `data-validation-schemas.json` | JSON schemas for response validation |

### What's Being Tested

#### Statistics API (3 tools)
1. **get_simple_statistics** - Basic system health metrics
2. **get_statistics_by_region** - Geographic flow distribution analysis  
3. **get_statistics_by_box** - Per-box activity metrics with scoring

#### Trends API (3 tools)  
1. **get_flow_trends** - Historical flow data with configurable periods/intervals
2. **get_alarm_trends** - Alarm frequency analysis over time
3. **get_rule_trends** - Rule activity and stability tracking

## Validation Categories

### 1. Tool Registration ✓
- Verify all 6 tools are discoverable via `tools/list`
- Validate tool descriptions and input schemas
- Check parameter specifications match implementation

### 2. Parameter Validation ✓
- Test all valid parameter combinations
- Verify required vs optional parameters
- Test invalid parameter rejection and error messages

### 3. Data Structure Validation ✓
- Verify response schemas match specifications
- Check field types, ranges, and constraints
- Validate timestamp formats (Unix + ISO 8601)

### 4. Functional Testing ✓
- Test core functionality of each tool
- Verify calculations (health scores, stability metrics)
- Check data aggregation accuracy

### 5. Error Handling ✓
- Test invalid parameter handling
- Verify graceful failure modes
- Check MCP error format compliance

### 6. Performance Testing ✓
- Benchmark response times
- Test caching behavior
- Monitor resource usage

### 7. Integration Testing ✓
- Verify MCP protocol compliance
- Test backwards compatibility with Phase 1 tools
- Check server stability under load

## Expected Results

### Response Time Targets
- Statistics API tools: < 2-3 seconds
- Trends API tools: < 3-4 seconds
- Error responses: < 1 second

### Data Quality Requirements
- Health scores: 0-100 range with proper calculation
- Timestamps: Valid Unix seconds + ISO 8601 strings
- Percentages: Sum to 100% where applicable
- Counts: Match array lengths and aggregations

### Success Criteria
- ✅ 90%+ test pass rate for production readiness
- ✅ All tools properly registered and discoverable
- ✅ Response schemas match specifications
- ✅ Error handling works gracefully
- ✅ Performance meets targets
- ✅ Backwards compatibility maintained

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Set up environment variables
cp .env.example .env
# Edit .env with your Firewalla MSP credentials
```

### Full Validation Workflow
```bash
# 1. Start MCP server (in one terminal)
npm run mcp:start

# 2. Run automated tests (in another terminal)  
node validation/test-phase2-tools.js

# 3. Run manual tests for specific scenarios
./validation/manual-test-commands.sh

# 4. Check test reports
ls validation/phase2-test-results-*.json
```

### Test Reports

The automated test suite generates detailed JSON reports with:
- Test execution summary (pass/fail counts)
- Performance metrics (response times)
- Data validation results
- Error analysis
- Conclusions and recommendations

Example report location: `validation/phase2-test-results-1703123456789.json`

## Troubleshooting

### Common Issues

#### MCP Server Won't Start
```bash
# Check environment variables
cat .env

# Verify build completed
npm run build
ls dist/

# Check for port conflicts
lsof -i :3000
```

#### Authentication Errors
```bash
# Verify MSP token is valid
echo $FIREWALLA_MSP_TOKEN

# Check Box ID format  
echo $FIREWALLA_BOX_ID

# Test API connectivity
curl -H "Authorization: Token $FIREWALLA_MSP_TOKEN" \
     "$FIREWALLA_MSP_BASE_URL/boxes"
```

#### Test Failures
```bash
# Run with debug output
DEBUG=mcp:* node validation/test-phase2-tools.js

# Check individual tool manually
echo '{"method":"tools/call","params":{"name":"get_simple_statistics","arguments":{}}}' | \
node -e "/* manual test code */"

# Verify server logs
npm run mcp:debug
```

## Phase 3 Preparation

The validation suite is designed to be extensible for Phase 3 implementation:

### Planned Phase 3 Features
- **Search API** with advanced querying capabilities
- **Complex search syntax** for flows, alarms, and rules  
- **Query builders** and filtering capabilities
- **Enhanced pagination** and sorting options

### Phase 3 Validation Considerations
- Complex query parsing and validation
- Advanced filtering accuracy testing
- Performance with large datasets
- Query builder functionality validation

## Contributing

When adding new validation tests:

1. Update `test-phase2-tools.js` with new test methods
2. Add manual test commands to `manual-test-commands.sh`
3. Update response schemas in `data-validation-schemas.json`
4. Document new tests in this README

### Test Writing Guidelines
- Each test should be independent and idempotent
- Include both positive and negative test cases
- Validate response structure and data quality
- Include performance measurements
- Document expected behavior clearly

---

This validation suite ensures Phase 2 implementation meets quality standards and prepares the foundation for Phase 3 development.