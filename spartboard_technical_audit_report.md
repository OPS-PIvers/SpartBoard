SPART Board -- Technical Audit Report
Audit Health Score

# Dimension Score Key Finding

1 Accessibility 2 No prefers-reduced-motion support; 87+ low-contrast text instances
2 Performance 3 3 wildcard lucide-react imports defeat tree-shaking (~500 icons bundled)
3 Theming 2 No dark-mode variants on 668 bg-white instances; hard-coded hex in math tools
4 Responsive Design 2 Touch targets as small as 12px; almost zero responsive breakpoints in layout
5 Anti-Patterns 3 86 backdrop-blur instances, but glassmorphism is intentional design language
Total 12/20 Acceptable (significant work needed)
Anti-Patterns Verdict
Pass -- with caveats. This does NOT look AI-generated. The glassmorphism is a deliberate, coherent design language (not decorative slop), the GlassCard component is well-engineered with configurable transparency, and the overall aesthetic is consistent and intentional.

Minor tells found:

2 instances of animate-bounce (RandomWheel, QuizLiveMonitor) -- feels generic
4+ purple-to-blue/pink gradients in modals (MagicLayoutModal from-indigo-500 to-purple-600, InstructionalRoutines from-purple-500 to-pink-500) -- cliched AI palette for accent surfaces
Some card-in-card nesting in MagicLayoutModal (Modal > GlassCard > nested bordered divs)
These are minor. The app has a genuine design point-of-view.

Executive Summary
Audit Health Score: 12/20 (Acceptable)
Issues by severity: P0: 2 | P1: 8 | P2: 7 | P3: 3
Top 5 critical issues:
Zero prefers-reduced-motion support across the entire codebase
87+ low-contrast text instances (text-white/50 through text-white/70)
Touch targets as small as 12px on dock close buttons (WCAG minimum: 44px)
3 wildcard import \* as Icons from 'lucide-react' defeating tree-shaking
No dark-mode variants -- 668 bg-white instances would break under theme switching
Detailed Findings by Severity
P0 -- Blocking
[P0] No prefers-reduced-motion support [Fixed on April 12, 2026]

Location: Entire codebase (0 instances of the media query)
Category: Accessibility
Impact: Users with vestibular disorders or motion sensitivity cannot disable animations. Confetti, pulse, spin, slide-in, bounce all play regardless. Projected classroom screens can trigger motion sensitivity in students.
WCAG: 2.3.3 Animation from Interactions (AAA), but practically expected for AA compliance
Recommendation: Add a global CSS rule @media (prefers-reduced-motion: reduce) that disables non-essential animations. Wrap confetti/canvas-confetti calls in a motion check.
Suggested command: /harden
[P0] Missing aria-label on icon-only buttons [Fixed on April 12, 2026]

Location: CatalystWidget.tsx:87, DraggableWindow.tsx:1304 (color picker buttons)
Category: Accessibility
Impact: Screen readers announce these as empty buttons. Color picker buttons have no text alternative at all.
WCAG: 4.1.2 Name, Role, Value (A)
Recommendation: Add aria-label to all icon-only <button> elements that don't use IconButton.
Suggested command: /harden
P1 -- Major
[P1] Low-contrast text throughout (87+ instances)

Location: Widespread -- text-white/50, text-white/60, text-white/70 in DashboardView.tsx:1142, DraggableWindow.tsx:1142, MobileRemoteView.tsx, Webcam/Widget.tsx, MusicWidget, QuizManager, and 10+ more files
Category: Accessibility
Impact: text-white/60 on semi-transparent backgrounds fails 4.5:1 contrast. On projectors (washed-out, low-contrast), this becomes effectively invisible.
WCAG: 1.4.3 Contrast Minimum (AA)
Recommendation: Audit all text-white/[3-7]0 instances. Replace with text-white/90 minimum, or use solid text on semi-transparent pill backgrounds.
Suggested command: /harden
[P1] Toast container not announced to screen readers

