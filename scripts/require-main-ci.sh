#!/usr/bin/env bash
# Waits for main's CI to have passed on a commit, for publish.yml.
#
# usage: scripts/require-main-ci.sh <commit> [timeout-seconds]
# needs: gh (GH_TOKEN), git history back from <commit>, GITHUB_REPOSITORY
#
# ci.yml ignores a push that changes only docs/, top-level *.md or LICENSE,
# so a docs-only commit on main can have no CI run of its own: v2.0.0 was
# tagged on one (b8dd6da, #87), and the publish job waited 30 minutes for a
# run that never came. So this walks back from <commit> along the first
# parent, past commits that change only those paths and have no push run,
# to the first commit that has one, and requires that run to have
# succeeded. A commit that changes anything else and has no run yet is not
# walked past: its run may still be registering, so it is waited for.
set -euo pipefail

commit="$(git rev-parse "$1^{commit}")"
timeout="${2:-1800}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
# The paths ci.yml's push trigger ignores; keep the two in step
docs_only='^docs/|^[^/]+\.md$|^LICENSE$'
max_walk=20

# The status and conclusion of main's latest push run of ci.yml on a commit,
# or "missing"
ci_run() {
  gh api "repos/${repo}/actions/workflows/ci.yml/runs?event=push&head_sha=$1&per_page=20" \
    --jq '[.workflow_runs[] | select(.head_branch == "main")] | sort_by(.run_number) | last | if . == null then "missing" else "\(.status) \(.conclusion // "pending")" end'
}

# Whether a commit changes only paths ci.yml ignores
docs_only_change() {
  local parent
  parent="$(git rev-parse "$1^" 2>/dev/null)" || return 1
  ! git diff --name-only "$parent" "$1" | grep -qvE "$docs_only"
}

deadline=$((SECONDS + timeout))
while [ "$SECONDS" -lt "$deadline" ]; do
  target="$commit"
  for _ in $(seq 1 "$max_walk"); do
    run="$(ci_run "$target")"
    if [ "$run" != "missing" ]; then
      break
    fi
    if docs_only_change "$target"; then
      target="$(git rev-parse "$target^")"
      continue
    fi
    break
  done
  case "$run" in
    "completed success")
      if [ "$target" != "$commit" ]; then
        echo "$commit changes only docs since $target, whose main CI passed"
      else
        echo "main CI passed on $commit"
      fi
      exit 0
      ;;
    completed\ *)
      echo "main CI on $target completed with conclusion ${run#completed }"
      exit 1
      ;;
  esac
  sleep 10
done
echo "Timed out waiting for main CI on $commit (last looked at $target: $run)"
exit 1
