# Enhanced Correlation Algorithms

This document provides technical documentation for the enhanced correlation algorithms introduced in Firewalla MCP Server v1.0.0.

## Overview

The enhanced correlation system provides intelligent matching between different entity types (flows, alarms, rules, devices) with advanced scoring and fuzzy matching capabilities. This goes beyond simple exact matching to provide more nuanced and flexible correlation analysis.

## Architecture

### Core Components

1. **Enhanced Correlation Engine** (`src/validation/enhanced-correlation.ts`)
   - Scoring algorithms for correlation confidence
   - Fuzzy matching implementations
   - Statistical analysis and reporting

2. **Field Mapping System** (`src/validation/field-mapper.ts`)
   - Cross-entity field compatibility
   - Enhanced correlation parameter handling
   - Backward compatibility layer

3. **Search Integration** (`src/tools/search.ts`)
   - Enhanced MCP tool handlers
   - Search engine integration
   - Result formatting and aggregation

## Correlation Scoring

### Scoring Algorithm

The correlation scoring system assigns confidence scores (0.0-1.0) to entity matches based on:

1. **Field Match Quality**
   - Exact matches: 1.0
   - Fuzzy matches: 0.1-0.8 (depending on similarity)
   - No match: 0.0

2. **Field Importance Weights**
   - Network identifiers (IP addresses): 1.0
   - Protocol details: 0.8-0.9
   - Geographic data: 0.5-0.7
   - Behavioral patterns: 0.5-0.6
   - Temporal data: 0.2-0.4

3. **Data Quality Assessment**
   - Completeness bonus: +0.1 for well-formatted data
   - Frequency bonus: Higher scores for commonly occurring values
   - Validation penalty: -0.3 for invalid/default values

### Score Calculation

```typescript
correlationScore = (Σ(fieldScore[i] * fieldWeight[i])) / Σ(fieldWeight[i])

// For AND logic: apply completeness factor
if (correlationType === 'AND') {
  completeness = matchingFields / totalFields
  finalScore = correlationScore * completeness
}
```

### Confidence Levels

- **High (≥0.8)**: Strong correlation, suitable for automated actions
- **Medium (0.5-0.8)**: Moderate correlation, requires human review
- **Low (<0.5)**: Weak correlation, informational only

## Fuzzy Matching

### IP Address Subnet Matching

Matches IP addresses based on network prefixes:

```typescript
// Subnet scoring based on matching octets
/8 network:  0.25 score (192.x.x.x matches 192.y.y.y)
/16 network: 0.50 score (192.168.x.x matches 192.168.y.y)  
/24 network: 0.75 score (192.168.1.x matches 192.168.1.y)
Exact match: 1.00 score
```

### String Similarity

Uses Levenshtein distance for string matching:

```typescript
similarity = 1 - (editDistance / maxLength)
fuzzyScore = similarity >= threshold ? similarity * 0.8 : 0
```

**Examples:**
- "chrome" vs "chromium": 0.6-0.7 similarity
- "192.168.1.1" vs "192.168.1.2": Handled by IP matching
- "United States" vs "United Kingdom": 0.4-0.5 similarity

### Numeric Tolerance Matching

Matches numeric values within a tolerance range:

```typescript
relativeDifference = |value1 - value2| / max(|value1|, |value2|)
fuzzyScore = relativeDifference <= tolerance ? 
  (1 - relativeDifference/tolerance) * 0.7 : 0
```

**Default Tolerance:** 10% (0.1)

### Geographic Proximity

Simplified geographic similarity for location-based fields:

```typescript
// Basic string similarity with lower confidence cap
geoScore = stringSimilarity(geo1, geo2, 0.7) * 0.6
```

## Configuration Options

### Correlation Weights

Default field importance weights can be customized:

```typescript
const customWeights: CorrelationWeights = {
  'source_ip': 1.0,        // Highest priority
  'destination_ip': 1.0,
  'protocol': 0.9,
  'country': 0.7,
  'application': 0.7,
  'user_agent': 0.6,
  'session_duration': 0.5,
  'timestamp': 0.4,        // Lowest priority
  'default': 0.5           // Fallback for unmapped fields
};
```

### Fuzzy Matching Configuration

```typescript
const fuzzyConfig: FuzzyMatchConfig = {
  enabled: true,
  stringThreshold: 0.8,     // 80% similarity required
  ipSubnetMatching: true,   // Enable IP subnet matching
  numericTolerance: 0.1,    // 10% tolerance for numbers
  geographicRadius: 50      // 50km radius (future feature)
};
```

### Correlation Parameters

```typescript
const correlationParams: ScoringCorrelationParams = {
  correlationFields: ['source_ip', 'country'],
  correlationType: 'AND',
  enableScoring: true,
  enableFuzzyMatching: true,
  minimumScore: 0.5,
  customWeights: customWeights,
  fuzzyConfig: fuzzyConfig,
  
  // Legacy parameters still supported
  temporalWindow: {
    windowSize: 30,
    windowUnit: 'minutes'
  },
  networkScope: {
    includeSubnets: true,
    includePorts: true
  }
};
```

## Performance Characteristics

### Algorithmic Complexity

- **Exact Matching:** O(n * m) where n = primary results, m = secondary results
- **Fuzzy Matching:** O(n * m * f) where f = fuzzy operations per field
- **String Similarity:** O(s²) where s = average string length
- **IP Matching:** O(1) for subnet calculations

### Optimization Techniques

1. **Early Termination**
   - Skip fuzzy matching if exact match found
   - Apply minimum score threshold early
   - Short-circuit OR operations

