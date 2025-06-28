/**
 * Enhanced Correlation Algorithms with Scoring and Fuzzy Matching
 * Provides intelligent correlation scoring and flexible matching strategies
 */

import { getFieldValue, normalizeFieldValue, type EntityType, type MappableEntity } from './field-mapper.js';

/**
 * Utility function for consistent rounding to 3 decimal places
 */
function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

/**
 * Validate that a correlation score is within expected bounds
 */
function validateScore(score: number, context: string): number {
  if (score < 0 || score > 1 || isNaN(score)) {
    throw new Error(`Invalid correlation score ${score} in ${context}. Scores must be between 0 and 1.`);
  }
  return roundScore(score);
}

/**
 * Configuration for correlation scoring weights
 */
export type CorrelationWeights = Record<string, number>;

/**
 * Default field weights for correlation scoring
 */
export const DEFAULT_CORRELATION_WEIGHTS: CorrelationWeights = {
  // Network identifiers (high confidence)
  'source_ip': 1.0,
  'destination_ip': 1.0,
  'device_ip': 1.0,
  'device_id': 1.0,
  'gid': 1.0,
  
  // Protocol and network details (high confidence)
  'protocol': 0.9,
  'port': 0.8,
  'asn': 0.8,
  
  // Geographic fields (medium-high confidence)
  'country': 0.7,
  'region': 0.6,
  'city': 0.5,
  
  // Application fields (medium confidence)
  'application': 0.7,
  'user_agent': 0.6,
  'ssl_subject': 0.8,
  'ssl_issuer': 0.8,
  
  // Behavioral patterns (medium confidence)
  'session_duration': 0.5,
  'frequency_score': 0.6,
  'bytes_per_session': 0.5,
  'connection_pattern': 0.6,
  
  // Temporal fields (lower confidence due to time variance)
  'timestamp': 0.4,
  'hour_of_day': 0.3,
  'day_of_week': 0.2,
  
  // Default weight for unspecified fields
  'default': 0.5
};

/**
 * Fuzzy matching configuration
 */
export interface FuzzyMatchConfig {
  enabled: boolean;
  stringThreshold: number;    // 0.0-1.0, higher = more strict
  ipSubnetMatching: boolean;
  numericTolerance: number;   // percentage tolerance for numeric values
  geographicRadius: number;   // km radius for geographic fuzzy matching
}

/**
 * Default fuzzy matching configuration
 */
export const DEFAULT_FUZZY_CONFIG: FuzzyMatchConfig = {
  enabled: true,
  stringThreshold: 0.8,
  ipSubnetMatching: true,
  numericTolerance: 0.1, // 10% tolerance
  geographicRadius: 50    // 50km radius
};

/**
 * Enhanced correlation result with scoring
 */
