# Geographic Field Mapping and Search Documentation

## Overview

The Firewalla MCP server provides comprehensive geographic search capabilities across different data types (flows, alarms, rules, devices). This document details the field mapping system, geographic enrichment data, and best practices for geographic searches.

## Geographic Field Mapping

### Field Compatibility Matrix

| Geographic Field | Flows | Alarms | Rules | Devices | Target Lists |
|------------------|-------|--------|-------|---------|--------------|
| `country` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `continent` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `city` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `region` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `country_code` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `asn` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `is_cloud_provider` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `is_vpn` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `is_proxy` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `geographic_risk_score` | ✅ | ✅ | ❌ | ❌ | ✅ |

### Field Path Mappings

#### Flows Geographic Fields
```javascript
flows: {
  'country': ['geo.country', 'location.country', 'country', 'destination.country'],
  'continent': ['geo.continent', 'location.continent', 'destination.continent'],
  'city': ['geo.city', 'location.city', 'destination.city'],
  'region': ['geo.region', 'location.region', 'destination.region'],
  'country_code': ['geo.country_code', 'location.country_code', 'destination.country_code'],
  'asn': ['geo.asn', 'destination.asn', 'asn'],
  'is_cloud_provider': ['geo.cloud', 'destination.cloud', 'is_cloud'],
  'is_vpn': ['geo.vpn', 'destination.vpn', 'is_vpn'],
  'is_proxy': ['geo.proxy', 'destination.proxy', 'is_proxy'],
  'geographic_risk_score': ['geo.risk_score', 'risk_score', 'geoRisk']
}
```

#### Alarms Geographic Fields
```javascript
alarms: {
  'country': ['geo.country', 'location.country', 'country', 'remote.country'],
  'continent': ['geo.continent', 'location.continent', 'remote.continent'],
  'city': ['geo.city', 'location.city', 'remote.city'],
  'region': ['geo.region', 'location.region', 'remote.region'],
  'country_code': ['geo.country_code', 'location.country_code', 'remote.country_code'],
  'asn': ['geo.asn', 'remote.asn', 'asn'],
  'is_cloud_provider': ['geo.cloud', 'remote.cloud', 'is_cloud'],
  'is_vpn': ['geo.vpn', 'remote.vpn', 'is_vpn'],
  'is_proxy': ['geo.proxy', 'remote.proxy', 'is_proxy'],
  'geographic_risk_score': ['geo.risk_score', 'risk_score', 'remote.geoRisk']
}
```

## Geographic Search Tools

### search_flows_by_geography

**Purpose**: Search network flows with geographic filtering and analysis.

**Example Usage**:
```json
{
  "query": "protocol:tcp AND bytes:>1000000",
  "geographic_filters": {
    "countries": ["China", "Russia"],
    "continents": ["Asia"],
    "min_risk_score": 0.7,
    "exclude_cloud": true,
    "exclude_vpn": false
  },
  "limit": 200
}
```

**Geographic Filters**:
- `countries` (array): Filter by specific countries
- `continents` (array): Filter by continents  
- `regions` (array): Filter by geographic regions
- `cities` (array): Filter by specific cities
- `asns` (array): Filter by ASN numbers
- `hosting_providers` (array): Filter by hosting providers
- `min_risk_score` (number): Minimum geographic risk score (0-1)
- `exclude_cloud` (boolean): Exclude cloud provider traffic
- `exclude_vpn` (boolean): Exclude VPN/proxy traffic

### search_alarms_by_geography

**Purpose**: Search security alarms with geographic threat analysis.

**Example Usage**:
```json
{
  "query": "severity:>=medium",
  "geographic_filters": {
    "high_risk_countries": true,
    "exclude_known_providers": true,
    "threat_analysis": true
  },
  "limit": 100
}
```

**Geographic Filters**:
- `high_risk_countries` (boolean): Include only high-risk countries
- `exclude_known_providers` (boolean): Exclude known cloud/hosting providers
- `threat_analysis` (boolean): Enable detailed threat intelligence analysis
- `countries`, `continents`, `regions`: Same as flows

### get_geographic_statistics

**Purpose**: Comprehensive geographic statistics and analytics.

**Example Usage**:
```json
{
  "entity_type": "flows",
  "group_by": "country",
  "analysis_type": "threat_intelligence",
  "time_range": {
    "start": "2024-01-01T00:00:00Z", 
    "end": "2024-01-31T23:59:59Z"
  }
}
```

