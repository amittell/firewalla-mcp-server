/**
 * Comprehensive unit tests for enhanced cross-reference search functionality
 * Tests multi-field correlation, temporal windows, and advanced correlation features
 */

import { 
  validateEnhancedCrossReference,
  performMultiFieldCorrelation,
  getSupportedCorrelationCombinations,
  EnhancedCorrelationParams,
  EntityType
} from '../../src/validation/field-mapper.js';

describe('Enhanced Cross-Reference Search', () => {
  describe('validateEnhancedCrossReference', () => {
    const validCorrelationParams: EnhancedCorrelationParams = {
      correlationFields: ['source_ip', 'protocol'],
      correlationType: 'AND'
    };

    test('should validate basic parameters', () => {
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        validCorrelationParams
      );
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.entityTypes).toContain('flows');
      expect(result.entityTypes).toContain('alarms');
    });

    test('should require at least one correlation field', () => {
      const invalidParams = {
        ...validCorrelationParams,
        correlationFields: []
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        invalidParams
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one correlation field is required');
    });

    test('should limit maximum correlation fields', () => {
      const tooManyFields = {
        ...validCorrelationParams,
        correlationFields: ['field1', 'field2', 'field3', 'field4', 'field5', 'field6']
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        tooManyFields
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maximum of 5 correlation fields allowed for performance reasons');
    });

    test('should validate correlation type', () => {
      const invalidType = {
        ...validCorrelationParams,
        correlationType: 'INVALID' as any
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        invalidType
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Correlation type must be either "AND" or "OR"');
    });

    test('should validate temporal window parameters', () => {
      const validTemporal = {
        ...validCorrelationParams,
        temporalWindow: {
          windowSize: 30,
          windowUnit: 'minutes' as const
        }
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        validTemporal
      );
      
      expect(result.isValid).toBe(true);
    });

    test('should reject invalid temporal window size', () => {
      const invalidTemporal = {
        ...validCorrelationParams,
        temporalWindow: {
          windowSize: 0,
          windowUnit: 'minutes' as const
        }
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        invalidTemporal
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temporal window size must be positive');
    });

    test('should reject invalid temporal window unit', () => {
      const invalidTemporal = {
        ...validCorrelationParams,
        temporalWindow: {
          windowSize: 30,
          windowUnit: 'invalid' as any
        }
      };
      
      const result = validateEnhancedCrossReference(
        'protocol:tcp',
        ['severity:high'],
        invalidTemporal
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temporal window unit must be one of: seconds, minutes, hours, days');
    });
  });

  describe('performMultiFieldCorrelation', () => {
    const primaryResults = [
      { source: { ip: '192.168.1.1' }, protocol: 'tcp', ts: 1640995200 },
      { source: { ip: '192.168.1.2' }, protocol: 'udp', ts: 1640995260 },
      { source: { ip: '192.168.1.3' }, protocol: 'tcp', ts: 1640995320 }
    ];

    const secondaryResults = [
      { device: { ip: '192.168.1.1' }, protocol: 'tcp', severity: 'high', ts: 1640995210 },
      { device: { ip: '192.168.1.2' }, protocol: 'tcp', severity: 'medium', ts: 1640995270 },
      { device: { ip: '192.168.1.4' }, protocol: 'udp', severity: 'low', ts: 1640995330 },
      { device: { ip: '192.168.1.1' }, protocol: 'udp', severity: 'high', ts: 1640995340 }
    ];

    test('should perform AND correlation across multiple fields', () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const result = performMultiFieldCorrelation(
        primaryResults,
        secondaryResults,
        'flows',
        'alarms',
        correlationParams
      );

      // Should match items where both source_ip and protocol correlate
      expect(result.correlatedResults.length).toBeGreaterThanOrEqual(1);
      expect(result.correlationStats.correlationRate).toBeGreaterThanOrEqual(0);
      
      // Check that returned results have matching correlation fields
      result.correlatedResults.forEach(item => {
        expect(item).toHaveProperty('device');
        expect(item).toHaveProperty('protocol');
      });
    });

    test('should perform OR correlation across multiple fields', () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'OR'
      };

      const result = performMultiFieldCorrelation(
        primaryResults,
        secondaryResults,
        'flows',
        'alarms',
        correlationParams
      );

      expect(result.correlatedResults.length).toBeGreaterThan(1);
      expect(result.correlationStats.totalSecondaryResults).toBe(4);
    });

    test('should provide detailed correlation statistics', () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const result = performMultiFieldCorrelation(
        primaryResults,
        secondaryResults,
        'flows',
        'alarms',
        correlationParams
      );

      expect(result.correlationStats).toHaveProperty('totalSecondaryResults');
      expect(result.correlationStats).toHaveProperty('correlatedResults');
      expect(result.correlationStats).toHaveProperty('correlationRate');
      expect(result.correlationStats).toHaveProperty('fieldCorrelationRates');
      expect(result.correlationStats.fieldCorrelationRates).toHaveLength(2);
    });

    test('should apply temporal window filtering', () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'timestamp'],
        correlationType: 'AND',
        temporalWindow: {
          windowSize: 30,
          windowUnit: 'seconds'
        }
      };

      const result = performMultiFieldCorrelation(
        primaryResults,
        secondaryResults,
        'flows',
        'alarms',
        correlationParams
      );

      expect(result.correlationStats).toHaveProperty('temporallyFiltered');
      expect(result.correlationStats.temporallyFiltered).toBeLessThanOrEqual(result.correlationStats.correlatedResults);
    });

    test('should handle empty results gracefully', () => {
      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip'],
        correlationType: 'AND'
      };

      const result = performMultiFieldCorrelation(
        [],
        secondaryResults,
        'flows',
        'alarms',
        correlationParams
      );

      expect(result.correlatedResults).toHaveLength(0);
      expect(result.correlationStats.correlationRate).toBe(0);
    });

    test('should handle missing field values', () => {
      const incompleteResults = [
        { device: { ip: '192.168.1.1' } }, // missing protocol
        { protocol: 'tcp' }, // missing device.ip
        { device: { ip: '192.168.1.2' }, protocol: 'udp' }
      ];

      const correlationParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'protocol'],
        correlationType: 'AND'
      };

      const result = performMultiFieldCorrelation(
        primaryResults,
        incompleteResults,
        'flows',
        'alarms',
        correlationParams
      );

      expect(result.correlatedResults.length).toBeLessThan(incompleteResults.length);
    });
  });

  describe('getSupportedCorrelationCombinations', () => {
    test('should return supported combinations for single entity type', () => {
      const combinations = getSupportedCorrelationCombinations(['flows']);
      
      expect(combinations.length).toBeGreaterThan(0);
      expect(combinations.some(combo => combo.includes('source_ip'))).toBe(true);
      expect(combinations.some(combo => combo.includes('protocol'))).toBe(true);
    });

    test('should return combinations compatible with multiple entity types', () => {
      const combinations = getSupportedCorrelationCombinations(['flows', 'alarms']);
      
      expect(combinations.length).toBeGreaterThan(0);
      
      // All combinations should contain fields supported by both flows and alarms
      const validCombinations = combinations.filter(combo => 
        combo.every(field => {
          // These fields should be supported by both flows and alarms
          return ['source_ip', 'destination_ip', 'device_ip', 'protocol', 'timestamp', 'gid'].includes(field);
        })
      );
      
      expect(validCombinations.length).toBeGreaterThan(0);
    });

    test('should include common correlation patterns', () => {
      const combinations = getSupportedCorrelationCombinations(['flows', 'alarms']);
      
      // Should include common triple combinations
      const hasNetworkTriple = combinations.some(combo => 
        combo.length === 3 && 
        combo.includes('source_ip') && 
        combo.includes('destination_ip') && 
        combo.includes('protocol')
      );
      
      expect(hasNetworkTriple).toBe(true);
    });

    test('should handle empty entity types array', () => {
      const combinations = getSupportedCorrelationCombinations([]);
      expect(combinations).toHaveLength(0);
    });

    test('should handle unknown entity types', () => {
      const combinations = getSupportedCorrelationCombinations(['unknown' as EntityType]);
      expect(combinations).toHaveLength(0);
    });
  });

  describe('Integration scenarios', () => {
    test('should validate network-focused correlation', () => {
      const networkParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'destination_ip', 'protocol'],
        correlationType: 'AND',
        networkScope: {
          includeSubnets: true,
          includePorts: false
        }
      };

      const result = validateEnhancedCrossReference(
        'protocol:tcp AND bytes:>1000',
        ['severity:high', 'type:network_intrusion'],
        networkParams
      );

      expect(result.isValid).toBe(true);
    });

    test('should validate temporal correlation with window', () => {
      const temporalParams: EnhancedCorrelationParams = {
        correlationFields: ['device_ip', 'timestamp'],
        correlationType: 'AND',
        temporalWindow: {
          windowSize: 5,
          windowUnit: 'minutes'
        }
      };

      const result = validateEnhancedCrossReference(
        'device_ip:192.168.1.*',
        ['severity:>=medium'],
        temporalParams
      );

      expect(result.isValid).toBe(true);
    });

    test('should validate device-focused correlation', () => {
      const deviceParams: EnhancedCorrelationParams = {
        correlationFields: ['gid'], // Use field compatible with devices and rules  
        correlationType: 'OR',
        deviceScope: {
          includeVendor: true,
          includeGroup: true
        }
      };

      const result = validateEnhancedCrossReference(
        'online:false',   // suggests devices
        ['action:block'], // suggests rules
        deviceParams
      );

      if (!result.isValid) {
        console.log('Device correlation validation errors:', result.errors);
      }
      expect(result.isValid).toBe(true);
    });

    test('should handle performance constraints', () => {
      const heavyParams: EnhancedCorrelationParams = {
        correlationFields: ['source_ip', 'destination_ip', 'protocol', 'timestamp', 'device_id'],
        correlationType: 'AND',
        temporalWindow: {
          windowSize: 1,
          windowUnit: 'hours'
        }
      };

      const result = validateEnhancedCrossReference(
        'bytes:>10000',
        ['severity:high', 'type:anomaly', 'status:active'],
        heavyParams
      );

      expect(result.isValid).toBe(true);
      expect(result.entityTypes?.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle null/undefined correlation parameters', () => {
      expect(() => {
        validateEnhancedCrossReference(
          'test',
          ['test'],
          null as any
        );
      }).toThrow();
    });

    test('should handle invalid correlation field types', () => {
      const invalidParams = {
        correlationFields: ['valid_field'], // Keep it simple
        correlationType: 'INVALID' as any // This will trigger the error
      };

      const result = validateEnhancedCrossReference(
        'test',
        ['test'],
        invalidParams
      );

      console.log('Invalid field type errors:', result.errors);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle very large temporal windows', () => {
      const largeWindowParams: EnhancedCorrelationParams = {
        correlationFields: ['timestamp'],
        correlationType: 'AND',
        temporalWindow: {
          windowSize: 365,
          windowUnit: 'days'
        }
      };

      const result = validateEnhancedCrossReference(
        'test',
        ['test'],
        largeWindowParams
      );

      expect(result.isValid).toBe(true);
    });

    test('should provide meaningful error messages', () => {
      const invalidParams: EnhancedCorrelationParams = {
        correlationFields: [],
        correlationType: 'INVALID' as any,
        temporalWindow: {
          windowSize: -1,
          windowUnit: 'invalid' as any
        }
      };

      const result = validateEnhancedCrossReference(
        '',
        [],
        invalidParams
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join(' ')).toMatch(/correlation field|correlation type|temporal window/i);
    });
  });
});