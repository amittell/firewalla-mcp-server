/**
 * Unified geographic utilities for IP geolocation and enrichment
 * Combines functionality from geographic-cache.ts, geographic-constants.ts, and geographic-utils.ts
 */
import type { GeographicData } from '../types.js';
/**
 * Private IP address patterns that should not be geolocated
 */
export declare const PRIVATE_IP_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Mapping of country codes to continent names
 * Comprehensive list covering all major countries and territories
 */
export declare const COUNTRY_TO_CONTINENT: Record<string, string>;
/**
 * Mapping of country codes to regions for more granular geographic analysis
 */
export declare const COUNTRY_TO_REGION: Record<string, string>;
/**
 * Country risk scores for security analysis
 * Higher scores indicate higher risk based on cybersecurity threat data
 */
export declare const COUNTRY_RISK_SCORES: Record<string, number>;
/**
 * Cache configuration for geographic data
 */
export declare const CACHE_CONFIG: {
    readonly maxSize: 10000;
    readonly ttlMs: 3600000;
    readonly enableStats: true;
};
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
export declare class GeographicCache {
    private cache;
    private stats;
    private config;
    constructor(config?: Partial<GeographicCacheConfig>);
    /**
     * Get cached geographic data for an IP
     */
    get(ip: string): GeographicData | null | undefined;
    /**
     * Set geographic data for an IP
     */
    set(ip: string, data: GeographicData | null): void;
    /**
     * Clear the cache
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): GeographicCacheStats;
    /**
     * Remove expired entries
     */
    pruneExpired(): number;
    /**
     * Get current configuration
     */
    getConfig(): GeographicCacheConfig;
    /**
     * Update cache configuration
     */
    updateConfig(newConfig: Partial<GeographicCacheConfig>): void;
    private updateHitRate;
}
/**
 * Check if an IP is a private/internal IP address
 */
export declare function isPrivateIP(ip: string): boolean;
/**
 * Map a country code to its continent
 */
export declare function mapContinent(countryCode: string): string;
/**
 * Calculate risk score for a country (0-10 scale)
 */
export declare function calculateRiskScore(countryCode: string): number;
/**
 * Get geographic data for an IP address
 */
export declare function getGeographicDataForIP(ip: string): GeographicData | null;
/**
 * Enhanced IP validation with support for IPv6
 */
export declare function isValidIPv6(ip: string): boolean;
/**
 * Enhanced geographic data provider with fallback mechanisms
 */
export declare function getEnhancedGeographicDataForIP(ip: string): GeographicData | null;
/**
 * Enrich an object with geographic data based on IP fields
 * Enhanced version with fallback mechanisms
 */
export declare function enrichObjectWithGeo<T extends Record<string, any>>(obj: T, ipFields?: string[]): T & Record<string, GeographicData | null>;
/**
 * Validate IP address format
 */
export declare function isValidIP(ip: string): boolean;
/**
 * Normalize IP address
 */
export declare function normalizeIP(ip: string): string | null;
/**
 * Check if a country code is valid: an officially assigned ISO 3166-1
 * alpha-2 code, in either case
 */
export declare function isValidCountryCode(countryCode: string): boolean;
/**
 * Validate multiple country codes
 */
export declare function validateCountryCodes(countryCodes: string[]): {
    valid: string[];
    invalid: string[];
};
/**
 * Global geographic cache instance
 * Used across the application for consistent geographic data caching
 */
export declare const geoCache: GeographicCache;
//# sourceMappingURL=geographic.d.ts.map