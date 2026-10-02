#!/usr/bin/env bash
# Waits until a published version installs from the npm registry, then
# verifies its signatures and provenance attestations, for publish.yml.
#
# usage: scripts/verify-published.sh <version> [timeout-seconds]
#
# npm does not serve a version as soon as `npm publish` returns. 2.0.0 and
# 2.0.1 installed 2m17s and 2m28s after it; 2.0.2 took about 15 minutes
# (published 15:27Z on 2026-10-01, installable around 15:42Z). publish.yml
# used to wait 5 minutes, then ran `npm install` anyway, which failed with
# ETARGET.
# This waits until the install itself succeeds, for up to timeout-seconds
# (default 1800), and fails with the log of the last attempt if it never
# does.
set -euo pipefail

version="${1:?usage: scripts/verify-published.sh <version> [timeout-seconds]}"
timeout="${2:-1800}"
package="firewalla-mcp-server@${version}"

dir="$(mktemp -d)"
cd "$dir"
npm init -y > /dev/null

deadline=$((SECONDS + timeout))
# --prefer-online: check the registry again on every attempt instead of
# answering from the copy of the package document cached by the last one
until npm install --save-exact --no-audit --no-fund --prefer-online "$package" > install.log 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    cat install.log >&2
    echo "$package did not install from the registry within ${timeout}s" >&2
    exit 1
  fi
  echo "Waiting for $package on the registry ($((deadline - SECONDS))s left)"
  sleep 30
done
cat install.log
npm audit signatures --include-attestations
