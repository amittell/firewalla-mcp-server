/**
 * Geographic utility functions for IP geolocation enrichment
 */

import geoip from 'geoip-lite';
import type { GeographicData } from '../types.js';
import {
  PRIVATE_IP_PATTERNS,
  COUNTRY_TO_CONTINENT,
  COUNTRY_RISK_SCORES,
  DEFAULT_GEOGRAPHIC_VALUES,
} from './geographic-constants.js';

/**
 * Check if an IP address is private/internal and should not be geolocated
 * @param ip - IP address to check
 * @returns true if the IP is private, false otherwise
 */
export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Map country code to continent name
 * @param countryCode - Two-letter country code (e.g., "US")
 * @returns Continent name or "Unknown" if not found
 */
export function mapContinent(countryCode: string): string {
  return COUNTRY_TO_CONTINENT[countryCode] || DEFAULT_GEOGRAPHIC_VALUES.CONTINENT;
}

/**
 * Calculate geographic risk score for a country
 * @param countryCode - Two-letter country code
 * @returns Risk score from 1 (low) to 10 (high)
 */
export function calculateRiskScore(countryCode: string): number {
  return COUNTRY_RISK_SCORES[countryCode] || DEFAULT_GEOGRAPHIC_VALUES.DEFAULT_RISK_SCORE;
}

/**
 * Get geographic data for an IP address using geoip-lite
 * @param ip - IP address to geolocate
 * @returns GeographicData object or null if lookup fails
 */
export function getGeographicDataForIP(ip: string): GeographicData | null {
  // Don't geolocate private IPs
  if (isPrivateIP(ip)) {
    return null;
  }

  try {
    const geo = geoip.lookup(ip);
    if (!geo) {
      return null;
    }

    return {
      country: geo.country || DEFAULT_GEOGRAPHIC_VALUES.COUNTRY,
      country_code: geo.country || DEFAULT_GEOGRAPHIC_VALUES.COUNTRY_CODE,
      continent: mapContinent(geo.country),
      region: geo.region || DEFAULT_GEOGRAPHIC_VALUES.REGION,
      city: geo.city || DEFAULT_GEOGRAPHIC_VALUES.CITY,
      timezone: geo.timezone || DEFAULT_GEOGRAPHIC_VALUES.TIMEZONE,
      geographic_risk_score: calculateRiskScore(geo.country),
    };
  } catch (_error) {
    // Return null if there's any error in geolocation lookup or data processing
    return null;
  }
}

/**
 * Enrich an object with geographic data for a specific IP field
 * @param obj - Object to enrich
 * @param ipPath - Dot notation path to the IP field (e.g., "destination.ip")
 * @param geoPath - Dot notation path where to store geo data (e.g., "destination.geo")
 * @param getGeoData - Function to get geographic data for an IP
 * @returns Enriched object
 */
export function enrichObjectWithGeo<T extends Record<string, any>>(
  obj: T,
  ipPath: string,
  geoPath: string,
  getGeoData: (ip: string) => GeographicData | null
): T {
  const enriched = { ...obj };
  
  const ip = getNestedValue(enriched, ipPath);
  if (typeof ip === 'string' && !isPrivateIP(ip)) {
    const geoData = getGeoData(ip);
    if (geoData) {
      setNestedValue(enriched, geoPath, geoData);
    }
  }
  
  return enriched;
}

/**
 * Get a nested value from an object using dot notation
 * @param obj - Object to read from
 * @param path - Dot notation path (e.g., "destination.ip")
 * @returns Value at the path or undefined
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Set a nested value in an object using dot notation
 * @param obj - Object to modify
 * @param path - Dot notation path (e.g., "destination.geo")
 * @param value - Value to set
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) {
    return;
  }
  
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  
  target[lastKey] = value;
}

/**
 * Validate that an IP address is in a valid format
 * @param ip - IP address to validate
 * @returns true if valid, false otherwise
 */
export function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Normalize IP address for consistent handling
 * @param ip - IP address to normalize
 * @returns Normalized IP address or null if invalid
 */
export function normalizeIP(ip: string): string | null {
  if (!ip || typeof ip !== 'string') {
    return null;
  }
  
  const trimmed = ip.trim();
  if (!isValidIP(trimmed)) {
    return null;
  }
  
  return trimmed;
}