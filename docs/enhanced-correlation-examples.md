# Enhanced Correlation Search Examples

## Overview

The enhanced correlation search functionality provides sophisticated multi-entity analysis with fuzzy matching, scoring algorithms, and temporal windows. This document provides comprehensive examples for complex correlation scenarios.

## Basic Correlation Patterns

### 1. IP-Based Correlation

**Scenario**: Find flows from suspicious IPs that correlate with security alarms.

```json
{
  "primary_query": "bytes:>10000000 AND protocol:tcp",
  "secondary_queries": ["severity:high", "type:network_intrusion"],
  "correlation_params": {
    "correlationFields": ["source_ip"],
    "correlationType": "AND",
    "enableScoring": true,
    "minimumScore": 0.8
  },
  "limit": 100
}
```

**Use Case**: Identify large data transfers from IPs that triggered security alerts.

### 2. Geographic Correlation

**Scenario**: Correlate flows and alarms by geographic location.

```json
{
  "primary_query": "country:China OR country:Russia",
  "secondary_queries": ["severity:>=medium", "blocked:true"],
  "correlation_params": {
    "correlationFields": ["country", "asn"],
    "correlationType": "OR",
    "enableFuzzyMatching": true,
    "geographicRadius": 100
  },
  "limit": 200
}
```

**Use Case**: Analyze threat patterns from specific geographic regions.

### 3. Application-Level Correlation

**Scenario**: Correlate browser traffic with security incidents.

```json
{
  "primary_query": "application:Chrome OR user_agent:*Chrome*",
  "secondary_queries": ["severity:medium", "type:malware"],
  "correlation_params": {
    "correlationFields": ["user_agent", "device_ip"],
    "correlationType": "AND",
    "enableFuzzyMatching": true,
    "stringThreshold": 0.8
  },
  "limit": 150
}
```

**Use Case**: Detect compromised browsers or malicious browser extensions.

## Advanced Correlation Scenarios

### 4. Temporal Window Analysis

**Scenario**: Find related incidents within a specific time window.

```json
{
  "primary_query": "blocked:true AND bytes:>5000000",
  "secondary_queries": ["severity:high", "online:false"],
  "correlation_params": {
    "correlationFields": ["device_ip", "timestamp"],
    "correlationType": "AND",
    "temporalWindow": {
      "windowSize": 30,
      "windowUnit": "minutes"
    },
    "enableScoring": true
  },
  "limit": 100
}
```

**Use Case**: Identify device compromises followed by network disconnections.

### 5. Behavioral Pattern Correlation

**Scenario**: Correlate unusual activity patterns across multiple dimensions.

```json
{
  "primary_query": "session_duration:>300 AND frequency_score:>5",
  "secondary_queries": ["activity_level:high", "bytes_per_session:>10000"],
  "correlation_params": {
    "correlationFields": ["device_ip", "activity_level", "session_duration"],
    "correlationType": "AND",
    "customWeights": {
      "device_ip": 1.0,
      "activity_level": 0.8,
      "session_duration": 0.6
    },
    "enableScoring": true,
    "minimumScore": 0.7
  },
  "limit": 50
}
```

**Use Case**: Detect data exfiltration or unusual user behavior patterns.

### 6. Multi-Vector Threat Analysis

**Scenario**: Complex correlation across network, application, and geographic vectors.

```json
{
  "primary_query": "protocol:https AND ssl_subject:*suspicious*",
  "secondary_queries": [
    "severity:critical", 
    "country:*suspicious_country*",
    "application:*torrent*"
  ],
  "correlation_params": {
    "correlationFields": ["device_ip", "ssl_subject", "country", "application"],
    "correlationType": "OR",
    "enableFuzzyMatching": true,
    "fuzzyConfig": {
      "stringThreshold": 0.7,
      "ipSubnetMatching": true,
      "geographicRadius": 50
    },
    "customWeights": {
      "device_ip": 1.0,
      "ssl_subject": 0.9,
      "country": 0.7,
      "application": 0.8
    },
    "minimumScore": 0.6
  },
  "limit": 100
}
```

**Use Case**: Comprehensive threat hunting across multiple attack vectors.

## Fuzzy Matching Examples

