/**
 * Comprehensive Query Syntax Validation Tests
 * 
 * Tests all query syntax patterns from the query-syntax-guide documentation including:
 * - Basic field queries and case sensitivity
 * - Logical operators (AND, OR, NOT) with complex nesting
 * - Wildcard patterns and range/comparison operators
 * - Field-specific syntax for flows, alarms, rules, devices
 * - Query validation with field-validator utility
 * - Edge cases: empty queries, malformed syntax, injection attempts
 * - Query optimization and transformation
 */

import { FieldValidator } from '../../src/validation/field-validator.js';
import { QuerySanitizer, ParameterValidator } from '../../src/validation/error-handler.js';
import { SEARCH_FIELDS } from '../../src/search/types.js';

describe('Query Syntax Validation', () => {
  describe('Basic Field Queries', () => {
    it('should validate simple field:value queries', () => {
      const validQueries = [
        'protocol:tcp',
        'severity:high',
        'ip:192.168.1.100',
        'action:block',
        'category:social'
      ];

      validQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitizedValue).toBe(query);
      });
    });

    it('should handle case sensitivity correctly', () => {
      const queries = [
        { query: 'severity:HIGH', expected: 'severity:HIGH' },
        { query: 'protocol:TCP', expected: 'protocol:TCP' },
        { query: 'action:BLOCK', expected: 'action:BLOCK' }
      ];

      queries.forEach(({ query, expected }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(expected);
      });
    });

    it('should reject invalid field names through field validator', () => {
      const invalidFieldTests = [
        { field: 'SEVERITY', entityType: 'flows' as const, shouldContainSuggestion: true },
        { field: 'Protocol', entityType: 'alarms' as const, shouldContainSuggestion: true },
        { field: 'invalid_field', entityType: 'rules' as const, shouldContainSuggestion: false }
      ];

      invalidFieldTests.forEach(({ field, entityType, shouldContainSuggestion }) => {
        const result = FieldValidator.validateField(field, entityType);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain(`Field '${field}' is not valid`);
        
        if (shouldContainSuggestion) {
          expect(result.suggestion).toBeDefined();
        }
      });
    });
  });

  describe('Logical Operators', () => {
    describe('AND Operator', () => {
      it('should validate simple AND queries', () => {
        const queries = [
          'severity:high AND source_ip:192.168.1.*',
          'protocol:tcp AND bytes:>1000000',
          'status:active AND action:block',
          'online:true AND mac_vendor:Apple'
        ];

        queries.forEach(query => {
          const result = QuerySanitizer.sanitizeSearchQuery(query);
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(query);
        });
      });

      it('should normalize whitespace around AND operators', () => {
        const testCases = [
          { input: 'severity:high  AND  source_ip:192.168.*', expected: 'severity:high AND source_ip:192.168.*' },
          { input: 'protocol:tcp\tAND\tbytes:>1000', expected: 'protocol:tcp AND bytes:>1000' },
          { input: 'status:active\nAND\naction:block', expected: 'status:active AND action:block' }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = QuerySanitizer.sanitizeSearchQuery(input);
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(expected);
        });
      });
    });

    describe('OR Operator', () => {
      it('should validate simple OR queries', () => {
        const queries = [
          'severity:high OR severity:critical',
          'protocol:tcp OR protocol:udp',
          'action:block OR action:timelimit',
          'online:false OR activity_level:low'
        ];

        queries.forEach(query => {
          const result = QuerySanitizer.sanitizeSearchQuery(query);
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(query);
        });
      });
    });

    describe('NOT Operator', () => {
      it('should validate NOT queries', () => {
        const queries = [
          'NOT protocol:tcp',
          'NOT blocked:true',
          'NOT mac_vendor:Apple',
          'NOT severity:low'
        ];

        queries.forEach(query => {
          const result = QuerySanitizer.sanitizeSearchQuery(query);
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(query);
        });
      });
    });

    describe('Complex Logical Combinations', () => {
      it('should validate complex nested logical queries', () => {
        const complexQueries = [
          'severity:high AND (protocol:tcp OR protocol:udp) AND NOT source_ip:192.168.*',
          '(blocked:true AND bytes:>10000000) OR severity:critical',
          '(target_value:*facebook* OR target_value:*gaming*) AND NOT category:entertainment',
          '(severity:high OR severity:critical) AND protocol:tcp AND NOT source_ip:192.168.*'
        ];

        complexQueries.forEach(query => {
          const result = QuerySanitizer.sanitizeSearchQuery(query);
          expect(result.isValid).toBe(true);
          expect(result.sanitizedValue).toBe(query);
        });
      });

      it('should detect unmatched parentheses in complex queries', () => {
        const invalidQueries = [
          'severity:high AND (protocol:tcp OR protocol:udp',
          '(blocked:true AND bytes:>10000000 OR severity:critical',
          'target_value:*facebook* OR target_value:*gaming*) AND NOT category:entertainment',
          '((severity:high AND protocol:tcp) OR (action:block AND status:active)'
        ];

        invalidQueries.forEach(query => {
          const result = QuerySanitizer.sanitizeSearchQuery(query);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Unmatched parentheses in query');
        });
      });
    });
  });

  describe('Wildcards and Patterns', () => {
    it('should validate asterisk wildcard patterns', () => {
      const wildcardQueries = [
        'target_value:*facebook*',
        'source_ip:192.168.*',
        'mac_vendor:*Apple*',
        'target_value:*social*',
        'name:*laptop*'
      ];

      wildcardQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(query);
      });
    });

    it('should validate complex pattern combinations', () => {
      const patternQueries = [
        'source_ip:192.168.* OR source_ip:10.*',
        'target_value:*facebook* OR target_value:*twitter* OR target_value:*instagram*',
        'target_value:*gaming* OR target_value:*steam* OR target_value:*xbox*',
        'mac_vendor:*Apple* OR mac_vendor:*Samsung* OR device_type:mobile'
      ];

      patternQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(query);
      });
    });
  });

  describe('Ranges and Comparisons', () => {
    it('should validate comparison operators', () => {
      const comparisonQueries = [
        'bytes:>100000000',
        'bandwidth:>=50000000',
        'timestamp:>1640995200',
        'hit_count:>=100',
        'severity_score:<=3'
      ];

      comparisonQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(query);
      });
    });

    it('should validate range syntax with TO keyword', () => {
      const rangeQueries = [
        'bytes:[1000000 TO 50000000]',
        'timestamp:[1640995200 TO 1641081600]',
        'port:[80 TO 443]',
        'severity_score:[5 TO 8]'
      ];

      rangeQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(query);
      });
    });

    it('should detect unmatched brackets in range queries', () => {
      const invalidRangeQueries = [
        'bytes:[1000000 TO 50000000',
        'timestamp:1640995200 TO 1641081600]',
        'port:[80 TO 443 TO 8080]',
        'severity_score:[5 TO'
      ];

      invalidRangeQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unmatched brackets in query');
      });
    });

    it('should normalize spacing around comparison operators', () => {
      const testCases = [
        { input: 'bytes: > 1000000', expected: 'bytes:>1000000' },
        { input: 'hit_count : >= 100', expected: 'hit_count:>=100' },
        { input: 'severity_score : <= 3', expected: 'severity_score:<=3' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(input);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(expected);
      });
    });
  });

  describe('Field-Specific Syntax Validation', () => {
    describe('Flow Search Fields', () => {
      it('should validate common flow fields', () => {
        const flowFields = [
          'source_ip', 'destination_ip', 'protocol', 'port',
          'bytes', 'download', 'upload', 'duration',
          'blocked', 'direction', 'application', 'device_id',
          'country', 'continent', 'asn', 'is_cloud'
        ];

        flowFields.forEach(field => {
          const result = FieldValidator.validateField(field, 'flows');
          expect(result.isValid).toBe(true);
        });
      });

      it('should suggest alternatives for invalid flow fields', () => {
        const invalidFields = [
          { field: 'srcIP', expectedSuggestion: 'source_ip' },
          { field: 'destIP', expectedSuggestion: 'destination_ip' },
          { field: 'proto', expectedSuggestion: 'protocol' },
          { field: 'size', expectedSuggestion: 'bytes' }
        ];

        invalidFields.forEach(({ field, expectedSuggestion }) => {
          const result = FieldValidator.validateField(field, 'flows');
          expect(result.isValid).toBe(false);
          expect(result.suggestion).toContain(expectedSuggestion);
        });
      });
    });

    describe('Alarm Search Fields', () => {
      it('should validate common alarm fields', () => {
        const alarmFields = [
          'type', 'severity', 'status', 'direction',
          'source_ip', 'remote_ip', 'device_ip',
          'protocol', 'port', 'message',
          'remote_country', 'remote_continent', 'geo_risk_score'
        ];

        alarmFields.forEach(field => {
          const result = FieldValidator.validateField(field, 'alarms');
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('Rule Search Fields', () => {
      it('should validate common rule fields', () => {
        const ruleFields = [
          'id', 'name', 'description',
          'action', 'direction', 'status',
          'target_type', 'target_value', 'category',
          'hit_count', 'last_hit', 'enabled'
        ];

        ruleFields.forEach(field => {
          const result = FieldValidator.validateField(field, 'rules');
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('Device Search Fields', () => {
      it('should validate common device fields', () => {
        const deviceFields = [
          'id', 'name', 'ip', 'mac',
          'online', 'device_type', 'mac_vendor', 'os',
          'last_seen', 'bandwidth_usage', 'connection_count'
        ];

        deviceFields.forEach(field => {
          const result = FieldValidator.validateField(field, 'devices');
          expect(result.isValid).toBe(true);
        });
      });
    });
  });

  describe('Query Validation Edge Cases', () => {
    it('should reject empty or null queries', () => {
      const invalidQueries = ['', '   ', null, undefined];

      invalidQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query as any);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should detect SQL injection patterns', () => {
      const sqlInjectionQueries = [
        "severity:high; DROP TABLE flows; --",
        "source_ip:192.168.1.1' OR 1=1 --",
        "protocol:tcp UNION SELECT * FROM users",
        "action:block'; DELETE FROM rules; --"
      ];

      sqlInjectionQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Query contains potentially dangerous content');
      });
    });

    it('should detect script injection patterns', () => {
      const scriptInjectionQueries = [
        'severity:<script>alert("xss")</script>',
        'source_ip:javascript:alert(1)',
        'name:<iframe src="malicious.com"></iframe>',
        'description:eval("malicious code")'
      ];

      scriptInjectionQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Query contains potentially dangerous content');
      });
    });

    it('should detect template injection patterns', () => {
      const templateInjectionQueries = [
        'name:${malicious.code}',
        'description:{{constructor.constructor("alert(1)")()}}',
        'target_value:<%=system("rm -rf /")%>'
      ];

      templateInjectionQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Query contains potentially dangerous content');
      });
    });

    it('should reject queries with unmatched quotes', () => {
      const unmatchedQuoteQueries = [
        'name:"Johns iPhone',
        "description:'Block social media",
        'target_value:"facebook.com\' AND severity:high'
      ];

      unmatchedQuoteQueries.forEach(query => {
        const result = QuerySanitizer.sanitizeSearchQuery(query);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('Unmatched single quotes') || 
          error.includes('Unmatched double quotes')
        )).toBe(true);
      });
    });

    it('should reject queries that are too long', () => {
      const longQuery = 'severity:high AND '.repeat(200) + 'protocol:tcp';
      
      const result = QuerySanitizer.sanitizeSearchQuery(longQuery);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query is too long (maximum 2000 characters)');
    });

    it('should detect excessive nesting', () => {
      const deeplyNestedQuery = '('.repeat(15) + 'severity:high' + ')'.repeat(15);
      
      const result = QuerySanitizer.sanitizeSearchQuery(deeplyNestedQuery);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query nesting too deep (maximum 10 levels)');
    });

    it('should detect control characters', () => {
      const controlCharQuery = 'severity:high\x00AND\x01protocol:tcp';
      
      const result = QuerySanitizer.sanitizeSearchQuery(controlCharQuery);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query contains control characters');
    });
  });

  describe('Query Optimization and Transformation', () => {
    it('should normalize whitespace consistently', () => {
      const testCases = [
        {
          input: 'severity:high    AND     protocol:tcp',
          expected: 'severity:high AND protocol:tcp'
        },
        {
          input: 'bytes : > 1000000   OR   action : block',
          expected: 'bytes:>1000000 OR action:block'
        },
        {
          input: 'source_ip : 192.168.* \t AND \n NOT \r blocked : true',
          expected: 'source_ip:192.168.* AND NOT blocked:true'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(input);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(expected);
      });
    });

    it('should normalize logical operators case and spacing', () => {
      const testCases = [
        {
          input: 'severity:high and protocol:tcp',
          expected: 'severity:high and protocol:tcp'
        },
        {
          input: 'bytes:>1000 or action:block',
          expected: 'bytes:>1000 or action:block'
        },
        {
          input: 'not blocked:true and severity:high',
          expected: 'not blocked:true and severity:high'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(input);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(expected);
      });
    });

    it('should remove excessive spaces around colons and operators', () => {
      const testCases = [
        {
          input: 'severity : high AND protocol : tcp',
          expected: 'severity:high AND protocol:tcp'
        },
        {
          input: 'bytes : > = 1000000',
          expected: 'bytes:>=1000000'
        },
        {
          input: 'hit_count : < = 100 OR status : active',
          expected: 'hit_count:<=100 OR status:active'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = QuerySanitizer.sanitizeSearchQuery(input);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(expected);
      });
    });
  });

  describe('Cross-Entity Field Validation', () => {
    it('should validate fields across multiple entity types', () => {
      const commonFields = ['timestamp', 'status', 'protocol'];
      const entityTypes = ['flows', 'alarms', 'rules', 'devices'] as const;

      commonFields.forEach(field => {
        const result = FieldValidator.validateFieldAcrossTypes(field, entityTypes);
        expect(result.isValid).toBe(true);
        expect(Object.keys(result.fieldMapping).length).toBeGreaterThan(0);
      });
    });

    it('should provide cross-type suggestions for invalid fields', () => {
      const field = 'invalid_cross_field';
      const entityTypes = ['flows', 'alarms'] as const;

      const result = FieldValidator.validateFieldAcrossTypes(field, entityTypes);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.closestMatches.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle field aliases correctly', () => {
      const aliasTests = [
        { field: 'srcIP', entityTypes: ['flows'] as const, shouldSuggest: 'source_ip' },
        { field: 'proto', entityTypes: ['flows', 'alarms'] as const, shouldSuggest: 'protocol' },
        { field: 'size', entityTypes: ['flows'] as const, shouldSuggest: 'bytes' }
      ];

      aliasTests.forEach(({ field, entityTypes, shouldSuggest }) => {
        const result = FieldValidator.validateFieldAcrossTypes(field, entityTypes);
        expect(result.isValid).toBe(false);
        expect(result.suggestions.some(suggestion => 
          suggestion.includes(shouldSuggest)
        )).toBe(true);
      });
    });
  });

  describe('Contextual Field Suggestions', () => {
    it('should generate contextual suggestions for partial field names', () => {
      const partialFieldTests = [
        { partial: 'sever', entityType: 'alarms' as const, expectedSuggestions: ['severity'] },
        { partial: 'prot', entityType: 'flows' as const, expectedSuggestions: ['protocol'] },
        { partial: 'sourc', entityType: 'flows' as const, expectedSuggestions: ['source_ip'] },
        { partial: 'targ', entityType: 'rules' as const, expectedSuggestions: ['target_type', 'target_value'] }
      ];

      partialFieldTests.forEach(({ partial, entityType, expectedSuggestions }) => {
        const suggestions = FieldValidator.generateContextualSuggestions(partial, entityType, 10);
        
        expectedSuggestions.forEach(expected => {
          expect(suggestions).toContain(expected);
        });
      });
    });

    it('should prioritize prefix matches over contains matches', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('tar', 'rules', 10);
      
      // target_type and target_value should come before any fields that just contain 'tar'
      const prefixMatches = suggestions.filter(s => s.startsWith('tar'));
      const containsMatches = suggestions.filter(s => s.includes('tar') && !s.startsWith('tar'));
      
      expect(prefixMatches.length).toBeGreaterThan(0);
      
      // Check order - all prefix matches should come before contains matches
      const firstContainsIndex = suggestions.findIndex(s => 
        s.includes('tar') && !s.startsWith('tar')
      );
      const lastPrefixIndex = suggestions.lastIndexOf(
        suggestions.find(s => s.startsWith('tar')) || ''
      );
      
      if (firstContainsIndex !== -1 && lastPrefixIndex !== -1) {
        expect(lastPrefixIndex).toBeLessThan(firstContainsIndex);
      }
    });
  });

  describe('Parameter Validation Integration', () => {
    it('should validate numeric parameters with contextual error messages', () => {
      const tests = [
        {
          value: -1,
          paramName: 'limit',
          options: { required: true, min: 1, max: 10000 },
          expectedError: 'limit must be a positive number'
        },
        {
          value: 15000,
          paramName: 'limit',
          options: { required: true, min: 1, max: 10000 },
          expectedError: 'limit exceeds system limits'
        },
        {
          value: 3.14,
          paramName: 'duration',
          options: { required: true, integer: true, min: 1, max: 1440 },
          expectedError: 'duration must be an integer'
        }
      ];

      tests.forEach(({ value, paramName, options, expectedError }) => {
        const result = ParameterValidator.validateNumber(value, paramName, options);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain(expectedError);
      });
    });

    it('should provide contextual boundary messages', () => {
      const limitResult = ParameterValidator.validateNumber(-5, 'limit', { 
        required: true, 
        min: 1, 
        max: 10000 
      });
      
      expect(limitResult.isValid).toBe(false);
      expect(limitResult.errors[0]).toContain('to control result set size');
    });

    it('should validate enum parameters with suggestions', () => {
      const validEnums = ['high', 'medium', 'low', 'critical'];
      
      const result = ParameterValidator.validateEnum(
        'invalid',
        'severity',
        validEnums,
        true
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must be one of');
      expect(result.errors[0]).toContain(validEnums.join(', '));
    });
  });
});