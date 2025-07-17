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
/**
 * Canonical representation returned by all normalization helpers.
 * Keep this in sync with the EnrichedGeoData contract below.
 */
interface NormalizedGeoData {
  country: string;
  country_code: string;
  continent: string;
  region: string;
  city: string;
  asn: string | number | 'Unknown';
  asn_name: string;
  coordinates: { lat: number | null; lng: number | null };
  hosting_provider: string | null;
  is_cloud_provider: boolean;
  is_vpn: boolean;
  is_proxy: boolean;
  geographic_risk_score: number;        // 0.0-1.0
  threat_intelligence: Record<string, any>;
  data_quality: {
    completeness_score: number;         // 0-1
    confidence_level: 'high' | 'medium' | 'low';
    last_updated: string;               // ISO-8601
    source: string;
  };
  /**
   * Internal bookkeeping injected by the normalizer.
   * Not transmitted over the wire.
   */
  _normalization_info?: {
    fallbacks_used?: number;
    validation_passed?: boolean;
    fallback?: boolean;
    original_data?: any;
    [key: string]: any;
  };
}

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
  // Minimal but structurally correct fallback
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
    geographic_risk_score: 0,
    threat_intelligence: {},
    data_quality: {
      completeness_score: 0,
      confidence_level: 'low',
      last_updated: new Date().toISOString(),
      source: 'fallback'
    },
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
  },
  warn: (message: string, data: any) => {
    console.warn(`[WARN] ${message}`, JSON.stringify(data, null, 2));
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

  return Number((score / maxScore).toFixed(2)); // Return 0.0-1.0
}
```

## Geographic Enrichment Process

### Enrichment Pipeline

```typescript
// Interface definitions for type safety
interface NetworkFlow {
  id: string;
  source_ip: string;
  destination_ip: string;
  protocol: string;
  bytes: number;
  timestamp: string;
  [key: string]: any; // Allow additional properties
}

interface EnrichedNetworkFlow extends NetworkFlow {
  source_geo: NormalizedGeoData | null;
  destination_geo: NormalizedGeoData | null;
  enrichment_metadata: {
    enriched_at: string;
    version: string;
    fallback?: boolean;
  };
}

class GeographicEnrichmentPipeline {
  private cache = new GeographicCache();

  private getCachedGeoData(ips: string[]): Record<string, NormalizedGeoData> {
    const cachedData: Record<string, NormalizedGeoData> = {};
    
    for (const ip of ips) {
      const geoData = this.cache.getGeoData(ip);
      if (geoData) {
        cachedData[ip] = geoData;
      }
    }
    
    return cachedData;
  }

  private updateGeoDataCache(geoData: Record<string, NormalizedGeoData>): void {
    // Update cache with already-normalized geo data
    for (const [ip, data] of Object.entries(geoData)) {
      if (data && typeof data === 'object') {
        // Data is already normalized, just cache it directly
        this.cache.setGeoData(ip, data);
      }
    }
  }

