import { translateBooleanQuery } from '../../src/utils/simple-boolean-translator.js';

describe('simple-boolean-translator', () => {
  describe('translateBooleanQuery', () => {
    // Test edge cases to cover lines 35 and 40
    it('should handle null query', () => {
      expect(translateBooleanQuery(null as any, 'flows')).toBe(null);
    });

    it('should handle undefined query', () => {
      expect(translateBooleanQuery(undefined as any, 'flows')).toBe(undefined);
    });

    it('should handle non-string query', () => {
      expect(translateBooleanQuery(123 as any, 'flows')).toBe(123);
      expect(translateBooleanQuery({} as any, 'flows')).toEqual({});
    });

    it('should handle unknown entity type', () => {
      const query = 'blocked:true AND allowed:false';
      expect(translateBooleanQuery(query, 'unknown')).toBe(query);
    });

    it('should handle empty query string', () => {
      expect(translateBooleanQuery('', 'flows')).toBe('');
    });

    // Test all entity types
    describe('flows entity', () => {
      it('should translate boolean fields for flows', () => {
        const query = 'blocked:true AND allowed:false AND encrypted:true AND compressed:false';
        const expected = 'blocked:1 AND allowed:0 AND encrypted:1 AND compressed:0';
        expect(translateBooleanQuery(query, 'flows')).toBe(expected);
      });

      it('should handle equals syntax', () => {
        const query = 'blocked=true AND allowed=false';
        const expected = 'blocked:1 AND allowed:0';
        expect(translateBooleanQuery(query, 'flows')).toBe(expected);
      });
    });

    describe('alarms entity', () => {
      it('should translate boolean fields for alarms', () => {
        const query = 'resolved:true AND acknowledged:false AND dismissed:true AND active:false';
        const expected = 'resolved:1 AND acknowledged:0 AND dismissed:1 AND active:0';
        expect(translateBooleanQuery(query, 'alarms')).toBe(expected);
      });
    });

    describe('rules entity', () => {
      it('should translate boolean fields for rules', () => {
        const query = 'active:true AND enabled:false AND disabled:true AND paused:false';
        const expected = 'active:1 AND enabled:0 AND disabled:1 AND paused:0';
        expect(translateBooleanQuery(query, 'rules')).toBe(expected);
      });
    });

    describe('devices entity', () => {
      it('should translate boolean fields for devices', () => {
        const query = 'online:true AND monitored:false AND blocked:true AND trusted:false';
        const expected = 'online:1 AND monitored:0 AND blocked:1 AND trusted:0';
        expect(translateBooleanQuery(query, 'devices')).toBe(expected);
      });
    });

    // Test case sensitivity
    it('should handle case-insensitive matching', () => {
      const query = 'BLOCKED:TRUE and allowed:FALSE';
      const expected = 'blocked:1 and allowed:0';
      expect(translateBooleanQuery(query, 'flows')).toBe(expected);
    });

    // Test word boundaries
    it('should respect word boundaries', () => {
      const query = 'blockedfield:true AND blocked:true';
      const expected = 'blockedfield:true AND blocked:1';
      expect(translateBooleanQuery(query, 'flows')).toBe(expected);
    });

    // Test mixed content
    it('should not translate non-boolean fields', () => {
      const query = 'blocked:true AND protocol:tcp AND status:true';
      const expected = 'blocked:1 AND protocol:tcp AND status:true';
      expect(translateBooleanQuery(query, 'flows')).toBe(expected);
    });
  });
});