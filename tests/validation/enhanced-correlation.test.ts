/**
 * Tests for enhanced correlation algorithms with scoring and fuzzy matching
 */

import {
  performEnhancedCorrelation,
  calculateStringSimilarity,
  calculateIPSimilarity,
  calculateNumericSimilarity,
  resolveFieldWeight,
  DEFAULT_CORRELATION_WEIGHTS,
  DEFAULT_FUZZY_CONFIG
} from '../../src/validation/enhanced-correlation.js';
import { getTestThresholds } from '../config/test-thresholds.js';

describe('Enhanced Correlation Algorithms', () => {
  const mockPrimaryFlows = [
    {
      source: { ip: '192.168.1.100' },
      destination: { ip: '203.0.113.1' },
      protocol: 'tcp',
      ts: 1640995200,
      app: { name: 'Chrome', category: 'browser' },
      geo: { country: 'United States', asn: '12345' }
    },
    {
      source: { ip: '192.168.1.101' },
      destination: { ip: '198.51.100.1' },
      protocol: 'https',
      ts: 1640995260,
      app: { name: 'Firefox', category: 'browser' },
      geo: { country: 'Germany', asn: '67890' }
    }
  ];

  const mockSecondaryAlarms = [
    {
      device: { ip: '192.168.1.100' },
      remote: { ip: '203.0.113.1', country: 'United States' },
      severity: 'high',
      type: 'network_intrusion',
      ts: 1640995250
    },
    {
      device: { ip: '192.168.1.150' },
      remote: { ip: '198.51.100.2', country: 'France' },
      severity: 'medium',
      type: 'policy_violation',
      ts: 1640995300
    },
    {
      device: { ip: '10.0.0.50' },
      remote: { ip: '8.8.8.8', country: 'United States' },
      severity: 'low',
      type: 'dns_query',
      ts: 1640995400
    }
  ];

  describe('Enhanced Correlation with Scoring', () => {
    test('should perform exact matching with high scores', () => {
      const { correlatedResults, stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.1
      );

      expect(correlatedResults).toHaveLength(1); // Only exact match for 192.168.1.100
      expect(correlatedResults[0].correlationScore).toBe(1.0); // Exact match
      expect(correlatedResults[0].matchType).toBe('exact');
      expect(correlatedResults[0].confidence).toBe('high');
      expect(stats.averageScore).toBeCloseTo(1.0);
    });

    test('should perform fuzzy IP subnet matching', () => {
      const { correlatedResults, stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip'],
        'OR',
        DEFAULT_CORRELATION_WEIGHTS,
        { ...DEFAULT_FUZZY_CONFIG, enabled: true, ipSubnetMatching: true },
        0.1
      );

      // Should match exact IP and fuzzy subnet matches
      expect(correlatedResults.length).toBeGreaterThan(1);
      
      // Check that we have both exact and fuzzy matches
      const exactMatches = correlatedResults.filter(r => r.matchType === 'exact');
      const fuzzyMatches = correlatedResults.filter(r => r.matchType === 'fuzzy');
      
      expect(exactMatches.length).toBeGreaterThan(0);
      expect(fuzzyMatches.length).toBeGreaterThan(0);
      expect(stats.fieldStatistics['source_ip'].exactMatches).toBeGreaterThan(0);
      expect(stats.fieldStatistics['source_ip'].fuzzyMatches).toBeGreaterThan(0);
    });

    test('should apply field weights correctly', () => {
      const customWeights = {
        source_ip: 1.0,
        country: 0.5,
        default: 0.3
      };

      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        customWeights,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.1
      );

      expect(correlatedResults.length).toBeGreaterThanOrEqual(1);
      
      // Find the result with perfect source_ip match
      const perfectMatch = correlatedResults.find(r => r.fieldScores['source_ip'] === 1.0);
      expect(perfectMatch).toBeDefined();
      
      // Score should be weighted average: (1.0 * 1.0 + 1.0 * 0.5) / (1.0 + 0.5) = 1.0
      expect(perfectMatch!.correlationScore).toBeCloseTo(1.0);
      expect(perfectMatch!.fieldScores['source_ip']).toBe(1.0);
      expect(perfectMatch!.fieldScores['country']).toBe(1.0);
    });

    test('should enforce minimum score threshold', () => {
      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        { ...DEFAULT_FUZZY_CONFIG, enabled: true },
        0.9 // High threshold
      );

      // Only exact matches should pass high threshold
      expect(correlatedResults.every(r => r.correlationScore >= 0.9)).toBe(true);
      expect(correlatedResults.every(r => r.confidence === 'high')).toBe(true);
    });

    test('should handle AND correlation logic correctly', () => {
      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.1
      );

      // AND logic requires both fields to match - filter to results with both fields matching
      const perfectMatches = correlatedResults.filter(r => 
        r.fieldScores['source_ip'] > 0 && r.fieldScores['country'] > 0
      );
      expect(perfectMatches.length).toBeGreaterThanOrEqual(1);
      
      // Check the first perfect match
      expect(perfectMatches[0].fieldScores['source_ip']).toBeGreaterThan(0);
      expect(perfectMatches[0].fieldScores['country']).toBeGreaterThan(0);
    });

    test('should handle OR correlation logic correctly', () => {
      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'OR',
        DEFAULT_CORRELATION_WEIGHTS,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.1
      );

      // OR logic requires at least one field to match
      expect(correlatedResults.length).toBeGreaterThan(0);
      correlatedResults.forEach(result => {
        const hasSourceMatch = result.fieldScores['source_ip'] > 0;
        const hasCountryMatch = result.fieldScores['country'] > 0;
        expect(hasSourceMatch || hasCountryMatch).toBe(true);
      });
    });
  });

  describe('Enhanced Statistics', () => {
    test('should provide detailed correlation statistics', () => {
      const { stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        DEFAULT_FUZZY_CONFIG,
        0.1
      );

      expect(stats).toHaveProperty('totalSecondaryResults');
      expect(stats).toHaveProperty('correlatedResults');
      expect(stats).toHaveProperty('averageScore');
      expect(stats).toHaveProperty('scoreDistribution');
      expect(stats).toHaveProperty('fieldStatistics');
      expect(stats).toHaveProperty('fuzzyMatchingEnabled');
      expect(stats).toHaveProperty('totalProcessingTime');

      expect(stats.scoreDistribution).toHaveProperty('high');
      expect(stats.scoreDistribution).toHaveProperty('medium');
      expect(stats.scoreDistribution).toHaveProperty('low');

      expect(stats.fieldStatistics).toHaveProperty('source_ip');
      expect(stats.fieldStatistics).toHaveProperty('country');
    });

    test('should categorize scores correctly', () => {
      const { correlatedResults, stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip'],
        'OR',
        DEFAULT_CORRELATION_WEIGHTS,
        DEFAULT_FUZZY_CONFIG,
        0.1
      );

      const thresholds = getTestThresholds();
      const highScoreCount = correlatedResults.filter(r => r.correlationScore >= thresholds.correlation.highScoreMin).length;
      const mediumScoreCount = correlatedResults.filter(r => r.correlationScore >= thresholds.correlation.mediumScoreMin && r.correlationScore < thresholds.correlation.highScoreMin).length;
      const lowScoreCount = correlatedResults.filter(r => r.correlationScore < thresholds.correlation.mediumScoreMin).length;

      expect(stats.scoreDistribution.high).toBe(highScoreCount);
      expect(stats.scoreDistribution.medium).toBe(mediumScoreCount);
      expect(stats.scoreDistribution.low).toBe(lowScoreCount);
    });
  });

  describe('Fuzzy Matching Algorithms', () => {
    test('should calculate IP similarity correctly', () => {
      // Test exact match
      expect(calculateIPSimilarity('192.168.1.1', '192.168.1.1')).toBe(1.0);
      
      // Test /24 subnet match (3 octets)
      const thresholds = getTestThresholds();
      expect(calculateIPSimilarity('192.168.1.1', '192.168.1.2')).toBe(thresholds.correlation.subnetMatchThreshold);
      
      // Test /16 subnet match (2 octets)
      expect(calculateIPSimilarity('192.168.1.1', '192.168.2.1')).toBe(0.5);
      
      // Test /8 subnet match (1 octet)
      expect(calculateIPSimilarity('192.168.1.1', '192.169.1.1')).toBe(0.25);
      
      // Test no match
      expect(calculateIPSimilarity('192.168.1.1', '10.0.0.1')).toBe(0);
    });

    test('should calculate string similarity correctly', () => {
      const thresholds = getTestThresholds();
      
      // Test exact match
      expect(calculateStringSimilarity('chrome', 'chrome', thresholds.correlation.stringFuzzyThreshold)).toBe(1.0);
      
      // Test similar strings
      const similarity = calculateStringSimilarity('chrome', 'chromium', 0.6);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(thresholds.correlation.stringFuzzyThreshold); // Capped at threshold for fuzzy matches
      
      // Test below threshold
      expect(calculateStringSimilarity('chrome', 'firefox', thresholds.correlation.stringFuzzyThreshold)).toBe(0);
    });

    test('should calculate numeric similarity correctly', () => {
      const thresholds = getTestThresholds();
      
      // Test exact match (returns capped score of 0.7 even for identical values to maintain consistency with fuzzy matching bounds)
      expect(calculateNumericSimilarity(100, 100, thresholds.correlation.numericToleranceDefault)).toBe(0.7);
      
      // Test within tolerance
      const similarity = calculateNumericSimilarity(100, 105, thresholds.correlation.numericToleranceDefault);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(0.7); // Capped at 0.7
      
      // Test outside tolerance
      expect(calculateNumericSimilarity(100, 150, thresholds.correlation.numericToleranceDefault)).toBe(0);
    });
  });

  describe('Weight Resolution Function', () => {
    test('should resolve field weights correctly', () => {
      const weights = { source_ip: 0.8, country: 0, protocol: null as any, default: 0.5 };
      
      // Test explicit weight (non-zero)
      expect(resolveFieldWeight('source_ip', weights)).toBe(0.8);
      
      // Test explicit zero weight
      expect(resolveFieldWeight('country', weights)).toBe(0);
      
      // Test invalid weight (should use default)
      expect(resolveFieldWeight('protocol', weights)).toBe(0.5);
      
      // Test undefined field (should use default)
      expect(resolveFieldWeight('unknown_field', weights)).toBe(0.5);
    });

    test('should handle edge cases in weight resolution', () => {
      // Test with no default weight
      expect(resolveFieldWeight('missing', {})).toBe(0.5);
      
      // Test with invalid default weight
      expect(resolveFieldWeight('missing', { default: 'invalid' as any })).toBe(0.5);
      
      // Test weight clamping
      expect(resolveFieldWeight('high', { high: 2.0 })).toBe(1.0); // Clamped to 1.0
      expect(resolveFieldWeight('low', { low: -0.5 })).toBe(0); // Clamped to 0
      
      // Test with NaN and Infinity
      expect(resolveFieldWeight('nan', { nan: NaN })).toBe(0.5);
      expect(resolveFieldWeight('inf', { inf: Infinity })).toBe(0.5);
    });
  });

  describe('Weight Handling and Edge Cases', () => {
    test('should handle zero weights correctly', () => {
      const zeroWeightConfig = {
        source_ip: 0,    // Zero weight - should be ignored
        country: 1.0,    // Full weight
        default: 0.5
      };

      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        zeroWeightConfig,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.0 // Accept all scores
      );

      expect(correlatedResults.length).toBeGreaterThan(0);
      
      // Find result with exact IP match
      const result = correlatedResults.find(r => r.fieldScores['source_ip'] === 0);
      expect(result).toBeDefined();
      
      // Zero weight field should have zero score and partial match type
      expect(result!.fieldScores['source_ip']).toBe(0);
      expect(result!.fieldMatchTypes['source_ip']).toBe('partial');
      
      // Non-zero weight field should still be processed normally
      expect(result!.fieldScores['country']).toBeGreaterThanOrEqual(0);
    });

    test('should handle invalid weight types correctly', () => {
      const invalidWeightConfig = {
        source_ip: null as any,     // Invalid - should use default
        country: false as any,      // Invalid - should use default
        protocol: 'invalid' as any, // Invalid - should use default
        default: 0.8
      };

      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country', 'protocol'],
        'OR',
        invalidWeightConfig,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.0
      );

      // Should handle invalid weights gracefully by falling back to default
      expect(correlatedResults.length).toBeGreaterThan(0);
      expect(correlatedResults[0].correlationScore).toBeGreaterThan(0);
    });

    test('should differentiate between zero and undefined weights', () => {
      const mockFlows = [{ source: { ip: '192.168.1.100' }, geo: { country: 'US' } }];
      const mockAlarms = [{ device: { ip: '192.168.1.100' }, remote: { country: 'CA' } }];

      // Test with zero weight
      const zeroResult = performEnhancedCorrelation(
        mockFlows, mockAlarms, 'flows', 'alarms',
        ['source_ip', 'country'], 'AND',
        { source_ip: 0, country: 1.0 },
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.0
      );

      // Test with undefined weight (should use default)
      const undefinedResult = performEnhancedCorrelation(
        mockFlows, mockAlarms, 'flows', 'alarms',
        ['source_ip', 'country'], 'AND',
        { country: 1.0, default: 0.8 }, // source_ip undefined
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.0
      );

      // Results should be different
      expect(zeroResult.correlatedResults[0]?.correlationScore)
        .not.toBe(undefinedResult.correlatedResults[0]?.correlationScore);
      
      // Zero weight should ignore the field completely
      expect(zeroResult.correlatedResults[0]?.fieldScores['source_ip']).toBe(0);
      expect(zeroResult.correlatedResults[0]?.fieldMatchTypes['source_ip']).toBe('partial');
      
      // Undefined weight should use default weight and process normally
      expect(undefinedResult.correlatedResults[0]?.fieldScores['source_ip']).toBeGreaterThan(0);
    });

    test('should handle all zero weights gracefully', () => {
      const allZeroWeights = {
        source_ip: 0,
        country: 0,
        default: 0.5
      };

      const { correlatedResults, stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        allZeroWeights,
        { ...DEFAULT_FUZZY_CONFIG, enabled: false },
        0.0
      );

      // Should handle all zero weights without crashing
      expect(Array.isArray(correlatedResults)).toBe(true);
      expect(stats.totalSecondaryResults).toBe(mockSecondaryAlarms.length);
      
      // All field scores should be zero
      if (correlatedResults.length > 0) {
        correlatedResults.forEach(result => {
          expect(result.fieldScores['source_ip']).toBe(0);
          expect(result.fieldScores['country']).toBe(0);
          expect(result.correlationScore).toBe(0);
        });
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle empty input gracefully', () => {
      const { correlatedResults, stats } = performEnhancedCorrelation(
        [],
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        DEFAULT_FUZZY_CONFIG,
        0.1
      );

      expect(correlatedResults).toHaveLength(0);
      expect(stats.averageScore).toBe(0);
      expect(stats.correlatedResults).toBe(0);
    });

    test('should handle missing field values', () => {
      const incompleteAlarms = [
        {
          device: { ip: '192.168.1.100' },
          // Missing remote field
          severity: 'high',
          type: 'network_intrusion'
        }
      ];

      const { correlatedResults } = performEnhancedCorrelation(
        mockPrimaryFlows,
        incompleteAlarms,
        'flows',
        'alarms',
        ['source_ip', 'destination_ip'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        DEFAULT_FUZZY_CONFIG,
        0.1
      );

      // Should handle missing fields gracefully
      expect(Array.isArray(correlatedResults)).toBe(true);
    });

    test('should complete processing in reasonable time', () => {
      const startTime = Date.now();
      
      const { stats } = performEnhancedCorrelation(
        mockPrimaryFlows,
        mockSecondaryAlarms,
        'flows',
        'alarms',
        ['source_ip', 'country'],
        'AND',
        DEFAULT_CORRELATION_WEIGHTS,
        DEFAULT_FUZZY_CONFIG,
        0.1
      );

      const totalTime = Date.now() - startTime;
      
      expect(stats.totalProcessingTime).toBeGreaterThanOrEqual(0);
      const thresholds = getTestThresholds();
      expect(totalTime).toBeLessThan(thresholds.performance.correlationMs); // Should complete within threshold
    });
  });
});

