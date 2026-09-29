#!/usr/bin/env bash
# Two-way sync with GitHub: commit local edits, rebase onto the latest remote
# commits, push. Keeps every collaborator's clone identical to GitHub.
#
#   scripts/sync.sh                 run by hand any time
#   scripts/sync.sh --hook=context  Claude Code, session start and before each prompt:
#                                   everything goes to stdout (Claude reads it), exit 0
#   scripts/sync.sh --hook=stop     Claude Code, after each reply: a conflict exits 2
#                                   so Claude resolves it before finishing
#
# It never force-pushes and never discards work. On a conflict it rolls the
# rebase back, so your commits stay local until the conflict is resolved.

set -uo pipefail
export GIT_TERMINAL_PROMPT=0

mode="${1:-}"
stop_hook_active=false
if [ "$mode" = "--hook=stop" ] && grep -q '"stop_hook_active": *true' <<<"$(cat)"; then
  stop_hook_active=true
fi

# kind is "conflict" (Claude can fix it) or "other" (needs a person, e.g. offline)
fail() {
  local kind=$1 msg="GitHub sync: $2"
  case "$mode" in
    --hook=context) echo "$msg"; exit 0 ;;
    --hook=stop)
      echo "$msg" >&2
      if [ "$kind" = conflict ] && ! $stop_hook_active; then exit 2; fi
      exit 1 ;;
    *) echo "$msg" >&2; exit 1 ;;
  esac
}

cd "$(dirname "$0")/.." || exit 1
gitdir=$(git rev-parse --absolute-git-dir) || exit 1

# One sync at a time per clone; a lock older than 5 minutes is left over from a crash.
lock="$gitdir/sync.lock"
if ! mkdir "$lock" 2>/dev/null; then
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$lock" 2>/dev/null' EXIT

if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ] || [ -f "$gitdir/MERGE_HEAD" ]; then
  fail conflict "a rebase or merge is in progress. Resolve the conflicted files, then 'git rebase --continue' (or 'git commit' for a merge), then run scripts/sync.sh."
fi

branch=$(git symbolic-ref --quiet --short HEAD) || fail other "not on a branch (detached HEAD); check out main first."

# 1. Commit whatever is uncommitted (.gitignore keeps secrets and builds out).
git add -A
if ! git diff --cached --quiet; then
  files=$(git diff --cached --name-only)
  count=$(wc -l <<<"$files" | tr -d ' ')
  summary=$(head -n 1 <<<"$files")
  [ "$count" -gt 1 ] && summary="$summary and $((count - 1)) more"
  git commit -q -m "Auto-sync: $summary" || fail other "git commit failed (is git user.name/user.email set?)."
fi

if ! git rev-parse --quiet --verify '@{u}' >/dev/null; then
  git push -q -u origin "$branch" || fail other "couldn't push new branch '$branch' to GitHub."
  echo "GitHub sync: pushed new branch '$branch'."
  exit 0
fi

# 2 and 3. Rebase onto GitHub, then push. Retry if the other person pushed in between.
for attempt in 1 2 3; do
  git fetch -q origin 2>/dev/null || fail other "couldn't reach GitHub (offline?). Your work is committed locally and will sync next time."

  incoming=$(git log --format='  %h %an: %s' 'HEAD..@{u}')
  if [ -n "$incoming" ]; then
    if ! git rebase -q '@{u}' >/dev/null 2>&1; then
      conflicted=$(git diff --name-only --diff-filter=U | paste -sd, - | sed 's/,/, /g')
      git rebase --abort
      fail conflict "your commits and the new commits on GitHub both changed: ${conflicted}. Nothing was lost: your commits are still local and unpushed. To fix: 'git pull --rebase', edit the conflicted files keeping both people's changes, 'git add' them, 'git rebase --continue', then run scripts/sync.sh."
    fi
    echo "GitHub sync: pulled new commits:"
    echo "$incoming"
  fi

  outgoing=$(git log --format='  %h %s' '@{u}..HEAD')
  [ -z "$outgoing" ] && exit 0
  if git push -q origin "$branch" 2>/dev/null; then
    echo "GitHub sync: pushed:"
    echo "$outgoing"
    exit 0
  fi
done
fail other "push to GitHub kept failing. Your commits are safe locally; run scripts/sync.sh again."
