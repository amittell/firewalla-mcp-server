'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { assertContainerNodeVersion } = require('./assert-container-node.cjs');

for (const version of ['22.23.4', '22.23.5', '22.24.0']) {
  test(`accept patched Node 22 ${version}`, () => {
    assert.doesNotThrow(() => assertContainerNodeVersion(version));
  });
}

// The first case is the runtime in the currently published 2.1.1 image.
// Later major versions need an explicit container/platform policy change;
// package compatibility tests remain free to run on Node 20 and 24.
for (const version of [
  '22.23.3', '22.22.99', '20.19.0', '24.22.1', '26.12.1',
  'v22.23.4', '22.23.4-rc.1', '22.023.4', '22.23.4junk',
  '22.23.4\n', '22.23', '', null, undefined, 22,
  '22.9007199254740992.0',
]) {
  test(`reject runtime ${JSON.stringify(version)}`, () => {
    assert.throws(
      () => assertContainerNodeVersion(version),
      /Container requires a stable Node 22 release >= 22\.23\.4/
    );
  });
}
