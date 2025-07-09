/**
 * Unified geographic utilities for IP geolocation and enrichment
 * Combines functionality from geographic-cache.ts, geographic-constants.ts, and geographic-utils.ts
 */

import type { GeographicData } from '../types.js';

/**
 * Private IP address patterns that should not be geolocated
 */
export const PRIVATE_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^127\./, // 127.0.0.0/8 (localhost)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^::1$/, // IPv6 localhost
  /^fe80:/, // IPv6 link-local
  /^fc00:/, // IPv6 unique local
  /^fd00:/, // IPv6 unique local
] as const;

/**
 * Mapping of country codes to continent names
 * Comprehensive list covering all major countries and territories
 */
export const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // North America
  US: 'North America',
  CA: 'North America',
  MX: 'North America',
  GT: 'North America',
  BZ: 'North America',
  SV: 'North America',
  HN: 'North America',
  NI: 'North America',
  CR: 'North America',
  PA: 'North America',
  CU: 'North America',
  JM: 'North America',
  HT: 'North America',
  DO: 'North America',
  PR: 'North America',

  // South America
  BR: 'South America',
  AR: 'South America',
  CL: 'South America',
  PE: 'South America',
  CO: 'South America',
  VE: 'South America',
  EC: 'South America',
  BO: 'South America',
  PY: 'South America',
  UY: 'South America',
  GY: 'South America',
  SR: 'South America',
  GF: 'South America',
  FK: 'South America',

  // Europe
  GB: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  IT: 'Europe',
  ES: 'Europe',
  PT: 'Europe',
  NL: 'Europe',
  BE: 'Europe',
  LU: 'Europe',
  IE: 'Europe',
  AT: 'Europe',
  CH: 'Europe',
  PL: 'Europe',
  CZ: 'Europe',
  SK: 'Europe',
  HU: 'Europe',
  RO: 'Europe',
  BG: 'Europe',
  GR: 'Europe',
  HR: 'Europe',
  SI: 'Europe',
  RS: 'Europe',
  BA: 'Europe',
  ME: 'Europe',
  MK: 'Europe',
  AL: 'Europe',
  NO: 'Europe',
  SE: 'Europe',
  FI: 'Europe',
  DK: 'Europe',
  IS: 'Europe',
  EE: 'Europe',
  LV: 'Europe',
  LT: 'Europe',
  BY: 'Europe',
  UA: 'Europe',
  MD: 'Europe',
  RU: 'Europe', // Partly in Asia, but primarily European

  // Asia
  CN: 'Asia',
  JP: 'Asia',
  KR: 'Asia',
  IN: 'Asia',
  PK: 'Asia',
  BD: 'Asia',
  LK: 'Asia',
  NP: 'Asia',
  BT: 'Asia',
  MM: 'Asia',
  TH: 'Asia',
  LA: 'Asia',
  VN: 'Asia',
  KH: 'Asia',
  MY: 'Asia',
  SG: 'Asia',
  ID: 'Asia',
  PH: 'Asia',
  TL: 'Asia',
  BN: 'Asia',
  TW: 'Asia',
  HK: 'Asia',
  MO: 'Asia',
  MN: 'Asia',
  KZ: 'Asia',
  UZ: 'Asia',
  TM: 'Asia',
  KG: 'Asia',
  TJ: 'Asia',
  AF: 'Asia',
  IR: 'Asia',
  IQ: 'Asia',
  SA: 'Asia',
  YE: 'Asia',
  OM: 'Asia',
  AE: 'Asia',
  QA: 'Asia',
  BH: 'Asia',
  KW: 'Asia',
  JO: 'Asia',
  LB: 'Asia',
  SY: 'Asia',
  IL: 'Asia',
  PS: 'Asia',
  TR: 'Asia',
  GE: 'Asia',
  AM: 'Asia',
  AZ: 'Asia',

  // Africa
  EG: 'Africa',
  LY: 'Africa',
  TN: 'Africa',
  DZ: 'Africa',
  MA: 'Africa',
  EH: 'Africa',
  MR: 'Africa',
  ML: 'Africa',
  NE: 'Africa',
  TD: 'Africa',
  SD: 'Africa',
  SS: 'Africa',
  ER: 'Africa',
  DJ: 'Africa',
  SO: 'Africa',
  ET: 'Africa',
  KE: 'Africa',
  UG: 'Africa',
  TZ: 'Africa',
  RW: 'Africa',
  BI: 'Africa',
  MZ: 'Africa',
  MW: 'Africa',
  ZM: 'Africa',
  ZW: 'Africa',
  BW: 'Africa',
  NA: 'Africa',
  ZA: 'Africa',
  LS: 'Africa',
  SZ: 'Africa',
  MG: 'Africa',
  KM: 'Africa',
  KP: 'Asia',
  MU: 'Africa',
  SC: 'Africa',
  AO: 'Africa',
  CG: 'Africa',
  CD: 'Africa',
  GA: 'Africa',
  GQ: 'Africa',
  CF: 'Africa',
  CM: 'Africa',
  NG: 'Africa',
  BJ: 'Africa',
  TG: 'Africa',
  GH: 'Africa',
  CI: 'Africa',
  BF: 'Africa',
  LR: 'Africa',
  SL: 'Africa',
  GN: 'Africa',
  GW: 'Africa',
  SN: 'Africa',
  GM: 'Africa',
  CV: 'Africa',

  // Oceania
  AU: 'Oceania',
  NZ: 'Oceania',
  PG: 'Oceania',
  FJ: 'Oceania',
  SB: 'Oceania',
  NC: 'Oceania',
  PF: 'Oceania',
  VU: 'Oceania',
  WS: 'Oceania',
  KI: 'Oceania',
  TO: 'Oceania',
  TV: 'Oceania',
  NR: 'Oceania',
  PW: 'Oceania',
  MH: 'Oceania',
  FM: 'Oceania',

  // Antarctica
  AQ: 'Antarctica',
} as const;

