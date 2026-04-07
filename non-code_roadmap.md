# SpartBoard No-Code/Low-Code Admin Roadmap

This document outlines opportunities to shift customization, design, and widget creation from code-level changes (React/Tailwind) into dynamic, admin-configurable settings within the SpartBoard application. This shift lowers the barrier to scaling the app across different domains, empowering admins to match their branding and utility needs without coding.

> **Implementation status key:**
>
> - ✅ **Done** — fully implemented and shipped
> - 🔲 **Remaining** — planned but not yet implemented

---

## Phase 1: Global Branding & Theming (Design Customization)

Currently, the application relies heavily on hardcoded Tailwind utility classes and predefined `tailwind.config.js` settings for colors, fonts, and global styles.

### Opportunities

1.  ✅ **Dynamic Color Palettes:**
    - **Implemented:** `GlobalStyle` extended with `primaryColor`, `accentColor`, and `windowTitleColor` (optional hex strings). These are injected as CSS custom properties (`--spart-primary`, `--spart-accent`, `--spart-window-title`) on the dashboard root element at runtime, so any component can reference them via `var(--spart-primary)` without touching `tailwind.config.js`.
    - A new **"Colors" tab** in `StylePanel` provides color pickers for each variable with per-color and bulk reset-to-default buttons. Changes save alongside the rest of `GlobalStyle` in Firestore.
    - **Remaining:** Tailwind utility classes (e.g. `bg-brand-blue-primary`) still use the compile-time tokens. To make those classes themselves dynamic, the Tailwind config would need to map to the CSS variables — a larger refactor deferred for a future pass.

2.  🔲 **Custom Typography (Fonts):**
    - **Current State:** 11 font families (sans, serif, handwritten, retro, etc.) are selectable in `StylePanel`. All are loaded statically at build time.
    - **Goal:** Allow admins to select arbitrary Google Fonts or upload custom font files for their district. Store the font family name in Firestore and dynamically inject a `<link>` tag to load it.
    - **Remaining:** Implement a Google Fonts picker (API search or curated list), dynamic `<link>` injection in `DashboardView`, and `@font-face` upload via Firebase Storage.

3.  ✅ **UI Elements Styling (Borders, Transparencies):**
    - **Implemented:** `StylePanel` already provides sliders and selectors for `windowTransparency`, `windowBorderRadius`, `dockTransparency`, `dockBorderRadius`, `dockTextColor`, and `dockTextShadow`. All values persist to Firestore via `setGlobalStyle()`.

4.  ✅ **Custom Backgrounds & Logos:**
    - **Implemented:** `BackgroundManager` admin panel allows uploading and managing background presets. Global branding UI added to `GlobalPermissionsManager` for uploading a custom logo to replace the default SpartBoard logo in the sidebar header. The logo URL is stored in the `app_settings` global Firestore configuration.

---

## Phase 2: Comprehensive Widget Configuration

Many widgets currently lack global admin settings, relying instead on user-level configuration or hardcoded behaviors.

### Opportunities

1.  ✅ **Implement Pending Widget Admin Configs:**
    - **Implemented:** All major widgets now have admin configuration panels, including:
      - **Magic (AI):** `MagicConfigurationPanel.tsx` — daily AI rate limits, default prompt suggestions (via `SchemaDrivenConfigurationPanel`).
      - **Record:** `RecordConfigurationPanel.tsx` — max duration/resolution caps (via `SchemaDrivenConfigurationPanel`).
      - Classes, Drawing, Embed, Poll, QR Code, Seating Chart, Smart Notebook, Breathing, Number Line, Concept Web, Syntax Framer, Hotspot Image, Reveal Grid, Car Rider, Next Up — all have `*ConfigurationPanel.tsx` files registered in `FeatureConfigurationPanel.tsx`.
      - **PDF Viewer:** Managed via the dedicated `PdfLibraryModal` (global library with per-PDF building targeting), accessible directly from the Feature Permissions manager.
    - **Quiz** is intentionally excluded from the building-defaults system — its admin surface is the widget's own Drive-backed quiz management interface. A future "District Curriculum Repository" feature is proposed but out of scope for Phase 2. See `docs/admin_settings_widget_configs.md` for details.

2.  ✅ **JSON Schema-Driven Admin UI:**
    - **Implemented:** `SchemaDrivenConfigurationPanel.tsx` — a generic component that parses a `ConfigSchema` and renders appropriate controls (number input, text input, checkbox, textarea for string arrays). New widget admin panels (e.g., Magic, Record) use this component instead of bespoke form code, eliminating boilerplate for future widgets.

---

## Phase 3: No-Code / Low-Code Widget Creation

Currently, adding a new widget requires writing a React component and updating multiple files: `types.ts`, `config/tools.ts`, `components/widgets/WidgetRegistry.ts`, `config/widgetDefaults.ts`, and `config/widgetGradeLevels.ts`.

### Opportunities

1.  🔲 **Enhance Mini Apps (Low-Code):**
    - **Current State:** `MiniAppLibraryModal` allows admins to publish raw HTML/JS apps with building and grade-level targeting. Apps run in sandboxed iframes communicating via `postMessage`.
    - **Remaining:** Integrate an in-browser code editor (Monaco Editor) directly in the Admin Dashboard for writing HTML/CSS/JS with syntax highlighting and autocomplete. Formalize the `window.postMessage` SPART bridge API with a versioned schema and documented methods (e.g. `getRoster`, `playSound`).

2.  🔲 **Visual Widget Builder (No-Code):**
    - **Goal:** Allow non-technical admins to create simple widgets by combining predefined blocks (Text, Image, Button, Iframe) on a drag-and-drop canvas.
    - **Implementation:** Create a `custom-widget` type. The admin UI outputs a JSON UI definition. A generic `CustomWidgetRenderer` component renders this JSON at runtime without any code changes.

