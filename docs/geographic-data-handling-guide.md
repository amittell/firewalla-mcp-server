# Geographic Data Handling and Normalization Guide

This guide provides comprehensive documentation on geographic data processing, unknown value handling, and normalization patterns used throughout the Firewalla MCP Server.

## Table of Contents

- [Overview](#overview)
- [Geographic Data Sources](#geographic-data-sources)
- [Unknown Value Handling](#unknown-value-handling)
- [Data Normalization Patterns](#data-normalization-patterns)
- [Geographic Enrichment Process](#geographic-enrichment-process)
- [Caching and Performance](#caching-and-performance)
- [Quality Assurance](#quality-assurance)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Firewalla MCP Server implements sophisticated geographic data handling to enrich network flows, security alarms, and device information with location-based intelligence. This system addresses the challenge of inconsistent, missing, or "unknown" geographic data while maintaining performance and reliability.

### Geographic Data Challenges

1. **Inconsistent Sources**: Different APIs return varying geographic data formats
2. **Missing Data**: Not all IP addresses have complete geographic information
3. **Unknown Values**: APIs often return "unknown", null, or placeholder values
4. **Performance Impact**: Geographic enrichment adds processing overhead
5. **Cache Management**: Balancing accuracy with performance through intelligent caching

### Data Consistency Goals

- **Standardized Format**: All geographic data follows consistent field naming and structure
- **Reliable Fallbacks**: Graceful handling of missing or invalid data
- **Performance Optimization**: Intelligent caching reduces API calls and processing time
- **Quality Metrics**: Tracking and reporting of data quality and completeness

## Geographic Data Sources

### Primary Data Sources

#### 1. Firewalla MSP API Geographic Data
```typescript
interface FirewallaGeoData {
  country?: string;          // "United States", "China", null, "unknown"
  region?: string;           // "California", "Beijing", null, "unknown"
  city?: string;             // "San Francisco", "Beijing", null, "unknown"
  asn?: string;              // "AS15169", "AS4134", null, "unknown"
  org?: string;              // "Google LLC", "China Telecom", null, "unknown"
  isp?: string;              // "Google", "China Telecom", null, "unknown"
  lat?: number;              // 37.7749, 39.9042, null
  lng?: number;              // -122.4194, 116.4074, null
}
```

#### 2. Enhanced Geographic Enrichment
```typescript
interface EnrichedGeoData {
  // Normalized core fields
  country: string;           // Always present, standardized
  country_code: string;      // ISO 3166-1 alpha-2 code
  continent: string;         // Derived from country
  region: string;            // State/province, normalized
  city: string;              // City name, normalized

  // Network infrastructure
  asn: string;               // Autonomous System Number
  asn_name: string;          // AS organization name
  hosting_provider?: string; // Cloud/hosting provider classification
  is_cloud_provider: boolean;
  is_vpn: boolean;
  is_proxy: boolean;

  // Risk and threat intelligence
  geographic_risk_score: number;  // 0.0-1.0 risk rating
  threat_intelligence: {
    high_risk_country: boolean;
    known_threat_source: boolean;
    malware_hosting: boolean;
  };

  // Data quality metrics
  data_quality: {
    completeness_score: number;    // 0.0-1.0 completeness rating
    confidence_level: 'high' | 'medium' | 'low';
    last_updated: string;          // ISO timestamp
    source: string;                // Data source identifier
  };
}
```

### Data Source Reliability

```typescript
const geoDataReliability = {
  firewalla_api: {
    availability: '99.5%',
    completeness: '85%',       // 85% of IPs have some geographic data
    accuracy: '92%',           // High accuracy for available data
    update_frequency: 'daily'
  },

  maxmind_fallback: {
    availability: '99.9%',
    completeness: '95%',       // Higher completeness
    accuracy: '90%',           // Slightly lower accuracy
    update_frequency: 'weekly'
  },

  threat_intelligence: {
    availability: '98%',
    completeness: '60%',       // Only for known threat sources
    accuracy: '95%',           // High accuracy for threat data
    update_frequency: 'hourly'
  }
}
```

## Unknown Value Handling

### Unknown Value Patterns

The system encounters various forms of "unknown" or missing data:

#### 1. Explicit Unknown Values
```typescript
const explicitUnknownPatterns = [
  'unknown',
  'n/a',
  'null',
  'undefined',
  '',
  '-',
  '?',
  'unavailable'
];
```

#### 2. Null and Undefined Values
```typescript
// Common null/undefined patterns
const nullPatterns = {
  javascript_null: null,
  javascript_undefined: undefined,
  json_null: 'null',
  empty_string: '',
  whitespace_only: '   '
};
```

#### 3. Invalid or Placeholder Data
```typescript
const invalidDataPatterns = {
  invalid_coordinates: { lat: 0, lng: 0 },        // Ocean coordinates
  placeholder_country: 'XX',                       // Invalid country code
  generic_asn: 'AS0',                             // Invalid ASN
  test_data: 'test',                              // Test environment data
  localhost_data: '127.0.0.1'                    // Local IP addresses
};
```

### Normalization Functions

#### 1. Country Normalization
```typescript
function normalizeCountry(rawCountry: any): string {
  // Handle null, undefined, empty values
  if (!rawCountry ||
      typeof rawCountry !== 'string' ||
      rawCountry.trim() === '') {
    return 'Unknown';
  }

  // Handle explicit unknown patterns
  const normalized = rawCountry.trim().toLowerCase();
  if (explicitUnknownPatterns.includes(normalized)) {
    return 'Unknown';
  }

  // Handle invalid country codes
  if (normalized.length === 2 && normalized === 'xx') {
    return 'Unknown';
  }

  // Standardize country names
  const countryMappings = {
    'us': 'United States',
    'usa': 'United States',
    'united states of america': 'United States',
    'cn': 'China',
    'prc': 'China',
    "people's republic of china": 'China',
    'ru': 'Russia',
    'russian federation': 'Russia'
  };

  return countryMappings[normalized] ||
         rawCountry.charAt(0).toUpperCase() + rawCountry.slice(1).toLowerCase();
}

// Example usage and results
const countryExamples = {
  normalizeCountry(null) =>                    'Unknown',
  normalizeCountry('unknown') =>               'Unknown',
  normalizeCountry('') =>                      'Unknown',
  normalizeCountry('us') =>                    'United States',
  normalizeCountry('CHINA') =>                 'China',
  normalizeCountry('russian federation') =>   'Russia'
};
```

#### 2. ASN Normalization
```typescript
function normalizeASN(rawASN: any): string {
  if (!rawASN ||
      typeof rawASN !== 'string' ||
      rawASN.trim() === '') {
    return 'Unknown';
  }

  const cleaned = rawASN.trim().toLowerCase();

  // Handle explicit unknown patterns
  if (explicitUnknownPatterns.includes(cleaned)) {
    return 'Unknown';
  }

  // Handle invalid ASN patterns
  if (cleaned === 'as0' || cleaned === '0') {
    return 'Unknown';
  }

  // Ensure proper ASN format
  if (/^as\d+$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  if (/^\d+$/.test(cleaned)) {
    return `AS${cleaned}`;
  }

  return 'Unknown';
}

// Example usage and results
const asnExamples = {
  normalizeASN(null) =>          'Unknown',
  normalizeASN('unknown') =>     'Unknown',
  normalizeASN('AS0') =>         'Unknown',
  normalizeASN('15169') =>       'AS15169',
  normalizeASN('as4134') =>      'AS4134'
};
```

#### 3. Coordinate Normalization
```typescript
function normalizeCoordinates(lat: any, lng: any): { lat: number | null, lng: number | null } {
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  // Check for valid numeric values
  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return { lat: null, lng: null };
  }

  // Check for placeholder coordinates (0,0 often indicates unknown)
  if (parsedLat === 0 && parsedLng === 0) {
    return { lat: null, lng: null };
  }

  // Validate coordinate ranges
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    return { lat: null, lng: null };
  }

  return {
    lat: Math.round(parsedLat * 10000) / 10000,    // 4 decimal precision
    lng: Math.round(parsedLng * 10000) / 10000
  };
}
```

## Data Normalization Patterns

### Batch Normalization Process

```typescript
interface NormalizationConfig {
  fields: Record<string, (value: any) => any>;
  fallbacks: Record<string, any>;
  validation: Record<string, (value: any) => boolean>;
  qualityMetrics: boolean;
}

// Helper function to normalize individual geographic data items
function normalizeGeoDataItem(
  item: any,
  config: NormalizationConfig
): NormalizedGeoData {
  const normalized: any = {
    _normalization_info: {
      fallbacks_used: 0,
      validation_passed: true
    }
  };

  // Apply field transformations
  for (const [field, transformer] of Object.entries(config.fields)) {
    const value = item[field];
    
    // Apply validation if provided
    if (config.validation[field] && !config.validation[field](value)) {
      normalized[field] = config.fallbacks[field];
      normalized._normalization_info.fallbacks_used++;
    } else {
      normalized[field] = transformer(value);
    }
  }

  return normalized as NormalizedGeoData;
}

// Helper function to create fallback geographic data
function createFallbackGeoData(item: any): NormalizedGeoData {
  return {
    country_code: item.country_code || 'XX',
    country_name: item.country_name || 'Unknown',
    region: item.region || 'Unknown',
    city: item.city || 'Unknown',
    latitude: item.latitude || 0,
    longitude: item.longitude || 0,
    timezone: item.timezone || 'UTC',
    confidence_score: 0,
    _normalization_info: {
      fallback: true,
      original_data: item
    }
  } as NormalizedGeoData;
}

// Simple logger interface for the example
const logger = {
  info: (message: string, data: any) => {
    console.log(`[INFO] ${message}`, JSON.stringify(data, null, 2));
  }
};

function batchNormalizeGeoData(
  rawData: any[],
  config: NormalizationConfig
): NormalizedGeoData[] {
  const startTime = Date.now();
  const results: NormalizedGeoData[] = [];
  const qualityStats = {
    total: rawData.length,
    normalized: 0,
    fallbacks_used: 0,
    validation_failures: 0
  };

  for (const item of rawData) {
    try {
      const normalized = normalizeGeoDataItem(item, config);
      results.push(normalized);
      qualityStats.normalized++;

      // Track fallback usage
      if (normalized._normalization_info?.fallbacks_used > 0) {
        qualityStats.fallbacks_used++;
      }

    } catch (error) {
      qualityStats.validation_failures++;

      // Create fallback item with minimal data
      results.push(createFallbackGeoData(item));
    }
  }

  const processingTime = Date.now() - startTime;

  // Log quality metrics
  if (config.qualityMetrics) {
    logger.info('Geographic data normalization completed', {
      stats: qualityStats,
      processing_time: processingTime,
      success_rate: qualityStats.normalized / qualityStats.total
    });
  }

  return results;
}
```

### Field-Specific Normalization

#### 1. Country and Region Normalization
```typescript
const geographicNormalization = {
  country: (value: any) => {
    const normalized = normalizeCountry(value);
    return {
      value: normalized,
      confidence: normalized === 'Unknown' ? 'low' : 'high',
      source: normalized === 'Unknown' ? 'fallback' : 'api'
    };
  },

  region: (value: any) => {
    if (!value || typeof value !== 'string') {
      return { value: 'Unknown', confidence: 'low', source: 'fallback' };
    }

    const cleaned = value.trim();
    if (explicitUnknownPatterns.includes(cleaned.toLowerCase())) {
      return { value: 'Unknown', confidence: 'low', source: 'fallback' };
    }

    return {
      value: cleaned,
      confidence: 'medium',
      source: 'api'
    };
  },

  city: (value: any) => {
    if (!value || typeof value !== 'string') {
      return { value: 'Unknown', confidence: 'low', source: 'fallback' };
    }

    const cleaned = value.trim();
    if (explicitUnknownPatterns.includes(cleaned.toLowerCase())) {
      return { value: 'Unknown', confidence: 'low', source: 'fallback' };
    }

    return {
      value: cleaned,
      confidence: 'medium',
      source: 'api'
    };
  }
};
```

#### 2. Network Infrastructure Normalization
```typescript
const networkNormalization = {
  asn: (value: any) => {
    const normalized = normalizeASN(value);
    return {
      value: normalized,
      confidence: normalized === 'Unknown' ? 'low' : 'high',
      numeric: normalized !== 'Unknown' ? parseInt(normalized.replace('AS', '')) : null
    };
  },

  hosting_provider: (value: any) => {
    if (!value || typeof value !== 'string') {
      return { value: null, confidence: 'low' };
    }

    const cleaned = value.toLowerCase().trim();

    // Map common hosting providers
    const providerMappings = {
      'google': 'Google',
      'amazon': 'Amazon',
      'cloudflare': 'Cloudflare',
      'microsoft': 'Microsoft',
      'alibaba': 'Alibaba Cloud',
      'tencent': 'Tencent Cloud'
    };

    for (const [key, provider] of Object.entries(providerMappings)) {
      if (cleaned.includes(key)) {
        return { value: provider, confidence: 'high' };
      }
    }

    return { value: value.trim(), confidence: 'medium' };
  }
};
```

### Quality Score Calculation

```typescript
function calculateDataQuality(normalizedData: NormalizedGeoData): number {
  let score = 0;
  let maxScore = 0;

  // Core geographic fields (40% of total score)
  const coreFields = ['country', 'region', 'city'];
  for (const field of coreFields) {
    maxScore += 40 / coreFields.length;
    if (normalizedData[field] && normalizedData[field] !== 'Unknown') {
      score += 40 / coreFields.length;
    }
  }

  // Network infrastructure (30% of total score)
  const networkFields = ['asn', 'hosting_provider'];
  for (const field of networkFields) {
    maxScore += 30 / networkFields.length;
    if (normalizedData[field] && normalizedData[field] !== 'Unknown') {
      score += 30 / networkFields.length;
    }
  }

  // Coordinates (20% of total score)
  maxScore += 20;
  if (normalizedData.coordinates &&
      normalizedData.coordinates.lat !== null &&
      normalizedData.coordinates.lng !== null) {
    score += 20;
  }

  // Threat intelligence (10% of total score)
  maxScore += 10;
  if (normalizedData.threat_intelligence &&
      Object.keys(normalizedData.threat_intelligence).length > 0) {
    score += 10;
  }

  return Math.round((score / maxScore) * 100) / 100; // Return 0.0-1.0
}
```

## Geographic Enrichment Process

### Enrichment Pipeline

```typescript
class GeographicEnrichmentPipeline {
  async enrichFlowData(flows: NetworkFlow[]): Promise<EnrichedNetworkFlow[]> {
    const enriched: EnrichedNetworkFlow[] = [];

    for (const flow of flows) {
      try {
        // 1. Extract IPs for enrichment
        const ipsToEnrich = this.extractIPsFromFlow(flow);

        // 2. Check cache for existing data
        const cachedData = await this.getCachedGeoData(ipsToEnrich);

        // 3. Enrich missing IPs
        const missingIPs = ipsToEnrich.filter(ip => !cachedData[ip]);
        const newGeoData = await this.enrichIPsWithGeoData(missingIPs);

        // 4. Combine cached and new data
        const allGeoData = { ...cachedData, ...newGeoData };

        // 5. Normalize all geographic data
        const normalizedGeoData = this.normalizeGeoDataBatch(allGeoData);

        // 6. Calculate risk scores
        const riskEnrichedData = this.calculateRiskScores(normalizedGeoData);

        // 7. Apply to flow
        const enrichedFlow = this.applyGeoDataToFlow(flow, riskEnrichedData);

        enriched.push(enrichedFlow);

        // 8. Update cache with new data
        await this.updateGeoDataCache(newGeoData);

      } catch (error) {
        logger.warn('Geographic enrichment failed for flow', {
          flow_id: flow.id,
          error: error.message
        });

        // Add flow with minimal geographic data
        enriched.push(this.createFallbackEnrichedFlow(flow));
      }
    }

    return enriched;
  }

  private normalizeGeoDataBatch(rawGeoData: Record<string, any>): Record<string, NormalizedGeoData> {
    const normalized: Record<string, NormalizedGeoData> = {};

    for (const [ip, data] of Object.entries(rawGeoData)) {
      normalized[ip] = {
        country: normalizeCountry(data.country),
        country_code: normalizeCountryCode(data.country),
        continent: deriveContinent(data.country),
        region: normalizeRegion(data.region),
        city: normalizeCity(data.city),
        asn: normalizeASN(data.asn),
        asn_name: normalizeASNName(data.org),
        coordinates: normalizeCoordinates(data.lat, data.lng),
        hosting_provider: classifyHostingProvider(data.org, data.isp),
        is_cloud_provider: isCloudProvider(data.org, data.asn),
        is_vpn: isVPNProvider(data.org, data.isp),
        is_proxy: isProxyProvider(data.org),
        geographic_risk_score: calculateGeographicRisk(data),
        threat_intelligence: enrichThreatIntelligence(ip, data),
        data_quality: {
          completeness_score: calculateDataQuality(data),
          confidence_level: calculateConfidenceLevel(data),
          last_updated: new Date().toISOString(),
          source: 'firewalla_api'
        }
      };
    }

    return normalized;
  }
}
```

### Risk Score Calculation

```typescript
function calculateGeographicRisk(geoData: any): number {
  let riskScore = 0.0;

  // Country-based risk scoring
  const highRiskCountries = ['China', 'Russia', 'Iran', 'North Korea'];
  const mediumRiskCountries = ['Brazil', 'India', 'Turkey', 'Pakistan'];

  if (highRiskCountries.includes(geoData.country)) {
    riskScore += 0.4;
  } else if (mediumRiskCountries.includes(geoData.country)) {
    riskScore += 0.2;
  }

  // ASN-based risk scoring
  const suspiciousASNs = ['AS4134', 'AS8075', 'AS9255']; // Known problematic ASNs
  if (suspiciousASNs.includes(geoData.asn)) {
    riskScore += 0.3;
  }

  // Hosting provider risk
  if (geoData.is_vpn || geoData.is_proxy) {
    riskScore += 0.2;
  }

  // Threat intelligence integration
  if (geoData.threat_intelligence?.known_threat_source) {
    riskScore += 0.5;
  }

  if (geoData.threat_intelligence?.malware_hosting) {
    riskScore += 0.4;
  }

  // Cap at 1.0
  return Math.min(riskScore, 1.0);
}
```

## Caching and Performance

### Cache Configuration

```typescript
interface GeoCacheConfig {
  ttl: number;              // Time to live in seconds
  maxEntries: number;       // Maximum cache entries
  lruEviction: boolean;     // Least Recently Used eviction
  compressionEnabled: boolean;
  persistToDisk: boolean;
}

const geoCacheConfig: GeoCacheConfig = {
  ttl: 3600,               // 1 hour cache
  maxEntries: 10000,       // 10k IP addresses
  lruEviction: true,
  compressionEnabled: true,
  persistToDisk: true
};
```

### Cache Performance Metrics

```typescript
class GeographicCache {
  private cache = new Map<string, NormalizedGeoData>();
  private hitCount = 0;
  private missCount = 0;
  private totalRequests = 0;

  async getGeoData(ip: string): Promise<NormalizedGeoData | null> {
    this.totalRequests++;

    const cached = await this.cache.get(ip);
    if (cached) {
      this.hitCount++;
      return cached;
    }

    this.missCount++;
    return null;
  }

  getPerformanceMetrics() {
    return {
      hit_rate: this.hitCount / this.totalRequests,
      miss_rate: this.missCount / this.totalRequests,
      total_requests: this.totalRequests,
      cache_size: this.cache.size,
      memory_usage: this.getMemoryUsage()
    };
  }
}
```

### Cache Optimization Strategies

```typescript
const cacheOptimization = {
  // Preload common IP ranges
  preloadCommonRanges: async () => {
    const commonRanges = [
      '8.8.8.0/24',        // Google DNS
      '1.1.1.0/24',        // Cloudflare DNS
      '192.168.0.0/16',    // Private networks
      '10.0.0.0/8'         // Private networks
    ];

    for (const range of commonRanges) {
      await preloadIPRange(range);
    }
  },

  // Batch cache warming
  warmCacheFromLogs: async (logEntries: LogEntry[]) => {
    const uniqueIPs = extractUniqueIPs(logEntries);
    const batchSize = 100;

    for (let i = 0; i < uniqueIPs.length; i += batchSize) {
      const batch = uniqueIPs.slice(i, i + batchSize);
      await enrichAndCacheIPBatch(batch);
    }
  },

  // Smart eviction based on access patterns
  intelligentEviction: () => {
    // Keep frequently accessed IPs
    // Evict old, rarely accessed entries
    // Prioritize high-quality data
  }
};
```

## Quality Assurance

### Data Quality Monitoring

```typescript
interface DataQualityMetrics {
  completeness: {
    country: number;         // % of records with valid country
    region: number;          // % of records with valid region
    city: number;            // % of records with valid city
    asn: number;             // % of records with valid ASN
    coordinates: number;     // % of records with valid coordinates
  };

  accuracy: {
    country_validation: number;     // % passing country validation
    coordinate_validation: number;  // % passing coordinate validation
    asn_validation: number;         // % passing ASN validation
  };

  consistency: {
    country_region_match: number;   // % where country/region are consistent
    coordinate_country_match: number; // % where coordinates match country
  };

  timeliness: {
    cache_hit_rate: number;         // % of requests served from cache
    average_enrichment_time: number; // Average ms for enrichment
    stale_data_percentage: number;   // % of data older than threshold
  };
}

function generateQualityReport(enrichedData: NormalizedGeoData[]): DataQualityMetrics {
  const total = enrichedData.length;

  return {
    completeness: {
      country: calculateFieldCompleteness(enrichedData, 'country'),
      region: calculateFieldCompleteness(enrichedData, 'region'),
      city: calculateFieldCompleteness(enrichedData, 'city'),
      asn: calculateFieldCompleteness(enrichedData, 'asn'),
      coordinates: calculateCoordinateCompleteness(enrichedData)
    },

    accuracy: {
      country_validation: validateCountryData(enrichedData),
      coordinate_validation: validateCoordinateData(enrichedData),
      asn_validation: validateASNData(enrichedData)
    },

    consistency: {
      country_region_match: validateCountryRegionConsistency(enrichedData),
      coordinate_country_match: validateCoordinateCountryConsistency(enrichedData)
    },

    timeliness: {
      cache_hit_rate: getCurrentCacheHitRate(),
      average_enrichment_time: getAverageEnrichmentTime(),
      stale_data_percentage: calculateStaleDataPercentage(enrichedData)
    }
  };
}
```

### Quality Improvement Strategies

```typescript
const qualityImprovementStrategies = {
  // Handle common data issues
  dataCleaningRules: {
    // Fix common country name variations
    countryAliases: {
      'US': 'United States',
      'UK': 'United Kingdom',
      'UAE': 'United Arab Emirates'
    },

    // Standardize region names
    regionStandardization: {
      'CA': 'California',
      'NY': 'New York',
      'TX': 'Texas'
    },

    // Validate and clean ASN data
    asnValidation: (asn: string) => {
      return /^AS\d+$/.test(asn) ? asn : 'Unknown';
    }
  },

  // Fallback data sources
  fallbackSources: [
    'maxmind_database',
    'ip2location_api',
    'ipinfo_api',
    'local_geo_database'
  ],

  // Data validation rules
  validationRules: {
    coordinates: (lat: number, lng: number) => {
      return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    },

    countryRegionConsistency: (country: string, region: string) => {
      const validRegions = getValidRegionsForCountry(country);
      return validRegions.includes(region);
    }
  }
};
```

## Error Handling

### Common Geographic Data Errors

```typescript
enum GeoDataErrorType {
  API_UNAVAILABLE = 'api_unavailable',
  INVALID_IP = 'invalid_ip',
  NO_GEO_DATA = 'no_geo_data',
  NORMALIZATION_FAILED = 'normalization_failed',
  CACHE_ERROR = 'cache_error',
  VALIDATION_FAILED = 'validation_failed'
}

interface GeoDataError {
  type: GeoDataErrorType;
  message: string;
  ip?: string;
  details?: any;
  fallback_applied: boolean;
}
```

### Error Recovery Patterns

```typescript
class GeoDataErrorHandler {
  async handleEnrichmentError(
    error: GeoDataError,
    ip: string,
    context: any
  ): Promise<NormalizedGeoData> {

    switch (error.type) {
      case GeoDataErrorType.API_UNAVAILABLE:
        // Try fallback API or use cached data
        return await this.tryFallbackSources(ip) ||
               this.createMinimalGeoData(ip);

      case GeoDataErrorType.INVALID_IP:
        // Handle private/local IPs
        return this.createPrivateIPGeoData(ip);

      case GeoDataErrorType.NO_GEO_DATA:
        // Create unknown geo data with metadata
        return this.createUnknownGeoData(ip, 'no_data_available');

      case GeoDataErrorType.NORMALIZATION_FAILED:
        // Log error and use raw data with basic normalization
        logger.warn('Geographic normalization failed', {
          ip, error: error.message
        });
        return this.applyBasicNormalization(ip, context.raw_data);

      default:
        return this.createFallbackGeoData(ip);
    }
  }

  private createMinimalGeoData(ip: string): NormalizedGeoData {
    return {
      country: 'Unknown',
      country_code: 'XX',
      continent: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      asn: 'Unknown',
      asn_name: 'Unknown',
      coordinates: { lat: null, lng: null },
      hosting_provider: null,
      is_cloud_provider: false,
      is_vpn: false,
      is_proxy: false,
      geographic_risk_score: 0.0,
      threat_intelligence: {
        high_risk_country: false,
        known_threat_source: false,
        malware_hosting: false
      },
      data_quality: {
        completeness_score: 0.0,
        confidence_level: 'low',
        last_updated: new Date().toISOString(),
        source: 'fallback'
      }
    };
  }
}
```

## Best Practices

### Implementation Best Practices

1. **Graceful Degradation**: Always provide fallback values for missing data
2. **Performance Optimization**: Use intelligent caching to reduce API calls
3. **Data Validation**: Validate all geographic data before normalization
4. **Error Logging**: Log data quality issues for monitoring and improvement
5. **Regular Updates**: Refresh cached data periodically to maintain accuracy

### Query Optimization

```typescript
// Geographic query optimization patterns
const geographicQueryOptimization = {
  // Use specific countries instead of wildcards
  preferred: 'country:China OR country:Russia',
  avoid: 'country:*',

  // Combine geographic with other filters
  efficient: 'country:China AND severity:high AND timestamp:>NOW-1h',
  inefficient: 'country:China',

  // Use geographic filters appropriately
  good: {
    countries: ['China', 'Russia'],      // Specific list
    min_risk_score: 0.7                  // Risk-based filtering
  },
  problematic: {
    countries: ['*'],                    // Wildcard usage
    min_risk_score: 0.0                  // No filtering
  }
};
```

### Data Quality Guidelines

```typescript
const dataQualityGuidelines = {
  // Minimum acceptable data quality thresholds
  quality_thresholds: {
    completeness: 0.8,           // 80% data completeness
    accuracy: 0.9,               // 90% data accuracy
    cache_hit_rate: 0.7,         // 70% cache hit rate
    enrichment_time: 500         // Max 500ms enrichment time
  },

  // Monitoring and alerting
  monitoring: {
    quality_checks: 'every_hour',
    performance_checks: 'every_5_minutes',
    cache_health: 'every_minute',
    alert_thresholds: {
      quality_drop: 0.1,         // Alert if quality drops 10%
      performance_degradation: 2.0, // Alert if enrichment time doubles
      cache_miss_spike: 0.2      // Alert if cache miss rate spikes 20%
    }
  }
};
```

## Troubleshooting

### Common Issues and Solutions

#### 1. High Cache Miss Rate
```typescript
// Symptoms: Slow geographic enrichment, high API usage
// Diagnosis: Check cache hit rate metrics
const cacheHealthCheck = {
  hit_rate: 0.3,                    // Low hit rate (target: >0.7)
  miss_rate: 0.7,                   // High miss rate
  eviction_rate: 0.5                // High eviction rate
};

// Solutions:
// 1. Increase cache size
// 2. Increase TTL for stable data
// 3. Implement cache warming strategies
// 4. Review query patterns for cacheable data
```

#### 2. Poor Data Quality
```typescript
// Symptoms: Many "Unknown" values in geographic data
// Diagnosis: Check data quality metrics
const qualityIssues = {
  completeness: {
    country: 0.6,                   // Low country completeness (target: >0.8)
    coordinates: 0.3                // Very low coordinate data
  },
  unknown_percentage: 0.4           // 40% unknown values
};

// Solutions:
// 1. Review IP address sources (private vs public)
// 2. Check API data source reliability
// 3. Implement additional fallback sources
// 4. Improve normalization algorithms
```

#### 3. Performance Issues
```typescript
// Symptoms: Slow response times, timeouts
// Diagnosis: Check enrichment performance
const performanceIssues = {
  average_enrichment_time: 2000,    // 2 seconds (target: <500ms)
  timeout_rate: 0.1,                // 10% timeout rate
  concurrent_requests: 50           // High concurrency
};

// Solutions:
// 1. Implement request batching
// 2. Add circuit breaker for failing APIs
// 3. Optimize normalization algorithms
// 4. Scale geographic enrichment workers
```

### Debugging Geographic Data Issues

```bash
# Enable geographic data debugging
DEBUG=firewalla:geo,firewalla:cache npm run mcp:start

# Monitor data quality
DEBUG=firewalla:quality npm run mcp:start

# Track cache performance
DEBUG=firewalla:cache:performance npm run mcp:start

# Full geographic debugging
DEBUG=firewalla:geo:* npm run mcp:start
```

### Performance Monitoring Commands

```bash
# Monitor cache hit rates
npm run geo:cache:stats

# Check data quality metrics
npm run geo:quality:report

# Analyze unknown data patterns
npm run geo:analyze:unknowns

# Performance benchmark
npm run geo:benchmark
```

This comprehensive guide provides the foundation for understanding and implementing robust geographic data handling in the Firewalla MCP Server, ensuring consistent, high-quality location intelligence while maintaining optimal performance.