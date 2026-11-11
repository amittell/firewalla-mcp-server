// Container policy for CVE-2026-111497. This does not change npm's engines field.
// Keep the image on Node 22 to preserve linux/arm/v7. A future major upgrade
// must update this policy and verify every published platform deliberately.
'use strict';

const MINIMUM = '22.23.4';

function assertContainerNodeVersion(version) {
  const match = typeof version === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  const parts = match && match[0] === version ? match.slice(1).map(Number) : [];
  const [major, minor, patch] = parts;
  if (
    parts.length !== 3 ||
    !parts.every(Number.isSafeInteger) ||
    major !== 22 ||
    minor < 23 ||
    (minor === 23 && patch < 4)
  ) {
    throw new Error(
      `Container requires a stable Node 22 release >= ${MINIMUM}; got ${String(version)}`
    );
  }
}

module.exports = { assertContainerNodeVersion };

if (require.main === module) {
  try {
    assertContainerNodeVersion(process.versions.node);
    console.log(
      `Container Node ${process.versions.node} on ${process.platform}/${process.arch}: security floor ${MINIMUM} satisfied`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