Location: DashboardView.tsx:47-113
Category: Accessibility
Impact: Toast notifications are visual-only. Screen reader users miss success/error/warning feedback entirely.
WCAG: 4.1.3 Status Messages (AA)
Recommendation: Add role="status" and aria-live="polite" to the toast container.
Suggested command: /harden
[P1] Touch targets below 44px minimum (dock buttons)

Location: ToolDockItem.tsx:231 (~12px), FolderItem.tsx (~12px), DraggableWindow.tsx:1878 (~15px), WidgetLibrary.tsx (~8px badges)
Category: Responsive / Accessibility
Impact: Dock close/remove buttons are nearly impossible to tap on tablets. Widget header toolbar buttons require pixel-precise tapping.
WCAG: 2.5.8 Target Size Minimum (AA, 24px) / 2.5.5 Target Size Enhanced (AAA, 44px)
Recommendation: Increase all interactive touch targets to minimum 44px (using padding, not just icon size). Use invisible hit-area expansion where visual size must stay small.
Suggested command: /adapt
[P1] Wildcard lucide-react imports (3 files)

Location: CatalystVisualWidget.tsx:3, StickerItemWidget.tsx:4, catalystHelpers.tsx:2
Category: Performance
Impact: import \* as Icons from 'lucide-react' imports all 500+ icons into the bundle, defeating tree-shaking. This is amplified by the barrel export in Catalyst/index.ts which re-exports everything.
Recommendation: Replace with dynamic icon lookup or import only used icons. For the Catalyst icon renderer, use a map of specific icons needed.
Suggested command: /optimize
[P1] Missing image lazy loading (8+ widgets)

Location: Catalyst, InstructionalRoutines, HotspotImage, Weather widgets, and sidebar backgrounds
Category: Performance
Impact: All images load eagerly on dashboard mount, even if widgets are off-screen or minimized.
Recommendation: Add loading="lazy" to all <img> elements except above-the-fold content.
Suggested command: /optimize
[P1] Missing keyboard support on role="button" divs

Location: ActivityWall/Widget.tsx:1577, UrlWidget/Widget.tsx:59, multiple math tools
Category: Accessibility
Impact: Elements announced as buttons but not operable via keyboard (no tabindex="0", no onKeyDown).
WCAG: 2.1.1 Keyboard (A)
Recommendation: Replace <div role="button"> with actual <button> elements, or add tabindex="0" + onKeyDown handler.
Suggested command: /harden
[P1] Almost zero responsive breakpoints in layout

Location: DashboardView.tsx, Dock.tsx, Sidebar.tsx -- only 11 breakpoint instances across all layout files
Category: Responsive
Impact: Tablet layouts are identical to desktop. Sidebar consumes 67-100% of screen on portrait tablets.
Recommendation: Add sm: and md: variants for padding, gap, and max-width on layout shells. Dock needs a tablet-optimized mode.
Suggested command: /adapt
P2 -- Minor
[P2] Hard-coded hex colors in math tools (30+ instances)

Location: PlaceValueTool.tsx:19-76, CoordinatePlaneTool.tsx:25-31
Category: Theming
Impact: SVG colors like #60a5fa, #34d399, #fbbf24 bypass the design token system. Can't be themed or adjusted consistently.
Recommendation: Extract to a MATH_TOOL_PALETTE in config/colors.ts and reference from there.
Suggested command: /normalize
[P2] Missing <main> landmark in DashboardView

Location: DashboardView.tsx
Category: Accessibility
Impact: Screen readers can't navigate to the main content region. No <main>, <aside>, or other landmark elements in the primary layout.
WCAG: 1.3.1 Info and Relationships (A)
Suggested command: /harden
[P2] Form labels missing htmlFor attribute

Location: Countdown/Settings.tsx:74, and multiple other settings panels
Category: Accessibility
Impact: Implicit label association works visually but is less reliable for screen readers.
Suggested command: /harden
[P2] Toggle component missing aria-label

Location: Toggle.tsx:63
Category: Accessibility
Impact: Toggle has role="switch" and aria-checked but no label describing what it controls.
Suggested command: /harden
[P2] No aria-invalid on form validation errors

Location: Settings panels across widgets
Category: Accessibility
Impact: Validation errors are visual-only; screen readers don't announce invalid state.
Suggested command: /harden
[P2] transition-all on layout properties

