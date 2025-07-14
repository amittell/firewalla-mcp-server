/**
 * Alarm ID Normalizer for Firewalla MCP Server
 *
 * Handles ID format mismatches between listing and detail API endpoints.
 *
 * The issue: get_active_alarms returns aid=0, but get_specific_alarm("0") fails.
 * This suggests different ID systems between endpoints.
 *
 * Solution: Generate composite IDs in format {ts}_{type}_{gid}_{original_aid}
 * to ensure uniqueness and enable alarm retrieval.
 */

/**
 * Alarm ID normalization utility class
 */
export class AlarmIdNormalizer {
  /**
   * Generate a composite alarm ID to ensure uniqueness
   * Format: CMP-{ts}-{type}-{gid}-{original_aid}
   * Using CMP prefix and hyphens to make it clearly identifiable
   *
   * @param alarm - Alarm object from listing endpoint
   * @returns Composite ID string
   */
  static generateCompositeId(alarm: any): string {
    // Extract components with fallbacks
    const ts = alarm.ts || alarm.timestamp || '0';
    const type = alarm.type || alarm.alarm_type || 'unknown';
    const gid = alarm.gid || alarm.device?.gid || alarm.device_id || 'unknown';
    const aid = alarm.aid || alarm.id || '0';

    // Clean components to ensure valid ID format
    const cleanTs = String(ts).replace(/[^0-9]/g, '') || '0';
    const cleanType = String(type)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 20);
    const cleanGid = String(gid)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 20);
    const cleanAid = String(aid)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 20);

    return `CMP-${cleanTs}-${cleanType}-${cleanGid}-${cleanAid}`;
  }

  /**
   * Parse a composite alarm ID into its components
   *
   * @param compositeId - Composite ID string
   * @returns Parsed components or null if not a composite ID
   */
  static parseCompositeId(compositeId: string): {
    ts: string;
    type: string;
    gid: string;
    originalAid: string;
  } | null {
    // Check if it's a composite ID format with CMP prefix
    if (!compositeId.startsWith('CMP-')) {
      return null;
    }

    // Remove prefix and split
    const withoutPrefix = compositeId.substring(4);
    const parts = withoutPrefix.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const [ts, type, gid, originalAid] = parts;

    // Validate timestamp is numeric
    if (!/^\d+$/.test(ts)) {
      return null;
    }

    // Validate all components are present
    if (!ts || !type || !gid || !originalAid) {
      return null;
    }

    return { ts, type, gid, originalAid };
  }

  /**
   * Check if an ID is a composite ID
   *
   * @param id - ID to check
   * @returns True if ID appears to be composite format
   */
  static isCompositeId(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }

    // Check for CMP prefix and proper format
    return id.startsWith('CMP-') && id.split('-').length === 5;
  }

  /**
   * Extract all possible alarm ID candidates from an alarm object
   *
   * @param alarm - Alarm object from listing endpoint
   * @returns Array of possible ID values to try
   */
  static extractPossibleIds(alarm: any): string[] {
    const candidates: Set<string> = new Set();

    if (!alarm || typeof alarm !== 'object') {
      return [];
    }

    // Check common ID fields
    const idFields = [
      'id', // Standard id field
      'aid', // Alarm ID field
      'uuid', // UUID field
      'alarm_id', // Full alarm_id field
      'gid', // Global ID (might be alarm ID in some contexts)
      '_id', // MongoDB-style ID
      'eid', // Event ID
      'sid', // Sequence ID
      'valid_id', // Test field
    ];

    for (const field of idFields) {
      const value = alarm[field];
      if (value !== undefined && value !== null) {
        // Convert to string and add if non-empty
        const stringValue = String(value).trim();
        if (stringValue.length > 0) {
          candidates.add(stringValue);
        }
      }
    }

    // Check nested fields that might contain IDs
    if (alarm.metadata && typeof alarm.metadata === 'object') {
      for (const field of idFields) {
        const value = alarm.metadata[field];
        if (value !== undefined && value !== null) {
          const stringValue = String(value).trim();
          if (stringValue.length > 0) {
            candidates.add(stringValue);
          }
        }
      }
    }

    // Generate alternative ID formats
    const originalCandidates = Array.from(candidates);
    for (const candidate of originalCandidates) {
      // Try zero-padded versions for numeric IDs
      if (/^\d+$/.test(candidate)) {
        const num = parseInt(candidate, 10);
        candidates.add(num.toString().padStart(8, '0')); // 8-digit zero-padded
        candidates.add(num.toString().padStart(16, '0')); // 16-digit zero-padded
      }

      // Try with common prefixes
      candidates.add(`alarm_${candidate}`);
      candidates.add(`aid_${candidate}`);
      candidates.add(`a_${candidate}`);

      // Try hex format for numeric IDs
      if (/^\d+$/.test(candidate)) {
        const num = parseInt(candidate, 10);
        candidates.add(num.toString(16)); // hex
        candidates.add(num.toString(16).toLowerCase()); // lowercase hex
        candidates.add(`0x${num.toString(16)}`); // hex with prefix
      }
    }

    // Filter out invalid candidates and sort by likelihood
    const validCandidates = Array.from(candidates)
      .filter(
        id => id.length > 0 && id !== '0' && id !== 'undefined' && id !== 'null'
      )
      .sort((a, b) => {
        // Prioritize by likelihood of being correct
        const aIsOriginal = originalCandidates.includes(a);
        const bIsOriginal = originalCandidates.includes(b);

        // Original field values have priority over generated ones
        if (aIsOriginal && !bIsOriginal) {
          return -1;
        }
        if (!aIsOriginal && bIsOriginal) {
          return 1;
        }

        // Both original: prioritize UUIDs, then simple IDs, then numeric IDs
        if (aIsOriginal && bIsOriginal) {
          const aIsUuid = a.includes('-') && a.length > 20;
          const bIsUuid = b.includes('-') && b.length > 20;

          if (aIsUuid && !bIsUuid) {
            return -1; // UUID preferred
          }
          if (!aIsUuid && bIsUuid) {
            return 1;
          }

          // Both UUIDs or both non-UUIDs: prefer longer for UUIDs, shorter for simple IDs
          if (aIsUuid && bIsUuid) {
            return b.length - a.length; // Longer UUID preferred
          }
          return a.length - b.length; // Shorter simple ID preferred
        }

        // Both generated: prefer shorter generated IDs
        return a.length - b.length;
      });

    return validCandidates;
  }

  /**
   * Normalize an alarm ID for use with detail endpoints
   *
   * @param alarmId - Raw alarm ID (could be aid, id, composite ID, etc.)
   * @param alarm - Optional full alarm object for additional ID extraction
   * @returns Normalized alarm ID (may be composite if original ID is non-unique)
   */
  static normalizeAlarmId(alarmId: string | number, alarm?: any): string {
    // Convert input to string
    const baseId = String(alarmId).trim();

    if (!baseId || baseId.length === 0) {
      throw new Error('Invalid alarm ID: cannot be empty');
    }

    // Check if it's already a composite ID
    if (this.isCompositeId(baseId)) {
      return baseId;
    }

    // If we have the full alarm object and the ID is non-unique (like "0"),
    // generate a composite ID
    if (
      alarm &&
      (baseId === '0' || baseId === 'null' || baseId === 'undefined')
    ) {
      return this.generateCompositeId(alarm);
    }

    // If we have the full alarm object, extract all possible IDs
    if (alarm) {
      const possibleIds = this.extractPossibleIds(alarm);
      if (possibleIds.length > 0) {
        // Return the most likely ID candidate
        return possibleIds[0];
      }
    }

    // Fallback to basic normalization of the provided ID
    return this.normalizeBasicId(baseId);
  }

  /**
   * Perform basic ID normalization without additional context
   *
   * @param id - Raw ID string
   * @returns Normalized ID string
   */
  static normalizeBasicId(id: string): string {
    const trimmedId = String(id).trim();

    // If it's a simple numeric ID, try to make it more specific
    if (/^\d+$/.test(trimmedId)) {
      const num = parseInt(trimmedId, 10);

      // Very small numbers might need different formatting
      if (num >= 0 && num < 1000000) {
        // For small numbers, try the original plus some common patterns
        return trimmedId; // Start with original
      }
    }

    return trimmedId;
  }

  /**
   * Get all possible alarm ID variations to try
   *
   * @param alarmId - Base alarm ID
   * @param alarm - Optional full alarm object
   * @returns Array of ID variations to try in order of likelihood
   */
  static getAllIdVariations(alarmId: string | number, alarm?: any): string[] {
    const variations = new Set<string>();
    const baseId = String(alarmId).trim();

    // Add the base ID first
    variations.add(baseId);

    // Extract IDs from full alarm object if available
    if (alarm) {
      const extractedIds = this.extractPossibleIds(alarm);
      extractedIds.forEach(id => variations.add(id));
    }

    // Add common variations of the base ID
    if (/^\d+$/.test(baseId)) {
      const num = parseInt(baseId, 10);

      // Zero-padded variations
      variations.add(num.toString().padStart(8, '0'));
      variations.add(num.toString().padStart(16, '0'));

      // Hex variations
      variations.add(num.toString(16));
      variations.add(`0x${num.toString(16)}`);

      // Prefixed variations
      variations.add(`alarm_${num}`);
      variations.add(`aid_${num}`);
      variations.add(`a_${num}`);
    }

    // Add the base ID with common prefixes even if not numeric
    variations.add(`alarm_${baseId}`);
    variations.add(`aid_${baseId}`);

    return Array.from(variations).filter(id => id.length > 0);
  }

  /**
   * Test if an ID format is likely to be valid for Firewalla API
   *
   * @param id - ID to validate
   * @returns True if ID format appears valid
   */
  static isValidIdFormat(id: string): boolean {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return false;
    }

    const trimmedId = id.trim();

    // Check for obviously invalid patterns
    if (
      trimmedId === '0' ||
      trimmedId === 'null' ||
      trimmedId === 'undefined'
    ) {
      return false;
    }

    // Valid patterns:
    // - Simple numbers (1, 123, etc.)
    // - UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    // - Alphanumeric with underscores/dashes
    const validPatterns = [
      /^[1-9]\d*$/, // Non-zero numbers
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID
      /^[a-zA-Z0-9_-]+$/, // Alphanumeric with separators
    ];

    return validPatterns.some(pattern => pattern.test(trimmedId));
  }

  /**
   * Debug information about alarm ID extraction and normalization
   *
   * @param alarmId - Base alarm ID
   * @param alarm - Optional full alarm object
   * @returns Debug information
   */
  static getDebugInfo(
    alarmId: string | number,
    alarm?: any
  ): {
    originalId: string;
    normalizedId: string;
    extractedIds: string[];
    allVariations: string[];
    isValidFormat: boolean;
    recommendedId: string;
  } {
    const originalId = String(alarmId);
    const normalizedId = this.normalizeAlarmId(alarmId, alarm);
    const extractedIds = alarm ? this.extractPossibleIds(alarm) : [];
    const allVariations = this.getAllIdVariations(alarmId, alarm);
    const isValidFormat = this.isValidIdFormat(normalizedId);

    // Recommend the best ID to try
    const recommendedId =
      extractedIds.length > 0 ? extractedIds[0] : normalizedId;

    return {
      originalId,
      normalizedId,
      extractedIds,
      allVariations,
      isValidFormat,
      recommendedId,
    };
  }
}