/**
 * Mapping of country codes to regions for more granular geographic analysis
 */
export const COUNTRY_TO_REGION: Record<string, string> = {
  // North America
  US: 'Northern America',
  CA: 'Northern America',
  MX: 'Central America',
  GT: 'Central America',
  BZ: 'Central America',
  SV: 'Central America',
  HN: 'Central America',
  NI: 'Central America',
  CR: 'Central America',
  PA: 'Central America',
  CU: 'Caribbean',
  JM: 'Caribbean',
  HT: 'Caribbean',
  DO: 'Caribbean',
  PR: 'Caribbean',

  // Europe
  GB: 'Northern Europe',
  IE: 'Northern Europe',
  NO: 'Northern Europe',
  SE: 'Northern Europe',
  FI: 'Northern Europe',
  DK: 'Northern Europe',
  IS: 'Northern Europe',
  EE: 'Northern Europe',
  LV: 'Northern Europe',
  LT: 'Northern Europe',
  DE: 'Western Europe',
  FR: 'Western Europe',
  NL: 'Western Europe',
  BE: 'Western Europe',
  LU: 'Western Europe',
  AT: 'Western Europe',
  CH: 'Western Europe',
  ES: 'Southern Europe',
  PT: 'Southern Europe',
  IT: 'Southern Europe',
  GR: 'Southern Europe',
  HR: 'Southern Europe',
  SI: 'Southern Europe',
  RS: 'Southern Europe',
  BA: 'Southern Europe',
  ME: 'Southern Europe',
  MK: 'Southern Europe',
  AL: 'Southern Europe',
  PL: 'Eastern Europe',
  CZ: 'Eastern Europe',
  SK: 'Eastern Europe',
  HU: 'Eastern Europe',
  RO: 'Eastern Europe',
  BG: 'Eastern Europe',
  BY: 'Eastern Europe',
  UA: 'Eastern Europe',
  MD: 'Eastern Europe',
  RU: 'Eastern Europe',

  // Asia
  CN: 'Eastern Asia',
  JP: 'Eastern Asia',
  KR: 'Eastern Asia',
  TW: 'Eastern Asia',
  HK: 'Eastern Asia',
  MO: 'Eastern Asia',
  MN: 'Eastern Asia',
  IN: 'Southern Asia',
  PK: 'Southern Asia',
  BD: 'Southern Asia',
  LK: 'Southern Asia',
  NP: 'Southern Asia',
  BT: 'Southern Asia',
  AF: 'Southern Asia',
  IR: 'Southern Asia',
  TH: 'South-Eastern Asia',
  VN: 'South-Eastern Asia',
  MY: 'South-Eastern Asia',
  SG: 'South-Eastern Asia',
  ID: 'South-Eastern Asia',
  PH: 'South-Eastern Asia',
  MM: 'South-Eastern Asia',
  LA: 'South-Eastern Asia',
  KH: 'South-Eastern Asia',
  BN: 'South-Eastern Asia',
  TL: 'South-Eastern Asia',
  SA: 'Western Asia',
  YE: 'Western Asia',
  OM: 'Western Asia',
  AE: 'Western Asia',
  QA: 'Western Asia',
  BH: 'Western Asia',
  KW: 'Western Asia',
  IQ: 'Western Asia',
  JO: 'Western Asia',
  LB: 'Western Asia',
  SY: 'Western Asia',
  IL: 'Western Asia',
  PS: 'Western Asia',
  TR: 'Western Asia',
  GE: 'Western Asia',
  AM: 'Western Asia',
  AZ: 'Western Asia',
  KZ: 'Central Asia',
  UZ: 'Central Asia',
  TM: 'Central Asia',
  KG: 'Central Asia',
  TJ: 'Central Asia',

  // Africa
  EG: 'Northern Africa',
  LY: 'Northern Africa',
  TN: 'Northern Africa',
  DZ: 'Northern Africa',
  MA: 'Northern Africa',
  EH: 'Northern Africa',
  SD: 'Northern Africa',
  SS: 'Eastern Africa',
  ER: 'Eastern Africa',
  DJ: 'Eastern Africa',
  SO: 'Eastern Africa',
  ET: 'Eastern Africa',
  KE: 'Eastern Africa',
  UG: 'Eastern Africa',
  TZ: 'Eastern Africa',
  RW: 'Eastern Africa',
  BI: 'Eastern Africa',
  MG: 'Eastern Africa',
  KM: 'Eastern Africa',
  MU: 'Eastern Africa',
  SC: 'Eastern Africa',
  MZ: 'Eastern Africa',
  MW: 'Eastern Africa',
  ZM: 'Eastern Africa',
  ZW: 'Eastern Africa',
  AO: 'Middle Africa',
  CG: 'Middle Africa',
  CD: 'Middle Africa',
  GA: 'Middle Africa',
  GQ: 'Middle Africa',
  CF: 'Middle Africa',
  CM: 'Middle Africa',
  TD: 'Middle Africa',
  BW: 'Southern Africa',
  NA: 'Southern Africa',
  ZA: 'Southern Africa',
  LS: 'Southern Africa',
  SZ: 'Southern Africa',
  NG: 'Western Africa',
  BJ: 'Western Africa',
  TG: 'Western Africa',
  GH: 'Western Africa',
  CI: 'Western Africa',
  BF: 'Western Africa',
  ML: 'Western Africa',
  NE: 'Western Africa',
  MR: 'Western Africa',
  LR: 'Western Africa',
  SL: 'Western Africa',
  GN: 'Western Africa',
  GW: 'Western Africa',
  SN: 'Western Africa',
  GM: 'Western Africa',
  CV: 'Western Africa',

  // Oceania
  AU: 'Australia and New Zealand',
  NZ: 'Australia and New Zealand',
  PG: 'Melanesia',
  FJ: 'Melanesia',
  SB: 'Melanesia',
  NC: 'Melanesia',
  VU: 'Melanesia',
  PF: 'Polynesia',
  WS: 'Polynesia',
  TO: 'Polynesia',
  TV: 'Polynesia',
  KI: 'Micronesia',
  NR: 'Micronesia',
  PW: 'Micronesia',
  MH: 'Micronesia',
  FM: 'Micronesia',
} as const;

