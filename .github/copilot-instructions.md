# Copilot Instructions for SpartBoard

## Project Overview

**SpartBoard** is a React 19 + TypeScript + Vite application providing 30+ interactive classroom management widgets (timers, noise meters, drawing boards, polls, etc.) with Firebase backend. The project uses a **flat file structure** (no `src/` directory) with all source files at root level.

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Firebase (Auth/Firestore/Storage/Functions), Tailwind CSS, ESLint 9 (flat config), Prettier, Husky, Vitest, Playwright
**Runtime:** Node.js v20+
**Package Manager:** pnpm (v10+) — **always use `pnpm`, never `npm`**

## Critical Build & Validation Requirements

### ⚠️ ZERO-TOLERANCE CODE QUALITY POLICY

**All code changes MUST pass `pnpm run validate` with ZERO errors and ZERO warnings before committing.**

### Installation & Setup

**ALWAYS use `pnpm` for clean, reproducible builds:**

```bash
pnpm install --frozen-lockfile   # Root dependencies
pnpm run install:ci              # Root + functions dependencies (use in CI)
```

**Never use `npm install` or `npm ci`** — this project uses pnpm as its package manager.

### Environment Setup

Create `.env.local` in root directory with these required variables (get values from team):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GEMINI_API_KEY=...
VITE_OPENWEATHER_API_KEY=...
```

**NEVER commit `.env.local` - it's in `.gitignore`.**

For local development without Firebase, set `VITE_AUTH_BYPASS=true` to use a mock admin account and skip login.

### Required Validation Steps (MUST Pass)

Run these commands in this exact order before every commit:

```bash
# 1. Type checking (must have 0 errors)
pnpm run type-check

# 2. Linting (must have 0 errors AND 0 warnings — enforced by --max-warnings 0)
pnpm run lint

# 3. Format checking (must pass)
pnpm run format:check

# 4. Unit tests (must pass)
pnpm test

# 5. Run all checks at once (recommended)
pnpm run validate  # type-check + lint + format:check + test
```

**All checks MUST pass with zero errors and zero warnings.** The ESLint config uses `--max-warnings 0`.

### Strict ESLint Rules (Key Rules Enforced)

The ESLint config (`eslint.config.js`) uses `typescript-eslint` with type-checked rules. Key rules:

- `@typescript-eslint/no-explicit-any` — **error**: never use `any`; define explicit interfaces
- `@typescript-eslint/no-unsafe-assignment/member-access/call/return/argument` — **error**: unsafe TypeScript patterns
- `@typescript-eslint/no-floating-promises` — **error**: all promises must be handled (`await`, `void`, or `.catch()`)
- `@typescript-eslint/no-misused-promises` — **error**: no async functions in non-async contexts
- `@typescript-eslint/no-unused-vars` — **error**: unused variables (except `_`-prefixed)
- `@typescript-eslint/no-non-null-assertion` — **warning**: avoid `!` non-null assertions
- `prettier/prettier` — **error**: all code must match Prettier formatting exactly
- `react-hooks/rules-of-hooks` + `react-hooks/exhaustive-deps` — **error/warning**: hooks rules enforced
- `no-console` — **warning**: only `console.warn` and `console.error` allowed
- `prefer-const` / `no-var` — **error**: always use `const`/`let`

### Prettier Formatting

All files must match Prettier formatting. Run `pnpm run format` to auto-format. Run `pnpm run format:check` to verify. The `prettier` ESLint plugin reports formatting violations as errors.

### Build Commands

```bash
# Development server (runs on http://localhost:3000)
pnpm run dev  # Starts immediately, hot reload enabled

# Production build
pnpm run build  # Outputs to dist/

# Preview production build
pnpm run preview  # Requires successful build first
```

**Build fails without environment variables.** For CI/CD, dummy values are acceptable (see workflows).

### Auto-fixing Issues

```bash
# Auto-fix linting issues
pnpm run lint:fix

