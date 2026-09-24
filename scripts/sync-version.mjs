#!/usr/bin/env node
// Writes package.json's version into src/utils/package-version.ts. npm runs this as
// the `version` lifecycle script, so `npm version <x>` updates both in one commit.
import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../src/utils/package-version.ts', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const source = readFileSync(target, 'utf8');
const pattern = /export const PACKAGE_VERSION = '[^']*';/;
if (!pattern.test(source)) {
  console.error('PACKAGE_VERSION declaration not found in src/utils/package-version.ts');
  process.exit(1);
}
writeFileSync(target, source.replace(pattern, `export const PACKAGE_VERSION = '${version}';`));
console.log(`PACKAGE_VERSION -> ${version}`);
