/**
 * Centralised feature-flag / safety-net configuration.
 *
 * Flags are controlled via environment variables so they can be toggled
 * without code-changes or redeploys (e.g. in CI or staging).
 *
 *  MCP_WAVE0_ENABLED   – disable ALL tools when set to "false"
 *  MCP_DISABLED_TOOLS  – comma-separated list of tool names to disable
 *  MCP_READ_ONLY_MODE  – reserved for future phases
 */
export const featureFlags = {
  /* Master flag: defaults to true for maximum safety */
  WAVE0_ENABLED: process.env.MCP_WAVE0_ENABLED !== 'false',

  /* Read-only mode for future write operations (not used yet) */
  READ_ONLY_MODE: process.env.MCP_READ_ONLY_MODE === 'true',

  /* Raw comma list of disabled tools */
  DISABLED_TOOLS_RAW: process.env.MCP_DISABLED_TOOLS ?? '',

  /* Parsed helper */
  get disabledTools(): string[] {
    return this.DISABLED_TOOLS_RAW.split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },
} as const;