# Auto-format all files
pnpm run format
```

**NEVER use eslint-disable, @ts-ignore, or @ts-nocheck comments.** Fix the root cause instead.

## Project Architecture

### Directory Structure

```
/ (root - no src/ directory)
├── components/
│   ├── admin/          - AdminSettings.tsx, FeaturePermissionsManager.tsx
│   ├── auth/           - LoginScreen.tsx
│   ├── common/         - DraggableWindow.tsx, ScaledEmptyState.tsx, etc.
│   ├── layout/         - Sidebar.tsx, Dock.tsx, DashboardView.tsx
│   └── widgets/        - 30+ widget files, WidgetRegistry.ts, WidgetRenderer.tsx
│       ├── TimeTool/   - TimeToolWidget.tsx
│       ├── LunchCount/ - LunchCountWidget.tsx
│       ├── random/     - RandomWidget.tsx, RandomSettings.tsx
│       ├── Schedule/   - ScheduleWidget.tsx, ScheduleSettings.tsx
│       ├── MaterialsWidget/ - MaterialsWidget.tsx
│       ├── stickers/   - StickerBookWidget.tsx
│       ├── InstructionalRoutines/ - Widget.tsx, Settings.tsx
│       └── quiz/       - quiz components
├── context/            - DashboardContext.tsx, AuthContext.tsx, useDashboard.ts, useAuth.ts
├── hooks/              - useFirestore.ts, useStorage.ts, and others
├── config/             - firebase.ts, tools.ts, widgetDefaults.ts, widgetGradeLevels.ts, etc.
├── utils/              - migration.ts and others
├── functions/          - Firebase Cloud Functions (Node.js)
├── scripts/            - setup-admins.js, generate-version.js
├── tests/              - E2E test setup
├── App.tsx             - Root component
├── index.tsx           - Entry point
├── types.ts            - Global types, WidgetType union, all widget config interfaces
├── *.config.{js,ts}    - Configuration files
└── .github/workflows/  - CI/CD pipelines
```

### Key Files (DO NOT MODIFY WITHOUT UNDERSTANDING)

- **types.ts**: Central type system — `WidgetType` union, all widget config interfaces, `WidgetData`, `Dashboard`, `FeaturePermission`, `LiveSession`, etc.
- **config/tools.ts**: `TOOLS` array with metadata (icon, label, color) for every widget type
- **config/widgetDefaults.ts**: Default dimensions and initial config for every widget type
- **components/widgets/WidgetRegistry.ts**: Lazy-loaded widget/settings component map + `WIDGET_SCALING_CONFIG`
- **context/DashboardContext.tsx**: Global state management, widget CRUD, Firestore persistence
- **eslint.config.js**: ESLint 9 flat config — strict rules, `--max-warnings 0`
- **tsconfig.json**: Strict TypeScript with `strict: true`, `noImplicitAny: true`

### Path Aliases

The project uses `@/` as an alias for the **root directory** (not `src/`):

- Configured in both `vite.config.ts` and `tsconfig.json`
- **Always use `@/` for imports** — do not use relative `../../` paths:

  ```typescript
  // ✅ CORRECT
  import { useDashboard } from '@/context/useDashboard';
  import { WidgetData } from '@/types';
  import { db } from '@/config/firebase';

  // ❌ WRONG
  import { useDashboard } from '../../context/useDashboard';
  ```

### State Management Pattern

Use `useDashboard()` hook to access centralized dashboard state:

```typescript
import { useDashboard } from '@/context/useDashboard';

const { widgets, addWidget, updateWidget, deleteWidget, bringToFront } =
  useDashboard();
