import { BooleanFieldTranslator } from '../../src/search/boolean-field-translator.js';

describe('BooleanFieldTranslator - coverage completion', () => {
  describe('translateQuery - missing coverage', () => {
    // Cover line 100 - the equals pattern replacement callback
    it('should translate equals syntax with callback coverage', () => {
      const query = 'blocked=true AND allowed=false';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 AND allowed:0');
    });

    // Cover lines 127-128 - standalone pattern replacement
    it('should translate standalone boolean fields', () => {
      const query = 'blocked AND protocol:tcp';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 AND protocol:tcp');
    });

    it('should handle multiple standalone fields', () => {
      const query = 'blocked OR allowed';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 OR allowed:1');
    });
  });

  describe('needsTranslation - missing coverage', () => {
    // Cover line 144 - early return for invalid input
    it('should return false for null input', () => {
      expect(BooleanFieldTranslator.needsTranslation(null as any, 'flows')).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(BooleanFieldTranslator.needsTranslation(undefined as any, 'flows')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(BooleanFieldTranslator.needsTranslation(123 as any, 'flows')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(BooleanFieldTranslator.needsTranslation('', 'flows')).toBe(false);
    });
  });

  describe('getAlternativeTranslations - missing coverage', () => {
    // Cover line 187 - early return when no config
    it('should return original query for unknown entity type', () => {
      const query = 'blocked:true';
      const result = BooleanFieldTranslator.getAlternativeTranslations(query, 'unknown');
      expect(result).toEqual([query]);
    });

    // Cover line 211 - the condition for adding lowercase alternatives
    it('should add lowercase alternative when query has uppercase boolean values', () => {
      const query = 'blocked:TRUE AND allowed:FALSE';
      const result = BooleanFieldTranslator.getAlternativeTranslations(query, 'flows');
      
      // Should contain the translated version, original, and lowercase version
      expect(result).toContain('blocked:1 AND allowed:0'); // translated
      expect(result).toContain(query); // original
      expect(result).toContain('blocked:true AND allowed:false'); // lowercase
    });

    it('should not duplicate lowercase alternative if already lowercase', () => {
      const query = 'blocked:true';
      const result = BooleanFieldTranslator.getAlternativeTranslations(query, 'flows');
      
      // Count occurrences of the original query
      const originalCount = result.filter(q => q === query).length;
      expect(originalCount).toBe(1); // Should only appear once
    });
  });

  // Additional edge cases to ensure robustness
  describe('edge cases', () => {
    it('should handle query with no boolean fields', () => {
      const query = 'protocol:tcp AND port:443';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe(query); // Should remain unchanged
    });

    it('should not translate fields that are part of other words', () => {
      const query = 'allowedlist:something AND blocked:true';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('allowedlist:something AND blocked:1');
    });

    it('should handle standalone fields at various positions', () => {
      const query = 'allowed AND blocked OR encrypted';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('allowed:1 AND blocked:1 OR encrypted:1');
    });
  });
});