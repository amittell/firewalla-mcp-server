/**
 * Simple data safety utilities for Firewalla MCP Server
 * Provides basic null safety and prevents crashes from malformed API data
 */

import type { GeographicData } from '../types.js';

/**
 * Basic null safety for objects - prevents crashes from null/undefined data
 */
export function safeAccess(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => safeAccess(item));
  }
  
  if (typeof data === 'object') {
    const safe: any = {};
    for (const [key, value] of Object.entries(data)) {
      safe[key] = safeAccess(value);
    }
    return safe;
  }
  
  return data;
}

/**
 * Simple value sanitization - handles null/undefined and basic type safety
 */
export function safeValue(value: any, defaultValue?: any): any {
  if (value === null || value === undefined) {
    return defaultValue ?? null;
  }
  
  if (typeof value === 'number' && !isFinite(value)) {
    return defaultValue ?? null;
  }
  
  return value;
}

/**
 * Basic geographic data safety - just prevents crashes and provides defaults
 */
export function safeGeoData(geoData: any): GeographicData {
  if (!geoData || typeof geoData !== 'object') {
    return {
      country: 'unknown',
      country_code: 'UN',
      continent: 'unknown',
      region: 'unknown',
      city: 'unknown',
      timezone: 'unknown',
    };
  }

  return {
    country: safeValue(geoData.country || geoData.Country, 'unknown'),
    country_code: safeValue(geoData.country_code || geoData.countryCode, 'UN'),
    continent: safeValue(geoData.continent, 'unknown'),
    region: safeValue(geoData.region, 'unknown'),
    city: safeValue(geoData.city, 'unknown'),
    timezone: safeValue(geoData.timezone, 'unknown'),
  };
}

/**
 * Safe numeric conversion
 */
function safeNumber(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }
  
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return isFinite(parsed) ? parsed : null;
  }
  
  return null;
}

/**
 * Safe byte count conversion
 */
export function safeByteCount(value: any, defaultValue: number = 0): number {
  const num = safeNumber(value);
  return num !== null ? num : defaultValue;
}

/**
 * Simple boolean conversion
 */
export function safeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {return value;}
  if (typeof value === 'string') {return value.toLowerCase() === 'true';}
  if (typeof value === 'number') {return value !== 0;}
  return false;
}
