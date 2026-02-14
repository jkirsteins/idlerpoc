# Feature Workflow Skill

---

name: feature-workflow
description: >-
Implements features and fixes for the sellgame project.
Use when user says "implement", "add feature", "fix bug", "work on", or describes
a code change to make. Handles implementation, quality gates, committing, PR creation,
Vercel deploy verification, and optional merge.

---

## Overview

This skill automates the complete feature development lifecycle for the sellgame project. The workflow ensures production-quality code through automated quality gates before creating a PR.

## Workflow

### Phase 1: Implementation

1. Read `CLAUDE.md` and any relevant documentation in `docs/` to understand project conventions

2. Implement the requested feature or fix following these standards:
   - No `any` types - use proper TypeScript typing
   - No incomplete code or TODOs - fully implement the feature
   - Fix root causes, don't work around issues
   - Follow the project's UI component architecture (mount-once/update-on-tick pattern)
   - Use centralized formatting functions for all player-visible values
   - Add event logging for observable events (update catch-up report if needed)
   - Integrate with the skill system where applicable
   - Update Gamepedia articles when mechanics change

3. For large tasks:
   - Break into subtasks using TaskCreate
   - Use TaskUpdate to track progress
   - Work systematically through each subtask

### Phase 2: Quality Gates (ALL must pass)

Run each gate in order. If ANY gate fails, fix the issue and re-run ALL gates from the start:

1. **TypeScript type checking**:

   ```bash
   npx tsc --noEmit
   ```

   Must produce zero errors.

2. **ESLint**:

   ```bash
   npm run lint
   ```

   **Must produce zero warnings and zero errors.** The gate FAILS if there are any warnings. Pre-commit hooks will reject code with warnings, so this gate must enforce the same standard.

3. **Prettier formatting**:

   ```bash
   npm run format:check
   ```

   All files must be properly formatted.

4. **Test suite**:

   ```bash
   npm run test
   ```

   All tests must pass.

5. **Production build**:
   ```bash
   npm run build
   ```
   Must complete successfully with no errors.

**Critical**: Do not proceed to Phase 3 until all five gates pass cleanly. If you encounter pre-existing failures in the codebase, fix them as part of this work.

See `references/quality-gates.md` for common failure patterns and solutions.

### Phase 3: Commit

1. Review changed files:

   ```bash
   git status
   ```

2. Stage specific files (never use `git add .` or `git add -A`):

   ```bash
   git add <file1> <file2> ...
   ```

   Verify no secrets or unintended files are staged.

3. Create commit with a concise message:

   ```bash
   git commit -m "Brief description of change"
   ```

   - Focus on the "what" and "why"
   - No "Co-Authored-By" or "Generated with Claude Code" footers
   - Keep it under 72 characters if possible

4. Push to remote:
   ```bash
   git push -u origin HEAD
   ```

### Phase 4: PR Creation

1. Create pull request:

   ```bash
   gh pr create --title "Brief title matching commit message" --body "$(cat <<'EOF'
   ## Summary
   [1-2 sentences describing the change]

   ## Test plan
   [Bulleted list of how to verify the change works]
   EOF
   )"
   ```

2. Capture and display the PR URL to the user

3. Extract the PR number from the URL for Phase 5

### Phase 5: Vercel Deploy Verification

1. Poll for Vercel deployment status by checking PR comments:

   ```bash
   gh api repos/jkirsteins/idlerpoc/issues/<pr-number>/comments
   ```

2. Look for a comment from `vercel[bot]` containing a deployment URL (usually `https://sellgame-*.vercel.app`)

3. Poll every 30 seconds, timeout after 10 minutes (20 attempts)

4. **On success**:
   - Extract the preview URL from the comment
   - Display to user: "Vercel deployment successful: <URL>"
   - Ask: "Would you like me to merge this PR now? (yes/no)"

5. **On failure** (timeout or deployment error):
   - Fetch Vercel deployment details if available
   - Show error output to help user understand what went wrong
   - Suggest manual investigation

### Phase 6: Merge (conditional)

1. If user confirms merge:

   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```

   - Squash merge combines all commits into one
   - Remote branch is automatically deleted

2. If user declines:
   - Inform them the PR is open at <URL> for manual handling
   - They can review the Vercel preview and merge later

## Error Handling

- If quality gates fail repeatedly: help user understand the root cause
- If PR creation fails: check GitHub CLI authentication and permissions
- If Vercel deployment times out: suggest checking Vercel dashboard manually

## Notes

- The `claude/` branch prefix keeps feature branches organized
- Squash merge keeps main branch history clean
- Quality gates ensure production-ready code
- Vercel preview lets user test changes before merge