```

Never manage z-index manually — use `bringToFront(id)`. State persists to Firestore automatically.

### Widget Development Pattern

**Every new widget requires changes to 6 files in this exact order:**

1. **types.ts**: Add to `WidgetType` union, create config interface, add to `WidgetConfig` union, update `ConfigForWidget` helper
2. **config/tools.ts**: Add metadata entry to `TOOLS` array (icon, label, color)
3. **components/widgets/YourWidget.tsx**: Create component; use `WidgetLayout` for structure; always type config via the interface (not `as any`)
4. **components/widgets/WidgetRegistry.ts**: Add lazy-loaded entry to `WIDGET_COMPONENTS`, `WIDGET_SETTINGS_COMPONENTS`, and `WIDGET_SCALING_CONFIG`
5. **config/widgetDefaults.ts**: Add default dimensions and initial config to `WIDGET_DEFAULTS`
6. **config/widgetGradeLevels.ts**: Assign grade levels (k-2, 3-5, 6-8, 9-12)

### Widget Window Architecture

All widgets are wrapped in **`DraggableWindow`** (`components/common/DraggableWindow.tsx`), which provides:

- **Drag to move**: Click and drag title bar
- **Resize**: Drag bottom-right corner handle
- **Flip animation**: Gear icon reveals settings panel (back-face)
- **Z-index management**: Click to bring to front (always use `bringToFront(id)`)
- **Close / Minimize**: Standard window controls

The widget content area (**front-face**) is wrapped in a CSS container (`container-type: size`) so widgets can use container query units. The **settings panel** (back-face) is a standard Tailwind-styled panel — no scaling needed.

Widgets use **`WidgetLayout`** (`components/widgets/WidgetLayout.tsx`) for standard header/content/footer structure:

```tsx
<WidgetLayout
  header={<HeaderContent />} // optional — fixed height
  content={<MainContent />} // fills remaining space
  footer={<FooterContent />} // optional — fixed height
  padding="p-0" // 'p-0' disables padding wrapper
/>
```

### Widget Content Scaling (CRITICAL)

**`WIDGET_SCALING_CONFIG` in `WidgetRegistry.ts`** controls how each widget scales. Nearly all widgets have `skipScaling: true`, meaning they use **CSS Container Queries** natively rather than a CSS `transform: scale()` fallback.

**Two exceptions that keep CSS-transform scaling** (do NOT add `skipScaling: true` to these):

- `drawing` — Canvas relies on fixed coordinate space
- `seating-chart` — Uses absolute-positioned seat nodes

For all `skipScaling: true` widgets, **all text, icons, and spacing in widget front-face content MUST use container query units** via inline `style={{}}` props:

```tsx
// ✅ CORRECT — scales with widget size using cqmin
<span style={{ fontSize: 'min(14px, 5.5cqmin)' }}>Label</span>
<Icon style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }} />
<div style={{ padding: 'min(16px, 3cqmin)', gap: 'min(12px, 2.5cqmin)' }} />

// ❌ WRONG — fixed sizes, won't scale when widget is resized
<span className="text-sm">Label</span>
<Icon className="w-12 h-12" />
<Icon size={24} />
```

**Always use `cqmin`** (1% of the smaller container dimension) for text and icon sizing. Do not mix `cqw` and `cqh` — use `cqmin` for consistent scaling regardless of widget aspect ratio:

```tsx
// ✅ CORRECT — cqmin scales based on the smaller dimension
style={{ fontSize: 'min(24px, 25cqmin)' }}   // hero/primary content
style={{ fontSize: 'min(16px, 7cqmin)' }}    // large subheadings
style={{ fontSize: 'min(14px, 5.5cqmin)' }}  // medium body text
style={{ fontSize: 'min(12px, 4.5cqmin)' }}  // small labels
style={{ fontSize: 'min(10px, 3.5cqmin)' }}  // tiny/footer text

