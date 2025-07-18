import { FieldValidator } from '../../src/validation/field-validator.js';
import { SEARCH_FIELDS } from '../../src/search/types.js';

describe('FieldValidator', () => {
  describe('validateField', () => {
    it('should validate exact field matches', () => {
      const result = FieldValidator.validateField('source_ip', 'flows');
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.error).toBeUndefined();
    });

    it('should handle invalid field names', () => {
      const result = FieldValidator.validateField('invalid_field', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('is not valid for flows');
      expect(result.suggestion).toBeDefined();
      expect(result.validFields).toBeDefined();
    });

    it('should provide alias suggestions', () => {
      const result = FieldValidator.validateField('srcIP', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toContain('source_ip');
      expect(result.suggestion).toContain('alias');
      expect(result.validFields).toEqual(['source_ip']);
    });

    it('should provide fuzzy match suggestions', () => {
      const result = FieldValidator.validateField('sourc_ip', 'flows'); // Typo
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toContain('source_ip');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should handle empty or invalid input', () => {
      let result = FieldValidator.validateField('', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('non-empty string');

      result = FieldValidator.validateField(null as any, 'flows');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('non-empty string');

      result = FieldValidator.validateField(123 as any, 'flows');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should handle invalid entity types', () => {
      const result = FieldValidator.validateField('source_ip', 'invalid_type' as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid entity type');
      expect(result.suggestion).toContain('Valid entity types');
    });

    it('should provide general suggestions when no close match', () => {
      const result = FieldValidator.validateField('xyz123', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toContain('Valid fields include');
      expect(result.validFields).toBeDefined();
      expect(result.validFields!.length).toBeLessThanOrEqual(5);
    });

    it('should handle fields with low similarity scores', () => {
      // Testing a field that has low similarity to all valid fields
      const result = FieldValidator.validateField('zzz', 'flows');
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toContain('Valid fields include');
      expect(result.confidence).toBeUndefined(); // No confidence for general suggestions
    });
  });

  describe('validateFieldAcrossTypes', () => {
    it('should validate field across multiple entity types', () => {
      const result = FieldValidator.validateFieldAcrossTypes('protocol', ['flows', 'alarms']);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fieldMapping.flows).toContain('protocol');
    });

    it('should handle field valid in some types', () => {
      const result = FieldValidator.validateFieldAcrossTypes('blocked', ['flows', 'alarms']);
      expect(result.isValid).toBe(true); // Valid in flows
      expect(result.fieldMapping.flows).toContain('blocked');
    });

    it('should handle field invalid in all types', () => {
      const result = FieldValidator.validateFieldAcrossTypes('invalid_field', ['flows', 'alarms']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not compatible with entity types');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle empty or invalid input', () => {
      let result = FieldValidator.validateFieldAcrossTypes('', ['flows']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field name must be a non-empty string');

      result = FieldValidator.validateFieldAcrossTypes(null as any, ['flows']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field name must be a non-empty string');
    });

    it('should collect closest matches across types', () => {
      const result = FieldValidator.validateFieldAcrossTypes('sourc_ip', ['flows', 'alarms']);
      expect(result.isValid).toBe(false);
      expect(result.closestMatches.length).toBeGreaterThan(0);
      expect(result.closestMatches[0].field).toBe('source_ip');
      expect(result.closestMatches[0].similarity).toBeGreaterThan(0.4);
    });

    it('should provide cross-type suggestions', () => {
      const result = FieldValidator.validateFieldAcrossTypes('severity_level', ['flows', 'alarms']);
      expect(result.isValid).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Should suggest 'severity' which is valid for alarms
    });

    it('should handle duplicate suggestions', () => {
      const result = FieldValidator.validateFieldAcrossTypes('stat', ['flows', 'alarms', 'rules']);
      expect(result.isValid).toBe(false);
      // Check that suggestions are unique
      const uniqueSuggestions = [...new Set(result.suggestions)];
      expect(result.suggestions.length).toBe(uniqueSuggestions.length);
    });
  });

  describe('generateContextualSuggestions', () => {
    it('should generate suggestions starting with partial string', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('sour', 'flows', 5);
      expect(suggestions).toContain('source_ip');
      expect(suggestions.every(s => s.toLowerCase().includes('sour'))).toBe(true);
    });

    it('should generate suggestions containing partial string', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('ip', 'flows', 10);
      expect(suggestions.some(s => s.includes('ip'))).toBe(true);
    });

    it('should limit suggestions to max count', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('', 'flows', 3);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should handle invalid entity type', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('test', 'invalid' as any, 5);
      expect(suggestions).toEqual([]);
    });

    it('should handle empty partial field', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('', 'flows', 5);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should prioritize starts-with matches over contains matches', () => {
      const suggestions = FieldValidator.generateContextualSuggestions('pro', 'flows', 10);
      const protocolIndex = suggestions.indexOf('protocol');
      expect(protocolIndex).toBe(0); // Should be first since it starts with 'pro'
    });
  });

  describe('isValidFieldAnyType', () => {
    it('should find field valid in any type', () => {
      const result = FieldValidator.isValidFieldAnyType('source_ip');
      expect(result.isValid).toBe(true);
      expect(result.supportedTypes).toContain('flows');
      expect(result.supportedTypes).toContain('alarms');
    });

    it('should handle field not valid in any type', () => {
      const result = FieldValidator.isValidFieldAnyType('invalid_field');
      expect(result.isValid).toBe(false);
      expect(result.supportedTypes).toEqual([]);
    });

    it('should find all supported types for common fields', () => {
      const result = FieldValidator.isValidFieldAnyType('timestamp');
      expect(result.isValid).toBe(true);
      expect(result.supportedTypes.length).toBeGreaterThan(1);
    });
  });

  describe('private methods coverage', () => {
    // Test edge cases for calculateSimilarity
    it('should handle empty strings in similarity calculation', () => {
      const validator = FieldValidator as any;
      expect(validator.calculateSimilarity('', '')).toBe(1); // Both empty
      expect(validator.calculateSimilarity('test', '')).toBeLessThan(1);
      expect(validator.calculateSimilarity('', 'test')).toBeLessThan(1);
    });

    // Test getBestCrossTypeMatches with low similarity threshold
    it('should filter out low similarity matches in cross-type matching', () => {
      const result = FieldValidator.validateFieldAcrossTypes('xyz', ['flows', 'alarms']);
      expect(result.isValid).toBe(false);
      // Matches with similarity <= 0.4 should be filtered out
      expect(result.closestMatches.every(m => m.similarity > 0.4)).toBe(true);
    });

    // Test field weights functionality
    it('should prioritize high-weight fields in suggestions', () => {
      const result = FieldValidator.validateField('random_field', 'flows');
      expect(result.isValid).toBe(false);
      // Check that high-weight fields like source_ip, destination_ip appear in suggestions
      const suggestions = result.validFields || [];
      const highWeightFields = ['source_ip', 'destination_ip', 'protocol'];
      const hasHighWeightField = suggestions.some(field => highWeightFields.includes(field));
      expect(hasHighWeightField).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in field names', () => {
      const result = FieldValidator.validateField('  source_ip  ', 'flows');
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle case sensitivity in aliases', () => {
      const result = FieldValidator.validateField('SRCIP', 'flows');
      expect(result.isValid).toBe(false);
      // Even with different case, should still suggest the alias
      expect(result.suggestion).toContain('source_ip');
    });

    it('should handle very long field names', () => {
      const longFieldName = 'a'.repeat(100);
      const result = FieldValidator.validateField(longFieldName, 'flows');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle special characters in field names', () => {
      const result = FieldValidator.validateField('source-ip', 'flows');
      expect(result.isValid).toBe(false);
      // Should still find source_ip as a close match
      expect(result.suggestion).toBeDefined();
    });
  });
});