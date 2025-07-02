# Enhanced Query Validation Examples

This document provides examples of the enhanced query validation system and demonstrates how it improves search query handling in the Firewalla MCP server.

## Overview

The enhanced query validation system provides:

1. **Syntax Validation**: Ensures proper query structure and grammar
2. **Semantic Validation**: Validates field types and operator compatibility  
3. **Field Validation**: Checks field existence and compatibility with entity types
4. **Security Validation**: Prevents injection attacks and malicious content
5. **Query Correction**: Suggests and applies automatic corrections

## Examples

### Valid Queries

#### Basic Field Queries
```
✅ protocol:tcp
✅ severity:high
✅ device_ip:192.168.1.1
✅ bytes:>1000
✅ timestamp:[1640995200 TO 1640995300]
```

#### Complex Logical Queries
```
✅ (protocol:tcp AND bytes:>1000) OR (protocol:udp AND severity:high)
✅ source_ip:192.168.* AND NOT blocked:true
✅ severity:>=medium AND timestamp:>1640995200
```

#### Geographic and Advanced Queries
```
✅ country:US AND geographic_risk_score:>=7
✅ application:Chrome AND session_duration:>300
✅ device_vendor:Apple AND last_seen:[1640000000 TO 1641000000]
```

### Invalid Queries with Validation Errors

#### Syntax Errors
```
❌ protocol:              → Error: Expected value after field 'protocol:'
❌ field:value AND        → Error: Expected expression after AND operator
❌ (protocol:tcp          → Error: Expected closing parenthesis
❌ bytes:[1000 TO         → Error: Expected closing bracket in range query
```

#### Semantic Errors
```
❌ protocol:>=tcp         → Error: Comparison operator '>=' cannot be used with non-numeric field 'protocol'
❌ device_name:>test      → Error: Comparison operator '>' cannot be used with non-numeric field 'device_name'
❌ blocked:maybe          → Error: Field 'blocked' expects a boolean value (true/false), got 'maybe'
❌ bytes:[50000 TO 1000]  → Error: Range minimum (50000) must be less than maximum (1000)
```

#### Field Validation Errors
```
❌ invalid_field:value    → Error: Invalid field 'invalid_field' for entity type 'flows'
❌ severity:high (flows)  → Error: Invalid field 'severity' for entity type 'flows' (severity is for alarms)
❌ bytes:1000 (alarms)    → Error: Invalid field 'bytes' for entity type 'alarms' (bytes is for flows)
```

#### Security Violations
```
❌ '; DROP TABLE flows; --     → Error: Query contains potentially dangerous content
❌ <script>alert("xss")</script> → Error: Query contains potentially dangerous content
❌ eval(document.cookie)       → Error: Query contains potentially dangerous content
```

### Query Corrections

The system automatically suggests and applies corrections for common issues:

#### Field Name Corrections
```
Input:  src_ip:192.168.1.1
Output: source_ip:192.168.1.1
Note:   Optimized field 'src_ip' to 'source_ip'

Input:  dst_ip:8.8.8.8
Output: destination_ip:8.8.8.8
Note:   Optimized field 'dst_ip' to 'destination_ip'
```

#### Operator Corrections
```
Input:  field == value
Output: field:value
Note:   Replace == with :

Input:  protocol = tcp
Output: protocol:tcp
Note:   Replace = with :
```

#### Logic Corrections
```
Input:  protocol tcp severity high
Output: protocol:tcp AND severity:high
Note:   Add AND between terms
```

### Entity-Specific Validation

#### Flows Entity
```
✅ Valid:   protocol:tcp, bytes:>1000, source_ip:192.168.*, blocked:true
❌ Invalid: severity:high, action:block, online:true
```

#### Alarms Entity
```
✅ Valid:   severity:high, type:network_intrusion, resolved:false, device_ip:192.168.1.1
❌ Invalid: bytes:1000, download:500, direction:outbound
```

#### Rules Entity
```
✅ Valid:   action:block, target_value:*.facebook.com, active:true, hit_count:>5
❌ Invalid: severity:high, bytes:1000, online:false
```

