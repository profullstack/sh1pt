#!/usr/bin/env bash
# scripts/rebase-prs.sh
#
# Manually rebase all open PRs (or a specific PR) onto master.
#
# Usage:
#   ./scripts/rebase-prs.sh              # rebase all open PRs
#   ./scripts/rebase-prs.sh 242          # rebase PR #242 only
#   ./scripts/rebase-prs.sh 242 240 237  # rebase specific PRs
#
# Requirements:
#   - gh CLI authenticated with write access to profullstack/sh1pt
#   - git configured with user.name and user.email
#   - pnpm installed (for lockfile regeneration)
#
# The script will:
#   1. Fetch each PR branch
#   2. Rebase onto master, preferring PR changes on conflict (-X theirs)
#   3. Auto-resolve lockfile conflicts by regenerating
#   4. Push back to the fork branch (requires PR author to allow maintainer edits)
#   5. Comment on each PR with the result

set -euo pipefail

REPO="profullstack/sh1pt"
BASE_BRANCH="master"

log()  { echo "  $*"; }
ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; }
err()  { echo "  ❌ $*"; }

# Ensure we are on master and it is up to date
echo "Fetching latest master..."
git fetch origin master
git checkout master
git merge --ff-only origin/master 2>/dev/null || true
MASTER_SHA=$(git rev-parse HEAD)
echo "Master HEAD: $MASTER_SHA"

# Configure git identity if not set
if [ -z "$(git config user.email 2>/dev/null)" ]; then
  git config user.email "auto-rebase@sh1pt.local"
fi
if [ -z "$(git config user.name 2>/dev/null)" ]; then
  git config user.name "Auto Rebase Script"
fi

