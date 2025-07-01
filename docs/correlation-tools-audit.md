# Correlation Tools Schema Audit Report

## Summary

Comprehensive audit of correlation and cross-reference search tools for multi-entity data correlation capabilities.

**Audit Date**: 2025-06-29T16:47:51.525Z
**Tools Audited**: 6

### Tool Categories
- **Basic Correlation**: 1 tools
- **Enhanced Correlation**: 5 tools

### Status Overview
- ✅ **VALID**: 1 tools
- ⚠️ **BASIC**: 5 tools

## Basic Correlation Tools

### ✅ search_cross_reference

**Status**: VALID
**Type**: Server Schema Definition

**Correlation Field Examples**:
- `"source_ip"`

**Field Validation**:
- ✅ `source_ip`

## Enhanced Correlation Tools

### 🔵 search_enhanced_cross_reference

**Status**: BASIC
**Type**: Handler Implementation
**Handler**: ✅
**Interface**: ✅

**Advanced Features** (2):
- ✅ `correlation_params`
- ✅ `geographic_filters`

### 🔵 get_correlation_suggestions

**Status**: BASIC
**Type**: Handler Implementation
**Handler**: ✅
**Interface**: ✅

**Advanced Features** (2):
- ✅ `correlation_params`
- ✅ `geographic_filters`

### 🔵 search_flows_by_geography

**Status**: BASIC
**Type**: Handler Implementation
**Handler**: ✅
**Interface**: ✅

**Advanced Features** (2):
- ✅ `correlation_params`
- ✅ `geographic_filters`

### 🔵 search_alarms_by_geography

**Status**: BASIC
**Type**: Handler Implementation
**Handler**: ✅
**Interface**: ✅

**Advanced Features** (2):
- ✅ `correlation_params`
- ✅ `geographic_filters`

### 🔵 get_geographic_statistics

**Status**: BASIC
**Type**: Handler Implementation
**Handler**: ✅
**Interface**: ✅

**Advanced Features** (2):
- ✅ `correlation_params`
- ✅ `geographic_filters`

## Correlation Field Compatibility

### Supported Common Fields
- `source_ip`
- `destination_ip`
- `device_ip`
- `protocol`
- `port`
- `country`
- `region`
- `asn`
- `user_agent`
- `application`
- `domain`

### Geographic Correlation Fields
- `country`
- `continent`
- `region`
- `city`
- `asn`
- `hosting_provider`
- `is_cloud`
- `is_vpn`
- `risk_score`

### Advanced Correlation Parameters
- `correlationFields`
- `correlationType`
- `temporalWindow`
- `networkScope`
- `enableScoring`
- `enableFuzzyMatching`
- `minimumScore`
- `customWeights`
## Next Steps

1. **Complete Basic Correlation**: Ensure search_cross_reference has proper examples
2. **Validate Enhanced Tools**: Verify all handler implementations are accessible
3. **Test Correlation Logic**: Validate correlation field mappings work correctly
4. **Proceed to Batch 3**: Audit moderate complexity tools

