# Firewalla MCP Server Validation Pattern Catalog

## Overview

This catalog documents all validation patterns, error messages, and parameter requirements used across the Firewalla MCP server. It serves as a comprehensive reference for implementing consistent validation across tools and improving error messages for better user experience.

## 1. Validation Infrastructure

### Error Types (ErrorType enum)
- `VALIDATION_ERROR` - Parameter validation failures
- `AUTHENTICATION_ERROR` - API authentication issues  
- `API_ERROR` - Firewalla API-related errors
- `NETWORK_ERROR` - Network connectivity issues
- `TIMEOUT_ERROR` - Request timeout failures
- `RATE_LIMIT_ERROR` - API rate limiting
- `CACHE_ERROR` - Caching system errors
- `CORRELATION_ERROR` - Cross-reference correlation failures
- `SEARCH_ERROR` - Search query processing errors
- `UNKNOWN_ERROR` - Unclassified errors

### Validation Classes
- **ParameterValidator**: Core validation utilities
- **SafeAccess**: Null-safe property access and array operations
- **QuerySanitizer**: Search query sanitization and security
- **FieldMapper**: Cross-reference field compatibility validation

## 2. Tool-Specific Validation Requirements by Category

### Security Tools (`security` category)

#### get_active_alarms
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
query: string (optional, sanitized with QuerySanitizer)
groupBy: string (optional)
sortBy: string (optional, default: 'timestamp:desc')
cursor: string (optional)

// Validation Pattern
const limitValidation = ParameterValidator.validateNumber(args?.limit, 'limit', {
  required: true, min: 1, max: 1000, integer: true
});
```

#### get_specific_alarm / delete_alarm
```typescript
// Required Parameters
alarm_id: string (required, non-empty)

// Validation Pattern
const alarmIdValidation = ParameterValidator.validateRequiredString(args?.alarm_id, 'alarm_id');
```

### Network Tools (`network` category)

#### get_flow_data
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
query: string (optional)
groupBy: string (optional)
sortBy: string (optional)
cursor: string (optional)
start_time: string (optional, ISO timestamp)
end_time: string (optional, ISO timestamp)

// Special Logic: Time range query building
if (startTime && endTime) {
  const startTs = Math.floor(new Date(startTime).getTime() / 1000);
  const endTs = Math.floor(new Date(endTime).getTime() / 1000);
  const timeQuery = `ts:${startTs}-${endTs}`;
  finalQuery = query ? `${query} AND ${timeQuery}` : timeQuery;
}
```

#### get_bandwidth_usage
```typescript
// Required Parameters
period: string (required, enum: ['1h', '24h', '7d', '30d'])
limit: number (required, min: 1, max: 500, integer: true)

// Validation Pattern
const periodValidation = ParameterValidator.validateEnum(
  args?.period, 'period', ['1h', '24h', '7d', '30d'], true
);
```

#### get_offline_devices
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
sort_by_last_seen: boolean (optional, default: true)

// Buffer Strategy: 3x fetch multiplier for filtering
const fetchLimit = Math.min(limit * 3, 1000);
```

### Rule Management Tools (`rule` category)

#### get_network_rules
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
query: string (optional)
summary_only: boolean (optional, default: false)

// Optimization: Summary mode with field filtering
if (summaryOnly) {
  includeFields: ['id', 'action', 'target', 'direction', 'status', 'hit']
  excludeFields: ['notes', 'schedule', 'timeUsage', 'scope']
}
```

#### pause_rule / resume_rule
```typescript
// Required Parameters
rule_id: string (required, non-empty)

// Optional Parameters (pause_rule only)
duration: number (optional, min: 1, max: 1440, default: 60, integer: true)

// Context Message
ParameterValidator.getContextualBoundaryMessage('duration', value, min, max)
// Returns: "duration in minutes for temporary rule changes"
```

#### get_target_lists
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
list_type: string (optional, enum: ['cloudflare', 'crowdsec', 'all'])

// Manual Validation (not using validateEnum)
if (listType !== undefined) {
  const validTypes = ['cloudflare', 'crowdsec', 'all'];
  if (!validTypes.includes(listType)) {
    return createErrorResponse(tool, 'Invalid list_type parameter', 
      ErrorType.VALIDATION_ERROR, undefined, 
      [`list_type must be one of: ${validTypes.join(', ')}`]);
  }
}

// Buffer Strategy: 500 targets per list limit
targets: arr.slice(0, 500) // Per-list target buffer limit
```

#### get_most_active_rules
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
min_hits: number (optional, min: 0, max: 1000000, default: 1, integer: true)

// Buffer Strategy: 3x fetch multiplier with 3000 cap
const fetchLimit = Math.min(limit * 3, 3000);
```