export interface ScoredCorrelationResult {
  entity: MappableEntity;
  correlationScore: number;
  fieldScores: Record<string, number>;
  fieldMatchTypes: Record<string, 'exact' | 'fuzzy' | 'partial'>;
  matchType: 'exact' | 'fuzzy' | 'partial';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Enhanced correlation statistics with scoring details
 */
export interface EnhancedCorrelationStats {
  totalSecondaryResults: number;
  correlatedResults: number;
  averageScore: number;
  scoreDistribution: {
    high: number;    // score >= 0.8
    medium: number;  // score >= 0.5
    low: number;     // score < 0.5
  };
  fieldStatistics: Record<string, {
      exactMatches: number;
      fuzzyMatches: number;
      partialMatches: number;
      averageScore: number;
    }>;
  fuzzyMatchingEnabled: boolean;
  totalProcessingTime: number;
}

/**
 * Perform enhanced multi-field correlation with scoring and fuzzy matching
 */
export function performEnhancedCorrelation(
  primaryResults: MappableEntity[],
  secondaryResults: MappableEntity[],
  primaryType: EntityType,
  secondaryType: EntityType,
  correlationFields: string[],
  correlationType: 'AND' | 'OR',
  weights: CorrelationWeights = DEFAULT_CORRELATION_WEIGHTS,
  fuzzyConfig: FuzzyMatchConfig = DEFAULT_FUZZY_CONFIG,
  minimumScore: number = 0.3
): { correlatedResults: ScoredCorrelationResult[]; stats: EnhancedCorrelationStats } {
  
  const startTime = Date.now();
  const correlatedResults: ScoredCorrelationResult[] = [];
  
  // Extract correlation values from primary results for each field
  const primaryFieldValues = correlationFields.map(field => 
    extractFieldValuesWithMetadata(primaryResults, field, primaryType)
  );
  
  // Score each secondary result
  for (const secondaryItem of secondaryResults) {
    const correlationResult = scoreEntityCorrelation(
      secondaryItem,
      primaryFieldValues,
      correlationFields,
      secondaryType,
      correlationType,
      weights,
      fuzzyConfig
    );
    
    if (correlationResult.correlationScore >= minimumScore) {
      correlatedResults.push(correlationResult);
    }
  }
  
  // Sort by correlation score (descending)
  correlatedResults.sort((a, b) => b.correlationScore - a.correlationScore);
  
  // Generate enhanced statistics
  const stats = generateEnhancedStats(
    correlatedResults,
    secondaryResults.length,
    correlationFields,
    fuzzyConfig.enabled,
    Date.now() - startTime
  );
  
  return { correlatedResults, stats };
}

/**
 * Extract field values with additional metadata for scoring
 */
function extractFieldValuesWithMetadata(
  results: MappableEntity[],
  field: string,
  entityType: EntityType
): { values: Set<unknown>; metadata: Map<unknown, { count: number; quality: number }> } {
  
  const values = new Set<unknown>();
  const metadata = new Map<unknown, { count: number; quality: number }>();
  
  for (const entity of results) {
    const value = getFieldValue(entity, field, entityType);
    if (value !== undefined && value !== null && value !== '') {
      const normalizedValue = normalizeFieldValue(value, field);
      values.add(normalizedValue);
      
      // Track value occurrence and assess data quality
      const existing = metadata.get(normalizedValue) || { count: 0, quality: 1.0 };
      existing.count += 1;
      
      // Assess data quality based on completeness and format
      const quality = assessDataQuality(value, field);
      existing.quality = Math.max(existing.quality, quality);
      
      metadata.set(normalizedValue, existing);
    }
  }
  
  return { values, metadata };
}

/**
 * Score a single entity's correlation against primary results
 */
function scoreEntityCorrelation(
  entity: MappableEntity,
  primaryFieldValues: Array<{ values: Set<unknown>; metadata: Map<unknown, { count: number; quality: number }> }>,
  correlationFields: string[],
  entityType: EntityType,
  correlationType: 'AND' | 'OR',
  weights: CorrelationWeights,
  fuzzyConfig: FuzzyMatchConfig
): ScoredCorrelationResult {
  
  const fieldScores: Record<string, number> = {};
  const fieldMatchTypes: Record<string, 'exact' | 'fuzzy' | 'partial'> = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  // Score each correlation field
  for (let i = 0; i < correlationFields.length; i++) {
    const field = correlationFields[i];
    const fieldWeight = weights[field] || weights.default || 0.5;
    const primaryValues = primaryFieldValues[i];
    
    const entityValue = getFieldValue(entity, field, entityType);
    if (entityValue === undefined || entityValue === null) {
      fieldScores[field] = 0;
      fieldMatchTypes[field] = 'partial';
      totalWeight += fieldWeight;
      continue;
    }
    
    const normalizedValue = normalizeFieldValue(entityValue, field);
    
    // Calculate field correlation score
    const fieldScore = calculateFieldScore(
      normalizedValue,
      primaryValues,
      field,
      fuzzyConfig
    );
    
    fieldScores[field] = fieldScore.score;
    fieldMatchTypes[field] = fieldScore.matchType;
    totalWeightedScore += fieldScore.score * fieldWeight;
    totalWeight += fieldWeight;
    
    // Track match types
    if (fieldScore.matchType === 'exact') {exactMatches++;}
    else if (fieldScore.matchType === 'fuzzy') {fuzzyMatches++;}
  }
  
  // Calculate overall correlation score
  const correlationScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  
  // Apply correlation type logic for AND/OR
  let finalScore = correlationScore;
  if (correlationType === 'AND') {
    // For AND logic, penalize missing field matches by multiplying the score
    // by the completeness ratio. This ensures that AND correlations require
    // all fields to match for a high score (e.g., 2/3 matches = 67% penalty)
    const matchingFields = Object.values(fieldScores).filter(score => score > 0).length;
    const completeness = matchingFields / correlationFields.length;
    finalScore = correlationScore * completeness;
  }
  
  // Determine match type and confidence
  const matchType = exactMatches > 0 ? 'exact' : 
                   fuzzyMatches > 0 ? 'fuzzy' : 'partial';
  
  const confidence = finalScore >= 0.8 ? 'high' :
                    finalScore >= 0.5 ? 'medium' : 'low';
  
  return {
    entity,
    correlationScore: validateScore(finalScore, `entity correlation for ${correlationFields.join(', ')}`),
    fieldScores,
    fieldMatchTypes,
    matchType,
    confidence
  };
}

/**
 * Calculate correlation score for a specific field
 */
function calculateFieldScore(
  entityValue: unknown,
  primaryValues: { values: Set<unknown>; metadata: Map<unknown, { count: number; quality: number }> },
  field: string,
  fuzzyConfig: FuzzyMatchConfig
): { score: number; matchType: 'exact' | 'fuzzy' | 'partial' } {
  
  // Check for exact match first
  if (primaryValues.values.has(entityValue)) {
    // Cap exact matches at 1.0 to maintain scoring consistency
    // Quality information could be preserved separately if needed
    return { score: 1.0, matchType: 'exact' };
  }
  
  // Try fuzzy matching if enabled
  if (fuzzyConfig.enabled) {
    const fuzzyScore = calculateFuzzyScore(entityValue, primaryValues.values, field, fuzzyConfig);
    if (fuzzyScore > 0) {
      return { score: fuzzyScore, matchType: 'fuzzy' };
    }
  }
  
  // No match found
  return { score: 0, matchType: 'partial' };
}

/**
 * Calculate fuzzy matching score
 */
function calculateFuzzyScore(
  entityValue: unknown,
  primaryValues: Set<unknown>,
  field: string,
  fuzzyConfig: FuzzyMatchConfig
): number {
  
  let bestScore = 0;
  
  for (const primaryValue of primaryValues) {
    let score = 0;
    
    // IP address subnet matching
    if (field.includes('ip') && fuzzyConfig.ipSubnetMatching && 
        typeof entityValue === 'string' && typeof primaryValue === 'string') {
      score = calculateIPSimilarity(entityValue, primaryValue);
    }
    
    // String similarity matching
    else if (typeof entityValue === 'string' && typeof primaryValue === 'string') {
      score = calculateStringSimilarity(entityValue, primaryValue, fuzzyConfig.stringThreshold);
    }
    
    // Numeric tolerance matching
    else if (typeof entityValue === 'number' && typeof primaryValue === 'number') {
      score = calculateNumericSimilarity(entityValue, primaryValue, fuzzyConfig.numericTolerance);
    }
    
    // Geographic proximity matching
    else if (field.includes('geo') || field === 'country' || field === 'city') {
      score = calculateGeographicSimilarity(entityValue, primaryValue);
    }
    
    bestScore = Math.max(bestScore, score);
  }
  
  return bestScore;
}

/**
 * Validate IPv4 address format
 */
function isValidIPv4Address(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  
  if (!match) {return false;}
  
  // Check that each octet is 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) {return false;}
  }
  