  async enrichFlowData(flows: NetworkFlow[]): Promise<EnrichedNetworkFlow[]> {
    const enriched: EnrichedNetworkFlow[] = [];

    for (const flow of flows) {
      try {
        // 1. Extract IPs for enrichment
        const ipsToEnrich = this.extractIPsFromFlow(flow);

        // 2. Check cache for existing data
        const cachedData = this.getCachedGeoData(ipsToEnrich);

        // 3. Enrich missing IPs
        const missingIPs = ipsToEnrich.filter(ip => !cachedData[ip]);
        const newGeoData = await this.enrichIPsWithGeoData(missingIPs);

        // 4. Normalize only new data (cached data is already normalized)
        const normalizedNewData = this.normalizeGeoDataBatch(newGeoData);

        // 5. Combine cached and newly normalized data
        const allGeoData = { ...cachedData, ...normalizedNewData };

        // 6. Apply to flow (risk scores already calculated in normalization)
        const enrichedFlow = this.applyGeoDataToFlow(flow, allGeoData);

        enriched.push(enrichedFlow);

        // 7. Update cache with normalized new data
        this.updateGeoDataCache(normalizedNewData);

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

  // Helper functions for geographic data normalization
  private normalizeCountry(country: any): string {
    return typeof country === 'string' ? country : 'Unknown';
  }

  private normalizeCountryCode(country: any): string {
    if (typeof country !== 'string') return 'XX';
    
    const normalized = country.trim().toLowerCase();
    
    // Common country name to ISO-3166-1 alpha-2 code mappings
    // Note: In production, consider using a library like 'i18n-iso-countries' for comprehensive support
    const countryToCode: Record<string, string> = {
      'united states': 'US',
      'united states of america': 'US',
      'usa': 'US',
      'united kingdom': 'GB',
      'uk': 'GB',
      'great britain': 'GB',
      'china': 'CN',
      'people\'s republic of china': 'CN',
      'prc': 'CN',
      'russia': 'RU',
      'russian federation': 'RU',
      'germany': 'DE',
      'france': 'FR',
      'japan': 'JP',
      'canada': 'CA',
      'australia': 'AU',
      'brazil': 'BR',
      'india': 'IN',
      'south korea': 'KR',
      'mexico': 'MX',
      'spain': 'ES',
      'italy': 'IT',
      'netherlands': 'NL',
      'singapore': 'SG',
      'switzerland': 'CH',
      'sweden': 'SE',
      'norway': 'NO',
      'denmark': 'DK',
      'finland': 'FI',
      'poland': 'PL',
      'ukraine': 'UA',
      'belgium': 'BE',
      'austria': 'AT',
      'ireland': 'IE',
      'new zealand': 'NZ',
      'israel': 'IL',
      'united arab emirates': 'AE',
      'uae': 'AE',
      'saudi arabia': 'SA',
      'turkey': 'TR',
      'south africa': 'ZA',
      'argentina': 'AR',
      'chile': 'CL',
      'colombia': 'CO',
      'egypt': 'EG',
      'greece': 'GR',
      'portugal': 'PT',
      'czech republic': 'CZ',
      'romania': 'RO',
      'hungary': 'HU',
      'vietnam': 'VN',
      'thailand': 'TH',
      'malaysia': 'MY',
      'indonesia': 'ID',
      'philippines': 'PH',
      'pakistan': 'PK',
      'bangladesh': 'BD',
      'nigeria': 'NG',
      'kenya': 'KE',
      'ethiopia': 'ET',
      'morocco': 'MA',
      'peru': 'PE',
      'venezuela': 'VE',
      'ecuador': 'EC',
      'taiwan': 'TW',
      'hong kong': 'HK',
      'luxembourg': 'LU',
      'bulgaria': 'BG',
      'croatia': 'HR',
      'serbia': 'RS',
      'slovakia': 'SK',
      'slovenia': 'SI',
      'lithuania': 'LT',
      'latvia': 'LV',
      'estonia': 'EE',
      'iceland': 'IS',
      'malta': 'MT',
      'cyprus': 'CY'
    };
    
    // If we have a mapping, use it
    if (countryToCode[normalized]) {
      return countryToCode[normalized];
    }
    
    // Check if it's already a 2-letter code
    if (normalized.length === 2 && /^[a-z]{2}$/.test(normalized)) {
      return normalized.toUpperCase();
    }
    
    // Default to unknown
    return 'XX';
  }

  private deriveContinent(country: any): string {
    // Simple continent mapping - in production use a proper geo library
    const continentMap: Record<string, string> = {
      'US': 'North America', 'CA': 'North America', 'CN': 'Asia', 'JP': 'Asia', 
      'DE': 'Europe', 'FR': 'Europe', 'GB': 'Europe', 'AU': 'Oceania'
    };
    const code = this.normalizeCountryCode(country);
    return continentMap[code] || 'Unknown';
  }

  private normalizeRegion(region: any): string {
    return typeof region === 'string' ? region : 'Unknown';
  }

  private normalizeCity(city: any): string {
    return typeof city === 'string' ? city : 'Unknown';
  }

  private parseASNNumber(asn: any): string | number | 'Unknown' {
    if (typeof asn === 'number' && asn > 0) {
      return asn;
    }
    if (typeof asn === 'string' && asn.trim() !== '') {
      // Try to extract number from strings like "AS15169" 
      const match = asn.match(/AS?(\d+)/i);
      if (match) {
        const num = parseInt(match[1]);
        return num > 0 ? num : 'Unknown';
      }
      return asn; // Return string as-is if not AS format
    }
    return 'Unknown';
  }

  private normalizeASNName(org: any): string {
    return typeof org === 'string' ? org : 'Unknown';
  }

  private normalizeCoordinates(lat: any, lng: any): { lat: number | null; lng: number | null } {
    // Use the standalone normalizeCoordinates helper function defined earlier
    return normalizeCoordinates(lat, lng);
  }

  private classifyHostingProvider(org: any, isp: any): string | null {
    if (!org && !isp) return null;

    const providerMappings: Record<string, string> = {
      amazon: 'Amazon',
      aws: 'Amazon',
      google: 'Google',
      microsoft: 'Microsoft',
      azure: 'Microsoft',
      cloudflare: 'Cloudflare',
      alibaba: 'Alibaba Cloud',
      tencent: 'Tencent Cloud',
      digitalocean: 'DigitalOcean',
      ovh: 'OVH',
      hetzner: 'Hetzner'
    };

    const combined = `${org ?? ''} ${isp ?? ''}`.toLowerCase();
    for (const [keyword, provider] of Object.entries(providerMappings)) {
      if (combined.includes(keyword)) return provider;
    }

    // Check for generic hosting keywords
    const hostingKeywords = ['hosting', 'cloud', 'datacenter', 'server', 'vps'];
    if (hostingKeywords.some(keyword => combined.includes(keyword))) {
      return 'Generic Hosting Provider';
    }

    return null;
  }

  private isCloudProvider(org: any, isp: any): boolean {
    const cloudProviders = ['amazon', 'google', 'microsoft', 'azure', 'aws'];
    const combined = `${org ?? ''} ${isp ?? ''}`.toLowerCase();
    return cloudProviders.some(provider => combined.includes(provider));
  }

  private isVPNProvider(org: any, isp: any): boolean {
    const vpnKeywords = ['vpn', 'proxy', 'tunnel'];
    const orgStr = String(org || '').toLowerCase();
    const ispStr = String(isp || '').toLowerCase();
    return vpnKeywords.some(keyword => 
      orgStr.includes(keyword) || ispStr.includes(keyword)
    );
  }

  private isProxyProvider(org: any): boolean {
    const proxyKeywords = ['proxy', 'anonymizer'];
    const orgStr = String(org || '').toLowerCase();
    return proxyKeywords.some(keyword => orgStr.includes(keyword));
  }

  private calculateGeographicRisk(data: any): number {
    // Simple risk scoring - in production use proper threat intelligence
    let risk = 0;
    
    // Check if we have normalized data fields or raw data fields
    if ('is_vpn' in data && 'is_proxy' in data && 'is_cloud_provider' in data) {
      // Working with NormalizedGeoData
      if (data.is_vpn) risk += 0.30;
      if (data.is_proxy) risk += 0.20;
      if (data.is_cloud_provider) risk += 0.10;
    } else {
      // Working with raw data
      if (this.isVPNProvider(data.org, data.isp)) risk += 0.30;
      if (this.isProxyProvider(data.org)) risk += 0.20;
      if (this.isCloudProvider(data.org, data.isp)) risk += 0.10;
    }
    
    return Math.min(risk, 1.0); // Normalize to 0-1 scale
  }

  private enrichThreatIntelligence(ip: string, data: any): any {
    // Placeholder for threat intelligence enrichment
    return {
      reputation_score: 50, // neutral
      threat_categories: [],
      last_seen_malicious: null
    };
  }

  private calculateDataQuality(data: any): number {
    let quality = 0;
    if (data.country) quality += 25;
    if (data.city) quality += 25;
    if (data.org) quality += 25;
    if (data.asn) quality += 25;
    return quality / 100; // Normalize to 0-1 scale
  }

  private calculateConfidenceLevel(data: any): 'high' | 'medium' | 'low' {
    // Simple confidence calculation based on data completeness
    const score = this.calculateDataQuality(data);
    if (score >= 0.75) return 'high';
    if (score >= 0.50) return 'medium';
    return 'low';
  }

  private normalizeGeoDataBatch(rawGeoData: Record<string, any>): Record<string, NormalizedGeoData> {
    const normalized: Record<string, NormalizedGeoData> = {};

    for (const [ip, data] of Object.entries(rawGeoData)) {
      normalized[ip] = {
        country: this.normalizeCountry(data.country),
        country_code: this.normalizeCountryCode(data.country),
        continent: this.deriveContinent(data.country),
        region: this.normalizeRegion(data.region),
        city: this.normalizeCity(data.city),
        asn: this.parseASNNumber(data.asn),
        asn_name: this.normalizeASNName(data.org),
        coordinates: this.normalizeCoordinates(data.lat, data.lng),
        hosting_provider: this.classifyHostingProvider(data.org, data.isp),
        is_cloud_provider: this.isCloudProvider(data.org, data.isp),
        is_vpn: this.isVPNProvider(data.org, data.isp),
        is_proxy: this.isProxyProvider(data.org),
        geographic_risk_score: this.calculateGeographicRisk(data),
        threat_intelligence: this.enrichThreatIntelligence(ip, data),
        data_quality: {
          completeness_score: this.calculateDataQuality(data),
          confidence_level: this.calculateConfidenceLevel(data),
          last_updated: new Date().toISOString(),
          source: 'firewalla_api'
        }
      };
    }

    return normalized;
  }

  // Missing helper methods for enrichFlowData
  private extractIPsFromFlow(flow: NetworkFlow): string[] {
    const ips: string[] = [];
    if (flow.source_ip) ips.push(flow.source_ip);
    if (flow.destination_ip) ips.push(flow.destination_ip);
    return [...new Set(ips)]; // Remove duplicates
  }

  private async enrichIPsWithGeoData(ips: string[]): Promise<Record<string, any>> {
    // In production, this would call your geo IP API service
    // Example implementation with mock data for demonstration
    const result: Record<string, any> = {};
    
    for (const ip of ips) {
      // Simulate API response with realistic data structure
      result[ip] = {
        ip: ip,
        country: 'United States',
        country_code: 'US',
        region: 'California',
        city: 'San Francisco',
        latitude: 37.7749,
        longitude: -122.4194,
        asn: 'AS15169',
        org: 'Google LLC',
        isp: 'Google',
        timezone: 'America/Los_Angeles',
        is_vpn: false,
        is_proxy: false,
        is_datacenter: true
      };
    }
    
    return result;
  }

  // NOTE: This method is now redundant as risk scores are calculated during normalization
  // Kept for backward compatibility or if separate risk recalculation is needed
  private calculateRiskScores(geoData: Record<string, NormalizedGeoData>): Record<string, NormalizedGeoData> {
    // Apply risk scoring to each geographic entry
    const riskEnriched: Record<string, NormalizedGeoData> = {};
    
    for (const [ip, data] of Object.entries(geoData)) {
      riskEnriched[ip] = {
        ...data,
        geographic_risk_score: this.calculateGeographicRisk(data)
      };
    }
    
    return riskEnriched;
  }

  private applyGeoDataToFlow(flow: NetworkFlow, geoData: Record<string, NormalizedGeoData>): EnrichedNetworkFlow {
    return {
      ...flow,
      source_geo: geoData[flow.source_ip] || null,
      destination_geo: geoData[flow.destination_ip] || null,
      enrichment_metadata: {
        enriched_at: new Date().toISOString(),
        version: '1.0'
      }
    };
  }


  private createFallbackEnrichedFlow(flow: NetworkFlow): EnrichedNetworkFlow {
    return {
      ...flow,
      source_geo: null,
      destination_geo: null,
      enrichment_metadata: {
        enriched_at: new Date().toISOString(),
        version: '1.0',
        fallback: true
      }
    };
  }
}
```

### Risk Score Calculation

```typescript
// Note: calculateGeographicRisk is implemented as a private method in the GeographicEnrichmentPipeline class above
```

## Caching and Performance

### Cache Configuration

```typescript
interface GeoCacheConfig {
  ttl: number;              // Time to live in seconds
  maxEntries: number;       // Maximum cache entries
  compressionEnabled: boolean;
  persistToDisk: boolean;
}

// Type definition for log entries used in cache warming
interface LogEntry {
  timestamp: string;
  source_ip?: string;
  destination_ip?: string;
  [key: string]: any;  // Allow additional fields
}

const geoCacheConfig: GeoCacheConfig = {
  ttl: 3600,               // 1 hour cache
  maxEntries: 10000,       // 10k IP addresses
  compressionEnabled: true,
  persistToDisk: true
};
```

### Cache Performance Metrics

```typescript
interface CachedGeoData extends NormalizedGeoData {
  _cachedAt: number;
}

class GeographicCache {
  private cache = new Map<string, CachedGeoData>();
  private hitCount = 0;
  private missCount = 0;
  private totalRequests = 0;

  getGeoData(ip: string): NormalizedGeoData | null {
    this.totalRequests++;

    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached._cachedAt) < geoCacheConfig.ttl * 1000) {
      this.hitCount++;
      // Return without the internal _cachedAt property
      const { _cachedAt, ...geoData } = cached;
      return geoData;
    }

    // Remove expired entry if exists
    if (cached) {
      this.cache.delete(ip);
    }

    // Clean up other expired entries to prevent stale data accumulation
    this.removeExpiredEntries();

    this.missCount++;
    return null;
  }

  setGeoData(ip: string, data: NormalizedGeoData): void {
    // Add timestamp for TTL checking
    const cachedData: CachedGeoData = {
      ...data,
      _cachedAt: Date.now()
    };

    this.cache.set(ip, cachedData);
    
    // Prune cache if needed
    this.pruneIfNeeded();
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    const ttlMs = geoCacheConfig.ttl * 1000;
    
    for (const [ip, data] of this.cache.entries()) {
      if (now - data._cachedAt > ttlMs) {
        this.cache.delete(ip);
      }
    }
  }

  private pruneIfNeeded(): void {
    if (this.cache.size <= geoCacheConfig.maxEntries) return;

    // Remove expired entries first
    this.removeExpiredEntries();

    // If still over limit, use FIFO eviction (oldest entries first)
    // Map maintains insertion order, so first entries are oldest
    // 
    // Note: This cache uses FIFO (First In, First Out) eviction strategy.
    // FIFO is simpler than LRU and performs well for geographic data where
    // access patterns are often temporal (recent IPs are more likely to be accessed again).
    // 
    // For LRU (Least Recently Used) behavior, consider using a dedicated 
    // LRU cache library like 'lru-cache' npm package.
    if (this.cache.size > geoCacheConfig.maxEntries) {
      const entriesToRemove = this.cache.size - geoCacheConfig.maxEntries;
      const keysIterator = this.cache.keys();
      
      for (let i = 0; i < entriesToRemove; i++) {
        const oldestKey = keysIterator.next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
    }
  }

  getPerformanceMetrics() {
    return {
      hit_rate: this.totalRequests ? this.hitCount / this.totalRequests : 0,
      miss_rate: this.totalRequests ? this.missCount / this.totalRequests : 0,
      total_requests: this.totalRequests,
      cache_size: this.cache.size,
      memory_usage: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : 0
    };
  }
}
```

### Cache Optimization Strategies

```typescript
// Helper function stubs for cache optimization
async function preloadIPRange(cidr: string): Promise<void> {
  // Implementation would iterate through IP range and pre-cache
}

function extractUniqueIPs(logs: any[]): string[] {
  // Implementation would extract and deduplicate IPs from log entries
  return [];
}

async function enrichAndCacheIPBatch(ips: string[]): Promise<void> {
  // Implementation would enrich multiple IPs in parallel and cache results
}

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

// Helper function stubs for generateQualityReport
function calculateFieldCompleteness(data: NormalizedGeoData[], field: keyof NormalizedGeoData): number {
  const validCount = data.filter(item => item[field] && item[field] !== 'Unknown').length;
  return data.length > 0 ? validCount / data.length : 0;
}

function calculateCoordinateCompleteness(data: NormalizedGeoData[]): number {
  const validCount = data.filter(item =>
    item.coordinates &&
    item.coordinates.lat !== null &&
    item.coordinates.lng !== null &&
    !(item.coordinates.lat === 0 && item.coordinates.lng === 0)  // ocean placeholder
  ).length;
  return data.length > 0 ? validCount / data.length : 0;
}

function validateCountryData(data: NormalizedGeoData[]): number {
  const validCount = data.filter(item => 
    item.country_code && 
    item.country_code.length === 2 && 
    /^[A-Z]{2}$/.test(item.country_code)
  ).length;
  return data.length > 0 ? validCount / data.length : 0;
}

function validateCoordinateData(data: NormalizedGeoData[]): number {
  const validCount = data.filter(item => 
    item.coordinates &&
    Math.abs(item.coordinates.lat) <= 90 &&
    Math.abs(item.coordinates.lng) <= 180
  ).length;
  return data.length > 0 ? validCount / data.length : 0;
}

function validateASNData(data: NormalizedGeoData[]): number {
  const validCount = data.filter(item => {
    if (!item.asn || item.asn === 'Unknown') return false;
    
    // Handle numeric ASNs
    if (typeof item.asn === 'number') {
      return item.asn > 0;
    }
    
    // Handle string ASNs (e.g., "AS15169")
    if (typeof item.asn === 'string') {
      return /^AS\d+$/i.test(item.asn);
    }
    
    return false;
  }).length;
  return data.length > 0 ? validCount / data.length : 0;
}

function validateCountryRegionConsistency(data: NormalizedGeoData[]): number {
  if (data.length === 0) return 1;
  
  // Define expected country-region mappings (examples)
  const countryRegions: Record<string, string[]> = {
    'US': ['California', 'Texas', 'New York', 'Florida', 'Illinois', 'Pennsylvania'],
    'GB': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
    'CA': ['Ontario', 'Quebec', 'British Columbia', 'Alberta'],
    'AU': ['New South Wales', 'Victoria', 'Queensland', 'Western Australia'],
    'DE': ['Bavaria', 'Berlin', 'Hamburg', 'North Rhine-Westphalia']
  };
  
  let consistentCount = 0;
  for (const item of data) {
    const expectedRegions = countryRegions[item.country_code];
    if (!expectedRegions || expectedRegions.includes(item.region)) {
      consistentCount++;
    }
  }
  
  return consistentCount / data.length;
}

function validateCoordinateCountryConsistency(data: NormalizedGeoData[]): number {
  if (data.length === 0) return 1;
  
  // Simple bounding box validation for major countries
  const countryBounds: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    'US': { minLat: 24.5, maxLat: 49.4, minLng: -125, maxLng: -66.9 },
    'GB': { minLat: 49.9, maxLat: 60.9, minLng: -8.6, maxLng: 1.8 },
    'CA': { minLat: 41.7, maxLat: 83.1, minLng: -141, maxLng: -52.6 },
    'AU': { minLat: -43.6, maxLat: -10.7, minLng: 112.9, maxLng: 153.6 },
    'CN': { minLat: 18.2, maxLat: 53.6, minLng: 73.5, maxLng: 134.8 }
  };
  
  let consistentCount = 0;
  for (const item of data) {
    const bounds = countryBounds[item.country_code];
    if (!bounds) {
      consistentCount++; // Unknown country, assume valid
    } else {
      const { lat, lng } = item.coordinates;
      if (lat !== null && lng !== null &&
          lat >= bounds.minLat && lat <= bounds.maxLat && 
          lng >= bounds.minLng && lng <= bounds.maxLng) {
        consistentCount++;
      }
    }
  }
  
  return consistentCount / data.length;
}

// Note: In production, this would access the actual cache instance
function getCurrentCacheHitRate(): number {
  // This would typically be tracked by the GeographicCache class
  // For documentation purposes, showing expected range
  return 0.85; // Typical cache hit rate for geographic data
}

// Note: In production, this would access actual performance metrics
function getAverageEnrichmentTime(): number {
  // This would typically be tracked by performance monitoring
  // For documentation purposes, showing expected value
  return 45; // Average enrichment time in milliseconds
}

function calculateStaleDataPercentage(data: NormalizedGeoData[]): number {
  const staleThreshold = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
  const staleCount = data.filter(item => {
    const lastUpdated = new Date(item.data_quality.last_updated).getTime();
    return lastUpdated < staleThreshold;
  }).length;
  return data.length > 0 ? staleCount / data.length : 0;
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

  // Stub implementations for recovery helpers
  private async tryFallbackSources(ip: string): Promise<NormalizedGeoData | null> {
    // TODO: Implement fallback API calls (e.g., MaxMind, IP2Location)
    return null;
  }

  private createPrivateIPGeoData(ip: string): NormalizedGeoData {
    // TODO: Handle private/local IP addresses (192.168.*, 10.*, 172.16-31.*, etc.)
    return this.createMinimalGeoData(ip);
  }

  private createUnknownGeoData(ip: string, reason: string): NormalizedGeoData {
    // TODO: Create unknown data with specific reason metadata
    const geoData = this.createMinimalGeoData(ip);
    (geoData as any)._error_reason = reason;
    return geoData;
  }

  private applyBasicNormalization(ip: string, rawData: any): NormalizedGeoData {
    // TODO: Apply minimal normalization to raw data
    return this.createMinimalGeoData(ip);
  }

  private createFallbackGeoData(ip: string): NormalizedGeoData {
    // TODO: Create ultimate fallback data
    return this.createMinimalGeoData(ip);
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