#### get_recent_rules
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
hours: number (optional, min: 1, max: 168, default: 24, integer: true)
include_modified: boolean (optional, default: true)

// Adaptive Buffer Strategy: Dynamic multiplier based on limit size
const fetchMultiplier = Math.max(3, Math.min(10, 500 / limit));
const fetchLimit = Math.min(limit * fetchMultiplier, 2000);
```

### Device Tools (`device` category)

#### get_device_status
```typescript
// Required Parameters
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
device_id: string (optional)
include_offline: boolean (optional, default: true)
cursor: string (optional)
```

### Analytics Tools (`analytics` category)

#### get_boxes
```typescript
// Optional Parameters
group_id: string (optional)

// Validation Pattern
const groupIdValidation = ParameterValidator.validateOptionalString(args?.group_id, 'group_id');
```

#### get_simple_statistics
```typescript
// No parameters required - pure getter tool
```

#### get_network_rules_summary
```typescript
// Optional Parameters
rule_type: string (optional, enum: ['block', 'allow', 'timelimit', 'all'], default: 'all')
active_only: boolean (optional, default: true)

// Analysis Buffer: Fixed 5000 rule limit for statistics
const analysisLimit = 5000; // Fixed buffer for statistical analysis
```

### Search Tools (`search` category)

#### Universal Search Validation Pattern
```typescript
// Configuration-based validation
interface SearchValidationConfig {
  requireQuery?: boolean;        // Default: true
  requireLimit?: boolean;        // Default: true  
  maxLimit?: number;            // Default: 1000 for flows, 500 for others
  supportsCursor?: boolean;     // Default: false
  supportsGroupBy?: boolean;    // Default: false
  supportsSortBy?: boolean;     // Default: false
}

// Standard validation for all search tools
const queryValidation = ParameterValidator.validateRequiredString(params?.query, 'query');
const limitValidation = ParameterValidator.validateNumber(params?.limit, 'limit', {
  required: true, min: 1, max: maxLimit, integer: true
});
```

#### search_flows
```typescript
// Required Parameters
query: string (required, sanitized)
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
sort_by: string (optional)
group_by: string (optional)
cursor: string (optional)
```

#### search_alarms / search_rules / search_devices / search_target_lists
```typescript
// Required Parameters
query: string (required, sanitized)
limit: number (required, min: 1, max: 500, integer: true)

// Same optional parameter pattern as search_flows
```

#### search_cross_reference
```typescript
// Required Parameters
primary_query: string (required, sanitized)
secondary_queries: string[] (required, each element sanitized)
limit: number (required, min: 1, max: 1000, integer: true)

// Optional Parameters
correlation_field: string (optional, validated against FIELD_MAPPINGS)
```

#### Enhanced Cross-Reference Tools
```typescript
// search_enhanced_cross_reference
correlation_params: {
  correlationFields: CorrelationFieldName[] (required)
  correlationType: 'AND' | 'OR' (optional, default: 'AND')
  temporalWindow: { windowSize: number, windowUnit: TimeWindowUnit } (optional)
  networkScope: { includeSubnets: boolean, includePorts: boolean } (optional)
}