  return true;
}

/**
 * Calculate IP address similarity (subnet matching)
 */
/**
 * Calculates similarity between two IP addresses using subnet matching
 * 
 * @param ip1 - First IP address to compare
 * @param ip2 - Second IP address to compare
 * @returns Similarity score between 0.0 and 1.0, where 1.0 is exact match
 */
export function calculateIPSimilarity(ip1: string, ip2: string): number {
  if (typeof ip1 !== 'string' || typeof ip2 !== 'string') {return 0;}
  
  // Validate IP address format before processing
  if (!isValidIPv4Address(ip1) || !isValidIPv4Address(ip2)) {return 0;}
  
  const parts1 = ip1.split('.');
  const parts2 = ip2.split('.');
  
  if (parts1.length !== 4 || parts2.length !== 4) {return 0;}
  
  let matchingOctets = 0;
  for (let i = 0; i < 4; i++) {
    if (parts1[i] === parts2[i]) {
      matchingOctets++;
    } else {
      break; // Subnet matching stops at first different octet
    }
  }
  
  // Score based on subnet size: /8=0.25, /16=0.5, /24=0.75, exact=1.0
  return matchingOctets * 0.25;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
/**
 * Calculates string similarity using Levenshtein distance algorithm
 * 
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @param threshold - Minimum similarity threshold (0.0 to 1.0)
 * @returns Similarity score between 0.0 and 1.0, where 1.0 is exact match
 */
export function calculateStringSimilarity(str1: string, str2: string, threshold: number): number {
  if (str1 === str2) {return 1.0;}
  
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {return 1.0;}
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const similarity = 1 - (distance / maxLength);
  
  return similarity >= threshold ? similarity * 0.8 : 0; // Cap fuzzy string matches at 0.8
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {matrix[0][i] = i;}
  for (let j = 0; j <= str2.length; j++) {matrix[j][0] = j;}
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Calculates similarity between two numeric values with tolerance
 * 
 * @param num1 - First number to compare
 * @param num2 - Second number to compare
 * @param tolerance - Acceptable tolerance for considering values similar (0.0 to 1.0)
 * @returns Similarity score between 0.0 and 1.0, where 1.0 is exact match
 */
export function calculateNumericSimilarity(num1: number, num2: number, tolerance: number): number {
  const diff = Math.abs(num1 - num2);
  const maxValue = Math.max(Math.abs(num1), Math.abs(num2));
  
  if (maxValue === 0) {return num1 === num2 ? 1.0 : 0;}
  
  const relativeDiff = diff / maxValue;
  
  if (relativeDiff <= tolerance) {
    return Math.max(0, 1 - (relativeDiff / tolerance)) * 0.7; // Cap numeric fuzzy at 0.7
  }
  
  return 0;
}

/**
 * Calculate geographic similarity (simplified)
 */
function calculateGeographicSimilarity(geo1: unknown, geo2: unknown): number {
  // Simple string-based geographic similarity
  if (typeof geo1 === 'string' && typeof geo2 === 'string') {
    return calculateStringSimilarity(geo1, geo2, 0.7) * 0.6; // Cap geo fuzzy at 0.6
  }
  return 0;
}

/**
 * Assess data quality for scoring bonus
 */
function assessDataQuality(value: unknown, field: string): number {
  let quality = 1.0;
  
  // Penalize empty or default values
  if (!value || value === '' || value === '0.0.0.0' || value === 'unknown' || 
      value === '127.0.0.1' || value === '255.255.255.255' || value === '::1' ||
      value === '0.0.0.0/0' || value === 'localhost') {
    quality -= 0.3;
  }
  
  // Bonus for well-formatted data
  if (field.includes('ip') && typeof value === 'string') {
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipRegex.test(value)) {quality += 0.1;}
  }
  
  return Math.max(0, Math.min(1.0, quality));
}

/**
 * Generate enhanced correlation statistics
 */
function generateEnhancedStats(
  correlatedResults: ScoredCorrelationResult[],
  totalSecondaryResults: number,
  correlationFields: string[],
  fuzzyEnabled: boolean,
  processingTime: number
): EnhancedCorrelationStats {
  
  const averageScore = correlatedResults.length > 0
    ? correlatedResults.reduce((sum, result) => sum + result.correlationScore, 0) / correlatedResults.length
    : 0;
  
  // Score distribution
  const scoreDistribution = {
    high: correlatedResults.filter(r => r.correlationScore >= 0.8).length,
    medium: correlatedResults.filter(r => r.correlationScore >= 0.5 && r.correlationScore < 0.8).length,
    low: correlatedResults.filter(r => r.correlationScore < 0.5).length
  };
  
  // Field statistics
  const fieldStatistics: Record<string, any> = {};
  for (const field of correlationFields) {
    const exactMatches = correlatedResults.filter(r => r.fieldMatchTypes[field] === 'exact').length;
    const fuzzyMatches = correlatedResults.filter(r => r.fieldMatchTypes[field] === 'fuzzy').length;
    const partialMatches = correlatedResults.filter(r => r.fieldMatchTypes[field] === 'partial').length;
    
    const fieldScores = correlatedResults
      .map(r => r.fieldScores[field] || 0)
      .filter(score => score > 0);
    
    const averageFieldScore = fieldScores.length > 0
      ? fieldScores.reduce((sum, score) => sum + score, 0) / fieldScores.length
      : 0;
    
    fieldStatistics[field] = {
      exactMatches,
      fuzzyMatches,
      partialMatches,
      averageScore: roundScore(averageFieldScore)
    };
  }
  
  return {
    totalSecondaryResults,
    correlatedResults: correlatedResults.length,
    averageScore: roundScore(averageScore),
    scoreDistribution,
    fieldStatistics,
    fuzzyMatchingEnabled: fuzzyEnabled,
    totalProcessingTime: processingTime
  };
}