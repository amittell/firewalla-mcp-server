# Firewalla MCP Tool Documentation Template

This template provides a standardized format for documenting all Firewalla MCP tools, with complexity-specific sections and field syntax guidance.

## Template Structure

### Basic Information Section (ALL TOOLS)
```markdown
## tool_name

**Complexity:** [LOW|MEDIUM|HIGH]
**Category:** [Core Data|Search|Analytics|Management]

**Description:** [Brief description of what the tool does]

**Purpose:** [When and why to use this tool]
```

### Parameters Section (ALL TOOLS)
```markdown
### Parameters

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| param_name | string | Yes | - | max_length:100 | Parameter description |
| limit | number | Yes | - | range:1-10000 | Maximum results to return |
| optional_param | boolean | No | false | - | Optional parameter description |

#### Parameter Details

**Required Parameters:**
- `param_name`: [Detailed description with examples]
- `limit`: [Why this is required, typical values]

**Optional Parameters:**
- `optional_param`: [When to use, default behavior]

#### Validation Rules
- **param_name**: [Specific validation requirements]
- **limit**: Must be between 1 and 10,000
- **Range validations**: [Any range or format requirements]
```

### Field Syntax Section (MEDIUM/HIGH COMPLEXITY TOOLS)
```markdown
### Field Syntax and Query Operators

#### Supported Fields
**Working Field Names** (verified):
- `field1`: Description and example values
- `field2`: Description and example values
- `field3`: Description and example values

**Field Categories:**
- **Network Fields**: `device`, `protocol`, `port`
- **Temporal Fields**: `ts`, `timestamp`, `hour_of_day`
- **Content Fields**: `target_value`, `target_name`, `action`
- **Status Fields**: `blocked`, `online`, `resolved`

#### Query Operators

**Basic Operators:**
```text
field:value          # Exact match
field:value*         # Prefix wildcard
field:*value*        # Contains wildcard
field:>=value        # Greater than or equal
field:[min TO max]   # Range query
```

**Logical Operators:**
```text
query1 AND query2    # Both conditions must be true
query1 OR query2     # Either condition can be true
NOT query           # Exclude matching results
(query1 OR query2) AND query3  # Grouped conditions
```

**Advanced Patterns:**
```text
field:192.168.*              # IP prefix matching
field:*.domain.com           # Domain suffix matching
field:>1000                  # Numeric comparison
ts:2024-01-01-2024-01-31    # Date range
```

#### Field Syntax Examples
```javascript
// Simple field queries
"device:laptop"
"protocol:tcp" 
"action:block"

// Wildcard patterns
"device:*phone*"
"target_value:*.facebook.com"
"protocol:tcp*"

// Logical combinations
"protocol:tcp AND port:443"
"device:laptop OR device:desktop"
"action:block NOT resolved:true"

// Range queries
"bytes:[1000 TO 50000]"
"ts:2024-01-01-2024-01-31"
"port:[80 TO 443]"
```
```

### Usage Examples Section (ALL TOOLS)
```markdown
### Usage Examples

#### Basic Usage
```javascript
// Simple request
{
  "param1": "value1",
  "limit": 100
}
```

#### Advanced Usage (MEDIUM/HIGH COMPLEXITY)
```javascript
// Complex query example
{
  "query": "protocol:tcp AND bytes:>1000000",
  "limit": 500,
  "sort_by": "timestamp:desc"
}

// Multi-field search
{
  "query": "(device:*laptop* OR device:*phone*) AND protocol:tcp",
  "group_by": "device",
  "limit": 200
}
```

#### Practical Scenarios
**Scenario 1: [Common use case]**
```javascript
// Description of what this accomplishes
{
  "parameter": "specific_value",
  "limit": 50
}
```

**Scenario 2: [Another common use case]**
```javascript
// Description of what this accomplishes
{
  "query": "field:value AND other_field:other_value",
  "limit": 100
}
```
```

### Response Format Section (ALL TOOLS)
```markdown
### Response Format

#### Success Response
```json
{
  "data": [
    {
      "field1": "value1",
      "field2": "value2",
      "field3": 123
    }
  ],
  "meta": {
    "total": 150,
    "returned": 100,
    "query_time": "45ms"
  }
}
```

#### Error Response
```json
{
  "error": true,
  "message": "Descriptive error message",
  "tool": "tool_name",
  "validation_errors": ["Specific validation error"]
}
```

#### Response Fields
- **field1**: Description of what this field contains
- **field2**: Description of what this field contains
- **meta.total**: Total number of matching results
- **meta.returned**: Number of results in this response
```

