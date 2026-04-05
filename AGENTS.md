# AGENTS.md

> **Attention Agents:** This file contains critical information about the project structure, development workflows, and coding standards. Please read it carefully before starting any task.

## 1. Project Overview

**SPART Board** is a React-based dashboard application for classrooms, built with:

- **Frontend:** React ^19.2.4, TypeScript ^5.9.3, Vite ^6.4.1
- **Styling:** Tailwind CSS
- **State Management:** React Context (`DashboardContext`, `AuthContext`) + Firestore (real-time)
- **Backend:** Firebase Functions (Node.js 22 runtime + TypeScript)
- **Testing:** Vitest (Unit), Playwright (E2E)
- **Linting:** ESLint (Flat Config), Prettier

### Key Directories

- `components/`: UI components.
  - `admin/`: Administrative tools (e.g., `AdminSettings.tsx`).
  - `common/`: Shared, reusable components (e.g., `Button`, `Modal`).
  - `layout/`: Layout components (e.g., `Sidebar`, `Dock`).
  - `widgets/`: Individual widget implementations (e.g., `ClockWidget`, `SeatingChartWidget`).
- `config/`: Configuration files (e.g., `widgetDefaults.ts`, `tools.ts`).
- `context/`: React Context definitions and hooks.
- `hooks/`: Custom React hooks.
- `functions/`: Firebase Cloud Functions.
- `.github/workflows/`: CI validation and deployment pipelines.
- `locales/`: Translation files (notably `locales/en.json` for rendered UI strings).
- `tests/`: Test files (E2E and unit tests for utilities). Note: Component tests are often co-located.

---

## 2. State Management

- **`DashboardContext`**: The central store for dashboard state, widgets, dock items, and rosters.
  - **Hook:** `useDashboard()` provides access to state and actions (e.g., `addWidget`, `updateWidget`).
- **`AuthContext`**: Manages user authentication and role-based access (Admin vs. User).
- **Persistence**:
  - **Firestore**: Real-time sync for dashboards.
  - **Google Drive**: Automatic background sync for non-admins via `useGoogleDrive`.
  - **LocalStorage**: Persists tool visibility and dock organization.

---

## 3. Widget System

Widgets are the core building blocks of the dashboard. They are modular, draggable, and resizable.

### Architecture

- **Registry**: `components/widgets/WidgetRegistry.ts` maps widget types to their components and settings panels. It handles lazy loading.
- **Defaults**: Initial dimensions and configuration are defined in `config/widgetDefaults.ts`.
- **Grade Levels**: `config/widgetGradeLevels.ts` controls which widgets are available for different grade bands.

### Scaling Strategies

The app uses a hybrid scaling approach:

1.  **CSS Container Queries (Preferred):** Newer widgets (e.g., `TimeTool`, `Clock`) set `skipScaling: true` in `WidgetRegistry.ts`.
    - **Rule:** Use container query units (`cqw`, `cqh`, `cqmin`) for all internal sizing (font, padding, icons) to ensure responsiveness.
    - **Example:** `fontSize: 'min(14px, 3.5cqmin)'`
2.  **JS-Based Scaling (Legacy):** Older widgets use `ScalableWidget` which applies a CSS `transform: scale(...)`.

### Nexus (Inter-Widget Communication)

Widgets can communicate via the "Nexus" system.

- **Documentation:** All active connections must be documented in `.Jules/nexus.md`.
- **Pattern:** Widgets can "push" actions (e.g., Randomizer triggering a Timer) or "pull" data (e.g., Weather widget reading location).

---

## 4. UI & Components

Use these standardized components to maintain consistency:

- **`Button`**: The primary button component. Supports `variant` (primary, secondary, ghost, danger, hero) and `size`.
- **`SettingsLabel`**: Standard label for settings panels. (`text-xxs font-black uppercase tracking-widest`).
- **`Modal`**: Standard dialog component. Handles overlays, closing on Escape, and focus management.
- **`Toggle`**: Switch component for boolean settings.
- **`MagicInput`**: specialized input for AI generation tasks.

**Styling:** Use Tailwind CSS utility classes. Avoid custom CSS files unless absolutely necessary.

---

## 5. Development Workflow

