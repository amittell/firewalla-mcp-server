#!/usr/bin/env bash
# Prints a version's CHANGELOG.md entry, the release notes of its tag, for
# publish.yml.
#
# usage: scripts/release-notes.sh <version>
#
# Fails, before anything is published, unless CHANGELOG.md has a dated
# "## [<version>] - YYYY-MM-DD" heading with an entry under it.
set -euo pipefail

version="${1:?usage: scripts/release-notes.sh <version>}"
heading="$(grep -E "^## \[${version//./\\.}\] - " CHANGELOG.md || true)"
if ! [[ "$heading" =~ ^##\ \[[^]]+\]\ -\ [0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "CHANGELOG.md needs a dated '## [$version] - YYYY-MM-DD' entry (found: '${heading:-none}')" >&2
  exit 1
fi
notes="$(awk -v heading="$heading" '
  $0 == heading { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' CHANGELOG.md)"
if ! [[ "$notes" =~ [^[:space:]] ]]; then
  echo "CHANGELOG.md has no entry under '$heading'" >&2
  exit 1
fi
printf '%s\n' "$notes"