Location: DashboardView.tsx:1123
Category: Performance
Impact: transition-all duration-500 on the backdrop overlay animates all properties including layout ones, causing unnecessary repaints.
Recommendation: Use transition-opacity instead.
Suggested command: /optimize
[P2] No dark-mode variants (668 bg-white instances)

Location: Entire codebase -- math tools, settings panels, modals, calendar widget
Category: Theming
Impact: The app is currently locked to light-themed widget chrome on dark dashboard backgrounds. Not a bug today, but blocks future theme flexibility. All math tools would show white-on-white text if dark mode were added.
Suggested command: /normalize
P3 -- Polish
[P3] animate-bounce usage

Location: RandomWheel.tsx:143, QuizLiveMonitor.tsx
Category: Anti-Pattern
Impact: Bounce easing feels dated. Replace with a subtle scale + ease-out-quart for a more premium feel.
Suggested command: /animate
[P3] Purple-to-blue/pink gradients on accent surfaces

Location: MagicLayoutModal.tsx (from-indigo-500 to-purple-600), LibraryManager.tsx (from-purple-500 to-pink-500)
Category: Anti-Pattern
Impact: These gradients feel like stock AI aesthetic rather than the SpartBoard brand. Replace with brand-blue gradients or solid brand colors.
Suggested command: /colorize
[P3] Deep DOM nesting in Countdown widget

Location: Countdown/Widget.tsx:136-189
Category: Performance
Impact: 5+ levels of nested divs with inline styles. Functional but could be flattened.
Suggested command: /distill
Patterns & Systemic Issues
Low-contrast text is systemic -- text-white/60 and text-white/70 appear in 15+ files as a go-to "secondary text" pattern. Needs a project-wide find-and-replace, not per-file fixes.

Icon-only buttons outside IconButton lack ARIA -- The IconButton component correctly enforces aria-label, but raw <button> elements with lucide icons throughout the codebase don't get the same treatment. Rule: always use IconButton for icon-only actions.

Touch targets are consistently undersized -- The sm size variant in IconButton (28px) and raw close buttons (12-15px) are below WCAG minimums. The sm variant needs a minimum 44px hit area.

Math tools bypass the design system entirely -- Hard-coded SVG colors, bg-white containers, no token usage. These are self-contained but inconsistent with the rest of the app.

Positive Findings
Widget lazy loading is excellent -- All 57 widgets use lazyNamed() with proper code splitting
Route-level splitting is thorough -- All student routes, admin routes, and main dashboard are lazy-loaded
Context memoization is well done -- DashboardContext properly wraps its value in useMemo
Custom memo comparator on WidgetRenderer -- Sophisticated comparison function prevents unnecessary re-renders for position changes
Vite manual chunks are well-configured -- Firebase, DnD Kit, and heavy deps are properly isolated
Container query scaling is a standout -- cqmin usage across widgets is genuinely best-practice responsive design
GlassCard is well-engineered -- Configurable transparency, blur intensity scales with opacity, proper ref forwarding
Gesture handling is solid -- Multi-touch pinch-to-zoom, edge swipes, proper finger count tracking
Focus-visible styles are consistent -- IconButton and Toggle both use focus-visible:ring-2 with brand colors
Recharts uses named imports -- No bundle bloat from the charting library

Recommended Actions
Priority Command What to fix
P0 /harden Add prefers-reduced-motion, fix missing ARIA labels, add aria-live to toasts, fix keyboard support on role="button" divs
P1 /harden Fix 87+ low-contrast text instances (text-white/[3-7]0 -> text-white/90+)
P1 /optimize Replace 3 wildcard lucide imports, add loading="lazy" to images, fix transition-all
P1 /adapt Fix touch targets below 44px, add responsive breakpoints to layout shells
P2 /normalize Extract math tool colors to design tokens, audit bg-white for future dark-mode readiness
P3 /animate Replace animate-bounce with premium easing
P3 /colorize Replace purple-to-blue gradients with brand-aligned colors
P3 /polish Final pass after all fixes applied
You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run /audit after fixes to see your score improve.
