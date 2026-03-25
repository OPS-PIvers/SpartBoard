# SPART Board No-Code/Low-Code Admin Roadmap

This document outlines opportunities to shift customization, design, and widget creation from code-level changes (React/Tailwind) into dynamic, admin-configurable settings within the SPART Board application. This shift lowers the barrier to scaling the app across different domains, empowering admins to match their branding and utility needs without coding.

## Phase 1: Global Branding & Theming (Design Customization)

Currently, the application relies heavily on hardcoded Tailwind utility classes and predefined `tailwind.config.js` settings for colors, fonts, and global styles.

### Opportunities

1.  **Dynamic Color Palettes:**
    - **Current State:** Colors are predefined in `tailwind.config.js` (`brand-blue-primary`, `emerald-400`, etc.) and safelisted.
    - **Goal:** Allow admins to define custom color palettes (Primary, Secondary, Accent, Backgrounds) via a color picker in the admin UI.
    - **Implementation:** Store color hex values in a global Firestore config (`GlobalStyle`). Inject these as CSS variables (`--color-primary`) dynamically at runtime. Update Tailwind config to map its utility classes to these CSS variables.

2.  **Custom Typography (Fonts):**
    - **Current State:** Fonts are mapped statically in `tailwind.config.js` (e.g., `font-sans` mapped to 'Lexend').
    - **Goal:** Allow admins to select custom fonts from Google Fonts or upload custom fonts.
    - **Implementation:** Store the selected font family string in Firestore. Dynamically inject a `<link>` tag to load the Google Font. Use inline styles or dynamically generated classes for the root element.

3.  **UI Elements Styling (Borders, Transparencies):**
    - **Current State:** `types.ts` defines `windowBorderRadius` and `windowTransparency` within `DEFAULT_GLOBAL_STYLE`.
    - **Goal:** Create a robust Admin UI panel to control these global variables visually.
    - **Implementation:** Connect sliders and selectors in the Admin Dashboard to update the `GlobalStyle` object in Firestore, which automatically re-renders the dashboard layout.

4.  **Custom Backgrounds & Logos:**
    - **Current State:** Background presets exist (`BackgroundPreset` in `types.ts`).
    - **Goal:** Allow domain admins to upload their district/school logos to replace the default SPART Board logo. Allow uploading custom branded background sets that are default-assigned to specific buildings.
    - **Implementation:** Add logo upload fields to a new "Branding" admin panel. Store images in Firebase Storage and URLs in global settings.

## Phase 2: Comprehensive Widget Configuration

Many widgets currently lack global admin settings, relying instead on user-level configuration or hardcoded behaviors.

### Opportunities

1.  **Implement Pending Widget Admin Configs:**
    - Complete the "Proposed" list in `docs/admin_settings_widget_configs.md`:
      - **Classes:** SIS Sync rate limits, display name formats.
      - **Embed:** Domain allowlists, default URLs per building.
      - **Magic:** Daily AI rate limits, default prompt suggestions.
      - **PDF Viewer:** Max file size limits, default PDF.
      - **Poll:** Pushing district-wide polls.
      - **QR Code:** Automatic UTM tracking parameters.
      - **Quiz:** Centralized district curriculum repository.
      - **Record:** Max duration/resolution caps.
      - **Seating Chart:** Fire code limits (max nodes), default templates.
      - **Smart Notebook:** Storage limits (pages/paths).
      - **Breathing:** Default patterns.

2.  **JSON Schema-Driven Admin UI:**
    - **Current State:** Each widget requires a bespoke React component for its admin configuration panel (e.g., `ClockConfigurationPanel.tsx`).
    - **Goal:** Automatically generate the admin configuration forms based on a JSON schema defined for each widget.
    - **Implementation:** When a new widget is registered, its config shape (defined in `types.ts`) can be mapped to a UI schema. A generic `ConfigurationPanel` component can parse this schema to render toggles, text inputs, and color pickers without writing new React code.

## Phase 3: No-Code / Low-Code Widget Creation

Currently, adding a new widget requires writing a React component, updating `types.ts`, and modifying `WidgetRegistry.ts`.

### Opportunities

1.  **Enhance Mini Apps (Low-Code):**
    - **Current State:** The `MiniAppLibraryModal` allows admins to publish HTML/JS apps.
    - **Goal:** Provide an integrated code editor (like Monaco Editor) directly in the Admin Dashboard for writing HTML/CSS/JS.
    - **Implementation:** Expand the `MiniAppItem` schema. Expose a JavaScript API injected into the Mini App iframe to allow secure communication with the SPART Board state (e.g., `window.SPART.getRoster()`, `window.SPART.playSound()`).

2.  **Visual Widget Builder (No-Code):**
    - **Goal:** Allow non-technical admins to create simple widgets by combining predefined blocks (Text, Image, Button, Iframe).
    - **Implementation:** Create a "Custom Widget" type. The admin UI provides a drag-and-drop canvas to arrange blocks. The output is a JSON definition of the UI. The dashboard renders this JSON using a generic `<CustomWidgetRenderer>` component.

3.  **Data Binding & API Integrations:**
    - **Goal:** Allow admins to create widgets that fetch and display data from third-party APIs (e.g., a custom cafeteria menu API or bus tracker).
    - **Implementation:** Within the Visual Widget Builder, allow defining a REST endpoint. Map the JSON response fields to text blocks or lists within the custom widget.

4.  **Action Buttons (Webhooks):**
    - **Goal:** Allow admins to create buttons that trigger external actions (e.g., "Send Help Request to IT").
    - **Implementation:** Allow configuring a button block to send a POST request (webhook) with context (user ID, room number) when clicked.

## Phase 4: Layout & Dashboard Templates

Empower admins to control the initial user experience for teachers.

### Opportunities

1.  **Role-Based / Grade-Level Default Dashboards:**
    - **Current State:** Users start with a blank or generic default dashboard.
    - **Goal:** Admins can design "Template Dashboards" tailored for specific groups (e.g., K-2 teachers get a dashboard pre-loaded with specific widgets like Traffic Light and Sound; High School gets Timer and Expectations).
    - **Implementation:** Add a "Dashboard Templates" manager in the admin area. When a new user logs in, assign them a template based on their building or grade-level assignment.

2.  **Mandatory/Locked Widgets:**
    - **Goal:** Allow admins to place widgets on a teacher's dashboard that cannot be removed or closed (e.g., District Announcements, Emergency Alerts).
    - **Implementation:** Add an `isLocked` or `isMandatory` boolean to the `WidgetData` interface. The dashboard UI will disable the close/delete controls for these specific instances.

## Summary

By migrating hardcoded styles to dynamic CSS variables, utilizing JSON schemas for admin forms, expanding the Mini App system into a fully-fledged API playground, and introducing visual widget building, SPART Board can evolve into a highly scalable, white-label platform suitable for diverse educational environments without requiring developer intervention for every customization.