### 7. IP Subnet Correlation

**Scenario**: Correlate activities across IP subnets.

```json
{
  "primary_query": "source_ip:192.168.*",
  "secondary_queries": ["destination_ip:10.0.*", "blocked:true"],
  "correlation_params": {
    "correlationFields": ["source_ip", "destination_ip"],
    "correlationType": "AND",
    "enableFuzzyMatching": true,
    "fuzzyConfig": {
      "ipSubnetMatching": true,
      "networkMasks": ["/24", "/16", "/8"]
    },
    "networkScope": {
      "includeSubnets": true,
      "includePorts": false
    }
  },
  "limit": 200
}
```

**Use Case**: Analyze lateral movement patterns within network segments.

### 8. String Similarity Matching

**Scenario**: Find similar domain names or applications.

```json
{
  "primary_query": "target_value:*facebook*",
  "secondary_queries": ["target_value:*social*", "action:block"],
  "correlation_params": {
    "correlationFields": ["target_value", "application"],
    "correlationType": "OR",
    "enableFuzzyMatching": true,
    "fuzzyConfig": {
      "stringThreshold": 0.8,
      "levenshteinDistance": 3
    }
  },
  "limit": 100
}
```

**Use Case**: Detect domain squatting or similar suspicious domains.

### 9. Numeric Tolerance Matching

**Scenario**: Correlate activities with similar bandwidth usage.

```json
{
  "primary_query": "bytes:>1000000",
  "secondary_queries": ["session_duration:>60", "frequency_score:>3"],
  "correlation_params": {
    "correlationFields": ["bytes", "session_duration", "device_ip"],
    "correlationType": "AND",
    "enableFuzzyMatching": true,
    "fuzzyConfig": {
      "numericTolerance": 0.1,
      "percentageTolerance": 15
    }
  },
  "limit": 150
}
```

**Use Case**: Find devices with similar usage patterns for anomaly detection.

## Network Scope Examples

### 10. Device Group Correlation

**Scenario**: Correlate activities within device groups.

```json
{
  "primary_query": "device_group:laptops",
  "secondary_queries": ["mac_vendor:Apple", "online:true"],
  "correlation_params": {
    "correlationFields": ["device_group", "mac_vendor"],
    "correlationType": "AND",
    "deviceScope": {
      "includeGroup": true,
      "includeVendor": true
    },
    "networkScope": {
      "includeSubnets": false,
      "includePorts": false
    }
  },
  "limit": 100
}
```

**Use Case**: Analyze security posture across device categories.

### 11. Port-Based Network Analysis

**Scenario**: Correlate suspicious port activities.

```json
{
  "primary_query": "port:22 OR port:3389",
  "secondary_queries": ["protocol:tcp", "blocked:false"],
  "correlation_params": {
    "correlationFields": ["port", "protocol", "source_ip"],
    "correlationType": "AND",
    "networkScope": {
      "includePorts": true,
      "includeSubnets": true
    },
    "temporalWindow": {
      "windowSize": 1,
      "windowUnit": "hours"
    }
  },
  "limit": 200
}
```

**Use Case**: Detect brute force attacks or unauthorized remote access attempts.

## Scoring and Weighting Examples

### 12. Custom Weighted Correlation

**Scenario**: Prioritize certain correlation fields over others.

```json
{
  "primary_query": "severity:high",
  "secondary_queries": ["bytes:>5000000", "country:*high_risk*"],
  "correlation_params": {
    "correlationFields": ["device_ip", "country", "severity", "bytes"],
    "correlationType": "AND",
    "enableScoring": true,
    "customWeights": {
      "device_ip": 1.0,
      "severity": 0.9,
      "country": 0.7,
      "bytes": 0.5
    },
    "minimumScore": 0.8
  },
  "limit": 100
}
```

**Result Interpretation**:
- High confidence matches (score >= 0.8) indicate strong correlations
- Device IP has highest weight (1.0) - exact matches are most important
- Country has medium weight (0.7) - geographic correlation is valuable but not critical

### 13. Multi-Confidence Level Analysis

**Scenario**: Get correlations at different confidence levels.

