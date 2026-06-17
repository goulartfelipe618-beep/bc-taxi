---
name: sync-github-bc-taxi
description: Commit and push bc-taxi changes to GitHub (goulartfelipe618-beep/bc-taxi) after completing code edits. Use after implementing features, fixes, or refactors when the user wants the repo kept up to date, or when they mention GitHub, push, sync, or atualizar o projeto.
---

# Sync bc-taxi to GitHub

After finishing a task that modified project files, sync changes to **https://github.com/goulartfelipe618-beep/bc-taxi**.

## When to run

Run at the **end** of a completed implementation task — not after every single file edit mid-task.

Skip when:
- The user explicitly says not to commit or push
- There are no changes to commit
- Only exploratory/read-only work was done

## Workflow

1. **Verify remote**
   ```bash
   git remote get-url origin
   ```
   Expected: `https://github.com/goulartfelipe618-beep/bc-taxi.git` (or equivalent SSH URL).

2. **Inspect changes** — run in parallel:
   ```bash
   git status
   git diff
   git diff --staged
   git log -5 --oneline
   ```

3. **Stage** relevant files. Never stage secrets:
   - `.env`, `.env.*`, credentials, API keys, `local.properties` with secrets

4. **Commit** with a concise message (1–2 sentences, focus on *why*):
   ```bash
   git commit -m "$(cat <<'EOF'
   Short summary of the change.

   EOF
   )"
   ```

5. **Push** to the current branch:
   ```bash
   git push origin HEAD
   ```
   Use `-u origin HEAD` only if the branch has no upstream yet.

6. **Confirm** with `git status` and report the commit hash and branch pushed.

## Safety rules

- NEVER update git config
- NEVER force-push to `main`/`master`
- NEVER skip hooks (`--no-verify`) unless the user explicitly asks
- NEVER commit `.env` or credential files — warn the user if they request it
- If push fails (auth, conflicts), report the error and suggest next steps; do not force-push

## Branch strategy

- Default: push to the current working branch
- If on `main` with uncommitted work from a large feature, prefer creating a feature branch unless the user wants direct commits to `main`
