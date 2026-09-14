#!/usr/bin/env bash
# Sync wiki/ → GitHub Wiki (.wiki.git clone, rsync, push master).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/wiki"
CLONE="${ROOT}/.wiki.git"

if [[ ! -d "${SRC}" ]]; then
  echo "Missing wiki source: ${SRC}" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required (https://cli.github.com/)" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync required" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
WIKI_REMOTE="https://github.com/${REPO}.wiki.git"

# gh provides token for HTTPS git operations
if ! gh auth status >/dev/null 2>&1; then
  echo "gh not authenticated — run: gh auth login" >&2
  exit 1
fi

gh auth setup-git >/dev/null 2>&1 || true

if [[ ! -d "${CLONE}/.git" ]]; then
  echo "Cloning wiki → ${CLONE}"
  if ! git clone "${WIKI_REMOTE}" "${CLONE}" 2>/dev/null; then
    echo "Wiki git repo not initialized yet — creating first push."
    echo "If this fails, create a stub Home page at https://github.com/${REPO}/wiki/new and re-run."
    rm -rf "${CLONE}"
    mkdir -p "${CLONE}"
    git -C "${CLONE}" init -b master
    git -C "${CLONE}" remote add origin "${WIKI_REMOTE}"
  fi
fi

echo "Sync ${SRC}/ → ${CLONE}/"
rsync -av --delete \
  --exclude='.git' \
  --exclude='README.md' \
  "${SRC}/" "${CLONE}/"

cd "${CLONE}"

if [[ -z "$(git status --porcelain)" ]]; then
  echo "Wiki already up to date."
  exit 0
fi

git add -A
git commit -m "Sync wiki from ${REPO}@$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'local')"

# GitHub Wiki default branch is master
if git push origin master; then
  echo "Wiki published: https://github.com/${REPO}/wiki"
else
  echo "" >&2
  echo "Wiki push failed — the .wiki.git remote is not initialized yet." >&2
  echo "GitHub requires one manual page before git push works:" >&2
  echo "  1. Open https://github.com/${REPO}/wiki/_new" >&2
  echo "  2. Title: Home — save any one-line body" >&2
  echo "  3. Re-run: ./scripts/sync-wiki.sh" >&2
  if command -v gh >/dev/null 2>&1; then
    gh browse --wiki 2>/dev/null || true
  fi
  exit 1
fi
