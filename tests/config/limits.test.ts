import { 
  getToolLimit, 
  getToolPerformanceTier,
  getToolTimeout,
  getLimitValidationConfig,
  STANDARD_LIMITS,
  PERFORMANCE_TIER_LIMITS,
  PERFORMANCE_THRESHOLDS,
  VALIDATION_CONFIG
} from '../../src/config/limits.js';

describe('limits configuration', () => {
  describe('getToolLimit', () => {
    it('should return correct limits for security tools', () => {
      expect(getToolLimit('get_active_alarms')).toBe(500); // API documented maximum
    });

    it('should return correct limits for device tools', () => {
      expect(getToolLimit('get_device_status')).toBe(STANDARD_LIMITS.BASIC_QUERY);
      expect(getToolLimit('get_offline_devices')).toBe(STANDARD_LIMITS.OFFLINE_DEVICES);
    });

    it('should return correct limits for network tools', () => {
      expect(getToolLimit('get_flow_data')).toBe(STANDARD_LIMITS.BASIC_QUERY);
      expect(getToolLimit('get_bandwidth_usage')).toBe(STANDARD_LIMITS.BANDWIDTH_ANALYSIS);
    });

    it('should return correct limits for search tools', () => {
      expect(getToolLimit('search_flows')).toBe(STANDARD_LIMITS.SEARCH_FLOWS);
      expect(getToolLimit('search_alarms')).toBe(STANDARD_LIMITS.SEARCH_ALARMS);
      expect(getToolLimit('search_rules')).toBe(STANDARD_LIMITS.SEARCH_RULES);
      expect(getToolLimit('search_devices')).toBe(STANDARD_LIMITS.SEARCH_DEVICES);
      expect(getToolLimit('search_target_lists')).toBe(STANDARD_LIMITS.SEARCH_TARGET_LISTS);
    });

    it('should return correct limits for geographic tools', () => {
      expect(getToolLimit('search_alarms_by_geography')).toBe(STANDARD_LIMITS.GEOGRAPHIC_ALARMS);
      expect(getToolLimit('get_geographic_statistics')).toBe(STANDARD_LIMITS.GEOGRAPHIC_STATS);
    });

    it('should return correct limits for cross-reference tools', () => {
      expect(getToolLimit('search_cross_reference')).toBe(STANDARD_LIMITS.CROSS_REFERENCE);
      expect(getToolLimit('search_enhanced_cross_reference')).toBe(STANDARD_LIMITS.CROSS_REFERENCE);
    });

    it('should return default limit for unknown tools', () => {
      expect(getToolLimit('unknown_tool')).toBe(STANDARD_LIMITS.BASIC_QUERY);
      expect(getToolLimit('')).toBe(STANDARD_LIMITS.BASIC_QUERY);
    });
  });

  describe('getToolPerformanceTier', () => {
    it('should return COMPLEX for complex tools', () => {
      expect(getToolPerformanceTier('search_enhanced_cross_reference')).toBe('COMPLEX');
      expect(getToolPerformanceTier('search_cross_reference')).toBe('COMPLEX');
      expect(getToolPerformanceTier('get_correlation_suggestions')).toBe('COMPLEX');
    });

    it('should return MODERATE for moderate tools', () => {
      expect(getToolPerformanceTier('get_bandwidth_usage')).toBe('MODERATE');
      expect(getToolPerformanceTier('search_alarms_by_geography')).toBe('MODERATE');
    });

    it('should return STATISTICAL for statistical tools', () => {
      expect(getToolPerformanceTier('get_simple_statistics')).toBe('STATISTICAL');
      expect(getToolPerformanceTier('get_statistics_by_region')).toBe('STATISTICAL');
      expect(getToolPerformanceTier('get_statistics_by_box')).toBe('STATISTICAL');
      expect(getToolPerformanceTier('get_geographic_statistics')).toBe('STATISTICAL');
    });

    it('should return SIMPLE for other tools', () => {
      expect(getToolPerformanceTier('get_active_alarms')).toBe('SIMPLE');
      expect(getToolPerformanceTier('search_flows')).toBe('SIMPLE');
      expect(getToolPerformanceTier('unknown_tool')).toBe('SIMPLE');
    });
  });

  describe('getToolTimeout', () => {
    it('should return complex timeout for complex tools', () => {
      expect(getToolTimeout('search_enhanced_cross_reference')).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_cross_reference')).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
      expect(getToolTimeout('get_correlation_suggestions')).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_alarms_by_geography')).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
      expect(getToolTimeout('get_geographic_statistics')).toBe(PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT);
    });

    it('should return search timeout for search tools', () => {
      expect(getToolTimeout('search_flows')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_alarms')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_rules')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_devices')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_target_lists')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
    });

    it('should return search timeout for tools containing "search"', () => {
      expect(getToolTimeout('custom_search_tool')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
      expect(getToolTimeout('search_anything')).toBe(PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT);
    });

    it('should return simple timeout for other tools', () => {
      expect(getToolTimeout('get_active_alarms')).toBe(PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT);
      expect(getToolTimeout('get_device_status')).toBe(PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT);
      expect(getToolTimeout('unknown_tool')).toBe(PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT);
    });
  });

  describe('getLimitValidationConfig', () => {
    it('should return validation config with tool-specific max limit', () => {
      const config = getLimitValidationConfig('search_flows');
      expect(config).toEqual({
        min: 1,
        integer: true,
        max: STANDARD_LIMITS.SEARCH_FLOWS
      });
    });

    it('should return validation config for unknown tool with default limit', () => {
      const config = getLimitValidationConfig('unknown_tool');
      expect(config).toEqual({
        min: 1,
        integer: true,
        max: STANDARD_LIMITS.BASIC_QUERY
      });
    });

    it('should include all VALIDATION_CONFIG.LIMIT properties', () => {
      const config = getLimitValidationConfig('get_active_alarms');
      expect(config.min).toBe(VALIDATION_CONFIG.LIMIT.min);
      expect(config.integer).toBe(VALIDATION_CONFIG.LIMIT.integer);
    });
  });
});