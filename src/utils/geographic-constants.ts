/**
 * Geographic constants and mappings for IP geolocation enrichment
 */

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
  UY: 'South America',
  PY: 'South America',
  GY: 'South America',
  SR: 'South America',
  GF: 'South America',

  // Europe
  GB: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  IT: 'Europe',
  ES: 'Europe',
  PT: 'Europe',
  NL: 'Europe',
  BE: 'Europe',
  CH: 'Europe',
  AT: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  DK: 'Europe',
  FI: 'Europe',
  IS: 'Europe',
  IE: 'Europe',
  PL: 'Europe',
  CZ: 'Europe',
  SK: 'Europe',
  HU: 'Europe',
  RO: 'Europe',
  BG: 'Europe',
  GR: 'Europe',
  HR: 'Europe',
  SI: 'Europe',
  EE: 'Europe',
  LV: 'Europe',
  LT: 'Europe',
  RU: 'Europe',
  UA: 'Europe',
  BY: 'Europe',
  MD: 'Europe',

  // Asia
  CN: 'Asia',
  JP: 'Asia',
  IN: 'Asia',
  KR: 'Asia',
  TH: 'Asia',
  VN: 'Asia',
  MY: 'Asia',
  SG: 'Asia',
  ID: 'Asia',
  PH: 'Asia',
  TW: 'Asia',
  HK: 'Asia',
  MO: 'Asia',
  KH: 'Asia',
  LA: 'Asia',
  MM: 'Asia',
  BD: 'Asia',
  LK: 'Asia',
  NP: 'Asia',
  BT: 'Asia',
  PK: 'Asia',
  AF: 'Asia',
  IR: 'Asia',
  IQ: 'Asia',
  TR: 'Asia',
  SY: 'Asia',
  LB: 'Asia',
  JO: 'Asia',
  IL: 'Asia',
  SA: 'Asia',
  AE: 'Asia',
  KW: 'Asia',
  QA: 'Asia',
  BH: 'Asia',
  OM: 'Asia',
  YE: 'Asia',

  // Africa
  EG: 'Africa',
  LY: 'Africa',
  SD: 'Africa',
  MA: 'Africa',
  DZ: 'Africa',
  TN: 'Africa',
  ET: 'Africa',
  KE: 'Africa',
  UG: 'Africa',
  TZ: 'Africa',
  ZA: 'Africa',
  ZW: 'Africa',
  BW: 'Africa',
  ZM: 'Africa',
  MW: 'Africa',
  MZ: 'Africa',
  MG: 'Africa',
  AO: 'Africa',
  NA: 'Africa',
  SZ: 'Africa',
  LS: 'Africa',
  CI: 'Africa',
  GH: 'Africa',
  NG: 'Africa',
  CM: 'Africa',
  CF: 'Africa',
  TD: 'Africa',
  NE: 'Africa',
  BF: 'Africa',
  ML: 'Africa',
  SN: 'Africa',
  GM: 'Africa',
  GW: 'Africa',
  GN: 'Africa',
  SL: 'Africa',
  LR: 'Africa',

  // Oceania
  AU: 'Oceania',
  NZ: 'Oceania',
  FJ: 'Oceania',
  PG: 'Oceania',
  NC: 'Oceania',
  SB: 'Oceania',
  VU: 'Oceania',
  WS: 'Oceania',
  TO: 'Oceania',
  TV: 'Oceania',
  KI: 'Oceania',
  NR: 'Oceania',
  PW: 'Oceania',
  FM: 'Oceania',
  MH: 'Oceania',
} as const;

/**
 * Geographic risk scores by country code
 * Higher values indicate higher security risk
 */
export const COUNTRY_RISK_SCORES: Record<string, number> = {
  // High risk countries (7-10)
  CN: 8, // China
  RU: 9, // Russia
  KP: 10, // North Korea
  IR: 8, // Iran
  PK: 7, // Pakistan
  AF: 9, // Afghanistan
  SY: 9, // Syria
  IQ: 8, // Iraq
  YE: 8, // Yemen
  SO: 9, // Somalia

  // Medium-high risk (5-6)
  UA: 6, // Ukraine (due to current situation)
  BY: 6, // Belarus
  VE: 6, // Venezuela
  CU: 6, // Cuba
  MM: 6, // Myanmar
  BD: 5, // Bangladesh
  PH: 5, // Philippines
  ID: 5, // Indonesia

  // Medium risk (3-4)
  IN: 4, // India
  TH: 3, // Thailand
  VN: 4, // Vietnam
  MY: 3, // Malaysia
  BR: 4, // Brazil
  MX: 4, // Mexico
  AR: 3, // Argentina
  CL: 3, // Chile
  PE: 3, // Peru
  CO: 4, // Colombia
  TR: 4, // Turkey
  EG: 4, // Egypt
  ZA: 4, // South Africa
  NG: 5, // Nigeria
  KE: 4, // Kenya

  // Low-medium risk (2)
  KR: 2, // South Korea
  JP: 2, // Japan
  SG: 2, // Singapore
  HK: 2, // Hong Kong
  TW: 2, // Taiwan
  IL: 2, // Israel
  AE: 2, // UAE
  SA: 3, // Saudi Arabia
  QA: 2, // Qatar
  KW: 2, // Kuwait
  BH: 2, // Bahrain
  OM: 2, // Oman

  // Low risk (1)
  US: 1, // United States
  CA: 1, // Canada
  GB: 1, // United Kingdom
  DE: 1, // Germany
  FR: 1, // France
  IT: 1, // Italy
  ES: 1, // Spain
  PT: 1, // Portugal
  NL: 1, // Netherlands
  BE: 1, // Belgium
  CH: 1, // Switzerland
  AT: 1, // Austria
  SE: 1, // Sweden
  NO: 1, // Norway
  DK: 1, // Denmark
  FI: 1, // Finland
  IS: 1, // Iceland
  IE: 1, // Ireland
  AU: 1, // Australia
  NZ: 1, // New Zealand
} as const;

/**
 * Default values for geographic data
 */
export const DEFAULT_GEOGRAPHIC_VALUES = {
  COUNTRY: 'Unknown',
  COUNTRY_CODE: 'XX',
  CONTINENT: 'Unknown',
  REGION: 'Unknown',
  CITY: 'Unknown',
  TIMEZONE: 'UTC',
  DEFAULT_RISK_SCORE: 5, // Medium risk for unknown countries
} as const;

/**
 * Cache configuration constants
 */
export const CACHE_CONFIG = {
  DEFAULT_MAX_SIZE: 10000,
  DEFAULT_TTL_MS: 3600000, // 1 hour
  CLEANUP_INTERVAL_MS: 300000, // 5 minutes
} as const;