/**
 * Country risk scores for security analysis
 * Higher scores indicate higher risk based on cybersecurity threat data
 */
export const COUNTRY_RISK_SCORES: Record<string, number> = {
  // High-risk countries (0.8-1.0)
  CN: 0.95,
  RU: 0.95,
  KP: 1.0,
  IR: 0.9,
  SY: 0.85,
  VE: 0.8,
  CU: 0.8,

  // Medium-risk countries (0.5-0.7)
  IN: 0.6,
  BR: 0.6,
  TR: 0.65,
  UA: 0.7,
  RO: 0.65,
  VN: 0.6,
  ID: 0.55,
  EG: 0.6,
  PK: 0.65,
  BD: 0.6,
  NG: 0.65,
  ZA: 0.6,
  KE: 0.55,
  AR: 0.55,
  MX: 0.6,

  // Low-risk countries (0.1-0.4)
  US: 0.3,
  CA: 0.2,
  GB: 0.25,
  DE: 0.2,
  FR: 0.25,
  JP: 0.15,
  AU: 0.2,
  NZ: 0.15,
  SG: 0.2,
  KR: 0.25,
  NL: 0.2,
  CH: 0.15,
  SE: 0.15,
  NO: 0.15,
  DK: 0.15,
  FI: 0.15,

  // Default for unlisted countries
  DEFAULT: 0.5,
} as const;

