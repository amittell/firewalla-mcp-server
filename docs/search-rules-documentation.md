# search_rules Tool Documentation

## Overview

The `search_rules` tool provides advanced firewall rule searching with complex query syntax. This tool enables filtering and analysis of network rules, their targets, actions, and usage statistics.

**CRITICAL**: This tool requires correct field syntax to function properly. Using incorrect field names will cause search failures.

## Tool Signature

```typescript
search_rules(params: {
  query?: string;          // OPTIONAL: Search query using specific field syntax
  limit: number;           // REQUIRED: Maximum results (1-10000)
  time_range?: {           // OPTIONAL: Time filtering for rule creation/updates
    start: string;         // ISO 8601 format: "2024-01-01T00:00:00Z"
    end: string;           // ISO 8601 format: "2024-01-01T23:59:59Z"
  };
  sort_by?: string;        // OPTIONAL: Sort field and direction (default: "ts:desc")
})
```

## Supported Field Syntax

### Rule Action Fields

#### action
Filter by rule action type.
```
action:allow                   # Allow rules only
action:block                   # Block rules only
action:timelimit              # Time-limited rules only
```

#### status
Filter by rule status.
```
status:active                 # Active rules only
status:paused                 # Paused rules only
```

### Target Configuration

#### target_type
Filter by target type.
```
target_type:domain            # Domain-based rules
target_type:ip               # IP address rules
target_type:category         # Category-based rules
target_type:device           # Device-specific rules
```

#### target_value
Search within target values (supports wildcards).
```
target_value:*facebook*       # Rules targeting Facebook
target_value:*.social.com     # Social media domains
target_value:192.168.1.*      # IP range targets
target_value:*gaming*         # Gaming-related targets
target_value:"exact.domain.com" # Exact domain match
```

### Scope Configuration  

#### scope.type
Filter by rule scope type.
```
scope.type:device            # Device-specific rules
scope.type:group             # Group-applied rules
scope.type:network           # Network-wide rules
scope.type:box               # Box-level rules
```

#### scope.value
Search within scope values.
```
scope.value:mac:AA:BB:CC:DD:EE:FF # MAC address scope
scope.value:*William*        # Rules scoped to William's devices
scope.value:"Kids Group"     # Specific group scope
```

### Network Configuration

#### direction
Filter by traffic direction.
```
direction:bidirection         # Both inbound and outbound
direction:inbound            # Inbound traffic only
direction:outbound           # Outbound traffic only
```

#### protocol
Filter by network protocol.
```
protocol:tcp                 # TCP protocol rules
protocol:udp                 # UDP protocol rules
```

### Rule Content

#### notes
Search within rule notes/descriptions.
```
notes:*social*               # Notes containing "social"
notes:*gaming*               # Notes about gaming
notes:"parental control"     # Exact phrase in notes
```

### Usage Statistics

#### hit_count
Filter by rule hit count.
```
hit_count:>100               # Rules with more than 100 hits
hit_count:>=50               # 50 hits or more
hit_count:[10 TO 1000]       # Between 10-1000 hits
hit_count:0                  # Unused rules
```

#### hit.lastHitTs
Filter by last hit timestamp.
```
hit.lastHitTs:>1641024000    # Recently triggered rules
hit.lastHitTs:<1641024000    # Rules not hit recently
```

### Time-based Fields

#### created_at
Filter by rule creation timestamp.
```
created_at:>1641024000       # Created after timestamp
created_at:[1641024000 TO 1641110400] # Created in time range
```

#### updated_at  
Filter by last update timestamp.
```
updated_at:>1641024000       # Recently updated rules
updated_at:<1641024000       # Not updated recently
```

#### resumeTs
Filter by auto-resume timestamp (for paused rules).
```
resumeTs:>1641024000         # Rules with future resume time
resumeTs:<1641024000         # Rules with past resume time
```

### Box and Group Association

#### gid
Filter by Firewalla box identifier.
```
gid:00000000-0000-0000-0000-000000000000 # Specific box rules
```

#### group
Filter by box group identifier.
```
group:group_id_here          # Rules for specific group
```

## Logical Operators

### AND
Both conditions must be true.
```
action:block AND status:active
target.value:*social* AND scope.type:device
```

### OR
Either condition must be true.
```
action:block OR action:timelimit
target.value:*facebook* OR target.value:*twitter*
```

### NOT
Condition must not be true.
```
NOT status:paused            # Only active rules
action:block AND NOT hit.count:0 # Used blocking rules
```

### Grouping with Parentheses
Control operator precedence.
```
(action:block OR action:timelimit) AND status:active
target.value:*social* AND (scope.type:device OR scope.type:group)
```

## Comparison Operators

### Equality
```
action:block                 # Equals "block"
status:active               # Equals "active"
```

### Greater Than
```
hit.count:>100              # More than 100 hits
ts:>1641024000              # After timestamp
```

### Greater Than or Equal
```
hit.count:>=50              # 50 hits or more
```