#### Devices Entity
```
✅ Valid:   online:true, mac_vendor:Apple, last_seen:>1640995200, device_ip:192.168.1.1
❌ Invalid: severity:high, action:block, bytes:1000
```

### Correlation Field Validation

#### Compatible Fields (Cross-Entity)
```
✅ flows + alarms:    source_ip, device_ip, timestamp, protocol
✅ flows + devices:   device_ip, mac, device_id
✅ alarms + rules:    timestamp, protocol (limited compatibility)
```

#### Incompatible Fields
```
❌ flows + alarms:    bytes, download, upload (flows-specific)
❌ flows + rules:     action, target_value (rules-specific)
❌ alarms + devices:  severity, type (alarms-specific)
```

## Enhanced Correlation Suggestions

### Example Query Analysis
```javascript
// Input
{
  primary_query: "protocol:tcp AND bytes:>1000",
  secondary_queries: ["severity:high", "online:false"]
}

// Enhanced Output
{
  primary_entity_type: "flows",
  secondary_entity_types: ["alarms", "devices"],
  
  compatibility_analysis: {
    compatible_fields_count: 3,
    incompatible_fields: [],
    compatibility_suggestions: ["Consider using source_ip, device_ip, or timestamp for correlation"]
  },
  
  high_confidence: [
    ["source_ip", "device_ip"],
    ["device_ip", "timestamp"],
    ["protocol", "source_ip"]
  ],
  
  recommended_by_context: {
    flows_to_alarms: {
      description: "Correlate network flows with security alarms",
      recommended_fields: ["source_ip", "device_ip", "protocol", "timestamp"],
      use_cases: ["Incident investigation", "Threat hunting", "Security analysis"]
    },
    flows_to_devices: {
      description: "Correlate network flows with device information", 
      recommended_fields: ["device_ip", "mac", "device_id"],
      use_cases: ["Device behavior analysis", "Network usage tracking"]
    }
  }
}
```

## Best Practices

### 1. Use Proper Field Names
- Always use canonical field names (e.g., `source_ip` not `src_ip`)
- Check field compatibility across entity types for correlations
- Use the validation system to get suggestions for correct field names

### 2. Operator Usage
- Use comparison operators (`>=`, `<=`, `>`, `<`) only with numeric or date fields
- Use equality (`:`) for string fields or exact matches
- Use range queries (`[min TO max]`) for numeric ranges

### 3. Query Structure
- Use parentheses to group complex logical expressions
- Quote values that contain spaces or special characters
- Use proper logical operators (`AND`, `OR`, `NOT`)

### 4. Error Handling
- Always check validation results before executing searches
- Use suggestions and corrections provided by the validation system
- Test queries with the enhanced validator before deploying

### 5. Security Considerations
- Never disable security validation
- Be cautious with user-provided queries
- Monitor for validation failures that might indicate attack attempts

## Integration Example

```typescript
import { EnhancedQueryValidator } from './validation/enhanced-query-validator.js';

// Validate before search execution
const validation = EnhancedQueryValidator.validateQuery(userQuery, 'flows');

if (!validation.isValid) {
  // Handle validation errors
  console.error('Query validation failed:', validation.errors);
  
  if (validation.correctedQuery) {
    console.log('Suggested correction:', validation.correctedQuery);
  }
  
  if (validation.suggestions?.length) {
    console.log('Suggestions:', validation.suggestions);
  }
  
  return;
}

// Use corrected query if available
const finalQuery = validation.correctedQuery || validation.sanitizedValue || userQuery;

// Proceed with search execution
const results = await searchEngine.searchFlows({ query: finalQuery, limit: 100 });
```

## Testing Validation

Use the comprehensive test suite to verify validation behavior:

```bash
# Run enhanced validation tests
npm test -- tests/validation/enhanced-query-validation.test.ts

# Run search validation tests
npm test -- tests/tools/search-validation.test.ts

# Run all validation tests
npm test -- --grep "validation"
```

This enhanced validation system significantly improves the robustness and security of search operations while providing helpful feedback to users and developers.