/**
 * Centralised feature-flag / safety-net configuration.
 *
 * Flags are controlled via environment variables so they can be toggled
 * without code-changes or redeploys (e.g. in CI or staging).
 *
 *  MCP_WAVE0_ENABLED   – disable ALL tools when set to "false"
 *  MCP_DISABLED_TOOLS  – comma-separated list of tool names to disable
 *  MCP_READ_ONLY_MODE  – reserved for future phases
 *
 *  Geographic Enrichment Pipeline Flags:
 *  GEOGRAPHIC_ENRICHMENT_ENABLED       – enable geographic data enrichment pipeline
 *  GEOGRAPHIC_FALLBACK_ENABLED         – enable fallback providers for geographic data
 *  GEOGRAPHIC_ENRICHMENT_ROLLOUT_PCT   – percentage of requests to enrich (0-100)
 */
export const featureFlags = {
  /* Master flag: defaults to true for maximum safety */
  WAVE0_ENABLED: process.env.MCP_WAVE0_ENABLED !== 'false',

  /* Read-only mode for future write operations (not used yet) */
  READ_ONLY_MODE: process.env.MCP_READ_ONLY_MODE === 'true',

  /* Raw comma list of disabled tools */
  DISABLED_TOOLS_RAW: process.env.MCP_DISABLED_TOOLS ?? '',

  /* Geographic Enrichment Pipeline Features */
  GEOGRAPHIC_ENRICHMENT_ENABLED: process.env.GEOGRAPHIC_ENRICHMENT_ENABLED === 'true',
  GEOGRAPHIC_FALLBACK_ENABLED: process.env.GEOGRAPHIC_FALLBACK_ENABLED !== 'false',
  
  /* Geographic Enrichment Rollout Percentage (0-100) */
  get GEOGRAPHIC_ENRICHMENT_ROLLOUT_PCT(): number {
    const pct = parseInt(process.env.GEOGRAPHIC_ENRICHMENT_ROLLOUT_PCT ?? '0', 10);
    return Math.max(0, Math.min(100, isNaN(pct) ? 0 : pct));
  },

  /* Geographic Enrichment Performance Budget (milliseconds) */
  get GEOGRAPHIC_ENRICHMENT_BUDGET_MS(): number {
    const budget = parseFloat(process.env.GEOGRAPHIC_ENRICHMENT_BUDGET_MS ?? '3');
    return Math.max(0.1, Math.min(10, isNaN(budget) ? 3 : budget));
  },

  /* Geographic Enrichment Success Rate Target (0-1) */
  get GEOGRAPHIC_ENRICHMENT_SUCCESS_TARGET(): number {
    const target = parseFloat(process.env.GEOGRAPHIC_ENRICHMENT_SUCCESS_TARGET ?? '0.95');
    return Math.max(0, Math.min(1, isNaN(target) ? 0.95 : target));
  },

  /* Parsed helper */
  get disabledTools(): string[] {
    return this.DISABLED_TOOLS_RAW.split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },

  /* Helper: Should enrich this request based on rollout percentage? */
  shouldEnrichRequest(): boolean {
    if (!this.GEOGRAPHIC_ENRICHMENT_ENABLED) {
      return false;
    }
    
    const rolloutPct = this.GEOGRAPHIC_ENRICHMENT_ROLLOUT_PCT;
    if (rolloutPct === 0) {
      return false;
    }
    if (rolloutPct === 100) {
      return true;
    }
    
    // Use random sampling for gradual rollout
    return Math.random() * 100 < rolloutPct;
  },
} as const;