### Less Than
```
hit.count:<10               # Less than 10 hits
updateTs:<1641024000        # Updated before timestamp
```

### Less Than or Equal
```
hit.count:<=100             # 100 hits or fewer
```

### Range
```
hit.count:[10 TO 1000]      # Between 10-1000 hits
ts:[1641024000 TO 1641110400] # Time range
```

## Common Usage Examples

### Active Blocking Rules
```json
{
  "query": "action:block AND status:active",
  "limit": 100,
  "sort_by": "hit.count:desc"
}
```

### Social Media Restrictions
```json
{
  "query": "(target.value:*facebook* OR target.value:*twitter* OR target.value:*instagram*) AND action:block",
  "limit": 50,
  "sort_by": "ts:desc"
}
```

### Time-Limited Rules Analysis
```json
{
  "query": "action:timelimit AND status:active",
  "limit": 75,
  "sort_by": "resumeTs:asc"
}
```

### Device-Specific Rules
```json
{
  "query": "scope.type:device AND scope.value:*William*",
  "limit": 30,
  "sort_by": "updateTs:desc"
}
```

### Unused Rules Detection
```json
{
  "query": "hit.count:0 AND status:active",
  "limit": 50,
  "sort_by": "ts:asc"
}
```

### Gaming Restrictions
```json
{
  "query": "(target.value:*steam* OR target.value:*xbox* OR target.value:*gaming*) AND action:block",
  "limit": 40,
  "sort_by": "hit.count:desc"
}
```

### Recently Paused Rules
```json
{
  "query": "status:paused",
  "limit": 25,
  "sort_by": "updateTs:desc"
}
```

### High-Traffic Rules
```json
{
  "query": "hit.count:>1000 AND action:block",
  "limit": 20,
  "sort_by": "hit.count:desc"
}
```

### Domain Blocking Analysis
```json
{
  "query": "target.type:domain AND action:block AND hit.count:>0",
  "limit": 100,
  "sort_by": "hit.count:desc"
}
```

### Group Policy Review
```json
{
  "query": "scope.type:group AND action:timelimit",
  "limit": 50,
  "sort_by": "ts:desc"
}
```

## Error Prevention

### ❌ INCORRECT Field Syntax
These field names will cause failures:
```
rule_action:block             # Wrong: Use action
rule_status:active            # Wrong: Use status
target.type:domain            # Wrong: Use target_type (underscore)
target.value:facebook         # Wrong: Use target_value (underscore)
scope.type:device             # Wrong: Use scope.type (dot notation still valid)
scope.value:mac               # Wrong: Use scope.value (dot notation still valid)
hit.count:>100                # Wrong: Use hit_count (underscore)
ts:1641024000                 # Wrong: Use created_at (underscore)
updateTs:1641024000           # Wrong: Use updated_at (underscore)
```

### ✅ CORRECT Field Syntax
Use these verified field names:
```
action:block                  # Correct: Rule action
status:active                 # Correct: Rule status
target_type:domain            # Correct: Target type (underscore)
target_value:*facebook*       # Correct: Target value (underscore)
scope.type:device             # Correct: Scope type (dot notation)
scope.value:*William*         # Correct: Scope value (dot notation)
hit_count:>100                # Correct: Hit count (underscore)
created_at:>1641024000        # Correct: Creation timestamp (underscore)
updated_at:>1641024000        # Correct: Update timestamp (underscore)
```

### Parameter Requirements
```json
{
  "query": "OPTIONAL - Can be omitted to get all rules",
  "limit": "REQUIRED - Must be 1-10000",
  "time_range": "OPTIONAL - Both start and end required if used",
  "sort_by": "OPTIONAL - Must be valid field:direction format"
}
```

### Action Values
```
action:allow                  # Allow traffic
action:block                  # Block traffic
action:timelimit             # Time-limited access
```

### Status Values
```
status:active                # Rule is currently active
status:paused                # Rule is temporarily disabled
```

## Sort Options

### Available Sort Fields
```
ts:desc                      # Creation time descending (default)
ts:asc                       # Creation time ascending
updateTs:desc                # Update time descending
updateTs:asc                 # Update time ascending
hit.count:desc               # Hit count descending
hit.count:asc                # Hit count ascending
hit.lastHitTs:desc           # Last hit time descending
resumeTs:asc                 # Resume time ascending (for paused rules)
```

### Sort Examples
```json
{
  "sort_by": "hit.count:desc"  # Most triggered rules first
}
```

```json
{
  "sort_by": "ts:desc"         # Newest rules first
}
```

## Rule Categories and Use Cases

### Parental Controls
```json
{
  "query": "(target.value:*porn* OR target.value:*adult* OR notes:*parental*) AND action:block",
  "limit": 50
}
```

### Business Policy Rules
```json
{
  "query": "(target.value:*social* OR target.value:*gaming*) AND action:timelimit",
  "limit": 75
}
```

### Security Rules
```json
{
  "query": "(target.type:ip OR notes:*security*) AND action:block",
  "limit": 100
}
```