### Error Prevention Section (ALL TOOLS)
```markdown
### Error Prevention

#### Common Mistakes to Avoid

**Parameter Errors:**
- ❌ Missing required `limit` parameter
- ❌ Using invalid field names in queries
- ❌ Incorrect parameter types (string vs number)
- ✅ Always include required parameters
- ✅ Use verified field names from documentation
- ✅ Check parameter types match specification

**Query Syntax Errors (MEDIUM/HIGH COMPLEXITY):**
- ❌ Using `source_ip` instead of `device`
- ❌ Forgetting quotes around multi-word values
- ❌ Incorrect operator syntax (= instead of :)
- ✅ Use documented field names
- ✅ Quote values with spaces: `device:"My Laptop"`
- ✅ Use colon syntax: `field:value`

**Validation Errors:**
- ❌ Limit values outside valid range (1-10000)
- ❌ Invalid date formats in timestamp queries
- ❌ Reserved characters in query strings
- ✅ Use limits between 1 and 10,000
- ✅ Use ISO date format: `2024-01-01T00:00:00Z`
- ✅ Escape special characters when needed

#### Troubleshooting Guide

**If you get "limit parameter is required":**
- Add explicit `limit` parameter to your request
- Valid range: 1 to 10,000

**If you get "invalid field name":**
- Check the "Supported Fields" section above
- Use exact field names as documented
- Common working fields: `device`, `protocol`, `action`, `ts`

**If you get "query syntax error":**
- Verify operator syntax (use `:` not `=`)
- Check parentheses are balanced in complex queries
- Ensure AND/OR operators are uppercase
```

### Integration Notes Section (ALL TOOLS)
```markdown
### Integration Notes

#### Rate Limiting
- Tool respects Firewalla API rate limits
- Automatic retry with exponential backoff
- Monitor response times in debug mode

#### Caching Behavior
- **Cache TTL**: [Tool-specific cache duration]
- **Cache Key**: Based on parameters and query
- **Invalidation**: Automatic on data updates

#### Performance Considerations
- Larger `limit` values increase response time
- Complex queries with wildcards are slower
- Use specific field filters to improve performance
- Consider pagination for large result sets

#### Debug Information
Enable debugging with:
```bash
DEBUG=firewalla:tool_name npm run mcp:start
```
```

## Complexity-Specific Sections

### LOW Complexity Tools
For simple tools with basic parameters, include:
- Basic parameters table
- Simple usage examples
- Standard error prevention
- Skip field syntax and advanced sections

### MEDIUM Complexity Tools  
For tools with moderate complexity, include:
- Full parameters section with validation details
- Basic field syntax if applicable
- Multiple usage scenarios
- Common integration patterns

### HIGH Complexity Tools
For advanced search and analysis tools, include:
- Complete field syntax documentation
- Extensive query examples
- Advanced usage patterns
- Performance optimization tips
- Complex error prevention scenarios

## Field Categories Reference

### Core Network Fields (Most Tools)
```markdown
#### Network Identity Fields
- `device`: Device name or identifier (primary field for device-related queries)
- `protocol`: Network protocol (tcp, udp, icmp)
- `port`: Port number or range
- `mac`: MAC address (format: xx:xx:xx:xx:xx:xx)

#### Content and Target Fields  
- `target_value`: Target URL, domain, or IP address
- `target_name`: Human-readable target name
- `action`: Action taken (block, allow, timelimit, etc.)
- `direction`: Traffic direction (inbound, outbound, bidirectional)

#### Status and State Fields
- `blocked`: Whether traffic was blocked (true/false)
- `online`: Device online status (true/false) 
- `resolved`: Whether issue was resolved (true/false)
- `active`: Whether rule/policy is active (true/false)

#### Temporal Fields
- `ts`: Timestamp field for time-based queries
- `timestamp`: Alternative timestamp field
- `hour_of_day`: Hour component (0-23)
- `day_of_week`: Day component (0-6)
```

