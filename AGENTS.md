# AGENTS.md

`CLAUDE.md` is the maintained source of truth for this repo. Read it before starting any task. Where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.

## Read these first

- `CLAUDE.md`: layout, commands, local verification, Firebase projects, feature flags, board isolation, CI and PR rules.
- `components/CLAUDE.md`: UI rules (live tour anchors, scroll panels, contrast, touch panels, on-screen copy). Read it before changing anything under `components/`.
- `components/widgets/CLAUDE.md`: widget scaling, audio, persistence and the appearance standard. Read it before changing a widget.
- `.claude/rules/*.md`: rules for specific files. Each lists its files under `paths` at the top; read the matching one before editing them (`firestore.rules`, anything under `docs/plans/`).
- `.claude/skills/<name>/SKILL.md`: step-by-step workflows written for Claude Code and readable by any agent, such as `fix`, `new-feature`, `ship` and `verify-spartboard`.

## Headline rules

Each is explained in `CLAUDE.md`.

- pnpm only, Node 24+. Install with `pnpm run install:all`.
- Every PR targets `dev-paul`, never `main`.
- Do not run `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc` locally; CI runs them on every push. Run `pnpm exec vitest related --run <changed files>` and let the pre-commit hook lint and format staged files.
- A new user-facing feature ships behind a flag that is off for teachers.
- A widget config key belongs to its board unless it is purely visual.
- Code comments are one short line at most.
- `useEffect` only synchronizes with an external system, and new code never reads or writes `ref.current` during render.
- Lint fails on warnings, on `any`, and on unhandled promises (`await` them or mark them `void`).

## Shared building blocks

- Reuse `Button`, `Modal`, `Toggle`, `SettingsLabel` and `MagicInput` from `components/common/` instead of hand-rolling them.
- Widgets that talk to each other use the Nexus system; document every active connection in `docs/nexus.md`.
- Never set a widget's z-index by hand. Use `bringToFront(id)`.
- Hidden inputs (such as file uploads) need an `aria-label`, and icon-only buttons need an `aria-label` or a `title`.

## Testing

### Unit tests (Vitest)

- Two placements coexist. Component and widget tests sit next to their source under `components/` (`Widget.test.tsx` beside `Widget.tsx`); integration, context and cross-cutting tests go in `tests/`.
- Use `@testing-library/react` and `@testing-library/user-event`, with accessible queries (`getByRole`, `getByText`, `getByLabelText`) rather than `container.querySelector`.
- Mock `useDashboard` and other hooks explicitly when testing a widget in isolation.

### E2E tests (Playwright)

- Specs live in `tests/e2e/`. The Playwright config starts the app with `VITE_AUTH_BYPASS=true`, so tests skip the login screen.
- Disable animations in `beforeEach` by injecting `*, *::before, *::after { transition: none !important; animation: none !important; }` with `page.addStyleTag`.
- For drag-and-drop (dnd-kit) you may need `.click({ force: true })` or explicit drag steps.

### Verified UI selectors

Use these instead of inventing selectors.

| Element                                     | Selector                                                     | Notes                                                            |
| ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Open the widget dock (collapsed → expanded) | `page.getByTitle('Open Tools')`                              | The collapsed dock is one button with `title="Open Tools"`.      |
| Dock container (once expanded)              | `page.locator('[data-testid="dock"]')`                       | The outer dock wrapper.                                          |
| Sidebar / menu button                       | `page.getByTitle('Open Menu')`                               | Top-left menu button.                                            |
| Add a specific widget                       | `page.getByRole('button', { name: /WidgetLabel/i }).first()` | After the dock is open. `.click({ force: true })` if it is busy. |
| A mounted widget on the board               | `page.locator('.widget').first()`                            | `DraggableWindow` gives every widget a `.widget` class.          |

```ts
await page.getByTitle('Open Tools').click();
await expect(page.locator('[data-testid="dock"]')).toBeVisible();
await page
  .getByRole('button', { name: /Clock/i })
  .first()
  .click({ force: true });
await expect(page.locator('.widget').first()).toBeVisible({ timeout: 10_000 });
```

When a selector fails, check in this order before asking a human:

1. The `title` attribute: many icon-only layout buttons use `title`, not `aria-label`.
2. `data-testid` on the element (grep the source).
3. `locales/en.json`: UI strings come from there, so look up the rendered text for a translation key.
4. The component source: `components/layout/Dock.tsx`, `components/layout/sidebar/` and `components/layout/DashboardView.tsx`.
5. `.claude/skills/verify-spartboard/features/`: maintained notes on driving the dock, sidebar, settings drawer and Admin Settings.

Skip a visual E2E check only when the element genuinely cannot be reached (a real camera or microphone), and say why in the PR.
