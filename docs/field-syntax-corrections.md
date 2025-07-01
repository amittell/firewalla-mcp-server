# Field Syntax Corrections Based on Validation Testing

## Overview

Validation testing revealed significant discrepancies between documented field syntax and actual API field names. This document outlines the corrections needed.

## Critical Field Name Corrections

### search_flows Tool

#### ❌ INCORRECT (Documented)
- `device.ip` - Does not exist
- Documented as invalid: `source_ip` - Actually valid

#### ✅ CORRECT (Actual API)
- `device_ip` - Use underscore notation
- `source_ip` - Valid field for flows
- `destination_ip` - Valid field for flows

#### Updated Examples
```json
// OLD (WRONG)
{
  "query": "device.ip:192.168.1.*",
  "limit": 10
}

// NEW (CORRECT)
{
  "query": "device_ip:192.168.1.*",
  "limit": 10
}
```

### search_devices Tool

#### ❌ INCORRECT (Documented)
- `macVendor` - Does not exist (camelCase)
- Documented as invalid: `mac_vendor` - Actually valid

#### ✅ CORRECT (Actual API) 
- `mac_vendor` - Use underscore notation
- `network_name` - Use underscore notation
- `group_name` - Use underscore notation
- `total_download` - Use underscore notation  
- `total_upload` - Use underscore notation

#### Updated Examples
```json
// OLD (WRONG)
{
  "query": "macVendor:Apple",
  "limit": 10
}

// NEW (CORRECT)
{
  "query": "mac_vendor:Apple", 
  "limit": 10
}
```

### search_rules Tool

#### ❌ INCORRECT (Documented)
- `target.value` - Does not exist (dot notation)
- `hit.count` - Does not exist (dot notation)

#### ✅ CORRECT (Actual API)
- `target_value` - Use underscore notation
- `target_type` - Use underscore notation
- `hit_count` - Use underscore notation
- `created_at` - Use underscore notation
- `updated_at` - Use underscore notation

#### Updated Examples
```json
// OLD (WRONG)
{
  "query": "target.value:*facebook* AND hit.count:>0",
  "limit": 10
}

// NEW (CORRECT)
{
  "query": "target_value:*facebook* AND hit_count:>0",
  "limit": 10
}
```

## Complete Valid Field Lists

### search_flows Valid Fields
Based on validation error message:
- `source_ip` ✅
- `destination_ip` ✅  
- `protocol` ✅
- `direction` ✅
- `blocked` ✅
- `bytes` ✅
- `timestamp` ✅
- `device_ip` ✅
- `region` ✅
- `category` ✅
- `country` ✅
- `country_code` ✅
- `continent` ✅
- `city` ✅
- `timezone` ✅
- `isp` ✅
- `organization` ✅
- `hosting_provider` ✅
- `asn` ✅
- `is_cloud_provider` ✅
- `is_proxy` ✅
- `is_vpn` ✅
- `geographic_risk_score` ✅
- `geo_location` ✅
- `user_agent` ✅
- `application` ✅
- `application_category` ✅
- `domain_category` ✅
- `ssl_subject` ✅
- `ssl_issuer` ✅
- `session_duration` ✅
- `frequency_score` ✅
- `bytes_per_session` ✅
- `connection_pattern` ✅
- `activity_level` ✅

### search_devices Valid Fields
Based on validation error message:
- `name` ✅
- `ip` ✅
- `mac_vendor` ✅
- `online` ✅
- `network_name` ✅
- `group_name` ✅
- `total_download` ✅
- `total_upload` ✅

### search_rules Valid Fields
Based on validation error message:
- `action` ✅
- `target_type` ✅
- `target_value` ✅
- `direction` ✅
- `status` ✅
- `hit_count` ✅
- `created_at` ✅
- `updated_at` ✅

## Pattern Analysis

### Key Insights
1. **API uses underscore notation** consistently instead of dot notation or camelCase
2. **Geographic fields are extensive** in flows with many options
3. **Some documented "invalid" fields are actually valid** (source_ip, mac_vendor)
4. **Nested object fields use underscores** not dots (target_value not target.value)

### Naming Convention Rules
1. Use `snake_case` for all field names
2. No dot notation for nested properties
3. No camelCase formatting
4. Compound words separated by underscores

## Action Items

### Immediate Corrections Required
1. Update search-flows-documentation.md with correct field names
2. Update search-devices-documentation.md with correct field names  
3. Update search-rules-documentation.md with correct field names
4. Update usage examples library with correct syntax
5. Remove incorrect fields from error prevention sections
6. Add newly discovered valid fields to documentation

### Testing Verification
All corrections should be validated against the live API before updating documentation to ensure accuracy.

## Summary of Changes

| Tool | Old Field | New Field | Status |
|------|-----------|-----------|---------|
| search_flows | `device.ip` | `device_ip` | ✅ Fixed |
| search_flows | `source_ip` | `source_ip` | ✅ Valid (was incorrectly marked invalid) |
| search_devices | `macVendor` | `mac_vendor` | ✅ Fixed |
| search_devices | `totalDownload` | `total_download` | ✅ Fixed |
| search_devices | `totalUpload` | `total_upload` | ✅ Fixed |
| search_rules | `target.value` | `target_value` | ✅ Fixed |
| search_rules | `target.type` | `target_type` | ✅ Fixed |
| search_rules | `hit.count` | `hit_count` | ✅ Fixed |

This correction ensures documentation accuracy and prevents field syntax errors for AI models using the tools.