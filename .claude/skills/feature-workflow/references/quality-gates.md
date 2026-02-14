# Quality Gates Reference

This document provides detailed information about each quality gate and common failure patterns.

## Gate 1: TypeScript Type Checking

**Command**: `npx tsc --noEmit`

**Purpose**: Ensures type safety across the entire codebase without generating output files.

### Common Failures

1. **Missing type annotations**:

   ```
   Parameter 'x' implicitly has an 'any' type.
   ```

   Fix: Add explicit type annotation: `function foo(x: number) { ... }`

2. **Type mismatch**:

   ```
   Type 'string' is not assignable to type 'number'.
   ```

   Fix: Check the data flow and ensure types match. Use type guards or conversions where appropriate.

3. **Undefined property**:

   ```
   Property 'foo' does not exist on type 'Bar'.
   ```

   Fix: Add the property to the type definition or use optional chaining if the property may not exist.

4. **Strict null checks**:
   ```
   Object is possibly 'null' or 'undefined'.
   ```
   Fix: Add null checks or use optional chaining: `obj?.property`

## Gate 2: ESLint

**Command**: `npm run lint`

**Purpose**: Enforces code quality rules and catches common bugs.

**CRITICAL**: This gate **FAILS** if there are ANY warnings or errors. The exit code must be 0 with completely clean output. Pre-commit hooks will reject commits with warnings, so this gate must enforce the same standard to avoid wasted work.

### Common Failures

1. **Unused variables**:

   ```
   'foo' is assigned a value but never used.
   ```

   Fix: Remove unused variables or prefix with `_` if intentionally unused in some contexts.

2. **Prefer const**:

   ```
   'foo' is never reassigned. Use 'const' instead.
   ```

   Fix: Change `let` to `const`.

3. **No any**:

   ```
   Unexpected any. Specify a different type.
   ```

   Fix: Use a specific type. Never suppress this error - always fix it properly.

4. **Import order**:
   ```
   Import statements are not sorted.
   ```
   Fix: Reorder imports according to project conventions (usually: external deps, then internal modules).

## Gate 3: Prettier Formatting

**Command**: `npm run format:check`

**Purpose**: Ensures consistent code formatting across the project.

### Common Failures

1. **Inconsistent formatting**:
   ```
   Code style issues found in the above file(s). Forgot to run Prettier?
   ```
   Fix: Run `npm run format` to auto-format all files, then re-check.

### Notes

- Prettier is opinionated and non-configurable by design
- Always run `npm run format` before committing
- If format:check fails, you likely edited code without formatting

## Gate 4: Test Suite

**Command**: `npm run test`

**Purpose**: Verifies that all unit tests pass and no regressions were introduced.

### Common Failures

1. **Test failures**:

   ```
   FAIL src/foo.test.ts
   ✕ should calculate correctly (5 ms)
   ```

   Fix: Investigate the failing test. Either your change broke existing functionality or the test needs updating.

2. **Missing tests**:
   - Not a gate failure, but consider: did you add tests for new functionality?
   - Check if similar code has test coverage and follow the pattern

3. **Snapshot mismatches**:
   ```
   Snapshot mismatch for "renders component correctly"
   ```
   Fix: Review the diff. If the change is intentional, update snapshots with `npm run test -- -u`.

### Notes

- Never skip tests or mark them as `.skip()` to make the gate pass
- If a test is flaky, fix the flakiness rather than ignoring it
- Pre-existing test failures must be fixed as part of your work

## Gate 5: Production Build

**Command**: `npm run build`

**Purpose**: Ensures the code builds successfully for production deployment.

### Common Failures

1. **Build errors**:

   ```
   Error: Could not resolve import "foo" from "bar.ts"
   ```

   Fix: Check import paths and ensure all dependencies are installed.

2. **TypeScript compilation errors**:
   - Usually caught by Gate 1, but build uses different tsconfig
   - Fix any remaining type errors

3. **Vite bundle errors**:

   ```
   Error: Build failed with 1 error
   ```

   Fix: Check the full error output. Common causes: circular dependencies, missing deps, invalid imports.

4. **Out of memory**:
   ```
   JavaScript heap out of memory
   ```
   Fix: Rare for this project. If it happens, increase Node memory limit or check for infinite loops in build process.

### Notes

- Build must complete successfully with zero errors
- Warnings are acceptable if they're pre-existing (but consider fixing them)
- Build output goes to `dist/` - don't commit this directory

## General Troubleshooting

### "Pre-existing failures in main branch"

If quality gates fail on a clean worktree from origin/main, you need to fix those issues first:

1. Verify the failure isn't caused by your local environment
2. Check if main branch CI is passing
3. If main is broken, fix the breakage as part of your PR
4. If it's an environment issue, check Node version and dependencies

### "Gates pass individually but fail together"

Some failures only appear in specific sequences:

1. Format first: `npm run format`
2. Then run all gates in order
3. A linting fix might introduce a type error, or vice versa
4. Iterate until all gates pass in sequence

### "Can't figure out why a gate is failing"

1. Read the full error message carefully
2. Check the file paths - are you in the right directory?
3. Search the error message online
4. Check if similar code in the project handles the same pattern
5. Ask the user for guidance if truly stuck