### Temporary Rules
```json
{
  "query": "status:paused AND resumeTs:>1641024000",
  "limit": 30
}
```

## Performance Considerations

### Efficient Queries
- Filter by action and status first for better performance
- Use specific target.value searches when possible
- Limit hit.count ranges to reasonable values
- Use time ranges for large rule sets

### Query Optimization Tips
```
action:block AND status:active        # Good: Primary filters first
target.value:*facebook* AND action:block # Good: Specific target
hit.count:>0 AND target.value:*       # Poor: Broad wildcard
notes:* AND scope.value:*             # Poor: Multiple wildcards
```

### Recommended Limits
```
Rule review: limit: 100
Policy audit: limit: 200
Usage analysis: limit: 50
Troubleshooting: limit: 25
```

## Rule Management Workflows

### Active Rule Audit
```json
{
  "query": "status:active",
  "limit": 200,
  "sort_by": "updateTs:desc"
}
```

### Unused Rule Cleanup
```json
{
  "query": "hit.count:0 AND ts:<1641024000",
  "limit": 50,
  "sort_by": "ts:asc"
}
```

### Policy Effectiveness Analysis
```json
{
  "query": "action:block AND hit.count:>100",
  "limit": 25,
  "sort_by": "hit.count:desc"
}
```

### Temporary Rule Management
```json
{
  "query": "status:paused",
  "limit": 30,
  "sort_by": "resumeTs:asc"
}
```

## Target Types and Examples

### Domain Targets
```
target.type:domain AND target.value:*.facebook.com
target.type:domain AND target.value:*social*
```

### IP Address Targets  
```
target.type:ip AND target.value:192.168.*
target.type:ip AND target.value:203.0.113.1
```

### Category Targets
```
target.type:category AND target.value:*adult*
target.type:category AND target.value:*gaming*
```

### Device Targets
```
target.type:device AND target.value:mac:*
target.type:device AND target.value:*William*
```

## API Integration

### Error Handling
```json
{
  "error": true,
  "message": "Query validation failed: Unknown field 'rule_action'. Did you mean 'action'?",
  "tool": "search_rules",
  "validation_errors": ["Invalid field name in query"]
}
```

### Success Response Format
```json
{
  "count": 42,
  "results": [
    {
      "id": "rule_abc123",
      "gid": "box-id-here",
      "action": "block",
      "direction": "bidirection",
      "target": {
        "type": "domain",
        "value": "facebook.com"
      },
      "scope": {
        "type": "device", 
        "value": "mac:AA:BB:CC:DD:EE:FF"
      },
      "status": "active",
      "protocol": "tcp",
      "notes": "Block social media",
      "hit": {
        "count": 156,
        "lastHitTs": 1641024000,
        "statsResetTs": 1641020000
      },
      "ts": 1641024000,
      "updateTs": 1641024000
    }
  ],
  "next_cursor": "cursor_token_here"
}
```

## Field Reference Quick Guide

| Category | Field Name | Example Usage | Data Type |
|----------|------------|---------------|-----------|
| Action | `action` | `action:block` | String |
| Status | `status` | `status:active` | String |
| Target | `target_type` | `target_type:domain` | String |
| Target | `target_value` | `target_value:*facebook*` | String |
| Scope | `scope.type` | `scope.type:device` | String |
| Scope | `scope.value` | `scope.value:*William*` | String |
| Network | `direction` | `direction:bidirection` | String |
| Network | `protocol` | `protocol:tcp` | String |
| Content | `notes` | `notes:*social*` | String |
| Usage | `hit_count` | `hit_count:>100` | Number |
| Usage | `hit.lastHitTs` | `hit.lastHitTs:>1641024000` | Number |
| Time | `created_at` | `created_at:>1641024000` | Number |
| Time | `updated_at` | `updated_at:>1641024000` | Number |
| Time | `resumeTs` | `resumeTs:>1641024000` | Number |
| Box | `gid` | `gid:box-uuid-here` | String |
| Group | `group` | `group:group_id` | String |

## Rule Investigation Workflows

### 1. Policy Compliance Check
```json
{
  "query": "action:block AND status:active AND hit.count:>0",
  "limit": 100,
  "sort_by": "hit.count:desc"
}
```

### 2. Unused Rule Analysis
```json
{
  "query": "hit.count:0 AND status:active",
  "limit": 50,
  "sort_by": "ts:asc"
}
```

### 3. User-Specific Rules
```json
{
  "query": "scope.value:*William* AND status:active",
  "limit": 20,
  "sort_by": "updateTs:desc"
}
```

### 4. Temporary Access Management
```json
{
  "query": "status:paused AND resumeTs:>1641024000",
  "limit": 25,
  "sort_by": "resumeTs:asc"
}
```

### 5. High-Impact Rule Review
```json
{
  "query": "hit.count:>1000 AND action:block",
  "limit": 15,
  "sort_by": "hit.count:desc"
}
```

This comprehensive guide ensures correct usage of the search_rules tool and prevents field syntax errors commonly encountered with firewall rule searches.