### Scripts (pnpm)

- **`pnpm run dev`**: Start the development server.
- **`pnpm run validate`**: **Run this before pushing.** Executes `type-check:all`, `lint`, `format:check`, and `test`.
- **`pnpm run type-check:all`**: Type-checks root app and Firebase functions.
- **`pnpm run lint:fix`**: Automatically fix linting errors.
- **`pnpm run test`**: Run unit tests (Vitest).
- **`pnpm run test:e2e`**: Run end-to-end tests (Playwright).

### Strict quality gate (required)

- Workflows fail if there are **any** lint, TypeScript, or Prettier issues (including warnings where applicable).
- Treat `pnpm run lint`, `pnpm run type-check:all`, and `pnpm run format:check` as mandatory pre-PR checks.
- Keep the repository warning-free and formatting-clean at all times.

### Authentication

- **Local Dev**: Set `VITE_AUTH_BYPASS=true` in `.env.local` to skip login and use a mock admin account.

### CI/CD

- **Validation**: The `pr-validation.yml` workflow runs on every PR. It executes `lint`, `format:check`, `type-check:all`, unit tests, and E2E tests.
- **Deployment**: `firebase-deploy.yml` handles production deployments.

---

## 6. Testing Guidelines

### Unit Tests (Vitest)

- **File placement** — Two patterns coexist; follow the convention that fits the test's scope:
  - **Co-located** (preferred for component/widget tests): place `Widget.test.tsx` next to `Widget.tsx` inside `components/`.
  - **Centralized** (`tests/` directory): use for integration tests, context tests, cross-cutting utilities, and anything that doesn't belong to a single component (e.g., `tests/DashboardContext_sharing.test.tsx`, `tests/utils/`).
  - Utility tests live next to their source in `utils/` (e.g., `utils/migration.test.ts`).
- **Best Practices**:
  - Use `@testing-library/react` and `@testing-library/user-event`.
  - Avoid `container.querySelector`. Use accessible queries (`getByRole`, `getByText`, `getByLabelText`).
  - **Mocking**: Explicitly mock `useDashboard` and other hooks when testing widgets in isolation.

### E2E Tests (Playwright)

- **Location**: `tests/e2e/`.
- **Interaction**: Use `user-event` patterns. For drag-and-drop (dnd-kit), you may need `.click({ force: true })` or specific drag steps.
- **Selectors**: Use stable selectors like `data-testid` or accessible roles.
- **Auth bypass**: Set `VITE_AUTH_BYPASS=true` so E2E tests skip the login screen entirely.
- **Disable animations**: Inject `*, *::before, *::after { transition: none !important; animation: none !important; }` via `page.addStyleTag` in `beforeEach` to keep tests stable.

### Verified UI Selectors (Playwright)

These are the canonical, stable selectors for key interactive elements. **Do not guess or invent selectors** — use these.

| Element                                     | Selector                                                     | Notes                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Open the widget dock (collapsed → expanded) | `page.getByTitle('Open Tools')`                              | The collapsed dock shows a single blue `LayoutGrid` icon button with `title="Open Tools"`. Click it to expand the full toolbar. |
| Dock container (once expanded)              | `page.locator('[data-testid="dock"]')`                       | The outer dock wrapper always present in the DOM.                                                                               |
| Sidebar / menu button                       | `page.getByTitle('Open Menu')`                               | Top-left hamburger/menu button.                                                                                                 |
| Add a specific widget                       | `page.getByRole('button', { name: /WidgetLabel/i }).first()` | After the dock is open. Use `.click({ force: true })` in case of animation overlap.                                             |
| A mounted widget on the board               | `page.locator('.widget').first()`                            | Widgets receive a `.widget` class from `DraggableWindow`.                                                                       |

**Example — opening the dock and adding a Clock widget:**

```ts
// 1. Open the collapsed dock
await page.getByTitle('Open Tools').click();
// With animations disabled, wait for the dock container to be visible before proceeding.
await expect(page.locator('[data-testid="dock"]')).toBeVisible();

// 2. Click the Clock tool button
await page
  .getByRole('button', { name: /Clock/i })
  .first()
  .click({ force: true });

// 3. Assert widget appeared
await expect(page.locator('.widget').first()).toBeVisible({ timeout: 10_000 });
```

