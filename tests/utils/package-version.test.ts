/**
 * The logs and the MCP serverInfo report PACKAGE_VERSION, so it has to track
 * package.json. The logger hard-coded '1.2.1' through 1.3.0.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_VERSION } from '../../src/utils/package-version.js';
import { StructuredLogger } from '../../src/monitoring/logger.js';

const packageJsonVersion = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
).version;

describe('PACKAGE_VERSION', () => {
  it('matches package.json', () => {
    expect(PACKAGE_VERSION).toBe(packageJsonVersion);
  });

  it('is what the logger reports', () => {
    expect((new StructuredLogger() as any).version).toBe(packageJsonVersion);
  });
});
