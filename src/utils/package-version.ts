/**
 * The package version reported in the logs and the MCP serverInfo.
 *
 * Kept equal to package.json by scripts/sync-version.mjs, which npm runs as the
 * `version` lifecycle script during `npm version`;
 * tests/utils/package-version.test.ts fails if the two drift.
 */
export const PACKAGE_VERSION = '1.4.0';