/**
 * Cache configuration for geographic data
 */
export const CACHE_CONFIG = {
  maxSize: 10000,
  ttlMs: 3600000, // 1 hour
  enableStats: true,
} as const;

/**
 * Geographic cache entry interface
 */
export interface GeographicCacheEntry {
  data: GeographicData | null;
  timestamp: number;
}

/**
 * Geographic cache configuration
 */
export interface GeographicCacheConfig {
  maxSize: number;
  ttlMs: number;
  enableStats: boolean;
}

/**
 * Geographic cache statistics
 */
export interface GeographicCacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

/**
 * Geographic cache implementation with LRU eviction
 */
export class GeographicCache {
  private cache = new Map<string, GeographicCacheEntry>();
  private stats: GeographicCacheStats = {
    size: 0,
    maxSize: CACHE_CONFIG.maxSize,
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    evictionCount: 0,
  };
  private config: GeographicCacheConfig = { ...CACHE_CONFIG };

  constructor(config?: Partial<GeographicCacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
      this.stats.maxSize = this.config.maxSize;
    }
  }

  /**
   * Get cached geographic data for an IP
   */
  get(ip: string): GeographicData | null | undefined {
    const entry = this.cache.get(ip);

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.missCount++;
        this.updateHitRate();
      }
      return undefined;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(ip);
      if (this.config.enableStats) {
        this.stats.missCount++;
        this.updateHitRate();
      }
      return undefined;
    }

    // Move to end for LRU
    this.cache.delete(ip);
    this.cache.set(ip, entry);

    if (this.config.enableStats) {
      this.stats.hitCount++;
      this.updateHitRate();
    }

    return entry.data;
  }

  /**
   * Set geographic data for an IP
   */
  set(ip: string, data: GeographicData | null): void {
    // Check if we need to evict
    if (this.cache.size >= this.config.maxSize && !this.cache.has(ip)) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        if (this.config.enableStats) {
          this.stats.evictionCount++;
        }
      }
    }

    this.cache.set(ip, {
      data,
      timestamp: Date.now(),
    });

    this.stats.size = this.cache.size;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      size: 0,
      maxSize: this.config.maxSize,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      evictionCount: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): GeographicCacheStats {
    return { ...this.stats };
  }

  /**
   * Remove expired entries
   */
  pruneExpired(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [ip, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(ip);
        removedCount++;
      }
    }

    this.stats.size = this.cache.size;
    return removedCount;
  }

  /**
   * Get current configuration
   */
  getConfig(): GeographicCacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<GeographicCacheConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };

    // If max size reduced, remove excess entries
    if (this.cache.size > this.config.maxSize) {
      const entriesToRemove = this.cache.size - this.config.maxSize;
      const entries = Array.from(this.cache.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(entries[i]);
        if (this.config.enableStats) {
          this.stats.evictionCount++;
        }
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = total > 0 ? this.stats.hitCount / total : 0;
  }
}