### Frontend Verification Decision Tree

When a Playwright selector fails, follow this order before asking a human:

1. **Check `title` attribute** — many icon-only buttons use `title` (not `aria-label`). Try `page.getByTitle('...')`.
2. **Check `data-testid`** — grep the source for `data-testid` on the element.
3. **Check `data-role`** — some layout elements use `data-role` (e.g., `data-role="dock"`).
4. **Check the locale file** — UI strings come from `locales/en.json`. If a label looks like a translation key, look it up there to find the rendered string.
5. **Read the component source** — `components/layout/Dock.tsx`, `components/layout/Sidebar.tsx`, `components/layout/DashboardView.tsx` are the primary layout files. Read them before inventing a selector.
6. **Skip visual E2E and proceed with code review** only if the element is genuinely inaccessible (e.g., requires a real camera/microphone). Document the skip reason in the PR.

---

## 7. Common Pitfalls & Standards

1.  **Strict Linting**: The project treats warnings as errors (`max-warnings 0`).
    - **No Explicit Any**: Do not use `any`. Define proper interfaces.
    - **Strict Null Checks**: Handle `null` and `undefined` explicitly. Optional chaining (`?.`) is your friend, but be aware of strict checks in CI.
2.  **Z-Index**: Do not manually manage z-indexes. Use the `bringToFront` action from `DashboardContext`.
3.  **Floating Promises**: Always handle promises. Use `void` if you intentionally want to ignore the result (e.g., `void myFunction()`), or `await` it.
4.  **Accessibility**:
    - Hidden inputs (like file uploads) must have `aria-label`.
    - Icon-only buttons must have either `aria-label` **or** `title` — both are acceptable. Many layout buttons (e.g., dock open/close, sidebar toggle) use `title`; component-level icon buttons (e.g., `IconButton`) use `aria-label`. When writing Playwright selectors, check for `title` first (it is more common in layout-level elements); see the Verified UI Selectors table above.
5.  **React Hooks — useEffect is an escape hatch, not a default tool**:
    - `useEffect` must return `undefined` or a cleanup function. Do not return `null` or `false`.
    - Dependency arrays must be exhaustive (enforced by linter).
    - **Only use `useEffect` to synchronize with an external system** (Firestore listeners, Firebase Auth,
      Web Audio API, DOM event listeners, timers, `localStorage`, Google Drive, etc.).
    - **Do NOT use `useEffect` for:**
      - Computing derived/transformed data → calculate it inline during render instead.
      - Syncing state into refs → assign `ref.current = value` directly in the render body; refs are
        mutable containers and do not need an effect.
      - Resetting state when a prop changes → use the `key` prop to remount the component, or use the
        "adjusting state while rendering" pattern (store previous value, compare during render, call
        setter immediately if different).
      - Triggering state changes based on other state changes → compute the result during the event
        handler that caused the change instead.
    - **Patterns to use instead:**
      - Derived value: `const fullName = firstName + ' ' + lastName;` (no state, no effect)
      - Expensive derivation: `const result = useMemo(() => compute(a, b), [a, b]);`
      - Reset all state on prop change: `<Inner key={id} />` (React resets state on key change)
      - Adjust partial state on prop change: compare `prevProp !== prop` during render, call setter
        immediately — React re-renders and stops on the next pass when they match.

## Widget Appearance Standard (Visual System)

All agents must follow the shared widget appearance model when building or updating configurable widgets:

- Use shared settings primitives in widget style tabs:
  - `components/common/TypographySettings.tsx`
  - `components/common/TextSizePresetSettings.tsx`
  - `components/common/SurfaceColorSettings.tsx`
- Prefer these config fields for visual controls:
  - `fontFamily`
  - `fontColor`
  - `textSizePreset` (`small` | `medium` | `large` | `x-large`)
  - `cardColor`
  - `cardOpacity`
- Keep universal transparency in the global settings shell; do not duplicate full-widget transparency controls inside widget-specific style tabs.
- Ensure front-face widgets actually consume settings values (no dead controls).
- Default widget roots should remain visually transparent; only add localized readability surfaces where content legibility requires it.
