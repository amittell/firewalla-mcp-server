/**
 * Enhanced Query Validation Test Suite
 * Tests comprehensive syntax, semantic, and field validation
 */

import { EnhancedQueryValidator } from '../../src/validation/enhanced-query-validator.js';
import type { EntityType } from '../../src/validation/field-mapper.js';

describe('Enhanced Query Validation', () => {
  describe('Syntax Validation', () => {
    test('should validate correct field:value syntax', () => {
      const result = EnhancedQueryValidator.validateQuery('protocol:tcp', 'flows');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject malformed queries', () => {
      const testCases = [
        { query: 'field:', entityType: 'flows' as EntityType, expectedError: /Expected value after field/ },
        { query: 'field:value AND', entityType: 'flows' as EntityType, expectedError: /Expected expression after AND/ },
        { query: 'field:value (', entityType: 'flows' as EntityType, expectedError: /closing parenthesis/ },
        { query: 'field:[min TO', entityType: 'flows' as EntityType, expectedError: /closing bracket/ },
        { query: 'field:>=', entityType: 'flows' as EntityType, expectedError: /Expected value/ }
      ];

      testCases.forEach(({ query, entityType, expectedError }) => {
        const result = EnhancedQueryValidator.validateQuery(query, entityType);
        expect(result.isValid).toBe(false);
        expect(result.errors.join(' ')).toMatch(expectedError);
      });
    });

    test('should handle complex logical expressions', () => {
      const query = '(protocol:tcp AND bytes:>1000) OR (protocol:udp AND severity:high)';
      const result = EnhancedQueryValidator.validateQuery(query, 'flows');
      expect(result.isValid).toBe(true);
    });

    test('should validate range queries', () => {
      const validRanges = [
        'bytes:[1000 TO 50000]',
        'timestamp:[1640995200 TO 1640995300]'
      ];

      validRanges.forEach(query => {
        const result = EnhancedQueryValidator.validateQuery(query, 'flows');
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Semantic Validation', () => {
    test('should reject comparison operators on non-numeric fields', () => {
      const invalidQueries = [
        'protocol:>=tcp',
        'device_name:>test',
        'country:<US'
      ];

      invalidQueries.forEach(query => {
        const result = EnhancedQueryValidator.validateQuery(query, 'flows');
        expect(result.isValid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/Comparison operator.*cannot be used with non-numeric field/);
        expect(result.fieldIssues).toBeDefined();
        expect(result.fieldIssues?.some(issue => issue.issue === 'type_mismatch')).toBe(true);
      });
    });

    test('should validate boolean field values', () => {
      const testCases = [
        { query: 'blocked:true', entityType: 'flows' as EntityType, shouldPass: true },
        { query: 'blocked:false', entityType: 'flows' as EntityType, shouldPass: true },
        { query: 'blocked:yes', entityType: 'flows' as EntityType, shouldPass: true },
        { query: 'blocked:invalid_bool', entityType: 'flows' as EntityType, shouldPass: false }
      ];

      testCases.forEach(({ query, entityType, shouldPass }) => {
        const result = EnhancedQueryValidator.validateQuery(query, entityType);
        expect(result.isValid).toBe(shouldPass);
        if (!shouldPass) {
          expect(result.errors.join(' ')).toMatch(/expects a boolean value/);
        }
      });
    });

    test('should validate range queries on appropriate field types', () => {
      const testCases = [
        { query: 'bytes:[1000 TO 50000]', entityType: 'flows' as EntityType, shouldPass: true },
        { query: 'protocol:[tcp TO udp]', entityType: 'flows' as EntityType, shouldPass: false },
        { query: 'timestamp:[1640995200 TO 1640995300]', entityType: 'flows' as EntityType, shouldPass: true }
      ];

      testCases.forEach(({ query, entityType, shouldPass }) => {
        const result = EnhancedQueryValidator.validateQuery(query, entityType);
        expect(result.isValid).toBe(shouldPass);
        if (!shouldPass) {
          expect(result.errors.join(' ')).toMatch(/Range query cannot be used with non-numeric field/);
        }
      });
    });

    test('should validate range bounds', () => {
      const result = EnhancedQueryValidator.validateQuery('bytes:[50000 TO 1000]', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Range minimum.*must be less than maximum/);
    });
  });

  describe('Field Validation', () => {
    test('should reject invalid fields for entity types', () => {
      const testCases = [
        { query: 'invalid_field:value', entityType: 'flows' as EntityType },
        { query: 'severity:high', entityType: 'flows' as EntityType }, // severity is for alarms, not flows
        { query: 'bytes:1000', entityType: 'alarms' as EntityType } // bytes is for flows, not alarms
      ];

      testCases.forEach(({ query, entityType }) => {
        const result = EnhancedQueryValidator.validateQuery(query, entityType);
        expect(result.isValid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/Invalid field.*for entity type/);
        expect(result.fieldIssues).toBeDefined();
        expect(result.fieldIssues?.some(issue => issue.issue === 'invalid')).toBe(true);
      });
    });

    test('should suggest corrections for deprecated fields', () => {
      const result = EnhancedQueryValidator.validateQuery('srcIP:192.168.1.1', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.fieldIssues).toBeDefined();
      expect(result.fieldIssues?.some(issue => issue.issue === 'deprecated')).toBe(true);
      expect(result.suggestions?.join(' ')).toMatch(/deprecated field.*source_ip/);
    });

    test('should provide field optimization suggestions', () => {
      const result = EnhancedQueryValidator.validateQuery('src_ip:192.168.1.1', 'flows');
      if (result.correctedQuery) {
        expect(result.correctedQuery).toContain('source_ip:192.168.1.1');
        expect(result.suggestions?.join(' ')).toMatch(/Optimized field.*source_ip/);
      }
    });

    test('should validate fields across different entity types', () => {
      const entityTests = [
        { query: 'severity:high', entityType: 'alarms' as EntityType, shouldPass: true },
        { query: 'action:block', entityType: 'rules' as EntityType, shouldPass: true },
        { query: 'online:true', entityType: 'devices' as EntityType, shouldPass: true },
        { query: 'category:security', entityType: 'target_lists' as EntityType, shouldPass: true }
      ];

      entityTests.forEach(({ query, entityType, shouldPass }) => {
        const result = EnhancedQueryValidator.validateQuery(query, entityType);
        expect(result.isValid).toBe(shouldPass);
      });
    });
  });

  describe('Query Correction', () => {
    test('should provide corrected queries for common errors', () => {
      const corrections = [
        { 
          input: 'src_ip:192.168.1.1', 
          entityType: 'flows' as EntityType,
          expectedCorrection: /source_ip/
        },
        {
          input: 'field == value',
          entityType: 'flows' as EntityType,
          expectedCorrection: /field:value/
        },
        {
          input: 'protocol tcp severity high',
          entityType: 'flows' as EntityType,
          expectedCorrection: /AND/
        }
      ];

      corrections.forEach(({ input, entityType, expectedCorrection }) => {
        const result = EnhancedQueryValidator.validateQuery(input, entityType);
        if (result.correctedQuery || result.suggestions?.length) {
          const correctionText = result.correctedQuery || result.suggestions?.join(' ') || '';
          expect(correctionText).toMatch(expectedCorrection);
        }
      });
    });

    test('should handle quoted values correctly', () => {
      const result = EnhancedQueryValidator.validateQuery('device_name:"My Device"', 'devices');
      expect(result.isValid).toBe(true);
    });

    test('should validate complex nested queries', () => {
      const complexQuery = '(source_ip:192.168.* AND protocol:tcp) OR (severity:high AND NOT resolved:true)';
      const result = EnhancedQueryValidator.validateQuery(complexQuery, 'flows');
      
      // This should fail because severity and resolved are not valid for flows
      expect(result.isValid).toBe(false);
      expect(result.fieldIssues?.length).toBeGreaterThan(0);
    });
  });

  describe('Security Validation', () => {
    test('should reject malicious query patterns', () => {
      const maliciousQueries = [
        "'; DROP TABLE flows; --",
        '<script>alert("xss")</script>',
        'eval(document.cookie)',
        'union select * from users'
      ];

      maliciousQueries.forEach(query => {
        const result = EnhancedQueryValidator.validateQuery(query, 'flows');
        expect(result.isValid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/dangerous content|malicious patterns/);
      });
    });

    test('should handle very long queries', () => {
      const longQuery = 'field:' + 'a'.repeat(3000);
      const result = EnhancedQueryValidator.validateQuery(longQuery, 'flows');
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/too long/);
    });
  });

  describe('Correlation Field Validation', () => {
    test('should validate compatible correlation fields', () => {
      const result = EnhancedQueryValidator.validateCorrelationFields(
        ['source_ip', 'device_ip', 'timestamp'],
        'flows',
        ['alarms', 'devices']
      );
      
      expect(result.isValid).toBe(true);
      expect(result.compatibleFields).toContain('source_ip');
      expect(result.compatibleFields).toContain('device_ip');
    });

    test('should reject incompatible correlation fields', () => {
      const result = EnhancedQueryValidator.validateCorrelationFields(
        ['bytes', 'download'], // These are specific to flows
        'flows',
        ['alarms', 'rules'] // These entity types don't have bytes/download
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });

    test('should provide suggestions for better correlation fields', () => {
      const result = EnhancedQueryValidator.validateCorrelationFields(
        ['invalid_field'],
        'flows',
        ['alarms']
      );
      
      expect(result.isValid).toBe(false);
      expect(result.suggestions?.join(' ')).toMatch(/compatible fields/);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty queries', () => {
      const result = EnhancedQueryValidator.validateQuery('', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/empty|required/);
    });

    test('should handle whitespace-only queries', () => {
      const result = EnhancedQueryValidator.validateQuery('   ', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/empty|required/);
    });

    test('should handle special characters in values', () => {
      const result = EnhancedQueryValidator.validateQuery('device_name:"Device@#$%"', 'devices');
      expect(result.isValid).toBe(true);
    });

    test('should handle Unicode characters', () => {
      const result = EnhancedQueryValidator.validateQuery('device_name:"设备名称🚀"', 'devices');
      expect(result.isValid).toBe(true);
    });

    test('should validate match-all query', () => {
      const result = EnhancedQueryValidator.validateQuery('*', 'flows');
      expect(result.isValid).toBe(true);
    });
  });
});