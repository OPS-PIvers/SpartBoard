# Widget development

Loaded when working under `components/widgets/`. New widgets: use the `new-widget` skill (full
registration checklist). Admin-level widget config modals: use the `admin-widget-config` skill.

## Content scaling with container queries

Widgets use a two-mode scaling system configured in `components/widgets/WidgetRegistry.ts`:

- **`skipScaling: true`** (most widgets): Uses **CSS Container Queries**. The widget content area is a CSS container (`container-type: size`), and all sizing must use container query units.
- **`skipScaling: false`** (drawing, seating-chart): Uses CSS `transform: scale()` for pixel-accurate coordinate preservation.

**For `skipScaling: true` widgets, follow these rules:**

1. **ALWAYS use `cqmin` for text sizing** (not `cqw` or `cqh` separately):

   ```tsx
   // WRONG - mixes units, inconsistent scaling
   style={{ fontSize: 'min(14px, 3.5cqw, 5cqh)' }}
   style={{ fontSize: 'min(20cqw, 15cqh)' }}

   // CORRECT - uses cqmin for consistent scaling
   style={{ fontSize: 'min(14px, 5cqmin)' }}
   style={{ fontSize: 'min(24px, 25cqmin)' }}
   ```

2. **Size elements by visual hierarchy** with appropriate `cqmin` values:

   | Element Type                        | Recommended `cqmin` | Min px  | Example                 |
   | ----------------------------------- | ------------------- | ------- | ----------------------- |
   | Primary content (hero text/numbers) | 20-30cqmin          | 20-32px | Temperature, Clock time |
   | Secondary content (subheadings)     | 5-8cqmin            | 14-18px | Widget section labels   |
   | Tertiary content (metadata)         | 3.5-5cqmin          | 10-12px | Footer text, timestamps |
   | Primary icons                       | 20-30cqmin          | 48-80px | Weather icons           |
   | Decorative icons                    | 8-15cqmin           | 16-48px | Section markers         |
   | Small icons                         | 4-6cqmin            | 14-24px | Buttons, indicators     |

3. **NEVER use hardcoded Tailwind text/size classes** in widget front-face content:

   ```tsx
   // BAD - won't scale, leaves empty space
   <span className="text-sm">Label</span>
   <Icon className="w-12 h-12" />
   <Icon size={24} />
   <div className="gap-4 p-4">

   // GOOD - scales aggressively to fill container
   <span style={{ fontSize: 'min(14px, 5.5cqmin)' }}>Label</span>
   <Icon style={{ width: 'min(48px, 12cqmin)', height: 'min(48px, 12cqmin)' }} />
   <div style={{ gap: 'min(16px, 3.5cqmin)', padding: 'min(16px, 3.5cqmin)' }}>
   ```

4. **Minimize header/footer overhead** to maximize content area:

   ```tsx
   // Header - keep compact with smaller padding
   <div style={{ padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)' }}>
     <span style={{ fontSize: 'min(11px, 4cqmin)' }}>HEADER</span>
   </div>

   // Content - should dominate the widget
   <div className="flex-1" style={{ padding: 'min(12px, 2.5cqmin)' }}>
     <div style={{ fontSize: 'min(24px, 25cqmin)' }}>MAIN CONTENT</div>
   </div>

   // Footer - keep minimal
   <div style={{ padding: 'min(8px, 1.5cqmin)' }}>
     <span style={{ fontSize: 'min(10px, 3.5cqmin)' }}>Footer</span>
   </div>
   ```

5. **Settings panels (back-face) don't need scaling** - use normal Tailwind classes there.

6. **Container query unit reference:**
   - `cqmin` = 1% of the smaller dimension (width or height) - **USE THIS for almost everything**
   - `cqw` = 1% of container width - only use when you specifically need width-based scaling
   - `cqh` = 1% of container height - only use when you specifically need height-based scaling
   - `min(Xpx, Ycqmin)` **caps maximum size at Xpx** (text never exceeds X pixels - prevents blur on huge screens)
   - For unlimited scaling, use `Ycqmin` alone or `clamp(Xpx, Ycqmin, Zpx)` for min/max bounds

7. **Common scaling formulas:**

   ```tsx
   // Tiny labels (footer metadata) - cap at 10px
   style={{ fontSize: 'min(10px, 3.5cqmin)' }}

   // Small labels (section titles) - cap at 12px
   style={{ fontSize: 'min(12px, 4.5cqmin)' }}

   // Medium text (list items, body) - cap at 14px
   style={{ fontSize: 'min(14px, 5.5cqmin)' }}

   // Large text (subheadings) - cap at 16px
   style={{ fontSize: 'min(16px, 7cqmin)' }}

   // Hero text (primary numbers/headings) - can scale larger
   style={{ fontSize: 'clamp(24px, 25cqmin, 120px)' }}
   // OR for unlimited scaling: style={{ fontSize: '25cqmin' }}
   ```

   Use aggressive values: `min(24px, 25cqmin)` for hero text, NOT `min(14px, 3.5cqmin)`.

8. **For empty/error states**, use the shared `ScaledEmptyState` component (`components/common/ScaledEmptyState.tsx`) instead of hand-rolling empty/error UI.

9. **For Catalyst icon rendering**, `renderCatalystIcon()` accepts CSS string sizes:

   ```tsx
   renderCatalystIcon(iconName, 'min(32px, 8cqmin)'); // Scaled
   renderCatalystIcon(iconName, 32); // Fixed (for settings panels only)
   ```

**Reference implementations:** `WeatherWidget.tsx`, `RecessGearWidget.tsx`, `LunchCount/Widget.tsx`

## Audio

Widgets using sound share one lazily-created `AudioContext` singleton from `utils/timeToolAudio.ts`
(`getAudioCtx()`, `resumeAudio()`; quiz variant in `utils/quizAudio.ts`). Never instantiate your own
`AudioContext`. `resumeAudio()` must be called from a user gesture — browsers start the context suspended.

## Persistence

- Update widget state via `updateWidget(id, { config: {...} })`; it debounces and syncs to Firestore. `saveCurrentDashboard()` is only for rare manual saves.
- Widget z-index starts at 1; never set it manually — use `bringToFront(id)`. Dimensions are px, not percentages.
- The `flipped` state is managed by `DraggableWindow`, not individual widgets.
- A live-tour anchor (`tourAttr`) that only shows after setup declares it with `requires` in `config/tourAnchors.ts` (`widget-selected`, `widget-restored`, `in-view`, `dock-expanded`).

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