```json
{
  "primary_query": "application:torrent",
  "secondary_queries": ["action:block", "severity:medium"],
  "correlation_params": {
    "correlationFields": ["device_ip", "application", "user_agent"],
    "correlationType": "OR",
    "enableScoring": true,
    "confidenceLevels": {
      "high": 0.8,
      "medium": 0.5,
      "low": 0.3
    },
    "minimumScore": 0.3
  },
  "limit": 200
}
```

**Use Case**: Understand correlation strength distribution for threat assessment.

## Correlation Suggestions Examples

### 14. Intelligent Field Recommendations

**Request**:
```json
{
  "primary_query": "blocked:true AND bytes:>1000000",
  "secondary_queries": ["severity:high", "online:false"]
}
```

**Expected Response**:
```json
{
  "suggested_correlations": [
    {
      "fields": ["device_ip", "timestamp"],
      "confidence": 0.95,
      "reason": "High correlation potential for device-based incident analysis"
    },
    {
      "fields": ["source_ip", "country"],
      "confidence": 0.8,
      "reason": "Geographic correlation useful for threat attribution"
    },
    {
      "fields": ["bytes", "session_duration"],
      "confidence": 0.7,
      "reason": "Behavioral pattern correlation for anomaly detection"
    }
  ]
}
```

### 15. Dynamic Correlation Discovery

**Scenario**: Let the system suggest optimal correlation parameters.

```json
{
  "primary_query": "application:Chrome AND country:China",
  "secondary_queries": ["severity:medium", "type:malware"],
  "auto_optimize": true,
  "correlation_params": {
    "enableScoring": true,
    "enableFuzzyMatching": true,
    "auto_select_fields": true
  },
  "limit": 100
}
```

**Use Case**: Exploratory analysis where optimal correlation fields are unknown.

## Performance Optimization Examples

### 16. Efficient Large-Scale Correlation

**Scenario**: High-performance correlation for large datasets.

```json
{
  "primary_query": "ts:2024-01-01T00:00:00Z-2024-01-02T00:00:00Z",
  "secondary_queries": ["severity:>=medium"],
  "correlation_params": {
    "correlationFields": ["device_ip"],
    "correlationType": "AND",
    "enableScoring": false,
    "enableFuzzyMatching": false,
    "temporalWindow": {
      "windowSize": 1,
      "windowUnit": "hours"
    }
  },
  "limit": 1000
}
```

**Optimization Techniques**:
- Disable scoring for faster processing
- Use exact matching instead of fuzzy matching  
- Limit correlation fields to essential ones
- Use temporal windows to reduce data scope

### 17. Cached Correlation Patterns

**Scenario**: Reuse common correlation patterns with caching.

```json
{
  "correlation_template": "suspicious_ip_pattern",
  "primary_query": "source_ip:*suspicious_range*",
  "secondary_queries": ["severity:high"],
  "cache_key": "suspicious_ip_correlation_v1",
  "cache_ttl": 3600,
  "limit": 500
}
```

**Use Case**: Standardized threat hunting workflows with performance optimization.

## Best Practices

### Correlation Strategy

1. **Start Simple**: Begin with single-field correlations before adding complexity
2. **Use Appropriate Scoring**: Enable scoring for exploratory analysis, disable for known patterns
3. **Optimize Field Selection**: Choose correlation fields with high discriminative value
4. **Consider Temporal Windows**: Use time constraints for incident response scenarios
5. **Balance Precision vs Recall**: Adjust minimum scores based on use case requirements

### Performance Guidelines

- **Field Limits**: Use maximum 3-4 correlation fields for optimal performance
- **Result Limits**: Start with limits of 100-200, increase as needed
- **Fuzzy Matching**: Enable selectively for string/geographic correlations
- **Temporal Windows**: Use narrow windows (minutes/hours) for real-time analysis
- **Caching**: Implement caching for frequently used correlation patterns

### Error Handling

- **Validation**: Always validate correlation field compatibility
- **Fallback**: Provide fallback correlation strategies for edge cases
- **Monitoring**: Track correlation performance and success rates
- **Alerting**: Set up alerts for correlation failures or performance degradation

This comprehensive set of examples demonstrates the full capabilities of the enhanced correlation search system for sophisticated network security analysis and threat hunting workflows.