### Advanced Search Fields (Search Tools Only)
```markdown
#### Traffic Analysis Fields
- `bytes`: Data transfer amount
- `packets`: Packet count
- `duration`: Connection duration
- `rate`: Transfer rate

#### Security Fields
- `severity`: Alert severity (low, medium, high, critical)
- `type`: Alert or rule type
- `category`: Classification category
- `confidence`: Confidence score (0.0-1.0)

#### Geographic Fields
- `country`: Country name or code
- `region`: Geographic region
- `city`: City name
- `asn`: Autonomous System Number
```

## Validation Error Messages Reference

### Standard Error Types
1. **Missing Required Parameter**: "parameter_name parameter is required"
2. **Invalid Parameter Type**: "parameter_name must be a valid type_name"
3. **Out of Range**: "parameter_name must be between min and max"
4. **Invalid Field Name**: "field_name is not a valid search field"
5. **Query Syntax Error**: "Invalid query syntax: specific_error_description"
6. **Authentication Error**: "Invalid authentication credentials"
7. **Rate Limit Exceeded**: "API rate limit exceeded, retry in X seconds"
8. **Network Error**: "Unable to connect to Firewalla API"
9. **Data Not Found**: "No data found matching the specified criteria"
10. **Internal Server Error**: "An internal error occurred processing your request"

### Error Response Format
All tools use this standardized error format:
```json
{
  "error": true,
  "message": "Human-readable error description",
  "tool": "tool_name",
  "validation_errors": ["Specific validation issue"],
  "error_code": "ERROR_TYPE",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Template Application Examples

### Example: LOW Complexity Tool (get_boxes)
```markdown
## get_boxes

**Complexity:** LOW
**Category:** Core Data

**Description:** Retrieves information about all Firewalla boxes in your account

**Purpose:** Use this tool to get basic box information, status, and identifiers

### Parameters

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| limit | number | Yes | - | range:1-1000 | Maximum number of boxes to return |

### Usage Examples

#### Basic Usage
```javascript
{
  "limit": 10
}
```

### Error Prevention

#### Common Mistakes to Avoid
- ❌ Missing required `limit` parameter
- ✅ Always include `limit` parameter

### Integration Notes

#### Cache TTL: 5 minutes
#### Performance: Fast, minimal API overhead
```

### Example: HIGH Complexity Tool (search_flows)
```markdown
## search_flows

**Complexity:** HIGH  
**Category:** Search

**Description:** Advanced search for network flow data with complex query capabilities

**Purpose:** Use this tool to find specific network flows using sophisticated filtering

### Parameters

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| query | string | Yes | - | max_length:1000 | Search query using field syntax |
| limit | number | Yes | - | range:1-10000 | Maximum results to return |
| sort_by | string | No | "ts:desc" | - | Sort field and direction |
| group_by | string | No | - | - | Field to group results by |

### Field Syntax and Query Operators

#### Supported Fields
**Working Field Names** (verified):
- `device`: Device name or identifier
- `protocol`: Network protocol (tcp, udp, icmp)
- `port`: Port number
- `action`: Flow action (block, allow)
- `bytes`: Data transfer amount
- `ts`: Timestamp for time-based queries
- `blocked`: Whether flow was blocked (true/false)

#### Query Examples
```javascript
// Find blocked TCP traffic from laptops
"device:*laptop* AND protocol:tcp AND blocked:true"

// Large data transfers in date range  
"bytes:>10000000 AND ts:2024-01-01-2024-01-31"

// HTTPS traffic excluding internal networks
"protocol:tcp AND port:443 NOT device:192.168.*"
```

### Usage Examples

#### Basic Search
```javascript
{
  "query": "protocol:tcp",
  "limit": 100
}
```

#### Advanced Analytics
```javascript
{
  "query": "device:*phone* AND bytes:>1000000",
  "limit": 500,
  "group_by": "device",
  "sort_by": "bytes:desc"
}
```

### Error Prevention

#### Common Field Mistakes
- ❌ Using `source_ip` (use `device` instead)
- ❌ Using `destination_ip` (use `device` for device-based queries)
- ✅ Use `device` for device-related network queries
- ✅ Use `protocol` for protocol filtering
```

This comprehensive template scales appropriately for all complexity levels while maintaining consistency and providing the field syntax guidance needed to prevent common errors.