**Parameters**:
- `entity_type`: "flows" or "alarms"
- `group_by`: "country", "continent", "region", "asn", "provider"
- `analysis_type`: "summary", "detailed", "threat_intelligence"

## Geographic Enrichment Data

### Risk Scoring

**Geographic Risk Scores** (0.0 - 1.0):
- **0.0 - 0.3**: Low risk (trusted countries, established infrastructure)
- **0.4 - 0.6**: Medium risk (developing countries, mixed reputation)  
- **0.7 - 0.8**: High risk (known for cyber activity, poor regulation)
- **0.9 - 1.0**: Critical risk (sanctioned countries, active threat sources)

### Country Classification

**High-Risk Countries** (risk_score >= 0.7):
- Countries with known state-sponsored cyber activity
- Regions with poor cybersecurity regulation
- Areas with high concentrations of threat actors

**Cloud Provider Detection**:
- Amazon Web Services (AWS)
- Microsoft Azure
- Google Cloud Platform (GCP)
- DigitalOcean, Linode, Vultr
- Major CDN providers (CloudFlare, Fastly)

**VPN/Proxy Detection**:
- Known VPN provider IP ranges
- Anonymous proxy services
- Tor exit nodes
- Public proxy servers

## Best Practices

### 1. Efficient Geographic Queries

```json
// Good: Specific country filter
{
  "geographic_filters": {
    "countries": ["China"]
  }
}

// Better: Combined with risk scoring
{
  "geographic_filters": {
    "countries": ["China"],
    "min_risk_score": 0.8
  }
}

// Best: Exclude noise, focus on threats
{
  "geographic_filters": {
    "high_risk_countries": true,
    "exclude_cloud": true,
    "exclude_vpn": false,
    "min_risk_score": 0.7
  }
}
```

### 2. Risk Analysis Workflows

```json
// Step 1: High-level geographic overview
{
  "entity_type": "flows",
  "group_by": "continent",
  "analysis_type": "summary"
}

// Step 2: Focus on high-risk regions
{
  "geographic_filters": {
    "continents": ["Asia"],
    "min_risk_score": 0.8
  }
}

// Step 3: Detailed threat analysis
{
  "geographic_filters": {
    "countries": ["China", "Russia"],
    "threat_analysis": true
  }
}
```

### 3. Performance Optimization

- **Use specific filters**: Country filters are more efficient than region filters
- **Limit results**: Always specify appropriate limit values
- **Cache results**: Geographic data changes infrequently
- **Batch queries**: Use correlation searches for related data

## Field Mapping Implementation

### Flexible Field Resolution

The system uses a flexible field mapping approach that tries multiple possible field paths:

```javascript
// Example: Finding country data
function getFieldValue(item, field, entityType) {
  const mappings = FIELD_MAPPINGS[entityType][field];
  
  for (const path of mappings) {
    const value = getNestedValue(item, path);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  
  return null;
}
```

### Adding New Geographic Fields

To add support for new geographic fields:

1. **Update Field Mappings** in `src/validation/field-mapper.ts`
2. **Add Field Validation** in geographic search handlers
3. **Update Documentation** in this file
4. **Add Test Coverage** for the new field

Example:
```javascript
// Add timezone support
flows: {
  'timezone': ['geo.timezone', 'location.timezone', 'destination.timezone']
}
```

## Troubleshooting

### Common Issues

**Empty Geographic Results**:
- Check if entity type supports geographic fields
- Verify field mapping paths exist in your data
- Use `analysis_type: "detailed"` for debugging

**Performance Issues**:
- Reduce result limits for complex geographic queries
- Use specific country filters instead of broad region filters
- Consider caching for frequently accessed geographic data

**Field Not Found Errors**:
- Verify field is supported for the entity type
- Check field mapping documentation above
- Use geographic statistics to see available fields

### Debugging Geographic Searches

```json
// Enable detailed geographic analysis
{
  "entity_type": "flows",
  "analysis_type": "detailed",
  "limit": 10
}

// Check available geographic fields
{
  "query": "*",
  "group_by": "country",
  "aggregate": true
}
```

This comprehensive geographic field mapping system provides flexible, efficient geographic search capabilities across all Firewalla data types while maintaining performance and accuracy.