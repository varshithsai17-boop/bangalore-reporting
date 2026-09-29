# Bangalore Reporting: shared project memory

This file is committed to GitHub and synced to both collaborators' laptops, and every Claude session on either machine reads it. It is our shared memory: when you learn something a future session will need (a decision, a gotcha, a setup detail), add a short dated line under **Notes** at the bottom. It reaches the other laptop on the next sync.

People: `varshithsai17-boop` (repo owner) and `Kaushik05code` (collaborator).

## The repo

- `neeru-app/`: **Neeru**, live map of flooded roads. Next.js 16 + Supabase.
- `gaadi-app/`: **Gaadi Bantha?**, garbage van check-ins and ward report cards. Next.js 16 + Supabase.
- Each app is its own Vercel project whose Root Directory is its folder. Pushing to `main` redeploys only the app(s) whose folder changed (`vercel.json` `ignoreCommand` skips the other).
- Secrets live in each app's `.env.local` (gitignored) and in the Vercel project's Environment Variables. Never commit them. Add new variable names to that app's `.env.example`.

## Staying in sync: GitHub `main` is the single source of truth

- `.claude/settings.json` runs `scripts/sync.sh` at session start, before every prompt and after every reply. The script commits local edits, rebases onto GitHub and pushes. The other person's work arrives before you start, and yours goes up when you finish.
- When you finish a piece of work, commit it yourself with a clear message (what changed and why) before the reply ends, and the hook pushes it. Anything left uncommitted gets a generic `Auto-sync:` commit.
- Every push to `main` goes live, so don't leave it broken. Before ending a turn that changed app code, run `npm run typecheck` in that app. If `node_modules` is missing, run `npm install` first.
- If sync reports a conflict: `git pull --rebase`, open each conflicted file and combine both sides (the other person's change is deliberate, so never just keep yours), `git add` the files, `git rebase --continue`, then `scripts/sync.sh`. Never force-push, and never `git reset --hard` over someone's work.
- Outside Claude (editing in VS Code etc.), run `scripts/sync.sh` yourself before and after working.

## Notes

- 2026-09-29: Added auto-sync hooks, this shared CLAUDE.md, and per-app `vercel.json` that skips rebuilding an app whose folder didn't change.
