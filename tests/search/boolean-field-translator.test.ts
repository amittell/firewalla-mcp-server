/**
 * Unit tests for Boolean Field Translator
 */

import { BooleanFieldTranslator } from '../../src/search/boolean-field-translator.js';

describe('BooleanFieldTranslator', () => {
  describe('translateQuery', () => {
    it('should translate boolean fields for flows', () => {
      const query = 'blocked:true AND protocol:tcp';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 AND protocol:tcp');
    });

    it('should translate boolean fields for alarms', () => {
      const query = 'resolved:false AND severity:high';
      const result = BooleanFieldTranslator.translateQuery(query, 'alarms');
      expect(result).toBe('resolved:0 AND severity:high');
    });

    it('should handle multiple boolean fields', () => {
      const query = 'blocked:true AND allowed:false AND encrypted:true';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 AND allowed:0 AND encrypted:1');
    });

    it('should handle case-insensitive boolean values', () => {
      const query = 'blocked:TRUE AND allowed:False';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('blocked:1 AND allowed:0');
    });

    it('should not modify non-boolean fields', () => {
      const query = 'protocol:tcp AND source_ip:192.168.1.1';
      const result = BooleanFieldTranslator.translateQuery(query, 'flows');
      expect(result).toBe('protocol:tcp AND source_ip:192.168.1.1');
    });

    it('should handle unknown entity types gracefully', () => {
      const query = 'blocked:true AND protocol:tcp';
      const result = BooleanFieldTranslator.translateQuery(query, 'unknown');
      expect(result).toBe('blocked:true AND protocol:tcp');
    });

    it('should handle empty or invalid queries', () => {
      expect(BooleanFieldTranslator.translateQuery('', 'flows')).toBe('');
      expect(BooleanFieldTranslator.translateQuery(null as any, 'flows')).toBe(null);
      expect(BooleanFieldTranslator.translateQuery(undefined as any, 'flows')).toBe(undefined);
    });
  });

  describe('needsTranslation', () => {
    it('should detect when translation is needed', () => {
      expect(BooleanFieldTranslator.needsTranslation('blocked:true', 'flows')).toBe(true);
      expect(BooleanFieldTranslator.needsTranslation('resolved:false', 'alarms')).toBe(true);
      expect(BooleanFieldTranslator.needsTranslation('active:true AND paused:false', 'rules')).toBe(true);
    });

    it('should detect when translation is not needed', () => {
      expect(BooleanFieldTranslator.needsTranslation('protocol:tcp', 'flows')).toBe(false);
      expect(BooleanFieldTranslator.needsTranslation('severity:high', 'alarms')).toBe(false);
      expect(BooleanFieldTranslator.needsTranslation('action:block', 'rules')).toBe(false);
    });

    it('should handle unknown entity types', () => {
      expect(BooleanFieldTranslator.needsTranslation('blocked:true', 'unknown')).toBe(false);
    });
  });

  describe('getAlternativeTranslations', () => {
    it('should provide multiple translation formats', () => {
      const query = 'blocked:true AND allowed:false';
      const alternatives = BooleanFieldTranslator.getAlternativeTranslations(query, 'flows');
      
      expect(alternatives).toContain('blocked:1 AND allowed:0'); // Primary format
      expect(alternatives).toContain('blocked:true AND allowed:false'); // Original query
      expect(alternatives.length).toBeGreaterThan(1);
    });

    it('should return original query when no translation needed', () => {
      const query = 'protocol:tcp';
      const alternatives = BooleanFieldTranslator.getAlternativeTranslations(query, 'flows');
      
      expect(alternatives).toEqual([query]);
    });

    it('should remove duplicate alternatives', () => {
      const query = 'blocked:true';
      const alternatives = BooleanFieldTranslator.getAlternativeTranslations(query, 'flows');
      
      // Should not contain duplicates
      expect(new Set(alternatives).size).toBe(alternatives.length);
    });
  });

  describe('getTranslationDebugInfo', () => {
    it('should provide comprehensive debug information', () => {
      const query = 'blocked:true AND protocol:tcp';
      const debug = BooleanFieldTranslator.getTranslationDebugInfo(query, 'flows');
      
      expect(debug.originalQuery).toBe(query);
      expect(debug.translatedQuery).toBe('blocked:1 AND protocol:tcp');
      expect(debug.needsTranslation).toBe(true);
      expect(debug.entityType).toBe('flows');
      expect(debug.detectedBooleanFields).toContain('blocked');
      expect(debug.alternativeTranslations).toBeInstanceOf(Array);
    });

    it('should handle queries with no boolean fields', () => {
      const query = 'protocol:tcp';
      const debug = BooleanFieldTranslator.getTranslationDebugInfo(query, 'flows');
      
      expect(debug.needsTranslation).toBe(false);
      expect(debug.detectedBooleanFields).toEqual([]);
    });
  });

  describe('addBooleanFields', () => {
    it('should add new boolean fields at runtime', () => {
      const originalFields = BooleanFieldTranslator.getSupportedBooleanFields('test_entity');
      expect(originalFields).toEqual([]);
      
      BooleanFieldTranslator.addBooleanFields('test_entity', ['custom_field']);
      
      const updatedFields = BooleanFieldTranslator.getSupportedBooleanFields('test_entity');
      expect(updatedFields).toContain('custom_field');
    });

    it('should avoid duplicate fields', () => {
      BooleanFieldTranslator.addBooleanFields('test_entity2', ['field1', 'field2']);
      BooleanFieldTranslator.addBooleanFields('test_entity2', ['field1', 'field3']); // field1 duplicate
      
      const fields = BooleanFieldTranslator.getSupportedBooleanFields('test_entity2');
      expect(fields.filter(f => f === 'field1')).toHaveLength(1);
      expect(fields).toContain('field2');
      expect(fields).toContain('field3');
    });
  });

  describe('getSupportedBooleanFields', () => {
    it('should return supported fields for known entity types', () => {
      const flowFields = BooleanFieldTranslator.getSupportedBooleanFields('flows');
      expect(flowFields).toContain('blocked');
      expect(flowFields).toContain('allowed');
      
      const alarmFields = BooleanFieldTranslator.getSupportedBooleanFields('alarms');
      expect(alarmFields).toContain('resolved');
      expect(alarmFields).toContain('acknowledged');
    });

    it('should return empty array for unknown entity types', () => {
      const unknownFields = BooleanFieldTranslator.getSupportedBooleanFields('unknown');
      expect(unknownFields).toEqual([]);
    });
  });

  describe('specific failing examples from test report', () => {
    it('should fix blocked:true query that was failing', () => {
      const failingQuery = 'blocked:true';
      const translatedQuery = BooleanFieldTranslator.translateQuery(failingQuery, 'flows');
      expect(translatedQuery).toBe('blocked:1');
      
      // Should also detect that translation was needed
      expect(BooleanFieldTranslator.needsTranslation(failingQuery, 'flows')).toBe(true);
    });

    it('should fix blocked:false query that was failing', () => {
      const failingQuery = 'blocked:false';
      const translatedQuery = BooleanFieldTranslator.translateQuery(failingQuery, 'flows');
      expect(translatedQuery).toBe('blocked:0');
    });

    it('should fix resolved:true query for alarms that was failing', () => {
      const failingQuery = 'resolved:true';
      const translatedQuery = BooleanFieldTranslator.translateQuery(failingQuery, 'alarms');
      expect(translatedQuery).toBe('resolved:1');
    });

    it('should preserve working queries like protocol:tcp', () => {
      const workingQuery = 'protocol:tcp';
      const translatedQuery = BooleanFieldTranslator.translateQuery(workingQuery, 'flows');
      expect(translatedQuery).toBe('protocol:tcp');
      
      // Should detect that no translation is needed
      expect(BooleanFieldTranslator.needsTranslation(workingQuery, 'flows')).toBe(false);
    });

    it('should provide alternatives for complex failing queries', () => {
      const complexQuery = 'blocked:true AND protocol:tcp AND encrypted:false';
      const alternatives = BooleanFieldTranslator.getAlternativeTranslations(complexQuery, 'flows');
      
      // Should include translated version
      expect(alternatives).toContain('blocked:1 AND protocol:tcp AND encrypted:0');
      
      // Should include multiple alternative formats
      expect(alternatives.length).toBeGreaterThan(1);
    });
  });
});