# Determine PR list
if [ $# -gt 0 ]; then
  PR_LIST="$*"
else
  echo "Fetching open PR list from GitHub..."
  PR_LIST=$(gh pr list --repo "$REPO" --state open --json number --jq '.[].number' | tr '\n' ' ')
fi

echo "PRs to process: $PR_LIST"

REBASED=()
SKIPPED=()
FAILED=()

for PR_NUMBER in $PR_LIST; do
  echo ""
  echo "=========================================="
  echo "PR #$PR_NUMBER"
  echo "=========================================="

  PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
    --json number,headRefName,headRepository,maintainerCanModify,baseRefName 2>/dev/null) || {
    err "Failed to get PR #$PR_NUMBER details"
    FAILED+=("$PR_NUMBER")
    continue
  }

  HEAD_BRANCH=$(echo "$PR_JSON" | jq -r '.headRefName')
  FORK_REPO=$(echo "$PR_JSON" | jq -r '.headRepository.nameWithOwner')
  MAINTAINER_CAN_MODIFY=$(echo "$PR_JSON" | jq -r '.maintainerCanModify')
  BASE_REF=$(echo "$PR_JSON" | jq -r '.baseRefName')

  log "Branch: $HEAD_BRANCH"
  log "Fork:   $FORK_REPO"
  log "Maintainer can modify: $MAINTAINER_CAN_MODIFY"

  if [ "$BASE_REF" != "$BASE_BRANCH" ]; then
    warn "Base branch is '$BASE_REF', not '$BASE_BRANCH'. Skipping."
    SKIPPED+=("$PR_NUMBER")
    continue
  fi

  if [ "$MAINTAINER_CAN_MODIFY" != "true" ]; then
    warn "maintainerCanModify=false. Skipping (ask PR author to enable 'Allow edits from maintainers')."
    SKIPPED+=("$PR_NUMBER")
    continue
  fi

  # Fetch the PR head
  git fetch origin "refs/pull/$PR_NUMBER/head:pr-temp-$PR_NUMBER" 2>/dev/null || {
    err "Failed to fetch PR #$PR_NUMBER"
    FAILED+=("$PR_NUMBER")
    continue
  }

  # Check if rebase is needed
  MERGE_BASE=$(git merge-base "pr-temp-$PR_NUMBER" HEAD)
  if [ "$MERGE_BASE" = "$MASTER_SHA" ]; then
    ok "Already up to date"
    SKIPPED+=("$PR_NUMBER")
    git branch -D "pr-temp-$PR_NUMBER" 2>/dev/null || true
    continue
  fi

  log "Merge base: ${MERGE_BASE:0:8} (behind master, rebasing...)"

  git checkout -b "rebase-work-$PR_NUMBER" "pr-temp-$PR_NUMBER"

  REBASE_SUCCESS=false
  CONFLICT_FILES=""

  if git rebase -X theirs "$BASE_BRANCH" 2>&1; then
    REBASE_SUCCESS=true
    log "Rebase succeeded (conflicts auto-resolved preferring PR changes)"
  else
    CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
    warn "Rebase hit conflicts: $CONFLICT_FILES"

    RESOLVED=true
    for file in $CONFLICT_FILES; do
      case "$file" in
        pnpm-lock.yaml|package-lock.json|yarn.lock|bun.lockb)
          log "Resolving lockfile $file (taking PR version)..."
          git checkout --theirs "$file" 2>/dev/null || true
          git add "$file"
          ;;
        *)
          warn "Cannot auto-resolve: $file"
          RESOLVED=false
          ;;
      esac
    done

    if $RESOLVED; then
      if GIT_EDITOR=true git rebase --continue 2>&1; then
        REBASE_SUCCESS=true
      else
        warn "rebase --continue failed"
        git rebase --abort 2>/dev/null || true
        REBASE_SUCCESS=false
      fi
    else
      git rebase --abort 2>/dev/null || true
    fi
  fi

  if $REBASE_SUCCESS; then
    # Regenerate pnpm-lock.yaml if package.json changed
    if git diff "$BASE_BRANCH..HEAD" --name-only 2>/dev/null | grep -q "package.json"; then
      log "package.json changed, regenerating pnpm-lock.yaml..."
      pnpm install --no-frozen-lockfile 2>/dev/null || true
      if ! git diff --quiet pnpm-lock.yaml 2>/dev/null; then
        git add pnpm-lock.yaml
        git commit --amend --no-edit 2>/dev/null || \
          git commit -m "chore: regenerate pnpm-lock.yaml after rebase" 2>/dev/null || true
      fi
    fi

    log "Pushing to $FORK_REPO/$HEAD_BRANCH..."
    PUSH_URL="https://github.com/${FORK_REPO}.git"
    if git push "$PUSH_URL" "HEAD:refs/heads/$HEAD_BRANCH" --force-with-lease 2>&1; then
      ok "PR #$PR_NUMBER rebased and pushed successfully"
      REBASED+=("$PR_NUMBER")
      gh pr comment "$PR_NUMBER" --repo "$REPO" \
        --body "🤖 **Auto-rebase:** This branch has been automatically rebased onto \`master\`. No conflicts." \
        2>/dev/null || true
    else
      err "Push to fork failed. Ask the PR author to enable 'Allow edits from maintainers' and retry."
      FAILED+=("$PR_NUMBER")
      gh pr comment "$PR_NUMBER" --repo "$REPO" \
        --body "🤖 **Auto-rebase:** The branch rebased cleanly locally but could not be pushed to the fork. Please enable **'Allow edits from maintainers'** in the PR settings, then re-run the rebase workflow, or rebase manually: \`git fetch upstream master && git rebase upstream/master\`." \
        2>/dev/null || true
    fi
  else
    err "PR #$PR_NUMBER has unresolvable conflicts"
    FAILED+=("$PR_NUMBER")
    CONFLICT_LIST=$(echo "$CONFLICT_FILES" | tr '\n' ',' | sed 's/,$//')
    gh pr comment "$PR_NUMBER" --repo "$REPO" \
      --body "🤖 **Auto-rebase failed:** Conflicts that cannot be auto-resolved: \`${CONFLICT_LIST}\`. Please rebase manually: \`git fetch upstream master && git rebase upstream/master\`." \
      2>/dev/null || true
  fi

  # Cleanup temp branches
  git checkout master 2>/dev/null || git checkout -
  git branch -D "rebase-work-$PR_NUMBER" 2>/dev/null || true
  git branch -D "pr-temp-$PR_NUMBER" 2>/dev/null || true
done

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Rebased:  ${REBASED[*]:-none}"
echo "Skipped:  ${SKIPPED[*]:-none}"
echo "Failed:   ${FAILED[*]:-none}"
