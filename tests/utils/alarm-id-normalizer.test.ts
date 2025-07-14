/**
 * Unit tests for Alarm ID Normalizer
 */

import { AlarmIdNormalizer } from '../../src/utils/alarm-id-normalizer.js';

describe('AlarmIdNormalizer', () => {
  describe('extractPossibleIds', () => {
    it('should extract all ID fields from alarm object', () => {
      const alarm = {
        id: 'main-id',
        aid: 123,
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        alarm_id: 'alarm_456',
        gid: 'global-123'
      };
      
      const ids = AlarmIdNormalizer.extractPossibleIds(alarm);
      
      expect(ids).toContain('main-id');
      expect(ids).toContain('123');
      expect(ids).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(ids).toContain('alarm_456');
      expect(ids).toContain('global-123');
    });

    it('should handle nested metadata fields', () => {
      const alarm = {
        aid: 0,
        metadata: {
          id: 'nested-id',
          uuid: 'nested-uuid-123'
        }
      };
      
      const ids = AlarmIdNormalizer.extractPossibleIds(alarm);
      
      expect(ids).toContain('nested-id');
      expect(ids).toContain('nested-uuid-123');
    });

    it('should generate alternative ID formats', () => {
      const alarm = { aid: 123 };
      
      const ids = AlarmIdNormalizer.extractPossibleIds(alarm);
      
      // Should include original
      expect(ids).toContain('123');
      
      // Should include generated variations
      expect(ids.some(id => id.includes('alarm_123'))).toBe(true);
      expect(ids.some(id => id.includes('aid_123'))).toBe(true);
      
      // Should include hex format
      expect(ids.some(id => id === '7b')).toBe(true); // 123 in hex
    });

    it('should filter out invalid candidates', () => {
      const alarm = {
        aid: 0,           // Should be filtered (zero)
        id: null,         // Should be filtered (null)
        uuid: undefined,  // Should be filtered (undefined)
        valid_id: 'real-id'
      };
      
      const ids = AlarmIdNormalizer.extractPossibleIds(alarm);
      
      expect(ids).not.toContain('0');
      expect(ids).not.toContain('null');
      expect(ids).not.toContain('undefined');
      expect(ids).toContain('real-id');
    });

    it('should handle empty or invalid alarm objects', () => {
      expect(AlarmIdNormalizer.extractPossibleIds(null)).toEqual([]);
      expect(AlarmIdNormalizer.extractPossibleIds(undefined)).toEqual([]);
      expect(AlarmIdNormalizer.extractPossibleIds({})).toEqual([]);
      expect(AlarmIdNormalizer.extractPossibleIds('not-an-object' as any)).toEqual([]);
    });

    it('should prioritize likely candidates correctly', () => {
      const alarm = {
        aid: 123,
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        id: 'simple-id'
      };
      
      const ids = AlarmIdNormalizer.extractPossibleIds(alarm);
      
      // UUID should be prioritized (contains dashes and is long)
      const uuidIndex = ids.indexOf('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const simpleIdIndex = ids.indexOf('simple-id');
      const numericIdIndex = ids.indexOf('123');
      
      // UUID should come first (highest priority)
      expect(uuidIndex).toBe(0);
      
      // Both simple-id and 123 should come before generated alternatives
      expect(simpleIdIndex).toBeLessThan(10); // Should be in first few positions
      expect(numericIdIndex).toBeLessThan(10); // Should be in first few positions
      
      // All original IDs should come before generated alternatives like 'alarm_123'
      expect(ids.indexOf('alarm_123')).toBeGreaterThan(Math.max(uuidIndex, simpleIdIndex, numericIdIndex));
    });
  });

  describe('normalizeAlarmId', () => {
    it('should use extracted ID when alarm object provided', () => {
      const alarm = {
        aid: 0,  // Non-unique ID
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        id: 'real-id',
        ts: 1704067200,
        type: 'intrusion'
      };
      
      const normalized = AlarmIdNormalizer.normalizeAlarmId('0', alarm);
      
      // Should generate composite ID for non-unique IDs like '0'
      expect(normalized).toMatch(/^CMP-\d+-\w+-\w+-\w+$/);
      expect(normalized).toContain('CMP-1704067200-intrusion');
    });

    it('should fallback to basic normalization when no alarm object', () => {
      const normalized = AlarmIdNormalizer.normalizeAlarmId('123');
      
      expect(normalized).toBe('123');
    });

    it('should handle various input types', () => {
      expect(AlarmIdNormalizer.normalizeAlarmId(123)).toBe('123');
      expect(AlarmIdNormalizer.normalizeAlarmId('  456  ')).toBe('456');
    });

    it('should throw for invalid inputs', () => {
      expect(() => AlarmIdNormalizer.normalizeAlarmId('')).toThrow('Invalid alarm ID: cannot be empty');
      expect(() => AlarmIdNormalizer.normalizeAlarmId('   ')).toThrow('Invalid alarm ID: cannot be empty');
    });
  });

  describe('getAllIdVariations', () => {
    it('should provide comprehensive ID variations', () => {
      const variations = AlarmIdNormalizer.getAllIdVariations('123');
      
      expect(variations).toContain('123');                    // Original
      expect(variations).toContain('00000123');              // Zero-padded
      expect(variations).toContain('7b');                    // Hex
      expect(variations).toContain('alarm_123');             // Prefixed
    });

    it('should include extracted IDs when alarm object provided', () => {
      const alarm = { aid: 123, uuid: 'real-uuid' };
      const variations = AlarmIdNormalizer.getAllIdVariations('0', alarm);
      
      expect(variations).toContain('0');          // Original input
      expect(variations).toContain('123');        // Extracted from alarm
      expect(variations).toContain('real-uuid');  // Extracted from alarm
    });

    it('should handle non-numeric IDs', () => {
      const variations = AlarmIdNormalizer.getAllIdVariations('abc-123');
      
      expect(variations).toContain('abc-123');
      expect(variations).toContain('alarm_abc-123');
      expect(variations).toContain('aid_abc-123');
      
      // Should not include numeric-only variations
      expect(variations.every(v => !v.match(/^0+/))).toBe(true);
    });
  });

  describe('isValidIdFormat', () => {
    it('should accept valid ID formats', () => {
      expect(AlarmIdNormalizer.isValidIdFormat('123')).toBe(true);
      expect(AlarmIdNormalizer.isValidIdFormat('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
      expect(AlarmIdNormalizer.isValidIdFormat('alarm_123')).toBe(true);
      expect(AlarmIdNormalizer.isValidIdFormat('simple-id')).toBe(true);
    });

    it('should reject invalid ID formats', () => {
      expect(AlarmIdNormalizer.isValidIdFormat('')).toBe(false);
      expect(AlarmIdNormalizer.isValidIdFormat('0')).toBe(false);           // Zero
      expect(AlarmIdNormalizer.isValidIdFormat('null')).toBe(false);        // String 'null'
      expect(AlarmIdNormalizer.isValidIdFormat('undefined')).toBe(false);   // String 'undefined'
      expect(AlarmIdNormalizer.isValidIdFormat('   ')).toBe(false);         // Whitespace only
    });

    it('should handle edge cases', () => {
      expect(AlarmIdNormalizer.isValidIdFormat(null as any)).toBe(false);
      expect(AlarmIdNormalizer.isValidIdFormat(undefined as any)).toBe(false);
      expect(AlarmIdNormalizer.isValidIdFormat(123 as any)).toBe(false);    // Not a string
    });
  });

  describe('getDebugInfo', () => {
    it('should provide comprehensive debug information', () => {
      const alarm = {
        aid: 0,
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        id: 'real-id',
        ts: 1704067200,
        type: 'intrusion'
      };
      
      const debug = AlarmIdNormalizer.getDebugInfo('0', alarm);
      
      expect(debug.originalId).toBe('0');
      expect(debug.normalizedId).toMatch(/^CMP-\d+-\w+-\w+-\w+$/);  // Should be composite ID
      expect(debug.extractedIds).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(debug.extractedIds).toContain('real-id');
      expect(debug.allVariations.length).toBeGreaterThan(1);
      expect(debug.recommendedId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');  // Should recommend extracted UUID
    });

    it('should handle cases with no alarm object', () => {
      const debug = AlarmIdNormalizer.getDebugInfo('123');
      
      expect(debug.originalId).toBe('123');
      expect(debug.normalizedId).toBe('123');
      expect(debug.extractedIds).toEqual([]);
      expect(debug.recommendedId).toBe('123');
    });
  });

  describe('specific test report scenarios', () => {
    it('should handle the aid=0 scenario from test report', () => {
      // This is the exact scenario from the test report:
      // get_active_alarms returns aid=0, but get_specific_alarm("0") fails
      
      const alarmFromListing = {
        aid: 0,
        ts: "2025-07-14T04:21:47.823Z",
        // In a real scenario, there might be other ID fields
        id: 'alarm-uuid-12345',
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      };
      
      // The problem: using aid directly
      const problematicId = String(alarmFromListing.aid); // "0"
      expect(problematicId).toBe('0');
      
      // The solution: extract better ID
      const normalizedId = AlarmIdNormalizer.normalizeAlarmId(problematicId, alarmFromListing);
      expect(normalizedId).not.toBe('0');
      expect(normalizedId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890'); // Should use UUID
      
      // Get all variations to try
      const variations = AlarmIdNormalizer.getAllIdVariations(problematicId, alarmFromListing);
      expect(variations).toContain('alarm-uuid-12345');
      expect(variations).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(variations).not.toEqual(['0']); // Should have more options than just '0'
    });

    it('should generate fallback variations when no good extracted IDs', () => {
      // Edge case: alarm with only aid=0 and no other useful IDs
      const problematicAlarm = {
        aid: 0,
        ts: "2025-07-14T04:21:47.823Z",
        // No other useful ID fields
      };
      
      const variations = AlarmIdNormalizer.getAllIdVariations('0', problematicAlarm);
      
      // Should still provide some alternatives to try
      expect(variations.length).toBeGreaterThan(1);
      expect(variations).toContain('alarm_0');
      expect(variations).toContain('aid_0');
    });

    it('should validate that recommended ID is not the problematic "0"', () => {
      const alarm = {
        aid: 0,
        uuid: 'valid-uuid-456'
      };
      
      const debug = AlarmIdNormalizer.getDebugInfo('0', alarm);
      
      // The recommended ID should NOT be "0"
      expect(debug.recommendedId).not.toBe('0');
      expect(debug.recommendedId).toBe('valid-uuid-456');
      expect(AlarmIdNormalizer.isValidIdFormat(debug.recommendedId)).toBe(true);
    });
  });
});