// ❌ WRONG — mixing cqw/cqh is inconsistent
style={{ fontSize: 'min(20cqw, 15cqh)' }}
style={{ fontSize: 'min(14px, 3.5cqw, 5cqh)' }}
```

Use `min(Xpx, Ycqmin)` to cap the maximum size (prevents blurring on large monitors). For fully unbounded scaling use `clamp(minPx, Ycqmin, maxPx)`.

**Settings panels (back-face):** Normal Tailwind classes are fine — no container query scaling needed.

**Empty/error states:** Use the shared `ScaledEmptyState` component (`components/common/ScaledEmptyState.tsx`) instead of hand-rolling per-widget states.

**Reference implementations:** `ClockWidget.tsx`, `WeatherWidget.tsx`, `RecessGearWidget.tsx`.

### Common Pitfalls (AVOID THESE)

- ❌ Editing files in `dist/` or `node_modules/` (build artifacts)
- ❌ Using `any` type (define explicit interfaces — enforced by lint)
- ❌ Unhandled promises (use `void asyncFunc()`, `await`, or `.catch()` — enforced by lint)
- ❌ Suppression comments (`eslint-disable`, `@ts-ignore`, `@ts-nocheck`) — fix the root cause
- ❌ Manual z-index management (use `bringToFront()`)
- ❌ Defining context hooks inside component files (causes React Fast Refresh warnings)
- ❌ Multiple `AudioContext` instances per widget (use the global singleton pattern)
- ❌ Hardcoded Tailwind text/icon sizes in widget front-face content (`text-sm`, `w-12 h-12`, `size={24}`) — use `style={{ fontSize: 'min(Xpx, Ycqmin)' }}` instead
- ❌ Mixing `cqw`/`cqh` units instead of `cqmin` in widget content
- ❌ Hand-rolling per-widget empty/error states — use `ScaledEmptyState`
- ❌ Using relative `../../` import paths — always use the `@/` alias
- ❌ Running `npm` commands — always use `pnpm`

## CI/CD Workflows

### GitHub Actions (All run automatically)

**1. PR Validation** (`.github/workflows/pr-validation.yml`)

- Triggers: PRs to `main` or `dev-*` branches
- Jobs:
  - **quality**: `pnpm run install:ci` → `lint` → `format:check` → `type-check:all`
  - **test**: `pnpm run install:ci` → `pnpm test` (Vitest unit tests)
  - **build**: `pnpm run install:ci` → `pnpm run build:all`
- **All three jobs must pass. Zero warnings tolerated.**

**2. Production Deploy** (`.github/workflows/firebase-deploy.yml`)

- Triggers: Push to `main` branch
- Steps: Same validation + deploy to Firebase Hosting (live site)

**3. Dev Preview Deploy** (`.github/workflows/firebase-dev-deploy.yml`)

- Triggers: Push to `dev-*` branches
- Steps: Same validation + deploy to persistent preview channels (30-day URLs)
- Preview URLs: `spartboard--dev-<name>-<hash>.web.app`

### Pre-commit Hook

Husky runs `lint-staged` automatically on commit:

- Runs `eslint --fix` on staged `.ts`, `.tsx` files
- Runs `prettier --write` on all staged files
- **Commit blocked if errors remain after auto-fix**

## Branching Strategy

- `main` - Production branch (protected, requires PR)
- `dev-*` branches - Developer environments (auto-deploy to preview)
- Feature branches: Create PR from `dev-*` → `main`

**Workflow:** Make changes on dev branch → push → preview URL updates → create PR → merge to main → production deploy

## Firebase Configuration

- **Hosting:** Deploys `dist/` folder, SPA routing via rewrites to `/index.html`
- **Firestore:** Database with security rules in `firestore.rules`
- **Functions:** Cloud Functions in `functions/` directory (Node.js)
- **Authentication:** Google Sign-In only
- **Admin Access:** Controlled via `admins` collection, setup via `scripts/setup-admins.js`

## Quick Reference Commands

```bash
pnpm install --frozen-lockfile  # Install dependencies
pnpm run install:ci             # Install root + functions (use in CI)
pnpm run dev                    # Start dev server (port 3000)
pnpm run validate               # Run ALL checks (REQUIRED before commit)
pnpm run build                  # Production build
pnpm run lint:fix               # Auto-fix linting issues
pnpm run format                 # Auto-format all files
pnpm test                       # Run unit tests (Vitest)
pnpm run test:e2e               # Run E2E tests (Playwright)
```

## Trust These Instructions

These instructions have been validated against the current codebase. Only search or explore if:

- Instructions are incomplete for your specific task
- You encounter errors not mentioned here
- You need to understand implementation details of a specific widget

**For any other scenario, trust and follow these instructions exactly as written.**