// search_enhanced_scored_cross_reference
correlation_params: {
  ...all enhanced fields
  enableScoring: boolean (optional, default: false)
  enableFuzzyMatching: boolean (optional, default: false)
  minimumScore: number (optional, min: 0.0, max: 1.0, default: 0.5)
  customWeights: Record<string, number> (optional)
  fuzzyConfig: FuzzyMatchConfig (optional)
}
```

## 3. Common Error Messages and Triggers

### Parameter Validation Errors

#### Required Parameter Missing
```javascript
// Trigger: undefined/null required parameter
"limit is required"
"query is required" 
"alarm_id is required"
"rule_id is required"
```

#### Type Validation Errors
```javascript
// Trigger: wrong parameter type
"limit must be a valid number"
"limit must be an integer"
"query must be a string, got number"
"sort_by must be a string if provided, got number"
```

#### Range Validation Errors
```javascript
// Trigger: value outside acceptable range
"limit is too small (got 0, minimum: 1)"
"limit is too large (got 2000, maximum: 1000)"
"duration exceeds system limits (got 2000, maximum: 1440 for performance reasons)"
"min_hits must be a positive number (got -5, minimum: 0)"
```

#### Enum Validation Errors
```javascript
// Trigger: invalid enum value
"period must be one of: 1h, 24h, 7d, 30d, got 'invalid'"
"rule_type must be one of: block, allow, timelimit, all, got 'invalid'"
"list_type must be one of: cloudflare, crowdsec, all"
```

#### String Validation Errors
```javascript
// Trigger: empty/whitespace strings
"query cannot be empty"
"alarm_id cannot be empty"
"rule_id cannot be empty"
```

#### Boolean Validation Errors
```javascript
// Trigger: invalid boolean representation
"sort_by_last_seen must be a boolean value"
"include_offline must be a boolean value"
```

### Query Sanitization Errors

#### Security Validation
```javascript
// Trigger: dangerous patterns detected
"Query contains potentially dangerous content"
"Query is too long (maximum 2000 characters)"
"Query must be a non-empty string"
```

#### Field Validation Errors
```javascript
// Trigger: invalid correlation field
"Field 'invalid_field' is not allowed. Valid fields: source_ip, destination_ip, protocol"
```

### Enhanced Correlation Errors

#### Correlation Configuration Errors
```javascript
// Trigger: invalid correlation parameters
"Invalid correlation type. Must be 'AND' or 'OR'"
"Correlation fields cannot be empty"
"Minimum score must be between 0.0 and 1.0"
"Temporal window size must be positive"
"Custom weight must be between 0.0 and 1.0"
```

#### Field Mapping Errors
```javascript
// Trigger: field compatibility issues
"Correlation field 'invalid_field' not supported for entity type 'flows'"
"No compatible fields found between entities"
"Field mapping failed for cross-reference"
```

## 4. Parameter Validation Patterns

### Required vs Optional Parameters

#### Required String Pattern
```typescript
const validation = ParameterValidator.validateRequiredString(value, paramName);
// Must be: non-null, non-undefined, non-empty after trim
// Returns: { isValid: boolean, errors: string[], sanitizedValue?: string }
```

#### Optional String Pattern  
```typescript
const validation = ParameterValidator.validateOptionalString(value, paramName);
// Accepts: undefined, null (converted to undefined), or valid string
// Returns: sanitized string or undefined
```

#### Required Number Pattern
```typescript
const validation = ParameterValidator.validateNumber(value, paramName, {
  required: true,
  min: 1,
  max: 1000,
  integer: true
});
// Must be: valid number within range, integer if specified
```

#### Optional Number with Default
```typescript
const validation = ParameterValidator.validateNumber(value, paramName, {
  min: 1,
  max: 100,
  defaultValue: 50,
  integer: true
});
// Uses defaultValue if undefined/null, validates default against constraints
```

#### Enum Validation Pattern
```typescript
const validation = ParameterValidator.validateEnum(
  value, paramName, allowedValues, required, defaultValue
);
// Validates against exact string matches in allowedValues array
```

#### Boolean Validation Pattern
```typescript
const validation = ParameterValidator.validateBoolean(value, paramName, defaultValue);
// Accepts: true/false, 'true'/'false', '1'/'0' (case insensitive)
```

### Data Type Ranges and Limits

#### Limit Parameters (Universal)
- **Min**: 1 (no zero-result queries)
- **Max**: 500-1000 (entity-dependent)
- **Integer**: Required
- **Context**: "to control result set size and prevent memory issues"

#### Time-based Parameters
- **duration**: 1-1440 minutes (1 minute to 24 hours)
- **hours**: 1-168 hours (1 hour to 1 week)
- **min_hits**: 0-1000000 (unlimited upper bound for flexibility)

#### Performance Limits
- **Target lists per query**: 500 (buffer strategy)
- **Correlation results**: 1000-5000 (context-dependent)
- **Query length**: 2000 characters maximum
- **Fetch multipliers**: 3x-10x adaptive buffers

## 5. Field Syntax Validation

### Search Query Syntax
```typescript
// Basic field queries
"severity:high"
"source_ip:192.168.1.1"
"protocol:tcp"

// Logical operators
"severity:high AND source_ip:192.168.*"
"action:block OR action:timelimit"

// Wildcards and patterns
"ip:192.168.*"
"device_name:*laptop*"
"target_value:*.facebook.com"

// Ranges and comparisons
"bytes:[1000 TO 50000]"
"severity:>=medium"
"timestamp:>=2024-01-01"

// Complex queries
"(severity:high OR severity:critical) AND source_ip:192.168.* NOT resolved:true"
```

### Correlation Field Names (CorrelationFieldName type)
```typescript
// Network identifiers
'source_ip' | 'destination_ip' | 'device_ip' | 'device_id'

// Protocol and network details  
'protocol' | 'bytes' | 'timestamp' | 'direction' | 'blocked'
'port' | 'port_range' | 'subnet' | 'network_segment'