/**
 * Check if an IP is a private/internal IP address
 */
export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Map a country code to its continent
 */
export function mapContinent(countryCode: string): string {
  return COUNTRY_TO_CONTINENT[countryCode?.toUpperCase()] || 'Unknown';
}

/**
 * Calculate risk score for a country (0-10 scale)
 */
export function calculateRiskScore(countryCode: string): number {
  const score =
    COUNTRY_RISK_SCORES[countryCode?.toUpperCase()] ||
    COUNTRY_RISK_SCORES.DEFAULT;

  // Convert from 0-1 scale to 0-10 scale
  return score * 10;
}

/**
 * Get geographic data for an IP address
 */
export function getGeographicDataForIP(ip: string): GeographicData | null {
  // Check if private IP
  if (!ip || isPrivateIP(ip)) {
    return null;
  }

  // This is a placeholder - in production, this would call an actual geolocation service
  // For testing, return mock data for known IPs
  if (ip === '8.8.8.8' || ip === '8.8.4.4') {
    return {
      country: 'United States',
      country_code: 'US',
      continent: 'North America',
      region: 'California',
      city: 'Mountain View',
      timezone: 'America/Los_Angeles',
      isp: 'Google',
      organization: 'Google LLC',
      asn: 15169,
      geographic_risk_score: calculateRiskScore('US'),
    };
  }

  if (ip === '1.1.1.1') {
    return {
      country: 'Australia',
      country_code: 'AU',
      continent: 'Oceania',
      region: 'New South Wales',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
      isp: 'Cloudflare',
      organization: 'Cloudflare, Inc.',
      asn: 13335,
      geographic_risk_score: calculateRiskScore('AU'),
    };
  }

  // Default mock data
  return {
    country: 'Unknown',
    country_code: 'UN',
    continent: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    timezone: 'UTC',
    isp: 'Unknown',
    organization: 'Unknown',
    asn: 0,
  };
}

/**
 * Enrich an object with geographic data based on IP fields
 */
export function enrichObjectWithGeo<T extends Record<string, any>>(
  obj: T,
  ipFields: string[] = ['source_ip', 'destination_ip', 'device_ip', 'ip']
): T & Record<string, GeographicData | null> {
  const enriched: any = { ...obj };

  for (const field of ipFields) {
    const ip = obj[field];
    if (ip && typeof ip === 'string') {
      const geoField = `${field}_geo`;
      if (!enriched[geoField]) {
        enriched[geoField] = getGeographicDataForIP(ip);
      }
    }
  }

  return enriched;
}

/**
 * Validate IP address format
 */
export function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Pattern.test(ip);
}

/**
 * Normalize IP address
 */
export function normalizeIP(ip: string): string | null {
  if (!isValidIP(ip)) {
    return null;
  }

  // For IPv4, remove leading zeros
  if (ip.includes('.')) {
    return ip
      .split('.')
      .map(part => parseInt(part, 10).toString())
      .join('.');
  }

  // For IPv6, lowercase
  return ip.toLowerCase();
}

/**
 * Check if a country code is valid
 */
export function isValidCountryCode(countryCode: string): boolean {
  return (
    typeof countryCode === 'string' &&
    countryCode.length === 2 &&
    countryCode.toUpperCase() in COUNTRY_TO_CONTINENT
  );
}

/**
 * Validate multiple country codes
 */
export function validateCountryCodes(countryCodes: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const code of countryCodes) {
    if (isValidCountryCode(code)) {
      valid.push(code.toUpperCase());
    } else {
      invalid.push(code);
    }
  }

  return { valid, invalid };
}