2. **Caching**
   - Memoize expensive string similarity calculations
   - Cache field value extractions
   - Reuse normalized values

3. **Batch Processing**
   - Process multiple correlations in parallel
   - Vectorize numeric operations where possible
   - Group similar operations

### Performance Benchmarks

Typical performance on modern hardware:

- **Small datasets** (< 100 entities): < 10ms
- **Medium datasets** (100-1000 entities): 10-100ms  
- **Large datasets** (1000-10000 entities): 100ms-1s
- **Very large datasets** (> 10000 entities): 1-10s

## Statistical Output

### Enhanced Correlation Statistics

```typescript
interface EnhancedCorrelationStats {
  totalSecondaryResults: number;
  correlatedResults: number;
  averageScore: number;
  
  scoreDistribution: {
    high: number;    // score >= 0.8
    medium: number;  // score >= 0.5
    low: number;     // score < 0.5
  };
  
  fieldStatistics: {
    [field: string]: {
      exactMatches: number;
      fuzzyMatches: number;
      partialMatches: number;
      averageScore: number;
    };
  };
  
  fuzzyMatchingEnabled: boolean;
  totalProcessingTime: number;
}
```

### Correlation Result Format

```typescript
interface ScoredCorrelationResult {
  entity: any;                    // Original entity data
  correlationScore: number;       // Overall confidence score
  fieldScores: {                  // Per-field scores
    [field: string]: number;
  };
  matchType: 'exact' | 'fuzzy' | 'partial';
  confidence: 'high' | 'medium' | 'low';
}
```

## Usage Examples

### Basic Enhanced Correlation

```typescript
import { performEnhancedCorrelation } from './enhanced-correlation.js';

const { correlatedResults, stats } = performEnhancedCorrelation(
  primaryFlows,
  secondaryAlarms,
  'flows',
  'alarms',
  ['source_ip', 'country'],
  'AND',
  DEFAULT_CORRELATION_WEIGHTS,
  DEFAULT_FUZZY_CONFIG,
  0.3  // minimum score
);
```

### Custom Weighted Correlation

```typescript
const customWeights = {
  'source_ip': 1.0,
  'application': 0.8,
  'country': 0.6
};

const strictFuzzyConfig = {
  enabled: true,
  stringThreshold: 0.9,  // More strict
  ipSubnetMatching: true,
  numericTolerance: 0.05, // Tighter tolerance
  geographicRadius: 25
};

const result = performEnhancedCorrelation(
  primaryData,
  secondaryData,
  'flows',
  'alarms',
  ['source_ip', 'application'],
  'OR',
  customWeights,
  strictFuzzyConfig,
  0.7  // High confidence threshold
);
```

### Integration with Search Tools

```typescript
// Through MCP handlers
const searchTools = createSearchTools(firewalla);

const result = await searchTools.search_enhanced_scored_cross_reference({
  primary_query: 'protocol:tcp AND bytes:>1000000',
  secondary_queries: ['severity:high'],
  correlation_params: {
    correlationFields: ['source_ip', 'destination_ip'],
    correlationType: 'AND',
    enableScoring: true,
    enableFuzzyMatching: true,
    minimumScore: 0.6
  },
  limit: 500
});
```

## Testing

### Unit Tests

Test coverage includes:

- Exact matching validation
- Fuzzy algorithm correctness
- Score calculation accuracy
- Performance benchmarks
- Edge case handling

### Integration Tests

- MCP handler functionality
- Search engine integration
- Result format validation
- Error handling

### Performance Tests

- Large dataset processing
- Memory usage monitoring
- Concurrent operation handling
- Timeout behavior

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**
   - Learn optimal weights from historical data
   - Adaptive scoring based on success patterns
   - Anomaly detection for correlation quality

2. **Advanced Geographic Matching**
   - True distance-based proximity
   - Geopolitical relationship awareness
   - Time zone correlation

3. **Semantic Similarity**
   - Natural language processing for text fields
   - Domain-specific knowledge graphs
   - Context-aware matching

4. **Real-time Correlation**
   - Streaming correlation for live data
   - Incremental processing
   - Event-driven updates

### Optimization Opportunities

1. **Parallel Processing**
   - Multi-threaded correlation processing
   - GPU acceleration for large datasets
   - Distributed correlation across clusters

2. **Algorithmic Improvements**
   - More efficient string similarity algorithms
   - Approximate matching for very large datasets
   - Incremental correlation updates

3. **Caching Enhancements**
   - Persistent correlation caches
   - Predictive pre-computation
   - Smart cache invalidation

## Troubleshooting

### Common Issues

1. **Low Correlation Scores**
   - Check field mapping compatibility
   - Verify data quality and completeness
   - Adjust fuzzy matching thresholds
   - Review field importance weights

2. **Performance Issues**
   - Reduce dataset size with pre-filtering
   - Disable fuzzy matching for large datasets
   - Increase minimum score threshold
   - Use fewer correlation fields

3. **Unexpected Results**
   - Validate entity types and field mappings
   - Check correlation logic (AND vs OR)
   - Review fuzzy matching configuration
   - Examine individual field scores

### Debug Configuration

```typescript
// Enable detailed logging
const debugConfig = {
  ...DEFAULT_FUZZY_CONFIG,
  logFieldScores: true,
  logMatchDetails: true,
  trackPerformance: true
};
```

### Performance Monitoring

```bash
# Enable performance debugging
DEBUG=correlation,performance npm run mcp:start

# Monitor memory usage
DEBUG=memory npm run test:correlation

# Track processing times
DEBUG=timing npm run correlation-benchmark
```