/**
 * Configurable test thresholds for consistent testing across environments
 */

export interface TestThresholds {
  performance: {
    crossReferenceMs: number;
    correlationMs: number;
    generalOperationMs: number;
  };
  correlation: {
    highScoreMin: number;
    mediumScoreMin: number;
    lowScoreMax: number;
    exactMatchScore: number;
    subnetMatchThreshold: number;
    stringFuzzyThreshold: number;
    numericToleranceDefault: number;
  };
  search: {
    complexityMax: number;
    regexTimeoutMs: number;
    patternLengthMax: number;
  };
  dataset: {
    largeDatasetSize: number;
    maxCorrelationFields: number;
    concurrentSearches: number;
  };
}

/**
 * Default test thresholds optimized for different environments
 */
const DEFAULT_TEST_THRESHOLDS: TestThresholds = {
  performance: {
    crossReferenceMs: parseInt(process.env.CROSS_REF_PERF_THRESHOLD_MS || (process.env.CI ? '2000' : '1000'), 10),
    correlationMs: parseInt(process.env.CORRELATION_PERF_THRESHOLD_MS || (process.env.CI ? '2000' : '1000'), 10),
    generalOperationMs: parseInt(process.env.GENERAL_PERF_THRESHOLD_MS || (process.env.CI ? '1000' : '500'), 10),
  },
  correlation: {
    highScoreMin: parseFloat(process.env.HIGH_SCORE_MIN || '0.8'),
    mediumScoreMin: parseFloat(process.env.MEDIUM_SCORE_MIN || '0.5'),
    lowScoreMax: parseFloat(process.env.LOW_SCORE_MAX || '0.5'),
    exactMatchScore: parseFloat(process.env.EXACT_MATCH_SCORE || '1.0'),
    subnetMatchThreshold: parseFloat(process.env.SUBNET_MATCH_THRESHOLD || '0.75'),
    stringFuzzyThreshold: parseFloat(process.env.STRING_FUZZY_THRESHOLD || '0.8'),
    numericToleranceDefault: parseFloat(process.env.NUMERIC_TOLERANCE_DEFAULT || '0.1'),
  },
  search: {
    complexityMax: parseInt(process.env.SEARCH_COMPLEXITY_MAX || '10', 10),
    regexTimeoutMs: parseInt(process.env.REGEX_TIMEOUT_MS || '100', 10),
    patternLengthMax: parseInt(process.env.PATTERN_LENGTH_MAX || '100', 10),
  },
  dataset: {
    largeDatasetSize: parseInt(process.env.LARGE_DATASET_SIZE || '1000', 10),
    maxCorrelationFields: parseInt(process.env.MAX_CORRELATION_FIELDS || '5', 10),
    concurrentSearches: parseInt(process.env.CONCURRENT_SEARCHES || '3', 10),
  }
};

/**
 * Current test configuration (can be updated at runtime)
 */
let currentTestThresholds: TestThresholds = DEFAULT_TEST_THRESHOLDS;

/**
 * Update test thresholds at runtime
 */
export function updateTestThresholds(newThresholds: Partial<TestThresholds>): void {
  currentTestThresholds = {
    ...currentTestThresholds,
    ...newThresholds,
    performance: {
      ...currentTestThresholds.performance,
      ...(newThresholds.performance || {})
    },
    correlation: {
      ...currentTestThresholds.correlation,
      ...(newThresholds.correlation || {})
    },
    search: {
      ...currentTestThresholds.search,
      ...(newThresholds.search || {})
    },
    dataset: {
      ...currentTestThresholds.dataset,
      ...(newThresholds.dataset || {})
    }
  };
}

/**
 * Get current test thresholds
 */
export function getTestThresholds(): TestThresholds {
  return currentTestThresholds;
}

/**
 * Reset test thresholds to defaults
 */
export function resetTestThresholds(): void {
  currentTestThresholds = DEFAULT_TEST_THRESHOLDS;
}

/**
 * Environment-specific threshold presets
 */
export const THRESHOLD_PRESETS = {
  ci: {
    performance: {
      crossReferenceMs: 3000,
      correlationMs: 3000,
      generalOperationMs: 1500,
    }
  },
  development: {
    performance: {
      crossReferenceMs: 1000,
      correlationMs: 1000,
      generalOperationMs: 500,
    }
  },
  production: {
    performance: {
      crossReferenceMs: 500,
      correlationMs: 500,
      generalOperationMs: 250,
    },
    correlation: {
      highScoreMin: 0.9,
      mediumScoreMin: 0.7,
    }
  }
};

/**
 * Apply environment-specific preset
 */
export function applyThresholdPreset(preset: keyof typeof THRESHOLD_PRESETS): void {
  const presetConfig = THRESHOLD_PRESETS[preset];
  updateTestThresholds(presetConfig);
}

/**
 * Validate test thresholds for consistency
 */
export function validateTestThresholds(thresholds: TestThresholds): string[] {
  const errors: string[] = [];

  // Performance thresholds should be positive
  if (thresholds.performance.crossReferenceMs <= 0) {
    errors.push('Cross-reference performance threshold must be positive');
  }
  if (thresholds.performance.correlationMs <= 0) {
    errors.push('Correlation performance threshold must be positive');
  }

  // Correlation score thresholds should be between 0 and 1
  if (thresholds.correlation.highScoreMin < 0 || thresholds.correlation.highScoreMin > 1) {
    errors.push('High score minimum must be between 0 and 1');
  }
  if (thresholds.correlation.mediumScoreMin < 0 || thresholds.correlation.mediumScoreMin > 1) {
    errors.push('Medium score minimum must be between 0 and 1');
  }

  // Score order validation
  if (thresholds.correlation.mediumScoreMin >= thresholds.correlation.highScoreMin) {
    errors.push('Medium score minimum must be less than high score minimum');
  }

  return errors;
}