3.  🔲 **Data Binding & API Integrations:**
    - **Goal:** Allow admins to create widgets that fetch and display data from third-party APIs (e.g., a custom cafeteria menu API or bus tracker).
    - **Implementation:** Within the Visual Widget Builder, allow defining a logical "data source" backed by a REST endpoint — but never call arbitrary third-party URLs directly from the client. All external requests must flow through a server-side proxy (Firebase Cloud Function) that enforces per-domain allowlists, validation, rate limiting, and secret management. The proxy response fields are then mapped to widget blocks.

4.  🔲 **Action Buttons (Webhooks):**
    - **Goal:** Allow admins to create button blocks that trigger external actions (e.g., "Send Help Request to IT").
    - **Implementation:** Button blocks call a trusted server-side "webhook executor" endpoint with a logical action ID. The backend enforces an allowlist of destinations, attaches stored secrets/headers, performs per-user permission checks, executes the outbound webhook, and records audit logs. No outbound URLs or secrets are ever exposed to the client.

---

## Phase 4: Layout & Dashboard Templates

Empower admins to control the initial user experience for teachers.

### Opportunities

1.  ✅ **Dashboard Templates:**
    - **Implemented:** Full `DashboardTemplatesManager` admin component (Admin Settings → Templates tab). Admins can:
      - Create templates by capturing the current board's widgets, globalStyle, and background
      - Set name, description, comma-separated tags, target grade levels, and target buildings
      - Publish/unpublish to the user-facing Starter Pack
      - Apply a template to the current board (adds all template widgets)
      - Delete templates with confirmation
    - Templates are stored in `/dashboard_templates/{id}` in Firestore. Security rules: authenticated users read, admins write.
    - `DashboardTemplate` type defined in `types.ts` with full metadata.
    - **Remaining:** Automatic template assignment on first login based on a user's building/grade profile. Currently templates must be applied manually by the user from the Starter Pack.

2.  ✅ **Mandatory/Locked Widgets:**
    - **Implemented:** `isLocked?: boolean` added to the `WidgetData` interface. When `true`:
      - Drag is blocked (pointer events on the title bar are a no-op)
      - All four corner resize handles are hidden
      - Keyboard `Delete` shortcut is suppressed (both `onKeyDown` handler and the `widget-keyboard-action` custom event)
      - The close (X) button is replaced with an amber lock badge with a tooltip
    - Admins set `isLocked: true` on a widget programmatically (e.g., via Firestore Console, a template, or future admin tooling).
    - **Remaining:** A dedicated admin UI surface to lock/unlock individual widgets on a teacher's live board without requiring direct Firestore edits.

---

## Summary

| Phase | Item                                            | Status                                         |
| ----- | ----------------------------------------------- | ---------------------------------------------- |
| 1.1   | Dynamic Color Palettes (CSS variables)          | ✅ Done                                        |
| 1.2   | Custom Typography (Google Fonts)                | 🔲 Remaining                                   |
| 1.3   | UI Elements Styling (borders, transparency)     | ✅ Done                                        |
| 1.4   | Custom Backgrounds & Logos                      | ✅ Done                                        |
| 2.1   | Widget Admin Configs (24 of 34 widget types)    | ✅ Partial — 10 types + 13 newer types pending |
| 2.2   | JSON Schema-Driven Admin UI                     | 🔲 Remaining                                   |
| 3.1   | Enhanced Mini Apps (Monaco Editor)              | 🔲 Remaining (building targeting ✅ done)      |
| 3.2   | Visual Widget Builder                           | 🔲 Remaining                                   |
| 3.3   | Data Binding & API Integrations                 | 🔲 Remaining                                   |
| 3.4   | Action Buttons (Webhooks)                       | 🔲 Remaining                                   |
| 4.1   | Dashboard Templates (create/apply/publish)      | ✅ Done                                        |
| 4.1   | Auto-assign template on first login             | 🔲 Remaining                                   |
| 4.2   | Mandatory/Locked Widgets (enforcement)          | ✅ Done                                        |
| 4.2   | Admin UI to lock/unlock live widgets            | 🔲 Remaining                                   |
| 5.1   | Global Feature Permissions                      | ✅ Done                                        |
| 5.2   | Widget-Level Feature Permissions                | ✅ Done                                        |
| 5.3   | Custom Announcements Widget                     | ✅ Done                                        |
| 5.4   | Student / Read-Only View (code layer)           | ✅ Done                                        |
| 5.4   | Student-facing shareable published URL          | 🔲 Remaining                                   |
| 5.5   | User Management UI                              | ✅ Done                                        |
| 5.5   | Bulk user provisioning / directory sync         | 🔲 Remaining                                   |
| 5.6   | Analytics (basic)                               | ✅ Done                                        |
| 5.6   | District-level analytics dashboards + export    | 🔲 Remaining                                   |
| 5.7   | Onboarding / Setup Wizard (completion tracking) | ✅ Done                                        |
| 5.7   | Building-profile-driven onboarding flow         | 🔲 Remaining                                   |

By completing the remaining widget admin config panels, integrating Monaco Editor for the Mini App library, implementing template auto-assignment on first login, and adding the student-facing publish URL, SpartBoard will reach a state where a district admin can fully configure, brand, and deploy the platform for their teachers and students without any developer intervention. The JSON Schema-driven admin UI (Phase 2.2) and Visual Widget Builder (Phase 3.2) represent the next frontier — turning widget creation itself into an admin-level operation.

---

**Last Updated**: 2026-03-26
**Version**: 1.2.0
