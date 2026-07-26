#!/usr/bin/env bash
# Swap which site GitHub Pages serves for this user page.
#
# This repo has two independent site branches:
#   master  - the Academic Pages Jekyll site (default)
#   minimal - the minimal-sambai-1 static site
#
# GitHub Pages for a user/org page (sambai-1.github.io) only serves ONE
# branch. Use this script to flip which one that is via the GitHub API.
#
# Requires: gh CLI (https://cli.github.com/), authenticated (`gh auth login`).
#
# Usage:
#   scripts/swap-site.sh academic-pages   # serve the master branch
#   scripts/swap-site.sh minimal          # serve the minimal branch

set -euo pipefail

REPO="sambai-1/sambai-1.github.io"

case "${1:-}" in
  academic-pages|master)
    BRANCH="master"
    ;;
  minimal)
    BRANCH="minimal"
    ;;
  *)
    echo "Usage: $0 {academic-pages|minimal}" >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install it, or flip the branch manually:" >&2
  echo "  Repo Settings > Pages > Build and deployment > Branch > $BRANCH" >&2
  exit 1
fi

gh api "repos/${REPO}/pages" -X PUT -f "source[branch]=${BRANCH}" -f "source[path]=/"
echo "GitHub Pages now serving branch: $BRANCH"
