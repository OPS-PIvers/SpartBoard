# Linting and Type Checking Setup

This document describes the linting and type checking setup for the SPART Board project.

## Tools Installed

### ESLint

- **Version**: 9.x with flat config format
- **Purpose**: Enforces code quality and catches common bugs
- **Config File**: `eslint.config.js`

### TypeScript

- **Compiler**: TypeScript 5.8.2
- **Purpose**: Static type checking to catch type errors before runtime
- **Config File**: `tsconfig.json`

### Prettier

- **Purpose**: Automatic code formatting for consistent style
- **Config File**: `.prettierrc`

### Husky

- **Purpose**: Git hooks to run linters before commits
- **Config**: `.husky/pre-commit`

### lint-staged

- **Purpose**: Only lint files that are staged for commit
- **Config**: In `package.json` under `lint-staged` key

## Available Scripts

### Development Scripts

- `npm run lint` - Run ESLint on all files (fails on errors, allows warnings)
- `npm run lint:fix` - Run ESLint and auto-fix issues where possible
- `npm run type-check` - Run TypeScript type checking
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check if files are formatted correctly
- `npm run validate` - Run all checks (type-check + lint + format:check)

### Pre-commit Hook

When you commit code, `husky` automatically runs `lint-staged`, which:

1. Runs ESLint with auto-fix on staged `.ts` and `.tsx` files
2. Runs Prettier on staged files
3. Allows the commit if no errors are found (warnings are allowed)

## Current Status

### TypeScript Type Checking

✅ **PASSING** - All TypeScript compilation errors have been resolved

### ESLint Status

⚠️ **44 errors, 268 warnings**

The remaining issues are primarily:

- Unused variables and imports
- Empty functions and catch blocks
- Unfloated promises
- React-specific warnings

These are tracked for future cleanup but won't block commits.

## Configuration Details

### ESLint Rules

The ESLint configuration uses:

- `@typescript-eslint` recommended rules for type checking
- React and React Hooks rules
- Prettier integration
- Custom rules for code quality

Key rules:

- **Errors** (will block CI builds):
  - `@typescript-eslint/no-unused-vars` - Unused variables must start with `_`
  - `@typescript-eslint/no-floating-promises` - Promises must be handled
  - `no-debugger` - No debugger statements
  - `prettier/prettier` - Code must be formatted

- **Warnings** (won't block commits):
  - `@typescript-eslint/no-explicit-any` - Avoid using `any` type
  - `@typescript-eslint/no-unsafe-*` - Unsafe type operations
  - `no-console` - Console logs (except warn/error)

### TypeScript Compiler Options

Strict type checking is enabled with:

- `strict: true` - All strict type-checking options
- `noImplicitAny: true` - Error on implicit any types
- `strictNullChecks: true` - Strict null checking
- `noImplicitReturns: true` - Functions must return values consistently

## Fixing Linting Issues

### Auto-fixable Issues

Run `npm run lint:fix` to automatically fix:

- Formatting issues
- Import order
- Simple code style issues

### Manual Fixes Required

#### Unused Variables

Prefix unused variables with underscore:

```typescript
// Before
const [isOpen, setIsOpen] = useState(false);

// After (if isOpen is unused)
const [_isOpen, setIsOpen] = useState(false);
```

#### Floating Promises

Handle promises properly:

```typescript
// Before
fetchData();

// After
void fetchData(); // or
fetchData().catch(console.error); // or
await fetchData();
```

#### Empty Functions

Either implement or document why empty:

```typescript
// Before
catch (e) {}

// After
catch (_e) {
  // Intentionally ignoring error
}
```

## CI/CD Integration

### GitHub Actions Workflows

This project has three automated workflows configured:

#### 1. PR Validation (`pr-validation.yml`)

Runs on all pull requests to `main` and `dev-*` branches:

- ✅ Type checking (`npm run type-check`)
- ✅ Linting (`npm run lint`)
- ✅ Code formatting check (`npm run format:check`)
- ✅ Build verification (`npm run build`)
- 💬 Adds comment to PR with validation results

**Purpose**: Ensures no broken code can be merged via pull requests.

#### 2. Main Branch Deploy (`firebase-deploy.yml`)

Runs on pushes to `main` branch:

- ✅ Type checking
- ✅ Linting
- ✅ Code formatting check
- 🏗️ Production build
- 🚀 Deploy to Firebase live environment

**Purpose**: Validates and deploys production code.

#### 3. Dev Branch Deploy (`firebase-dev-deploy.yml`)

Runs on pushes to `dev-paul`, `dev-jen`, `dev-bailey` branches:

- ✅ Type checking
- ✅ Linting
- ✅ Code formatting check
- 🏗️ Preview build
- 🚀 Deploy to Firebase preview channel (30-day persistent URLs)

**Purpose**: Validates and creates preview deployments for development branches.

### All Workflows Enforce

- **Zero TypeScript errors** - Build fails if type check fails
- **Zero ESLint errors** - Build fails if linting errors exist
- **Proper formatting** - Build fails if code isn't formatted with Prettier
- **Successful build** - Build must complete without errors

Warnings are allowed but logged for review.

## Next Steps for Cleanup

1. Remove unused imports and variables (44 errors)
2. Add proper error handling for floating promises
3. Implement empty catch blocks or remove them
4. Consider enabling stricter rules as code quality improves

## Developer Guidelines

### Before Committing

- The pre-commit hook will automatically format and lint your staged files
- If you see errors, fix them before committing
- Warnings won't block your commit but should be addressed eventually

### Before Pushing

- Run `npm run validate` to ensure all checks pass
- This runs type-check, lint, and format-check

### In Pull Requests

- All type errors must be fixed
- No new ESLint errors should be introduced
- Warnings should be minimized but won't block merges

## Troubleshooting

### "Unsafe assignment" warnings

These occur when TypeScript can't verify type safety. Consider:

1. Adding explicit type annotations
2. Using type assertions carefully: `as Type`
3. Refactoring to avoid `any` types

### ESLint ignoring files

Check `.eslintignore` - currently ignores:

- `dist/`
- `node_modules/`
- `*.config.js`
- `*.config.ts`
- `scripts/`

### Pre-commit hook failing

If the pre-commit hook fails:

1. Check the error message
2. Run `npm run lint:fix` to auto-fix issues
3. Manually fix remaining errors
4. Stage your fixes and commit again