// Device fields
'device_type' | 'device_vendor' | 'device_group' | 'mac_vendor'
'device_category' | 'mac' | 'name' | 'vendor' | 'online'

// Geographic fields
'country' | 'continent' | 'city' | 'region' | 'asn'
'organization' | 'hosting_provider' | 'is_cloud_provider'
'is_proxy' | 'is_vpn' | 'geographic_risk_score'

// Application fields
'user_agent' | 'application' | 'application_category'
'domain_category' | 'ssl_subject' | 'ssl_issuer'

// Behavioral patterns
'session_duration' | 'frequency_score' | 'bytes_per_session'
'connection_pattern' | 'activity_level'

// Temporal fields
'time_window' | 'hour_of_day' | 'day_of_week' | 'time_pattern'

// Security fields
'severity' | 'alarm_type' | 'type' | 'resolution_status'
'rule_category' | 'target_domain' | 'target_category'
'action' | 'target_value' | 'hit_count' | 'rule_status'
```

### Field Mapping Validation
```typescript
// Each entity type has specific field mappings
FIELD_MAPPINGS: Record<EntityType, Record<string, string[]>>

// Example: flows entity
'source_ip': ['source.ip', 'device.ip', 'srcIP']
'destination_ip': ['destination.ip', 'dstIP']  
'protocol': ['protocol']
'bytes': ['bytes', 'download', 'upload']

// Validation ensures fields exist for target entity type
const isValidField = FIELD_MAPPINGS[entityType][correlationField] !== undefined;
```

## 6. Best Practices for Consistent Validation

### 1. Standard Error Response Format
```typescript
const errorResponse: StandardError = {
  error: true,
  message: string,
  tool: string,
  errorType: ErrorType,
  timestamp: string,
  validation_errors?: string[],
  details?: Record<string, unknown>,
  context?: {
    endpoint?: string,
    parameters?: Record<string, unknown>,
    userAgent?: string,
    requestId?: string
  }
};
```

### 2. Validation Combination Pattern
```typescript
const validationResult = ParameterValidator.combineValidationResults([
  queryValidation,
  limitValidation,
  sortByValidation
]);

if (!validationResult.isValid) {
  return createErrorResponse(toolName, 'Parameter validation failed', 
    ErrorType.VALIDATION_ERROR, undefined, validationResult.errors);
}
```

### 3. Query Sanitization Pattern
```typescript
let sanitizedQuery = queryValidation.sanitizedValue as string | undefined;
if (sanitizedQuery) {
  const queryCheck = QuerySanitizer.sanitizeSearchQuery(sanitizedQuery);
  if (!queryCheck.isValid) {
    return createErrorResponse(toolName, 'Query validation failed',
      ErrorType.VALIDATION_ERROR, undefined, queryCheck.errors);
  }
  sanitizedQuery = queryCheck.sanitizedValue as string;
}
```

### 4. Safe Data Access Pattern
```typescript
// Use SafeAccess for all data extraction
const devices = SafeAccess.safeArrayMap(response.results, (device: any) => ({
  id: SafeAccess.getNestedValue(device, 'id', 'unknown'),
  name: SafeAccess.getNestedValue(device, 'name', 'Unknown Device'),
  online: SafeAccess.getNestedValue(device, 'online', false)
}));
```

### 5. Buffer Strategy Documentation Pattern
```typescript
// Document buffer strategies with clear rationale
// Buffer Strategy: 3x fetch multiplier for filtering
//
// Problem: When filtering for offline devices, we don't know how many devices
// are offline until after fetching. If we only fetch the requested limit,
// we might get fewer results than requested after filtering.
//
// Solution: Use a "buffer multiplier" strategy where we fetch 3x the requested
// limit to increase the probability of having enough offline devices after
// filtering.
const fetchLimit = Math.min(limit * 3, 1000);
```

### 6. Contextual Error Messages
```typescript
// Use ParameterValidator.getParameterContext for helpful context
private static getParameterContext(paramName: string): string {
  const contexts: Record<string, string> = {
    limit: 'to control result set size and prevent memory issues',
    min_hits: 'to filter rules by activity level',
    duration: 'in minutes for temporary rule changes',
    hours: 'for time-based filtering'
  };
  return contexts[paramName] || '';
}
```

### 7. Progressive Validation Complexity
- **Level 1**: Basic type and presence validation
- **Level 2**: Range and enum validation  
- **Level 3**: Cross-field validation and sanitization
- **Level 4**: Entity compatibility and correlation validation
- **Level 5**: Security and injection prevention

This catalog ensures consistent validation patterns across all tools while maintaining security, performance, and usability standards.